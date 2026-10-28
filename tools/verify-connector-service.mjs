/**
 * @file tools/verify-connector-service.mjs
 * 文件职责：本机常驻连接服务的端到端门禁——浏览器（默认 ego lite）加载 dist/extension，确认扩展优先经 WebSocket 连本机服务，
 *   服务不可用时回退到浏览器连接器（NativeMessaging）。
 * 主要内容：先断言扩展内置的服务地址端口等于服务默认端口（47821）；再在 127.0.0.1 的空闲端口起一个带假后端的
 *   connector/service.mjs（不启动真实 CLI），测试副本里只把这一处地址改到该端口；设置页（受信任页面）发
 *   SUBSCRIPTION_STATUS，断言 transport=service 且拿到假后端的状态；关掉服务后再刷新，断言不再走 service
 *   （本机装了浏览器连接器时为 native，没装时报「未找到」）。报告写入 preview/connector-service.json。
 * 模块边界：用法 npm run build && node tools/verify-connector-service.mjs；不占 47821，已装的真实常驻服务照常运行。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startService, DEFAULT_SERVICE_PORT} from '../roamcat-0.0.1/connector/service.mjs';

const require = createRequire(import.meta.url);
const {launchExtension} = require('./lib/extension-browser.cjs');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSION_ID = require('../build/extension-key.json').id;

class FakeClient extends EventEmitter {
  async start() { this.emit('status', {connected: true, authenticated: true, plan: 'service-fake', email: null}); }
  async refreshStatus() { const status = {connected: true, authenticated: true, plan: 'service-fake', email: null}; this.emit('status', status); return status; }
  async close() {}
}

const report = {checks: [], failures: []};
const check = (name, ok, detail = '') => { report.checks.push({name, ok, detail}); if (!ok) report.failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

const freePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => { const {port} = server.address(); server.close(() => resolve(port)); });
});

const dir = mkdtempSync(join(tmpdir(), 'roamcat-service-e2e-'));
const configPath = join(dir, 'config.json');
writeFileSync(configPath, JSON.stringify({backend: 'antigravity', agyPath: join(dir, 'agy.exe'), dataDir: join(dir, 'data')}));
// 不和已装的真实常驻服务抢 47821：在空闲端口起假服务，测试副本里只改扩展连的这一处地址。
const dist = join(root, 'dist/extension');
const shipped = `ws://127.0.0.1:${DEFAULT_SERVICE_PORT}/`;
const subscription = readFileSync(join(dist, 'subscription.js'), 'utf8');
check('扩展内置的服务地址与服务默认端口一致', subscription.includes(shipped), shipped);
const port = await freePort();
const extensionDir = join(dir, 'extension');
cpSync(dist, extensionDir, {recursive: true});
writeFileSync(join(extensionDir, 'subscription.js'), subscription.replace(shipped, `ws://127.0.0.1:${port}/`));
let service = await startService({port, allowedOrigins: [`chrome-extension://${EXTENSION_ID}/`], backends: {antigravity: configPath}, clientFactory: () => new FakeClient()});
const run = await launchExtension({extensionDir});
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
