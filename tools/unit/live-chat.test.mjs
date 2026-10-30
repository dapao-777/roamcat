/**
 * @file tools/unit/live-chat.test.mjs
 * 文件职责：Twitch 直播聊天翻译的单元测试——页面侧的消息过滤与后台的每分钟限额。
 * 主要内容：live-chat.js 在 node:vm 中按 classic script 求值（桩出最小的 chrome/document），
 *   断言只在 www.twitch.tv 主框架挂载、worthTranslating 跳过表情/单词梗/刷屏/中文消息；
 *   rate-window.mjs 的滑动窗口放行、超额等待时长、按键隔离与 forget；subscription.js 的 lowTierModel（聊天在 Google
 *   订阅下换用同系列 -low 档）。
 * 模块边界：node:test + node:vm，不启动浏览器；后台消息派发与补注入在 background-smoke.test.mjs。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createRateWindow} from '../../roamcat-0.0.1/extension/rate-window.mjs';
import {lowTierModel} from '../../roamcat-0.0.1/extension/subscription.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = readFileSync(path.join(repoRoot, 'roamcat-0.0.1', 'extension', 'live-chat.js'), 'utf8');

function loadLiveChat(hostname) {
  const sent = [];
  const sandbox = {
    location: {hostname, pathname: '/somechannel'},
    chrome: {runtime: {id: 'ext', lastError: null, sendMessage: message => { sent.push(message); }, onMessage: {addListener() {}}}},
    document: {querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, hidden: false},
    setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {},
    crypto: globalThis.crypto,
  };
  sandbox.window = sandbox;
  sandbox.top = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return {api: sandbox.RoamCatLiveChat, sent};
}

test('live-chat.js 只在 www.twitch.tv 挂载', () => {
  assert.equal(loadLiveChat('www.youtube.com').api, undefined);
  const {api, sent} = loadLiveChat('www.twitch.tv');
  assert.ok(api, '在 Twitch 上必须暴露 RoamCatLiveChat');
  assert.equal(api.enabled(), false, '开关默认关闭，等 STATE_GET 回来再决定');
  assert.deepEqual(sent.map(message => message.type), ['STATE_GET']);
});

test('worthTranslating 跳过表情、单词梗、刷屏与中文消息', () => {
  const {worthTranslating} = loadLiveChat('www.twitch.tv').api;
  for (const text of ['that play was absolutely insane', 'can you explain the build again?', '@streamer what rank are you', 'これは何ですか 日本語']) {
    assert.equal(worthTranslating(text), true, text);
  }
  for (const text of ['KEKW', 'Pog', 'LUL LUL LUL', 'W', '!!!', 'https://clips.twitch.tv/abc', '@someone', '这波操作太秀了', '这个 build 好强']) {
    assert.equal(worthTranslating(text), false, text);
  }
});

test('createRateWindow 窗口内放行到上限，超额返回剩余等待', () => {
  const window = createRateWindow({limit: 3, windowMs: 60_000});
  assert.deepEqual(window.take(1, 0), {ok: true, retryAfterMs: 0});
  assert.equal(window.take(1, 10_000).ok, true);
  assert.equal(window.take(1, 20_000).ok, true);
  assert.deepEqual(window.take(1, 30_000), {ok: false, retryAfterMs: 30_000});
  // 被拒的那次不计数：最早一次过期后立刻能再放行一次。
  assert.equal(window.take(1, 60_000).ok, true);
  assert.equal(window.take(1, 60_001).ok, false);
});

test('createRateWindow 按键隔离，forget 清零', () => {
  const window = createRateWindow({limit: 1, windowMs: 1000});
  assert.equal(window.take('a', 0).ok, true);
  assert.equal(window.take('a', 1).ok, false);
  assert.equal(window.take('b', 1).ok, true);
  window.forget('a');
  assert.equal(window.take('a', 2).ok, true);
});

test('createRateWindow 拒绝无效参数', () => {
  for (const options of [{limit: 0, windowMs: 1000}, {limit: 1.5, windowMs: 1000}, {limit: 1, windowMs: 0}, {limit: 1, windowMs: Infinity}]) {
    assert.throws(() => createRateWindow(options), /无效的限额设置。/u);
  }
});

test('lowTierModel 只在列表里有同系列 -low 时把 -high / -medium 换过去', () => {
  const models = ['gemini-3.8-flash-high', 'gemini-3.8-flash-medium', 'gemini-3.8-flash-low', 'claude-sonnet-4-6', 'gpt-oss-120b-medium'].map(id => ({id}));
  assert.equal(lowTierModel('gemini-3.8-flash-high', models), 'gemini-3.8-flash-low');
  assert.equal(lowTierModel('gemini-3.8-flash-medium', models), 'gemini-3.8-flash-low');
  assert.equal(lowTierModel('gemini-3.8-flash-low', models), 'gemini-3.8-flash-low');
  assert.equal(lowTierModel('claude-sonnet-4-6', models), 'claude-sonnet-4-6');
  // 同系列没有 -low：保持原样，不猜一个不存在的模型。
  assert.equal(lowTierModel('gpt-oss-120b-medium', models), 'gpt-oss-120b-medium');
  assert.equal(lowTierModel('gemini-3.8-flash-high', []), 'gemini-3.8-flash-high');
  assert.equal(lowTierModel('', models), '');
});
