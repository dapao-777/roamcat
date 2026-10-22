/**
 * @file tools/unit/connector-install.test.mjs
 * 文件职责：为 connector/install.mjs 的“一次注册全部通道”逻辑提供 node:test 单元测试——
 *   默认不再要求 --backend，而是逐个查找 Codex / Grok / agy，找不到的通道跳过并汇总。
 * 主要内容：空 PATH + 临时 HOME/LOCALAPPDATA 下，默认模式三个通道全部跳过并以“没有可注册的
 *   订阅通道”失败；显式 --backend 时找不到 CLI 直接报该通道的错误；--help 说明默认行为。
 * 模块边界：以子进程运行安装器；只走“找不到 CLI”的路径，在写任何注册表、注册文件或
 *   连接器目录之前即退出，不改动本机浏览器配置。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync, existsSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const installer = join(dirname(fileURLToPath(import.meta.url)), '../../roamcat-0.0.1/connector/install.mjs');
const EXTENSION_ID = 'a'.repeat(32);

function runIsolated(args) {
  const home = mkdtempSync(join(tmpdir(), 'roamcat-install-test-'));
  const env = {
    PATH: '', HOME: home, USERPROFILE: home, LOCALAPPDATA: join(home, 'local'), APPDATA: join(home, 'roaming'),
    XDG_CONFIG_HOME: join(home, 'config'), XDG_DATA_HOME: join(home, 'data'), SystemRoot: process.env.SystemRoot || '',
  };
  try {
    const result = spawnSync(process.execPath, [installer, ...args], {env, encoding: 'utf8', timeout: 30000});
    return {...result, wroteFiles: existsSync(home) ? readdirSync(home) : []};
  } finally {
    rmSync(home, {recursive: true, force: true});
  }
}

test('默认模式逐个查找三个通道，全部找不到时汇总跳过原因并失败', () => {
  const result = runIsolated(['--extension-id', EXTENSION_ID]);
  assert.equal(result.status, 1);
  for (const label of ['ChatGPT 订阅（Codex）', 'Grok 订阅（Grok CLI）', 'Google 订阅（agy）']) {
    assert.match(result.stdout, new RegExp(`${label}：跳过`));
  }
  assert.match(result.stderr, /没有可注册的订阅通道/);
  assert.deepEqual(result.wroteFiles, [], '找不到 CLI 时不应创建任何连接器目录');
});

test('显式 --backend 找不到 CLI 时直接报该通道的错误，不再汇总', () => {
  const result = runIsolated(['--extension-id', EXTENSION_ID, '--backend', 'grok']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /未找到官方 Grok CLI/);
  assert.doesNotMatch(result.stdout, /跳过/);
});

test('--help 说明默认一次注册全部通道', () => {
  const result = spawnSync(process.execPath, [installer, '--help'], {encoding: 'utf8'});
  assert.equal(result.status, 0);
  assert.match(result.stdout, /默认一次注册本机已安装的全部订阅通道/);
});
