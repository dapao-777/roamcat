/**
 * @file 性能回归门禁：真实扩展的惰性注入、正文增量失效、历史采集、阅读分页、翻译调度与后台休眠。
 * 主要内容：2000 段无语义根 fixture；翻译部分接本地假接口（OpenAI 兼容模型与 DeepLX，不用真实密钥或额度）：
 *   千行表格只换 class 不重建上下文、流式译文不重复写页面、后台按场景分道与服务并发、机翻逐条交付、阅读器鉴权失败即停。
 *   原始结果写 preview/performance/。
 * 模块边界：使用 tools/lib/ego.mjs 的独立 ego lite；先 npm run build。
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {openBrowser,extUrl,tabIdOf,sleep,previewPath,DIST,gateArgs} from './lib/ego.mjs';
import {printGateSummary} from './lib/gate-report.mjs';

const extensionDir=path.resolve(process.env.ROAMCAT_PERF_EXTENSION_DIR||DIST);
const out=process.env.ROAMCAT_PERF_REPORT_DIR?path.resolve(process.env.ROAMCAT_PERF_REPORT_DIR):previewPath('performance');fs.mkdirSync(out,{recursive:true});
const report={checks:[],failures:[],errors:[],measurements:{}};
const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
const paragraph='The database uses an index to find records quickly. A cache reduces latency when requests repeat. Careful readers compare the evidence before they reach a conclusion. ';
const fixture=`<!doctype html><html lang="en"><head><title>Performance fixture</title><style>body{margin:0;font:16px/1.7 Georgia;background:white;color:#222}#feed{width:760px;margin:30px auto}p{margin:0 0 20px}</style></head><body><div id="feed"><h1>How readers understand evidence</h1>${Array.from({length:2000},(_,i)=>`<div><div><p>${paragraph}<em>Section ${i} explores the results.</em></p></div></div>`).join('')}</div></body></html>`;
// 翻译用的本地假接口：/v1 为 OpenAI 兼容模型（json 定时返回 / sse 每 12ms 流 4 个字符 / auth 一律 401），/translate 为 DeepLX。
const model={mode:'json',delay:120,calls:[],active:0,peak:0,holdBulk:false,held:new Map()},mt={delay:120,calls:[],active:0,peak:0};
const sentence=i=>`The database uses an index to find records quickly. Section ${i} compares evidence before reaching a conclusion.`;
const htmlPage=(body,title='Translation fixture')=>`<!doctype html><html lang="en"><head><title>${title}</title><style>body{margin:0;color:#222;background:white;font:16px/1.7 Georgia}main{max-width:760px;margin:20px auto}p{margin:0 0 20px}.pulse{color:#222}td{padding:8px}</style></head><body><main><article><h1>How database readers compare evidence</h1>${body}</article></main></body></html>`;
const tableFixture=n=>htmlPage(`<table><thead><tr><th>Item</th><th>Evidence</th></tr></thead><tbody>${Array.from({length:n},(_,i)=>`<tr><td>Item ${i}</td><td>${sentence(i)}</td></tr>`).join('')}</tbody></table>`);
const streamFixture=n=>htmlPage(Array.from({length:n},(_,i)=>`<p>${sentence(i)}</p>`).join(''));
async function fakeService(req,res){
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);res.setHeader('Access-Control-Allow-Origin','*');
  const track=async(state,entry,work)=>{state.calls.push(entry);state.active++;state.peak=Math.max(state.peak,state.active);try{await work();}finally{entry.end=performance.now();state.active--;}};
  if(req.url==='/translate'){await track(mt,{start:performance.now(),text:body.text},()=>sleep(mt.delay));res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({code:200,data:'这是已经完成的机器翻译。'}));return;}
  const content=body.messages.at(-1).content,request=JSON.parse(content.slice(content.indexOf('{'))),items=request.items||[];
  if(request.probe){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({choices:[{message:{content:JSON.stringify(request)},finish_reason:'stop'}]}));return;}
  const result=JSON.stringify({items:items.map(item=>({id:item.id,translation:'这是翻译完成的段落，读者正在比较数据库中的证据。'}))});
  await track(model,{start:performance.now(),ids:items.map(item=>item.id),items},async()=>{
    if(model.mode==='auth'){res.writeHead(401,{'Content-Type':'application/json'}).end(JSON.stringify({error:{message:'fixture unauthorized'}}));return;}
    if(model.mode==='sse'){
      res.writeHead(200,{'Content-Type':'text/event-stream'});
      for(let i=0;i<result.length;i+=4){res.write('data: '+JSON.stringify({choices:[{delta:{content:result.slice(i,i+4)},finish_reason:null}]})+'\n\n');await sleep(12);}
      res.end('data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');return;
    }
    if(model.holdBulk&&['bulk0','bulk1'].includes(items[0]?.id))await new Promise(resolve=>model.held.set(items[0].id,resolve));
    else await sleep(model.delay);
    res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({choices:[{message:{content:result},finish_reason:'stop'}]}));
  });
}
const server=http.createServer((req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}).end();return;}
  if(req.method==='POST'){void fakeService(req,res).catch(error=>{report.errors.push('fake service: '+error.message);res.writeHead(500).end();});return;}
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/favicon.ico')res.writeHead(204).end();
  else res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(url.pathname==='/table'?tableFixture(Number(url.searchParams.get('n'))):url.pathname==='/stream'?streamFixture(16):fixture);
});
function pdfFixture(pages){
  const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Count ${pages} /Kids [${Array.from({length:pages},(_,i)=>(4+i*2)+' 0 R').join(' ')}] >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for(let i=0;i<pages;i++){const stream=`BT /F1 12 Tf 50 750 Td (PDF fixture page ${i+1} contains readable English evidence.) Tj ET`;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);}
  let value='%PDF-1.4\n',offsets=[0];for(const [index,object]of objects.entries()){offsets.push(value.length);value+=`${index+1} 0 obj\n${object}\nendobj\n`;}
  const start=value.length;value+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return [...Buffer.from(value)];
}
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
let run;
async function check(name,fn){try{const result=await fn();report.checks.push({name,result});console.log('PASS '+name+(result?' '+JSON.stringify(result):''));}catch(error){report.failures.push({name,error:error.stack});console.error('FAIL '+name+': '+error.message);}save();}
try{
  run=await openBrowser({extension:extensionDir});let control=run.page;await control.goto(extUrl('local-inference/offscreen.html'));
  const request=async(type,payload={})=>{const response=await control.evaluate(message=>chrome.runtime.sendMessage(message),{type,...payload});assert.ok(response.ok,response.error);return response.data;};
  await request('STATE_PATCH',{patch:{providerKind:'api',assistanceMode:'on-demand',domain:'general',floatingPet:{enabled:false}}});
  const page=await run.newPage();page.on('pageerror',error=>report.errors.push(error.message));await page.setViewportSize({width:1280,height:900},1);await page.goto(origin+'/article');
  const tabId=await tabIdOf(control,origin+'/*');
  const inContent=async(operation)=>{
    const frames=await control.evaluate(({tabId,operation})=>chrome.scripting.executeScript({target:{tabId},func:async operation=>{
      const api=globalThis.__ROAMCAT_CONTENT__;
      if(operation==='stats')return api?.stats();
      if(operation==='passive')return {bootstrap:Boolean(globalThis.__ROAMCAT_BOOTSTRAP__?.alive?.()),engine:Boolean(api)};
      const started=performance.now(),source=await api.getArticleSummarySource();return {ms:performance.now()-started,source,stats:api.stats()};
    },args:[operation]}),{tabId,operation});return frames[0].result;
  };
  await check('未开启功能的普通网页只加载轻量引导',async()=>{
    const state=await inContent('passive');assert.equal(state.bootstrap,true);assert.equal(state.engine,false);
    const manifest=JSON.parse(fs.readFileSync(path.join(extensionDir,'manifest.json'),'utf8'));const files=manifest.content_scripts[0].js;
    assert.deepEqual(files,['page-bootstrap.js']);const bytes=fs.statSync(path.join(extensionDir,files[0])).size;assert.ok(bytes<4096);return {bytes};
  });
  await request('PAGE_UI_INJECT',{tabId});
  await check('长页面正文暖态读取复用索引',async()=>{
    const samples=[];for(let i=0;i<5;i++)samples.push(await inContent('summary'));
    assert.equal(samples[0].stats.indexedBlocks,2001);assert.ok(samples[0].source.text.includes('database uses an index'));
    const warm=samples.slice(1);for(const item of warm){assert.equal(item.stats.measuredBlocks,samples[0].stats.measuredBlocks);assert.ok(item.ms<50,'缓存正文读取不应出现长任务');}
    const data={coldMs:samples[0].ms,warmMs:warm.map(item=>item.ms),measuredBlocks:samples[0].stats.measuredBlocks};report.measurements.reading=data;return data;
  });
  await check('追加、修改、隐藏、显示与移除只重新度量变化块',async()=>{
    const before=await inContent('stats');
    await page.evaluate(text=>{const node=document.createElement('div');node.id='added';node.innerHTML='<p></p>';node.firstChild.textContent=text;document.getElementById('feed').append(node);},paragraph);
    const added=await inContent('summary');assert.equal(added.stats.indexedBlocks,2002);assert.ok(added.stats.measuredBlocks-before.measuredBlocks<12);
    await page.evaluate(()=>{document.querySelector('#feed p').firstChild.nodeValue='Updated evidence should appear in the summary. '+document.querySelector('#feed p').firstChild.nodeValue;});
    const changed=await inContent('summary');assert.ok(changed.source.text.includes('Updated evidence'));assert.ok(changed.stats.measuredBlocks-added.stats.measuredBlocks<12);
    await page.evaluate(()=>{document.getElementById('added').hidden=true;});assert.equal((await inContent('summary')).stats.indexedBlocks,2001);
    await page.evaluate(()=>{document.getElementById('added').hidden=false;});assert.equal((await inContent('summary')).stats.indexedBlocks,2002);
    await page.evaluate(()=>{document.getElementById('added').remove();});assert.equal((await inContent('summary')).stats.indexedBlocks,2001);
    return {appendRemeasured:added.stats.measuredBlocks-before.measuredBlocks,editRemeasured:changed.stats.measuredBlocks-added.stats.measuredBlocks};
  });
  await check('开放 shadow root 的后续文本变更使缓存失效',async()=>{
    await page.evaluate(text=>{const host=document.createElement('div');host.id='shadow-host';host.attachShadow({mode:'open'}).innerHTML='<p>'+text+'</p>';document.getElementById('feed').append(host);},paragraph);
    assert.equal((await inContent('summary')).stats.indexedBlocks,2002);
    const before=await inContent('stats');
    await page.evaluate(()=>{document.getElementById('shadow-host').shadowRoot.querySelector('p').textContent='非英文内容';});
    const after=await inContent('summary');assert.equal(after.stats.indexedBlocks,2001);assert.ok(after.stats.measuredBlocks-before.measuredBlocks<12);
    await page.evaluate(()=>document.getElementById('shadow-host').remove());await inContent('summary');
  });
  await check('页面样式表改变可见正文时使缓存失效',async()=>{
    await page.evaluate(()=>{const style=document.createElement('style');style.id='page-style-fixture';style.textContent='#feed > div:first-of-type{display:none}';document.head.append(style);});
    assert.equal((await inContent('summary')).stats.indexedBlocks,2000);
    await page.evaluate(()=>{document.getElementById('page-style-fixture').textContent='#feed > div:first-of-type{display:block}';});
    assert.equal((await inContent('summary')).stats.indexedBlocks,2001);
    await page.evaluate(()=>document.getElementById('page-style-fixture').remove());await inContent('summary');
  });
  await check('历史采集复用正文索引且实际记录可见单词',async()=>{
    await request('HISTORY_CONFIG',{patch:{enabled:true,origins:[origin]}});
    const enabled=await control.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'SS_SET_ENABLED',enabled:true}),tabId);assert.ok(enabled.ok,enabled.error);
    await page.bringToFront();await page.locator('h1').click();await page.send('Performance.enable');
    const before=await page.send('Performance.getMetrics'),stats=await inContent('stats');await sleep(4300);const after=await page.send('Performance.getMetrics');
    const prior=Object.fromEntries(before.metrics.map(metric=>[metric.name,metric.value])),next=Object.fromEntries(after.metrics.map(metric=>[metric.name,metric.value]));
    const scriptMs=(next.ScriptDuration-prior.ScriptDuration)*1000;assert.ok(scriptMs<250,'历史采集的 4.3 秒空闲窗口不应消耗 250ms 主线程脚本');
    assert.equal((await inContent('stats')).measuredBlocks,stats.measuredBlocks);
    const history=await request('HISTORY_GET');assert.ok(history.metrics.words>0,'可见词统计未写入');
    report.measurements.history={scriptMs,words:history.metrics.words};return report.measurements.history;
  });
  await request('HISTORY_CONFIG',{patch:{enabled:false}});await control.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'SS_SET_ENABLED',enabled:false}),tabId);
  await check('自动辅助会随外部样式变化更新可读正文',async()=>{
    await request('STATE_PATCH',{patch:{assistanceMode:'ambient'}});
    const enabled=await control.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'SS_SET_ENABLED',enabled:true}),tabId);assert.ok(enabled.ok,enabled.error);
    await page.evaluate(()=>{const style=document.createElement('style');style.id='automatic-style-fixture';style.textContent='#feed > div:first-of-type{display:none}';document.head.append(style);});
    let stats;for(let i=0;i<60;i++){stats=await inContent('stats');if(stats.indexedBlocks===2000)break;await sleep(100);}assert.equal(stats.indexedBlocks,2000);
    await page.evaluate(()=>document.getElementById('automatic-style-fixture').remove());
    for(let i=0;i<60;i++){stats=await inContent('stats');if(stats.indexedBlocks===2001)break;await sleep(100);}assert.equal(stats.indexedBlocks,2001);
    await control.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'SS_SET_ENABLED',enabled:false}),tabId);
    await request('STATE_PATCH',{patch:{assistanceMode:'on-demand'}});
  });
  // 网页持续给正文元素切换 class（滚动动画、轮播、「直播中」徽标）不该让自动辅助整体重建；真正隐藏正文块时仍要重排。
  await check('正文元素反复切换 class 不触发重建，隐藏正文块仍会重排',async()=>{
    await request('STATE_PATCH',{patch:{assistanceMode:'ambient'}});
    const enabled=await control.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'SS_SET_ENABLED',enabled:true}),tabId);assert.ok(enabled.ok,enabled.error);
    let stats;for(let i=0;i<60;i++){stats=await inContent('stats');if(stats.indexedBlocks===2001)break;await sleep(100);}assert.equal(stats.indexedBlocks,2001);
    await sleep(800);const settled=(await inContent('stats')).rebuilds;
    for(let i=0;i<12;i++){await page.evaluate(()=>document.querySelector('#feed em').classList.toggle('live'));await sleep(120);}
    await sleep(800);const churned=(await inContent('stats')).rebuilds;assert.equal(churned,settled,'只切换 class、可读正文不变时不应重建');
    await page.evaluate(()=>{document.querySelectorAll('#feed > div')[1].hidden=true;});
    for(let i=0;i<40;i++){stats=await inContent('stats');if(stats.rebuilds>churned&&stats.indexedBlocks===2000)break;await sleep(100);}
    assert.equal(stats.indexedBlocks,2000);assert.ok(stats.rebuilds>churned,'隐藏正文块后应重排');
    await page.evaluate(()=>{document.querySelectorAll('#feed > div')[1].hidden=false;document.querySelector('#feed em').classList.remove('live');});
    for(let i=0;i<40;i++){stats=await inContent('stats');if(stats.indexedBlocks===2001)break;await sleep(100);}
    await control.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'SS_SET_ENABLED',enabled:false}),tabId);
    await request('STATE_PATCH',{patch:{assistanceMode:'on-demand'}});
    return {classToggles:12,rebuildsDuringToggles:churned-settled,rebuildsAfterHide:stats.rebuilds-churned};
  });
  await check('长难句和公式开关经真实后台同步到网页，并可关闭后重新开启',async()=>{
    await page.evaluate(()=>{
      const fixture=document.createElement('div');fixture.id='assistance-preferences-fixture';
      const complex=document.createElement('p');complex.textContent='Although the committee had reviewed the proposal which the board submitted last quarter, it decided that further evidence was required before any vote could proceed.';
      const formula=document.createElement('p');formula.textContent='Careful readers compare the relation $x^2 + y^2 = z^2$ with the evidence in the article.';
      fixture.append(complex,formula);document.querySelector('#feed').append(fixture);
    });
    const count=()=>page.evaluate(()=>({complex:document.querySelectorAll('#assistance-preferences-fixture .roamcat-complex').length,formula:document.querySelectorAll('#assistance-preferences-fixture .roamcat-formula').length}));
    try{
      await request('STATE_PATCH',{patch:{assistanceMode:'ambient',complexSentenceAssist:true,formulaAssist:true}});
      const enabled=await control.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'SS_SET_ENABLED',enabled:true}),tabId);assert.ok(enabled.ok,enabled.error);
      await page.waitForFunction(()=>document.querySelector('#assistance-preferences-fixture .roamcat-complex')&&document.querySelector('#assistance-preferences-fixture .roamcat-formula'));
      const before=await count();
      await request('STATE_PATCH',{patch:{complexSentenceAssist:false,formulaAssist:false}});
      await page.waitForFunction(()=>!document.querySelector('#assistance-preferences-fixture :is(.roamcat-complex,.roamcat-formula)'));
      assert.deepEqual(await count(),{complex:0,formula:0});
      await request('STATE_PATCH',{patch:{complexSentenceAssist:true,formulaAssist:true}});
      await page.waitForFunction(()=>document.querySelector('#assistance-preferences-fixture .roamcat-complex')&&document.querySelector('#assistance-preferences-fixture .roamcat-formula'));
      return {before,restored:await count()};
    }finally{
      await control.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'SS_SET_ENABLED',enabled:false}),tabId);
      await page.evaluate(()=>document.getElementById('assistance-preferences-fixture')?.remove());
      await request('STATE_PATCH',{patch:{assistanceMode:'on-demand',complexSentenceAssist:true,formulaAssist:true}});
    }
  });
  const reader=await run.newPage();await reader.goto(extUrl('ui/reader.html'));await reader.waitForFunction(()=>Boolean(document.querySelector('roamcat-reader')?.finishLoad));
  await check('大文档 DOM 有界、分页和目录跳转保留译文',async()=>{
    const result=await reader.evaluate(async paragraph=>{
      const app=document.querySelector('roamcat-reader'),blocks=Array.from({length:15000},(_,i)=>({id:'b'+i,role:'p',text:paragraph+i,anchor:i%100===0?'s'+i:''}));
      const at=performance.now();app.finishLoad('Performance book','epub',[{anchor:'s14900',label:'Final chapter'}],blocks);await app.updateComplete;app.querySelector('.reader-flow').getBoundingClientRect();
      const renderMs=performance.now()-at,count=app.querySelectorAll('.reader-block').length;
      app.translations=new Map([['b0','First translation'],['b14900','Last translation']]);await app.updateComplete;
      const first=app.querySelector('.reader-translation')?.textContent;
      await app.scrollTo('s14900');const finalVisible=Boolean(app.querySelector('#s14900')),last=app.querySelector('.reader-translation')?.textContent;
      await app.changePage(0);return {count,renderMs,first,finalVisible,last,restored:app.querySelector('.reader-translation')?.textContent};
    },paragraph);
    assert.ok(result.count<=80);assert.equal(result.first,'First translation');assert.equal(result.finalVisible,true);assert.equal(result.last,'Last translation');assert.equal(result.restored,'First translation');report.measurements.reader=result;return result;
  });
  await reader.screenshot({path:path.join(out,'reader-paged.png')});
  await check('分页按钮可用键盘切换',async()=>{await reader.locator('.reader-pager button').nth(1).focus();await reader.keyboard.press('Enter');assert.equal(await reader.evaluate(()=>document.querySelector('roamcat-reader').pageIndex),1);});
  await check('真实 EPUB worker 载入并释放线程，换书取消旧结果',async()=>{
    const files={'META-INF/container.xml':'<container><rootfile full-path="content.opf"/></container>','content.opf':'<package><metadata><dc:title>Worker book</dc:title></metadata><manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>','c.xhtml':'<body><h1>Worker chapter</h1><p>'+paragraph+'</p></body>'};
    const bytes=zipSync(Object.fromEntries(Object.entries(files).map(([name,text])=>[name,strToU8(text)])));
    const result=await reader.evaluate(async bytes=>{const app=document.querySelector('roamcat-reader');await app.openData(Uint8Array.from(bytes),'worker.epub');await app.updateComplete;const title=app.title,text=app.blocks.at(-1).text;const old=app.openData(Uint8Array.from(bytes),'old.epub').catch(error=>error.name);await app.openData(Uint8Array.from(bytes),'new.epub');await old;return {title,text,aborted:app._loadController.signal.aborted};},[...bytes]);
    assert.equal(result.title,'Worker book');assert.ok(result.text.includes('database'));assert.equal(result.aborted,false);return {title:result.title};
  });
  await check('PDF 在后续页面仍解析时已呈现首批正文',async()=>{
    const result=await reader.evaluate(async bytes=>{
      const app=document.querySelector('roamcat-reader');let first=0;
      const observer=new MutationObserver(()=>{if(!first&&app.view==='ready'&&app.kind==='pdf'&&app.parsing)first=app.blocks.length;});observer.observe(app,{subtree:true,childList:true,characterData:true});
      try{await app.openData(Uint8Array.from(bytes),'progressive.pdf');await app.updateComplete;return {first,blocks:app.blocks.length,pages:app.sidebar.length,parsing:app.parsing};}finally{observer.disconnect();}
    },pdfFixture(120));
    assert.ok(result.first>0&&result.first<result.blocks);assert.equal(result.pages,120);assert.equal(result.parsing,false);return result;
  });
  // ---- 翻译调度：本地假接口，按状态轮询，不用固定等待 ----
  const until=async(probe,accept,label,timeout=15000)=>{const deadline=Date.now()+timeout;for(;;){const value=await probe();if(accept(value))return value;if(Date.now()>deadline)throw new Error(label+' 超时：'+JSON.stringify(value));await sleep(25);}};
  const service=maxConcurrency=>({apiServices:[{id:'perf',name:'Local performance fixture',providerId:'openai-compatible',baseUrl:origin+'/v1',model:'perf-model',apiKey:'fixture-not-a-real-key',maxConcurrency,options:{}}],activeApiServiceId:'perf'});
  const emergency=async()=>(await inContent('stats')).emergency;
  const emergencyStatus=()=>control.evaluate(async tabId=>(await chrome.scripting.executeScript({target:{tabId},func:()=>globalThis.__ROAMCAT_CONTENT__.emergencyStatus()}))[0].result,tabId);
  // 从网页内容脚本所在的隔离环境发消息，sender 才是这个标签页；done 记下回包时刻，与进度监听同一时钟。
  const fromTab=(message,target=tabId)=>control.evaluate(async({tabId,message})=>(await chrome.scripting.executeScript({target:{tabId},func:async message=>{const result=await chrome.runtime.sendMessage(message);globalThis.__perfDone=performance.now();return result;},args:[message]}))[0].result,{tabId:target,message});
  const openPage=async url=>{await page.goto(url);await request('PAGE_UI_INJECT',{tabId});};
  const startPageTranslation=async()=>{const {token}=await request('EMERGENCY_BEGIN',{tabId,url:await page.url()});const result=await control.evaluate(({tabId,token})=>chrome.tabs.sendMessage(tabId,{type:'SS_EMERGENCY_START',token,resume:false},{frameId:0}),{tabId,token});assert.ok(result?.ok,result?.error);};
  const endPageTranslation=async()=>{await control.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'SS_EMERGENCY_END'},{frameId:0}),tabId);await until(emergency,value=>!value,'结束整页翻译');};
  await request('STATE_PATCH',{patch:service(2)});
  // 回归：表格单元格的上下文曾逐格回扫前面所有行，且任意 class 变化都整表重建，1000 行表每次切换约卡 1 秒。
  await check('千行表格整页翻译：单元格只换 class 不重建上下文，表头改了才重建',async()=>{
    await openPage(origin+'/table?n=1000');model.mode='json';model.delay=60;model.calls=[];
    try{
      await startPageTranslation();
      const initial=await until(emergency,value=>value?.scans>=1,'首轮扫描');assert.ok(initial.units>1000);
      const cell=(await until(()=>model.calls,calls=>calls.some(call=>call.items.some(item=>/Section \d+ compares/.test(item.text))),'首批表格请求')).flatMap(call=>call.items).find(item=>/Section \d+ compares/.test(item.text));
      assert.equal(cell.context?.before,'Evidence','数据格的上下文要带上它的列表头');
      const settled=await emergency(),toggles=[];
      for(let i=0;i<10;i++){
        const scans=(await emergency()).scans;
        await page.evaluate(()=>document.querySelector('tbody tr:nth-child(3) td:last-child').classList.toggle('pulse'));
        toggles.push((await until(emergency,value=>value.scans>scans,'class 变化后的增量扫描')).lastScanMs);
      }
      const churned=await emergency();
      assert.equal(churned.contextRebuilds,settled.contextRebuilds,'只换 class、单元与表头都没变时不应重建上下文');
      assert.ok(Math.max(...toggles)<100,`单次增量扫描不应出现长任务：${toggles.map(ms=>ms.toFixed(1)).join(',')}ms`);
      assert.ok(initial.lastScanMs<500,`首轮扫描 ${initial.lastScanMs.toFixed(1)}ms`);
      model.calls=[];
      await page.evaluate(()=>{document.querySelector('thead th:last-child').textContent='Evidence notes';});
      await until(emergency,value=>value.contextRebuilds>churned.contextRebuilds,'表头文字变化后重建上下文');
      await until(()=>model.calls,calls=>calls.some(call=>call.items.some(item=>/Section \d+ compares/.test(item.text)&&item.context?.before==='Evidence notes')),'按新表头重发');
      const data={units:initial.units,initialScanMs:initial.lastScanMs,toggleScanMs:toggles,contextRebuildsDuringToggles:churned.contextRebuilds-settled.contextRebuilds};
      report.measurements.tableContext=data;return data;
    }finally{await endPageTranslation();}
  });
  // 回归：流式快照每次带着本批全部译文，曾把没变的段落也重建一遍（498 次渲染里 392 次文字相同）。
  await check('整页翻译流式进度：文字没变的片段不重写页面',async()=>{
    await openPage(origin+'/stream');model.mode='sse';model.calls=[];
    await page.evaluate(()=>{
      window.__translationWrites={total:0,redundant:0};
      const text=nodes=>[...nodes].map(node=>node.textContent).join('');
      window.__translationObserver=new MutationObserver(records=>{for(const record of records)if(record.type==='childList'&&record.target.getAttribute?.('data-roamcat-ui')==='emergency-translation'){window.__translationWrites.total++;if(text(record.removedNodes)===text(record.addedNodes))window.__translationWrites.redundant++;}});
      window.__translationObserver.observe(document.body,{subtree:true,childList:true});
    });
    try{
      await startPageTranslation();
      await until(emergencyStatus,value=>['complete','waiting'].includes(value.phase)&&value.completed>=16,'流式整页翻译完成',30000);
      const writes=await page.evaluate(()=>{window.__translationObserver.disconnect();return window.__translationWrites;}),stats=await emergency();
      assert.ok(writes.total>=16);assert.equal(writes.redundant,0,`有 ${writes.redundant} 次写入的文字与原来相同`);
      assert.ok(stats.unchangedRenders>0,'流式快照里没变的片段应被跳过');
      const data={domWrites:writes.total,redundantWrites:writes.redundant,renders:stats.renders,skipped:stats.unchangedRenders,streamedRequests:model.calls.length};
      report.measurements.streamedRender=data;return data;
    }finally{model.mode='json';await endPageTranslation();}
  });
  // 回归：后台批量曾全局只放行 2 条、先来先放行：服务设为 10 也只有 2 路，当前字幕排在 6 个阅读器批次之后多等约 0.9 秒。
  await check('后台按场景分道：服务并发设置生效，阅读器积压时当前字幕拿下一个空出的名额',async()=>{
    model.mode='json';model.delay=300;
    // 本地假接口是 HTTP/1.1，浏览器对同一主机至多 6 条连接：只发 5 批，避免把连接数上限误当成调度问题。
    await request('STATE_PATCH',{patch:service(10)});model.calls=[];model.peak=0;
    const wide=await reader.evaluate(()=>Promise.all(Array.from({length:5},(_,i)=>chrome.runtime.sendMessage({type:'READER_TRANSLATE',items:[{id:'wide'+i,text:'Concurrency passage '+i+' compares wide evidence.'}]}))));
    assert.ok(wide.every(result=>result.ok));assert.equal(model.peak,5,'服务并发设为 10 时 5 批应同时在途');
    const videoPage=await run.newPage();await videoPage.goto(origin+'/video');const videoTab=await tabIdOf(control,origin+'/video');
    await request('STATE_PATCH',{patch:service(2)});model.calls=[];model.peak=0;
    model.holdBulk=true;let bulk,video;
    try{
      bulk=reader.evaluate(()=>Promise.all(Array.from({length:6},(_,i)=>chrome.runtime.sendMessage({type:'READER_TRANSLATE',items:[{id:'bulk'+i,text:'Background book passage '+i+' uses queued evidence.'}]}))));
      await until(()=>model.held.size,count=>count===2,'阅读器前两批占满名额');
      // 字幕从另一个没暂停过的标签页发出；先把两条响应扣住，避免把浏览器 IPC 启动耗时误判为没有插队。
      const sent=performance.now();video=fromTab({type:'VIDEO_CUE_TRANSLATE',requestId:'perf-video',items:[{id:'visible-video',text:'The current video caption needs an immediate translation.',context:{title:'Performance video',heading:'',before:'',after:''}}]},videoTab);
      // 观察窗口：两个名额占满时不会发出第三条请求，同时让已提交的字幕进入等待队列。
      await sleep(150);assert.equal(model.calls.length,2);
      model.held.get('bulk0')();model.held.delete('bulk0');
      const result=await video;assert.ok(result.ok,result.error);
      model.held.get('bulk1')();model.held.delete('bulk1');assert.ok((await bulk).every(result=>result.ok));
      const order=model.calls.map(call=>call.ids[0]),videoCall=model.calls.find(call=>call.ids.includes('visible-video'));
      assert.equal(order.indexOf('visible-video'),2,'当前字幕应排在下一个空出的名额：'+order.join(','));
      assert.equal(model.peak,2,'设置为 2 时在途合计仍不超过 2');
      const data={peakAt10:5,orderAt2:order,videoQueueMs:videoCall.start-sent};report.measurements.lanes=data;return data;
    }finally{model.holdBulk=false;for(const release of model.held.values())release();model.held.clear();await Promise.allSettled([bulk,video]);await videoPage.close();}
  });
  // 回归：单条接口的机翻曾逐条串行往返，第一条约 130ms 已译完，8 条要约 1 秒后才一起显示。
  await check('机翻单条接口：子请求按服务并发并行，每条译完即推送进度',async()=>{
    await request('STATE_PATCH',{patch:{mtServices:[{providerId:'deeplx',credentials:{endpoint:origin+'/translate'}}],translationEngines:{page:'deeplx'},mtFallback:false}});
    mt.calls=[];mt.peak=0;mt.delay=120;
    await control.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:()=>{globalThis.__perfProgress=[];if(!globalThis.__perfProgressListener){globalThis.__perfProgressListener=message=>{if(message?.type==='SS_PAGE_TRANSLATION_PROGRESS')globalThis.__perfProgress.push({at:performance.now(),count:message.items?.length});};chrome.runtime.onMessage.addListener(globalThis.__perfProgressListener);}}}),tabId);
    const {token}=await request('EMERGENCY_BEGIN',{tabId,url:await page.url()});
    try{
      const begin=performance.now(),response=await fromTab({type:'EMERGENCY_TRANSLATE',token,requestSeq:1,items:Array.from({length:8},(_,i)=>({id:'mt'+i,text:sentence(700+i),context:{title:'Machine translation',heading:'',before:'',after:''}}))}),totalMs=performance.now()-begin;
      assert.ok(response.ok,response.error);assert.equal(response.data.items.length,8);
      const [events,done]=await control.evaluate(async tabId=>(await chrome.scripting.executeScript({target:{tabId},func:()=>[globalThis.__perfProgress,globalThis.__perfDone]}))[0].result,tabId);
      assert.equal(mt.peak,2,'DeepLX 的并发上限是 2');assert.equal(mt.calls.length,8);
      assert.ok(events.some(event=>event.count<8&&event.at<done),'整批结束前就应推送已译完的条目：'+JSON.stringify(events));
      const data={items:8,totalMs,peak:mt.peak,progress:events.map(event=>event.count)};report.measurements.machineTranslation=data;return data;
    }finally{await request('EMERGENCY_END',{tabId,token}).catch(()=>{});await request('STATE_PATCH',{patch:{translationEngines:{page:''},mtServices:[],mtFallback:true}});}
  });
  await check('阅读器机翻逐条显示：整批未结束时已呈现完成的正文',async()=>{
    await request('STATE_PATCH',{patch:{mtServices:[{providerId:'deeplx',credentials:{endpoint:origin+'/translate'}}],translationEngines:{reader:'deeplx'},mtFallback:false}});
    mt.delay=160;
    try{
      await reader.evaluate(()=>{
        const app=document.querySelector('roamcat-reader');app.beginOpen();app.translations=new Map();
        app.finishLoad('Progress fixture','epub',[],Array.from({length:8},(_,i)=>({id:'progress'+i,role:'p',text:'Progressive reader passage '+i+' compares independent reliable evidence.'})));
        window.__readerStarted=performance.now();window.__readerTranslation=app.translateAll();
      });
      const early=await until(()=>reader.evaluate(()=>{const app=document.querySelector('roamcat-reader');return {done:app.translations.size,busy:app.translating,rendered:app.querySelectorAll('.reader-translation').length,ms:performance.now()-window.__readerStarted};}),value=>value.done>0&&value.busy&&value.rendered>0,'阅读器整批结束前的译文');
      const final=await reader.evaluate(async()=>{await window.__readerTranslation;return {done:document.querySelector('roamcat-reader').translations.size,ms:performance.now()-window.__readerStarted};});
      assert.ok(early.done<8);assert.equal(final.done,8);assert.ok(early.ms<final.ms);
      const data={firstMs:early.ms,totalMs:final.ms,completedAtFirstPaint:early.done};report.measurements.readerProgress=data;return data;
    }finally{await request('STATE_PATCH',{patch:{translationEngines:{reader:''},mtServices:[],mtFallback:true}});}
  });
  await check('字幕机翻逐条交付：真实后台进度经内容脚本回到字幕回调',async()=>{
    await request('STATE_PATCH',{patch:{mtServices:[{providerId:'deeplx',credentials:{endpoint:origin+'/translate'}}],translationEngines:{video:'deeplx'},mtFallback:false}});
    const videoPage=await run.newPage();await videoPage.goto(origin+'/video-progress');const videoTab=await tabIdOf(control,origin+'/video-progress');
    await request('PAGE_UI_INJECT',{tabId:videoTab});
    // 回调在真实隔离环境里捕获，进度仍走 background → tabs.sendMessage → content 的完整链路。
    await control.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:()=>{
      const api=globalThis.RoamCatVideoSubtitles;globalThis.__videoApi=api;
      globalThis.RoamCatVideoSubtitles={...api,mount:options=>{globalThis.__videoCallbacks=options;}};
    }}),videoTab);
    try{
      const started=await control.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'SS_AUTO_START',reading:false,video:true,paused:false}),videoTab);assert.ok(started.ok,started.error);
      await control.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:()=>{
        globalThis.__videoProgress=[];globalThis.__videoDone=false;globalThis.__videoStarted=performance.now();
        globalThis.__videoResult=globalThis.__videoCallbacks.onTranslate(Array.from({length:5},(_,i)=>({id:'video-progress'+i,text:'Caption passage '+i+' compares independent and reliable evidence.',context:{title:'Progress video',heading:'',before:'',after:''}})),items=>globalThis.__videoProgress.push({count:items.length,ms:performance.now()-globalThis.__videoStarted})).then(result=>{globalThis.__videoDone=true;return {items:result.items.length,ms:performance.now()-globalThis.__videoStarted};}).catch(error=>{globalThis.__videoError=error.message;return null;});
      }}),videoTab);
      const early=await until(()=>control.evaluate(async tabId=>(await chrome.scripting.executeScript({target:{tabId},func:()=>({events:globalThis.__videoProgress,done:globalThis.__videoDone,error:globalThis.__videoError})}))[0].result,videoTab),value=>{assert.ok(!value.error,value.error);return value.events.length&&!value.done;},'字幕批次结束前的进度');
      const final=await control.evaluate(async tabId=>(await chrome.scripting.executeScript({target:{tabId},func:async()=>await globalThis.__videoResult}))[0].result,videoTab);
      assert.ok(early.events[0].count<5);assert.equal(final.items,5);assert.ok(early.events[0].ms<final.ms);
      const data={firstMs:early.events[0].ms,totalMs:final.ms};report.measurements.videoProgress=data;return data;
    }finally{
      await control.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:()=>{globalThis.RoamCatVideoSubtitles=globalThis.__videoApi;}}),videoTab).catch(()=>{});
      await videoPage.close();await request('STATE_PATCH',{patch:{translationEngines:{video:''},mtServices:[],mtFallback:true}});
    }
  });
  // 回归：持续 401 时阅读器曾把每批拆成单条重试，40 段书发出 20 次请求才停。
  await check('阅读器遇到鉴权失败立即停止，不拆条重试',async()=>{
    model.mode='auth';model.calls=[];
    try{
      const result=await reader.evaluate(async()=>{const app=document.querySelector('roamcat-reader');app.beginOpen();app.translations=new Map();app.finishLoad('Unauthorized fixture','epub',[],Array.from({length:40},(_,i)=>({id:'auth'+i,role:'p',text:'Unauthorized provider passage '+i+' compares specific evidence.'})));await app.translateAll();return {error:app.error,busy:app.translating,translated:app.translations.size};});
      assert.ok(model.calls.length<=2,`发出了 ${model.calls.length} 次请求`);assert.ok(model.calls.every(call=>call.ids.length>1),'不应拆成单条请求');
      assert.match(result.error,/API Key/i);assert.equal(result.busy,false);assert.equal(result.translated,0);
      const data={requests:model.calls.length,error:result.error};report.measurements.readerAuth=data;return data;
    }finally{model.mode='json';await request('STATE_PATCH',{patch:{apiServices:[],activeApiServiceId:''}});}
  });
  await reader.close();await control.close();
  if(!gateArgs().includes('--skip-idle'))await check('可见网页仍有内容脚本时后台可以空闲回收',async()=>{
    const target=async()=>{const {targetInfos}=await run.browser.send('Target.getTargets');return targetInfos.filter(item=>item.type==='service_worker'&&item.url===extUrl('background.js')).map(item=>item.targetId);};
    const initial=await target();await sleep(20000);const middle=await target();await sleep(20000);const final=await target();assert.equal(final.length,0,'后台仍存活，可能有无用保活消息');
    report.measurements.idle={initial,middle,final};return {stoppedAt40Seconds:true};
  });
  assert.deepEqual(report.errors,[]);
}catch(error){report.failures.push({name:'setup',error:error.stack});save();}
finally{if(run)await run.close();await new Promise(resolve=>server.close(resolve));save();}
if(report.failures.length){console.error(JSON.stringify(report.failures,null,2));process.exitCode=1;}
printGateSummary('performance',report.checks.length,report.failures.length);
