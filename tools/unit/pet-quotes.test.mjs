/**
 * @file tools/unit/pet-quotes.test.mjs
 * 文件职责：pet-quotes.js 伴读猫哲学语录库的单元测试——在 node:vm 中按 classic
 *   script 方式求值（与 manifest/动态注册的真实加载形态一致），断言语录数据契约
 *   与 next() 洗牌取句的不重复保证。
 * 主要内容：list 规模与 {zh,en,author} 字段完整性、zh 唯一性、长度上限（zh ≤34 /
 *   en ≤90，气泡可承载）；next() 从空状态可用、整轮覆盖全集、连续调用不重复、
 *   跨轮交接不重复，以及损坏 state 的自愈。
 * 模块边界：node:test + node:vm，不启动浏览器；只读 extension/pet-quotes.js。
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
const source = readFileSync(path.join(repoRoot, 'roamcat-0.2.0', 'extension', 'pet-quotes.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const quotes = sandbox.RoamCatPetQuotes;

test('pet-quotes.js 暴露 RoamCatPetQuotes 且语录规模与字段达标', () => {
  assert.ok(quotes, 'globalThis.RoamCatPetQuotes 必须存在');
  assert.ok(Array.isArray(quotes.list), 'list 必须是数组');
  assert.ok(quotes.list.length >= 60, `语录至少 60 条，当前 ${quotes.list.length}`);
  for (const [index, entry] of quotes.list.entries()) {
    assert.equal(typeof entry?.zh, 'string', `#${index} 缺 zh`);
    assert.equal(typeof entry?.en, 'string', `#${index} 缺 en`);
    assert.equal(typeof entry?.author, 'string', `#${index} 缺 author`);
    assert.ok(entry.zh.trim().length > 0, `#${index} zh 为空`);
    assert.ok(entry.en.trim().length > 0, `#${index} en 为空`);
    assert.ok(entry.author.trim().length > 0, `#${index} author 为空`);
    assert.ok(entry.zh.length <= 34, `#${index} zh 超长（${entry.zh.length}）：${entry.zh}`);
    assert.ok(entry.en.length <= 90, `#${index} en 超长（${entry.en.length}）：${entry.en}`);
  }
  const zhSet = new Set(quotes.list.map(entry => entry.zh));
  assert.equal(zhSet.size, quotes.list.length, 'zh 语录不得重复');
});

test('next({}) 从空状态可用并返回合法排列', () => {
  const result = quotes.next({});
  assert.ok(result.quote?.zh, '必须返回一条语录');
  assert.equal(result.order.length, quotes.list.length);
  assert.equal(result.cursor, 1);
  // vm 沙箱里的数组与宿主数组原型不同，统一转宿主数组再 deepEqual。
  assert.deepEqual(Array.from(result.order).sort((a, b) => a - b), Array.from({length: quotes.list.length}, (_e, i) => i));
  // 缺省/空 state 同样视为全新一轮。
  for (const state of [undefined, null, {}, {order: [], cursor: 0}, {order: 'bad', cursor: -5}]) {
    const fresh = quotes.next(state);
    assert.ok(fresh.quote?.zh, `state=${JSON.stringify(state)} 应返回语录`);
    assert.equal(fresh.order.length, quotes.list.length);
    assert.equal(fresh.cursor, 1);
  }
});

test('next() 三轮内整轮覆盖全集且连续两次调用（含跨轮）不重复', () => {
  let state = {};
  let previous = null;
  for (let cycle = 0; cycle < 3; cycle++) {
    const seen = new Set();
    for (let i = 0; i < quotes.list.length; i++) {
      state = quotes.next(state);
      assert.notEqual(state.quote.zh, previous, '连续两句不得相同');
      seen.add(state.quote.zh);
      previous = state.quote.zh;
    }
    assert.equal(seen.size, quotes.list.length, `第 ${cycle + 1} 轮必须覆盖全部语录`);
  }
  assert.equal(state.cursor, quotes.list.length, '整轮结束后 cursor 应到达末尾');
});
