/**
 * @file tools/unit/options-pages.test.mjs
 * 文件职责：设置页页签治理的单元测试——锁死「每开一次设置就多一扇 Alt+Tab 窗口」。
 *   无 tabs 权限时 tabs.query({url}) 对扩展页静默落空，必须改经 getContexts 枚举；
 *   已有设置页要搬回正在浏览的窗口，副本关掉，没有时才在该窗口新建。
 * 主要内容：mock chrome.runtime.getContexts / tabs / windows，断言去重、搬迁与聚焦。
 * 模块边界：仅 mock 浏览器边界；shared.js 为真实模块。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';

const OPTIONS_URL = 'chrome-extension://testext/ui/options.html';

function createChromeMock() {
  const state = {
    contexts: [],
    queryResult: [],
    windows: [],
    created: [],
    removed: [],
    updated: [],
    moved: [],
    focused: [],
    failMove: false,
  };
  const chrome = {
    runtime: {
      id: 'testext',
      getURL: path => `chrome-extension://testext/${String(path).replace(/^\/+/u, '')}`,
      getContexts: async filter => state.contexts.filter(context =>
        !filter?.contextTypes || filter.contextTypes.includes(context.contextType)),
    },
    tabs: {
      query: async () => state.queryResult,
      create: async props => { state.created.push(props); return {id: 900, windowId: props.windowId ?? 7}; },
      remove: async ids => { state.removed.push(...(Array.isArray(ids) ? ids : [ids])); },
      update: async (id, props) => { state.updated.push([id, props]); },
      move: async (id, props) => {
        if (state.failMove) throw new Error('move failed');
        state.moved.push([id, props]);
        return {id, windowId: props.windowId};
      },
    },
    windows: {
      getAll: async () => state.windows,
      update: async (id, props) => { state.focused.push([id, props]); },
    },
  };
  return {chrome, state};
}

const optionsContext = (tabId, windowId, suffix = '') => ({
  contextType: 'TAB',
  documentUrl: OPTIONS_URL + suffix,
  tabId,
  windowId,
});

const {chrome, state} = createChromeMock();
globalThis.chrome = chrome;
const shared = await import('../../roamcat-0.0.1/extension/shared.js');

const reset = () => {
  state.created.length = 0;
  state.removed.length = 0;
  state.updated.length = 0;
  state.moved.length = 0;
  state.focused.length = 0;
  state.contexts = [];
  state.queryResult = [];
  state.windows = [];
  state.failMove = false;
};

test('optionsPageTabs 在 tabs.query 静默落空时仍能枚举设置页', async () => {
  reset();
  state.contexts = [
    optionsContext(11, 1),
    optionsContext(12, 2, '#service'),
    {contextType: 'TAB', documentUrl: 'about:srcdoc', tabId: 11, windowId: 1},
    {contextType: 'TAB', documentUrl: 'chrome-extension://otherext/ui/options.html', tabId: 13, windowId: 3},
  ];
  const tabs = await shared.optionsPageTabs();
  assert.deepEqual(tabs, [{id: 11, windowId: 1}, {id: 12, windowId: 2}]);
});

test('settleOptionsPages 把窗口外的设置页搬回浏览窗口并关掉副本', async () => {
  reset();
  state.windows = [{id: 5, focused: true, tabs: [{id: 1, url: 'https://example.com/'}]}];
  state.contexts = [optionsContext(21, 8), optionsContext(22, 9), optionsContext(23, 8)];
  const kept = await shared.settleOptionsPages();
  assert.equal(kept.id, 21);
  assert.deepEqual(state.moved, [[21, {windowId: 5, index: -1}]]);
  assert.deepEqual(state.removed.sort((a, b) => a - b), [22, 23]);
  assert.equal(state.created.length, 0);
  // 搬过来的设置页要激活并聚焦，否则用户只看到它凭空消失。
  assert.deepEqual(state.updated, [[21, {active: true}]]);
  assert.deepEqual(state.focused, [[5, {focused: true}]]);
});

test('settleOptionsPages 没有浏览窗口时保留一页并去掉重复', async () => {
  reset();
  state.contexts = [optionsContext(31, 1), optionsContext(32, 2)];
  const kept = await shared.settleOptionsPages();
  assert.equal(kept.id, 31);
  assert.deepEqual(state.removed, [32]);
  assert.equal(state.moved.length, 0);
  assert.equal(state.created.length, 0);
});

test('focusOptionsPage 没有设置页时在浏览窗口新建', async () => {
  reset();
  state.windows = [
    {id: 4, focused: false, tabs: [{id: 1, url: 'https://example.com/a'}]},
    {id: 5, focused: true, tabs: [{id: 2, url: 'https://example.com/b'}]},
  ];
  const created = await shared.focusOptionsPage('not-a-section');
  assert.equal(created.id, 900);
  assert.deepEqual(state.created, [{url: OPTIONS_URL, windowId: 5}]);
});

test('没有网页地址的普通窗口也会承接设置页，不会再开一扇', async () => {
  reset();
  state.windows = [{id: 8, focused: true, type: 'normal', tabs: [{id: 1, url: ''}]}];
  const created = await shared.focusOptionsPage();
  assert.equal(created.windowId, 8);
  assert.deepEqual(state.created, [{url: OPTIONS_URL, windowId: 8}]);
});

test('设置页在弹出窗口里时搬回普通窗口', async () => {
  reset();
  state.windows = [
    {id: 2, focused: true, type: 'popup', tabs: [{id: 1, url: 'https://example.com/'}]},
    {id: 6, focused: false, type: 'normal', tabs: [{id: 3, url: ''}]},
  ];
  state.contexts = [optionsContext(51, 2)];
  const kept = await shared.settleOptionsPages();
  assert.equal(kept.id, 51);
  assert.deepEqual(state.moved, [[51, {windowId: 6, index: -1}]]);
  assert.equal(state.created.length, 0);
});

test('搬不走窗口外的设置页时关掉它，打开时改在现有窗口新建', async () => {
  reset();
  state.failMove = true;
  state.windows = [{id: 5, focused: true, type: 'normal', tabs: [{id: 1, url: 'https://example.com/'}]}];
  state.contexts = [optionsContext(61, 8)];
  const created = await shared.focusOptionsPage();
  assert.deepEqual(state.removed, [61]);
  assert.equal(state.moved.length, 0);
  assert.deepEqual(state.created, [{url: OPTIONS_URL, windowId: 5}]);
  assert.equal(created.windowId, 5);
});

test('focusOptionsPage 已在浏览窗口时聚焦并带上分区', async () => {
  reset();
  state.windows = [{id: 5, focused: true, tabs: [{id: 1, url: 'https://example.com/'}]}];
  state.contexts = [optionsContext(41, 5), optionsContext(42, 9)];
  const kept = await shared.focusOptionsPage('service');
  assert.equal(kept.id, 41);
  assert.deepEqual(state.removed, [42]);
  assert.deepEqual(state.updated, [[41, {active: true, url: OPTIONS_URL + '#service'}]]);
  assert.deepEqual(state.focused, [[5, {focused: true}]]);
  assert.equal(state.created.length, 0);
});

test('侧栏切分区触发 settleOptionsPages 时不搬走正在用的设置页', async () => {
  reset();
  // 设置页所在窗口没有网页但还有别的页签；另一扇窗口有网页。改 hash 不应把它搬过去。
  state.windows = [
    {id: 3, focused: true, type: 'normal', tabs: [{id: 1, url: 'chrome://newtab/'}, {id: 71, url: OPTIONS_URL + '#service'}]},
    {id: 4, focused: false, type: 'normal', tabs: [{id: 2, url: 'https://example.com/'}]},
  ];
  state.contexts = [optionsContext(71, 3, '#service')];
  const kept = await shared.settleOptionsPages();
  assert.equal(kept.id, 71);
  assert.equal(state.moved.length, 0);
  assert.equal(state.removed.length, 0);
  assert.equal(state.updated.length, 0);
});

test('无痕窗口不作为设置页落脚处', async () => {
  reset();
  state.windows = [
    {id: 5, focused: true, type: 'normal', incognito: true, tabs: [{id: 1, url: 'https://example.com/private'}]},
    {id: 6, focused: false, type: 'normal', tabs: [{id: 2, url: 'https://example.com/'}, {id: 81, url: OPTIONS_URL}]},
  ];
  state.contexts = [optionsContext(81, 6)];
  const kept = await shared.focusOptionsPage();
  assert.equal(kept.id, 81);
  assert.equal(state.moved.length, 0);
  assert.equal(state.removed.length, 0);
  assert.equal(state.created.length, 0);
  assert.deepEqual(state.focused, [[6, {focused: true}]]);
});
