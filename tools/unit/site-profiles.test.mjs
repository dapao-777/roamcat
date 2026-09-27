/**
 * @file tools/unit/site-profiles.test.mjs
 * 文件职责：site-profiles.js 站点档案的单元测试——在 node:vm 中按 classic script
 *   方式求值（与 manifest 加载形态一致），断言 hostname/generator 匹配契约与
 *   selectors() 返回形状。
 * 主要内容：精确/后缀/generator 命中、大小写与尾点归一、形似域名的拒绝
 *   （evil-github.com、github.com.evil.com、docs.github.com）、未知站点回退、
 *   GENERIC_SKIP 前置合并、返回数组为全新副本、档案字段完整性。
 * 模块边界：node:test + node:vm，不启动浏览器；只读 extension/site-profiles.js。
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
const source = readFileSync(path.join(repoRoot, 'roamcat-0.0.1', 'extension', 'site-profiles.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const sites = sandbox.RoamCatSites;

const matchCases = [
  ['github.com', undefined, 'github'],
  ['gist.github.com', undefined, 'github'],
  ['docs.github.com', undefined, null],
  ['evil-github.com', undefined, null],
  ['github.com.evil.com', undefined, null],
  ['GitHub.com.', undefined, 'github'],
  ['www.reddit.com', undefined, 'reddit'],
  ['old.reddit.com', undefined, 'reddit'],
  ['news.ycombinator.com', undefined, 'hackernews'],
  ['unix.stackexchange.com', undefined, 'stackexchange'],
  ['meta.stackoverflow.com', undefined, 'stackexchange'],
  ['ja.stackoverflow.com', undefined, 'stackexchange'],
  ['superuser.com', undefined, 'stackexchange'],
  ['discuss.python.org', 'Discourse 3.5.0 - https://github.com/discourse/discourse', 'discourse'],
  ['discuss.python.org', undefined, null],
  ['dev.to', undefined, 'forem'],
  ['lobste.rs', undefined, 'lobsters'],
  ['example.com', undefined, null]
];

test('match() 按 hostname/generator 命中或拒绝', () => {
  assert.ok(sites, 'globalThis.RoamCatSites 必须存在');
  for (const [hostname, generator, expected] of matchCases) {
    const profile = sites.match({hostname, generator});
    assert.equal(profile?.id ?? null, expected, `hostname=${hostname} generator=${generator}`);
  }
});

test('selectors() 未知站点回退为空档案 + GENERIC_SKIP', () => {
  const result = sites.selectors({hostname: 'example.com'});
  assert.equal(result.id, null);
  assert.deepEqual(Array.from(result.root), []);
  assert.deepEqual(Array.from(result.chrome), []);
  assert.deepEqual(Array.from(result.skip), Array.from(sites.GENERIC_SKIP));
});

test('selectors() github 命中时 skip 以 GENERIC_SKIP 开头且数组合并', () => {
  const result = sites.selectors({hostname: 'github.com'});
  assert.equal(result.id, 'github');
  const generic = Array.from(sites.GENERIC_SKIP);
  assert.deepEqual(Array.from(result.skip).slice(0, generic.length), generic);
  assert.ok(result.skip.length > generic.length, 'github 应有站点级 skip');
});

test('selectors() 每次返回全新数组，互不影响', () => {
  const first = sites.selectors({hostname: 'github.com'});
  first.skip.push('x'); first.root.push('x'); first.chrome.push('x');
  const second = sites.selectors({hostname: 'github.com'});
  assert.ok(!Array.from(second.skip).includes('x'));
  assert.ok(!Array.from(second.root).includes('x'));
  assert.ok(!Array.from(second.chrome).includes('x'));
});

test('档案字段完整性：id 唯一、skip 非空、选择器为非空串且无尾逗号', () => {
  const ids = new Set();
  for (const profile of sites.PROFILES) {
    assert.ok(profile.id && !ids.has(profile.id), `id 缺失或重复：${profile.id}`);
    ids.add(profile.id);
    assert.ok(profile.skip?.length > 0, `${profile.id} 必须有 skip`);
    for (const list of ['skip', 'chrome', 'root']) {
      for (const sel of profile[list] || []) {
        assert.equal(typeof sel, 'string', `${profile.id}.${list} 非字符串`);
        assert.ok(sel.trim().length > 0, `${profile.id}.${list} 空选择器`);
        assert.ok(!/,\s*$/.test(sel), `${profile.id}.${list} 尾逗号：${sel}`);
      }
    }
  }
});
