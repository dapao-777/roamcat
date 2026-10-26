/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// 设置页行为门禁：本地 HTTP 服务 dist/extension 并注入模拟 chrome.*，只断言控制器行为
// （粒度保存与失败回滚、查词按键、阅读记录、宣言弹层、模型列表、恢复默认阅读偏好、服务商思考等级）；
// 截图与多宽度溢出由 verify-ui-all.cjs（npm run verify:ui）负责。

const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
function loadPlaywright(){try{return require('playwright-core');}catch(first){const override=process.env.PLAYWRIGHT_CORE_PATH;if(override){try{return require(override);}catch{}}throw new Error(`找不到 playwright-core（${first?.message || first}）。请在项目根运行 npm i -D playwright-core，或设置 PLAYWRIGHT_CORE_PATH 指向可用副本。`);}}
const {chromium}=loadPlaywright();
const root=process.env.ROAMCAT_EXTENSION_DIR?path.resolve(process.env.ROAMCAT_EXTENSION_DIR):path.resolve(__dirname,'../dist/extension'),out=path.resolve(__dirname,'../preview');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
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
      case 'API_MODELS_LIST':await new Promise(r=>setTimeout(r,window.qa.modelDelay||0));data={models:[{id:'fixture-model',name:'Fixture model'}]};break;
      case 'SENTENCE_GROUPS_DENSITY_SET':if(window.qa.failDensity)return {ok:false,error:'模拟保存失败'};localStorage.setItem('qa-density',message.density);data={density:message.density};break;
      case 'HISTORY_GET':{const daily=Array.from({length:14},(_,i)=>({day:new Date(Date.now()-(13-i)*86400000).toISOString().slice(0,10),activeMs:(i%4===0?0:(i+3)*60000),terms:i*2,sentences:i%4}));data={config:{enabled:true,startedAt:Date.now()-14*86400000,origins:[]},events:[],rules:[],summaries:[],daily,metrics:{activeMs:7200000,words:8400,terms:48,queries:62,sentences:12}};break;}
    }
    return {ok:true,data};
  }}};
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const report={checks:[],errors:[]};
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  await context.addInitScript(mockChrome);await context.addInitScript(()=>localStorage.setItem('roamcat_ui_theme','light'));
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  // 句子粒度：设置页只在「显示与解构」保留单选组，保存走 SENTENCE_GROUPS_DENSITY_SET。
  const density=()=>page.locator('input[name="sentence-density"]:checked').inputValue();
  const pickDensity=value=>page.locator(`label:has(input[name="sentence-density"][value="${value}"])`).click();
  await page.goto(base+'/ui/options.html#appearance');await page.waitForTimeout(500);
  assert.equal(await density(),'medium');
  await pickDensity('fine');await page.waitForFunction(()=>localStorage.getItem('qa-density')==='fine');
  await page.reload();await page.waitForTimeout(400);assert.equal(await density(),'fine');
  report.checks.push('Density radios save through existing message and survive reload');
  await page.evaluate(()=>{window.qa.failDensity=true;});await pickDensity('coarse');await page.waitForTimeout(200);
  assert.equal(await density(),'fine');
  assert.equal(await page.locator('input[name="sentence-density"][value="coarse"]').isDisabled(),false);
  assert.equal(await page.locator('#sentence-density-result').textContent(),'模拟保存失败');
  report.checks.push('Failed density save rolls radios back, re-enables them, and shows local error feedback');
  await page.evaluate(()=>{window.qa.failDensity=false;});
  await page.goto(base+'/ui/options.html#assistance');await page.waitForTimeout(400);
  await page.locator('#lookup-key').selectOption('F');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('qa-settings')).lookupKey==='F');
  await page.reload();await page.waitForTimeout(400);assert.equal(await page.locator('#lookup-key').inputValue(),'F');
  await page.locator('#lookup-key').selectOption('D');await page.waitForTimeout(150);
  report.checks.push('Lookup hotkey saves and survives reload');
  await page.evaluate(s=>{location.hash='#'+s},'history');await page.locator('#history-view-stats-tab').click();await page.waitForTimeout(150);
  assert.equal(await page.locator('.history-bar').count()>0,true);
  await page.evaluate(s=>{location.hash='#'+s},'assistance');await page.locator('#sidebar-stamp-card').click();assert.equal(await page.locator('#stamp-manifesto-modal').evaluate(el=>el.open),true);
  await page.locator('#stamp-modal-close').click();assert.equal(await page.locator('#stamp-manifesto-modal').evaluate(el=>el.open),false);
  report.checks.push('History stats render fixture data; manifesto dialog opens and closes');
  report.checks.push('History visualization renders fixture data only; no user history read or modified');
  await page.goto(base+'/ui/options.html');
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>{const settings=JSON.parse(localStorage.getItem('qa-settings'));Object.assign(settings,{providerKind:'api',activeApiServiceId:'fixture',apiServices:[{id:'fixture',name:'Fixture',providerId:'openai-compatible',baseUrl:'http://127.0.0.1/v1',model:'fixture-model',apiKey:'fake-local-test-key',options:{}}]});localStorage.setItem('qa-settings',JSON.stringify(settings));});
  await page.reload();await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>qa.events.some(e=>e.type==='SUBSCRIPTION_STATUS')),false);report.checks.push('API-only settings do not contact subscription connector');
  await page.evaluate(s=>{location.hash='#'+s},'service');await page.locator('#api-editor').evaluate(e=>e.open=true);await page.locator('#list-provider-models').click();await page.waitForTimeout(100);assert.equal(await page.locator('#provider-model-list option[value="fixture-model"]').count(),1);
  await page.locator('#provider-key').fill('changed-fixture-key');assert.equal(await page.locator('#provider-model-list option').count(),1);
  await page.evaluate(()=>qa.modelDelay=350);await page.locator('#list-provider-models').click();await page.locator('#provider-key').fill('newer-fixture-key');await page.waitForTimeout(450);assert.equal(await page.locator('#provider-model-list option').count(),1);assert.match(await page.locator('#provider-result').textContent(),/配置已更改/);report.checks.push('Model list stays visible after fetch; credential edits clear old choices and discard late responses');
  await page.evaluate(()=>{const settings=JSON.parse(localStorage.getItem('qa-settings'));Object.assign(settings,{assistanceMode:'on-demand',lookupDisplay:'annotation',lookupKey:'F'});localStorage.setItem('qa-settings',JSON.stringify(settings));});
  await page.goto(base+'/ui/options.html#privacy');await page.reload();await page.waitForTimeout(250);await page.evaluate(()=>{qa.events.length=0;qa.failPatch=true;});page.once('dialog',d=>d.accept());await page.locator('#reset-config').click();await page.waitForTimeout(100);assert.equal(await page.locator('#lookup-key').inputValue(),'F');assert.equal(await page.locator('#reset-config').isDisabled(),false);assert.equal(await page.evaluate(()=>qa.events.filter(e=>e.type==='STATE_PATCH').length),1);assert.equal(await page.evaluate(()=>qa.events.some(e=>e.type==='SENTENCE_GROUPS_DENSITY_SET')),false);
  await page.evaluate(()=>{qa.events.length=0;qa.failPatch=false;});page.once('dialog',d=>d.accept());await page.locator('#reset-config').click();await page.waitForTimeout(100);assert.equal(await page.locator('#lookup-key').inputValue(),'D');assert.equal(await page.evaluate(()=>qa.events.filter(e=>e.type==='STATE_PATCH').length),1);report.checks.push('Reset saves preferences together; failed save preserves controls and does not change density');
  await page.evaluate(()=>{const settings=JSON.parse(localStorage.getItem('qa-settings'));Object.assign(settings,{providerKind:'api',activeApiServiceId:'sn',apiServices:[{id:'sn',name:'SenseNova',providerId:'sensenova',baseUrl:'https://token.sensenova.cn/v1',model:'sensenova-6.8-flash-lite',apiKey:'fake-local-test-key',options:{channel:'tokenplan',reasoningEffort:'medium'}},{id:'zp',name:'GLM',providerId:'zhipu',baseUrl:'https://open.bigmodel.cn/api/paas/v4',model:'glm-5.3',apiKey:'fake-local-test-key',options:{channel:'open',reasoningEffort:'high'}}]});localStorage.setItem('qa-settings',JSON.stringify(settings));});
  await page.goto(base+'/ui/options.html#service');await page.reload();await page.waitForTimeout(300);await page.locator('#api-editor').evaluate(e=>e.open=true);
  const effort=page.locator('#provider-fields [data-provider-option="reasoningEffort"]');
  assert.equal(await effort.inputValue(),'medium');assert.deepEqual(await effort.locator('option').evaluateAll(list=>list.map(o=>o.value)),['none','low','medium','high']);assert.equal(await effort.isVisible(),true);
  await page.locator('#provider-fields [data-provider-option="channel"]').selectOption('sensecore');assert.equal(await effort.isVisible(),false);
  await page.locator('#provider-fields [data-provider-option="channel"]').selectOption('tokenplan');assert.equal(await effort.isVisible(),true);
  page.once('dialog',d=>d.accept());await page.locator('#api-service-select').selectOption('zp');await page.waitForTimeout(150);
  assert.equal(await effort.inputValue(),'high');assert.deepEqual(await effort.locator('option').evaluateAll(list=>list.map(o=>o.value)),['none','low','high']);
  report.checks.push('Thinking level lists only provider-supported levels, restores saved value, and hides on channels without support');
  assert.deepEqual(report.errors,[],'页面脚本错误');
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
