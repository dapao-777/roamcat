/**
 * @file YouTube 字幕异步回归：关闭重开、换片/卸载、原生自动翻译身份与连续设置保存。
 * 主要内容：独立 ego lite 加载真实 dist 脚本，使用可控桥接/播放器与延迟翻译响应复现竞态。
 * 模块边界：只供 verify-video-ui.mjs 调用，不访问真站或模型，不修改 dist。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {openBrowser, DIST} from './ego.mjs';

const ENGLISH = 'Careful readers compare evidence before they draw a conclusion.';
const caption = text => JSON.stringify({events: [{tStartMs: 0, dDurationMs: 60000, segs: [{utf8: text}]}]});
const PAGE = `<!doctype html><meta charset="utf-8"><title>YouTube async fixture</title><style>
  body{margin:0}ytd-watch-flexy,ytd-player{display:block;width:960px}
  #movie_player{width:960px;height:540px;position:relative;background:#000}video{width:960px;height:540px}
  .ytp-chrome-bottom{position:absolute;bottom:0;left:0;right:0;height:40px}.ytp-right-controls{display:flex;float:right}
  .ytp-caption-window-container{position:absolute;bottom:50px;color:white}
</style><ytd-watch-flexy><ytd-player><div id="movie_player" class="html5-video-player"><video></video>
  <div class="ytp-chrome-bottom"><div class="ytp-right-controls"><button class="ytp-subtitles-button" aria-pressed="true">CC</button></div><span class="ytp-time-display">0:00</span></div>
  <div class="ytp-caption-window-container"></div></div></ytd-player><div id="below"><h1>Fixture title</h1></div></ytd-watch-flexy>`;

export async function verifyVideoRegressions(gate) {
  const run = await openBrowser({extension: null});
  const errors = [];
  try {
    const page = run.page;
    page.on('pageerror', error => errors.push(error.message));
    await page.intercept(['https://www.youtube.com/*'], async request => {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/fixture/')) return {headers: {'content-type': 'text/javascript; charset=utf-8'}, body: await fs.readFile(path.join(DIST, url.pathname.slice(9)))};
      if (url.pathname === '/api/timedtext') return {headers: {'content-type': 'application/json'}, body: caption(url.searchParams.get('tlang') ? '这是原生自动翻译的中文。' : url.searchParams.get('kind') === 'asr' ? 'An automatic track must not replace the manual original.' : ENGLISH)};
      return {headers: {'content-type': 'text/html; charset=utf-8'}, body: PAGE};
    });
    async function mount(id, mode = 'track', bilingual = true) {
      await page.goto('https://www.youtube.com/watch?v=' + id);
      await page.evaluate(({mode, bilingual}) => {
        window.shadows = [];
        const attach = Element.prototype.attachShadow;
        Element.prototype.attachShadow = function (options) { const root = attach.call(this, options); shadows.push(root); return root; };
        window.chrome = {runtime: {sendMessage(_message, callback) { callback?.({ok: true, data: {uiLang: 'zh'}}); }}, i18n: {getUILanguage: () => 'zh'}};
        Object.defineProperty(document.querySelector('video'), 'duration', {configurable: true, value: 60});
        window.find = selector => shadows.flatMap(root => [...root.querySelectorAll(selector)]);
        window.translationText = () => find('.stack .translation').filter(el => !el.hidden && el.getClientRects().length).map(el => el.textContent.trim()).join('|');
        window.settingsView = () => ({fontSize: find('[data-setting="fontSize"] button[aria-pressed="true"]')[0]?.dataset.value, color: find('[data-setting="translationColor"] button[aria-pressed="true"]')[0]?.dataset.value});
        window.requests = [];
        window.pending = [];
        window.persisted = {bilingual, fontSize: 20, translationColor: 'white'};
        if (mode === 'dom') document.querySelector('.ytp-time-display').classList.add('ytp-live');
      }, {mode, bilingual});
      for (const name of ['design.js', 'i18n-content.js', 'vendor/youtube-caption-json3.js', 'video-subtitles.js']) await page.addScriptTag({url: `https://www.youtube.com/fixture/${name}`});
      if (mode.startsWith('native')) {
        await page.evaluate(mode => {
          const id = new URL(location.href).searchParams.get('v');
          window.manualTrack = {vssId: '.en', languageCode: 'en', baseUrl: `https://www.youtube.com/api/timedtext?v=${id}&lang=en&fmt=json3`};
          window.automaticTrack = {...manualTrack, vssId: 'a.en', kind: 'asr', baseUrl: manualTrack.baseUrl + '&kind=asr'};
          window.nativeSelected = mode === 'native-asr' ? {...automaticTrack} : {...manualTrack, translationLanguage: {languageCode: 'zh-Hans'}};
          window.nativeChanges = [];
          const player = document.getElementById('movie_player');
          player.getPlayerResponse = () => ({videoDetails: {videoId: id}, captions: {playerCaptionsTracklistRenderer: {captionTracks: [manualTrack, automaticTrack]}}});
          player.getVideoData = () => ({video_id: id});
          player.getOption = () => nativeSelected;
          player.isSubtitlesOn = () => document.querySelector('.ytp-subtitles-button').getAttribute('aria-pressed') === 'true';
          player.setOption = (_module, _option, value) => {
            nativeSelected = {...value}; nativeChanges.push({...value});
            const url = new URL(manualTrack.baseUrl);
            if (value.kind) url.searchParams.set('kind', value.kind);
            if (value.translationLanguage?.languageCode) url.searchParams.set('tlang', value.translationLanguage.languageCode);
            void fetch(url.href);
          };
        }, mode);
        await page.addScriptTag({url: 'https://www.youtube.com/fixture/youtube-captions-bridge.js'});
        await page.evaluate(async mode => {
          const url = new URL(manualTrack.baseUrl);
          url.searchParams.set(mode === 'native-asr' ? 'kind' : 'tlang', mode === 'native-asr' ? 'asr' : 'zh-Hans');
          await fetch(url.href);
          await new Promise(resolve => requestAnimationFrame(resolve));
        }, mode);
      } else await page.evaluate(mode => {
        addEventListener('roamcat:youtube-captions-request', event => {
          const videoId = new URL(location.href).searchParams.get('v');
          const track = mode === 'dom' ? null : {key: '.en', languageCode: 'en', baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`};
          const text = JSON.stringify({events: [{tStartMs: 0, dDurationMs: 60000, segs: [{utf8: 'Careful readers compare evidence before they draw a conclusion.'}]}]});
          dispatchEvent(new CustomEvent('roamcat:youtube-captions-response', {detail: {requestId: event.detail.requestId, videoId, track, ...(event.detail.command === 'caption' ? {text} : {})}}));
        });
      }, mode);
      await page.evaluate(() => {
        window.callbacks = {settings: persisted, onAssist() {}, onPrepareBridge: async () => {},
          onSettingsChange: async patch => { persisted = {...persisted, ...patch}; return {video: persisted}; },
          onTranslate: items => {
            requests.push({videoId: new URL(location.href).searchParams.get('v'), items});
            return new Promise(resolve => pending.push(text => resolve({items: items.map(item => ({id: item.id, translation: text || '正确的测试译文。'}))})));
          }};
        RoamCatVideoSubtitles.mount(callbacks);
      });
    }
    async function domText(text) {
      await page.evaluate(text => { document.querySelector('.ytp-caption-window-container').innerHTML = '<span class="ytp-caption-segment"></span>'; document.querySelector('.ytp-caption-segment').textContent = text; document.querySelector('video').dispatchEvent(new Event('timeupdate')); }, text);
    }
    async function setupSaves(id) {
      await mount(id, 'dom', false);
      await page.evaluate(() => {
        window.saves = [];
        callbacks.onSettingsChange = patch => new Promise((resolve, reject) => saves.push({patch, resolve() { persisted = {...persisted, ...patch}; resolve({video: {...persisted}}); }, reject}));
        RoamCatVideoSubtitles.mount(callbacks);
        find('.menu-toggle')[0].click();
      });
    }
    async function choose(key, value) { await page.evaluate(({key, value}) => find(`[data-setting="${key}"] button[data-value="${value}"]`)[0].click(), {key, value}); }

    await gate.check('双语关闭期间成功的同源译文可在重开后显示，不残留 pending', async () => {
      await mount('toggle-regression');
      await page.waitForFunction(() => requests.length === 1);
      await page.evaluate(() => find('button.bilingual')[0].click());
      await page.waitForFunction(() => find('button.bilingual')[0].getAttribute('aria-pressed') === 'false');
      await page.evaluate(async () => { pending[0](); await new Promise(resolve => requestAnimationFrame(resolve)); });
      await page.evaluate(() => find('button.bilingual')[0].click());
      await page.waitForFunction(() => translationText() === '正确的测试译文。');
      assert.equal(await page.evaluate(() => requests.length), 1);
    });
    for (const mode of ['native-translated', 'native-asr']) await gate.check(mode === 'native-translated' ? '原生自动翻译不污染英文原文，临时取原文后还原目标语言' : '同语言的自动/人工字幕缓存互相隔离', async () => {
      await mount(mode, mode);
      await page.waitForFunction(() => requests.length === 1, undefined, {timeout: 12000});
      const before = await page.evaluate(() => ({source: requests[0].items[0].text, selected: nativeSelected, changes: nativeChanges}));
      assert.equal(before.source, ENGLISH);
      if (mode === 'native-translated') assert.equal(before.selected.translationLanguage?.languageCode, 'zh-Hans');
      else assert.equal(before.selected.kind, 'asr');
      assert.equal(before.changes[0].translationLanguage, undefined);
      await page.evaluate(() => pending[0]());
      await page.waitForFunction(() => translationText() === '正确的测试译文。');
      const shown = await page.evaluate(() => find('.original')[0].textContent.trim());
      assert.equal(shown, ENGLISH);
      // 还原设置引发的迟到 translated/asr 响应不能再被用于人工原文。
      if (mode === 'native-translated') {
        const next = await page.evaluate(() => new Promise(resolve => {
          const requestId = 'roamcat-cache-regression';
          function receive(event) { if (event.detail.requestId === requestId) { removeEventListener('roamcat:youtube-captions-response', receive); resolve(event.detail.text); } }
          addEventListener('roamcat:youtube-captions-response', receive);
          dispatchEvent(new CustomEvent('roamcat:youtube-captions-request', {detail: {requestId, command: 'caption'}}));
        }));
        assert.equal(JSON.parse(next).events[0].segs[0].utf8, ENGLISH);
      }
    });
    await gate.check('换视频废弃旧直播队列，新字幕不等待旧在途请求', async () => {
      await mount('live-old-regression', 'dom');
      await domText('Old first sentence with enough English words.');
      await page.waitForFunction(() => requests.length === 1);
      await domText('Old queued sentence must never be sent after navigation.');
      await new Promise(resolve => setTimeout(resolve, 750)); // 经过实际 650ms DOM 字幕去抖，使旧句进入队列。
      await page.evaluate(() => { history.pushState({}, '', '/watch?v=live-new-regression'); document.querySelector('video').dispatchEvent(new Event('loadedmetadata')); });
      await domText('New video sentence can be translated immediately.');
      await page.waitForFunction(() => requests.length === 2, undefined, {timeout: 10000});
      const latest = await page.evaluate(() => requests[1]);
      assert.equal(latest.videoId, 'live-new-regression');
      assert.equal(latest.items[0].text, 'New video sentence can be translated immediately.');
      await page.evaluate(() => pending[1]('新视频译文。'));
      await page.waitForFunction(() => translationText() === '新视频译文。');
      await page.evaluate(async () => { pending[0]('旧视频迟到译文。'); await new Promise(resolve => requestAnimationFrame(resolve)); });
      assert.deepEqual(await page.evaluate(() => ({requests: requests.length, text: translationText()})), {requests: 2, text: '新视频译文。'});
    });
    await gate.check('卸载后旧直播队列不再发送，也不重建字幕层', async () => {
      await mount('live-unmount-regression', 'dom');
      await domText('First live sentence is still being translated.');
      await page.waitForFunction(() => requests.length === 1);
      await domText('Queued live sentence must be discarded on unmount.');
      await new Promise(resolve => setTimeout(resolve, 750));
      await page.evaluate(async () => { RoamCatVideoSubtitles.unmount(); pending[0](); await new Promise(resolve => requestAnimationFrame(resolve)); });
      assert.deepEqual(await page.evaluate(() => ({requests: requests.length, layer: Boolean(document.querySelector('[data-roamcat-ui="video-bilingual"]'))})), {requests: 1, layer: false});
    });
    await gate.check('连续设置保存按顺序执行，旧后台快照不覆盖较新预览', async () => {
      await setupSaves('settings-queue-regression');
      await choose('fontSize', '28');
      await choose('translationColor', 'yellow');
      await page.waitForFunction(() => saves.length === 1);
      assert.deepEqual(await page.evaluate(() => settingsView()), {fontSize: '28', color: 'yellow'});
      await page.evaluate(() => { RoamCatVideoSubtitles.mount({...callbacks, settings: {...persisted}}); saves[0].resolve(); });
      await page.waitForFunction(() => saves.length === 2);
      assert.deepEqual(await page.evaluate(() => settingsView()), {fontSize: '28', color: 'yellow'});
      await page.evaluate(() => saves[1].resolve());
      await page.waitForFunction(() => persisted.translationColor === 'yellow');
      assert.deepEqual(await page.evaluate(() => settingsView()), {fontSize: '28', color: 'yellow'});
    });
    await gate.check('单次设置保存失败仅回滚该次修改，保留此前成功字段', async () => {
      await setupSaves('settings-rollback-regression');
      await choose('fontSize', '28'); await choose('translationColor', 'yellow');
      await page.waitForFunction(() => saves.length === 1);
      await page.evaluate(() => saves[0].resolve());
      await page.waitForFunction(() => saves.length === 2);
      await page.evaluate(() => saves[1].reject(new Error('Fixture save failure')));
      await page.waitForFunction(() => settingsView().color === 'white');
      assert.deepEqual(await page.evaluate(() => settingsView()), {fontSize: '28', color: 'white'});
    });
    await gate.check('较早设置失败不撤销同一字段的后续修改', async () => {
      await setupSaves('settings-overlap-regression');
      await choose('fontSize', '28'); await choose('fontSize', '16');
      await page.waitForFunction(() => saves.length === 1);
      await page.evaluate(() => saves[0].reject(new Error('Older save failed')));
      await page.waitForFunction(() => saves.length === 2);
      assert.equal(await page.evaluate(() => settingsView().fontSize), '16');
      await page.evaluate(() => saves[1].resolve());
      await page.waitForFunction(() => persisted.fontSize === 16);
      assert.equal(await page.evaluate(() => settingsView().fontSize), '16');
    });
    await gate.check('卸载期间仍保存已经提交的偏好，不重建界面', async () => {
      await setupSaves('settings-unmount-regression');
      await choose('fontSize', '28'); await choose('translationColor', 'yellow');
      await page.waitForFunction(() => saves.length === 1);
      await page.evaluate(() => { RoamCatVideoSubtitles.unmount(); saves[0].resolve(); });
      await page.waitForFunction(() => saves.length === 2);
      await page.evaluate(() => saves[1].resolve());
      await page.waitForFunction(() => persisted.translationColor === 'yellow');
      assert.deepEqual(await page.evaluate(() => ({fontSize: persisted.fontSize, color: persisted.translationColor, layer: Boolean(document.querySelector('[data-roamcat-ui="video-bilingual"]'))})), {fontSize: 28, color: 'yellow', layer: false});
    });
    await gate.check('字幕异步回归没有未捕获脚本错误', () => assert.deepEqual(errors, []));
  } finally { await run.close(); }
}
