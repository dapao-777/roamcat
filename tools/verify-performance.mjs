/**
 * @file 性能回归门禁：真实扩展的惰性注入、正文增量失效、历史采集、阅读分页与后台休眠。
 * 主要内容：2000 段无语义根 fixture；原始结果写 preview/performance/，不调用模型。
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
const server=http.createServer((req,res)=>{if(req.url==='/favicon.ico')res.writeHead(204).end();else res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(fixture);});
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
