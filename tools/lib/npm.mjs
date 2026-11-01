/**
 * @file tools/lib/npm.mjs
 * 文件职责：门禁脚本调用 npm 的统一写法——Windows 上 npm 是 npm.cmd，不能直接 spawn，又不能用带参数的 shell: true
 *   （Node 24 每次都打印 DEP0190 弃用告警，参数也不会被转义）。
 * 主要内容：npmCommand(args) → {command, args, options}，交给 spawn / spawnSync 使用。优先让 node 直接跑 npm 的 JS 入口
 *   （npm run 启动时的 npm_execpath，或随 Node 安装的 node_modules/npm/bin/npm-cli.js），不经 cmd.exe，没有引号问题；
 *   都找不到时才在 PATH 里找 npm 的完整路径，Windows 的 .cmd 经连接器共用的 cliCommand（cmd.exe /d /s /c）执行。
 *   不能给 npm.cmd 传裸名字：带引号的裸名字会让批处理里的 %~dp0 解析成当前目录，找不到 node_modules\npm。
 * 模块边界：只拼命令，不执行；args 必须是简单词（npm 的子命令与脚本名）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import fs from 'node:fs';
import path from 'node:path';
import {cliCommand} from '../../roamcat-0.0.1/connector/cli-command.mjs';

function onPath(name) {
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function npmCommand(args) {
  const win = process.platform === 'win32';
  const nodeDir = path.dirname(process.execPath);
  const scripts = [
    process.env.npm_execpath,
    win ? path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js') : path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  const script = scripts.find(item => item && /npm-cli\.js$/i.test(item) && fs.existsSync(item));
  if (script) return {command: process.execPath, args: [script, ...args], options: {}};
  return cliCommand(onPath(win ? 'npm.cmd' : 'npm') || (win ? 'npm.cmd' : 'npm'), args);
}
