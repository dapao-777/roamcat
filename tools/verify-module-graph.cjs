#!/usr/bin/env node
/**
 * @file tools/verify-module-graph.cjs
 * 文件职责：模块图检查的独立命令行入口，无需 playwright 或浏览器，可在任何 Node 20+ 环境运行。
 * 主要内容：调用 tools/lib/module-graph.cjs 的 verifyModuleGraph，逐条打印规则结果与失败详情，
 *   失败时以退出码 1 结束；tools/audit-extension.cjs 在启动浏览器前也会调用同一函数。
 * 模块边界：只做参数解析、输出与退出码；所有规则实现位于 lib/module-graph.cjs。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
'use strict';

const {resolve} = require('node:path');
const {verifyModuleGraph} = require('./lib/module-graph.cjs');

// 未打包发布目录中扩展位于内层 roamcat-0.2.0/；可用首个参数指向其他根。
const root = resolve(__dirname, '..', process.argv[2] || 'roamcat-0.2.0');

verifyModuleGraph({root}).then(result => {
  const {failures, stats} = result;
  console.log(`模块图检查：${stats.files} 个源文件（ESM ${stats.esmFiles} 个）、${stats.edges} 条 import 边`);
  console.log(`连接器共享闭包：${stats.connectorClosure.join(', ') || '(空)'}`);
  console.log(`import 不安全（仅浏览器层，预期包含 background.js 与 ui/）：${stats.importUnsafe.join(', ') || '(无)'}`);
  if (!failures.length) {
    console.log('PASS 模块图与加载契约（R1 加载契约 · R2 解析 · R3 无环 · R4 连接器闭包 · R5 分层方向 · R6 无反向依赖 · R7 文件头注释 · R8 无重复 ID · R9 无内联脚本 · R10 资源完整 · R11 经典脚本语法）');
    return;
  }
  for (const failure of failures) console.error(`FAIL ${failure.rule}: ${failure.message}`);
  console.error(`模块图检查未通过：${failures.length} 处失败。规则与 SPEC.md 第 12 节对应。`);
  process.exitCode = 1;
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
