/**
 * @file 网页轻量引导：未启用阅读时只回答状态，用户操作后由后台补注入阅读引擎。
 * 模块边界：classic 主框架脚本；不扫描正文、不轮询、不持有后台连接。
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
(()=>{
  // 扩展重载或更新后，同一隔离世界里会留下旧引导的全局标记，但它的消息监听已随旧上下文失效；
  // 只在旧引导仍然活着时跳过，否则重新接管（与 content.js 的 isAlive 同理）。
  const runtime=chrome.runtime;
  if(globalThis.__ROAMCAT_BOOTSTRAP__?.alive?.())return;
  globalThis.__ROAMCAT_BOOTSTRAP__={alive:()=>{try{return Boolean(runtime?.id);}catch{return false;}}};
  let flight=null,paused=false,assistanceMode='ambient';
  const commands=new Set(['SS_SET_ENABLED','SS_SET_SENTENCE_GROUPS','SS_CONTEXT_HELP','SS_EMERGENCY_START','SS_EMERGENCY_TOGGLE']);
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id||globalThis.__ROAMCAT_CONTENT__?.isAlive?.())return false;
    if(message?.type==='SS_AUTO_START'){paused=Boolean(message.paused);assistanceMode=message.assistanceMode||assistanceMode;}
    const active=message?.type==='SS_AUTO_START'&&(message.reading||message.video||message.sentenceGroups);
    if(active||commands.has(message?.type)){
      flight??=chrome.runtime.sendMessage({type:'ENSURE_PAGE_UI'}).then(reply=>{if(!reply?.ok)throw new Error(reply?.error||'RoamCat could not start');}).finally(()=>{flight=null;});
      void flight.then(()=>globalThis.__ROAMCAT_CONTENT__.dispatch(message)).then(respond,error=>respond({ok:false,error:error.message}));return true;
    }
    if(message?.type==='SS_STATUS'||message?.type==='SS_AUTO_START'){
      respond({ok:true,data:{enabled:false,paused,assistanceMode,domain:'general',count:0,pageSynced:true,providerConfigured:false,noReadingRoot:false,failed:false,automaticReady:false,emergency:{phase:'off',active:false},sentenceGroups:{enabled:false,density:'medium',lineStyle:'solid',status:'off',error:'',processed:0}}});return false;
    }
    return false;
  });
})();
