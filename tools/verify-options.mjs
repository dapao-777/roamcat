/**
 * @file tools/verify-options.mjs
 * 文件职责：设置页行为门禁（npm run verify:options）——本地 HTTP 服务 dist/extension 并注入模拟 chrome.*，
 *   只断言控制器行为：句子粒度保存与失败回滚、查词按键、视频与直播（字幕样式保存、预览与失败回滚）、阅读记录、宣言弹层、
 *   模型列表、恢复默认阅读偏好、服务商思考等级。
 * 主要内容：在无头 ego lite（不加载扩展）里打开 http://127.0.0.1 上的 ui/options.html；模拟的 chrome.* 只存页面 localStorage，
 *   不碰扩展真实数据；页面向本地服务以外发起的请求记进报告。截图与多宽度溢出由 verify:ui 负责。
 * 模块边界：普通 Node 运行，先 npm run build；报告写 preview/verification.json。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DIST, assertFreshDist, openBrowser, previewPath, staticServer} from './lib/ego.mjs';
import {printGateSummary} from './lib/gate-report.mjs';

function mockChrome(){
  const read=()=>JSON.parse(localStorage.getItem('qa-settings')||'null')||{assistanceMode:'ambient',lookupDisplay:'card',lookupKey:'D',helpLanguage:'zh',domain:'auto',providerKind:'chatgpt',automation:{sites:[]},customTerms:[],domainRules:[],apiServices:[],domainDetection:{mode:'local',api:{}}};
  const events=[];window.qa={events,failDensity:false};
  const listeners=[];
  const local={get:async(keys,callback)=>{const data={sentenceGroupsDensity:localStorage.getItem('qa-density')||'medium',sentenceGroupsLineStyle:'solid'};callback?.(data);return data;},set:async()=>{}};
  window.chrome={storage:{local,onChanged:{addListener:fn=>listeners.push(fn)}},permissions:{contains:async()=>true,getAll:async()=>({origins:[]})},runtime:{id:'roamcat-ui-test',getURL:p=>location.origin+'/'+p,onMessage:{addListener(){}},sendMessage:async message=>{
    events.push(message);let data={};
    switch(message.type){
      case 'STATE_GET':data={settings:read(),subscription:{connected:false}};break;
      case 'STATE_PATCH':{if(window.qa.failPatch)return {ok:false,error:'模拟配置保存失败'};const settings={...read(),...message.patch};localStorage.setItem('qa-settings',JSON.stringify(settings));data={settings,subscription:{connected:false}};break;}
      case 'AUTOMATION_GET':data={automation:read().automation};break;
      case 'SUBSCRIPTION_STATUS':data={connected:false};break;
      case 'MODELS_LIST':data={models:[]};break;
      case 'API_MODELS_LIST':await new Promise(r=>setTimeout(r,window.qa.modelDelay||0));window.qa.modelsDone=(window.qa.modelsDone||0)+1;data={models:[{id:'fixture-model',name:'Fixture model'}]};break;
      case 'VIDEO_SETTINGS_PATCH':{if(window.qa.failVideo)return {ok:false,error:'模拟视频设置保存失败'};const settings=read();settings.video={...settings.video,...message.patch};localStorage.setItem('qa-settings',JSON.stringify(settings));data={video:settings.video};break;}
      case 'SENTENCE_GROUPS_DENSITY_SET':if(window.qa.failDensity)return {ok:false,error:'模拟保存失败'};localStorage.setItem('qa-density',message.density);data={density:message.density};break;
      case 'HISTORY_GET':{const daily=Array.from({length:14},(_,i)=>({day:new Date(Date.now()-(13-i)*86400000).toISOString().slice(0,10),activeMs:(i%4===0?0:(i+3)*60000),terms:i*2,sentences:i%4}));data={config:{enabled:true,startedAt:Date.now()-14*86400000,origins:[]},events:[],rules:[],summaries:[],daily,metrics:{activeMs:7200000,words:8400,terms:48,queries:62,sentences:12}};break;}
    }
    return {ok:true,data};
  }}};
}

assertFreshDist();
const server=await staticServer(DIST);const base=server.base;
const report={checks:[],errors:[],externalRequests:[]};
const run=await openBrowser({extension:null});
try{
  const page=run.page;
  await page.setViewportSize({width:1440,height:1000},1);
  await page.addInitScript(mockChrome);await page.addInitScript(()=>localStorage.setItem('roamcat_ui_theme','light'));
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('request',req=>{const url=req.url();if(/^https?:/.test(url)&&!url.startsWith(base))report.externalRequests.push(url);});
  // 句子粒度：设置页只在「显示与解构」保留单选组，保存走 SENTENCE_GROUPS_DENSITY_SET。
  const density=()=>page.locator('input[name="sentence-density"]:checked').inputValue();
  const pickDensity=value=>page.locator(`label:has(input[name="sentence-density"][value="${value}"])`).click();
  // 控制器在首帧后动态加载，同步完状态才写 window.optionsState：以它为「页面就绪」，不靠固定等待。
  const ready=()=>page.waitForFunction(()=>Boolean(window.optionsState),undefined,{timeout:10000});
  const until=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:5000});
  await page.goto(base+'/ui/options.html#appearance');await ready();
  assert.equal(await density(),'medium');
  await pickDensity('fine');await page.waitForFunction(()=>localStorage.getItem('qa-density')==='fine');
  await page.reload();await ready();assert.equal(await density(),'fine');
  report.checks.push('Density radios save through existing message and survive reload');
  await page.evaluate(()=>{window.qa.failDensity=true;});await pickDensity('coarse');await until(()=>document.querySelector('#sentence-density-result')?.textContent==='模拟保存失败');
  assert.equal(await density(),'fine');
  assert.equal(await page.locator('input[name="sentence-density"][value="coarse"]').isDisabled(),false);
  assert.equal(await page.locator('#sentence-density-result').textContent(),'模拟保存失败');
  report.checks.push('Failed density save rolls radios back, re-enables them, and shows local error feedback');
  await page.evaluate(()=>{window.qa.failDensity=false;});
  await page.goto(base+'/ui/options.html#assistance');await ready();
  await page.locator('#lookup-key').selectOption('F');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('qa-settings')).lookupKey==='F');
  await page.reload();await ready();assert.equal(await page.locator('#lookup-key').inputValue(),'F');
  await page.locator('#lookup-key').selectOption('D');await until(()=>JSON.parse(localStorage.getItem('qa-settings')).lookupKey==='D');
  report.checks.push('Lookup hotkey saves and survives reload');
  // 视频与直播：分段选择与开关经 VIDEO_SETTINGS_PATCH 保存，预览跟着变；保存失败时退回原值并提示。
  const videoPick=(name,value)=>page.locator(`label:has(input[name="${name}"][value="${value}"])`).click();
  const savedVideo=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('qa-settings')).video||{});
  await page.goto(base+'/ui/options.html#video');await ready();
  assert.equal(await page.locator('input[name="video-font-size"]:checked').inputValue(),'20');
  await videoPick('video-translation-color','cyan');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('qa-settings')).video?.translationColor==='cyan');
  assert.equal(await page.locator('#video-caption-preview').evaluate(el=>el.dataset.color),'cyan');
  await page.locator('label.switch:has(#video-blur)').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('qa-settings')).video?.blur===true);
  await page.reload();await ready();
  assert.equal(await page.locator('input[name="video-translation-color"]:checked').inputValue(),'cyan');assert.equal(await page.locator('#video-blur').isChecked(),true);
  assert.equal(await page.locator('#video-caption-preview').evaluate(el=>el.dataset.blur),'true');
  await page.evaluate(()=>{qa.failVideo=true;});await videoPick('video-font-size','28');await until(()=>/模拟视频设置保存失败/.test(document.querySelector('#global-error')?.textContent||''));
  assert.equal(await page.locator('input[name="video-font-size"]:checked').inputValue(),'20');assert.equal((await savedVideo()).fontSize,undefined);
  assert.match(await page.locator('#global-error').textContent(),/模拟视频设置保存失败/);
  await page.evaluate(()=>{qa.failVideo=false;});
  report.checks.push('Video section saves caption style through VIDEO_SETTINGS_PATCH, updates the preview, survives reload, and rolls back on failure');
  await page.evaluate(s=>{location.hash='#'+s},'history');await until(()=>document.querySelectorAll('.history-bar').length>0);
  // 阅读记录不再分子标签：统计、记录、记录设置同页可见。
  assert.equal(await page.evaluate(()=>['history-view-stats','history-view-records','history-view-settings'].every(id=>!document.getElementById(id).hidden)&&!document.querySelector('#history .section-tabs')),true);
  assert.equal(await page.locator('.history-bar').count()>0,true);
  await page.evaluate(s=>{location.hash='#'+s},'assistance');await page.locator('#sidebar-stamp-card').click();assert.equal(await page.locator('#stamp-manifesto-modal').evaluate(el=>el.open),true);
  await page.locator('#stamp-modal-close').click();assert.equal(await page.locator('#stamp-manifesto-modal').evaluate(el=>el.open),false);
  report.checks.push('History stats render fixture data; manifesto dialog opens and closes');
  report.checks.push('History visualization renders fixture data only; no user history read or modified');
  await page.goto(base+'/ui/options.html');
  await page.evaluate(()=>{const settings=JSON.parse(localStorage.getItem('qa-settings'));Object.assign(settings,{providerKind:'api',activeApiServiceId:'fixture',apiServices:[{id:'fixture',name:'Fixture',providerId:'openai-compatible',baseUrl:'http://127.0.0.1/v1',model:'fixture-model',apiKey:'fake-local-test-key',options:{}}]});localStorage.setItem('qa-settings',JSON.stringify(settings));});
  await page.reload();await ready();assert.equal(await page.evaluate(()=>qa.events.some(e=>e.type==='SUBSCRIPTION_STATUS')),false);report.checks.push('API-only settings do not contact subscription connector');
  await page.evaluate(s=>{location.hash='#'+s},'service');await page.locator('#api-editor').evaluate(e=>e.open=true);await page.locator('#list-provider-models').click();await until(()=>document.querySelectorAll('#provider-model-list option[value="fixture-model"]').length===1);assert.equal(await page.locator('#provider-model-list option[value="fixture-model"]').count(),1);
  await page.locator('#provider-key').fill('changed-fixture-key');assert.equal(await page.locator('#provider-model-list option').count(),1);
  const modelsDone=await page.evaluate(()=>{qa.modelDelay=350;return qa.modelsDone||0;});await page.locator('#list-provider-models').click();await page.locator('#provider-key').fill('newer-fixture-key');await until(done=>(qa.modelsDone||0)>done,modelsDone);await page.settle();assert.equal(await page.locator('#provider-model-list option').count(),1);assert.match(await page.locator('#provider-result').textContent(),/配置已更改/);report.checks.push('Model list stays visible after fetch; credential edits clear old choices and discard late responses');
  await page.evaluate(()=>{const settings=JSON.parse(localStorage.getItem('qa-settings'));Object.assign(settings,{assistanceMode:'on-demand',lookupDisplay:'annotation',lookupKey:'F'});localStorage.setItem('qa-settings',JSON.stringify(settings));});
  await page.goto(base+'/ui/options.html#privacy');await page.reload();await ready();await page.evaluate(()=>{qa.events.length=0;qa.failPatch=true;});page.once('dialog',d=>d.accept());await page.locator('#reset-config').click();await until(()=>qa.events.some(e=>e.type==='STATE_PATCH')&&!document.querySelector('#reset-config').disabled);assert.equal(await page.locator('#lookup-key').inputValue(),'F');assert.equal(await page.locator('#reset-config').isDisabled(),false);assert.equal(await page.evaluate(()=>qa.events.filter(e=>e.type==='STATE_PATCH').length),1);assert.equal(await page.evaluate(()=>qa.events.some(e=>e.type==='SENTENCE_GROUPS_DENSITY_SET')),false);
  await page.evaluate(()=>{qa.events.length=0;qa.failPatch=false;});page.once('dialog',d=>d.accept());await page.locator('#reset-config').click();await until(()=>document.querySelector('#lookup-key').value==='D');assert.equal(await page.locator('#lookup-key').inputValue(),'D');assert.equal(await page.evaluate(()=>qa.events.filter(e=>e.type==='STATE_PATCH').length),1);report.checks.push('Reset saves preferences together; failed save preserves controls and does not change density');
  await page.evaluate(()=>{const settings=JSON.parse(localStorage.getItem('qa-settings'));Object.assign(settings,{providerKind:'api',activeApiServiceId:'sn',apiServices:[{id:'sn',name:'SenseNova',providerId:'sensenova',baseUrl:'https://token.sensenova.cn/v1',model:'sensenova-6.8-flash-lite',apiKey:'fake-local-test-key',options:{channel:'tokenplan',reasoningEffort:'medium'}},{id:'zp',name:'GLM',providerId:'zhipu',baseUrl:'https://open.bigmodel.cn/api/paas/v4',model:'glm-5.3',apiKey:'fake-local-test-key',options:{channel:'open',reasoningEffort:'high'}}]});localStorage.setItem('qa-settings',JSON.stringify(settings));});
  await page.goto(base+'/ui/options.html#service');await page.reload();await ready();await page.locator('#api-editor').evaluate(e=>e.open=true);
  const effort=page.locator('#provider-fields [data-provider-option="reasoningEffort"]'),levelValues=()=>effort.locator('option').evaluateAll(list=>list.map(o=>o.value)),model=page.locator('#provider-model');
  assert.equal(await effort.inputValue(),'medium');assert.deepEqual(await levelValues(),['none','low','medium','high','max']);assert.equal(await effort.isVisible(),true);
  await page.locator('#provider-fields [data-provider-option="channel"]').selectOption('sensecore');assert.equal(await effort.isVisible(),false);
  await page.locator('#provider-fields [data-provider-option="channel"]').selectOption('tokenplan');assert.equal(await effort.isVisible(),true);assert.equal(await effort.inputValue(),'medium');
  await model.fill('sensenova-u1.5-lite');assert.equal(await effort.isVisible(),false);
  await model.fill('deepseek-v4-flash');assert.deepEqual(await levelValues(),['none','low','high','max']);assert.equal(await effort.inputValue(),'none');
  page.once('dialog',d=>d.accept());await page.locator('#api-service-select').selectOption('zp');await page.afterAction();await until(()=>document.querySelector('#provider-fields [data-provider-option="reasoningEffort"]')?.value==='high');
  assert.equal(await effort.inputValue(),'high');assert.deepEqual(await levelValues(),['low','high','max']);
  await model.fill('glm-4.7-flash');assert.deepEqual(await levelValues(),['none','on']);assert.equal(await effort.inputValue(),'none');
  await model.fill('glm-5.3');assert.equal(await effort.inputValue(),'max');
  report.checks.push('Thinking level lists only the official levels of the selected model, follows model and channel changes, and falls back to the model default');
  await page.pump();
  assert.deepEqual(report.errors,[],'页面脚本错误');
  fs.mkdirSync(previewPath(),{recursive:true});fs.writeFileSync(previewPath('verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(e){
  console.error(e);process.exitCode=1;
}finally{await run.close();await server.close();}
printGateSummary('options',report.checks.length,process.exitCode?1:0);
