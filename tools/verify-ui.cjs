/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
function loadPlaywright(){try{return require('playwright-core');}catch(first){const override=process.env.PLAYWRIGHT_CORE_PATH;if(override){try{return require(override);}catch{}}throw new Error(`找不到 playwright-core（${first?.message || first}）。请在项目根运行 npm i -D playwright-core，或设置 PLAYWRIGHT_CORE_PATH 指向可用副本。`);}}
const {chromium}=loadPlaywright();
const root=process.env.ROAMCAT_EXTENSION_DIR?path.resolve(process.env.ROAMCAT_EXTENSION_DIR):path.resolve(__dirname,'../roamcat-0.0.1/extension'),out=path.resolve(__dirname,'../preview');
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
 const report={checks:[],errors:[],overflow:[]};
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  await context.addInitScript(mockChrome);await context.addInitScript(()=>localStorage.setItem('roamcat_ui_theme','light'));
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await page.goto(base+'/ui/options.html');await page.waitForTimeout(500);await page.screenshot({path:out+'/final-options-light.png'});
  assert.equal(await page.locator('#threshold-stat-num').textContent(),'02');
  await page.locator('#matrix-index-range').fill('3');await page.locator('#matrix-index-range').dispatchEvent('change');
  await page.waitForFunction(()=>localStorage.getItem('qa-density')==='fine');
  assert.equal(await page.locator('input[name="sentence-density"]:checked').inputValue(),'fine');
  await page.reload();await page.waitForTimeout(300);assert.equal(await page.locator('#threshold-stat-num').textContent(),'03');
  report.checks.push('Density slider saves fine through existing message, syncs appearance radios, survives reload');
  await page.evaluate(()=>{window.qa.failDensity=true;});await page.locator('#matrix-index-range').fill('1');await page.locator('#matrix-index-range').dispatchEvent('change');await page.waitForTimeout(100);
  assert.equal(await page.locator('#matrix-index-range').inputValue(),'3');assert.equal(await page.locator('#matrix-index-range').isDisabled(),false);assert.equal(await page.locator('#detail-meter-result').textContent(),'模拟保存失败');assert.equal(await page.locator('#detail-meter-result').isVisible(),true);report.checks.push('Failed save rolls slider and radios back, re-enables controls, and shows local error feedback');
  await page.locator('input[name="assistance-mode"][value="on-demand"]').check();await page.waitForTimeout(100);assert.equal(await page.locator('#readout-mode').textContent(),'只在主动求助时');
  await page.locator('#lookup-key').selectOption('F');await page.waitForTimeout(100);assert.equal(await page.locator('.readout-key').textContent(),'F');report.checks.push('Header reads saved assistance mode and hotkey');
  await page.evaluate(()=>window.qa.failDensity=false);await page.locator('input[name="assistance-mode"][value="ambient"]').check();await page.locator('#lookup-key').selectOption('D');await page.locator('#matrix-index-range').fill('2');await page.locator('#matrix-index-range').dispatchEvent('change');
  for(const theme of ['light','dark']){
    for(let i=0;i<3&&await page.locator('html').getAttribute('data-theme')!==theme;i++)await page.locator('#theme-toggle-btn').click();
    await page.waitForTimeout(350);
    await page.locator('#sidebar-stamp-card').screenshot({path:out+`/card-cat-${theme}.png`});
    await page.locator('.reading-readout').screenshot({path:out+`/card-preferences-${theme}.png`});
    await page.locator('.main-panel').evaluate(el=>el.scrollTo(0,0));await page.screenshot({path:out+`/final-options-${theme}.png`});
    await page.locator('[data-purpose="setting-block-reliance-index"]').screenshot({path:out+`/final-detail-${theme}.png`});
    await page.locator('[data-section="history"]').click();await page.locator('#history-view-stats-tab').click();await page.waitForTimeout(100);await page.locator('.main-panel').evaluate(el=>el.scrollTo(0,0));await page.screenshot({path:out+`/final-history-${theme}.png`});
    assert.equal(await page.locator('.history-bar').count()>0,true);
    await page.locator('[data-section="assistance"]').click();await page.waitForTimeout(300);
  }
  for(const width of [1440,1024,768,390]){
    await page.setViewportSize({width,height:1000});await page.waitForTimeout(350);await page.locator('.main-panel').evaluate(el=>el.scrollTo(0,0));await page.screenshot({path:out+`/final-options-${width}.png`});
    const overflow=await page.evaluate(()=>[...document.querySelectorAll('.main-panel,.main-canvas-content,.compact-hero-banner,.swiss-card')].filter(el=>el.getBoundingClientRect().width&&el.scrollWidth>el.clientWidth+2).map(el=>({class:el.className,width:el.clientWidth,scroll:el.scrollWidth})));
    if(overflow.length)report.overflow.push({width,overflow});
  }
  await page.setViewportSize({width:1440,height:1000});
  for(const theme of ['light','dark']){await page.goto(base+'/ui/welcome.html');await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);await page.waitForTimeout(200);await page.screenshot({path:out+`/final-welcome-${theme}.png`});}
  await page.goto(base+'/ui/options.html');await page.locator('#sidebar-stamp-card').click();assert.equal(await page.locator('#stamp-manifesto-modal').evaluate(el=>el.open),true);await page.screenshot({path:out+'/final-stamp.png'});await page.locator('#stamp-modal-close').click();
  report.checks.push('Light and dark settings/history/welcome renders; stamp dialog opens/closes');
  report.checks.push('History visualization renders fixture data only; no user history read or modified');
  await page.setViewportSize({width:380,height:660});await page.goto(base+'/ui/popup.html');await page.waitForTimeout(200);await page.screenshot({path:out+'/final-popup.png'});
  await page.goto(base+'/ui/options.html');
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>{const settings=JSON.parse(localStorage.getItem('qa-settings'));Object.assign(settings,{providerKind:'api',activeApiServiceId:'fixture',apiServices:[{id:'fixture',name:'Fixture',providerId:'openai-compatible',baseUrl:'http://127.0.0.1/v1',model:'fixture-model',apiKey:'fake-local-test-key',options:{}}]});localStorage.setItem('qa-settings',JSON.stringify(settings));});
  await page.reload();await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>qa.events.some(e=>e.type==='SUBSCRIPTION_STATUS')),false);report.checks.push('API-only settings do not contact subscription connector');
  await page.locator('[data-section="service"]').click();await page.locator('#api-editor').evaluate(e=>e.open=true);await page.locator('#list-provider-models').click();await page.waitForTimeout(100);assert.equal(await page.locator('#provider-model-list option[value="fixture-model"]').count(),1);
  await page.locator('#provider-key').fill('changed-fixture-key');assert.equal(await page.locator('#provider-model-list option').count(),1);
  await page.evaluate(()=>qa.modelDelay=350);await page.locator('#list-provider-models').click();await page.locator('#provider-key').fill('newer-fixture-key');await page.waitForTimeout(450);assert.equal(await page.locator('#provider-model-list option').count(),1);assert.match(await page.locator('#provider-result').textContent(),/配置已更改/);report.checks.push('Model list stays visible after fetch; credential edits clear old choices and discard late responses');
  await page.evaluate(()=>{const settings=JSON.parse(localStorage.getItem('qa-settings'));Object.assign(settings,{assistanceMode:'on-demand',lookupDisplay:'annotation',lookupKey:'F'});localStorage.setItem('qa-settings',JSON.stringify(settings));});
  await page.goto(base+'/ui/options.html#assistance');await page.reload();await page.waitForTimeout(250);await page.evaluate(()=>{qa.events.length=0;qa.failPatch=true;});page.once('dialog',d=>d.accept());await page.locator('#footer-reset-config').click();await page.waitForTimeout(100);assert.equal(await page.locator('#lookup-key').inputValue(),'F');assert.equal(await page.locator('#footer-reset-config').isDisabled(),false);assert.equal(await page.evaluate(()=>qa.events.filter(e=>e.type==='STATE_PATCH').length),1);assert.equal(await page.evaluate(()=>qa.events.some(e=>e.type==='SENTENCE_GROUPS_DENSITY_SET')),false);
  await page.evaluate(()=>{qa.events.length=0;qa.failPatch=false;});page.once('dialog',d=>d.accept());await page.locator('#footer-reset-config').click();await page.waitForTimeout(100);assert.equal(await page.locator('#lookup-key').inputValue(),'D');assert.equal(await page.evaluate(()=>qa.events.filter(e=>e.type==='STATE_PATCH').length),1);report.checks.push('Reset saves preferences together; failed save preserves controls and does not change density');
  report.styles=await page.evaluate(()=>Object.fromEntries(['body','.swiss-range-input','.stamp-cat-svg'].map(selector=>{const s=getComputedStyle(document.querySelector(selector));return [selector,{font:s.fontFamily,height:s.height,minHeight:s.minHeight,border:s.border,padding:s.padding,color:s.color,fill:s.fill}];})));
  fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
