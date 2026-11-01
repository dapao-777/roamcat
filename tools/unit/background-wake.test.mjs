/**
 * @file tools/unit/background-wake.test.mjs
 * 文件职责：固化 background.js 的自动开启对账分档——Service Worker 被回收后每次唤醒只确认已注册的内容脚本，
 *   不再逐个标签页补注入；只有浏览器会话的第一次启动、站点权限/自动开启/伴读猫/服务商设置变化才走全量。
 * 主要内容：用可共享的 chrome mock（storage.session 与已注册脚本表在多次「唤醒」间沿用）把 background.js 带查询串重复导入，
 *   模拟 Service Worker 重启——会话第一次启动做全量（注册脚本 + 查询并补注入标签页 + 写已对账标记）；
 *   普通唤醒不查标签页、不探测、不发消息，也不反注册再注册；注册被意外清掉时唤醒补回，但仍不碰标签页；
 *   标记丢失（浏览器重启、扩展重新启用）时回到全量；关闭伴读猫这类设置变更仍走全量并撤掉注册。
 *   订阅登录状态翻转才触发对账的部分见 background-subscription-reconcile.test.mjs。
 * 模块边界：只 mock 浏览器边界，不 mock 任何被测扩展模块；「不会发生」的断言保留一小段观察窗口（OBSERVE_MS）；
 *   不访问 IndexedDB；node:test 每文件独立进程，模块缓存只在本文件内共享。
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

/** 一次「唤醒」用的 chrome mock：session 存储与已注册脚本表由调用方传入，在多次唤醒间沿用；计数器每次唤醒清零。 */
function createWake({session, registered}) {
  const local = new Map([['wordSchemaVersion', 5], ['productSchemaVersion', 1], ['wordMaintenanceVersion', 1], ['words', []]]);
  // tabsQuery 只作参考：欢迎页/设置页整理和 STATE_PATCH 的广播也会查标签页；「逐个标签页补注入」以 tabsGet（activateTab 取标签页）与 executeScript 为准。
  const counts = {tabsQuery: 0, tabsGet: 0, executeScript: 0, tabsSendMessage: 0, register: 0, unregister: 0, getRegistered: 0};
  const listeners = {};
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
  const tabs = [{id: 1, url: 'https://example.com/a', active: true}, {id: 2, url: 'https://example.com/b', active: false}];
  const runtime = {
    id: 'testextensionid1234567890abcdef',
    lastError: null,
    getURL: path => `chrome-extension://${runtime.id}/${String(path).replace(/^\/+/u, '')}`,
    onConnect: {addListener() {}},
    onMessage: {addListener(fn) { listeners.message = fn; }},
    onInstalled: {addListener(fn) { (listeners.installed ||= []).push(fn); }},
    onStartup: {addListener(fn) { (listeners.startup ||= []).push(fn); }},
    sendMessage: async () => undefined,
    openOptionsPage: async () => {},
    connectNative: () => { throw new Error('mock: 未安装本机连接器'); },
    getContexts: async () => [],
  };
  const chrome = {
    runtime,
    i18n: {getUILanguage: () => 'zh-CN'},
    storage: {local: area(local), session: area(session)},
    tabs: {
      query: async () => { counts.tabsQuery++; return tabs.map(tab => ({...tab})); },
      get: async tabId => { counts.tabsGet++; return {...tabs.find(tab => tab.id === tabId), id: tabId}; },
      sendMessage: async () => { counts.tabsSendMessage++; return undefined; },
      create: async () => ({id: 99, windowId: 1}),
      remove: async () => {},
      update: async () => {},
      onRemoved: {addListener() {}},
      onUpdated: {addListener() {}},
      onActivated: {addListener() {}},
    },
    scripting: {
      executeScript: async () => { counts.executeScript++; return []; },
      getRegisteredContentScripts: async () => { counts.getRegistered++; return registered.map(item => structuredClone(item)); },
      registerContentScripts: async list => { counts.register++; registered.push(...list.map(item => ({world: 'ISOLATED', ...structuredClone(item)}))); return []; },
      unregisterContentScripts: async ({ids} = {}) => {
        counts.unregister++;
        for (let i = registered.length - 1; i >= 0; i--) if (!ids || ids.includes(registered[i].id)) registered.splice(i, 1);
      },
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
  return {chrome, counts, listeners};
}

const trustedPopup = chrome => ({id: chrome.runtime.id, url: chrome.runtime.getURL('ui/popup.html'), tab: {id: 1, url: 'https://example.com/a'}});

test('Service Worker 唤醒只对账已注册脚本，全量对账只在会话首次启动与设置变化时做', async t => {
  const session = new Map();
  const registered = [];
  let boot = 0;
  const wake = async prepare => {
    const mock = createWake({session, registered});
    globalThis.chrome = mock.chrome;
    prepare?.();
    // 带查询串重复导入 = 一次新的 Service Worker 启动（扩展自己的其它模块沿用缓存）。
    await import(`../../roamcat-0.0.1/extension/background.js?wake=${++boot}`);
    return mock;
  };
  const warnings = [];
  const originalError = console.error;
  console.error = (...args) => warnings.push(args.join(' '));
  try {
    let first;
    await t.test('浏览器会话里第一次启动：全量对账，注册脚本、逐个标签页补注入并写下已对账标记', async () => {
      first = await wake();
      await until(() => session.has('automationSynced'), '已对账标记');
      assert.ok(registered.some(item => item.id === 'ss-floating-pet'), '伴读猫默认开启，应注册 ss-floating-pet');
      assert.ok(first.counts.tabsGet >= 2, '全量对账要逐个处理已打开的标签页');
      assert.ok(first.counts.executeScript >= 2, '每个标签页都被探测/补注入');
      assert.equal(first.counts.register, 1);
    });

    await t.test('普通唤醒：已注册的与设置一致，不逐个处理标签页、不探测、不发消息，也不反注册再注册', async () => {
      const mock = await wake();
      await until(() => mock.counts.getRegistered >= 1, '读取已注册脚本');
      await sleep(OBSERVE_MS); // 断言「不会发生」：留一段观察窗口。
      assert.deepEqual(mock.counts, {...mock.counts, tabsGet: 0, executeScript: 0, tabsSendMessage: 0, register: 0, unregister: 0});
      assert.equal(registered.filter(item => item.id === 'ss-floating-pet').length, 1, '注册没有被动过');
    });

    await t.test('注册被意外清掉：唤醒时补回，但仍不碰已打开的标签页', async () => {
      const saved = registered.splice(0);
      const mock = await wake();
      await until(() => mock.counts.register >= 1, '补注册');
      await sleep(OBSERVE_MS);
      assert.equal(mock.counts.register, 1);
      assert.equal(mock.counts.unregister, 0, '没有要撤的旧注册');
      assert.equal(mock.counts.tabsGet, 0);
      assert.equal(mock.counts.executeScript, 0);
      assert.deepEqual(registered.map(item => item.id).sort(), saved.map(item => item.id).sort());
    });

    await t.test('注册内容过期（脚本清单变了）：先撤后注册，同样不碰标签页', async () => {
      registered.find(item => item.id === 'ss-floating-pet').js = ['floating-pet.js'];
      const mock = await wake();
      await until(() => mock.counts.register >= 1, '重新注册');
      await sleep(OBSERVE_MS);
      assert.equal(mock.counts.unregister, 1);
      assert.equal(mock.counts.register, 1);
      assert.ok(registered.find(item => item.id === 'ss-floating-pet').js.length > 1);
      assert.equal(mock.counts.tabsGet, 0);
      assert.equal(mock.counts.executeScript, 0);
    });

    await t.test('已对账标记丢失（浏览器重启、扩展被禁用后重新启用）：回到全量，给已打开的标签页补注入', async () => {
      session.delete('automationSynced');
      const mock = await wake();
      await until(() => session.has('automationSynced'), '重新写下标记');
      assert.ok(mock.counts.tabsGet >= 2);
      assert.ok(mock.counts.executeScript >= 2);
      assert.equal(mock.counts.register, 0, '注册本来就是对的，不重复注册');
      assert.equal(mock.counts.unregister, 0);
    });

    await t.test('设置变更仍走全量：关闭伴读猫会撤掉注册并重新补注入标签页', async () => {
      const mock = await wake();
      await until(() => mock.counts.getRegistered >= 1, '启动完成');
      await sleep(OBSERVE_MS);
      const before = {...mock.counts};
      const saved = await new Promise(resolve => mock.listeners.message({type: 'STATE_PATCH', patch: {floatingPet: {enabled: false}}}, trustedPopup(mock.chrome), resolve));
      assert.equal(saved.ok, true, saved.error);
      assert.equal(registered.some(item => item.id === 'ss-floating-pet'), false, '伴读猫关闭后不再注册');
      assert.ok(mock.counts.tabsGet >= before.tabsGet + 2, '设置变化要重新对账所有标签页');
      assert.equal(mock.counts.unregister, before.unregister + 1);
    });
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(warnings.filter(line => /自动开启策略|对账/u.test(line)), [], '对账过程不应有报错');
});
