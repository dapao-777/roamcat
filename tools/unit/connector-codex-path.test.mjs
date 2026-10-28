/**
 * @file tools/unit/connector-codex-path.test.mjs
 * 文件职责：为 connector/host.mjs 的 resolveCodexPath 与 connector/codex.mjs 的 codexSpawnCommand 提供
 *   node:test 单元测试——Codex 桌面版更新后 CLI 换到新的 OpenAI/Codex/bin/<哈希>/ 目录，安装时记下的路径失效，
 *   连接器要自己找到新版本；npm 全局装的 codex.cmd 路径含空格时也要能拉起。
 * 主要内容：记录路径仍存在时原样返回；失效时在同一 bin 目录下挑最近更新的 codex.exe；
 *   不在 Codex 的 bin 目录结构里时不做猜测；.cmd 经 cmd.exe 执行且路径带引号（Windows 上真跑一次）。
 * 模块边界：只在系统临时目录里搭假的目录树，不读写真实的 Codex 安装。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {resolveCodexPath} from '../../roamcat-0.0.1/connector/host.mjs';
import {codexSpawnCommand} from '../../roamcat-0.0.1/connector/codex.mjs';

function codexTree() {
  const root = mkdtempSync(join(tmpdir(), 'roamcat-codex-path-'));
  const bin = join(root, 'OpenAI', 'Codex', 'bin');
  const build = (name, seconds) => {
    mkdirSync(join(bin, name), {recursive: true});
    const exe = join(bin, name, 'codex.exe');
    writeFileSync(exe, '');
    utimesSync(exe, seconds, seconds);
    return exe;
  };
  return {root, bin, build};
}

test('记录的 codex.exe 仍在时原样使用', async () => {
  const {root, build} = codexTree();
  const current = build('aaaa', 1000);
  build('bbbb', 2000);
  assert.equal(await resolveCodexPath(current), current);
  rmSync(root, {recursive: true, force: true});
});

test('Codex 更新换了哈希目录后，改用最近更新的那份 codex.exe', async () => {
  const {root, bin, build} = codexTree();
  mkdirSync(join(bin, 'gone'), {recursive: true});
  build('older', 1000);
  const newest = build('newest', 3000);
  assert.equal(await resolveCodexPath(join(bin, 'gone', 'codex.exe')), newest);
  rmSync(root, {recursive: true, force: true});
});

test('不在 Codex bin 目录结构里的失效路径不做猜测', async () => {
  const root = mkdtempSync(join(tmpdir(), 'roamcat-codex-path-'));
  mkdirSync(join(root, 'tools', 'other'), {recursive: true});
  writeFileSync(join(root, 'tools', 'other', 'codex.exe'), '');
  const missing = join(root, 'tools', 'gone', 'codex.exe');
  assert.equal(await resolveCodexPath(missing), missing);
  rmSync(root, {recursive: true, force: true});
});

test('codexSpawnCommand：exe 与非 Windows 直接执行，.cmd/.bat 经 cmd.exe 且路径带引号', () => {
  const args = ['app-server', '--stdio', '--strict-config'];
  assert.deepEqual(codexSpawnCommand('C:\\Codex\\codex.exe', 'win32', 'cmd.exe'), {command: 'C:\\Codex\\codex.exe', args, options: {}});
  assert.deepEqual(codexSpawnCommand('/usr/local/bin/codex.cmd', 'linux', 'cmd.exe'), {command: '/usr/local/bin/codex.cmd', args, options: {}});
  const spaced = 'C:\\Users\\Li Lei\\AppData\\Roaming\\npm\\codex.CMD';
  assert.deepEqual(codexSpawnCommand(spaced, 'win32', 'C:\\Windows\\System32\\cmd.exe'), {
    command: 'C:\\Windows\\System32\\cmd.exe',
    args: ['/d', '/s', '/c', `""${spaced}" app-server --stdio --strict-config"`],
    options: {windowsVerbatimArguments: true},
  });
});

test('路径含空格的 codex.cmd 能真的拉起并收到全部参数', {skip: process.platform !== 'win32' && '仅 Windows'}, () => {
  const root = mkdtempSync(join(tmpdir(), 'roamcat codex cmd '));
  const script = join(root, 'npm dir', 'codex.cmd');
  mkdirSync(join(root, 'npm dir'));
  writeFileSync(script, '@echo off\r\necho ARGS=%*\r\n');
  try {
    const {command, args, options} = codexSpawnCommand(script);
    const result = spawnSync(command, args, {...options, encoding: 'utf8', windowsHide: true});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'ARGS=app-server --stdio --strict-config');
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});
