/**
 * @file tools/unit/background-subscription-reconcile.test.mjs
 * 文件职责：固化 background.js 对订阅状态的对账门槛——订阅的登录状态真正翻转才重新对账所有标签页；
 *   同一登录状态下状态里别的字段变化（邮箱、套餐、报错）不触发。每次 Service Worker 唤醒后的状态刷新、定时确认都会重复发出
 *   同样的状态，若每次都逐个标签页补注入，就把「唤醒只对账已注册脚本」的收益吃掉了。
 * 主要内容：假的 chrome.runtime.connectNative 端口应答 status 请求（用 grok 通道，避开当前服务的广播路径），
 *   经真实的 subscription.js 与 background.js 的 handleSubscriptionStatus 驱动：未登录→已登录、已登录→未登录各触发一次对账，
 *   登录状态不变只改邮箱/套餐不触发，断开重连（刷新连接）不触发。以 executeScript 计数识别「逐个标签页补注入」。
 * 模块边界：只 mock 浏览器边界与 WebSocket（置空，让订阅直接走本机连接器端口，不去连开发机上真实的常驻服务）；
 *   「不会发生」的断言保留一小段观察窗口（OBSERVE_MS）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';

const OBSERVE_MS = 150;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(condition, label, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) assert.fail(`等待超时：${label}`);
    await sleep(10);
  }
}

test('订阅登录状态翻转才重新对账，同一登录状态下的其它变化不触发', async () => {
  const session = new Map();
  const local = new Map([['wordSchemaVersion', 5], ['productSchemaVersion', 1], ['wordMaintenanceVersion', 1], ['words', []]]);
  const counts = {executeScript: 0};
  const registered = [];
  const read = (map, keys) => {
    if (keys === null || keys === undefined) return Object.fromEntries(map);
    return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => map.has(key)).map(key => [key, map.get(key)]));
  };
  const area = map => ({
    get: async keys => read(map, keys),
    set: async value => { for (const [key, item] of Object.entries(value || {})) map.set(key, structuredClone(item)); },
    remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) map.delete(key); },
    getBytesInUse: async () => 0,
    QUOTA_BYTES: 10 * 1024 * 1024,
  });
  // 状态由测试逐次指定；端口只应答 status 请求。
  let nextStatus = {connected: true, authenticated: false};
  const connectNative = () => {
    const messageListeners = [];
    return {
      onMessage: {addListener: listener => messageListeners.push(listener)},
      onDisconnect: {addListener() {}},
      disconnect() {},
      postMessage(message) {
        queueMicrotask(() => { for (const listener of messageListeners) listener({id: message.id, ok: true, data: nextStatus}); });
      },
    };
  };
  const runtime = {
    id: 'testextensionid1234567890abcdef',
    lastError: null,
    getURL: path => `chrome-extension://${runtime.id}/${String(path).replace(/^\/+/u, '')}`,
    onConnect: {addListener() {}},
    onMessage: {addListener() {}},
    onInstalled: {addListener() {}},
    onStartup: {addListener() {}},
    sendMessage: async () => undefined,
    openOptionsPage: async () => {},
    connectNative,
    getContexts: async () => [],
  };
  globalThis.chrome = {
    runtime,
    i18n: {getUILanguage: () => 'zh-CN'},
    storage: {local: area(local), session: area(session)},
    tabs: {
      query: async () => [{id: 1, url: 'https://example.com/a', active: true}],
      get: async tabId => ({id: tabId, url: 'https://example.com/a', active: true}),
      sendMessage: async () => undefined,
      create: async () => ({id: 99, windowId: 1}),
      remove: async () => {},
      update: async () => {},
      onRemoved: {addListener() {}},
      onUpdated: {addListener() {}},
      onActivated: {addListener() {}},
    },
    scripting: {
      executeScript: async () => { counts.executeScript++; return []; },
      getRegisteredContentScripts: async () => registered.map(item => structuredClone(item)),
      registerContentScripts: async list => { registered.push(...list.map(item => ({world: 'ISOLATED', ...structuredClone(item)}))); return []; },
      unregisterContentScripts: async ({ids} = {}) => { for (let i = registered.length - 1; i >= 0; i--) if (!ids || ids.includes(registered[i].id)) registered.splice(i, 1); },
    },
    contextMenus: {removeAll: async () => {}, create: () => {}, onClicked: {addListener() {}}},
    commands: {onCommand: {addListener() {}}},
    permissions: {
      contains: async perms => Boolean(perms?.origins?.some(origin => origin === 'http://*/*' || origin === 'https://*/*')),
      remove: async () => false,
      onAdded: {addListener() {}},
      onRemoved: {addListener() {}},
    },
    tts: {},
    offscreen: {hasDocument: async () => false, createDocument: async () => {}},
    webNavigation: {getFrame: async () => null, onHistoryStateUpdated: {addListener() {}}, onBeforeNavigate: {addListener() {}}, onCommitted: {addListener() {}}},
    action: {setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {}},
    windows: {getAll: async () => [{id: 3, focused: true, type: 'normal', tabs: [{id: 1, url: 'https://example.com/a'}]}], update: async () => {}},
  };
  // 置空 WebSocket：订阅直接走本机连接器端口，不去连开发机上真实的常驻服务。
  const realWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = undefined;
  try {
    await import('../../roamcat-0.0.1/extension/background.js');
    const {refreshSubscription} = await import('../../roamcat-0.0.1/extension/subscription.js');
    await until(() => session.has('automationSynced'), '会话首次启动的全量对账');
    await sleep(OBSERVE_MS);
    const settle = async () => { await sleep(OBSERVE_MS); return counts.executeScript; };
    const baseline = await settle();

    nextStatus = {connected: true, authenticated: false, email: null, plan: null};
    await refreshSubscription('grok');
    // 会话里还没有记录：第一次事件算「翻转」，对账一次（浏览器刚启动时本来就会全量，这里多一次无妨）。
    await until(() => counts.executeScript > baseline, '首次状态事件的对账');
    const afterFirst = await settle();

    nextStatus = {connected: true, authenticated: false, email: 'reader@example.com', plan: 'SuperGrok'};
    await refreshSubscription('grok');
    assert.equal(await settle(), afterFirst, '登录状态没变，只是邮箱/套餐更新，不该重新逐个标签页补注入');

    nextStatus = {connected: true, authenticated: true, email: 'reader@example.com', plan: 'SuperGrok'};
    await refreshSubscription('grok');
    await until(() => counts.executeScript > afterFirst, '登录成功触发对账');
    const afterLogin = await settle();

    nextStatus = {connected: true, authenticated: true, email: 'reader@example.com', plan: 'SuperGrok Heavy'};
    await refreshSubscription('grok');
    assert.equal(await settle(), afterLogin, '已登录状态下套餐变化不触发');

    nextStatus = {connected: true, authenticated: false, email: null, plan: null, authFailed: true};
    await refreshSubscription('grok');
    await until(() => counts.executeScript > afterLogin, '登录失效触发对账');
    assert.equal(session.get('subscriptionAuth:grok'), false);
    const afterLogout = await settle();

    // 刷新连接会先拆旧端口再重连，中间那次「未连接」的登录状态不可信：不记录也不对账。
    nextStatus = {connected: false, authenticated: false, error: 'connector exited', stage: 'start'};
    await refreshSubscription('grok');
    assert.equal(await settle(), afterLogout, '断开不触发对账');
    assert.equal(session.get('subscriptionAuth:grok'), false, '断开不改写记着的登录状态');
    nextStatus = {connected: true, authenticated: false, email: null, plan: null};
    await refreshSubscription('grok');
    assert.equal(await settle(), afterLogout, '断开后重连，登录状态仍是未登录，不触发对账');
  } finally {
    globalThis.WebSocket = realWebSocket;
  }
});
