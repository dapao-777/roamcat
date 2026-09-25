/**
 * @file extension/diagnostic-service.js
 * 文件职责：诊断编排——traceId贯穿、操作白名单、渲染回执与连接器镜像同步。
 * 主要内容：createDiagnostics；只记结构化元数据，不记正文与密钥。
 * 模块边界：应用层；依赖diagnostics.mjs纯规则；被background装配。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {createDiagnosticStore,sanitizeDiagnostic,diagnosticError,validTraceId} from './diagnostics.mjs';
// 导出供单测做镜像校验：OPERATIONS 必须 ⊆ DIAGNOSTIC_OPERATIONS（存储白名单），且每项
// 须为已注册消息类型或合成操作（HISTORY_SUMMARY 由 runHistoryModel 构造，仅走
// diagnostics.run，不经消息路由）；RENDERED 必须 ⊆ OPERATIONS。
export const OPERATIONS=new Set(['PAGE_SUMMARY','SENTENCE_GROUPS_BATCH','HISTORY_SUMMARY','PERSONALIZATION_ANALYZE','ASSIST_COMMIT','ASSIST','SUPPORT_BATCH','PASSAGE_TRANSLATE','EMERGENCY_TRANSLATE','RESOLVE_DOMAIN','PROVIDER_TEST','PREPARED_ASSIST']);
export const RENDERED=new Set(['ASSIST','SUPPORT_BATCH','PASSAGE_TRANSLATE','EMERGENCY_TRANSLATE','PREPARED_ASSIST']);
const RECEIPTS='diagnosticReceipts';
const fingerprint=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
export function createDiagnostics({storage,session,sync,nativeStatus}) {
  let connectionSync=Promise.resolve();
  const store=createDiagnosticStore(storage),traces=new WeakMap();
  let receiptWrites=Promise.resolve(),mirrorWrites=Promise.resolve(),mirror=false,mirrorPending=0;
  const receiptChange=operation=>{const work=receiptWrites.then(operation);receiptWrites=work.catch(()=>{});return work;};
  const mirrorToNative=payload=>{
    if(!nativeStatus().connected||mirrorPending>=64||(payload.action==='append'&&!mirror))return Promise.resolve(false);
    mirrorPending++;
    const work=mirrorWrites.then(async()=>{try{mirror=await sync(payload);return mirror;}catch{mirror=false;return false;}}).finally(()=>{mirrorPending--;});
    mirrorWrites=work;return work;
  };
  const record=async(value,epoch=store.epoch,copy=true)=>{
    const safe=sanitizeDiagnostic(value);if(!safe)return;
    if(await store.record(safe,epoch))if(copy)void mirrorToNative({action:'append',events:[safe]});
  };
  const event=(trace,stage,status,extra={})=>trace?record({...trace.metadata,traceId:trace.traceId,operation:trace.operation,at:Date.now(),stage,status,...extra},trace.epoch):Promise.resolve();
  const service={
    trace:message=>traces.get(message),
    event,
    async run(message,sender,operation){
      if(!OPERATIONS.has(message.type))return operation();
      const trace={traceId:validTraceId(message.traceId)?message.traceId:crypto.randomUUID(),operation:message.type,epoch:store.epoch,at:Date.now(),metadata:{kind:message.kind,level:message.level}};
      delete message.traceId;traces.set(message,trace);
      const lengths=Array.isArray(message.items)?message.items.slice(0,8).map(item=>typeof(item?.text??item?.sentence)==='string'?(item.text??item.sentence).length:0):[typeof(message.context??message.text)==='string'?(message.context??message.text).length:0];
      const expectsRender=Number.isInteger(sender.tab?.id)&&RENDERED.has(message.type);
      await event(trace,'request','start',{inputIds:Array.isArray(message.items)?message.items.slice(0,8).map(item=>item?.id):undefined,expectsRender,batchSize:Array.isArray(message.items)?message.items.length:1,inputChars:lengths.reduce((a,b)=>a+b,0),inputLengths:lengths});
      if(expectsRender)await receiptChange(async()=>{if(trace.epoch!==store.epoch)return;const all=(await session.get(RECEIPTS))[RECEIPTS]||{},live=Object.entries(all).filter(([,row])=>row.at>Date.now()-600000).slice(-127);await session.set({[RECEIPTS]:{...Object.fromEntries(live),[trace.traceId]:{at:Date.now(),tabId:sender.tab.id,documentId:sender.documentId||null,operation:message.type}}});}).catch(()=>{});
      try{const value=await operation();const outputLengths=Array.isArray(value?.items)?value.items.slice(0,8).map(item=>typeof item?.translation==='string'?item.translation.length:0):[];await event(trace,'request','ok',{code:trace.provider?'OK':'LOCAL_RESULT',durationMs:Date.now()-trace.at,outputLengths,outputIds:Array.isArray(value?.items)?value.items.slice(0,8).map(item=>message.items?.some(source=>source.id===item?.id)?item.id:null):undefined});return value;}
      catch(error){const detail=diagnosticError(error),status=['STALE','CANCELLED','NOT_READY'].includes(detail.code)?'cancelled':'error';await event(trace,'request',status,{...detail,durationMs:Date.now()-trace.at});throw error;}
    },
    async provider(trace,kind,model,address,operation){
      if(!trace)return operation();
      trace.provider=true;trace.metadata={...trace.metadata,provider:kind,modelRef:await fingerprint(model||''),providerRef:await fingerprint(address||kind)};
      const at=Date.now();await event(trace,'provider','start');
      try{const value=await operation();await event(trace,'provider','ok',{durationMs:Date.now()-at,...(typeof value==='string'?{outputChars:value.length}:{})});return value;}
      catch(error){await event(trace,'provider','error',{...diagnosticError(error),durationMs:Date.now()-at});throw error;}
    },
    async render(message,sender){
      if(!Number.isInteger(sender.tab?.id)||sender.frameId!==0||!validTraceId(message.traceId)||!['ok','cancelled','error'].includes(message.status))throw new Error('诊断回执无效。');
      let receipt;
      await receiptChange(async()=>{const all=(await session.get(RECEIPTS))[RECEIPTS]||{};receipt=all[message.traceId];if(!receipt||receipt.at<Date.now()-600000||receipt.tabId!==sender.tab.id||(receipt.documentId&&receipt.documentId!==sender.documentId))throw new Error('诊断回执已过期。');delete all[message.traceId];await session.set({[RECEIPTS]:all});});
      await record({at:Date.now(),traceId:message.traceId,operation:receipt.operation,stage:'render',status:message.status,code:message.status==='error'?'RENDER_INVALID':message.status==='cancelled'?'STALE':'OK',durationMs:Date.now()-receipt.at});
      return {recorded:true};
    },
    async fromNative(value){await record(value,store.epoch,false);},
    connected(){connectionSync=connectionSync.then(async()=>{try{const state=await store.snapshot(),pending=(await storage.get('diagnosticNativeClear')).diagnosticNativeClear;await mirrorToNative({action:'configure',enabled:state.enabled});if(pending&&await mirrorToNative({action:'clear'}))await storage.remove('diagnosticNativeClear');}catch{await store.record({operation:'CONNECTION',stage:'connection',status:'error',code:'STORAGE_ERROR'});}});return connectionSync;},
    async snapshot(){const state=await store.snapshot(),pendingClear=(await storage.get('diagnosticNativeClear').catch(()=>({}))).diagnosticNativeClear===true;return {...state,native:{connected:nativeStatus().connected,mirror:nativeStatus().connected&&mirror,pendingClear}};},
    async configure(enabled){await store.configure(enabled);await receiptChange(()=>session.remove(RECEIPTS));await mirrorToNative({action:'configure',enabled});return this.snapshot();},
    async clear(){await store.clear();await receiptChange(()=>session.remove(RECEIPTS));await storage.set({diagnosticNativeClear:true});if(await mirrorToNative({action:'clear'}))await storage.remove('diagnosticNativeClear');return this.snapshot();},
  };
  return service;
}
