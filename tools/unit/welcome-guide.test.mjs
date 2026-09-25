/**
 * @file tools/unit/welcome-guide.test.mjs
 * 文件职责：新手引导页签治理的单元测试——锁死 Chromium 40670457 回归。
 *   无 tabs 权限时 chrome.tabs.query({url}) 对扩展自身页面静默落空，welcomeGuideTabs 必须
 *   改经 runtime.getContexts 枚举；settle/focus/close 三个调用方分别依赖它做去重、聚焦与关闭。
 * 主要内容：mock chrome.runtime.getContexts/tabs/storage/windows，断言去重不再新建、
 *   聚焦不重复开页、关闭能移除调用方自身页签（getCurrent 兜底）。
 * 模块边界：仅 mock 浏览器边界；shared.js 为真实模块（其依赖链在 background-smoke 已验证可导入）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';

const WELCOME_URL = 'chrome-extension://testext/ui/welcome.html';

function createChromeMock() {
  const local = new Map();
  const state = {
    contexts: [],
    queryResult: [],
    self: undefined,
    created: [],
    removed: [],
    updated: [],
    focused: [],
  };
  const read = keys => {
    if (keys === null || keys === undefined) return Object.fromEntries(local);
    const list = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(list.filter(key => local.has(key)).map(key => [key, local.get(key)]));
  };
  const chrome = {
    runtime: {
      id: 'testext',
      getURL: path => `chrome-extension://testext/${String(path).replace(/^\/+/u, '')}`,
      getContexts: async filter => state.contexts.filter(context =>
        !filter?.contextTypes || filter.contextTypes.includes(context.contextType)),
    },
    storage: {
      local: {
        get: async keys => read(keys),
        set: async value => { for (const [key, item] of Object.entries(value || {})) local.set(key, structuredClone(item)); },
        remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) local.delete(key); },
      },
    },
    tabs: {
      query: async () => state.queryResult,
      create: async props => { state.created.push(props); return {id: 900, windowId: 7}; },
      remove: async ids => { state.removed.push(...(Array.isArray(ids) ? ids : [ids])); },
      update: async (id, props) => { state.updated.push([id, props]); },
      getCurrent: async () => state.self,
    },
    windows: {
      update: async (id, props) => { state.focused.push([id, props]); },
    },
  };
  return {chrome, state, local};
}

const welcomeContext = (tabId, windowId, suffix = '') => ({
  contextType: 'TAB',
  documentUrl: WELCOME_URL + suffix,
  tabId,
  windowId,
});

const {chrome, state, local} = createChromeMock();
globalThis.chrome = chrome;
const shared = await import('../../roamcat-0.0.1/extension/shared.js');

const reset = () => {
  state.created.length = 0;
  state.removed.length = 0;
  state.updated.length = 0;
  state.focused.length = 0;
};

test('welcomeGuideTabs 在 tabs.query 静默落空时仍能枚举自家引导页', async () => {
  reset();
  state.contexts = [
    welcomeContext(11, 1),
    welcomeContext(12, 2, '#step-sandbox'),
    {contextType: 'TAB', documentUrl: 'chrome-extension://otherext/ui/welcome.html', tabId: 13, windowId: 3},
    {contextType: 'BACKGROUND', documentUrl: 'chrome-extension://testext/background.js', tabId: -1, windowId: -1},
    welcomeContext(11, 1),
  ];
  state.queryResult = [];
  const tabs = await shared.welcomeGuideTabs();
  assert.deepEqual(tabs, [{id: 11, windowId: 1}, {id: 12, windowId: 2}]);
});

test('settleWelcomeGuide(install) 对既有引导页只去重不新开', async () => {
  reset();
  state.contexts = [welcomeContext(21, 1), welcomeContext(22, 2), welcomeContext(23, 3)];
  local.set('welcomeGuideOpened', true);
  await shared.settleWelcomeGuide('install');
  assert.deepEqual(state.removed, [22, 23]);
  assert.equal(state.created.length, 0);
});

test('settleWelcomeGuide(install) 首次安装无引导页时新开一页并落旗', async () => {
  reset();
  state.contexts = [];
  local.delete('welcomeGuideOpened');
  await shared.settleWelcomeGuide('install');
  assert.deepEqual(state.created, [{url: WELCOME_URL}]);
  assert.equal(local.get('welcomeGuideOpened'), true);
});

test('settleWelcomeGuide 非 install 理由只去重，不消费安装旗标', async () => {
  reset();
  state.contexts = [];
  local.delete('welcomeGuideOpened');
  await shared.settleWelcomeGuide('startup');
  assert.equal(state.created.length, 0);
  assert.equal(local.has('welcomeGuideOpened'), false);
});

test('focusWelcomeGuide 命中既有页签时激活聚焦而非新建', async () => {
  reset();
  state.contexts = [welcomeContext(31, 4)];
  const kept = await shared.focusWelcomeGuide();
  assert.equal(kept.id, 31);
  assert.deepEqual(state.updated, [[31, {active: true}]]);
  assert.deepEqual(state.focused, [[4, {focused: true}]]);
  assert.equal(state.created.length, 0);
});

test('focusWelcomeGuide 无既有页签时才新建', async () => {
  reset();
  state.contexts = [];
  await shared.focusWelcomeGuide();
  assert.deepEqual(state.created, [{url: WELCOME_URL}]);
});

test('closeWelcomeGuide 同时移除枚举到的页签与调用方自身页签', async () => {
  reset();
  state.contexts = [welcomeContext(41, 1)];
  state.self = {id: 42};
  await shared.closeWelcomeGuide();
  assert.deepEqual(state.removed.sort((a, b) => a - b), [41, 42]);
  assert.equal(local.get('welcomeGuideOpened'), true);
  assert.equal(local.get('welcomeGuideClosed'), true);
  state.self = undefined;
});
