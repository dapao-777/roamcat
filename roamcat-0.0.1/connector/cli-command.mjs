/**
 * @file connector/cli-command.mjs
 * 文件职责：拼出「怎么启动一个本机 CLI」的 spawn 参数，运行时（codex.mjs）与安装器（install.mjs）共用。
 * 主要内容：cliCommand(cliPath, args, platform, comspec) → {command, args, options}。Windows 的 .cmd/.bat
 *   不能直接 spawn（EINVAL）；npm shim 解析固定 JS 入口并用本机 Node 启动，提示词与 JSON 不经 shell。
 *   普通批处理经 cmd.exe /d /s /c 且路径整体加引号；不用会拆开空格路径、在 Node 24 弃用的 shell:true。
 * 模块边界：只读取指定 CLI 的 shim 与入口存在性；普通批处理仅允许简单参数，不执行或猜测批处理内容。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const SIMPLE_ARG = /^[\w:./=@+-]+$/;

function npmEntry(cliPath) {
  try {
    const shim = readFileSync(cliPath, 'utf8');
    // npm/cmd-shim 的两种路径变量写法；只接受直接转发 %* 的唯一 JS 入口。
    const entries = [...shim.matchAll(/"(?:%~dp0[\\/]|%dp0%[\\/])([^"\r\n]+\.(?:cjs|mjs|js))"\s+%\*/gi)];
    const targets = new Set(entries.map(match => resolve(dirname(cliPath), match[1])));
    if (targets.size !== 1) return null;
    const target = [...targets][0];
    if (statSync(target).isFile()) return target;
  } catch { /* 非 npm shim 保留简单批处理启动方式。 */ }
  return null;
}

export function cliCommand(cliPath, args, platform = process.platform, comspec = process.env.ComSpec) {
  if (platform !== 'win32' || !/\.(cmd|bat)$/i.test(cliPath)) return { command: cliPath, args, options: {} };
  const entry = npmEntry(cliPath);
  if (entry) return {command: process.execPath, args: [entry, ...args], options: {}};
  const unsafe = args.find(arg => !SIMPLE_ARG.test(arg));
  if (unsafe !== undefined) throw new TypeError(`经 cmd.exe 启动 CLI 时参数只能是简单词：${unsafe}`);
  const shell = comspec || join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
  const line = [`"${cliPath}"`, ...args].join(' ');
  return { command: shell, args: ['/d', '/s', '/c', `"${line}"`], options: { windowsVerbatimArguments: true } };
}
