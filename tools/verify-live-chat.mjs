/**
 * @file tools/verify-live-chat.mjs
 * 文件职责：Twitch 直播聊天翻译界面门禁（npm run verify:livechat）——仿 Twitch 直播页（右侧聊天栏）上注入 dist/extension 的
 *   live-chat.js 与伴读猫辅助函数，用桩替代后台，断言「译」开关、排队圆点、译文、跳过规则、出错/限速提示与伴读猫避让。
 * 主要内容：开关插在聊天设置按钮左边且按设置显示为开启；新消息排队时只在末尾放圆点（不另起一行）、译文到后换成一行译文；
 *   单词梗与中文消息不送翻译；翻译出错在开关上方弹提示并留红点、恢复后撤掉；途中作废（STALE）的批次不提示；限速时提示上限；
 *   真实点击开关会关闭并保存（VIDEO_SETTINGS_PATCH）、清掉译文；keepOutRight 把落进聊天栏的猫挪到栏左、栏外不动。截图写 preview/live-chat/。
 * 模块边界：不加载扩展、不连模型；页面与脚本经请求拦截下发，不访问真实 Twitch。先 npm run build。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {openBrowser, DIST, assertFreshDist, previewPath} from './lib/ego.mjs';
import {createGateReport} from './lib/gate-report.mjs';

const PAGE = `<!doctype html><html lang="en"><title>Twitch fixture</title><style>
  body{margin:0;font:14px/1.5 sans-serif;background:#18181b;color:#efeff1}
  main{position:absolute;left:0;top:0;right:340px;bottom:0}
  .chat-shell{position:fixed;right:0;top:0;width:340px;height:100vh;display:flex;flex-direction:column;background:#1f1f23}
  .chat-scrollable-area__message-container{flex:1;overflow:auto;padding:8px}
  .chat-line__message{padding:4px 0}
  .chat-input{display:flex;justify-content:flex-end;gap:4px;padding:8px}
</style><body><main><h1>Live stream</h1></main>
<aside class="chat-shell"><div class="chat-room">
  <div data-test-selector="chat-scrollable-area__message-container" class="chat-scrollable-area__message-container"></div>
  <div class="chat-input"><div class="right"><button data-a-target="chat-settings">⚙</button></div></div>
</div></aside></body></html>`;

assertFreshDist();
const gate = createGateReport('livechat');
const run = await openBrowser({extension: null});
const errors = [];
try {
  const page = run.page;
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width: 1280, height: 800});
  await page.intercept(['https://www.twitch.tv/*'], async request => {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/fixture/')) return {headers: {'content-type': 'text/javascript; charset=utf-8'}, body: await fs.readFile(`${DIST}/${pathname.slice(9)}`)};
    return {headers: {'content-type': 'text/html; charset=utf-8'}, body: PAGE};
  });
  await page.goto('https://www.twitch.tv/fixturechannel');
  await page.evaluate(() => {
    window.shadows = [];
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) { const root = attach.call(this, options); window.shadows.push(root); return root; };
    // 后台桩：mode 决定 LIVE_CHAT_TRANSLATE 的结果；hold 为真时把翻译挂起，便于看排队圆点。
    window.qa = {sent: [], mode: 'ok', hold: false, release: null, listeners: []};
    const reply = message => {
      if (message.type === 'STATE_GET') return {ok: true, data: {settings: {video: {liveChat: true}}, uiLang: 'zh'}};
      if (message.type === 'VIDEO_SETTINGS_PATCH') return {ok: true, data: {video: {liveChat: message.patch.liveChat}}};
      if (message.type !== 'LIVE_CHAT_TRANSLATE') return {ok: true, data: {}};
      if (qa.mode === 'error') return {ok: false, error: '模拟服务出错'};
      if (qa.mode === 'stale') return {ok: false, error: '页面或设置已变化，请在当前页面重新操作。', code: 'STALE'};
      if (qa.mode === 'throttle') return {ok: true, data: {items: [], throttled: true, retryAfterMs: 400}};
      return {ok: true, data: {items: message.items.map(item => ({id: item.id, translation: '译：' + item.text}))}};
    };
    window.chrome = {
      runtime: {
        id: 'roamcat-fixture', lastError: null,
        sendMessage(message, callback) {
          qa.sent.push(message);
          const answer = async () => { if (message.type === 'LIVE_CHAT_TRANSLATE' && qa.hold) await new Promise(resolve => { qa.release = resolve; }); return reply(message); };
          void answer().then(response => callback?.(response));
        },
        onMessage: {addListener: fn => qa.listeners.push(fn)},
      },
      i18n: {getUILanguage: () => 'zh'},
    };
    window.say = (user, text) => {
      const line = document.createElement('div');
      line.className = 'chat-line__message';
      line.innerHTML = '<span class="chat-author"></span>: <span data-a-target="chat-line-message-body"></span>';
      line.firstChild.textContent = user;
      line.querySelector('[data-a-target="chat-line-message-body"]').textContent = text;
      document.querySelector('.chat-scrollable-area__message-container').append(line);
      return line;
    };
    window.lineState = index => {
      const line = document.querySelectorAll('.chat-line__message')[index];
      const node = line?.querySelector('[data-roamcat-ui="live-chat-translation"]');
      return {mark: line?.getAttribute('data-roamcat-chat') || '', pending: Boolean(node?.hasAttribute('data-pending')), text: node && !node.hasAttribute('data-pending') ? node.textContent : '', display: node ? getComputedStyle(node).display : ''};
    };
    window.toggleButton = () => shadows.map(root => root.querySelector('button[part="button"]')).find(Boolean);
    window.tip = () => {
      const host = document.querySelector('[data-roamcat-ui="live-chat-tip"]');
      const root = shadows.find(item => item.host === host);
      return {visible: host?.style.display === 'block', text: root?.querySelector('p')?.textContent || '', kind: root?.querySelector('.tip')?.dataset.kind || ''};
    };
  });
  for (const name of ['design.js', 'i18n-content.js', 'live-chat.js', 'floating-pet-helpers.js']) await page.addScriptTag({url: `https://www.twitch.tv/fixture/${name}`});

  await gate.check('「译」开关插在聊天设置左边，按设置显示为开启', async () => {
    await page.waitForFunction(() => toggleButton()?.getAttribute('aria-pressed') === 'true', undefined, {timeout: 10000});
    const state = await page.evaluate(() => ({text: toggleButton().textContent, next: document.querySelector('[data-roamcat-ui="live-chat-toggle"]').nextElementSibling?.dataset.aTarget}));
    assert.equal(state.text, '译');
    assert.equal(state.next, 'chat-settings');
    return state;
  });
  await gate.check('排队时只在消息末尾放圆点，译文到后换成一行译文', async () => {
    await page.evaluate(() => { qa.hold = true; say('viewer1', 'that play was absolutely insane'); });
    await page.waitForFunction(() => lineState(0).pending, undefined, {timeout: 5000});
    const pending = await page.evaluate(() => lineState(0));
    assert.equal(pending.display, 'inline-block', '排队圆点不应另起一行');
    await page.evaluate(() => { qa.hold = false; qa.release?.(); });
    await page.waitForFunction(() => lineState(0).text === '译：that play was absolutely insane', undefined, {timeout: 5000});
    const done = await page.evaluate(() => lineState(0));
    assert.equal(done.display, 'block');
    assert.equal(done.mark, 'done');
    return done.text;
  });
  await gate.check('单词梗、刷屏与中文消息不送翻译', async () => {
    const before = await page.evaluate(() => qa.sent.filter(message => message.type === 'LIVE_CHAT_TRANSLATE').length);
    await page.evaluate(() => { say('viewer2', 'KEKW'); say('viewer3', 'LUL LUL LUL'); say('viewer4', '这波操作太秀了'); });
    await page.waitForFunction(() => [1, 2, 3].every(index => lineState(index).mark === 'skip'), undefined, {timeout: 5000});
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => qa.sent.filter(message => message.type === 'LIVE_CHAT_TRANSLATE').length);
    assert.equal(after, before, '跳过的消息不应发出翻译请求');
  });
  await gate.check('翻译出错：开关上方弹提示并留红点，恢复后撤掉', async () => {
    await page.evaluate(() => { qa.mode = 'error'; say('viewer5', 'can you explain the build again?'); });
    await page.waitForFunction(() => tip().visible && toggleButton().hasAttribute('data-error'), undefined, {timeout: 5000});
    const shown = await page.evaluate(() => tip());
    assert.match(shown.text, /聊天翻译出错/);
    assert.equal(shown.kind, 'error');
    await page.screenshot({path: previewPath('live-chat', 'error-tip.png')});
    // 出错后暂停 8 秒再接新消息：等暂停过去，换回正常结果，再来一条。
    await page.evaluate(() => { qa.mode = 'ok'; });
    await page.waitForTimeout(8200);
    await page.evaluate(() => say('viewer6', 'what rank are you right now'));
    await page.waitForFunction(() => !toggleButton().hasAttribute('data-error') && !tip().visible, undefined, {timeout: 8000});
    return shown.text;
  });
  await gate.check('途中作废（STALE）的批次不提示、不留红点', async () => {
    await page.evaluate(() => { qa.mode = 'stale'; say('viewer7', 'this strategy looks really strong'); });
    await page.waitForFunction(() => qa.sent.filter(message => message.type === 'LIVE_CHAT_TRANSLATE').some(message => message.items.some(item => item.text.startsWith('this strategy'))), undefined, {timeout: 5000});
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => ({tip: tip().visible, error: toggleButton().hasAttribute('data-error'), mark: lineState(6).mark}));
    assert.equal(state.tip, false);
    assert.equal(state.error, false);
    assert.equal(state.mark, 'skip');
  });
  await gate.check('限速时提示每分钟上限', async () => {
    await page.evaluate(() => { qa.mode = 'throttle'; say('viewer8', 'the next round decides everything'); });
    await page.waitForFunction(() => tip().visible && tip().kind === 'note', undefined, {timeout: 5000});
    const text = await page.evaluate(() => tip().text);
    assert.match(text, /每分钟翻译上限/);
    await page.evaluate(() => { qa.mode = 'ok'; });
    return text;
  });
  await gate.check('真实点击开关：关闭并保存，清掉译文', async () => {
    const box = await page.evaluate(() => { const rect = document.querySelector('[data-roamcat-ui="live-chat-toggle"]').getBoundingClientRect(); return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2}; });
    await page.mouse.click(box.x, box.y);
    await page.waitForFunction(() => toggleButton().getAttribute('aria-pressed') === 'false', undefined, {timeout: 5000});
    const state = await page.evaluate(() => ({saved: qa.sent.some(message => message.type === 'VIDEO_SETTINGS_PATCH' && message.patch.liveChat === false), translations: document.querySelectorAll('[data-roamcat-ui="live-chat-translation"]').length}));
    assert.equal(state.saved, true);
    assert.equal(state.translations, 0);
  });
  await gate.check('伴读猫落进聊天栏时挪到栏左，栏外不动', async () => {
    const result = await page.evaluate(() => {
      const {keepOutRight} = globalThis.RoamCatPetParts;
      const chat = document.querySelector('.chat-shell').getBoundingClientRect();
      return {inside: keepOutRight(24, 84, 64, 68), outside: keepOutRight(600, 84, 64, 68), expected: Math.round(innerWidth - chat.left + 8)};
    });
    assert.equal(result.inside, result.expected);
    assert.equal(result.outside, 600);
    return result;
  });
  await gate.check('页面无脚本错误', async () => assert.deepEqual(errors, []));
} finally {
  await run.close();
}
gate.finish({errors});
