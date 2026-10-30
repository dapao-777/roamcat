/**
 * @file tools/verify-video-ui.mjs
 * 文件职责：视频字幕界面门禁（npm run verify:video）——仿 YouTube 观看页（绝对定位、固定高度的播放器外壳 + #below 标题区）
 *   上注入 dist/extension 的页内脚本，断言原文稿面板位置、直播状态文案与「下载双语字幕」的显隐。
 * 主要内容：直播（ytp-live）CC 关时提示打开 CC 且无「重新读取字幕」；CC 开、句间空档不弹提示；直播字幕出现时双语层显示原文与译文；
 *   原文稿面板插在 #below 最前、底边不压标题，标题行写「直播 · 实时字幕」、提示条说明没有可回看的原文稿、下载按钮隐藏；
 *   普通视频读不到字幕时提示不带「直播」字样且有「重新读取字幕」。截图写 preview/video-ui/。
 * 模块边界：字幕布局用 chrome.* 与翻译桩，偏好恢复另加载真实扩展后台；不连模型，页面经请求拦截下发，不访问真实 YouTube。先 npm run build。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {openBrowser, DIST, assertFreshDist, previewPath, extUrl, tabIdOf} from './lib/ego.mjs';
import {createGateReport} from './lib/gate-report.mjs';

// 20 秒静音 WAV：真实媒体元素可播放，不依赖网络视频。
const wav = Buffer.alloc(44 + 16000 * 2 * 20);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
// 与 YouTube 观看页同构：#player-container 绝对定位、高度由外层 padding-top 撑出；面板若插在 ytd-player 后会溢出到 #below 下面。
const PAGE = ({live}) => `<!doctype html><title>Video UI fixture</title><style>
  body{margin:0;font:14px sans-serif} ytd-watch-flexy{display:block;width:960px;margin:16px}
  #player-container-inner{position:relative;padding-top:56.25%} #player-container{position:absolute;inset:0}
  ytd-player,#movie_player{display:block;width:100%;height:100%;background:#000} video{width:100%;height:100%}
  #below{display:block;padding-top:8px} #below h1{margin:0;font-size:20px}
</style><ytd-watch-flexy><div id="primary"><div id="player"><div id="player-container-outer"><div id="player-container-inner"><div id="player-container">
  <ytd-player><div id="movie_player" class="html5-video-player"><video></video>
    <div class="ytp-chrome-bottom"><div class="ytp-right-controls"><button class="ytp-subtitles-button" aria-pressed="false">CC</button></div>
    <span class="ytp-time-display${live ? ' ytp-live' : ''}">0:00</span></div>
    <div class="ytp-caption-window-container"></div></div></ytd-player>
</div></div></div></div><div id="below"><h1 id="title">Fixture title</h1><p>Channel row</p></div></div></ytd-watch-flexy>`;

assertFreshDist();
const gate = createGateReport('video');
const run = await openBrowser({extension: null});
const errors = [];
try {
  const page = run.page;
  page.on('pageerror', error => errors.push(error.message));
  let live = true;
  await page.intercept(['https://www.youtube.com/*'], async request => {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/fixture/')) return {headers: {'content-type': 'text/javascript; charset=utf-8'}, body: await fs.readFile(`${DIST}/${pathname.slice(9)}`)};
    return {headers: {'content-type': 'text/html; charset=utf-8'}, body: PAGE({live})};
  });
  const mount = async () => {
    await page.evaluate(() => {
      // 页内界面在 closed shadow 里：记下每个 shadow root 供断言查询。
      window.shadows = [];
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function (options) { const root = attach.call(this, options); window.shadows.push(root); return root; };
      window.chrome = {runtime: {sendMessage(_message, callback) { callback?.({ok: true, data: {uiLang: 'zh'}}); }}, i18n: {getUILanguage: () => 'zh'}};
    });
    for (const name of ['design.js', 'i18n-content.js', 'video-dictation.js', 'video-subtitles.js']) await page.addScriptTag({url: `https://www.youtube.com/fixture/${name}`});
    await page.evaluate(async base64 => {
      const media = document.querySelector('video');
      media.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], {type: 'audio/wav'}));
      media.muted = true;
      await media.play();
      RoamCatVideoSubtitles.mount({settings: {bilingual: true}, onAssist: () => {}, onPrepareBridge: async () => {},
        onSettingsChange: async patch => ({video: patch}), onTranslate: async items => ({items: items.map(item => ({id: item.id, translation: '直播译文'}))})});
      window.find = selector => shadows.flatMap(root => [...root.querySelectorAll(selector)]);
      window.visibleText = selector => find(selector).filter(element => !element.hidden && element.getClientRects().length).map(element => element.textContent.trim());
    }, wav.toString('base64'));
  };

  await page.goto('https://www.youtube.com/watch?v=livefixture');
  await mount();
  await gate.check('直播 CC 关：提示打开 CC，没有「重新读取字幕」', async () => {
    await page.waitForFunction(() => visibleText('.empty p').some(text => text.includes('CC')), undefined, {timeout: 20000});
    assert.equal(await page.evaluate(() => visibleText('.empty .retry').length), 0);
    return page.evaluate(() => visibleText('.empty p')[0]);
  });
  await gate.check('直播 CC 开、句间空档：不弹「没有字幕」', async () => {
    await page.evaluate(() => { document.querySelector('.ytp-subtitles-button').setAttribute('aria-pressed', 'true'); document.querySelector('video').dispatchEvent(new Event('timeupdate')); });
    await page.waitForFunction(() => !visibleText('.empty p').length, undefined, {timeout: 15000});
    assert.equal(await page.evaluate(() => visibleText('.empty p').some(text => text.includes('没有字幕'))), false);
  });
  await gate.check('直播字幕出现：双语层显示原文与译文', async () => {
    await page.evaluate(() => { document.querySelector('.ytp-caption-window-container').innerHTML = '<span class="ytp-caption-segment">breaking news from the capital</span>'; document.querySelector('video').dispatchEvent(new Event('timeupdate')); });
    await page.waitForFunction(() => visibleText('.translation span').includes('直播译文'), undefined, {timeout: 15000});
    return page.evaluate(() => visibleText('.translation span')[0]);
  });
  await gate.check('原文稿面板在 #below 最前、不压标题；直播说明清楚、下载按钮隐藏', async () => {
    await page.evaluate(() => find('button.transcript')[0].click());
    await page.waitForFunction(() => visibleText('.progress').some(text => text.includes('直播')) && visibleText('.notice').length, undefined, {timeout: 15000});
    const layout = await page.evaluate(() => {
      const host = document.querySelector('[data-roamcat-ui="video-transcript"]'), title = document.querySelector('#title');
      const panel = host.getBoundingClientRect(), heading = title.getBoundingClientRect();
      return {parent: host.parentElement.id, first: host.parentElement.firstElementChild === host, panelBottom: Math.round(panel.bottom), titleTop: Math.round(heading.top),
        progress: visibleText('.progress')[0], notice: visibleText('.notice')[0], download: visibleText('.download').length + visibleText('[data-action="download"]').length};
    });
    assert.equal(layout.parent, 'below');
    assert.ok(layout.first, '应在 #below 最前');
    assert.ok(layout.panelBottom <= layout.titleTop, `面板底边 ${layout.panelBottom} 压住标题顶 ${layout.titleTop}`);
    assert.ok(layout.notice.includes('没有可回看的原文稿'), layout.notice);
    assert.equal(layout.download, 0, '直播时不应显示下载按钮');
    await page.screenshot({path: previewPath('video-ui', 'live.png')});
    return {panelBottom: layout.panelBottom, titleTop: layout.titleTop, progress: layout.progress};
  });
  await page.evaluate(() => RoamCatVideoSubtitles.unmount());

  live = false;
  await page.goto('https://www.youtube.com/watch?v=vodfixture1');
  await mount();
  await gate.check('普通视频读不到字幕：不提直播，带「重新读取字幕」', async () => {
    await page.waitForFunction(() => visibleText('.empty p').length, undefined, {timeout: 20000});
    const vod = await page.evaluate(() => ({text: visibleText('.empty p')[0], retry: visibleText('.empty .retry').length}));
    assert.ok(!vod.text.includes('直播'), vod.text);
    assert.equal(vod.retry, 1);
    return vod.text;
  });
  await page.evaluate(() => RoamCatVideoSubtitles.unmount());
  await gate.check('页面无脚本错误', async () => assert.deepEqual(errors, []));
} finally {
  await run.close();
}
await gate.check('真实后台：视频页初始化及普通状态刷新保留已保存字幕外观', async () => {
  const extension = await openBrowser();
  try {
    const control = extension.page;
    await control.goto(extUrl('ui/popup.html'));
    const request = async (type, payload = {}) => {
      const reply = await control.evaluate(message => chrome.runtime.sendMessage(message), {type, ...payload});
      assert.ok(reply?.ok, reply?.error);
      return reply.data;
    };
    await request('STATE_PATCH', {patch: {floatingPet: {enabled: false}, assistanceMode: 'on-demand'}});
    const video = {fontSize: 28, theme: 'dark', bilingual: true, display: 'translation', translationFirst: false, translationColor: 'yellow', blur: true, offset: 35, karaoke: false, liveChat: false};
    await request('VIDEO_SETTINGS_PATCH', {patch: video});
    const watch = await extension.newPage();
    watch.on('pageerror', error => errors.push(error.message));
    await watch.intercept(['https://www.youtube.com/*'], async () => ({headers: {'content-type': 'text/html; charset=utf-8'}, body: PAGE({live: false})}));
    await watch.goto('https://www.youtube.com/watch?v=settingsfixture');
    const tabId = await tabIdOf(control, 'https://www.youtube.com/*');
    // 保留隔离世界创建的 closed roots，以便检查真实页内脚本的菜单值。
    await control.evaluate(tabId => chrome.scripting.executeScript({target: {tabId, frameIds: [0]}, func: () => {
      globalThis.videoTestRoots = [];
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function (options) { const root = attach.call(this, options); videoTestRoots.push(root); return root; };
    }}), tabId);
    await request('AUTOMATION_PATCH', {tabId, patch: {videoSites: true}});
    await watch.waitForFunction(() => Boolean(document.querySelector('[data-roamcat-ui="video-bilingual"]')));
    const inspect = () => control.evaluate(async tabId => {
      const [result] = await chrome.scripting.executeScript({target: {tabId, frameIds: [0]}, func: async () => {
        const reply = await chrome.runtime.sendMessage({type: 'STATE_GET'});
        const overlay = document.querySelector('[data-roamcat-ui="video-bilingual"]');
        const karaoke = videoTestRoots.flatMap(root => [...root.querySelectorAll('[data-setting="karaoke"]')])[0];
        // 译文尚未到达时字幕层会暂显原文；菜单选择才代表保存的显示偏好。
        const display = videoTestRoots.flatMap(root => [...root.querySelectorAll('[data-setting="display"] button[aria-pressed="true"]')])[0];
        return {video: reply.data.settings.video, display: display?.dataset.value, first: overlay.dataset.translationFirst, blur: overlay.dataset.blur, color: overlay.style.getPropertyValue('--tr-color'), karaoke: karaoke?.getAttribute('aria-checked')};
      }});
      return result.result;
    }, tabId);
    const expected = {video, display: 'translation', first: 'false', blur: 'true', color: '#ffe45c', karaoke: 'false'};
    assert.deepEqual(await inspect(), expected, '新视频页应使用已保存外观');
    await request('STATE_PATCH', {patch: {lookupKey: 'F'}});
    assert.deepEqual(await inspect(), expected, '普通 SS_REFRESH 不应把字幕外观恢复成默认');
    assert.deepEqual(errors, []);
    return {initial: true, refresh: true, settings: Object.keys(video).length};
  } finally {
    await extension.close();
  }
});

gate.finish({errors});
