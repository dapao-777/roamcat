/**
 * @file extension/subscription.js
 * 文件职责：三订阅端口管理——请求响应映射、超时与进度转发。
 * 主要内容：assist/翻译/总结120s其余45s；端口单例，断开拒全部在途。
 *   probe 在端口还在时只查状态，不拆连接；没有端口时才走 refresh。
 * 模块边界：应用层；CONNECTOR_KINDS与message-protocol镜像一致（单测 guard）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {
  normalizeSupportProviderItems,normalizeSupportAttempt,normalizeSupportCorrections,normalizePreparationContext,
  normalizeAssistanceRequest,normalizeAssistanceResult,
  normalizeEmergencyItems,normalizeEmergencyResult,normalizePageTranslationItems,normalizePageTranslationResult,
  normalizePageSummaryResult,
} from './gloss.mjs';
import {sanitizeDiagnostic,diagnosticError,validTraceId} from './diagnostics.mjs';
import {normalizeSentenceGroupItems,normalizeSentenceGroupsResult} from './sentence-groups.mjs';
import {normalizeTranslationProgress} from './assistance-stream.mjs';

const M=(zh,en)=>globalThis.RoamCatI18n?.lang?.()==='en'?en:zh;

// 连接器的已分类错误形如“中文提示（category; 细节…）”。按类别查 i18n 双语典回译，
// 已装的旧版连接器同样适用；连接器侧消息保持中文，其 AUTH_FAILURE 判定不受影响。
const CONNECTOR_NAMES={chatgpt:{product:'Codex',account:'ChatGPT'},grok:{product:'Grok',account:'Grok'},antigravity:{product:'Antigravity',account:'Google'}};
export function localizeConnectorError(text,kind){
  const match=typeof text==='string'?/（([a-z_]+)((?:; [^（）]*)?)）$/.exec(text):null;
  const t=globalThis.RoamCatI18n?.t;
  if(!match||typeof t!=='function')return text;
  const names=CONNECTOR_NAMES[kind]||CONNECTOR_NAMES.chatgpt;
  const key=[`conn.err.${match[1]}.${kind}`,`conn.err.${match[1]}`].find(k=>t(k)!==k);
  if(!key)return text;
  const details=match[1]+match[2];
  return t(key,names)+M('（'+details+'）',' ('+details+')');
}

export const SUBSCRIPTION_KINDS = Object.freeze(['chatgpt','grok','antigravity']);
export function isSubscriptionKind(kind) { return kind === 'chatgpt' || kind === 'grok' || kind === 'antigravity'; }
export function nativeKind(settings) { return settings?.providerKind === 'grok' ? 'grok' : settings?.providerKind === 'antigravity' ? 'antigravity' : 'chatgpt'; }

const diagnosticListeners=new Set();
export function onNativeDiagnostic(listener){diagnosticListeners.add(listener);}
export async function syncNativeDiagnostics(payload,kind){
  const targets=kind? [connector(kind)] : [connectors.chatgpt, connectors.grok, connectors.antigravity].filter(item=>item.state.port);
  if(!targets.length)return false;
  const results=await Promise.all(targets.map(item=>item.send('diagnostics',payload).then(result=>result?.storageError!==true).catch(()=>false)));
  return results.some(Boolean);
}

// 本机常驻连接服务（connector/service.mjs）：优先经 WebSocket 连它，不依赖浏览器的 NativeMessaging 注册；
// 没装、没运行或拒绝本扩展时立刻改用 connectNative，并在 SERVICE_RETRY_MS 内直接走浏览器连接器，不反复试探。
export const SERVICE_URL = 'ws://127.0.0.1:47821/v1/connect?backend=';
const SERVICE_OPEN_TIMEOUT_MS = 1500;
const SERVICE_RETRY_MS = 60000;
let serviceDownUntil = 0;

// 返回与 chrome.runtime.Port 同形的对象（postMessage / disconnect / onMessage / onDisconnect），
// 多两个只读信息：transport（'service' | 'native'）与 disconnectReason（断开原因原文）。
export function openTransport(kind, host) {
  const messageListeners = [], disconnectListeners = [], queue = [];
  let active = null, done = false;
  const port = {
    transport: null,
    disconnectReason: '',
    postMessage(message) { if (done) throw new Error('disconnected'); if (active) active.post(message); else queue.push(message); },
    disconnect() { if (done) return; done = true; active?.close(); },
    onMessage: {addListener: listener => messageListeners.push(listener)},
    onDisconnect: {addListener: listener => disconnectListeners.push(listener)},
  };
  const emit = message => { for (const listener of messageListeners) listener(message); };
  const fail = reason => { if (done) return; done = true; port.disconnectReason = reason; for (const listener of disconnectListeners) listener(); };
  const useNative = () => {
    let native;
    try { native = chrome.runtime.connectNative(host); }
    catch (error) { queueMicrotask(() => fail(String(error?.message || error))); return; }
    port.transport = 'native';
    native.onMessage.addListener(emit);
    native.onDisconnect.addListener(() => fail(chrome.runtime.lastError?.message || ''));
    active = {post: message => native.postMessage(message), close: () => native.disconnect()};
    for (const message of queue.splice(0)) native.postMessage(message);
  };
  if (typeof WebSocket !== 'function' || Date.now() < serviceDownUntil) { useNative(); return port; }
  let socket;
  try { socket = new WebSocket(SERVICE_URL + encodeURIComponent(kind)); }
  catch { serviceDownUntil = Date.now() + SERVICE_RETRY_MS; useNative(); return port; }
  let opened = false;
  const giveUp = () => { serviceDownUntil = Date.now() + SERVICE_RETRY_MS; if (!done) useNative(); };
  const timer = setTimeout(() => {
    if (opened) return;
    socket.onclose = socket.onerror = socket.onopen = socket.onmessage = null;
    try { socket.close(); } catch { /* 还没连上 */ }
    giveUp();
  }, SERVICE_OPEN_TIMEOUT_MS);
  socket.onopen = () => {
    opened = true;
    clearTimeout(timer);
    if (done) { socket.close(); return; }
    port.transport = 'service';
    active = {post: message => socket.send(JSON.stringify(message)), close: () => socket.close()};
    for (const message of queue.splice(0)) socket.send(JSON.stringify(message));
  };
  socket.onmessage = event => { let message; try { message = JSON.parse(event.data); } catch { return; } emit(message); };
  socket.onerror = () => {};
  socket.onclose = event => {
    clearTimeout(timer);
    if (!opened) { giveUp(); return; }
    fail(`local service closed (${event.code})`);
  };
  return port;
}

// stage 给设置页的分步清单用：install=找不到连接器注册，start=连接器起不来（Node/CLI 不可用），
// login=已连上待登录，ready=已登录，unknown=尚未检测或被主动断开。
const STAGES = new Set(['install','start','login','ready','unknown']);
const DISCONNECTED = {connected:false,authenticated:false,email:null,plan:null,loginPending:false,userCode:null,authFailed:null,error:null,stage:'unknown'};

function createConnector({kind,host,label,cliName,loginHosts}) {
  const state = {
    status:{...DISCONNECTED},
    port:null,
    sequence:0,
    attempted:false,
    initialStatus:null,
    refreshInFlight:null,
    pending:new Map(),
    listeners:new Set(),
  };
  // 错误串在取快照时才按当前界面语言回译，切换语言后无需等连接器重报。
  function snapshot() { return {...state.status,error:localizeConnectorError(state.status.error,kind)}; }
  function update(value) {
    const next = {
      connected:value?.connected === true,
      authenticated:value?.connected === true && value?.authenticated === true,
      email:typeof value?.email === 'string' ? value.email.slice(0,320) : null,
      plan:typeof value?.plan === 'string' ? value.plan.slice(0,100) : null,
      loginPending:value?.loginPending === true,
      userCode:typeof value?.userCode === 'string' ? value.userCode.replace(/[^A-Za-z0-9-]/g,'').slice(0,32) : null,
      authFailed:typeof value?.authFailed === 'boolean' ? value.authFailed : null,
      error:typeof value?.error === 'string' ? value.error.slice(0,600) : null,
      // 当前连接走的是本机常驻服务还是浏览器连接器，设置页与诊断用来说明连接方式。
      transport:value?.connected === true ? state.port?.transport ?? null : null,
    };
    next.stage = next.connected ? (next.authenticated ? 'ready' : 'login') : STAGES.has(value?.stage) ? value.stage : 'unknown';
    if (JSON.stringify(next) === JSON.stringify(state.status)) return;
    state.status = next;
    for (const listener of state.listeners) listener(snapshot());
  }
  function disconnect(connection, error) {
    if (state.port !== connection) return;
    state.port = null;
    for (const {reject,timer} of state.pending.values()) { clearTimeout(timer); reject(error); }
    state.pending.clear();
    update({...DISCONNECTED,error:error.message,stage:error.stage});
  }
  function connection() {
    if (state.port) return state.port;
    state.attempted = true;
    const current = openTransport(kind, host);
    state.port = current;
    current.onDisconnect.addListener(() => {
      const reason = current.disconnectReason || chrome.runtime.lastError?.message || '';
      const missing = /not found|not registered|forbidden/i.test(reason);
      // 附上浏览器给的原始原因：同样是“找不到”，注册缺失、清单损坏和来源未授权要分开排查。
      const raw = reason ? `（${reason.slice(0,160)}）` : '';
      const error = new Error(missing
        ? M(`未找到或未授权本地 ${label} 连接器，请按设置页“模型服务”里的步骤安装。${raw}`,`No authorized local ${label} connector found. Install it following the steps under Settings → Model service. ${raw}`)
        : M(`本地 ${label} 连接器没能启动或已断开。请确认 Node.js 和 ${cliName} 可用，再重新运行安装命令。${raw}`,`The local ${label} connector did not start or disconnected. Make sure Node.js and ${cliName} are available, then rerun the install command. ${raw}`));
      error.stage = missing ? 'install' : 'start';
      disconnect(current,error);
    });
    current.onMessage.addListener(message => {
      if (state.port !== current) return;
      if (message?.event === 'status') { update(message.data); return; }
      if(message?.event==='diagnostic'){const record=sanitizeDiagnostic(message.data);if(record)for(const listener of diagnosticListeners)listener(record);return;}
      const request = state.pending.get(message?.id);
      if (!request) return;
      if(message?.event==='assistProgress'||message?.event==='translationProgress'){
        const expected=message.event==='assistProgress'?'assist':'emergencyTranslate';
        if(request.type!==expected||typeof request.onProgress!=='function')return;
        Promise.resolve().then(()=>{if(state.pending.get(message.id)===request)return request.onProgress(message.data);}).catch(()=>{});
        return;
      }
      clearTimeout(request.timer);
      state.pending.delete(message.id);
      if (message.ok === true) request.resolve(message.data);
      else {
        const error = typeof message.error === 'string' ? message.error.slice(0,600) : M('本地连接器返回了无效响应。','The local connector returned an invalid response.');
        const reported=new Error(/不支持的连接器请求|unsupported request/i.test(error)?M('本地连接器版本过旧，请重新运行安装命令后刷新连接。','The local connector is outdated; rerun the install command, then refresh the connection.'):localizeConnectorError(error,kind));
        const detail=diagnosticError({code:message.code,detail:message.detail,message:error});reported.code=detail.code;reported.detail=detail;request.reject(reported);
      }
    });
    return current;
  }
  function send(type,payload = {},traceId,onProgress) {
    return new Promise((resolve,reject) => {
      if (state.pending.size >= 16) { reject(new Error(M(`本地 ${label} 连接器正忙，请稍后再试。`,`The local ${label} connector is busy; please retry shortly.`))); return; }
      let current;
      try { current = connection(); } catch { reject(new Error(M(`无法启动本地 ${label} 连接器，请检查安装。`,`Cannot start the local ${label} connector; please check the installation.`))); return; }
      const id = ++state.sequence;
      const timer = setTimeout(() => {
        disconnect(current,new Error(type === 'assist' ? M(`${label} 订阅帮助超时，已断开连接并停止请求。请刷新连接后重试。`,`${label} subscription help timed out; disconnected and request stopped. Refresh the connection and retry.`) : type === 'emergencyTranslate' ? M(`${label} 订阅翻译超时，已断开连接并停止请求。请刷新连接后重试。`,`${label} subscription translation timed out; disconnected and request stopped. Refresh the connection and retry.`) : M(`本地 ${label} 连接器没有及时响应，请刷新连接后重试。`,`The local ${label} connector did not respond in time; refresh the connection and retry.`)));
        current.disconnect();
      },['assist','emergencyTranslate','summarize'].includes(type) ? 120000 : 45000);
      state.pending.set(id,{resolve,reject,timer,type,onProgress});
      try { current.postMessage({id,type,payload,...(validTraceId(traceId)?{traceId}:{})}); }
      catch {
        disconnect(current,new Error(M(`无法向本地 ${label} 连接器发送消息，请刷新连接后重试。`,`Cannot send messages to the local ${label} connector; refresh the connection and retry.`)));
        current.disconnect();
      }
    });
  }
  function refresh() {
    if (state.refreshInFlight) return state.refreshInFlight;
    state.attempted = true;
    state.refreshInFlight = (async () => {
      const previous = state.port;
      if (previous) {
        disconnect(previous,new Error(M('连接已刷新，请重新求助。','The connection was refreshed; please ask again.')));
        previous.disconnect();
      }
      try { update(await send('status')); }
      catch (error) { update({...DISCONNECTED,error:error.message,stage:error.stage}); }
      return snapshot();
    })().finally(() => { state.refreshInFlight = null; });
    return state.refreshInFlight;
  }
  // 设置页轮询用：已连上时只问一次 status，避免每 5 秒拆掉端口、打断在途请求。
  function probe() {
    if (state.refreshInFlight) return state.refreshInFlight;
    if (!state.port) return refresh();
    state.refreshInFlight = (async () => {
      try { update(await send('status')); }
      catch (error) { update({...DISCONNECTED,error:error.message,stage:error.stage}); }
      return snapshot();
    })().finally(() => { state.refreshInFlight = null; });
    return state.refreshInFlight;
  }
  async function ensure() {
    if (!state.attempted) state.initialStatus = refresh();
    if (state.initialStatus) { await state.initialStatus; state.initialStatus = null; }
    return snapshot();
  }
  async function login() {
    const result = await send('login');
    let url;
    try { url = new URL(result?.authUrl); } catch { throw new Error(M('连接器未返回有效的官方登录地址。','The connector did not return a valid official login URL.')); }
    if (url.protocol !== 'https:' || !loginHosts.has(url.hostname) || url.port || url.username || url.password) {
      await send('cancel');
      throw new Error(M('已拒绝非官方登录地址。','A non-official login URL was rejected.'));
    }
    try { await chrome.tabs.create({url:url.href}); }
    catch { await send('cancel'); throw new Error(M('无法打开登录页面，请重试。','Could not open the login page; please retry.')); }
    if (typeof result?.userCode === 'string' && result.userCode) update({...state.status, loginPending:true, userCode:result.userCode});
    return snapshot();
  }
  async function cancel() {
    update(await send('cancel'));
    return snapshot();
  }
  async function logout() {
    update(await send('logout'));
    return snapshot();
  }
  return {state, snapshot, update, send, refresh, probe, ensure, login, cancel, logout};
}

const connectors = {
  chatgpt: createConnector({
    kind:'chatgpt',
    host:'com.roamcat.translate',
    label:'ChatGPT',
    cliName:'Codex',
    loginHosts:new Set(['auth.openai.com']),
  }),
  grok: createConnector({
    kind:'grok',
    host:'com.roamcat.grok',
    label:'Grok',
    cliName:'Grok CLI',
    loginHosts:new Set(['auth.x.ai','accounts.x.ai']),
  }),
  antigravity: createConnector({
    kind:'antigravity',
    host:'com.roamcat.antigravity',
    label:'Google',
    cliName:'Antigravity CLI',
    loginHosts:new Set(['accounts.google.com','auth.google.com','antigravity.google']),
  }),
};

function connector(kind) {
  return kind === 'grok' ? connectors.grok : kind === 'antigravity' ? connectors.antigravity : connectors.chatgpt;
}

export function subscriptionStatus(kind) { return connector(kind).snapshot(); }
export function onSubscriptionStatus(listener,kind) { connector(kind).state.listeners.add(listener); }
export function refreshSubscription(kind) { return connector(kind).refresh(); }
export function probeSubscription(kind) { return connector(kind).probe(); }
export async function ensureSubscription(kind) { return connector(kind).ensure(); }
export async function loginSubscription(kind) { return connector(kind).login(); }
export async function cancelSubscription(kind) { return connector(kind).cancel(); }
export async function logoutSubscription(kind) { return connector(kind).logout(); }

export async function listSubscriptionModels(refresh = false, kind) {
  const result = await connector(kind).send('models',{refresh:refresh === true});
  if (!Array.isArray(result?.models) || result.models.length > 256) throw new Error(M('订阅服务没有返回有效模型列表。','The subscription service did not return a valid model list.'));
  return result.models.map(model => {
    if (!model || typeof model.id !== 'string' || !model.id || typeof model.name !== 'string' || !model.name) throw new Error(M('订阅服务返回的模型信息无效。','The subscription service returned invalid model info.'));
    const item = {id:model.id,name:model.name,isDefault:model.isDefault === true};
    if (model.supportedReasoningEfforts !== undefined) {
      if (!Array.isArray(model.supportedReasoningEfforts) || model.supportedReasoningEfforts.some(value => typeof value !== 'string')) throw new Error(M('订阅服务返回的模型信息无效。','The subscription service returned invalid model info.'));
      item.supportedReasoningEfforts = [...model.supportedReasoningEfforts];
    }
    return item;
  });
}
export async function classifySubscription(text,title,model,traceId,kind) {
  const expected = kind === 'grok' ? 'grok' : kind === 'antigravity' ? 'antigravity' : 'chatgpt';
  const result = await connector(kind).send('classify',{text,title,model},traceId);
  if (!['general','tech','data','finance','medical','legal','design'].includes(result?.domain) || result?.source !== expected) throw new Error(M('订阅服务没有返回有效领域分类。','The subscription service did not return a valid domain classification.'));
  return {domain:result.domain,source:expected};
}
function normalizePreferences(value){
  if(value===undefined||value===null)return null;
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==3||!['detail','terminology','focus'].every(key=>Object.hasOwn(value,key))||!['concise','standard'].includes(value.detail)||!['consistent','contextual'].includes(value.terminology)||!['meaning','usage'].includes(value.focus))throw new Error(M('个性化翻译偏好无效。','Invalid personalized-translation preference.'));
  return {detail:value.detail,terminology:value.terminology,focus:value.focus};
}
export async function supportSubscription(items,model='',article,traceId,preferences,corrections=[],kind) {
  const selected=normalizeSupportProviderItems(items),context=normalizePreparationContext(article),personalization=normalizePreferences(preferences),issues=normalizeSupportCorrections(corrections,selected);
  return normalizeSupportAttempt(await connector(kind).send('supportBatch',{items:selected,model,article:context,corrections:issues,...(personalization?{personalization}:{})},traceId),selected,context);
}
function normalizedAssistProgress(value,request){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const han=/[\u3400-\u9fff\uf900-\ufaff]/u,english=/[A-Za-z]/,result={};
  const validEnglish=(item,max,words=Infinity)=>typeof item==='string'&&item===item.trim()&&item.length>0&&item.length<=max&&english.test(item)&&!han.test(item)&&item.split(/\s+/).length<=words;
  const validChinese=(item,max)=>typeof item==='string'&&item===item.trim()&&item.length>0&&item.length<=max&&han.test(item);
  const definitionValid=request.level==='hint'?validEnglish(value.definition,request.kind==='passage'?240:80,request.kind==='passage'?30:8):validChinese(value.definition,1200);
  if(definitionValid)result.definition=value.definition;
  if(request.kind!=='passage'){
    if(request.level==='hint'?validEnglish(value.meaning,600):validChinese(value.meaning,400))result.meaning=value.meaning;
    if(validChinese(value.sentenceTranslation,2000))result.sentenceTranslation=value.sentenceTranslation;
  }
  return Object.keys(result).length?result:null;
}
export async function assistSubscription(request,model='',traceId,preferences,onProgress,kind) {
  const selected=normalizeAssistanceRequest(request),personalization=normalizePreferences(preferences);
  const progress=typeof onProgress==='function'?value=>{const normalized=normalizedAssistProgress(value,selected);if(normalized)return onProgress(normalized);}:undefined;
  return normalizeAssistanceResult(await connector(kind).send('assist',{...selected,model,...(personalization?{personalization}:{})},traceId,progress),selected);
}
export async function emergencyTranslateSubscription({scope,items,model='',traceId,preferences,onProgress,kind}) {
  if(scope!=='page'&&scope!=='passage')throw new Error(M('翻译范围无效。','Invalid translation scope.'));
  const selected=scope==='page'?normalizePageTranslationItems(items):normalizeEmergencyItems(items),personalization=normalizePreferences(preferences);
  const progress=typeof onProgress==='function'?value=>{const normalized=normalizeTranslationProgress(value,selected)||normalizeTranslationProgress(value?.items?{items:value.items.filter(item=>item&&typeof item.translation==='string').map(item=>({id:item.id,translation:item.translation}))}:null,selected);if(normalized)return onProgress(normalized);}:undefined;
  const result=await connector(kind).send('emergencyTranslate',{scope,items:selected,model,...(personalization?{personalization}:{})},traceId,progress);
  return scope==='page'?normalizePageTranslationResult(result,selected):normalizeEmergencyResult(result,selected);
}
export async function sentenceGroupsSubscription(items,model='',traceId,kind) { const selected=normalizeSentenceGroupItems(items); const value=await connector(kind).send('sentenceGroups',{items:selected,model},traceId); return normalizeSentenceGroupsResult(value,selected); }
export async function historyModelSubscription(kind,payload,model='',traceId,backend) { if(!['summary','personalization'].includes(kind)||!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error(M('历史模型请求无效。','Invalid history-model request.'));
const result=await connector(backend).send('historyModel',{kind,payload,model},traceId);
if(!result||typeof result!=='object'||Array.isArray(result))throw new Error(M('历史模型没有返回有效对象。','The history model did not return a valid object.'));
return result; }
export async function summarizeSubscription({title='',text='',url='',model=''},traceId,kind) {
  const result = await connector(kind).send('summarize',{title,text,url,model},traceId);
  return normalizePageSummaryResult(result);
}

