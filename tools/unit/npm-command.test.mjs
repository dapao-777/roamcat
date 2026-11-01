/**
 * @file tools/unit/npm-command.test.mjs
 * 文件职责：为 tools/lib/npm.mjs 的 npmCommand 提供 node:test 单元测试——门禁脚本调用 npm 不能用带参数的 shell: true
 *   （Node 24 的 DEP0190 告警），Windows 上也不能直接 spawn npm.cmd。
 * 主要内容：不论是否经 npm 启动（有无 npm_execpath），npmCommand 给出的命令都能真的跑出 npm 版本号；
 *   由 node 直接执行 npm 的 JS 入口，不经 cmd.exe。
 * 模块边界：只跑 `npm --version`，不装包、不联网。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {npmCommand} from '../lib/npm.mjs';

const runNpm = args => {
  const {command, args: list, options} = npmCommand(args);
  return {invocation: {command, args: list}, result: spawnSync(command, list, {encoding: 'utf8', windowsHide: true, timeout: 60_000, ...options})};
};

test('npmCommand：沿用当前环境（经 npm test 启动时带 npm_execpath），由 node 直接跑 npm 的 JS 入口', () => {
  const {invocation, result} = runNpm(['--version']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+/);
  assert.equal(invocation.command, process.execPath, '不经 cmd.exe，也不是 npm.cmd');
  assert.match(invocation.args[0], /npm-cli\.js$/i);
});

test('npmCommand：直接用 node 启动（没有 npm_execpath）时仍能找到随 Node 安装的 npm', () => {
  const saved = process.env.npm_execpath;
  delete process.env.npm_execpath;
  try {
    const {result} = runNpm(['--version']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+/);
  } finally {
    if (saved !== undefined) process.env.npm_execpath = saved;
  }
});
