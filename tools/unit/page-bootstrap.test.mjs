/**
 * @file tools/unit/page-bootstrap.test.mjs
 * 文件职责：网页轻量引导 page-bootstrap.js 的单元测试——防重复加载按「旧引导是否还活着」判断。
 * 主要内容：node:vm 中按 classic script 求值（桩出 chrome.runtime），断言：全新页面注册监听并留下可查询存活的标记；
 *   扩展重载或更新后留下的旧标记（存活检查为假、或旧版的布尔 true）不再挡住新引导；旧引导仍活着时不重复注册；
 *   运行时失效后标记报告不再存活；阅读引擎未加载时 SS_STATUS 由引导应答「未开启」。
 * 模块边界：node:test + node:vm，不启动浏览器；真实浏览器里的按需注入由 verify:performance 覆盖。
 *   无头 ego 里重载扩展后扩展起不来，扩展更新场景只能在这里按标记状态模拟。
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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = readFileSync(path.join(repoRoot, 'roamcat-0.0.1', 'extension', 'page-bootstrap.js'), 'utf8');

// previous：页面隔离世界里已有的 __ROAMCAT_BOOTSTRAP__（undefined 表示全新页面）。
function loadBootstrap(previous) {
  const listeners = [];
  const runtime = {id: 'ext', onMessage: {addListener: fn => listeners.push(fn)}, sendMessage: async () => ({ok: true})};
  const sandbox = {chrome: {runtime}, __ROAMCAT_BOOTSTRAP__: previous};
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return {sandbox, runtime, listeners};
}

test('全新页面：注册消息监听，标记可查询存活', () => {
  const {sandbox, listeners} = loadBootstrap(undefined);
  assert.equal(listeners.length, 1);
  assert.equal(sandbox.__ROAMCAT_BOOTSTRAP__.alive(), true);
});

test('扩展重载或更新后的旧标记不挡住新引导', () => {
  for (const stale of [{alive: () => false}, true, {}]) {
    const {sandbox, listeners} = loadBootstrap(stale);
    assert.equal(listeners.length, 1, `旧标记 ${JSON.stringify(stale)} 时应重新接管`);
    assert.notEqual(sandbox.__ROAMCAT_BOOTSTRAP__, stale);
    assert.equal(sandbox.__ROAMCAT_BOOTSTRAP__.alive(), true);
  }
});

test('旧引导仍活着时不重复注册', () => {
  const alive = {alive: () => true};
  const {sandbox, listeners} = loadBootstrap(alive);
  assert.equal(listeners.length, 0);
  assert.equal(sandbox.__ROAMCAT_BOOTSTRAP__, alive);
});

test('运行时失效后标记报告不再存活', () => {
  const {sandbox, runtime} = loadBootstrap(undefined);
  delete runtime.id;
  assert.equal(sandbox.__ROAMCAT_BOOTSTRAP__.alive(), false);
});

test('阅读引擎未加载时由引导应答 SS_STATUS「未开启」', () => {
  const {listeners} = loadBootstrap(undefined);
  let reply;
  const async = listeners[0]({type: 'SS_STATUS'}, {id: 'ext'}, value => { reply = value; });
  assert.equal(async, false);
  assert.equal(reply.ok, true);
  assert.equal(reply.data.enabled, false);
  // 别的扩展发来的消息一律不理。
  let foreign;
  listeners[0]({type: 'SS_STATUS'}, {id: 'other'}, value => { foreign = value; });
  assert.equal(foreign, undefined);
});
