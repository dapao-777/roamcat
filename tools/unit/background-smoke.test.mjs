/**
 * @file tools/unit/background-smoke.test.mjs
 * 文件职责：在 Node 中以 chrome API mock 对迁移后的 background.js 做模块级冒烟测试——
 *   验证注册表能在真实模块作用域内构造（无 TDZ/引用错误）、消息监听接线完整、
 *   信任边界与载荷校验经注册表派发后行为不变。这是无浏览器环境下最接近 audit-extension.cjs 的一层。
 * 主要内容：mock chrome.runtime/storage/tabs；import 真实 background.js（node:test 每文件独立进程，
 *   模块缓存只在本文件内共享，因此 import 与全部派发断言放在同一测试的子树中）；经 onMessage 监听器
 *   发送 STATE_GET / OPEN_OPTIONS / DOMAIN_TEST / FLOATING_PET_POSITION_SET / API_MODELS_LIST /
 *   未知类型，断言成功、拒绝与错误文案；导入期不得出现注册表完整性告警。
 * 模块边界：仅 mock 浏览器边界，不 mock 任何被测扩展模块；不访问 IndexedDB（history-store 懒加载，
 *   本测试不触发历史操作）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';

function createChromeMock() {
  const areas = {local: new Map(), session: new Map()};
  const openedOptions = {count: 0};
  const listeners = {};
  const runtime = {
    id: 'testextensionid1234567890abcdef',
    lastError: null,
    getURL: path => `chrome-extension://${runtime.id}/${String(path).replace(/^\/+/u, '')}`,
    onConnect: {addListener() {}},
    onMessage: {addListener(fn) { listeners.message = fn; }},
    onInstalled: {addListener(fn) { (listeners.installed ||= []).push(fn); }},
    onStartup: {addListener(fn) { (listeners.startup ||= []).push(fn); }},
    sendMessage: async () => undefined,
    openOptionsPage: async () => { openedOptions.count++; },
    connectNative: () => { throw new Error('mock: 未安装本机连接器'); },
    getContexts: async () => [],
  };
  const read = (map, keys) => {
    if (keys === null || keys === undefined) return Object.fromEntries(map);
    const list = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(list.filter(key => map.has(key)).map(key => [key, map.get(key)]));
  };
  const write = (map, value) => { for (const [key, item] of Object.entries(value || {})) map.set(key, structuredClone(item)); };
  const drop = (map, keys) => { for (const key of Array.isArray(keys) ? keys : [keys]) map.delete(key); };
  const storageArea = map => ({
    get: async keys => read(map, keys),
    set: async value => write(map, value),
    remove: async keys => drop(map, keys),
    getBytesInUse: async () => 0,
    QUOTA_BYTES: 10 * 1024 * 1024,
  });
  const chrome = {
    runtime,
    storage: {local: storageArea(areas.local), session: storageArea(areas.session)},
    tabs: {
      query: async () => [],
      get: async tabId => ({id: tabId, url: 'https://example.com/', active: true}),
      sendMessage: async () => undefined,
      create: async () => ({id: 99}),
      onRemoved: {addListener() {}},
      onUpdated: {addListener() {}},
      onActivated: {addListener() {}},
    },
    scripting: {
      executeScript: async () => [],
      getRegisteredContentScripts: async () => [],
      registerContentScripts: async () => [],
      unregisterContentScripts: async () => {},
    },
    contextMenus: {removeAll: async () => {}, create: () => {}, onClicked: {addListener() {}}},
    commands: {onCommand: {addListener() {}}},
    permissions: {contains: async () => false, remove: async () => false, onAdded: {addListener() {}}, onRemoved: {addListener() {}}},
    tts: {},
    offscreen: {hasDocument: async () => false, createDocument: async () => {}},
    webNavigation: {getFrame: async () => null, onHistoryStateUpdated: {addListener() {}}},
  };
  return {chrome, listeners, openedOptions};
}

const trustedPopup = chrome => ({id: chrome.runtime.id, url: chrome.runtime.getURL('ui/popup.html'), tab: {id: 1, url: 'https://example.com/'}});
const contentPage = chrome => ({id: chrome.runtime.id, url: 'https://example.com/', tab: {id: 1, url: 'https://example.com/'}, frameId: 0});

test('迁移后的 background.js 在 mock 浏览器中构造注册表并按信任边界派发', async (t) => {
  const warnings = [];
  const originalError = console.error;
  console.error = (...args) => warnings.push(args.join(' '));
  const {chrome, listeners, openedOptions} = createChromeMock();
  globalThis.chrome = chrome;
  try {
    await import('../../roamcat-0.2.0/extension/background.js');
  } finally {
    console.error = originalError;
  }

  // 注册表完整性自检（漏注册/多注册）在导入期必须保持静默。
  assert.deepEqual(warnings.filter(line => line.includes('消息处理器')), []);
  assert.equal(typeof listeners.message, 'function', 'onMessage 监听未注册');
  assert.equal(listeners.installed.length, 3);
  assert.equal(listeners.startup.length, 2);

  const send = (message, sender) => new Promise(resolve => {
    listeners.message(message, sender, response => resolve(response));
  });

  await t.test('受信扩展页读取默认状态', async () => {
    const response = await send({type: 'STATE_GET'}, trustedPopup(chrome));
    assert.equal(response.ok, true, response.error);
    assert.equal(response.data.settings.assistanceMode, 'ambient');
    assert.equal(response.data.settings.lookupKey, 'D');
  });

  await t.test('内容脚本按白名单放行与拒绝', async () => {
    const allowed = await send({type: 'STATE_GET'}, contentPage(chrome));
    assert.equal(allowed.ok, true, allowed.error);
    const denied = await send({type: 'STATE_PATCH', patch: {assistanceMode: 'on-demand'}}, contentPage(chrome));
    assert.equal(denied.ok, false);
    assert.match(denied.error, /此操作不能从网页执行。/u);
  });

  await t.test('未知类型得到与旧 switch default 一致的错误', async () => {
    const unknown = await send({type: 'NOT_A_REAL_TYPE'}, trustedPopup(chrome));
    assert.equal(unknown.ok, false);
    assert.match(unknown.error, /未知请求。/u);
  });

  await t.test('parse 阶段提取的载荷校验经真实派发生效', async () => {
    const badDomainTest = await send({type: 'DOMAIN_TEST', text: '  '}, trustedPopup(chrome));
    assert.equal(badDomainTest.ok, false);
    assert.match(badDomainTest.error, /测试正文不能为空/u);
  });

  await t.test('伴读猫载荷先来源检查后解析再落库', async () => {
    const badPet = await send({type: 'FLOATING_PET_POSITION_SET', position: {right: 1}}, contentPage(chrome));
    assert.equal(badPet.ok, false);
    assert.match(badPet.error, /伴读猫位置无效。/u);
    const goodPet = await send({type: 'FLOATING_PET_POSITION_SET', position: {right: 40, bottom: 120}}, contentPage(chrome));
    assert.equal(goodPet.ok, true, goodPet.error);
    assert.deepEqual(goodPet.data.floatingPet.position, {right: 40, bottom: 120});
  });

  await t.test('API_MODELS_LIST 仅允许 options 页', async () => {
    const wrongPage = await send({type: 'API_MODELS_LIST', service: {id: 'x'}}, {id: chrome.runtime.id, url: chrome.runtime.getURL('ui/welcome.html')});
    assert.equal(wrongPage.ok, false);
    assert.match(wrongPage.error, /仅设置页可以读取 API 模型列表。/u);
  });

  await t.test('OPEN_OPTIONS 走完注册表并产生真实副作用', async () => {
    const opened = await send({type: 'OPEN_OPTIONS'}, trustedPopup(chrome));
    assert.equal(opened.ok, true, opened.error);
    assert.equal(openedOptions.count, 1);
  });
});
