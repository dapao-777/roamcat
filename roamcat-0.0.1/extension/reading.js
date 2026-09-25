/**
 * @file extension/reading.js
 * 文件职责：阅读渐退领域层——用纯函数维护「求助过的词在什么页面、出现过几次、该给提示还是安静」的
 *   状态机，以及 schema 1–5 词档案迁移与模型读者证据提取，是提示密度策略的唯一事实源。
 * 主要内容：normalizeKnownAt/normalizeSenseLabel 归一化、readingEvidence 的有界读者证据、
 *   migrateSupportWord 的旧档案迁移、supportState 的 hint/mark/quiet 阶段判定、encounter 的
 *   「提示真实出现才计次」机会累计与 quiet 周期推进、interact 的帮助/少帮助动作。
 * 模块边界：零浏览器依赖、零副作用，禁止 import 任何其他模块（tools/verify-module-graph.cjs R5 强制）；
 *   被 background.js 与 history-service.js 引用；时间参数全部可注入以保证可测性。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
const DAY = 86_400_000;
const ABSENCE_DAYS = 14;
const HINT_OPPORTUNITY_DAYS = 3;
const MARK_OPPORTUNITY_DAYS = 3;
const QUIET_DAYS = [7,14,28];
const MAX_SENSES = 8;
const MAX_READING_EVIDENCE = 12;

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function integerNonNegative(value) {
  return Math.floor(finiteNonNegative(value));
}

function timestamp(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function normalizeKnownAt(value) {
  return timestamp(value);
}

function utcDay(value) {
  return Math.floor(value / DAY);
}

function preference(value) {
  return value === 'less' ? 'less' : null;
}

export function normalizeSenseLabel(value) {
  if (typeof value !== 'string') return null;
  const label = value.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
  return label.length >= 1 && label.length <= 60 ? label : null;
}
function evidenceTerm(value) {
  if (typeof value !== 'string') return '';
  const term = value.normalize('NFKC').trim().replace(/\s+/gu,' ')
    .replace(/[’\u2019]/gu,"'").toLowerCase();
  if (term.length < 1 || term.length > 100 || !/[a-z]/u.test(term)
      || /[\u3400-\u9fff\uf900-\ufaff]/u.test(term) || /(?:https?:\/\/|www\.)/iu.test(term)) return '';
  return term;
}

function evidenceDomain(word) {
  if (typeof word?.domain === 'string' && word.domain) return word.domain;
  const split = typeof word?.id === 'string' ? word.id.indexOf(':') : -1;
  return split > 0 ? word.id.slice(0,split) : 'general';
}

function latestQueryAt(word) {
  let latest = timestamp(word?.requestedAt);
  for (const sense of Array.isArray(word?.senses) ? word.senses : []) {
    latest = Math.max(latest,timestamp(sense?.lastHelpAt));
  }
  return latest || timestamp(word?.lastSeen);
}

/** Returns bounded explicit reading history for model support calibration. */
export function readingEvidence(words, domain) {
  const currentDomain = typeof domain === 'string' && domain && domain !== 'auto' ? domain : 'general';
  const allowedDomains = new Set(currentDomain === 'general' ? ['general'] : [currentDomain,'general']);
  const records = [];
  for (const word of Array.isArray(words) ? words : []) {
    if (!word || (word.kind !== 'word' && word.kind !== 'phrase')) continue;
    const requested = integerNonNegative(word.helpCount) > 0 || timestamp(word.requestedAt) > 0;
    const less = word.hintPreference === 'less';
    if (!requested && !less) continue;
    const scope = evidenceDomain(word);
    if (!allowedDomains.has(scope)) continue;
    const term = evidenceTerm(word.term);
    if (!term) continue;
    records.push({
      term,
      scope,
      at:latestQueryAt(word),
      requested,
      less,
    });
  }

  records.sort((left,right) => right.at-left.at
    || Number(right.scope === currentDomain)-Number(left.scope === currentDomain)
    || left.term.localeCompare(right.term));
  const collect = key => {
    const terms = [], seen = new Set();
    for (const record of records) {
      if (!record[key] || seen.has(record.term)) continue;
      seen.add(record.term);
      terms.push(record.term);
      if (terms.length === MAX_READING_EVIDENCE) break;
    }
    return terms;
  };
  return {recentQueries:collect('requested'),lessHelpTerms:collect('less')};
}

function migrateLegacyIdentity(word) {
  if (!word || typeof word !== 'object' || word.kind === 'sentence') return null;
  return {
    id:word.id,
    term:word.term,
    domain:word.domain,
    kind:word.kind === 'phrase' ? 'phrase' : 'word',
    revision:integerNonNegative(word.revision),
    helpCount:integerNonNegative(word.helpCount),
    requestedAt:timestamp(word.requestedAt),
    knownAt:normalizeKnownAt(word.knownAt),
    lastSeen:timestamp(word.lastSeen),
    hintPreference:preference(word.hintPreference),
    senses:[],
  };
}

function migrateSense(sense) {
  if (!sense || typeof sense !== 'object') return null;
  const key = typeof sense.key === 'string' && sense.key ? sense.key : null;
  const label = normalizeSenseLabel(sense.label);
  if (!key || !label) return null;
  return {
    key,
    label,
    opportunityDays:integerNonNegative(sense.opportunityDays),
    lastOpportunityAt:timestamp(sense.lastOpportunityAt),
    lastHelpAt:timestamp(sense.lastHelpAt),
    quietUntil:timestamp(sense.quietUntil),
    quietCycles:Math.min(2,integerNonNegative(sense.quietCycles)),
    quietOpportunityDays:integerNonNegative(sense.quietOpportunityDays),
    hintPreference:preference(sense.hintPreference),
    assistedPageKey:typeof sense.assistedPageKey === 'string' ? sense.assistedPageKey : '',
    definition:{
      hint:typeof sense.definition?.hint === 'string' ? sense.definition.hint.slice(0,80) : '',
      translation:typeof sense.definition?.translation === 'string' ? sense.definition.translation.slice(0,160) : '',
    },
  };
}

/**
 * Converts one stored schema 1–5 record to the schema-5 support-only shape.
 * Legacy counters, contexts, translations, sources, and inferred memory fields
 * deliberately do not become support opportunities or senses.
 */
export function migrateSupportWord(word, schemaVersion) {
  const version = Number(schemaVersion);
  if (!Number.isInteger(version) || version < 1 || version > 5) {
    throw new RangeError('Unsupported reading data schema');
  }
  const migrated = migrateLegacyIdentity(word);
  if (!migrated || version < 4) return migrated;

  const senses = [];
  const keys = new Set();
  for (const source of Array.isArray(word.senses) ? word.senses : []) {
    const sense = migrateSense(source);
    if (!sense || keys.has(sense.key)) continue;
    keys.add(sense.key);
    senses.push(sense);
    if (senses.length === MAX_SENSES) break;
  }
  return {...migrated,senses};
}

function senseFor(word, senseKey) {
  if (!word || typeof word !== 'object' || typeof senseKey !== 'string' || !senseKey) return null;
  return Array.isArray(word.senses) ? word.senses.find(sense => sense?.key === senseKey) || null : null;
}

function hasLongAbsence(sense, now) {
  return sense.lastOpportunityAt > 0 && now - sense.lastOpportunityAt > ABSENCE_DAYS * DAY;
}

export function supportState(word, senseKey, now = Date.now()) {
  const sense = senseFor(word,senseKey);
  if (!sense) return {stage:'hint'};
  if (word.hintPreference === 'less' || sense.hintPreference === 'less') return {stage:'quiet'};

  const current = timestamp(now,Date.now());
  if (hasLongAbsence(sense,current)) return {stage:'hint'};
  if (sense.quietUntil > current) return {stage:'quiet'};
  return {stage:integerNonNegative(sense.opportunityDays) < HINT_OPPORTUNITY_DAYS ? 'hint' : 'mark'};
}

function requireSense(word, senseKey) {
  if (!word || typeof word !== 'object') throw new TypeError('A support word is required');
  const index = Array.isArray(word.senses) ? word.senses.findIndex(sense => sense?.key === senseKey) : -1;
  if (index < 0) throw new RangeError('Unknown sense key');
  return {index,sense:migrateSense(word.senses[index])};
}

function replaceSense(word, index, sense, now) {
  const senses = word.senses.slice();
  senses[index] = sense;
  return {...word,senses,revision:integerNonNegative(word.revision)+1,lastSeen:now};
}

/** Records one genuinely visible opportunity for an already-known sense. */
export function encounter(word, pageKey, now = Date.now(), {senseKey,hintShown = false} = {}) {
  const {index,sense:stored} = requireSense(word,senseKey);
  if (!stored) throw new RangeError('Invalid sense');
  if (typeof pageKey !== 'string' || !pageKey) throw new TypeError('A page key is required');

  const current = timestamp(now,Date.now());
  let sense = stored;
  if (word.hintPreference === 'less' || sense.hintPreference === 'less') return word;

  if (hasLongAbsence(sense,current)) {
    sense = {...sense,opportunityDays:0,lastOpportunityAt:0,quietUntil:0,quietCycles:0,
      quietOpportunityDays:0};
  }

  if (sense.assistedPageKey === pageKey ||
      (sense.lastOpportunityAt > 0 && utcDay(sense.lastOpportunityAt) === utcDay(current))) {
    return sense === stored ? word : replaceSense(word,index,sense,current);
  }

  if (sense.quietUntil > current) {
    sense = {...sense,lastOpportunityAt:current,
      quietOpportunityDays:sense.quietOpportunityDays+1};
    return replaceSense(word,index,sense,current);
  }

  if (sense.quietUntil > 0) {
    const quietCycles = sense.quietOpportunityDays >= 2
      ? Math.min(2,sense.quietCycles+1)
      : sense.quietCycles;
    sense = {...sense,opportunityDays:HINT_OPPORTUNITY_DAYS,quietUntil:0,
      quietCycles,quietOpportunityDays:0};
  }

  const stage = sense.opportunityDays < HINT_OPPORTUNITY_DAYS ? 'hint' : 'mark';
  if ((stage === 'hint') !== Boolean(hintShown)) {
    return sense === stored ? word : replaceSense(word,index,sense,current);
  }

  const opportunityDays = sense.opportunityDays+1;
  sense = {...sense,opportunityDays,lastOpportunityAt:current};
  if (stage === 'mark' && opportunityDays >= HINT_OPPORTUNITY_DAYS+MARK_OPPORTUNITY_DAYS) {
    sense = {...sense,opportunityDays:HINT_OPPORTUNITY_DAYS,
      quietUntil:current+QUIET_DAYS[sense.quietCycles]*DAY,quietOpportunityDays:0};
  }
  return replaceSense(word,index,sense,current);
}

/** Applies an explicit successful help or “less help” action to one sense. */
export function interact(word, action, now = Date.now(), pageKey = '', senseKey) {
  if (action !== 'help' && action !== 'less') throw new RangeError('Invalid support action');
  const {index,sense:stored} = requireSense(word,senseKey);
  if (!stored) throw new RangeError('Invalid sense');
  const current = timestamp(now,Date.now());

  const sense = action === 'less'
    ? {...stored,hintPreference:'less',quietUntil:0}
    : {...stored,opportunityDays:0,lastOpportunityAt:0,lastHelpAt:current,quietUntil:0,
      quietCycles:0,quietOpportunityDays:0,hintPreference:null,
      assistedPageKey:typeof pageKey === 'string' ? pageKey : ''};
  const next = replaceSense(word,index,sense,current);
  return {...next,hintPreference:null,
    helpCount:integerNonNegative(word.helpCount)+(action === 'help' ? 1 : 0)};
}
