/**
 * @file tools/verify-connector-service.mjs
 * 文件职责：本机常驻连接服务的端到端门禁——无头 ego lite 加载 dist/extension 的测试副本，确认扩展优先经 WebSocket 连本机服务，
 *   服务不可用时回退到浏览器连接器（NativeMessaging）。
 * 主要内容：先断言扩展内置的服务地址端口等于服务默认端口（47821）；再在 127.0.0.1 的空闲端口起一个带假后端、
 *   要求配对令牌的 connector/service.mjs（不启动真实 CLI），测试副本里只把这一处地址改到该端口、把连不上后的
 *   重试窗口从 60 秒缩短；设置页（受信任页面）往 chrome.storage.session 预置令牌缓存（不依赖本机装没装浏览器连接器），
 *   发 SUBSCRIPTION_STATUS：缺令牌、错令牌都不走 service 且清掉缓存；正确令牌时 transport=service 且拿到假后端的状态；
 *   关掉服务后再刷新，断言不再走 service。测试副本还把浏览器连接器的宿主名换成不存在的名字，回退时立刻报「未找到」，
 *   不拉起本机真实安装的连接器（结果与耗时不受本机安装状态影响）。
 *   报告写入 preview/connector-service.json。
 * 模块边界：用法 npm run build && node tools/verify-connector-service.mjs；不占 47821，已装的真实常驻服务照常运行；
 *   浏览器用临时配置，与日常 ego 互不影响。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {EventEmitter} from 'node:events';
import {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startService, DEFAULT_SERVICE_PORT} from '../roamcat-0.0.1/connector/service.mjs';
import {createPairingToken} from '../roamcat-0.0.1/connector/pairing.mjs';
import {SERVICE_PAIRING_KEY} from '../roamcat-0.0.1/extension/subscription.js';
import {EXT_ID as EXTENSION_ID, assertFreshDist, extUrl, openBrowser} from './lib/ego.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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
assertFreshDist();
const dist = join(root, 'dist/extension');
const shipped = `ws://127.0.0.1:${DEFAULT_SERVICE_PORT}/`;
const subscription = readFileSync(join(dist, 'subscription.js'), 'utf8');
check('扩展内置的服务地址与服务默认端口一致', subscription.includes(shipped), shipped);
// 每次被拒都会进 60 秒重试窗口（期间直接走浏览器连接器）；测试副本缩短它，才能在一次运行里连试几种令牌。
const RETRY_MS = 600;
const retryWindow = 'const SERVICE_RETRY_MS = 60000;';
check('测试副本能缩短重试窗口', subscription.includes(retryWindow), retryWindow);
// 回退分支只验证「不走 service、改走浏览器连接器」：测试副本把浏览器连接器的宿主名换成不存在的名字，
// connectNative 立刻报「未找到」。否则会拉起本机真实安装的连接器，它在测试里不应答，每次回退白等 45 秒超时，还会留下进程。
const nativeHost = "host:'com.roamcat.antigravity'";
check('测试副本能替换浏览器连接器宿主名', subscription.includes(nativeHost), nativeHost);
const port = await freePort();
const extensionDir = join(dir, 'extension');
cpSync(dist, extensionDir, {recursive: true});
writeFileSync(join(extensionDir, 'subscription.js'), subscription.replace(shipped, `ws://127.0.0.1:${port}/`).replace(retryWindow, `const SERVICE_RETRY_MS = ${RETRY_MS};`).replace(nativeHost, "host:'com.roamcat.antigravity_gate_absent'"));
const pairingToken = createPairingToken();
let service = await startService({port, allowedOrigins: [`chrome-extension://${EXTENSION_ID}/`], backends: {antigravity: configPath}, pairingToken, clientFactory: () => new FakeClient()});
const run = await openBrowser({extension: extensionDir});
const extPage = await run.newPage();
try {
  await extPage.goto(extUrl('ui/options.html'));
  const status = () => extPage.evaluate(() => chrome.runtime.sendMessage({type: 'SUBSCRIPTION_STATUS', kind: 'antigravity'}));
  // 预置扩展的令牌缓存：'' 表示浏览器连接器给不了令牌（旧版连接器 / 没装服务）。
  const seed = value => extPage.evaluate(([key, token]) => chrome.storage.session.set({[key]: token}), [SERVICE_PAIRING_KEY, value]);
  const cached = () => extPage.evaluate(key => chrome.storage.session.get(key).then(stored => stored[key]), SERVICE_PAIRING_KEY);
  // 回退成立：没有走 service，且错误来自浏览器连接器的「未找到」（测试副本里宿主不存在），而不是超时等别的原因。
  const notService = result => result?.data?.transport !== 'service' && /未找到或未授权本地|No authorized local/.test(result?.data?.error || '');
  const describe = result => JSON.stringify(result?.data ?? result).slice(0, 200);

  await seed('');
  const missing = await status();
  check('缺配对令牌时服务拒绝，扩展回退到浏览器连接器', notService(missing), describe(missing));
  check('被拒后清掉令牌缓存', await cached() === undefined);
  await extPage.waitForTimeout(RETRY_MS + 200);
  await seed(createPairingToken());
  const wrong = await status();
  check('配对令牌错误时服务拒绝，扩展回退到浏览器连接器', notService(wrong), describe(wrong));
  check('错误令牌被清掉，下次重新向浏览器连接器要', await cached() === undefined);
  await extPage.waitForTimeout(RETRY_MS + 200);
  await seed(pairingToken);
  const viaService = await status();
  check('扩展带着配对令牌经本机常驻服务连上', viaService?.ok === true && viaService.data?.transport === 'service', describe(viaService));
  check('拿到服务端后端的状态', viaService?.data?.plan === 'service-fake' && viaService.data.authenticated === true);
  check('连上后保留令牌缓存', await cached() === pairingToken);
  await service.close();
  service = null;
  await extPage.waitForTimeout(500);
  const fallback = await status();
  check('服务停掉后回退到浏览器连接器', notService(fallback), describe(fallback));
} finally {
  await run.close();
  await service?.close();
  rmSync(dir, {recursive: true, force: true});
  mkdirSync(join(root, 'preview'), {recursive: true});
  writeFileSync(join(root, 'preview/connector-service.json'), JSON.stringify(report, null, 2));
}
console.log(`\n${report.checks.length - report.failures.length} 项通过，${report.failures.length} 项失败。`);
process.exitCode = report.failures.length ? 1 : 0;
