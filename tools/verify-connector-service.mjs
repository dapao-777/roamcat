/**
 * @file tools/verify-connector-service.mjs
 * 文件职责：本机常驻连接服务的端到端门禁——Edge 加载 dist/extension，确认扩展优先经 WebSocket 连本机服务，
 *   服务不可用时回退到浏览器连接器（NativeMessaging）。
 * 主要内容：在 127.0.0.1:47821 起一个带假后端的 connector/service.mjs（不启动真实 CLI）；设置页（受信任页面）发
 *   SUBSCRIPTION_STATUS，断言 transport=service 且拿到假后端的状态；关掉服务后再刷新，断言不再走 service
 *   （本机装了浏览器连接器时为 native，没装时报「未找到」）。报告写入 preview/connector-service.json。
 * 模块边界：用法 npm run build && node tools/verify-connector-service.mjs；47821 被占用（例如已装真实服务）时直接报错退出。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {mkdtempSync, rmSync, writeFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startService, DEFAULT_SERVICE_PORT} from '../roamcat-0.0.1/connector/service.mjs';

const require = createRequire(import.meta.url);
const {launchExtension} = require('./lib/edge-extension.cjs');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSION_ID = require('../build/extension-key.json').id;

class FakeClient extends EventEmitter {
  async start() { this.emit('status', {connected: true, authenticated: true, plan: 'service-fake', email: null}); }
  async refreshStatus() { const status = {connected: true, authenticated: true, plan: 'service-fake', email: null}; this.emit('status', status); return status; }
  async close() {}
}

const report = {checks: [], failures: []};
const check = (name, ok, detail = '') => { report.checks.push({name, ok, detail}); if (!ok) report.failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

const dir = mkdtempSync(join(tmpdir(), 'roamcat-service-e2e-'));
const configPath = join(dir, 'config.json');
writeFileSync(configPath, JSON.stringify({backend: 'antigravity', agyPath: join(dir, 'agy.exe'), dataDir: join(dir, 'data')}));
let service;
try {
  service = await startService({port: DEFAULT_SERVICE_PORT, allowedOrigins: [`chrome-extension://${EXTENSION_ID}/`], backends: {antigravity: configPath}, clientFactory: () => new FakeClient()});
} catch (error) {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${DEFAULT_SERVICE_PORT} 已被占用（可能已装了真实的常驻服务），先停掉再跑此门禁。` : error);
  process.exit(1);
}
const run = await launchExtension({extensionDir: join(root, 'dist/extension')});
try {
  const status = () => run.extPage.evaluate(() => chrome.runtime.sendMessage({type: 'SUBSCRIPTION_STATUS', kind: 'antigravity'}));
  const viaService = await status();
  check('扩展经本机常驻服务连上', viaService?.ok === true && viaService.data?.transport === 'service', JSON.stringify(viaService?.data ?? viaService).slice(0, 200));
  check('拿到服务端后端的状态', viaService?.data?.plan === 'service-fake' && viaService.data.authenticated === true);
  await service.close();
  service = null;
  await run.extPage.waitForTimeout(500);
  const fallback = await status();
  const transport = fallback?.data?.transport;
  check('服务停掉后回退到浏览器连接器', transport !== 'service' && (transport === 'native' || typeof fallback?.data?.error === 'string'), JSON.stringify(fallback?.data ?? fallback).slice(0, 200));
} finally {
  await run.close();
  await service?.close();
  rmSync(dir, {recursive: true, force: true});
  mkdirSync(join(root, 'preview'), {recursive: true});
  writeFileSync(join(root, 'preview/connector-service.json'), JSON.stringify(report, null, 2));
}
console.log(`\n${report.checks.length - report.failures.length} 项通过，${report.failures.length} 项失败。`);
process.exitCode = report.failures.length ? 1 : 0;
