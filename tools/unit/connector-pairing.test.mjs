/**
 * @file tools/unit/connector-pairing.test.mjs
 * 文件职责：为常驻服务配对令牌（connector/pairing.mjs）及其在浏览器连接器侧的下发提供 node:test 单元测试。
 * 主要内容：令牌生成 / 落盘（POSIX 上 0600）/ 读取与无效文件的拒绝；Sec-WebSocket-Protocol 解析与常量时间比对；
 *   host.mjs 的 pairingToken 请求交出令牌且不拉起 CLI、旧配置没登记令牌文件时报错；常驻服务的
 *   dispatchRequest 不处理 pairingToken；扩展侧 subscription.js 镜像的协议名与连接器一致。
 * 模块边界：只在临时目录读写文件，用 PassThrough 模拟浏览器的 stdio，不启动真实 CLI、不改动注册表或浏览器配置。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtempSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  PAIRING_PROTOCOL, PAIRING_TOKEN_PREFIX, createPairingToken, offeredProtocols, pairingTokenMatches,
  readPairingToken, validPairingToken, writePairingToken,
} from '../../roamcat-0.0.1/connector/pairing.mjs';
import {NativeMessageDecoder, dispatchRequest, encodeNativeMessage, runHost} from '../../roamcat-0.0.1/connector/host.mjs';
import {SERVICE_PROTOCOL, SERVICE_TOKEN_PREFIX} from '../../roamcat-0.0.1/extension/subscription.js';

const ORIGIN = `chrome-extension://${'a'.repeat(32)}/`;

function tempDir() { return mkdtempSync(join(tmpdir(), 'roamcat-pairing-test-')); }

test('令牌是 64 位十六进制随机串，写入后可读回；重装覆盖时换成新令牌', async () => {
  const dir = tempDir();
  try {
    const file = join(dir, 'pairing-token');
    const first = await writePairingToken(file);
    assert.equal(validPairingToken(first), true);
    assert.equal(await readPairingToken(file), first);
    if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
    const second = await writePairingToken(file);
    assert.notEqual(second, first);
    assert.equal(await readPairingToken(file), second);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('读取令牌：没登记路径、文件不存在或内容无效都报“请重新运行安装命令”', async () => {
  const dir = tempDir();
  try {
    await assert.rejects(readPairingToken(undefined), /重新运行安装命令/);
    await assert.rejects(readPairingToken(join(dir, 'missing')), /重新运行安装命令/);
    writeFileSync(join(dir, 'bad'), 'not-a-token\n');
    await assert.rejects(readPairingToken(join(dir, 'bad')), /配对令牌无效/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('握手子协议解析与令牌比对', () => {
  const token = createPairingToken();
  assert.deepEqual(offeredProtocols(` ${PAIRING_PROTOCOL} ,${PAIRING_TOKEN_PREFIX}${token},`), [PAIRING_PROTOCOL, PAIRING_TOKEN_PREFIX + token]);
  assert.deepEqual(offeredProtocols(undefined), []);
  assert.equal(pairingTokenMatches(token, [PAIRING_PROTOCOL, PAIRING_TOKEN_PREFIX + token]), true);
  assert.equal(pairingTokenMatches(token, [PAIRING_PROTOCOL, PAIRING_TOKEN_PREFIX + createPairingToken()]), false);
  assert.equal(pairingTokenMatches(token, [PAIRING_PROTOCOL, PAIRING_TOKEN_PREFIX + token + '0']), false);
  assert.equal(pairingTokenMatches(token, [PAIRING_PROTOCOL]), false);
  assert.equal(pairingTokenMatches('', [PAIRING_TOKEN_PREFIX]), false, '服务端令牌无效时一律不放行');
});

test('扩展镜像的子协议名与连接器一致', () => {
  assert.equal(SERVICE_PROTOCOL, PAIRING_PROTOCOL);
  assert.equal(SERVICE_TOKEN_PREFIX, PAIRING_TOKEN_PREFIX);
});

test('常驻服务的请求分发不处理 pairingToken（令牌不经 WebSocket 下发）', async () => {
  await assert.rejects(dispatchRequest({client: {}, diagnostics: {}, request: {id: 1, type: 'pairingToken', payload: {}}}), /不支持的连接器请求/);
});

class FakeClient extends EventEmitter {
  constructor() { super(); this.starts = 0; }
  async start() { this.starts++; this.emit('status', {connected: true, authenticated: true}); }
  async refreshStatus() { return {connected: true, authenticated: true}; }
  async close() {}
}

// 以 PassThrough 充当浏览器给宿主的 stdin / stdout，按 id 等响应。
async function withHost(config, run) {
  const dir = tempDir();
  const configPath = join(dir, 'config.json');
  writeFileSync(configPath, JSON.stringify({backend: 'antigravity', agyPath: join(dir, 'agy.exe'), dataDir: join(dir, 'data'), extensionOrigin: ORIGIN, ...config(dir)}));
  const input = new PassThrough(), output = new PassThrough(), client = new FakeClient();
  const received = [], waiters = [];
  const decoder = new NativeMessageDecoder({onMessage: message => { received.push(message); for (const waiter of waiters.splice(0)) waiter(); }, onError: () => {}});
  output.on('data', chunk => decoder.push(chunk));
  const response = id => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${id}`)), 2000);
    const look = () => { const found = received.find(message => message.id === id); if (found) { clearTimeout(timer); resolve(found); } else waiters.push(look); };
    look();
  });
  const exitCode = process.exitCode;
  try {
    await runHost({argv: ['--config', configPath, ORIGIN], input, output, clientFactory: () => client});
    await run({send: message => input.write(encodeNativeMessage(message)), response, client, dir});
  } finally {
    input.end();
    await new Promise(done => setTimeout(done, 50));
    process.exitCode = exitCode;
    rmSync(dir, {recursive: true, force: true});
  }
}

test('浏览器连接器交出配对令牌且不拉起 CLI；之后的业务请求才启动 CLI', async () => {
  let token;
  await withHost(dir => ({serviceTokenFile: join(dir, 'pairing-token')}), async ({send, response, client, dir}) => {
    token = await writePairingToken(join(dir, 'pairing-token'));
    send({id: 'pairing', type: 'pairingToken', payload: {}});
    assert.deepEqual(await response('pairing'), {id: 'pairing', ok: true, data: {token}});
    assert.equal(client.starts, 0, '取令牌不启动 CLI');
    send({id: 1, type: 'status', payload: {}});
    assert.equal((await response(1)).ok, true);
    assert.equal(client.starts, 1);
  });
});

test('旧配置没登记令牌文件时 pairingToken 报错，扩展据此按旧握手直连', async () => {
  await withHost(() => ({}), async ({send, response, client}) => {
    send({id: 'pairing', type: 'pairingToken', payload: {}});
    const reply = await response('pairing');
    assert.equal(reply.ok, false);
    assert.match(reply.error, /重新运行安装命令/);
    assert.equal(client.starts, 0);
  });
});
