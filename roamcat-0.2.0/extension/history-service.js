/**
 * @file extension/history-service.js
 * 文件职责：阅读记录编排——采集开关、事件写入、摘要与个性化引擎装配。
 * 主要内容：createReadingHistory；默认关闭，需授权origin；无痕不采集。
 * 模块边界：应用层；依赖history-store与personalization；被background装配。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {createHistoryStore} from './history-store.js';
import {createPersonalization} from './personalization.mjs';
import {supportState} from './reading.js';

const CONFIG='readingHistory', SESSIONS='readingHistorySessions';
const DOMAINS=new Set(['general','tech','data','finance','medical','legal','design']);
const defaults=()=>({enabled:false,origins:[],summaries:false,personalization:false,autoApply:false,startedAt:0,epoch:0});
const bounded=(value,max)=>typeof value==='string'?value.slice(0,max):'';
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
function validateConfig(patch,current){
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(k=>!['enabled','origins','summaries','personalization','autoApply'].includes(k)))throw new Error('历史设置无效。');
  const next={...current};
  for(const key of ['enabled','summaries','personalization','autoApply'])if(patch[key]!==undefined){if(typeof patch[key]!=='boolean')throw new Error('历史开关无效。');next[key]=patch[key];}
  if(patch.origins!==undefined){
    if(!Array.isArray(patch.origins)||patch.origins.length>100)throw new Error('历史授权网站最多 100 个。');
    next.origins=[...new Set(patch.origins.map(value=>{let url;try{url=new URL(value);}catch{throw new Error('请输入完整网站 origin。');}if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('历史网站只接受协议和主机，不接受路径或查询参数。');return url.origin;}))];
  }
  if((patch.summaries===true||patch.personalization===true)&&(!next.enabled||!next.origins.length))throw new Error('请先开启阅读记录并添加允许网站。');
  if(patch.autoApply===true&&!next.personalization)throw new Error('请先开启个性化分析。');
  if(!next.origins.length){next.summaries=false;next.personalization=false;next.autoApply=false;}
  if(!next.enabled){next.summaries=false;next.personalization=false;next.autoApply=false;}
  if(!next.personalization)next.autoApply=false;
  return {...next,startedAt:next.startedAt||(next.enabled?Date.now():0),epoch:current.epoch+1};
}
export function createReadingHistory({storage,session,source,paused,writable=()=>true,state,runModel,onChange,store=createHistoryStore()}){
  let config=defaults(),meta={overrides:[],profile:null},problem='',queue=Promise.resolve(),nextAnalysisCheck=0;
  const serial=fn=>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next;};
  const reload=async()=>{meta=await store.meta();};
  const ready=storage.get(CONFIG).then(async data=>{const saved=data[CONFIG];if(saved){try{config={...validateConfig({enabled:saved.enabled,origins:saved.origins,summaries:saved.summaries,personalization:saved.personalization,autoApply:saved.autoApply},defaults()),startedAt:Number(saved.startedAt)||0,epoch:Number(saved.epoch)||0};await reload();}catch{config=defaults();problem='历史存储无法读取，已停止采集。';}}}).catch(()=>{problem='历史授权无法读取，已停止采集。';});
  const engine=createPersonalization({history:store,config:async()=>{await ready;return {...config,enabled:config.enabled&&writable(),assistanceMode:(await state()).settings.assistanceMode};},runModel,onChange:async()=>{const previous=JSON.stringify(meta.profile?.after);await reload();await onChange({keepDefinitions:previous===JSON.stringify(meta.profile?.after)});}});
  async function allowed(sender,active=false){
    await ready;if(!writable()||!config.enabled||sender.tab?.incognito||sender.frameId!==0)return null;
    const page=await source(sender);if((active&&!page.active)||page.incognito||await paused(page.tabId)||!config.origins.includes(new URL(page.url).origin))return null;
    return page;
  }
  async function sessions(){const all=(await session.get(SESSIONS))[SESSIONS]||{};return Object.fromEntries(Object.entries(all).filter(([,s])=>s.at>Date.now()-86400000).slice(-63));}
  async function pageSession(sender,page,all){
    const key=String(page.tabId),old=all[key],documentId=sender.documentId||null;
    if(old&&old.sourceHash===page.sourceHash&&old.documentId===documentId){old.url=page.url;if(old.epoch!==config.epoch){old.epoch=config.epoch;old.pending={};old.offers={};old.lastTick=Date.now();}return old;}
    const row={id:crypto.randomUUID(),url:page.url,sourceHash:page.sourceHash,documentId,epoch:config.epoch,at:Date.now(),lastTick:Date.now(),sequence:0,words:[],shown:[],pending:{},offers:{}};all[key]=row;return row;
  }
  const saveSessions=all=>session.set({[SESSIONS]:all});
  async function clearPendingSessions(){const all=await sessions();for(const [key,row] of Object.entries(all)){if(!config.enabled||!config.origins.includes(new URL(row.url).origin)){delete all[key];continue;}row.pending={};row.offers={};}await saveSessions(all);}
  function policy(){const profile=meta.profile;return writable()&&config.enabled&&config.personalization&&profile?.expiresAt>Date.now()?profile.after:null;}
  function effective(word,senseKey){
    const manual=meta.overrides?.find(v=>v.wordId===word.id&&v.senseKey===senseKey);
    if(manual)return {stage:manual.stage,reason:'手动选择',origin:'manual',locked:manual.locked,expiresAt:0};
    const base=supportState(word,senseKey),sense=word.senses?.find(v=>v.key===senseKey),personal=policy();
    if(word.hintPreference==='less'||sense?.hintPreference==='less')return {...base,reason:'你选择了减少提示',origin:'manual',locked:false,expiresAt:0};
    if(base.stage!=='quiet'&&['hint','mark'].includes(personal?.annotation?.depth))return {stage:personal.annotation.depth,reason:'已生效的个性化调整',origin:'adaptive',locked:false,expiresAt:meta.profile.expiresAt};
    return {...base,reason:base.stage==='quiet'?'当前处于可恢复的暂缓提示期':base.stage==='mark'?'当前支持策略仅保留标记':'当前语境保留短注',origin:'default',locked:false,expiresAt:base.stage==='quiet'?sense?.quietUntil||0:0};
  }
  async function report(operation){try{return await operation();}catch{problem='历史记录写入失败；阅读功能仍可使用，请导出现有记录后检查本机空间。';return false;}}
  async function snapshot(filter={}){await ready;const current=await state();const data=await store.snapshot(filter);await reload();return {...data,config:{...config},problem,knownWords:current.words.filter(w=>w.knownAt>0).map(w=>({wordId:w.id,term:w.term,domain:w.domain,kind:w.kind,knownAt:w.knownAt})).sort((a,b)=>b.knownAt-a.knownAt),legacyWords:current.words.filter(w=>(w.helpCount>0||w.requestedAt>0)&&(!config.startedAt||w.requestedAt<config.startedAt)).map(w=>({wordId:w.id,term:w.term,domain:w.domain,kind:w.kind,helpCount:w.helpCount,requestedAt:w.requestedAt,legacy:true})),rules:current.words.flatMap(w=>(w.senses||[]).map(s=>({wordId:w.id,senseKey:s.key,term:w.term,domain:w.domain,sense:s.label,...effective(w,s.key)})))};}
  const api={
    ready,policy,effective,
    async refresh(){await ready;if(meta.profile&&meta.profile.expiresAt<=Date.now())await engine.snapshot();},
    publicConfig(){return {enabled:config.enabled,epoch:config.epoch,summaries:config.summaries,policy:policy()};},
    async configure(patch){await serial(async()=>{await ready;const next=validateConfig(patch,config);await storage.set({[CONFIG]:next});config=next;await clearPendingSessions();if(config.startedAt){await store.updateMeta(m=>({...m,revision:(m.revision||0)+1,pending:null}));await reload();}await onChange();});return snapshot();},
    async invalidate(){await ready;if(!config.startedAt)return;await serial(async()=>{const next={...config,epoch:config.epoch+1};await storage.set({[CONFIG]:next});config=next;await clearPendingSessions();await store.updateMeta(m=>({...m,revision:(m.revision||0)+1,pending:null}));await reload();});},
    snapshot,
    async begin(sender){return serial(async()=>{const page=await allowed(sender,true);if(!page)return {enabled:false};const all=await sessions(),row=await pageSession(sender,page,all);await saveSessions(all);return {enabled:true,id:row.id,epoch:row.epoch,summaries:config.summaries,sequence:row.sequence};});},
    async tick(message,sender){return serial(async()=>{
      await api.refresh();
      const page=await allowed(sender,true);if(!page)return {recorded:false};const all=await sessions(),row=all[page.tabId];
      if(message.epoch!==config.epoch||!row||row.id!==message.sessionId||row.epoch!==config.epoch||row.sourceHash!==page.sourceHash||row.documentId!==(sender.documentId||null))return {recorded:false};
      if(!Number.isSafeInteger(message.sequence)||message.sequence<=row.sequence)return {recorded:false};
      if(!Number.isInteger(message.elapsedMs)||message.elapsedMs<0||message.elapsedMs>5000||!Array.isArray(message.words)||message.words.length>500||message.words.some(v=>typeof v!=='string'||!/^[a-z0-9:._-]{1,100}$/i.test(v)))throw new Error('阅读统计信号无效。');
      const now=Date.now(),elapsedMs=Math.min(message.elapsedMs,Math.max(0,now-row.lastTick+100),5000),known=new Set(row.words),fresh=[...new Set(message.words)].filter(v=>!known.has(v)).slice(0,Math.max(0,20000-row.words.length));
      const event={id:row.id+':'+new Date(now).toISOString().slice(0,10),sequence:message.sequence,type:'reading',at:now,sessionId:row.id,domain:DOMAINS.has(message.domain)?message.domain:'general',elapsedMs,wordCount:new Set(fresh).size};
      const recorded=await report(()=>store.append(event));if(!recorded)return {recorded:false};
      row.words=[...new Set([...row.words,...fresh])];row.lastTick=now;row.sequence=message.sequence;row.at=now;await saveSessions(all);
      if(config.summaries&&typeof message.sample==='string'&&message.sample.length<=2000&&!row.summaryRequested&&(await state()).settings.assistanceMode==='ambient'){
        row.summaryRequested=true;await saveSessions(all);void engine.summarize({sessionId:row.id,domain:event.domain,sample:message.sample}).catch(()=>{});
      }
      if(config.personalization&&Date.now()>=nextAnalysisCheck){nextAnalysisCheck=Date.now()+300000;void engine.analyze().catch(()=>{});}
      return {recorded:true};
    });},
    async prepareQuery(sender,requestId,request,result){return report(()=>serial(async()=>{
      const page=await allowed(sender),definition=result?.translation??result?.hint;if(!page||!result?.details?.sentenceTranslation&&!Array.isArray(result?.items)&&!((request.kind==='word'||request.kind==='phrase')&&typeof definition==='string'&&definition.trim()))return false;
      const all=await sessions(),row=await pageSession(sender,page,all);let sentence=bounded(request.context||request.text||request.items?.map(v=>v.text).join(''),4000);
      const pieces=[...new Intl.Segmenter('en',{granularity:'sentence'}).segment(sentence)].filter(v=>/[A-Za-z]/.test(v.segment));
      const kind=request.kind==='word'||request.kind==='phrase'?request.kind:pieces.length===1?'sentence':'passage';
      if(sentence.length>1000)sentence='';
      const event={id:crypto.randomUUID(),type:'query',at:Date.now(),sessionId:row.id,domain:DOMAINS.has(request.domain)?request.domain:'general',term:kind==='word'||kind==='phrase'?bounded(result.support?.wordId?.slice(result.support.wordId.indexOf(':')+1)||request.text,100):'',kind,source:'personal',stage:'hint',status:'ready',modelGenerated:true,sentence,translation:bounded(result.details?.sentenceTranslation||result.items?.map(v=>v.translation).join('\n'),2000),explanation:bounded(result.details?.meaning?.zh||result.details?.meaning?.en||result.translation||result.hint,1200),senseKey:result.support?.senseKey||''};
      row.pending[requestId]={event,at:Date.now()};row.pending=Object.fromEntries(Object.entries(row.pending).slice(-32));await saveSessions(all);return true;
    }));},
    async commit(sender,requestId){return report(()=>serial(async()=>{const page=await allowed(sender);if(!page)return false;const all=await sessions(),row=all[page.tabId],pending=row?.pending?.[requestId];if(!row||row.epoch!==config.epoch||row.sourceHash!==page.sourceHash||row.documentId!==(sender.documentId||null)||!pending||pending.at<Date.now()-300000)return false;const recorded=await store.append(pending.event);delete row.pending[requestId];await saveSessions(all);if(recorded&&meta.overrides?.some(v=>!v.locked&&v.wordId===pending.event.domain+':'+pending.event.term&&v.senseKey===pending.event.senseKey)){await store.updateMeta(m=>({...m,revision:(m.revision||0)+1,pending:null,overrides:m.overrides.filter(v=>v.locked||v.wordId!==pending.event.domain+':'+pending.event.term||v.senseKey!==pending.event.senseKey)}));await reload();}if(recorded&&config.personalization)void engine.analyze().catch(()=>{});return recorded;}));},
    async offer(sender,items,result){await report(()=>serial(async()=>{const page=await allowed(sender);if(!page)return;const all=await sessions(),row=await pageSession(sender,page,all);for(const item of result.items||[]){const input=items.find(v=>v.id===item.id);if(!input)continue;for(const target of item.targets||[item.target]){if(!target||target.stage==='quiet')continue;const id=crypto.randomUUID();target.historyId=id;row.offers[id]={at:Date.now(),event:{id,type:'annotation',at:Date.now(),sessionId:row.id,domain:input.domain,term:target.text,kind:target.text?.includes(' ')?'phrase':'word',sentence:bounded(input.sentence,2000),translation:bounded(target.translation,1200),senseKey:target.senseKey||'',source:target.personal?'personal':'system',stage:target.stage}};}}row.offers=Object.fromEntries(Object.entries(row.offers).slice(-128));await saveSessions(all);}));return result;},
    async annotation(message,sender){return report(()=>serial(async()=>{const page=await allowed(sender,true);if(!page)return false;const all=await sessions(),row=all[page.tabId],offer=row?.offers?.[message.id];if(!['hint','mark'].includes(message.stage)||!offer||row.epoch!==config.epoch||row.sourceHash!==page.sourceHash||row.documentId!==(sender.documentId||null)||offer.at<Date.now()-600000)return false;const sig=await digest(JSON.stringify([offer.event.domain,offer.event.term,offer.event.sentence]));if(row.shown.includes(sig))return false;if(!await store.append({...offer.event,stage:message.stage}))return false;row.shown=[...row.shown,sig].slice(-2000);delete row.offers[message.id];await saveSessions(all);return true;}));},
    async remove(id){await serial(async()=>{await api.invalidateOutsideQueue();await store.remove(id);await reload();await onChange();});return snapshot();},
    async editSummary(id,value){await serial(async()=>{await api.invalidateOutsideQueue();await store.editSummary(id,value);await reload();await onChange();});return snapshot();},
    async invalidateOutsideQueue(){await ready;const next={...config,epoch:config.epoch+1};await storage.set({[CONFIG]:next});config=next;await clearPendingSessions();},
    async clear({notify=true}={}){await ready;await serial(async()=>{await api.invalidateOutsideQueue();await store.clear();await session.remove(SESSIONS);await reload();problem='';if(notify)await onChange();});return {cleared:true};},
    async export(){await ready;return {config:{...config},...await store.snapshot({days:0,limit:Number.MAX_SAFE_INTEGER}),personalization:await store.meta()};},
    async personalization(){await ready;const current=await state(),provider=current.settings.providerKind==='api'?current.settings.apiServices.find(v=>v.id===current.settings.activeApiServiceId):null;return {...await engine.snapshot(),config:{...config},serviceLabel:current.settings.providerKind==='api'?(provider?provider.name+' · '+provider.model:'未配置 API 服务'):current.settings.providerKind==='grok'?('Grok · '+(current.settings.subscriptionModel||'默认模型')):current.settings.providerKind==='antigravity'?('Google · '+(current.settings.subscriptionModel||'默认模型')):'ChatGPT · '+(current.settings.subscriptionModel||'默认模型')};},
    async operate(method,value){await ready;if(method==='setOverride')await storage.set({[CONFIG]:config});await engine[method](value);await reload();return api.personalization();},
  };
  return api;
}
