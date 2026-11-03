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
import {printGateSummary} from './lib/gate-report.mjs';
import {verifyMtRegressions} from './lib/mt-regressions.mjs';

const {verifyModuleGraph}=createRequire(import.meta.url)('./lib/module-graph.cjs');
const args=gateArgs(),FAST=args.includes('--fast'),CONTENT_ONLY=args.includes('--content-only');
const out=previewPath('audit');fs.mkdirSync(out,{recursive:true});
const report={checks:[],failures:[],pageErrors:[],ui:[],apiCalls:[]};
const article=`<!doctype html><html lang="en"><head><title>Reading fixture</title></head><body><nav>Home · About</nav><main style="max-width:760px;margin:60px auto;font:20px/1.8 Georgia"><article><h1>How databases reduce latency</h1>${Array.from({length:8},(_,i)=>`<p id="paragraph-${i}">The database uses an index to find records quickly. A cache reduces latency when requests repeat. Careful readers compare the evidence before they reach a conclusion.</p>`).join('')}<input aria-label="Excluded input" value="Do not annotate this input"></article></main></body></html>`;
// 仅译文的边界夹具：列表符号、嵌套列表、正文链接与纯链接、行内图片、按 em 写的段距与行宽。
const rich=`<!doctype html><html lang="en"><head><title>Rich fixture</title></head><body><main style="max-width:760px;margin:60px auto;font:20px/1.8 Georgia"><article><h2>Indexes and caches in practice</h2><h2 id="breaks" style="font-size:56px;line-height:1">Indexes speed up<br>every single lookup</h2><ul id="bullets"><li>The database uses an index to find records quickly.</li><li>A cache reduces latency when requests repeat often.</li></ul><ol id="steps"><li>Careful readers compare the evidence first.</li><li>Then they reach a conclusion about the system.</li></ol><ul id="nested"><li>Indexes speed up lookups for most queries.<ul><li>Covering indexes avoid extra table reads.</li></ul></li></ul><p id="linked">Read the <a href="#guide">official guide to database indexes</a> before you tune a query plan.</p><p id="linkonly"><a href="#more">Learn more about database caching strategies</a></p><p id="media">The diagram <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" width="40" height="20" alt="diagram"> shows how an index narrows the search.</p><p id="em-spacing" style="margin:0 0 2em;max-width:30em">Spacing in em units must stay the same when only the translation is shown.</p></article></main></body></html>`;
function fixtureResult(b){const schema=b.response_format?.json_schema?.schema;if(schema?.properties?.probe)return {probe:schema.properties.probe.enum[0]};const request=JSON.parse(b.messages.at(-1).content);if(schema?.properties?.takeaway)return {takeaway:'索引可以加快数据库查询。',highlights:['**性能**：减少查找耗时。','**缓存**：减少重复请求。','**审慎**：先比较证据。'],keywords:['index','cache'],domain:'data'};if(request.items){const groups=schema?.properties?.items?.items?.properties?.groups;return {items:request.items.map(item=>groups?{id:item.id,groups:[{role:'subject',first:1,last:2}]}:{id:item.id,translation:item.text.includes(String.fromCharCode(10))?'索引加快'+String.fromCharCode(92)+'n每一次查找':'数据库使用索引快速查找记录。'})};}return {result:{level:request.level,[request.level==='hint'?'hint':'translation']:request.level==='hint'?'a lookup structure':'索引',...(request.kind==='passage'?{}:{sense:'database lookup structure',...(request.detail==='full'?{details:{meaning:{en:'An index speeds up finding records.',zh:'索引用于加快查找记录。'},sentenceTranslation:'数据库查询使用索引。'}}:{})})}};}
const server=http.createServer((req,res)=>{if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}).end();return;}if(req.url.startsWith('/v1/')){let body='';req.on('data',c=>body+=c);req.on('end',()=>{const b=JSON.parse(body||'{}');report.apiCalls.push({url:req.url,stream:!!b.stream,summary:!!b.response_format?.json_schema?.schema?.properties?.takeaway});res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});if(req.url.endsWith('/models'))return res.end(JSON.stringify({data:[{id:'audit-model'}]}));const result=fixtureResult(b);const finish=()=>res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(result)},finish_reason:'stop'}]}));if(b.response_format?.json_schema?.schema?.properties?.takeaway)setTimeout(finish,500);else finish();});return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(req.url.startsWith('/rich')?rich:article);});
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
const manifestPath=path.join(extension,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));manifest.host_permissions=['http://127.0.0.1/*','https://www.twitch.tv/*'];fs.writeFileSync(manifestPath,JSON.stringify(manifest));
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const run=await openBrowser({extension});
try{
 const base=extUrl('').replace(/\/$/,'');
 const page=await run.newPage();await page.setViewportSize({width:1440,height:1000},1);page.on('pageerror',e=>report.pageErrors.push({url:e.url||'',error:e.message}));
 await page.goto(base+'/ui/options.html');
 const request=async(type,payload={})=>{const r=await page.evaluate(m=>chrome.runtime.sendMessage(m),{type,...payload});assert.ok(r?.ok,r?.error||'No response');return r.data;};
 // 固定等待一律换成按状态轮询：动作之后等到要断言的状态出现（或超时）再断言。设置页以控制器写入 window.optionsState 为就绪；
 // 只有断言「不会发生」的地方保留观察窗口。
 const until=async(probe,ok,timeout=5000)=>{const deadline=Date.now()+timeout;let value=await probe();while(!ok(value)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,100));value=await probe();}return value;};
 const optionsReady=()=>until(()=>page.evaluate(()=>Boolean(window.optionsState)).catch(()=>false),Boolean);
 const settings=async()=>(await request('STATE_GET')).settings;
 const sectionShown=id=>until(()=>page.evaluate(i=>{const el=document.getElementById(i);return Boolean(el&&!el.hidden&&el.offsetHeight);},id).catch(()=>false),Boolean);
 await optionsReady();
 await request('STATE_PATCH',{patch:{providerKind:'api',assistanceMode:'on-demand',domain:'general'}});await page.reload();await optionsReady();
 await check('Background initializes and persisted settings load',async()=>{const s=await request('STATE_GET');assert.equal(s.settings.providerKind,'api');assert.equal(s.settings.assistanceMode,'on-demand');return {version:await page.evaluate(()=>chrome.runtime.getManifest().version)};});
 await check('Real settings changes persist after reload',async()=>{await page.locator('#lookup-key').selectOption('F');await page.locator('input[name="assistance-mode"][value="ambient"]').check();await until(settings,s=>s.lookupKey==='F'&&s.assistanceMode==='ambient');await page.reload();await optionsReady();assert.equal(await until(()=>page.locator('#lookup-key').inputValue(),v=>v==='F'),'F');assert.equal(await page.locator('input[name="assistance-mode"]:checked').inputValue(),'ambient');await request('STATE_PATCH',{patch:{assistanceMode:'on-demand'}});});
 await check('Density synchronizes and persists through real backend',async()=>{await page.evaluate(s=>{location.hash='#'+s},'appearance');await sectionShown('appearance');await page.locator('label:has(input[name="sentence-density"][value="fine"])').click();assert.equal(await until(()=>page.evaluate(async()=>(await chrome.storage.local.get('sentenceGroupsDensity')).sentenceGroupsDensity),v=>v==='fine'),'fine');});
 const sections=['assistance','appearance','sites','video','terms','personalization','history','privacy','service','diagnostics','guide'];
 await check('Every settings section renders in light and dark',async()=>{for(const theme of ['light','dark']){await page.evaluate(t=>{document.documentElement.dataset.theme=t;localStorage.setItem('roamcat_ui_theme',t);},theme);for(const section of sections){await page.evaluate(s=>{location.hash='#'+s},`${section}`);await page.locator('#'+section).waitFor({state:'visible'});const errors=await page.locator('#global-error:visible').allTextContents();const overflow=await page.evaluate(()=>[...document.querySelectorAll('.main-panel,.settings-section,.paper-card,.swiss-card')].filter(e=>e.getBoundingClientRect().width&&e.scrollWidth>e.clientWidth+3).map(e=>({selector:e.id||e.className,client:e.clientWidth,scroll:e.scrollWidth})));report.ui.push({theme,section,errors,overflow});if(!FAST)await page.screenshot({path:path.join(out,`${theme}-${section}.png`)});}}});
 await check('Custom terminology create and delete',async()=>{await page.evaluate(s=>{location.hash='#'+s},'terms');await page.locator('#term-source').fill('latency');await page.locator('#term-translation').fill('延迟');await page.locator('#term-domain').selectOption('tech');await page.locator('#term-form button[type="submit"]').click();assert.equal((await until(settings,s=>s.customTerms.length===1)).customTerms.length,1);await page.locator('#term-list button').click();assert.equal((await until(settings,s=>s.customTerms.length===0)).customTerms.length,0);});
 await check('Domain rules create and delete',async()=>{await page.evaluate(s=>{location.hash='#'+s},'sites');await page.locator('#sites details:has(#domain-rule-form) > summary').click();await page.locator('#rule-host').fill('example.com');await page.locator('#rule-path').fill('/docs');await page.locator('#rule-domain').selectOption('tech');await page.locator('#domain-rule-form button[type="submit"]').click();assert.equal((await until(settings,s=>s.domainRules.length===1)).domainRules.length,1);await page.locator('#domain-rule-list button').click();assert.equal((await until(settings,s=>s.domainRules.length===0)).domainRules.length,0);});
 await check('Invalid settings are rejected without corruption',async()=>{const r=await page.evaluate(()=>chrome.runtime.sendMessage({type:'STATE_PATCH',patch:{lookupKey:'NOT-A-KEY'}}));assert.equal(r.ok,false);assert.equal((await request('STATE_GET')).settings.lookupKey,'F');});
 await check('History opt-in and empty snapshots',async()=>{const initial=await request('HISTORY_GET');assert.equal(initial.config.enabled,false);await request('HISTORY_CONFIG',{patch:{enabled:true,origins:[origin]}});const next=await request('HISTORY_GET');assert.equal(next.config.enabled,true);assert.equal(next.events.length,0);await request('HISTORY_CONFIG',{patch:{enabled:false}});});
 await check('Diagnostics export is readable',async()=>{const d=await request('DIAGNOSTICS_EXPORT');assert.ok(d&&typeof d==='object');});
 await check('Test copy has localhost-only permission',async()=>{const allowed=await page.evaluate(origin=>chrome.permissions.contains({origins:[origin+'/*']}),origin);assert.equal(allowed,true);});
 const tabPage=await run.newPage();await tabPage.setViewportSize({width:1440,height:1000},1);await tabPage.goto(origin+'/article');const tabId=await tabIdOf(page,origin+'/article');
 // 每个页面在独立窗口里，扩展看到的 tab.active 恒为真；front 只把文章页窗口提到前面，开窗观察（ROAMCAT_HEADED=1）时便于看。
 const front=()=>tabPage.bringToFront(),activate=front;
 await check('Inject and toggle real content script',async()=>{await request('PAGE_UI_INJECT',{tabId});const send=async message=>{await front();return page.evaluate(({tabId,message})=>chrome.tabs.sendMessage(tabId,message,{frameId:0}),{tabId,message});};let r=await send({type:'SS_SET_ENABLED',enabled:true});assert.ok(r.ok,r.error);r=await send({type:'SS_STATUS'});assert.equal(r.data.enabled,true);r=await send({type:'SS_SET_ENABLED',enabled:false});assert.ok(r.ok,r.error);assert.equal((await send({type:'SS_STATUS'})).data.enabled,false);});
 await check('Configure and test fixture model (no external API)',async()=>{await request('STATE_PATCH',{patch:{apiServices:[{id:'audit',name:'Local audit fixture',providerId:'openai-compatible',baseUrl:origin+'/v1',model:'audit-model',apiKey:'audit-fixture-not-a-real-key',options:{}}],activeApiServiceId:'audit',providerKind:'api'}});const r=await request('PROVIDER_TEST');assert.ok(r.hint);});

 await check('Saved API service model list is retained after fetching',async()=>{await page.evaluate(s=>{location.hash='#'+s},'service');await sectionShown('service');await page.locator('#api-editor').evaluate(e=>e.open=true);
   // 编辑区刚展开时布局还在挪，点击偶尔落空（结果栏连「正在获取」都没出现）：等按钮可点、滚到视口中间再点，没反应就再点一次。
   const listButton=page.locator('#list-provider-models');await until(()=>listButton.evaluate(b=>!b.disabled&&b.getClientRects().length>0),Boolean,5000);await listButton.evaluate(b=>b.scrollIntoView({block:'center'}));await listButton.click();
   if(!String(await until(()=>page.locator('#provider-result').textContent(),t=>String(t).trim().length>0,2000)).trim())await listButton.click();
   await until(()=>page.locator('#provider-model-list option[value="audit-model"]').count(),n=>n===1,10000);assert.equal(await page.locator('#provider-model-list option[value="audit-model"]').count(),1,await page.locator('#provider-result').textContent());});
 await check('Clearing API keys through settings removes the whole pool and survives reload',async()=>{
   const before=await settings();
   try {
     await request('STATE_PATCH',{patch:{apiServices:before.apiServices.map(s=>({...s,apiKeys:[s.apiKey,'audit-second-fake-key']})),apiRouting:{translate:'audit'}}});
     await page.reload();await optionsReady();await sectionShown('service');
     assert.ok(await until(()=>page.evaluate(()=>window.optionsState?.settings.apiServices.find(s=>s.id==='audit')?.apiKeys?.length===2),Boolean));
     await page.locator('#api-editor').evaluate(e=>e.open=true);
     await page.bringToFront();
     await page.locator('#api-editor details:has(#disconnect-provider) > summary').click();
     const clear=page.locator('#disconnect-provider');await until(()=>clear.isDisabled(),value=>!value);await clear.scrollIntoViewIfNeeded();
     assert.ok(await until(()=>clear.evaluate(b=>b.closest('details').open),Boolean),'Remove-key section did not open');
     let confirmed=false;page.once('dialog',async d=>{await d.accept();confirmed=true;});
     // 清除按钮在「移除」折叠区里；先展开，再用真实键盘激活按钮。
     assert.ok(await until(()=>clear.evaluate(b=>{b.focus();return document.activeElement===b;}),Boolean),'Clear-key button did not receive focus');
     await page.keyboard.press('Enter');assert.ok(await until(()=>Promise.resolve(confirmed),Boolean),'Clear-key confirmation did not open');
     const cleared=await until(settings,s=>s.apiServices.find(row=>row.id==='audit')?.apiKeys?.length===0);
     assert.equal(cleared.apiServices.find(row=>row.id==='audit').apiKey,'',await page.locator('#global-error').textContent());
     assert.deepEqual(cleared.apiServices.find(row=>row.id==='audit').apiKeys,[]);assert.equal(cleared.activeApiServiceId,'audit');assert.equal(cleared.apiRouting.translate,'audit');
     await page.reload();await optionsReady();await sectionShown('service');assert.equal((await settings()).apiServices.find(row=>row.id==='audit').apiKey,'');assert.equal(await page.locator('#disconnect-provider').isDisabled(),true);
     const tested=await page.evaluate(()=>chrome.runtime.sendMessage({type:'PROVIDER_TEST'}));assert.equal(tested.ok,false,'A cleared service must require credentials');
     await request('STATE_PATCH',{patch:{apiServices:[...cleared.apiServices,{id:'audit-extra',name:'Extra',providerId:'openai-compatible',baseUrl:origin+'/v1',model:'audit-model',apiKey:'audit-extra-fake-key',options:{}}]}});
   } finally {await request('STATE_PATCH',{patch:{apiServices:before.apiServices,activeApiServiceId:before.activeApiServiceId,apiRouting:before.apiRouting}});}
 });
 await check('All settings sections fit a narrow window',async()=>{await page.setViewportSize({width:390,height:844});for(const section of sections){await page.evaluate(s=>{location.hash='#'+s},`${section}`);await sectionShown(section);const overflow=await page.evaluate(()=>[...document.querySelectorAll('.main-panel,.settings-section,.paper-card,.swiss-card')].filter(e=>e.getBoundingClientRect().width&&e.scrollWidth>e.clientWidth+3).map(e=>({selector:e.id||e.className,client:e.clientWidth,scroll:e.scrollWidth})));report.ui.push({theme:'narrow',section,errors:[],overflow});if(overflow.length)await page.screenshot({path:path.join(out,`narrow-${section}.png`)});}await page.setViewportSize({width:1440,height:1000});assert.equal(report.ui.filter(x=>x.theme==='narrow'&&x.overflow.length).length,0,'Some sections overflow; see report.ui');});
 await check('Reset restores preferences in storage and controls',async()=>{await request('STATE_PATCH',{patch:{assistanceMode:'on-demand',lookupDisplay:'annotation',lookupKey:'F'}});await page.goto(base+'/ui/options.html#privacy');await optionsReady();page.once('dialog',d=>d.accept());await page.locator('#reset-config').click();const state={settings:await until(settings,s=>s.assistanceMode==='ambient'&&s.lookupDisplay==='card'&&s.lookupKey==='D')};await until(()=>page.locator('#lookup-key').inputValue(),v=>v==='D');assert.equal(state.settings.assistanceMode,'ambient');assert.equal(state.settings.lookupDisplay,'card');assert.equal(state.settings.lookupKey,'D');assert.equal(await page.locator('#lookup-key').inputValue(),'D');assert.equal(await page.locator('input[name="assistance-mode"]:checked').inputValue(),'ambient');assert.equal(await page.locator('input[name="lookup-display"]:checked').inputValue(),'card');});
 await request('STATE_PATCH',{patch:{assistanceMode:'on-demand',lookupDisplay:'card',lookupKey:'F',helpLanguage:'en'}});
 const send=async message=>{await front();return page.evaluate(({tabId,message})=>chrome.tabs.sendMessage(tabId,message,{frameId:0}),{tabId,message});};
 const cdp={send:(method,params)=>tabPage.send(method,params)};
 const accessible=async()=> (await cdp.send('Accessibility.getFullAXTree')).nodes.map(n=>n.name?.value||'').join(' | ');
 async function clickAccessible(label){const tree=await cdp.send('Accessibility.getFullAXTree');const n=tree.nodes.find(n=>n.name?.value===label&&n.backendDOMNodeId);assert.ok(n,'Missing accessible control '+label);const resolved=await cdp.send('DOM.resolveNode',{backendNodeId:n.backendDOMNodeId});const {result}=await cdp.send('Runtime.callFunctionOn',{objectId:resolved.object.objectId,functionDeclaration:'function(){const b=this.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}}',returnByValue:true});await tabPage.mouse.click(result.value.x,result.value.y);}
 async function waitText(text){await front();for(let i=0;i<80;i++){const result=await accessible();if(result.includes(text))return result;await tabPage.waitForTimeout(100);}await tabPage.screenshot({path:path.join(out,'card-error.png')});throw Error('Card did not display '+text+'; '+(await accessible()).slice(-1800));}
 await check('Real hotkey opens a complete explanation card',async()=>{await request('HISTORY_CONFIG',{patch:{enabled:true,origins:[origin]}});const enabled=await send({type:'SS_SET_ENABLED',enabled:true});assert.ok(enabled.ok,enabled.error);assert.equal(enabled.data.enabled,true);await tabPage.bringToFront();await tabPage.locator('h1').click();await until(()=>tabPage.evaluate(()=>document.hasFocus()),Boolean,2000);const point=await tabPage.locator('#paragraph-0').evaluate(p=>{const n=p.firstChild,r=document.createRange(),i=n.textContent.indexOf('index');r.setStart(n,i);r.setEnd(n,i+5);const b=r.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};});await tabPage.mouse.move(point.x,point.y);await tabPage.keyboard.down('f');await tabPage.mouse.click(point.x,point.y);await tabPage.keyboard.up('f');await waitText('a lookup structure');await clickAccessible('展开本句译文');await waitText('speeds up finding records.');await waitText('数据库查询使用索引。');assert.equal(await tabPage.evaluate(()=>document.querySelector('[data-roamcat-ui="card"]')?.getAttribute('data-theme')),'light','浅色网页上的解释卡片应按网页明暗取 light 主题');await tabPage.screenshot({path:path.join(out,'real-lookup-card.png')});});
 await check('Explanation switches language and known words can be undone',async()=>{await clickAccessible('用中文说明');await waitText('用于加快查找记录。');await clickAccessible('我已认识此词');let state=await until(()=>page.evaluate(()=>chrome.storage.local.get('words')),s=>s.words?.find(w=>w.term==='index')?.knownAt>0);const word=state.words.find(w=>w.term==='index');assert.ok(word?.knownAt>0);await clickAccessible('撤销');state=await until(()=>page.evaluate(()=>chrome.storage.local.get('words')),s=>s.words?.find(w=>w.term==='index')?.knownAt===0);assert.equal(state.words.find(w=>w.term==='index').knownAt,0);});
 await check('Escape dismisses the card and inputs remain editable',async()=>{await tabPage.keyboard.press('Escape');assert.equal(await tabPage.locator('[data-roamcat-ui="card"]').count(),0);await tabPage.locator('[aria-label="Excluded input"]').fill('Typing f stays in the input');assert.equal(await tabPage.locator('[aria-label="Excluded input"]').inputValue(),'Typing f stays in the input');});
 // 右键「帮助理解选中内容」：不开整页阅读辅助也能用；单词走查词卡，跨段时在网页上说明原因（以前只在工具栏图标挂「!」）。
 const selectRange=(startId,startText,endId,endText)=>tabPage.evaluate(({startId,startText,endId,endText})=>{
   const locate=(id,text,atEnd)=>{const walker=document.createTreeWalker(document.getElementById(id),NodeFilter.SHOW_TEXT),nodes=[];let full='',node;while((node=walker.nextNode())){nodes.push([node,full.length]);full+=node.data;}const at=full.indexOf(text);if(at<0)throw new Error('text not found: '+text);const index=at+(atEnd?text.length:0);for(const [n,o] of nodes)if(index>=o&&index<=o+n.data.length)return [n,index-o];throw new Error('offset not found: '+text);};
   const [a,ai]=locate(startId,startText,false),[b,bi]=locate(endId,endText,true),range=document.createRange();range.setStart(a,ai);range.setEnd(b,bi);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);return selection.toString();
 },{startId,startText,endId,endText});
 const cardCount=()=>tabPage.locator('[data-roamcat-ui="card"]').count();
 await check('Right-click help explains a word or sentence without turning on page assist',async()=>{const off=await send({type:'SS_SET_ENABLED',enabled:false});assert.ok(off.ok,off.error);assert.equal(off.data.enabled,false);
   let result=await send({type:'SS_CONTEXT_HELP',selectionText:await selectRange('paragraph-3','database','paragraph-3','database')});assert.ok(result.ok,result.error);assert.equal(result.data.enabled,false,'right-click help must not turn on page assist');
   assert.equal(await until(cardCount,n=>n===1),1,'word did not open the lookup card');await tabPage.keyboard.press('Escape');assert.equal(await until(cardCount,n=>n===0),0);
   result=await send({type:'SS_CONTEXT_HELP',selectionText:await selectRange('paragraph-4','The database','paragraph-4','records quickly.')});assert.ok(result.ok,result.error);assert.equal(result.data.enabled,false);
   assert.equal(await until(cardCount,n=>n===1),1,'sentence did not open the explanation card');await tabPage.keyboard.press('Escape');assert.equal(await until(cardCount,n=>n===0),0);});
 await check('Right-click help says on the page why a cross-paragraph selection is refused',async()=>{const result=await send({type:'SS_CONTEXT_HELP',selectionText:await selectRange('paragraph-5','Careful readers','paragraph-6','The database')});assert.ok(result.ok,result.error);
   await waitText('选区跨了段落');assert.equal(await cardCount(),0);const on=await send({type:'SS_SET_ENABLED',enabled:true});assert.ok(on.ok,on.error);});
 await check('Displayed lookup is recorded and exportable',async()=>{const h=await until(()=>request('HISTORY_GET'),h=>h.events.length>0&&JSON.stringify(h).includes('index'));fs.writeFileSync(path.join(out,'history-fixture.json'),JSON.stringify(h,null,2));assert.ok(h.events.length>0,'No lookup event recorded');assert.ok(JSON.stringify(h).includes('index'));const exported=await request('HISTORY_EXPORT');assert.ok(exported);await request('HISTORY_CLEAR');assert.equal((await request('HISTORY_GET')).events.length,0);});
 await check('Sentence structure processes and clears real page highlights',async()=>{await tabPage.locator('h1').click();await tabPage.evaluate(()=>window.scrollTo(0,0));await activate();await request('SENTENCE_GROUPS_SET',{tabId,enabled:true});let r=await send({type:'SS_SET_SENTENCE_GROUPS',enabled:true});assert.ok(r.ok,r.error);for(let i=0;i<80;i++){r=await send({type:'SS_STATUS'});if(r.data.sentenceGroups.processed>0)break;await tabPage.waitForTimeout(150);}assert.ok(r.data.sentenceGroups.processed>0,JSON.stringify(r.data.sentenceGroups));await tabPage.screenshot({path:path.join(out,'real-sentence-structure.png')});await request('SENTENCE_GROUPS_SET',{tabId,enabled:false});r=await send({type:'SS_SET_SENTENCE_GROUPS',enabled:false});assert.ok(r.ok,r.error);assert.equal((await send({type:'SS_STATUS'})).data.sentenceGroups.enabled,false);});
 await check('Whole-page translation renders and can be cleared',async()=>{await activate();await request('PAGE_UI_INJECT',{tabId});const {token}=await request('EMERGENCY_BEGIN',{tabId,url:origin+'/article'});let r=await send({type:'SS_EMERGENCY_START',token,resume:false});assert.ok(r.ok,r.error);await tabPage.locator('[data-roamcat-ui="emergency-translation"]').first().waitFor({state:'visible',timeout:15000});await tabPage.locator('nav [data-roamcat-ui="emergency-translation"]').first().waitFor({state:'attached',timeout:15000});await tabPage.screenshot({path:path.join(out,'real-page-translation.png')});r=await send({type:'SS_EMERGENCY_END'});assert.ok(r.ok,r.error);assert.equal(await tabPage.locator('[data-roamcat-ui="emergency-translation"]').count(),0);});
 // 「双语 / 仅译文」：左下角切换真实点击；仅译文时原文行收起、译文在前且可见，偏好写入后台；切回双语后原样恢复，清除翻译后切换按钮消失。
 await check('Translation-only toggle hides originals and restores bilingual',async()=>{await activate();const {token}=await request('EMERGENCY_BEGIN',{tabId,url:origin+'/article'});let r=await send({type:'SS_EMERGENCY_START',token,resume:false});assert.ok(r.ok,r.error);await tabPage.locator('article p [data-roamcat-ui="emergency-translation"]').first().waitFor({state:'visible',timeout:15000});await tabPage.locator('[data-roamcat-ui="translation-display"]').waitFor({state:'attached',timeout:5000});
   const layout=()=>tabPage.evaluate(()=>[...document.querySelectorAll('article p')].filter(p=>p.querySelector(':scope>[data-roamcat-ui="emergency-translation"]')).map(p=>{const t=p.querySelector(':scope>[data-roamcat-ui="emergency-translation"]'),first=[...p.childNodes].find(n=>n.nodeType===1||n.nodeValue.trim()),pr=p.getBoundingClientRect(),tr=t.getBoundingClientRect(),cs=getComputedStyle(p);return {hidden:p.hasAttribute('data-roamcat-original-hidden'),leading:first===t,collapsed:pr.height<=tr.height+parseFloat(cs.paddingTop)+parseFloat(cs.paddingBottom)+1,visible:tr.height>0&&getComputedStyle(t).webkitTextFillColor!=='rgba(0, 0, 0, 0)',fill:cs.webkitTextFillColor,margin:cs.marginBottom,size:[Math.round(pr.height),Math.round(tr.height),Math.round(tr.top-pr.top)],kids:[...p.childNodes].map(n=>n.nodeType===1?n.tagName+'.'+(n.getAttribute('data-roamcat-ui')||'')+':'+getComputedStyle(n).display:'#'+n.nodeValue.length).join(' ').slice(0,160)};}));
   const bilingual=await layout();assert.ok(bilingual.length>0&&bilingual.every(p=>!p.hidden&&!p.leading&&!p.collapsed),JSON.stringify(bilingual));
   await clickAccessible('仅译文');const only=await until(layout,list=>list.length>0&&list.every(p=>p.hidden));assert.ok(only.every(p=>p.hidden&&p.leading&&p.collapsed&&p.visible&&p.fill==='rgba(0, 0, 0, 0)'),JSON.stringify(only));assert.equal(only[0].margin,bilingual[0].margin,'段距不应随仅译文改变');
   assert.equal((await until(settings,s=>s.pageTranslationDisplay==='translation')).pageTranslationDisplay,'translation');await tabPage.screenshot({path:path.join(out,'real-page-translation-only.png')});
   await clickAccessible('双语');const back=await until(layout,list=>list.every(p=>!p.hidden&&!p.leading));assert.ok(back.every(p=>!p.hidden&&!p.leading&&!p.collapsed),JSON.stringify(back));assert.equal((await until(settings,s=>s.pageTranslationDisplay==='bilingual')).pageTranslationDisplay,'bilingual');
   r=await send({type:'SS_EMERGENCY_END'});assert.ok(r.ok,r.error);assert.equal(await tabPage.locator('[data-roamcat-ui="translation-display"]').count(),0);assert.equal(await tabPage.locator('[data-roamcat-original-hidden]').count(),0);});
 await check('Translation-only keeps list markers and leaves nested lists, link-only and media paragraphs bilingual',async()=>{const richPage=await run.newPage();try{await richPage.setViewportSize({width:1200,height:1000},1);await richPage.goto(origin+'/rich');const richId=await tabIdOf(page,origin+'/rich');const sendRich=message=>page.evaluate(({tabId,message})=>chrome.tabs.sendMessage(tabId,message,{frameId:0}),{tabId:richId,message});
   await request('PAGE_UI_INJECT',{tabId:richId});const {token}=await request('EMERGENCY_BEGIN',{tabId:richId,url:origin+'/rich'});const r=await sendRich({type:'SS_EMERGENCY_START',token,resume:false});assert.ok(r.ok,r.error);
   const probe=()=>richPage.evaluate(()=>{const info=selector=>{const el=document.querySelector(selector),t=el.querySelector(':scope>[data-roamcat-ui="emergency-translation"]'),cs=getComputedStyle(el);return {hidden:el.hasAttribute('data-roamcat-original-hidden'),translated:Boolean(t),marker:t?getComputedStyle(t,'::before').content:'',margin:cs.marginBottom,width:Math.round(el.getBoundingClientRect().width)};};return Object.fromEntries(Object.entries({bullet:'#bullets li',step:'#steps li',outer:'#nested>li',inner:'#nested li li',linked:'#linked',linkonly:'#linkonly',media:'#media',spacing:'#em-spacing'}).map(([key,selector])=>[key,info(selector)]));});
   const before=await until(probe,v=>Object.values(v).every(item=>item.translated),15000);assert.ok(Object.values(before).every(item=>item.translated&&!item.hidden),JSON.stringify(before));
   // 原文用 <br> 分行、模型把换行写成字面「\n」两个字符时，译文照原文分行，不露出反斜杠；失败提示放在大号标题里也保持界面小字号。
   const breaks=await until(()=>richPage.evaluate(()=>{const t=document.querySelector('#breaks>[data-roamcat-ui="emergency-translation"]');if(!t)return null;const status=document.createElement('span');status.setAttribute('data-roamcat-status','block');status.textContent='本段未译完 ';const button=document.createElement('button');button.textContent='重试这一段';status.append(button);t.append(status);const result={brs:t.querySelectorAll('br').length,backslash:t.textContent.includes(String.fromCharCode(92)),status:getComputedStyle(status).fontSize,button:getComputedStyle(button).fontSize,heading:getComputedStyle(t).fontSize};status.remove();return result;}),Boolean,15000);
   assert.ok(breaks&&breaks.brs===1&&!breaks.backslash,'译文换行 '+JSON.stringify(breaks));assert.ok(breaks.status==='13px'&&breaks.button==='13px'&&breaks.heading!=='13px','失败提示字号 '+JSON.stringify(breaks));
   await request('PAGE_TRANSLATION_DISPLAY_SET',{display:'translation'});const only=await until(probe,v=>v.bullet.hidden&&v.spacing.hidden);
   assert.ok(only.bullet.hidden&&only.bullet.marker.includes('disc'),'无序列表符号 '+JSON.stringify(only.bullet));assert.ok(only.step.hidden&&/^counter\(list-item(, decimal)?\) "\."$/u.test(only.step.marker),'有序列表序号 '+JSON.stringify(only.step));assert.ok(only.inner.hidden&&only.inner.marker.includes('circle'),'嵌套列表内层 '+JSON.stringify(only.inner));
   assert.equal(only.outer.hidden,false,'含嵌套列表的列表项保持双语');assert.equal(only.linked.hidden,true,'正文里夹链接的段落改为仅译文');assert.equal(only.linkonly.hidden,false,'纯链接保持双语');assert.equal(only.media.hidden,false,'带图片的段落保持双语');
   assert.ok(only.spacing.hidden&&only.spacing.margin===before.spacing.margin&&only.spacing.width===before.spacing.width,'em 段距与行宽 '+JSON.stringify([before.spacing,only.spacing]));await richPage.screenshot({path:path.join(out,'real-page-translation-only-rich.png')});
   await request('PAGE_TRANSLATION_DISPLAY_SET',{display:'bilingual'});assert.ok(Object.values(await until(probe,v=>Object.values(v).every(item=>!item.hidden))).every(item=>!item.hidden),'切回双语后全部恢复');await sendRich({type:'SS_EMERGENCY_END'});
 }finally{await request('PAGE_TRANSLATION_DISPLAY_SET',{display:'bilingual'}).catch(()=>{});await richPage.close().catch(()=>{});}});
 await check('Long paragraphs restore inline code only in its source chunk, including the 4000-character boundary',async()=>{
   const codePage=await run.newPage();
   try {
     const url=origin+'/article?long-code';await codePage.goto(url);
     await codePage.evaluate(()=>{
       const code=text=>{const node=document.createElement('code');node.textContent=text;return node;};
       const long=document.createElement('p');long.id='long-code';
       long.append('Readers inspect the first command before applying a database change. ',code('first_command()'),' Careful readers compare evidence before they reach a conclusion.'.repeat(85),code('second_command()'),' Then they apply the final command carefully.');
       const boundary=document.createElement('p');boundary.id='boundary-code';
       boundary.append('Readers inspect this command before applying the database change. '.padEnd(3998,'x'),code('boundary_command()'),' Then readers apply ',code('last_command()'),' after checking the complete result.');
       document.querySelector('article').replaceChildren(long,boundary);
     });
     const codeTab=await tabIdOf(page,url);await request('PAGE_UI_INJECT',{tabId:codeTab});
     const {token}=await request('EMERGENCY_BEGIN',{tabId:codeTab,url});
     const start=await page.evaluate(({tabId,token})=>chrome.tabs.sendMessage(tabId,{type:'SS_EMERGENCY_START',token,resume:false},{frameId:0}),{tabId:codeTab,token});assert.ok(start.ok,start.error);
     const probe=()=>codePage.evaluate(()=>['long-code','boundary-code'].map(id=>[...(document.querySelector('#'+id+' > [data-roamcat-ui="emergency-translation"]')?.children||[])].map(part=>[...part.querySelectorAll('code')].map(code=>code.textContent))));
     // 页面按可见范围翻译；先等第一段完成，再滚动到边界段，触发正常的邻近段调度。
     await until(probe,rows=>rows[0].length===2&&rows[0].flat().length>=2,15000);
     await codePage.locator('#boundary-code').scrollIntoViewIfNeeded();
     const result=await until(probe,rows=>rows.every(parts=>parts.length===2&&parts.flat().length>=2),15000);
     assert.deepEqual(result,[[['first_command()'],['second_command()']],[[],['boundary_command()','last_command()']]]);
   } finally {await codePage.close();}
 });
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
   await tabPage.bringToFront();await tabPage.mouse.move(pos.x,pos.y);await tabPage.mouse.down();await tabPage.mouse.move(pos.x-50,pos.y-40,{steps:8});await tabPage.mouse.up();
   const after=await until(async()=>(await settings()).floatingPet.position,p=>JSON.stringify(p)!==JSON.stringify(before));assert.notDeepEqual(after,before);
   await request('STATE_PATCH',{patch:{floatingPet:{enabled:false}}});await tabPage.reload();await request('PAGE_UI_INJECT',{tabId});/* 观察窗口：断言的是关掉伴读猫后「不会」注入，只能留出注入生效的时间再看。 */await tabPage.waitForTimeout(300);assert.equal(await tabPage.locator('#roamcat-pet-host').count(),0);
   await request('STATE_PATCH',{patch:{floatingPet:{enabled:true}}});await tabPage.locator('#roamcat-pet-host').waitFor({state:'attached'});const [{result:visible}]=await page.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:()=>globalThis.RoamCatPet.avatarWrap.getBoundingClientRect().width>0}),tabId);assert.equal(visible,true);assert.deepEqual((await request('STATE_GET')).settings.floatingPet.position,after);
 });
 await verifyMtRegressions({run,control:page,request,check});
 await check('Welcome page and interactive samples load',async()=>{await page.goto(base+'/ui/welcome.html');assert.ok(await until(()=>page.locator('#welcome-hero-title').isVisible().catch(()=>false),Boolean));await page.screenshot({path:path.join(out,'welcome.png')});});
 await page.pump();
}catch(e){report.failures.push({name:'audit run',error:e.message});console.error(e);}
finally{await run.close();server.close();fs.rmSync(extension,{recursive:true,force:true,maxRetries:5,retryDelay:300});noteScreenshots(report);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(report.failures.length||report.pageErrors.length)process.exitCode=1;console.log(JSON.stringify({passed:report.checks.length,failures:report.failures,pageErrors:report.pageErrors,warnings:report.warnings||[],uiIssues:report.ui.filter(x=>x.errors.length||x.overflow.length)},null,2));printGateSummary('audit',report.checks.length,report.failures.length+report.pageErrors.length);}
