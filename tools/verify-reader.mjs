/**
 * @file 阅读器行为门禁：验证翻译失败提示、重试、换书隔离与远程/EPUB 文件兼容性。
 * 主要内容：真实扩展页与 EPUB worker；翻译及下载响应使用页面内桩，不调用模型、不访问外网。
 * 模块边界：使用 tools/lib/ego.mjs 的独立 ego lite，要求先构建，报告写 preview/gates/reader.json。
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import assert from 'node:assert/strict';
import {zipSync, strToU8} from 'fflate';
import {openBrowser, extUrl, previewPath} from './lib/ego.mjs';
import {createGateReport} from './lib/gate-report.mjs';

const gate = createGateReport('reader');
const errors = [];
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
  await gate.check('阅读器没有未捕获脚本错误', async () => assert.deepEqual(errors, []));
} catch (error) {
  await gate.check('阅读器门禁启动与运行', () => { throw error; });
} finally {
  await run.close();
  gate.finish({errors});
}
