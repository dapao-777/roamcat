/**
 * @file tools/verify-connector-service.mjs
 * 文件职责：本机常驻连接服务的端到端门禁——无头 ego lite 加载 dist/extension 的测试副本，确认扩展先认服务、再发数据：
 *   真服务证明了身份才经 WebSocket 连上，冒牌服务一条数据也收不到，服务不可用时回退到浏览器连接器（NativeMessaging）。
 * 主要内容：先断言扩展内置的服务地址端口等于服务默认端口（47821）；测试副本里只把这一处地址改到一个空闲端口、把连不上后的
 *   重试窗口从 60 秒缩短，并把浏览器连接器的宿主名换成不存在的名字（回退时立刻报「未找到」，不拉起本机真实安装的连接器）。
 *   设置页（受信任页面）往 chrome.storage.session 预置令牌缓存（不依赖本机装没装浏览器连接器），发 SUBSCRIPTION_STATUS：
 *   1. 先在该端口起冒牌服务（接受 roamcat.v2 握手却拿不出令牌证明）：不回证明、回伪造证明两种，断言扩展回退、
 *      冒牌服务收不到任何一帧数据、握手只带协议名与随机数且令牌不出现在收到的任何字节里、清掉令牌缓存、写入 SERVICE_AUTH 诊断；
 *   2. 关掉冒牌服务，在同一端口起带假后端的真 connector/service.mjs（不启动真实 CLI）：拿不到令牌时不连服务、
 *      错令牌核对失败回退且不拉起后端；正确令牌时 transport=service 且拿到假后端的状态；关掉服务后再刷新，断言不再走 service。
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
import {createServer as createHttpServer} from 'node:http';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startService, DEFAULT_SERVICE_PORT, FrameDecoder, acceptKey, encodeFrame} from '../roamcat-0.0.1/connector/service.mjs';
import {PAIRING_PROTOCOL, createPairingNonce, createPairingToken} from '../roamcat-0.0.1/connector/pairing.mjs';
import {SERVICE_PAIRING_KEY} from '../roamcat-0.0.1/extension/subscription.js';
import {EXT_ID as EXTENSION_ID, assertFreshDist, extUrl, openBrowser} from './lib/ego.mjs';
import {printGateSummary} from './lib/gate-report.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let clientsCreated = 0;
class FakeClient extends EventEmitter {
  constructor() { super(); clientsCreated++; }
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

// 冒牌服务：抢先占住扩展要连的端口，照样接受 roamcat.v2 握手（选回协议名），但没有令牌、拿不出证明。
// mode=silent 连上不说话；mode=forged 发一个随机证明的 hello。记下握手头、收到的全部原始字节与解出的文本帧。
async function startImpostor(port) {
  const state = {mode: 'silent', handshakes: [], texts: [], raw: Buffer.alloc(0)};
  const sockets = new Set();
  const server = createHttpServer((request, response) => response.writeHead(404).end());
  server.on('upgrade', (request, socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    state.handshakes.push({url: request.url, protocols: request.headers['sec-websocket-protocol'] || '', raw: request.rawHeaders.join('\n')});
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey(request.headers['sec-websocket-key'])}\r\nSec-WebSocket-Protocol: ${PAIRING_PROTOCOL}\r\n\r\n`);
    const decoder = new FrameDecoder({onText: text => state.texts.push(text), onError: () => {}});
    socket.on('data', chunk => { state.raw = Buffer.concat([state.raw, chunk]); decoder.push(chunk); });
    if (state.mode === 'forged') {
      socket.write(encodeFrame(0x1, Buffer.from(JSON.stringify({event: 'hello', data: {protocol: PAIRING_PROTOCOL, nonce: createPairingNonce(), proof: createPairingToken()}}))));
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  return {
    state,
    close: () => new Promise(done => { for (const socket of sockets) socket.destroy(); server.close(() => done()); }),
  };
}

const dir = mkdtempSync(join(tmpdir(), 'roamcat-service-e2e-'));
const configPath = join(dir, 'config.json');
writeFileSync(configPath, JSON.stringify({backend: 'antigravity', agyPath: join(dir, 'agy.exe'), dataDir: join(dir, 'data')}));
// 不和已装的真实常驻服务抢 47821：在空闲端口起冒牌 / 假服务，测试副本里只改扩展连的这一处地址。
assertFreshDist();
const dist = join(root, 'dist/extension');
const shipped = `ws://127.0.0.1:${DEFAULT_SERVICE_PORT}/`;
const subscription = readFileSync(join(dist, 'subscription.js'), 'utf8');
check('扩展内置的服务地址与服务默认端口一致', subscription.includes(shipped), shipped);
// 每次回退都会进 60 秒重试窗口（期间直接走浏览器连接器）；测试副本缩短它，才能在一次运行里连试几种情形。
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
const startRealService = () => startService({port, allowedOrigins: [`chrome-extension://${EXTENSION_ID}/`], backends: {antigravity: configPath}, pairingToken, clientFactory: () => new FakeClient()});
let impostor = await startImpostor(port);
let service = null;
const run = await openBrowser({extension: extensionDir});
const extPage = await run.newPage();
try {
  await extPage.goto(extUrl('ui/options.html'));
  const status = () => extPage.evaluate(() => chrome.runtime.sendMessage({type: 'SUBSCRIPTION_STATUS', kind: 'antigravity'}));
  const seed = value => extPage.evaluate(([key, token]) => chrome.storage.session.set({[key]: token}), [SERVICE_PAIRING_KEY, value]);
  const unseed = () => extPage.evaluate(key => chrome.storage.session.remove(key), SERVICE_PAIRING_KEY);
  const cached = () => extPage.evaluate(key => chrome.storage.session.get(key).then(stored => stored[key]), SERVICE_PAIRING_KEY);
  // 扩展把核对失败写进诊断（chrome.storage.local 的 diagnostics），按状态轮询到至少 count 条 SERVICE_AUTH。
  const authDiagnostics = count => extPage.waitForFunction(async min => {
    const events = (await chrome.storage.local.get('diagnostics')).diagnostics?.events || [];
    const hits = events.filter(event => event.code === 'SERVICE_AUTH');
    return hits.length >= min ? hits : null;
  }, count, {timeout: 5000}).catch(() => []);
  // 回退成立：没有走 service，且错误来自浏览器连接器的「未找到」（测试副本里宿主不存在），而不是超时等别的原因。
  const notService = result => result?.data?.transport !== 'service' && /未找到或未授权本地|No authorized local/.test(result?.data?.error || '');
  const describe = result => JSON.stringify(result?.data ?? result).slice(0, 200);
  const handshakeClean = handshakes => handshakes.length > 0 && handshakes.every(item => new RegExp(`^${PAIRING_PROTOCOL.replace('.', '\\.')}, ?roamcat\\.nonce\\.[0-9a-f]{32}$`).test(item.protocols) && !item.raw.includes(pairingToken) && !item.url.includes(pairingToken));

  // 1. 冒牌服务占着端口：扩展有正确的令牌，冒牌服务拿不出证明。
  await seed(pairingToken);
  const silent = await status();
  check('冒牌服务不回证明：扩展回退到浏览器连接器', notService(silent), describe(silent));
  check('冒牌服务收不到任何数据（没有请求，也没有认证）', impostor.state.handshakes.length >= 1 && impostor.state.texts.length === 0, `握手 ${impostor.state.handshakes.length} 次，收到 ${impostor.state.texts.length} 帧`);
  check('握手只带协议名与扩展随机数，令牌不出现在握手与收到的任何字节里', handshakeClean(impostor.state.handshakes) && !impostor.state.raw.includes(pairingToken), impostor.state.handshakes.map(item => item.protocols).join(' | '));
  check('核对失败后清掉令牌缓存', await cached() === undefined);
  const firstDiagnostics = await authDiagnostics(1);
  check('核对失败写入 SERVICE_AUTH 诊断', firstDiagnostics.length >= 1 && firstDiagnostics.every(event => event.provider === 'antigravity' && event.operation === 'CONNECTION' && event.status === 'error'), JSON.stringify(firstDiagnostics[0] || null));
  await extPage.waitForTimeout(RETRY_MS + 200);
  impostor.state.mode = 'forged';
  const before = impostor.state.handshakes.length;
  await seed(pairingToken);
  const forged = await status();
  check('冒牌服务回伪造证明：扩展同样回退', notService(forged) && impostor.state.handshakes.length > before, describe(forged));
  check('伪造证明时冒牌服务同样收不到任何数据', impostor.state.texts.length === 0 && !impostor.state.raw.includes(pairingToken), `收到 ${impostor.state.texts.length} 帧`);
  check('伪造证明也清掉令牌缓存并写入诊断', await cached() === undefined && (await authDiagnostics(firstDiagnostics.length + 1)).length > firstDiagnostics.length);
  await impostor.close();
  impostor = null;

  // 2. 真服务（假后端）起在同一端口。
  service = await startRealService();
  await extPage.waitForTimeout(RETRY_MS + 200);
  await unseed();
  const missing = await status();
  check('拿不到配对令牌（浏览器连接器给不了）时不连服务，直接走浏览器连接器', notService(missing), describe(missing));
  check('没有令牌时服务端不拉起后端', clientsCreated === 0, `后端客户端 ${clientsCreated} 个`);
  await extPage.waitForTimeout(RETRY_MS + 200);
  const authBefore = (await authDiagnostics(0)).length;
  await seed(createPairingToken());
  const wrong = await status();
  check('令牌不对（例如重装后缓存过期）：服务证明核对不过，扩展回退到浏览器连接器', notService(wrong), describe(wrong));
  check('错误令牌被清掉，下次重新向浏览器连接器要', await cached() === undefined);
  check('错误令牌同样写入诊断，服务端没拉起后端', (await authDiagnostics(authBefore + 1)).length > authBefore && clientsCreated === 0, `后端客户端 ${clientsCreated} 个`);
  await extPage.waitForTimeout(RETRY_MS + 200);
  await seed(pairingToken);
  const viaService = await status();
  check('双向认证通过后经本机常驻服务连上', viaService?.ok === true && viaService.data?.transport === 'service', describe(viaService));
  check('拿到服务端后端的状态', viaService?.data?.plan === 'service-fake' && viaService.data.authenticated === true);
  check('连上后保留令牌缓存', await cached() === pairingToken);
  await service.close();
  service = null;
  await extPage.waitForTimeout(500);
  const fallback = await status();
  check('服务停掉后回退到浏览器连接器', notService(fallback), describe(fallback));
} finally {
  await run.close();
  await impostor?.close();
  await service?.close();
  rmSync(dir, {recursive: true, force: true});
  mkdirSync(join(root, 'preview'), {recursive: true});
  writeFileSync(join(root, 'preview/connector-service.json'), JSON.stringify(report, null, 2));
}
console.log(`\n${report.checks.length - report.failures.length} 项通过，${report.failures.length} 项失败。`);
process.exitCode = report.failures.length ? 1 : 0;
printGateSummary('service', report.checks.length - report.failures.length, report.failures.length);
