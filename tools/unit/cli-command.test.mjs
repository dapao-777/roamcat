/**
 * @file tools/unit/cli-command.test.mjs
 * 文件职责：为 connector/cli-command.mjs 的 cliCommand 与安装器 connector/install.mjs 的 cliVersion 提供 node:test 单元测试——
 *   Windows 上 npm 全局装的 CLI 是 .cmd shim，路径含空格（如 C:\Users\Li Lei\…）时，安装器查版本不能被 cmd 拆开。
 * 主要内容：exe 与非 Windows 直接执行；普通 .cmd/.bat 经 cmd.exe 且限制参数；npm shim 用 Node 保留完整参数；
 *   安装发现跳过 POSIX shim，优先 Windows 入口；
 *   Windows 上真跑一次：路径含空格的 codex.cmd 经安装器的 cliVersion 能收到版本号（旧写法 shell:true 在这里被 cmd 拆开，
 *   报「不是内部或外部命令」；对照不放进测试，免得测试输出里再出现 DEP0190 告警）。
 * 模块边界：只在系统临时目录里搭假的 .cmd；导入 install.mjs 不会触发安装（入口有 isMain 守卫）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {cliCommand} from '../../roamcat-0.0.1/connector/cli-command.mjs';
import {cliVersion, findExecutable} from '../../roamcat-0.0.1/connector/install.mjs';

test('cliCommand：exe 与非 Windows 直接执行，参数原样交给 spawn', () => {
  assert.deepEqual(cliCommand('C:\\Grok\\grok.exe', ['--version'], 'win32', 'cmd.exe'), {command: 'C:\\Grok\\grok.exe', args: ['--version'], options: {}});
  assert.deepEqual(cliCommand('/usr/local/bin/codex.cmd', ['--version'], 'linux', 'cmd.exe'), {command: '/usr/local/bin/codex.cmd', args: ['--version'], options: {}});
  assert.deepEqual(cliCommand('/opt/agy', ['models'], 'darwin'), {command: '/opt/agy', args: ['models'], options: {}});
});

test('cliCommand：.cmd/.bat 经 cmd.exe 且路径整体带引号，路径含空格也不被拆开', () => {
  const spaced = 'C:\\Users\\Li Lei\\AppData\\Roaming\\npm\\codex.cmd';
  assert.deepEqual(cliCommand(spaced, ['--version'], 'win32', 'C:\\Windows\\System32\\cmd.exe'), {
    command: 'C:\\Windows\\System32\\cmd.exe',
    args: ['/d', '/s', '/c', `""${spaced}" --version"`],
    options: {windowsVerbatimArguments: true},
  });
  assert.equal(cliCommand('C:\\tools\\agy.BAT', ['models', '--json'], 'win32', 'cmd.exe').args[3], '""C:\\tools\\agy.BAT" models --json"');
  assert.equal(cliCommand('C:\\tools\\x.cmd', [], 'win32', 'cmd.exe').args[3], '""C:\\tools\\x.cmd""', '没有参数时命令串末尾不留多余空格');
  assert.match(cliCommand(spaced, ['--version'], 'win32', '').command, /cmd\.exe$/i, '没有 ComSpec 时回退到 System32\\cmd.exe');
});

test('cliCommand：经 cmd.exe 时参数里的空格、引号、shell 元字符一律拒绝（命令串里不做转义）', () => {
  for (const unsafe of ['two words', '"quoted"', '&calc', 'a|b', '%PATH%', 'x>y', '^', '']) {
    assert.throws(() => cliCommand('C:\\tools\\x.cmd', [unsafe], 'win32', 'cmd.exe'), /参数只能是简单词/u, JSON.stringify(unsafe));
  }
  assert.doesNotThrow(() => cliCommand('C:\\tools\\x.exe', ['two words'], 'win32', 'cmd.exe'), '不经 cmd.exe 时参数由 spawn 自己传递，不受限制');
  for (const safe of ['--version', 'run', 'build:release', '--stdio', '--strict-config', '--key=value', 'a/b.js']) {
    assert.doesNotThrow(() => cliCommand('C:\\tools\\x.cmd', [safe], 'win32', 'cmd.exe'), safe);
  }
});

test('安装器 cliVersion：路径含空格的 codex.cmd 能真的拉起并收到版本号', {skip: process.platform !== 'win32' && '仅 Windows'}, () => {
  const root = mkdtempSync(join(tmpdir(), 'roamcat li lei '));
  const script = join(root, 'npm dir', 'codex.cmd');
  mkdirSync(join(root, 'npm dir'));
  writeFileSync(script, '@echo off\r\necho codex-cli 1.2.3\r\n');
  try {
    const result = cliVersion(script);
    assert.equal(result.status, 0, result.stderr);
    // 安装器据此判断是不是官方 Codex CLI：/^codex-cli \d+\.\d+\.\d+/m
    assert.match(result.stdout, /^codex-cli \d+\.\d+\.\d+/m);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('Windows 发现 npm CLI 时选 .cmd；没有 Windows 入口时跳过 POSIX shim', {skip: process.platform !== 'win32' && '仅 Windows'}, async () => {
  const root = mkdtempSync(join(tmpdir(), 'roamcat-discover-'));
  try {
    const base = join(root, 'roamcat-fixture-cli');
    writeFileSync(base, '#!/bin/sh\nexit 1\n');
    writeFileSync(`${base}.cmd`, '@echo fixture\r\n');
    assert.equal(await findExecutable('roamcat-fixture-cli', null, [root]), `${base}.cmd`);
    assert.equal(await findExecutable('roamcat-fixture-cli', base), `${base}.cmd`);
    rmSync(`${base}.cmd`);
    assert.equal(await findExecutable('roamcat-fixture-cli', null, [root]), '');
  } finally { rmSync(root, {recursive: true, force: true}); }
});

test('npm shim 的 JSON、换行、空值与 shell 字符直接传给 Node，参数完整且不执行内容', {skip: process.platform !== 'win32' && '仅 Windows'}, () => {
  const root = mkdtempSync(join(tmpdir(), 'roamcat npm args '));
  const entry = join(root, 'cli.cjs');
  const script = join(root, 'fixture.cmd');
  const payload = ['--json-schema', JSON.stringify({description: 'a "quoted" value', enum: ['中文', '%PATH%', '& | > ^ !']}), '-p', 'line one\nline two\r\n%PATH% & echo injected', '', 'C:\\a b\\'];
  writeFileSync(entry, 'console.log(JSON.stringify(process.argv.slice(2)));');
  try {
    for (const prefix of ['%~dp0\\', '%dp0%\\']) {
      writeFileSync(script, `@echo off\r\nnode "${prefix}cli.cjs" %*\r\n`);
      const {command, args, options} = cliCommand(script, payload);
      assert.equal(command, process.execPath);
      const result = spawnSync(command, args, {...options, encoding: 'utf8', windowsHide: true});
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), payload);
    }
  } finally { rmSync(root, {recursive: true, force: true}); }
});
