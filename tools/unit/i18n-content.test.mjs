/**
 * @file tools/unit/i18n-content.test.mjs
 * 文件职责：内容脚本瘦身词典测试——i18n-content.js 与 i18n.js 无漂移、网页侧用到的键
 *   全部可查、运行时 API 与完整版一致。
 * 主要内容：生成物比对、键覆盖断言、存储受限时的语言初始化与消息刷新回归。
 * 模块边界：node:test + node:vm，不启动浏览器。
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
import {contentSideFiles, EXTENSION_DIR, generateFromTree, loadDicts} from '../../build/gen-i18n-content.mjs';

const read = name => readFileSync(path.join(EXTENSION_DIR, name), 'utf8');

function loadRuntime(name, storageMode) {
  const replies = [], listeners = [];
  const runtime = {
    lastError: undefined,
    sendMessage(message, reply) {
      assert.equal(message.type, 'STATE_GET');
      replies.push(reply);
    },
    onMessage: {addListener: listener => listeners.push(listener)},
  };
  const chrome = {runtime, i18n: {getUILanguage: () => 'zh-CN'}};
  if (storageMode !== 'missing') chrome.storage = {local: {
    get(_key, reply) {
      if (storageMode === 'throws') throw new Error('Access to storage is not allowed');
      runtime.lastError = {message: 'Access to storage is not allowed'};
      try { reply(undefined); } finally { runtime.lastError = undefined; }
    },
    set() { throw new Error('Access to storage is not allowed'); },
  }};
  const sandbox = {chrome, localStorage: {getItem: () => null, setItem() {}}};
  vm.runInNewContext(read(name), sandbox, {filename: name});
  assert.equal(replies.length, 1, '存储不可用时应向后台读取一次状态');
  return {
    i18n: sandbox.RoamCatI18n,
    reply(response, error) {
      runtime.lastError = error;
      try { replies[0](response); } finally { runtime.lastError = undefined; }
    },
    refresh: uiLang => listeners.forEach(listener => listener({type: 'SS_REFRESH', snapshot: {uiLang}})),
  };
}

for (const name of ['i18n.js', 'i18n-content.js']) {
  for (const mode of ['missing', 'throws', 'lastError']) {
    test(`${name}：存储不可用（${mode}）时从 STATE_GET 响应初始化语言`, () => {
      const {i18n, reply, refresh} = loadRuntime(name, mode);
      assert.equal(i18n.lang(), 'zh');
      reply({ok: true, data: {uiLang: 'en'}});
      assert.equal(i18n.pref(), 'en');
      assert.equal(i18n.lang(), 'en', '应使用后台保存的语言，而不是浏览器语言');
      refresh('zh');
      assert.equal(i18n.pref(), 'zh');
      assert.equal(i18n.lang(), 'zh', '后续 SS_REFRESH 仍应更新语言');
    });
  }

  test(`${name}：失败或无效的 STATE_GET 响应不覆盖语言偏好`, () => {
    for (const [response, error] of [
      [undefined],
      [{ok: false, data: {uiLang: 'en'}}],
      [{ok: true, uiLang: 'en'}],
      [{ok: true, data: {uiLang: 'invalid'}}],
      [{ok: true, data: {uiLang: 'en'}}, {message: 'The message port closed'}],
    ]) {
      const {i18n, reply} = loadRuntime(name, 'missing');
      reply(response, error);
      assert.equal(i18n.pref(), 'auto');
      assert.equal(i18n.lang(), 'zh');
    }
  });
}

test('i18n-content.js 与 i18n.js 同步（无漂移）', () => {
  assert.equal(read('i18n-content.js'), generateFromTree(), 'extension/i18n-content.js 已过期——请运行 npm run gen:i18n');
});

test('网页侧脚本引用的词典键都在瘦身词典里', () => {
  const full = loadDicts(read('i18n.js'));
  const slim = loadDicts(read('i18n-content.js'));
  for (const name of contentSideFiles()) {
    for (const [, key] of read(name).matchAll(/['"`]([a-zA-Z]+(?:\.[\w-]+)+)['"`]/gu)) {
      if (!Object.hasOwn(full.zh, key)) continue;
      assert.equal(slim.zh[key], full.zh[key], `${name} 引用的 ${key} 缺失（zh）`);
      assert.equal(slim.en[key], full.en[key], `${name} 引用的 ${key} 缺失（en）`);
    }
  }
  assert.ok(Object.keys(slim.zh).length < Object.keys(full.zh).length, '瘦身词典应只含网页侧命名空间');
  for(const key of ['ui.transOpen','ui.iKnow','c.limit'])assert.equal(slim.zh[key],full.zh[key],`按需加载的阅读引擎仍需 ${key}`);
});
