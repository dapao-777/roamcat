/**
 * @file 阅读器行为门禁：验证翻译失败提示、重试、换书隔离与远程/EPUB 文件兼容性。
 * 主要内容：真实扩展页与 EPUB worker；翻译及下载响应使用页面内桩，不调用模型、不访问外网。
 * 模块边界：使用 tools/lib/ego.mjs 的独立 ego lite，要求先构建，报告写 preview/gates/reader.json。
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import {zipSync, strToU8} from 'fflate';
import {openBrowser, extUrl, previewPath} from './lib/ego.mjs';
import {createGateReport} from './lib/gate-report.mjs';

const gate = createGateReport('reader');
const errors = [];
function pdfFixture() {
  const stream='BT /F1 12 Tf 50 750 Td (Readers compare reliable English evidence.) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 1 /Kids [4 0 R] >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let value='%PDF-1.4\n';const offsets=[];
  for(const [i,object] of objects.entries()){offsets.push(value.length);value+=`${i+1} 0 obj\n${object}\nendobj\n`;}
  const start=value.length;value+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return [...Buffer.from(value)];
}
const missingModernBuiltins = `
  for (const type of [Map, WeakMap]) for (const key of ['getOrInsert', 'getOrInsertComputed']) delete type.prototype[key];
  delete Promise.try; delete URL.parse;
  for (const key of ['fromBase64', 'fromHex']) delete Uint8Array[key];
  for (const key of ['toBase64', 'toHex', 'setFromBase64', 'setFromHex']) delete Uint8Array.prototype[key];
`;
const epub = (text = 'Careful readers compare evidence from reliable sources.') => [...zipSync({
  'META-INF/container.xml': strToU8('<container><rootfile full-path="OPS/Book%20%26%20100%25.opf"/></container>'),
  'OPS/Book & 100%.opf': strToU8('<package><metadata><dc:title>Reader fixture</dc:title></metadata><manifest><item id="c" href="Text/part%20one&amp;two.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>'),
  'OPS/Text/part one&two.xhtml': strToU8(`<body><p>${text}</p></body>`),
  'OPS/nav.xhtml': strToU8('<nav><a href="Text/part%20one&amp;two.xhtml#start">Reader &amp; chapter</a></nav>')
})];
const run = await openBrowser();
try {
  const page = run.page;
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(extUrl('ui/reader.html'));
  await page.waitForFunction(() => Boolean(document.querySelector('roamcat-reader')?.translateAll));
  await page.evaluate(() => {
    const app = document.querySelector('roamcat-reader');
    window.readerFixture = {
      app, send: chrome.runtime.sendMessage,
      seed(title = 'Translation fixture') {
        app.beginOpen();
        app.translations = new Map();
        app.finishLoad(title, 'epub', [], [0, 1, 2].map(i => ({id: 'r' + i, role: 'p', text: 'Careful readers compare evidence from reliable sources ' + i})));
      }
    };
  });
  await gate.check('缺少 Chrome 125 之后的内建 API 时，PDF 主包与真实 worker 仍能提取正文', async () => {
    const compat=await run.newPage();
    compat.on('pageerror',error=>errors.push(error.message));
    try {
      await compat.addInitScript(missingModernBuiltins);
      await compat.goto(extUrl('ui/reader.html'));
      await compat.waitForFunction(()=>Boolean(document.querySelector('roamcat-reader')?.openData));
      await compat.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true});
      const attached=compat.waitForEvent('Target.attachedToTarget',10000);
      const opening=compat.evaluate(async bytes=>{
        const app=document.querySelector('roamcat-reader');await app.openData(Uint8Array.from(bytes),'compat.pdf');
        return {view:app.view,blocks:app.blocks.map(block=>block.text)};
      },pdfFixture());
      const {sessionId,targetInfo}=await attached;
      assert.equal(targetInfo.type,'worker');
      try { await run.browser.connection.send('Runtime.evaluate',{expression:missingModernBuiltins},sessionId); }
      finally { await run.browser.connection.send('Runtime.runIfWaitingForDebugger',{},sessionId); }
      const result=await opening;
      assert.equal(result.view,'ready');
      assert.deepEqual(result.blocks,['Readers compare reliable English evidence.']);
      return {blocks:result.blocks.length};
    } finally { await compat.close(); }
  });
  await gate.check('翻译失败可见，已生成译文保留', async () => {
    const result = await page.evaluate(async () => {
      const {app, seed, send} = readerFixture;
      seed();
      app.translations.set('r0', 'Earlier translation');
      chrome.runtime.sendMessage = message => message.type === 'READER_TRANSLATE'
        ? Promise.resolve({ok: false, error: 'fixture rejection'}) : send.call(chrome.runtime, message);
      try {
        await app.translateAll();
        await app.updateComplete;
        const alert = app.querySelector('[role="alert"]');
        return {visible: Boolean(alert?.getClientRects().length && alert.textContent.includes('fixture rejection')), preserved: app.translations.get('r0'), busy: app.translating};
      } finally { chrome.runtime.sendMessage = send; }
    });
    assert.equal(result.visible, true);
    assert.equal(result.preserved, 'Earlier translation');
    assert.equal(result.busy, false);
    await page.screenshot({path: previewPath('reader', 'translation-error.png')});
  });
  await gate.check('真实点击重试只补缺失译文，成功后清除旧错误', async () => {
    await page.evaluate(() => {
      window.readerRequests = [];
      const {send} = readerFixture;
      chrome.runtime.sendMessage = message => {
        if (message.type !== 'READER_TRANSLATE') return send.call(chrome.runtime, message);
        readerRequests.push(...message.items.map(item => item.id));
        return Promise.resolve({ok: true, data: {items: message.items.map(item => ({id: item.id, translation: 'Translated ' + item.id}))}});
      };
    });
    try {
      await page.locator('.reader-actions .rc-primary').click();
      await page.waitForFunction(() => !readerFixture.app.translating && readerFixture.app.translations.size === 3);
      const result = await page.evaluate(() => ({ids: readerRequests, error: readerFixture.app.error, alert: Boolean(readerFixture.app.querySelector('[role="alert"]')), earlier: readerFixture.app.translations.get('r0')}));
      assert.deepEqual(result.ids.sort(), ['r1', 'r2']);
      assert.equal(result.error, '');
      assert.equal(result.alert, false);
      assert.equal(result.earlier, 'Earlier translation');
    } finally { await page.evaluate(() => { chrome.runtime.sendMessage = readerFixture.send; }); }
  });
  for (const succeeds of [false, true]) await gate.check(`换书后旧批次${succeeds ? '成功结果不写入新书' : '失败不再拆条重试'}`, async () => {
    const result = await page.evaluate(async succeeds => {
      const {app, seed, send} = readerFixture;
      seed('Old document');
      let settle, calls = 0;
      chrome.runtime.sendMessage = message => {
        if (message.type !== 'READER_TRANSLATE') return send.call(chrome.runtime, message);
        calls++;
        return calls === 1 ? new Promise(resolve => { settle = resolve; }) : Promise.resolve({ok: false, error: 'Old batch failure'});
      };
      try {
        const pending = app.translateAll();
        seed('New document');
        settle(succeeds ? {ok: true, data: {items: [{id: 'r0', translation: 'Old result'}]}} : {ok: false, error: 'Old batch failure'});
        await pending;
        return {calls, title: app.title, translations: app.translations.size, error: app.error, busy: app.translating};
      } finally { chrome.runtime.sendMessage = send; }
    }, succeeds);
    assert.deepEqual(result, {calls: 1, title: 'New document', translations: 0, error: '', busy: false});
  });
  await gate.check('翻译服务持续失败时停止剩余批次，避免长文档重复请求', async () => {
    const result = await page.evaluate(async () => {
      const {app, seed, send} = readerFixture;
      seed('Unavailable provider');
      app.blocks = Array.from({length: 40}, (_, i) => ({id: 'failed' + i, role: 'p', text: 'Careful readers compare evidence from reliable sources ' + i}));
      let calls = 0;
      chrome.runtime.sendMessage = message => {
        if (message.type !== 'READER_TRANSLATE') return send.call(chrome.runtime, message);
        calls++;
        return Promise.resolve({ok: false, error: 'Provider unavailable'});
      };
      try {
        await app.translateAll();
        await app.updateComplete;
        app.querySelector('.reader-block:last-of-type').scrollIntoView({block: 'end'});
        await new Promise(resolve => requestAnimationFrame(resolve));
        const rect = app.querySelector('[role="alert"]')?.getBoundingClientRect();
        return {calls, error: app.error, busy: app.translating, translations: app.translations.size, visibleAfterScroll: Boolean(rect && rect.top >= 0 && rect.bottom <= innerHeight)};
      } finally { chrome.runtime.sendMessage = send; }
    });
    assert.ok(result.calls <= 20, `持续失败仍发出了 ${result.calls} 次请求`);
    assert.ok(result.error.includes('Provider unavailable'));
    assert.equal(result.busy, false);
    assert.equal(result.translations, 0);
    assert.equal(result.visibleAfterScroll, true, '长文档滚到后面时也应看到错误');
    return {requests: result.calls, documentBlocks: 40};
  });
  await gate.check('单条翻译失败仍继续其余正文，不提前放弃整本书', async () => {
    const result = await page.evaluate(async () => {
      const {app, seed, send} = readerFixture;
      seed('Partial failure');
      app.blocks = Array.from({length: 20}, (_, i) => ({id: 'partial' + i, role: 'p', text: 'Careful readers compare evidence from reliable sources ' + i}));
      chrome.runtime.sendMessage = message => {
        if (message.type !== 'READER_TRANSLATE') return send.call(chrome.runtime, message);
        return Promise.resolve(message.items.some(item => item.id === 'partial0') ? {ok: false, error: 'One item failed'}
          : {ok: true, data: {items: message.items.map(item => ({id: item.id, translation: 'Translated ' + item.id}))}});
      };
      try {
        await app.translateAll();
        return {translations: app.translations.size, last: app.translations.has('partial19'), bad: app.translations.has('partial0'), error: app.error};
      } finally { chrome.runtime.sendMessage = send; }
    });
    assert.equal(result.translations, 19);
    assert.equal(result.last, true);
    assert.equal(result.bad, false);
    assert.ok(result.error.includes('One item failed'));
  });
  await gate.check('超长段落全部分片送翻并按原顺序合并，不把其他段落混入译文', async () => {
    const result = await page.evaluate(async () => {
      const {app, seed, send} = readerFixture;
      seed('Long paragraphs');
      const text = 'Readers compare reliable evidence before accepting a scientific conclusion. '.repeat(130).trim();
      app.blocks = [{id: 'long', role: 'p', text}, {id: 'short', role: 'p', text: 'Short paragraphs remain independent.'}];
      const requests = [];
      chrome.runtime.sendMessage = message => {
        if (message.type !== 'READER_TRANSLATE') return send.call(chrome.runtime, message);
        requests.push(message.items);
        return Promise.resolve({ok: true, data: {items: [...message.items].reverse().map(item => ({id: item.id, translation: item.id}))}});
      };
      try {
        await app.translateAll();
        await app.updateComplete;
        return {text, requests, merged: app.translations.get('long'), short: app.translations.get('short'), rendered: app.querySelectorAll('.reader-translation').length, error: app.error};
      } finally { chrome.runtime.sendMessage = send; }
    });
    const chunks = result.requests.flat().filter(item => item.id !== 'short');
    assert.ok(chunks.length >= 3);
    assert.equal(chunks.map(item => item.text).join(''), result.text);
    for (const batch of result.requests) {
      assert.ok(batch.length <= 4 && batch.reduce((sum, item) => sum + item.text.length, 0) <= 12000);
      for (const item of batch) { assert.ok(item.text.length <= 4000); assert.deepEqual(Object.keys(item).sort(), ['id', 'text']); }
    }
    assert.equal(result.merged, chunks.map(item => item.id).join(' '));
    assert.equal(result.short, 'short');
    assert.equal(result.rendered, 2);
    assert.equal(result.error, '');
    return {chunks: chunks.length, chars: result.text.length};
  });
  await gate.check('长段落单片失败后只补缺片，换书则清除片段缓存', async () => {
    const result = await page.evaluate(async () => {
      const {app, seed, send} = readerFixture;
      seed('Partial long paragraph');
      const text = 'Readers compare reliable evidence before accepting a scientific conclusion. '.repeat(70).trim();
      app.blocks = [{id: 'long', role: 'p', text}];
      let failing = true;
      const requests = [];
      chrome.runtime.sendMessage = message => {
        if (message.type !== 'READER_TRANSLATE') return send.call(chrome.runtime, message);
        requests.push(...message.items.map(item => item.id));
        return Promise.resolve(failing && message.items.some(item => item.id.endsWith('_part2')) ? {ok: false, error: 'One fragment failed'}
          : {ok: true, data: {items: message.items.map(item => ({id: item.id, translation: item.id}))}});
      };
      try {
        await app.translateAll();
        const first = {error: app.error, complete: app.translations.has('long'), cached: app._translationParts.size};
        requests.length = 0;
        failing = false;
        await app.translateAll();
        const retried = [...requests], translation = app.translations.get('long'), error = app.error;
        // 再制造部分结果，确认换书后相同 ID 也不能复用旧片段。
        seed('Another partial book');
        app.blocks = [{id: 'long', role: 'p', text}];
        failing = true;
        await app.translateAll();
        seed('New book');
        app.blocks = [{id: 'long', role: 'p', text}];
        const cleared = app._translationParts.size;
        requests.length = 0;
        failing = false;
        await app.translateAll();
        return {first, retried, translation, error, cleared, newRequests: requests, newTranslation: app.translations.get('long')};
      } finally { chrome.runtime.sendMessage = send; }
    });
    assert.ok(result.first.error.includes('One fragment failed'));
    assert.equal(result.first.complete, false);
    assert.equal(result.first.cached, 1);
    assert.deepEqual(result.retried, ['long_part2']);
    assert.equal(result.translation, 'long_part1 long_part2');
    assert.equal(result.error, '');
    assert.equal(result.cleared, 0);
    assert.deepEqual(result.newRequests, ['long_part1', 'long_part2']);
    assert.equal(result.newTranslation, 'long_part1 long_part2');
  });
  await gate.check('远程文档文件名含裸百分号时仍可打开', async () => {
    const result = await page.evaluate(async bytes => {
      const fetchOriginal = window.fetch, {app} = readerFixture;
      window.fetch = async () => new Response(Uint8Array.from(bytes));
      try {
        await app.openRemote('https://reader.example/100%.epub');
        return {view: app.view, title: app.title, error: app.error};
      } finally { window.fetch = fetchOriginal; }
    }, epub());
    assert.equal(result.view, 'ready', result.error);
    assert.equal(result.title, 'Reader fixture');
  });
  await gate.check('远程文档超过体积上限时取消响应并显示错误', async () => {
    const result = await page.evaluate(async () => {
      const fetchOriginal = window.fetch, {app} = readerFixture;
      let cancelled = false;
      window.fetch = async () => new Response(new ReadableStream({cancel() { cancelled = true; }}), {headers: {'Content-Length': String(65 * 1024 * 1024)}});
      try {
        await app.openRemote('https://reader.example/too-large.pdf');
        await app.updateComplete;
        return {cancelled, view: app.view, error: app.error, visible: Boolean(app.querySelector('.reader-error')?.getClientRects().length)};
      } finally { window.fetch = fetchOriginal; }
    });
    assert.equal(result.cancelled, true);
    assert.equal(result.view, 'error');
    assert.ok(result.error);
    assert.equal(result.visible, true);
  });
  await gate.check('真实 EPUB worker 支持转义路径与导航标签', async () => {
    const result = await page.evaluate(async bytes => {
      const {app} = readerFixture;
      await app.openData(Uint8Array.from(bytes), 'escaped.epub');
      await app.updateComplete;
      return {title: app.title, label: app.sidebar[0]?.label, blocks: app.querySelectorAll('.reader-block').length, error: app.error};
    }, epub());
    assert.deepEqual(result, {title: 'Reader fixture', label: 'Reader & chapter', blocks: 1, error: ''});
  });
  await gate.check('真实 EPUB worker 保留行内标签拆分的单词', async () => {
    const result = await page.evaluate(async bytes => {
      const {app} = readerFixture;
      await app.openData(Uint8Array.from(bytes), 'inline.epub');
      await app.updateComplete;
      return {text: app.blocks[0].text, rendered: app.querySelector('.reader-block').textContent};
    }, epub('Inter<span>national</span> evidence makes read<em>ing</em> easier.'));
    const expected = 'International evidence makes reading easier.';
    assert.deepEqual(result, {text: expected, rendered: expected});
  });
  await gate.check('无效数字实体不会使 EPUB 解析线程放弃整本书', async () => {
    const result = await page.evaluate(async bytes => {
      const {app} = readerFixture;
      await app.openData(Uint8Array.from(bytes), 'entity.epub');
      return app.blocks[0].text;
    }, epub('Readers can still read this paragraph &#x110000; and this one &#xD800;.'));
    assert.ok(result.includes('paragraph � and this one �.'));
  });
  await gate.check('真实 EPUB worker 接受带前缀的包结构、元数据和导航', async () => {
    const bytes=[...zipSync({
      'META-INF/container.xml':strToU8('<c:container xmlns:c="urn:oasis:names:tc:opendocument:xmlns:container"><c:rootfile full-path="book.opf"/></c:container>'),
      'book.opf':strToU8('<o:package xmlns:o="http://www.idpf.org/2007/opf" xmlns:d="http://purl.org/dc/elements/1.1/"><o:metadata><d:title>Prefixed reader</d:title></o:metadata><o:manifest><o:item id="c" href="chapter.xhtml" media-type="application/xhtml+xml"/><o:item id="n" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></o:manifest><o:spine><o:itemref idref="c"/></o:spine></o:package>'),
      'chapter.xhtml':strToU8('<h:body xmlns:h="http://www.w3.org/1999/xhtml"><h:p>Prefixed content remains readable.</h:p></h:body>'),
      'nav.xhtml':strToU8('<h:nav xmlns:h="http://www.w3.org/1999/xhtml"><h:a href="chapter.xhtml">Prefixed chapter</h:a></h:nav>'),
    })];
    const result=await page.evaluate(async bytes=>{const app=readerFixture.app;await app.openData(Uint8Array.from(bytes),'prefixed.epub');return {title:app.title,label:app.sidebar[0]?.label,text:app.blocks[0]?.text};},bytes);
    assert.deepEqual(result,{title:'Prefixed reader',label:'Prefixed chapter',text:'Prefixed content remains readable.'});
  });
  await gate.check('远程文档 404：不引导登录重试，主按钮改为在浏览器中查看原文档', async () => {
    const server=http.createServer((request,response)=>response.writeHead(404).end('Not found'));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try {
      await page.evaluate(async url=>{await readerFixture.app.openRemote(url);await readerFixture.app.updateComplete;},`http://127.0.0.1:${server.address().port}/gone.pdf`);
      const state=await page.evaluate(()=>({
        view:readerFixture.app.view,
        retry:Boolean(document.querySelector('[data-reader-action="retry-login"]')),
        originalPrimary:document.querySelector('[data-reader-action="open-original"]')?.classList.contains('rc-primary'),
        hint:document.querySelector('.reader-error .reader-hint')?.textContent||'',
      }));
      assert.equal(state.view,'error');
      assert.equal(state.retry,false,'404 不应出现「使用网站登录状态重试」');
      assert.equal(state.originalPrimary,true);
      assert.equal(state.hint,await page.evaluate(()=>RoamCatI18n.t('rd.httpHint')));
      return state;
    } finally { await new Promise(resolve=>server.close(resolve)); }
  });
  await gate.check('登录保护 PDF 匿名失败后可主动使用登录态重试，原站查看只绕过一次接管', async () => {
    const requests=[],pdf=Buffer.from(pdfFixture());
    const server=http.createServer((request,response)=>{
      if(request.url==='/login'){response.writeHead(200,{'content-type':'text/html','set-cookie':'reader_login=1; Path=/; SameSite=Lax'}).end('<title>Reader login fixture</title>Signed in');return;}
      if(request.url==='/redirect.pdf'){response.writeHead(302,{location:'/private.pdf'}).end();return;}
      if(request.url==='/private.pdf'){
        const cookie=request.headers.cookie?.includes('reader_login=1')===true;requests.push(cookie);
        if(cookie)response.writeHead(200,{'content-type':'application/pdf'}).end(pdf);
        else response.writeHead(401).end('Login required');
        return;
      }
      response.writeHead(204).end();
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${server.address().port}`,url=base+'/private.pdf';
    const login=await run.newPage(),original=await run.newPage();
    try {
      await login.goto(base+'/login');
      await page.evaluate(async url=>{await readerFixture.app.openRemote(url);await readerFixture.app.updateComplete;},url);
      assert.equal(requests.at(-1),false);
      assert.equal(await page.locator('[data-reader-action="retry-login"]').isVisible(),true);
      await page.setViewportSize({width:375,height:850});
      const previousLang=await page.evaluate(async()=>{
        const previous=RoamCatI18n.pref();await RoamCatI18n.setPref('en');readerFixture.app.requestUpdate();await readerFixture.app.updateComplete;
        await Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{})));
        return previous;
      });
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'英文登录恢复操作在窄屏上不应溢出');
      await page.screenshot({path:previewPath('gates','reader-login-error-en.png')});
      await page.evaluate(async pref=>{await RoamCatI18n.setPref(pref);readerFixture.app.requestUpdate();await readerFixture.app.updateComplete;},previousLang);
      await page.setViewportSize({width:1440,height:1000});
      await page.locator('[data-reader-action="retry-login"]').click();
      await page.waitForFunction(()=>readerFixture.app.view==='ready'&&!readerFixture.app.parsing);
      assert.equal(requests.at(-1),true);
      assert.equal(await page.evaluate(()=>readerFixture.app.blocks[0].text),'Readers compare reliable English evidence.');
      const beforeRedirect=requests.length;
      await page.evaluate(async url=>readerFixture.app.openRemote(url,{withCredentials:true}),base+'/redirect.pdf');
      assert.equal(await page.evaluate(()=>readerFixture.app.view),'error');
      assert.equal(requests.length,beforeRedirect,'带登录态的读取不能跟随重定向');
      await original.goto(extUrl('ui/reader.html'));
      await original.waitForFunction(()=>Boolean(document.querySelector('roamcat-reader')?.openRemote));
      const tabId=await original.evaluate(async url=>{await document.querySelector('roamcat-reader').openRemote(url);return (await chrome.tabs.getCurrent()).id;},url);
      await original.locator('[data-reader-action="open-original"]').click();
      await page.waitForFunction(async({tabId,url})=>{
        const [tab,stored]=await Promise.all([chrome.tabs.get(tabId),chrome.storage.session.get('readerOriginalOnce:'+tabId)]);
        return tab.url===url&&tab.status==='complete'&&!stored['readerOriginalOnce:'+tabId];
      },{tabId,url});
      assert.equal(requests.at(-1),true);
      await original.goto('about:blank');
      await page.evaluate(({tabId,url})=>chrome.tabs.update(tabId,{url}),{tabId,url});
      await original.waitForFunction(()=>location.pathname==='/ui/reader.html'&&document.querySelector('roamcat-reader')?.view==='error');
      assert.equal(requests.at(-1),false,'重新导航应恢复正常接管和匿名下载');
      return {requests};
    } finally { await login.close();await original.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
  });
  await gate.check('阅读器没有未捕获脚本错误', async () => assert.deepEqual(errors, []));
} catch (error) {
  await gate.check('阅读器门禁启动与运行', () => { throw error; });
} finally {
  await run.close();
  gate.finish({errors});
}
