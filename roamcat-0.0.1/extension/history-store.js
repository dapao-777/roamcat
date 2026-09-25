/**
 * @file extension/history-store.js
 * 文件职责：阅读记录存储——IndexedDB事件/归档/去重与90天保留。
 * 主要内容：events/contributions/receipts/archive/control四表；超期按日聚合归档。
 * 模块边界：应用层；段落只计次不存正文；词句加盐指纹去重。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
const RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;
const MAX_EVENTS = 300;
const INITIAL_META = Object.freeze({
  revision:0,
  profile:null,
  versions:[],
  overrides:[],
  lastAnalysisAt:0,
  lastAttemptAt:0,
  analysisError:'',
  pending:null,
});

const TYPES = new Set(['query','annotation','reading','summary']);
const KINDS = new Set(['word','phrase','sentence','passage']);
const SOURCES = new Set(['personal','system']);
const STAGES = new Set(['hint','mark','quiet']);
const STATUSES = new Set(['ready','error']);
const FORBIDDEN_KEYS = new Set(['url','href','fulltext','articletext','documenttext','body','content']);

const clone = value => typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));
const requestResult = request => new Promise((resolve,reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const transactionDone = transaction => new Promise((resolve,reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
});
const bounded = (value,max) => typeof value === 'string' && value.length <= max ? value : null;
const optional = (value,max) => value == null ? '' : bounded(value,max);
const normalized = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
const utcDay = at => new Date(at).toISOString().slice(0,10);
const dayStart = at => {
  const date = new Date(at);
  return Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
};
const freshMeta = () => clone(INITIAL_META);

function randomSalt() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) throw new Error('Secure randomness is unavailable');
  const bytes = cryptoApi.getRandomValues(new Uint8Array(32));
  return Array.from(bytes,byte => byte.toString(16).padStart(2,'0')).join('');
}

function isSingleSentence(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (typeof Intl?.Segmenter === 'function') {
    const segments = new Intl.Segmenter('en',{granularity:'sentence'}).segment(text);
    let count = 0;
    for (const segment of segments) if (segment.segment.trim() && ++count > 1) return false;
    return count === 1;
  }
  return !/[.!?]+\s+(?=\S)/u.test(text);
}

async function digest(salt,value) {
  if (!value) return '';
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) throw new Error('SHA-256 is unavailable');
  const bytes = new TextEncoder().encode(`${salt}\u0000${value}`);
  const result = await cryptoApi.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(result),byte => byte.toString(16).padStart(2,'0')).join('');
}

function sanitize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (Object.keys(input).some(key => FORBIDDEN_KEYS.has(key.toLowerCase()))) return null;
  const id = bounded(input.id,128);
  const type = TYPES.has(input.type) ? input.type : null;
  const at = Number(input.at);
  const sessionId = optional(input.sessionId,128);
  const domain = optional(input.domain,100);
  if (!id || !type || !Number.isSafeInteger(at) || at <= 0 || at > 8_640_000_000_000_000 || sessionId == null || domain == null) return null;

  const event = {id,type,at:Math.floor(at),sessionId,domain};
  if (type === 'reading') {
    if(!Number.isSafeInteger(input.sequence)||input.sequence<1)return null;
    event.sequence=input.sequence;
    const elapsedMs = Number(input.elapsedMs || 0);
    const wordCount = Number(input.wordCount || 0);
    if (!Number.isSafeInteger(elapsedMs) || !Number.isSafeInteger(wordCount) || elapsedMs < 0 || elapsedMs > 3_600_000 || wordCount < 0 || wordCount > 100_000 || (!elapsedMs && !wordCount)) return null;
    event.elapsedMs = elapsedMs;
    event.wordCount = wordCount;
    return event;
  }

  if (type === 'summary') {
    const status = STATUSES.has(input.status) ? input.status : null;
    const summary = optional(input.summary,1000);
    if (!status || summary == null || (status === 'ready' && !summary.trim())) return null;
    event.summary = summary.trim();
    event.status = status;
    event.modelGenerated = input.modelGenerated === true;
    return event;
  }

  const term = optional(input.term,200);
  const kind = KINDS.has(input.kind) ? input.kind : null;
  const source = SOURCES.has(input.source) ? input.source : null;
  const stage = STAGES.has(input.stage) ? input.stage : null;
  const senseKey = optional(input.senseKey,200);
  if (term == null || !kind || !source || !stage || senseKey == null) return null;
  if ((kind === 'word' || kind === 'phrase') && !term.trim()) return null;
  Object.assign(event,{term:term.trim(),kind,senseKey: senseKey.trim(),source,stage});

  if (type === 'annotation') return event;
  if (input.status !== 'ready') return null;
  const sentence = optional(input.sentence,1000);
  const translation = optional(input.translation,2000);
  const explanation = optional(input.explanation,2000);
  if (sentence == null || translation == null || explanation == null) return null;
  event.status = 'ready';
  event.modelGenerated = input.modelGenerated === true;
  // Paragraph text and its translation are deliberately not retained. A passage is only a counted action.
  if (kind !== 'passage') {
    event.sentence = sentence.trim();
    event.translation = translation.trim();
    event.explanation = explanation.trim();
  }
  return event;
}

function openDatabase(factory,name) {
  return new Promise((resolve,reject) => {
    const request = factory.open(name,2);
    request.onupgradeneeded = event => {
      const db = request.result;
      if (event.oldVersion < 1) {
        const events = db.createObjectStore('events',{keyPath:'id'});
        events.createIndex('at','at');
        events.createIndex('type','type');
        events.createIndex('domain','domain');
        const contributions = db.createObjectStore('contributions',{keyPath:'id'});
        contributions.createIndex('at','at');
        contributions.createIndex('day','day');
        db.createObjectStore('control',{keyPath:'key'});
      }
      if (event.oldVersion < 2) {
        const transaction = request.transaction;
        const events = transaction.objectStore('events');
        events.createIndex('atId',['at','id']);
        events.createIndex('typeAtId',['type','at','id']);
        events.createIndex('domainAtId',['domain','at','id']);
        events.createIndex('domainTypeAtId',['domain','type','at','id']);
        const receipts = db.createObjectStore('receipts',{keyPath:'id'});
        db.createObjectStore('archive',{keyPath:'day'});
        transaction.objectStore('contributions').openCursor().onsuccess = cursorEvent => {
          const cursor = cursorEvent.target.result;
          if (!cursor) return;
          const item = cursor.value;
          receipts.put({id:item.id,at:item.at,day:item.day,sequence:item.sequence || 0,archived:false});
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('History database upgrade is blocked'));
  });
}


function orderedIndex(store,{domain,type} = {}) {
  if (domain && type) return {index:store.index('domainTypeAtId'),prefix:[domain,type]};
  if (domain) return {index:store.index('domainAtId'),prefix:[domain]};
  if (type) return {index:store.index('typeAtId'),prefix:[type]};
  return {index:store.index('atId'),prefix:[]};
}

function orderedRange(prefix,cutoff,cursor=null) {
  const KeyRange = globalThis.IDBKeyRange;
  if (!KeyRange) return null;
  const lower = [...prefix,cutoff,''];
  const upper = cursor ? [...prefix,cursor.at,cursor.id] : [...prefix,8_640_000_000_000_000,[]];
  return KeyRange.bound(lower,upper,false,Boolean(cursor));
}

export function createHistoryStore({name='roamcat-reading-history',indexedDB:injectedIndexedDB,now=Date.now} = {}) {
  let databasePromise = null;
  const database = () => {
    if (!databasePromise) {
      const factory = injectedIndexedDB || globalThis.indexedDB;
      if (!factory) throw new Error('IndexedDB is unavailable');
      databasePromise = openDatabase(factory,name).catch(error => {
        databasePromise = null;
        throw error;
      });
    }
    return databasePromise;
  };

  async function salt() {
    const db = await database();
    const transaction = db.transaction('control','readwrite');
    const store = transaction.objectStore('control');
    let record = await requestResult(store.get('salt'));
    if (!record) {
      record = {key:'salt',value:randomSalt()};
      store.put(record);
    }
    await transactionDone(transaction);
    return record.value;
  }

  async function compact(db,cutoff = Number(now()) - RETENTION_DAYS * DAY_MS) {
    const transaction = db.transaction(['events','contributions','receipts','archive'],'readwrite');
    const KeyRange = globalThis.IDBKeyRange;
    const upper = KeyRange ? KeyRange.upperBound(cutoff,true) : null;
    const archivedByDay = new Map();

    const removeBefore = request => new Promise((resolve,reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve();
        if (cursor.value.at >= cutoff) return resolve();
        cursor.delete();
        cursor.continue();
      };
    });
    const events = transaction.objectStore('events');
    const contributions = transaction.objectStore('contributions');
    const receipts = transaction.objectStore('receipts');
    const archive = transaction.objectStore('archive');

    const eventCleanup = removeBefore(events.index('at').openCursor(upper));
    const contributionCleanup = new Promise((resolve,reject) => {
      const request = contributions.index('at').openCursor(upper);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && cursor.value.at < cutoff) {
          const item = cursor.value;
          let daily = archivedByDay.get(item.day);
          if (!daily) {
            daily = {day:item.day,activeMs:0,words:0,queries:0,passages:0,terms:new Set(),sentences:new Set()};
            archivedByDay.set(item.day,daily);
          }
          daily.activeMs += item.activeMs;
          daily.words += item.words;
          daily.queries += item.queries;
          daily.passages += item.passages;
          if (item.termFingerprint) daily.terms.add(item.termFingerprint);
          if (item.sentenceFingerprint) daily.sentences.add(item.sentenceFingerprint);
          receipts.put({id:item.id,at:item.at,day:item.day,sequence:item.sequence || 0,archived:true});
          cursor.delete();
          cursor.continue();
          return;
        }
        const days = [...archivedByDay.values()];
        const merge = index => {
          if (index >= days.length) return resolve();
          const daily = days[index];
          const get = archive.get(daily.day);
          get.onerror = () => reject(get.error);
          get.onsuccess = () => {
            const prior = get.result;
            if (prior) {
              daily.activeMs += prior.activeMs;
              daily.words += prior.words;
              daily.queries += prior.queries;
              daily.passages += prior.passages || 0;
              for (const value of prior.termFingerprints || []) daily.terms.add(value);
              for (const value of prior.sentenceFingerprints || []) daily.sentences.add(value);
            }
            archive.put({
              day:daily.day,activeMs:daily.activeMs,words:daily.words,queries:daily.queries,passages:daily.passages,
              termFingerprints:[...daily.terms],sentenceFingerprints:[...daily.sentences],
            });
            merge(index + 1);
          };
        };
        merge(0);
      };
    });
    await Promise.all([eventCleanup,contributionCleanup]);
    await transactionDone(transaction);
  }

  async function invalidatedMeta(store) {
    const record = await requestResult(store.get('meta'));
    const value = {...freshMeta(),...(record?.value || {})};
    value.revision = Math.max(0,Number(value.revision) || 0) + 1;
    value.lastEvidenceKey='';
    value.profile = null;
    value.pending = null;
    value.versions=(value.versions||[]).map(version=>({...version,status:'invalidated'}));
    store.put({key:'meta',value});
    return value;
  }

  return {
    async append(input,{expectedRevision}={}) {
      const event = sanitize(input);
      if (!event) return false;
      const privateSalt = event.type==='query'?await salt():'';
      const termFingerprint = event.type === 'query' && (event.kind === 'word' || event.kind === 'phrase')
        ? await digest(privateSalt,normalized(event.term)) : '';
      const sentenceFingerprint = event.type === 'query' && event.kind !== 'passage' && isSingleSentence(event.sentence)
        ? await digest(privateSalt,normalized(event.sentence)) : '';
      const contribution = {
        id:event.id,at:event.at,day:utcDay(event.at),
        activeMs:event.type === 'reading' ? event.elapsedMs : 0,
        words:event.type === 'reading' ? event.wordCount : 0,
        queries:event.type === 'query' ? 1 : 0,
        passages:event.type === 'query' && event.kind === 'passage' ? 1 : 0,
        termFingerprint,sentenceFingerprint,
        ...(event.type==='reading'?{sequence:event.sequence}:{}),
      };
      const db = await database();
      const transaction = db.transaction(['events','contributions','receipts','control'],'readwrite');
      if(expectedRevision!==undefined){
        const record=await requestResult(transaction.objectStore('control').get('meta'));
        if((Number(record?.value?.revision)||0)!==expectedRevision){
          const aborted=transactionDone(transaction);transaction.abort();
          try{await aborted;}catch{}
          return false;
        }
      }
      const contributions = transaction.objectStore('contributions');
      const receipts = transaction.objectStore('receipts');
      const receipt = await requestResult(receipts.get(event.id));
      const duplicate = receipt && await requestResult(contributions.get(event.id));
      if (receipt && (receipt.archived || event.type !== 'reading' || !duplicate || !Number.isSafeInteger(duplicate.sequence)
        || event.sequence <= duplicate.sequence || duplicate.day !== contribution.day)) {
        const aborted = transactionDone(transaction);
        transaction.abort();
        try { await aborted; } catch {}
        return false;
      }
      if (duplicate) {
        contribution.activeMs += duplicate.activeMs;
        contribution.words += duplicate.words;
        event.elapsedMs = contribution.activeMs;
        event.wordCount = contribution.words;
      }
      contributions.put(contribution);
      receipts.put({id:event.id,at:event.at,day:contribution.day,sequence:contribution.sequence || 0,archived:false});
      if (event.at >= Number(now()) - RETENTION_DAYS * DAY_MS) transaction.objectStore('events').put(event);
      const control = transaction.objectStore('control');
      const started = await requestResult(control.get('startedAt'));
      if (!started || event.at < started.value) control.put({key:'startedAt',value:event.at});
      await transactionDone(transaction);
      return true;
    },

    async snapshot({days=30,search='',domain='',type='',limit=MAX_EVENTS,cursor=null} = {}) {
      const db = await database();
      await compact(db);
      const numericDays = Number(days);
      const windowDays = numericDays === 0 ? 0 : Math.max(1,Math.floor(Number.isFinite(numericDays) ? numericDays : 30));
      const cutoff = windowDays ? dayStart(Number(now())) - (windowDays - 1) * DAY_MS : -Infinity;
      const query = normalized(search);
      const requestedLimit = Number(limit);
      const resultLimit = Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : MAX_EVENTS));
      const pageCursor = cursor && Number.isSafeInteger(cursor.at) && typeof cursor.id === 'string' && cursor.id
        ? {at:cursor.at,id:cursor.id} : null;
      const transaction = db.transaction(['events','contributions','archive','control'],'readonly');
      const events = transaction.objectStore('events');
      const {index,prefix} = orderedIndex(events,{domain,type});
      const bodies = [];
      let total = 0;
      let pageCount = 0;
      let hasMore = false;
      let lastProjection = null;
      const indexedCount = !query && Boolean(globalThis.IDBKeyRange);
      const fullRange = orderedRange(prefix,cutoff);
      const totalPromise = indexedCount ? requestResult(index.count(fullRange)) : null;
      const cursorOutsideWindow = pageCursor && pageCursor.at < cutoff;
      const skipPageScan = indexedCount && (resultLimit === 0 || cursorOutsideWindow);
      const eventScan = skipPageScan ? Promise.resolve() : new Promise((resolve,reject) => {
        const pageRange = indexedCount ? orderedRange(prefix,cutoff,pageCursor) : fullRange;
        const request = indexedCount ? index.openKeyCursor(pageRange,'prev') : index.openCursor(pageRange,'prev');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const itemCursor = request.result;
          if (!itemCursor) return resolve();
          const item = indexedCount ? null : itemCursor.value;
          const key = itemCursor.key;
          const at = indexedCount ? key[key.length-2] : item.at;
          const id = indexedCount ? key[key.length-1] : item.id;
          if (at < cutoff) return resolve();
          const matches = indexedCount || ((!domain || item.domain === domain) && (!type || item.type === type)
            && ['term','sentence','translation','explanation','summary','domain'].some(name => normalized(item[name]).includes(query)));
          if (matches) {
            if (!indexedCount) total += 1;
            const afterCursor = indexedCount || !pageCursor || at < pageCursor.at || (at === pageCursor.at && id < pageCursor.id);
            if (afterCursor) {
              if (pageCount < resultLimit) {
                bodies.push(indexedCount ? requestResult(events.get(id)) : Promise.resolve(item));
                pageCount += 1;
                lastProjection = {at,id};
              } else {
                hasMore = true;
                if (indexedCount) return resolve();
              }
            }
          }
          itemCursor.continue();
        };
      });
      const KeyRange = globalThis.IDBKeyRange;
      const contributionRange = cutoff === -Infinity || !KeyRange ? null : KeyRange.lowerBound(cutoff);
      const archiveRange = cutoff === -Infinity || !KeyRange ? null : KeyRange.lowerBound(utcDay(cutoff));
      const archivePromise = requestResult(transaction.objectStore('archive').getAll(archiveRange));
      const contributionPromise = requestResult(transaction.objectStore('contributions').index('at').getAll(contributionRange));
      const startedPromise = requestResult(transaction.objectStore('control').get('startedAt'));
      await eventScan;
      const [pageEvents,archived,allContributions,started,indexedTotal] = await Promise.all([
        Promise.all(bodies),archivePromise,contributionPromise,startedPromise,totalPromise,
      ]);
      if (indexedCount) total = indexedTotal;
      await transactionDone(transaction);

      const metrics = {activeMs:0,words:0,queries:0,terms:0,sentences:0,passages:0};
      const terms = new Set();
      const sentences = new Set();
      const perDay = new Map();
      const dailyFor = day => {
        let daily = perDay.get(day);
        if (!daily) {
          daily = {day,activeMs:0,words:0,queries:0,termSet:new Set(),sentenceSet:new Set()};
          perDay.set(day,daily);
        }
        return daily;
      };
      for (const item of archived) {
        if (cutoff !== -Infinity && Date.parse(item.day+'T00:00:00Z') < cutoff) continue;
        metrics.activeMs += item.activeMs;
        metrics.words += item.words;
        metrics.queries += item.queries;
        metrics.passages += item.passages || 0;
        const daily = dailyFor(item.day);
        daily.activeMs += item.activeMs;
        daily.words += item.words;
        daily.queries += item.queries;
        for (const value of item.termFingerprints || []) { terms.add(value); daily.termSet.add(value); }
        for (const value of item.sentenceFingerprints || []) { sentences.add(value); daily.sentenceSet.add(value); }
      }
      for (const item of allContributions) {
        if (item.at < cutoff) continue;
        metrics.activeMs += item.activeMs;
        metrics.words += item.words;
        metrics.queries += item.queries;
        metrics.passages += item.passages;
        if (item.termFingerprint) terms.add(item.termFingerprint);
        if (item.sentenceFingerprint) sentences.add(item.sentenceFingerprint);
        if (!item.activeMs && !item.words && !item.queries && !item.termFingerprint && !item.sentenceFingerprint) continue;
        const daily = dailyFor(item.day);
        daily.activeMs += item.activeMs;
        daily.words += item.words;
        daily.queries += item.queries;
        if (item.termFingerprint) daily.termSet.add(item.termFingerprint);
        if (item.sentenceFingerprint) daily.sentenceSet.add(item.sentenceFingerprint);
      }
      metrics.terms = terms.size;
      metrics.sentences = sentences.size;
      const daily = [...perDay.values()].sort((a,b) => a.day.localeCompare(b.day)).map(item => ({
        day:item.day,activeMs:item.activeMs,words:item.words,queries:item.queries,terms:item.termSet.size,sentences:item.sentenceSet.size,
      }));
      const nextCursor = hasMore && lastProjection ? {at:lastProjection.at,id:lastProjection.id} : null;
      return {events:pageEvents.filter(Boolean),metrics,daily,startedAt:started?.value || null,total,nextCursor,retentionDays:RETENTION_DAYS};
    },

    async remove(id) {
      if (typeof id !== 'string' || !id || id.length > 128) return false;
      const db = await database();
      const transaction = db.transaction(['events','contributions','receipts','control'],'readwrite');
      const contributions = transaction.objectStore('contributions');
      const exists = await requestResult(contributions.get(id));
      if (!exists) {
        const aborted = transactionDone(transaction);
        transaction.abort();
        try { await aborted; } catch {}
        return false;
      }
      contributions.delete(id);
      transaction.objectStore('receipts').delete(id);
      transaction.objectStore('events').delete(id);
      await invalidatedMeta(transaction.objectStore('control'));
      await transactionDone(transaction);
      return true;
    },

    async editSummary(id,summary) {
      const clean = bounded(summary,1000);
      if (typeof id !== 'string' || !id || id.length > 128 || clean == null || !clean.trim()) return false;
      const db = await database();
      const transaction = db.transaction(['events','control'],'readwrite');
      const events = transaction.objectStore('events');
      const event = await requestResult(events.get(id));
      if (!event || event.type !== 'summary') {
        const aborted = transactionDone(transaction);
        transaction.abort();
        try { await aborted; } catch {}
        return false;
      }
      event.summary = clean.trim();
      event.status = 'ready';
      event.modelGenerated = false;
      events.put(event);
      await invalidatedMeta(transaction.objectStore('control'));
      await transactionDone(transaction);
      return true;
    },

    async clear() {
      const db = await database();
      const transaction = db.transaction(['events','contributions','receipts','archive','control'],'readwrite');
      const control = transaction.objectStore('control');
      const record = await requestResult(control.get('meta'));
      const revision = Math.max(0,Number(record?.value?.revision) || 0) + 1;
      transaction.objectStore('events').clear();
      transaction.objectStore('contributions').clear();
      transaction.objectStore('receipts').clear();
      transaction.objectStore('archive').clear();
      control.clear();
      control.put({key:'meta',value:{...freshMeta(),revision}});
      await transactionDone(transaction);
    },

    async evidence() {
      const db = await database();
      await compact(db);
      const cutoff = Number(now()) - 30 * DAY_MS;
      const transaction = db.transaction('events','readonly');
      const events = transaction.objectStore('events');
      const load = (type,limit) => {
        const matches = [];
        const {index,prefix} = orderedIndex(events,{type});
        return new Promise((resolve,reject) => {
          const request = index.openCursor(orderedRange(prefix,cutoff),'prev');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const itemCursor = request.result;
            if (!itemCursor || matches.length >= limit) return resolve(matches);
            const item = itemCursor.value;
            if (item.at < cutoff) return resolve(matches);
            if (item.type === type) matches.push(item);
            itemCursor.continue();
          };
        });
      };
      const [queries,summaries] = await Promise.all([load('query',60),load('summary',30)]);
      await transactionDone(transaction);
      return {queries,summaries};
    },

    async meta() {
      const db = await database();
      const transaction = db.transaction('control','readonly');
      const record = await requestResult(transaction.objectStore('control').get('meta'));
      await transactionDone(transaction);
      return {...freshMeta(),...(record?.value || {})};
    },

    async updateMeta(mutator) {
      if (typeof mutator !== 'function') throw new TypeError('A synchronous meta mutator is required');
      const db = await database();
      const transaction = db.transaction('control','readwrite');
      const store = transaction.objectStore('control');
      const record = await requestResult(store.get('meta'));
      const current = {...freshMeta(),...(record?.value || {})};
      const draft = clone(current);
      let returned;
      try { returned = mutator(draft); }
      catch (error) { transaction.abort(); throw error; }
      if (returned && typeof returned.then === 'function') {
        transaction.abort();
        throw new TypeError('Meta mutator must be synchronous');
      }
      const candidate = returned === undefined ? draft : returned;
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        transaction.abort();
        throw new TypeError('Meta mutator must produce an object');
      }
      const value = {...freshMeta(),...clone(candidate)};
      store.put({key:'meta',value});
      await transactionDone(transaction);
      return clone(value);
    },

    close() {
      const pending = databasePromise;
      databasePromise = null;
      pending?.then(db => db.close()).catch(() => {});
    },
  };
}
