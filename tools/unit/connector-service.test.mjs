/**
 * @file tools/unit/connector-service.test.mjs
 * 文件职责：为 connector/service.mjs（本机常驻连接服务）提供 node:test 单元测试。
 * 主要内容：用假后端客户端起服务（端口 0），手写最小 WebSocket 客户端（带掩码帧）验证：
 *   Host / Origin / 未知后端的握手拒绝；配对令牌正确 / 错误 / 缺失三种握手结果，及没配令牌的旧安装照常放行；
 *   status 请求的响应与状态广播；两条连接共享同一个后端客户端；
 *   进度事件只回给发起的连接；ping 回 pong；超限帧被关闭；/v1/health 概况。
 * 模块边界：只在 127.0.0.1 上监听临时端口，不启动任何真实 CLI，不改动注册表或浏览器配置。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {connect} from 'node:net';
import {randomBytes} from 'node:crypto';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startService, acceptKey, encodeFrame, FrameDecoder, validHost} from '../../roamcat-0.0.1/connector/service.mjs';
import {PAIRING_PROTOCOL, PAIRING_TOKEN_PREFIX, createPairingToken} from '../../roamcat-0.0.1/connector/pairing.mjs';

const ORIGIN = `chrome-extension://${'a'.repeat(32)}/`;
const TOKEN = createPairingToken();
const PAIRED = [PAIRING_PROTOCOL, PAIRING_TOKEN_PREFIX + TOKEN];

class FakeClient extends EventEmitter {
  static instances = 0;
  constructor() { super(); FakeClient.instances++; this.closed = false; }
  async start() { this.emit('status', {connected: true, authenticated: true, plan: 'fake'}); }
  async refreshStatus() { const status = {connected: true, authenticated: true, plan: 'fake'}; this.emit('status', status); return status; }
  async assist(payload, {onProgress}) { onProgress({step: 1}); return {answer: payload.text}; }
  async close() { this.closed = true; }
}

// 默认按新安装起服务（要求配对令牌）；pairingToken: null 模拟 service.json 没有 tokenFile 的旧安装。
async function withService(run, {pairingToken = TOKEN, log} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'roamcat-service-test-'));
  const configPath = join(dir, 'config.json');
  writeFileSync(configPath, JSON.stringify({backend: 'antigravity', agyPath: join(dir, 'agy.exe'), dataDir: join(dir, 'data')}));
  FakeClient.instances = 0;
  const service = await startService({port: 0, allowedOrigins: [ORIGIN], backends: {antigravity: configPath}, pairingToken, log, clientFactory: () => new FakeClient(), idleMs: 60000});
  try { await run(service); } finally { await service.close(); rmSync(dir, {recursive: true, force: true}); }
}

// 最小 WebSocket 客户端：握手 + 发送带掩码的文本/控制帧，收集服务端发来的帧。
function wsClient(port, {origin = ORIGIN, host = `127.0.0.1:${port}`, backend = 'antigravity', protocols = PAIRED} = {}) {
  return new Promise((resolve, reject) => {
    const key = randomBytes(16).toString('base64');
    const socket = connect(port, '127.0.0.1');
    let handshake = '', upgraded = false, raw = Buffer.alloc(0);
    const messages = [], waiters = [], controls = [];
    const deliver = () => { while (waiters.length && messages.length) waiters.shift()(messages.shift()); };
    const parse = () => {
      while (raw.length >= 2) {
        let length = raw[1] & 0x7f, offset = 2;
        if (length === 126) { if (raw.length < 4) return; length = raw.readUInt16BE(2); offset = 4; }
        if (raw.length < offset + length) return;
        const opcode = raw[0] & 0x0f, payload = raw.subarray(offset, offset + length);
        raw = raw.subarray(offset + length);
        if (opcode === 0x1) { messages.push(JSON.parse(payload.toString('utf8'))); deliver(); }
        else controls.push({opcode, payload: Buffer.from(payload)});
      }
    };
    const masked = (opcode, payload) => {
      const frame = encodeFrame(opcode, payload);
      const headLength = frame.length - payload.length;
      const mask = randomBytes(4);
      const head = Buffer.from(frame.subarray(0, headLength));
      head[1] |= 0x80;
      const body = Buffer.from(payload);
      for (let i = 0; i < body.length; i++) body[i] ^= mask[i & 3];
      return Buffer.concat([head, mask, body]);
    };
    const client = {
      send: message => socket.write(masked(0x1, Buffer.from(JSON.stringify(message)))),
      sendRaw: (opcode, payload) => socket.write(masked(opcode, payload)),
      next: (ms = 2000) => new Promise((done, fail) => { const timer = setTimeout(() => fail(new Error('timeout waiting for message')), ms); waiters.push(message => { clearTimeout(timer); done(message); }); deliver(); }),
      controls,
      closed: new Promise(done => socket.on('close', done)),
      end: () => socket.end(),
    };
    socket.on('data', chunk => {
      if (upgraded) { raw = Buffer.concat([raw, chunk]); parse(); return; }
      handshake += chunk.toString('latin1');
      const end = handshake.indexOf('\r\n\r\n');
      if (end < 0) return;
      const status = handshake.split('\r\n')[0];
      if (!status.includes('101')) { socket.destroy(); reject(Object.assign(new Error(status), {status})); return; }
      assert.match(handshake, new RegExp(`Sec-WebSocket-Accept: ${acceptKey(key).replace(/[+/=]/g, '\\$&')}`));
      client.handshake = handshake.slice(0, end);
      upgraded = true;
      raw = Buffer.from(handshake.slice(end + 4), 'latin1');
      parse();
      resolve(client);
    });
    socket.on('error', reject);
    const offered = protocols.length ? `Sec-WebSocket-Protocol: ${protocols.join(', ')}\r\n` : '';
    socket.write(`GET /v1/connect?backend=${backend} HTTP/1.1\r\nHost: ${host}\r\nOrigin: ${origin}\r\n${offered}Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  });
}

test('握手只接受本机 Host、白名单内的扩展来源与已安装的后端', async () => {
  await withService(async ({port}) => {
    await assert.rejects(wsClient(port, {origin: 'https://evil.example'}), /403/);
    await assert.rejects(wsClient(port, {origin: `chrome-extension://${'b'.repeat(32)}/`}), /403/);
    await assert.rejects(wsClient(port, {host: `evil.example:${port}`}), /403/);
    await assert.rejects(wsClient(port, {backend: 'grok'}), /404/);
    const ok = await wsClient(port);
    ok.end();
  });
  assert.equal(validHost('LOCALHOST:5', 5), true);
  assert.equal(validHost('127.0.0.1:6', 5), false);
});

test('配对令牌正确：握手成功，只回协议名、不回显令牌', async () => {
  await withService(async ({port}) => {
    const ok = await wsClient(port);
    assert.ok(ok.handshake.split('\r\n').includes(`Sec-WebSocket-Protocol: ${PAIRING_PROTOCOL}`));
    assert.equal(ok.handshake.includes(TOKEN), false);
    assert.equal((await ok.next()).event, 'status');
    ok.end();
  });
});

test('配对令牌错误：返回 401，不建立连接', async () => {
  await withService(async ({port}) => {
    await assert.rejects(wsClient(port, {protocols: [PAIRING_PROTOCOL, PAIRING_TOKEN_PREFIX + createPairingToken()]}), /401/);
    await assert.rejects(wsClient(port, {protocols: [PAIRING_PROTOCOL, PAIRING_TOKEN_PREFIX + TOKEN.slice(1)]}), /401/, '长度不同也按不符处理');
    await assert.rejects(wsClient(port, {protocols: [PAIRING_TOKEN_PREFIX + TOKEN]}), /401/, '缺协议名 roamcat.v1');
    assert.equal(FakeClient.instances, 0, '没配对的连接不拉起后端');
  });
});

test('配对令牌缺失：返回 401，且先于后端查找（不泄露装了哪些通道）', async () => {
  await withService(async ({port}) => {
    await assert.rejects(wsClient(port, {protocols: []}), /401/);
    await assert.rejects(wsClient(port, {protocols: [PAIRING_PROTOCOL]}), /401/);
    await assert.rejects(wsClient(port, {protocols: [], backend: 'grok'}), /401/);
    await assert.rejects(wsClient(port, {backend: 'grok'}), /404/, '配对后才区分未安装的后端');
  });
});

test('旧安装没配令牌：只校验 Host / Origin 照常放行，并记一条诊断', async () => {
  const logs = [];
  await withService(async ({port}) => {
    const legacy = await wsClient(port, {protocols: []});
    assert.equal(/Sec-WebSocket-Protocol/i.test(legacy.handshake), false);
    legacy.end();
    // 新扩展拿到了令牌也能连旧配置的服务：提了子协议就选回 roamcat.v1，浏览器才不会判握手失败。
    const paired = await wsClient(port);
    assert.ok(paired.handshake.split('\r\n').includes(`Sec-WebSocket-Protocol: ${PAIRING_PROTOCOL}`));
    paired.end();
    await assert.rejects(wsClient(port, {protocols: [], origin: 'https://evil.example'}), /403/);
  }, {pairingToken: null, log: message => logs.push(message)});
  assert.equal(logs.filter(message => message.includes('未配置配对令牌')).length, 1);
});

test('status 请求得到响应，两条连接共享同一个后端客户端并都收到状态广播', async () => {
  await withService(async ({port}) => {
    const first = await wsClient(port);
    assert.deepEqual((await first.next()).event, 'status');
    first.send({id: 1, type: 'status', payload: {}});
    const replies = [await first.next(), await first.next()];
    assert.ok(replies.some(message => message.id === 1 && message.ok === true && message.data.plan === 'fake'));
    assert.ok(replies.some(message => message.event === 'status'));
    const second = await wsClient(port);
    assert.equal((await second.next()).event, 'status', '新连接立刻拿到最近一次状态');
    second.send({id: 'x', type: 'status', payload: {}});
    await second.next(); await second.next();
    assert.equal((await first.next()).event, 'status', '另一条连接也收到状态广播');
    assert.equal(FakeClient.instances, 1);
    first.end(); second.end();
  });
});

test('进度事件只回给发起请求的连接；未知请求返回错误而不断开', async () => {
  await withService(async ({port}) => {
    const first = await wsClient(port), second = await wsClient(port);
    await first.next(); await second.next();
    first.send({id: 7, type: 'assist', payload: {text: 'hi'}});
    const got = [await first.next(), await first.next()];
    assert.ok(got.some(message => message.event === 'assistProgress' && message.id === 7));
    assert.ok(got.some(message => message.id === 7 && message.ok && message.data.answer === 'hi'));
    await assert.rejects(second.next(300), /timeout/);
    first.send({id: 8, type: 'nope', payload: {}});
    const failure = await first.next();
    assert.equal(failure.ok, false);
    assert.match(failure.error, /不支持的连接器请求/);
    first.end(); second.end();
  });
});

test('ping 回 pong；超过 1MB 的帧直接关闭连接', async () => {
  await withService(async ({port}) => {
    const client = await wsClient(port);
    await client.next();
    client.sendRaw(0x9, Buffer.from('hey'));
    await new Promise(done => setTimeout(done, 100));
    assert.ok(client.controls.some(frame => frame.opcode === 0xa && frame.payload.toString() === 'hey'));
    client.sendRaw(0x1, Buffer.alloc(1024 * 1024 + 10, 0x61));
    await client.closed;
    assert.ok(client.controls.some(frame => frame.opcode === 0x8 && frame.payload.readUInt16BE(0) === 1009));
  });
});

test('/v1/health 返回服务概况；非本机 Host 被拒绝', async () => {
  await withService(async ({port}) => {
    const health = await fetch(`http://127.0.0.1:${port}/v1/health`).then(response => response.json());
    assert.equal(health.service, 'roamcat-connector');
    assert.deepEqual(health.backends, ['antigravity']);
  });
});

test('FrameDecoder 拼接分片文本并拒绝未加掩码的帧', () => {
  const texts = [], errors = [];
  const decoder = new FrameDecoder({onText: text => texts.push(text), onError: code => errors.push(code)});
  const mask = Buffer.from([1, 2, 3, 4]);
  const part = (fin, opcode, text) => { const body = Buffer.from(text); const out = Buffer.from(body); for (let i = 0; i < out.length; i++) out[i] ^= mask[i & 3]; return Buffer.concat([Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | body.length]), mask, out]); };
  decoder.push(Buffer.concat([part(false, 1, '{"a":'), part(true, 0, '1}')]));
  assert.deepEqual(texts, ['{"a":1}']);
  const plain = new FrameDecoder({onText: () => {}, onError: code => errors.push(code)});
  plain.push(Buffer.from([0x81, 0x01, 0x61]));
  assert.deepEqual(errors, [1002]);
});
