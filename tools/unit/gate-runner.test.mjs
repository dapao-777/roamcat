/**
 * @file 门禁命令行参数回归：拼写错误、无效并发与空选择应失败，避免零项运行被误认为通过。
 * 模块边界：以 Node 子进程运行真实入口，只传不会选择实际门禁的参数；不启动浏览器、不构建。
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const runner = fileURLToPath(new URL('../run-gates.mjs', import.meta.url));
const rejected = (args, message) => {
  const result = spawnSync(process.execPath, [runner, ...args], {encoding: 'utf8', timeout: 10000});
  assert.ifError(result.error);
  assert.equal(result.status, 1, `${args.join(' ')} 应失败\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, message);
  assert.ok(!result.stdout.includes('合计'), '参数错误不应写出通过汇总');
};

test('门禁名称拼错或列表留空时失败', () => {
  rejected(['--only=does-not-exist'], /未知门禁/u);
  rejected(['--only=does-not-exist', '--skip=also-missing'], /未知门禁/u);
  rejected(['--only='], /非空门禁名称/u);
  rejected(['--only=unit,'], /非空门禁名称/u);
});

test('未知参数不会静默忽略', () => {
  rejected(['--quik', '--only=does-not-exist'], /未知参数/u);
});

test('并发数必须为有限正整数', () => {
  // --quick + --only=release 不会选中实际门禁，即使参数校验回归也不会启动浏览器。
  for (const value of ['0', '-1', '1.5', 'abc', 'Infinity', '']) rejected(['--quick', '--only=release', '--jobs=' + value], /正整数/u);
});

test('过滤后没有任何门禁时失败', () => {
  rejected(['--quick', '--only=release'], /没有可运行的门禁/u);
  rejected(['--only=unit', '--skip=unit'], /没有可运行的门禁/u);
});
