/**
 * @file connector/cli-command.mjs
 * 文件职责：拼出「怎么启动一个本机 CLI」的 spawn 参数，运行时（codex.mjs）与安装器（install.mjs）共用。
 * 主要内容：cliCommand(cliPath, args, platform, comspec) → {command, args, options}。Windows 上 npm 全局的 .cmd/.bat shim
 *   不能直接 spawn（EINVAL），要经 cmd.exe /d /s /c 执行。不用 shell: true：那样 Node 不给命令加引号，路径含空格
 *   （如 C:\Users\Li Lei\…）时 cmd 会把它拆开，而且带参数的 shell: true 在 Node 24 会触发 DEP0190 弃用告警。
 * 模块边界：连接器层纯函数，只依赖 node:path；参数必须是简单词（在 cmd 命令串里原样拼接，不做转义）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { join } from 'node:path';

const SIMPLE_ARG = /^[\w:./=@+-]+$/;

export function cliCommand(cliPath, args, platform = process.platform, comspec = process.env.ComSpec) {
  if (platform !== 'win32' || !/\.(cmd|bat)$/i.test(cliPath)) return { command: cliPath, args, options: {} };
  const unsafe = args.find(arg => !SIMPLE_ARG.test(arg));
  if (unsafe !== undefined) throw new TypeError(`经 cmd.exe 启动 CLI 时参数只能是简单词：${unsafe}`);
  const shell = comspec || join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
  const line = [`"${cliPath}"`, ...args].join(' ');
  return { command: shell, args: ['/d', '/s', '/c', `"${line}"`], options: { windowsVerbatimArguments: true } };
}
