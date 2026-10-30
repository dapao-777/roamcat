/**
 * @file tools/audit-extension.mjs
 * 文件职责：真后台端到端审计（npm run verify:audit）——在 ego lite 里用真实扩展后台 + 本地假模型接口，覆盖设置持久化、
 *   规则增删、词卡、解构、整页翻译、摘要、伴读猫等 30 项。
 * 主要内容：npm 脚本先跑静态模块图门禁再启动本审计；本机 127.0.0.1 起 fixture 文章与 OpenAI 兼容的假模型接口（不访问外网，API Key 为假值）；
 *   设置页发真实消息、文章页走真实 content script；无障碍树（CDP Accessibility）点击卡片按钮。
 *   参数：--fast 跳过分区截图；--content-only 只跑页内内容相关检查。截图尽力而为。
 * 模块边界：普通 Node 运行，先 npm run build；无头 ego lite 用临时配置加载 dist/extension 的副本（host 权限收窄为 127.0.0.1）；
 *   报告写 preview/audit/。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {REPO, DIST, assertFreshDist, openBrowser, extUrl, gateArgs, noteScreenshots, previewPath, tabIdOf} from './lib/ego.mjs';

const {verifyModuleGraph}=createRequire(import.meta.url)('./lib/module-graph.cjs');
const args=gateArgs(),FAST=args.includes('--fast'),CONTENT_ONLY=args.includes('--content-only');
const out=previewPath('audit');fs.mkdirSync(out,{recursive:true});
const report={checks:[],failures:[],pageErrors:[],ui:[],apiCalls:[]};
const article=`<!doctype html><html lang="en"><head><title>Reading fixture</title></head><body><nav>Home · About</nav><main style="max-width:760px;margin:60px auto;font:20px/1.8 Georgia"><article><h1>How databases reduce latency</h1>${Array.from({length:8},(_,i)=>`<p id="paragraph-${i}">The database uses an index to find records quickly. A cache reduces latency when requests repeat. Careful readers compare the evidence before they reach a conclusion.</p>`).join('')}<input aria-label="Excluded input" value="Do not annotate this input"></article></main></body></html>`;
function fixtureResult(b){const schema=b.response_format?.json_schema?.schema;if(schema?.properties?.probe)return {probe:schema.properties.probe.enum[0]};const request=JSON.parse(b.messages.at(-1).content);if(schema?.properties?.takeaway)return {takeaway:'索引可以加快数据库查询。',highlights:['**性能**：减少查找耗时。','**缓存**：减少重复请求。','**审慎**：先比较证据。'],keywords:['index','cache'],domain:'data'};if(request.items){const groups=schema?.properties?.items?.items?.properties?.groups;return {items:request.items.map(item=>groups?{id:item.id,groups:[{role:'subject',first:1,last:2}]}:{id:item.id,translation:'数据库使用索引快速查找记录。'})};}return {result:{level:request.level,[request.level==='hint'?'hint':'translation']:request.level==='hint'?'a lookup structure':'索引',...(request.kind==='passage'?{}:{sense:'database lookup structure',...(request.detail==='full'?{details:{meaning:{en:'An index speeds up finding records.',zh:'索引用于加快查找记录。'},sentenceTranslation:'数据库查询使用索引。'}}:{})})}};}
const server=http.createServer((req,res)=>{if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}).end();return;}if(req.url.startsWith('/v1/')){let body='';req.on('data',c=>body+=c);req.on('end',()=>{const b=JSON.parse(body||'{}');report.apiCalls.push({url:req.url,stream:!!b.stream,summary:!!b.response_format?.json_schema?.schema?.properties?.takeaway});res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});if(req.url.endsWith('/models'))return res.end(JSON.stringify({data:[{id:'audit-model'}]}));const result=fixtureResult(b);const finish=()=>res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(result)},finish_reason:'stop'}]}));if(b.response_format?.json_schema?.schema?.properties?.takeaway)setTimeout(finish,500);else finish();});return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(article);});
// 每项开始/结束都追加写进度文件，长时间没有输出时能看出停在哪一项。
const progressFile=path.join(out,'progress.log');fs.writeFileSync(progressFile,'');const progress=line=>fs.appendFileSync(progressFile,new Date().toISOString().slice(11,19)+' '+line+'\n');
async function check(name,fn){progress('START '+name);if(CONTENT_ONLY&&/Every settings|Custom terminology|Domain rules|Invalid settings|History opt-in|Diagnostics export|All settings|Reset restores/.test(name))return;try{const detail=await fn();report.checks.push({name,...(detail?{detail}:{})});console.log('PASS '+name);progress('PASS '+name);}catch(e){report.failures.push({name,error:e.message});console.log('FAIL '+name+': '+e.message);progress('FAIL '+name+': '+e.message.slice(0,200));}}

// 浏览器回归前先过静态模块图门禁：加载契约、依赖方向或连接器闭包被破坏时不启动浏览器。
const graph=await verifyModuleGraph({root:path.join(REPO,'roamcat-0.0.1')});
for(const failure of graph.failures)console.error('GRAPH '+failure.rule+': '+failure.message);
if(graph.failures.length){console.error('模块图检查未通过，已中止浏览器审计。可单独运行：node tools/verify-module-graph.cjs');process.exit(1);}
console.log('PASS 模块图与加载契约（'+graph.stats.files+' 个文件，'+graph.stats.edges+' 条 import 边）');
// 测试副本：host 权限收窄为 127.0.0.1，确认审计全程不碰外网；扩展 ID 来自 manifest.key，与 dist 一致。
assertFreshDist();
const extension=fs.mkdtempSync(path.join(os.tmpdir(),'roamcat-audit-ext-'));fs.cpSync(DIST,extension,{recursive:true});
const manifestPath=path.join(extension,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));manifest.host_permissions=['http://127.0.0.1/*'];fs.writeFileSync(manifestPath,JSON.stringify(manifest));
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const run=await openBrowser({extension});
try{
 const base=extUrl('').replace(/\/$/,'');
 const page=await run.newPage();await page.setViewportSize({width:1440,height:1000},1);page.on('pageerror',e=>report.pageErrors.push({url:e.url||'',error:e.message}));
 await page.goto(base+'/ui/options.html');await page.waitForTimeout(600);
 const request=async(type,payload={})=>{const r=await page.evaluate(m=>chrome.runtime.sendMessage(m),{type,...payload});assert.ok(r?.ok,r?.error||'No response');return r.data;};
 await request('STATE_PATCH',{patch:{providerKind:'api',assistanceMode:'on-demand',domain:'general'}});await page.reload();await page.waitForTimeout(500);
 await check('Background initializes and persisted settings load',async()=>{const s=await request('STATE_GET');assert.equal(s.settings.providerKind,'api');assert.equal(s.settings.assistanceMode,'on-demand');return {version:await page.evaluate(()=>chrome.runtime.getManifest().version)};});
 await check('Real settings changes persist after reload',async()=>{await page.locator('#lookup-key').selectOption('F');await page.locator('input[name="assistance-mode"][value="ambient"]').check();await page.waitForTimeout(300);await page.reload();await page.waitForTimeout(300);assert.equal(await page.locator('#lookup-key').inputValue(),'F');assert.equal(await page.locator('input[name="assistance-mode"]:checked').inputValue(),'ambient');await request('STATE_PATCH',{patch:{assistanceMode:'on-demand'}});});
 await check('Density synchronizes and persists through real backend',async()=>{await page.evaluate(s=>{location.hash='#'+s},'appearance');await page.waitForTimeout(500);await page.locator('label:has(input[name="sentence-density"][value="fine"])').click();await page.waitForTimeout(400);assert.equal(await page.evaluate(async()=>(await chrome.storage.local.get('sentenceGroupsDensity')).sentenceGroupsDensity),'fine');});
 const sections=['assistance','appearance','sites','video','terms','personalization','history','privacy','service','diagnostics','guide'];
 await check('Every settings section renders in light and dark',async()=>{for(const theme of ['light','dark']){await page.evaluate(t=>{document.documentElement.dataset.theme=t;localStorage.setItem('roamcat_ui_theme',t);},theme);for(const section of sections){await page.evaluate(s=>{location.hash='#'+s},`${section}`);await page.locator('#'+section).waitFor({state:'visible'});const errors=await page.locator('#global-error:visible').allTextContents();const overflow=await page.evaluate(()=>[...document.querySelectorAll('.main-panel,.settings-section,.paper-card,.swiss-card')].filter(e=>e.getBoundingClientRect().width&&e.scrollWidth>e.clientWidth+3).map(e=>({selector:e.id||e.className,client:e.clientWidth,scroll:e.scrollWidth})));report.ui.push({theme,section,errors,overflow});if(!FAST)await page.screenshot({path:path.join(out,`${theme}-${section}.png`)});}}});
 await check('Custom terminology create and delete',async()=>{await page.evaluate(s=>{location.hash='#'+s},'terms');await page.locator('#term-source').fill('latency');await page.locator('#term-translation').fill('延迟');await page.locator('#term-domain').selectOption('tech');await page.locator('#term-form button[type="submit"]').click();await page.waitForTimeout(200);assert.equal((await request('STATE_GET')).settings.customTerms.length,1);await page.locator('#term-list button').click();await page.waitForTimeout(200);assert.equal((await request('STATE_GET')).settings.customTerms.length,0);});
 await check('Domain rules create and delete',async()=>{await page.evaluate(s=>{location.hash='#'+s},'sites');await page.locator('#sites details:has(#domain-rule-form) > summary').click();await page.locator('#rule-host').fill('example.com');await page.locator('#rule-path').fill('/docs');await page.locator('#rule-domain').selectOption('tech');await page.locator('#domain-rule-form button[type="submit"]').click();await page.waitForTimeout(200);assert.equal((await request('STATE_GET')).settings.domainRules.length,1);await page.locator('#domain-rule-list button').click();await page.waitForTimeout(200);assert.equal((await request('STATE_GET')).settings.domainRules.length,0);});
 await check('Invalid settings are rejected without corruption',async()=>{const r=await page.evaluate(()=>chrome.runtime.sendMessage({type:'STATE_PATCH',patch:{lookupKey:'NOT-A-KEY'}}));assert.equal(r.ok,false);assert.equal((await request('STATE_GET')).settings.lookupKey,'F');});
 await check('History opt-in and empty snapshots',async()=>{const initial=await request('HISTORY_GET');assert.equal(initial.config.enabled,false);await request('HISTORY_CONFIG',{patch:{enabled:true,origins:[origin]}});const next=await request('HISTORY_GET');assert.equal(next.config.enabled,true);assert.equal(next.events.length,0);await request('HISTORY_CONFIG',{patch:{enabled:false}});});
 await check('Diagnostics export is readable',async()=>{const d=await request('DIAGNOSTICS_EXPORT');assert.ok(d&&typeof d==='object');});
 await check('Test copy has localhost-only permission',async()=>{const allowed=await page.evaluate(origin=>chrome.permissions.contains({origins:[origin+'/*']}),origin);assert.equal(allowed,true);});
 const tabPage=await run.newPage();await tabPage.setViewportSize({width:1440,height:1000},1);await tabPage.goto(origin+'/article');const tabId=await tabIdOf(page,origin+'/article');
 // 每个页面在独立窗口里，扩展看到的 tab.active 恒为真；front 只把文章页窗口提到前面，开窗观察（ROAMCAT_HEADED=1）时便于看。
 const front=()=>tabPage.bringToFront(),activate=front;
 await check('Inject and toggle real content script',async()=>{await request('PAGE_UI_INJECT',{tabId});const send=async message=>{await front();return page.evaluate(({tabId,message})=>chrome.tabs.sendMessage(tabId,message,{frameId:0}),{tabId,message});};let r=await send({type:'SS_SET_ENABLED',enabled:true});assert.ok(r.ok,r.error);r=await send({type:'SS_STATUS'});assert.equal(r.data.enabled,true);r=await send({type:'SS_SET_ENABLED',enabled:false});assert.ok(r.ok,r.error);assert.equal((await send({type:'SS_STATUS'})).data.enabled,false);});
 await check('Configure and test fixture model (no external API)',async()=>{await request('STATE_PATCH',{patch:{apiServices:[{id:'audit',name:'Local audit fixture',providerId:'openai-compatible',baseUrl:origin+'/v1',model:'audit-model',apiKey:'audit-fixture-not-a-real-key',options:{}}],activeApiServiceId:'audit',providerKind:'api'}});const r=await request('PROVIDER_TEST');assert.ok(r.hint);});

 await check('Saved API service model list is retained after fetching',async()=>{await page.evaluate(s=>{location.hash='#'+s},'service');await page.waitForTimeout(250);await page.locator('#api-editor').evaluate(e=>e.open=true);await page.locator('#list-provider-models').click();await page.waitForTimeout(500);assert.equal(await page.locator('#provider-model-list option[value="audit-model"]').count(),1,await page.locator('#provider-result').textContent());});
 await check('All settings sections fit a narrow window',async()=>{await page.setViewportSize({width:390,height:844});for(const section of sections){await page.evaluate(s=>{location.hash='#'+s},`${section}`);await page.waitForTimeout(80);const overflow=await page.evaluate(()=>[...document.querySelectorAll('.main-panel,.settings-section,.paper-card,.swiss-card')].filter(e=>e.getBoundingClientRect().width&&e.scrollWidth>e.clientWidth+3).map(e=>({selector:e.id||e.className,client:e.clientWidth,scroll:e.scrollWidth})));report.ui.push({theme:'narrow',section,errors:[],overflow});if(overflow.length)await page.screenshot({path:path.join(out,`narrow-${section}.png`)});}await page.setViewportSize({width:1440,height:1000});assert.equal(report.ui.filter(x=>x.theme==='narrow'&&x.overflow.length).length,0,'Some sections overflow; see report.ui');});
 await check('Reset restores preferences in storage and controls',async()=>{await request('STATE_PATCH',{patch:{assistanceMode:'on-demand',lookupDisplay:'annotation',lookupKey:'F'}});await page.goto(base+'/ui/options.html#privacy');await page.waitForTimeout(400);page.once('dialog',d=>d.accept());await page.locator('#reset-config').click();await page.waitForTimeout(700);const state=await request('STATE_GET');assert.equal(state.settings.assistanceMode,'ambient');assert.equal(state.settings.lookupDisplay,'card');assert.equal(state.settings.lookupKey,'D');assert.equal(await page.locator('#lookup-key').inputValue(),'D');assert.equal(await page.locator('input[name="assistance-mode"]:checked').inputValue(),'ambient');assert.equal(await page.locator('input[name="lookup-display"]:checked').inputValue(),'card');});
 await request('STATE_PATCH',{patch:{assistanceMode:'on-demand',lookupDisplay:'card',lookupKey:'F',helpLanguage:'en'}});
 const send=async message=>{await front();return page.evaluate(({tabId,message})=>chrome.tabs.sendMessage(tabId,message,{frameId:0}),{tabId,message});};
 const cdp={send:(method,params)=>tabPage.send(method,params)};
 const accessible=async()=> (await cdp.send('Accessibility.getFullAXTree')).nodes.map(n=>n.name?.value||'').join(' | ');
 async function clickAccessible(label){const tree=await cdp.send('Accessibility.getFullAXTree');const n=tree.nodes.find(n=>n.name?.value===label&&n.backendDOMNodeId);assert.ok(n,'Missing accessible control '+label);const resolved=await cdp.send('DOM.resolveNode',{backendNodeId:n.backendDOMNodeId});const {result}=await cdp.send('Runtime.callFunctionOn',{objectId:resolved.object.objectId,functionDeclaration:'function(){const b=this.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}}',returnByValue:true});await tabPage.mouse.click(result.value.x,result.value.y);}
 async function waitText(text){await front();for(let i=0;i<80;i++){const result=await accessible();if(result.includes(text))return result;await tabPage.waitForTimeout(100);}await tabPage.screenshot({path:path.join(out,'card-error.png')});throw Error('Card did not display '+text+'; '+(await accessible()).slice(-1800));}
 await check('Real hotkey opens a complete explanation card',async()=>{await request('HISTORY_CONFIG',{patch:{enabled:true,origins:[origin]}});const enabled=await send({type:'SS_SET_ENABLED',enabled:true});assert.ok(enabled.ok,enabled.error);assert.equal(enabled.data.enabled,true);await tabPage.bringToFront();await tabPage.locator('h1').click();await tabPage.waitForTimeout(200);const point=await tabPage.locator('#paragraph-0').evaluate(p=>{const n=p.firstChild,r=document.createRange(),i=n.textContent.indexOf('index');r.setStart(n,i);r.setEnd(n,i+5);const b=r.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};});await tabPage.mouse.move(point.x,point.y);await tabPage.keyboard.down('f');await tabPage.mouse.click(point.x,point.y);await tabPage.keyboard.up('f');await waitText('a lookup structure');await clickAccessible('展开本句译文');await waitText('speeds up finding records.');await waitText('数据库查询使用索引。');await tabPage.screenshot({path:path.join(out,'real-lookup-card.png')});});
 await check('Explanation switches language and known words can be undone',async()=>{await clickAccessible('用中文说明');await waitText('用于加快查找记录。');await clickAccessible('我已认识此词');await tabPage.waitForTimeout(300);let state=await page.evaluate(()=>chrome.storage.local.get('words'));const word=state.words.find(w=>w.term==='index');assert.ok(word?.knownAt>0);await clickAccessible('撤销');await tabPage.waitForTimeout(200);state=await page.evaluate(()=>chrome.storage.local.get('words'));assert.equal(state.words.find(w=>w.term==='index').knownAt,0);});
 await check('Escape dismisses the card and inputs remain editable',async()=>{await tabPage.keyboard.press('Escape');assert.equal(await tabPage.locator('[data-roamcat-ui="card"]').count(),0);await tabPage.locator('[aria-label="Excluded input"]').fill('Typing f stays in the input');assert.equal(await tabPage.locator('[aria-label="Excluded input"]').inputValue(),'Typing f stays in the input');});
 await check('Displayed lookup is recorded and exportable',async()=>{await tabPage.waitForTimeout(500);const h=await request('HISTORY_GET');fs.writeFileSync(path.join(out,'history-fixture.json'),JSON.stringify(h,null,2));assert.ok(h.events.length>0,'No lookup event recorded');assert.ok(JSON.stringify(h).includes('index'));const exported=await request('HISTORY_EXPORT');assert.ok(exported);await request('HISTORY_CLEAR');assert.equal((await request('HISTORY_GET')).events.length,0);});
 await check('Sentence structure processes and clears real page highlights',async()=>{await tabPage.locator('h1').click();await tabPage.evaluate(()=>window.scrollTo(0,0));await activate();await request('SENTENCE_GROUPS_SET',{tabId,enabled:true});let r=await send({type:'SS_SET_SENTENCE_GROUPS',enabled:true});assert.ok(r.ok,r.error);for(let i=0;i<80;i++){r=await send({type:'SS_STATUS'});if(r.data.sentenceGroups.processed>0)break;await tabPage.waitForTimeout(150);}assert.ok(r.data.sentenceGroups.processed>0,JSON.stringify(r.data.sentenceGroups));await tabPage.screenshot({path:path.join(out,'real-sentence-structure.png')});await request('SENTENCE_GROUPS_SET',{tabId,enabled:false});r=await send({type:'SS_SET_SENTENCE_GROUPS',enabled:false});assert.ok(r.ok,r.error);assert.equal((await send({type:'SS_STATUS'})).data.sentenceGroups.enabled,false);});
 await check('Whole-page translation renders and can be cleared',async()=>{await activate();await request('PAGE_UI_INJECT',{tabId});const {token}=await request('EMERGENCY_BEGIN',{tabId,url:origin+'/article'});let r=await send({type:'SS_EMERGENCY_START',token,resume:false});assert.ok(r.ok,r.error);await tabPage.locator('[data-roamcat-ui="emergency-translation"]').first().waitFor({state:'visible',timeout:15000});await tabPage.locator('nav [data-roamcat-ui="emergency-translation"]').first().waitFor({state:'attached',timeout:15000});await tabPage.screenshot({path:path.join(out,'real-page-translation.png')});r=await send({type:'SS_EMERGENCY_END'});assert.ok(r.ok,r.error);assert.equal(await tabPage.locator('[data-roamcat-ui="emergency-translation"]').count(),0);});
 await check('Local domain model classifies text without cloud calls',async()=>{const before=report.apiCalls.length,r=await request('DOMAIN_TEST',{text:'A relational database uses SQL queries, indexes, primary keys and transactions to store records. Database engines optimize joins, transactions and query execution.'});assert.ok(r.domain);assert.equal(report.apiCalls.length,before);return r;});
 await check('Personalization empty state and reset respond',async()=>{const p=await request('PERSONALIZATION_GET');assert.ok(p);await request('PERSONALIZATION_RESET');});
 await check('Summary works during other activity and closing does not duplicate requests',async()=>{
   const before=report.apiCalls.filter(c=>c.summary).length;
   await page.evaluate(async tabId=>chrome.scripting.executeScript({target:{tabId},func:async()=>{const pet=globalThis.RoamCatPet;pet.setPetState('thinking');const first=pet.requestArticleSummary();await new Promise(r=>setTimeout(r,100));pet.closeSummary();await pet.requestArticleSummary();await first;}}),tabId);
   await waitText('索引可以加快数据库查询。');assert.equal(report.apiCalls.filter(c=>c.summary).length,before+1);
   const d=await request('DIAGNOSTICS_EXPORT');fs.writeFileSync(path.join(out,'diagnostics-fixture.json'),JSON.stringify(d,null,2));assert.ok(JSON.stringify(d).includes('PAGE_SUMMARY'),'Summary trace missing');
   await page.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:()=>globalThis.RoamCatPet.closeSummary()}),tabId);
 });
 async function startDelayedSummary(){
   const before=report.apiCalls.filter(c=>c.summary).length;
   await page.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:()=>{
     globalThis.__auditSummary=chrome.runtime.sendMessage({type:'PAGE_SUMMARY',title:document.title,url:location.href,text:document.querySelector('article').innerText});
   }}),tabId);
   for(let i=0;i<100&&report.apiCalls.filter(c=>c.summary).length===before;i++)await tabPage.waitForTimeout(20);
   assert.equal(report.apiCalls.filter(c=>c.summary).length,before+1);
 }
 async function finishDelayedSummary(){
   const [{result}]=await page.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:async()=>await globalThis.__auditSummary}),tabId);return result;
 }
 await check('Summary rejects results after SPA query navigation',async()=>{
   await startDelayedSummary();
   try{await tabPage.evaluate(()=>history.pushState({},'', '/article?story=second'));const result=await finishDelayedSummary();assert.equal(result.ok,false,'Old article summary returned after navigation');}
   finally{await tabPage.evaluate(()=>history.replaceState({},'', '/article'));}
 });
 await check('Summary rejects results after model settings change',async()=>{
   const state=await request('STATE_GET');await startDelayedSummary();
   try{await request('STATE_PATCH',{patch:{apiServices:state.settings.apiServices.map(s=>({...s,model:'changed-model'}))}});const result=await finishDelayedSummary();assert.equal(result.ok,false,'Old model summary returned after settings change');}
   finally{await request('STATE_PATCH',{patch:{apiServices:state.settings.apiServices}});}
 });
 await check('Copied summary keeps its original article title and URL',async()=>{
   const [{result}]=await page.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:async()=>{
     const pet=globalThis.RoamCatPet;await pet.requestArticleSummary();
     const title=document.title,url=location.href;let copied='';
     const own=Object.getOwnPropertyDescriptor(navigator,'clipboard');
     Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied=text;}}});
     try{document.title='Second article';history.pushState({},'', '/article?story=second');await pet.copySummaryText();return {copied,title,url};}
     finally{document.title=title;history.replaceState({},'',url);if(own)Object.defineProperty(navigator,'clipboard',own);else delete navigator.clipboard;pet.closeSummary();}
   }}),tabId);
   assert.ok(result.copied.includes('【'+result.title+'】'),'Summary uses the next article title');assert.ok(result.copied.includes('来源：'+result.url));assert.ok(!result.copied.includes('story=second'));
 });
 await check('New article summary survives completion of an older request',async()=>{
   const before=report.apiCalls.filter(c=>c.summary).length;
   await page.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:()=>{globalThis.__auditOldSummary=globalThis.RoamCatPet.requestArticleSummary();}}),tabId);
   for(let i=0;i<100&&report.apiCalls.filter(c=>c.summary).length===before;i++)await tabPage.waitForTimeout(20);
   try{
     await tabPage.evaluate(()=>history.pushState({},'', '/article?story=second'));
     await page.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:()=>{globalThis.__auditNewSummary=globalThis.RoamCatPet.requestArticleSummary();}}),tabId);
     const [{result}]=await page.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:async()=>{await Promise.all([globalThis.__auditOldSummary,globalThis.__auditNewSummary]);const pet=globalThis.RoamCatPet;return {pending:pet._summaryPending,text:pet.shadowQuery('#summary-content')?.textContent};}}),tabId);
     assert.equal(report.apiCalls.filter(c=>c.summary).length,before+2,'New article request was blocked by old pending state');assert.equal(result.pending,false);assert.ok(result.text.includes('索引可以加快数据库查询。'),result.text);
   }finally{await tabPage.evaluate(()=>history.replaceState({},'', '/article'));await page.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:()=>globalThis.RoamCatPet.closeSummary()}),tabId);}
 });
 await check('Pet drag persists position without exposing protected storage',async()=>{
   const before=(await request('STATE_GET')).settings.floatingPet.position;
   const [{result:pos}]=await page.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:()=>{const b=globalThis.RoamCatPet.avatarWrap.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};}}),tabId);
   await tabPage.bringToFront();await tabPage.mouse.move(pos.x,pos.y);await tabPage.mouse.down();await tabPage.mouse.move(pos.x-50,pos.y-40,{steps:8});await tabPage.mouse.up();await tabPage.waitForTimeout(350);
   const after=(await request('STATE_GET')).settings.floatingPet.position;assert.notDeepEqual(after,before);
   await request('STATE_PATCH',{patch:{floatingPet:{enabled:false}}});await tabPage.reload();await request('PAGE_UI_INJECT',{tabId});await tabPage.waitForTimeout(300);assert.equal(await tabPage.locator('#roamcat-pet-host').count(),0);
   await request('STATE_PATCH',{patch:{floatingPet:{enabled:true}}});await tabPage.locator('#roamcat-pet-host').waitFor({state:'attached'});const [{result:visible}]=await page.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:()=>globalThis.RoamCatPet.avatarWrap.getBoundingClientRect().width>0}),tabId);assert.equal(visible,true);assert.deepEqual((await request('STATE_GET')).settings.floatingPet.position,after);
 });
 await check('Welcome page and interactive samples load',async()=>{await page.goto(base+'/ui/welcome.html');await page.waitForTimeout(300);assert.ok(await page.locator('#welcome-hero-title').isVisible());await page.screenshot({path:path.join(out,'welcome.png')});});
 await page.pump();
}catch(e){report.failures.push({name:'audit run',error:e.message});console.error(e);}
finally{await run.close();server.close();fs.rmSync(extension,{recursive:true,force:true,maxRetries:5,retryDelay:300});noteScreenshots(report);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(report.failures.length||report.pageErrors.length)process.exitCode=1;console.log(JSON.stringify({passed:report.checks.length,failures:report.failures,pageErrors:report.pageErrors,warnings:report.warnings||[],uiIssues:report.ui.filter(x=>x.errors.length||x.overflow.length)},null,2));}
