/**
 * @file tools/unit/connector-frame.test.mjs
 * 文件职责：为 connector/host.mjs 的原生消息帧协议提供 node:test 单元测试——这是扩展与
 *   本机连接器之间的 wire protocol（4 字节长度前缀 + UTF-8 JSON），此前只有连接器行为脚本
 *   间接覆盖，帧编解码、分片、错误路径与来源校验均无自动化断言。
 * 主要内容：encodeNativeMessage/decode 往返、长度前缀端序、跨 chunk 分片与一 chunk 多帧、
 *   零长/超长/非法 JSON/非对象 JSON/残留缓冲的失败路径、encode 的边界拒绝，
 *   以及 validateExtensionOrigin 的白名单与 chrome-extension://<32 位 a–p> 形态校验。
 * 模块边界：只 import 被测模块；不启动真实 CLI 进程、不触碰网络与文件系统；
 *   运行方式为在仓库根执行 node:test 自动发现本目录全部 .test.mjs。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_NATIVE_MESSAGE_BYTES,
  NativeMessageDecoder,
  encodeNativeMessage,
  validateExtensionOrigin,
} from '../../roamcat-0.2.0/connector/host.mjs';

const VALID_ORIGIN = `chrome-extension://${'a'.repeat(32)}`;

function createDecoder(maxBytes = MAX_NATIVE_MESSAGE_BYTES) {
  const received = [];
  const errors = [];
  const decoder = new NativeMessageDecoder({
    maxBytes,
    onMessage: message => received.push(message),
    onError: error => errors.push(error),
  });
  return {decoder, received, errors};
}

test('帧往返：编码后解码得到等价对象', () => {
  const message = {id: 7, type: 'supportBatch', payload: {items: [{id: 'one'}]}, traceId: 'abc'};
  const frame = encodeNativeMessage(message);
  assert.ok(Buffer.isBuffer(frame));
  assert.equal(frame.readUInt32LE(0), frame.length - 4);
  assert.deepEqual(JSON.parse(frame.subarray(4).toString('utf8')), message);

  const {decoder, received, errors} = createDecoder();
  decoder.push(frame);
  assert.equal(errors.length, 0);
  assert.deepEqual(received, [message]);
});

test('解码器处理跨 chunk 分片与一个 chunk 内的多帧', () => {
  const first = encodeNativeMessage({id: 1, type: 'status'});
  const second = encodeNativeMessage({id: 2, type: 'models'});
  const {decoder, received} = createDecoder();
  decoder.push(first.subarray(0, 2));
  assert.equal(received.length, 0, '不完整帧不应提前派发');
  decoder.push(first.subarray(2));
  assert.deepEqual(received.map(message => message.id), [1]);
  decoder.push(Buffer.concat([second, encodeNativeMessage({id: 3})]));
  assert.deepEqual(received.map(message => message.id), [1, 2, 3]);
});

test('解码器拒绝零长度与超长帧', () => {
  const zero = createDecoder();
  zero.decoder.push(Buffer.from([0, 0, 0, 0]));
  assert.equal(zero.errors.length, 1);
  assert.match(zero.errors[0].message, /长度无效/u);
  assert.equal(zero.decoder.failed, true);

  const oversize = createDecoder(16);
  const frame = Buffer.alloc(20);
  frame.writeUInt32LE(100, 0);
  oversize.decoder.push(frame);
  assert.equal(oversize.errors.length, 1);
  assert.match(oversize.errors[0].message, /长度无效/u);
  assert.equal(oversize.decoder.failed, true);
});

test('解码器拒绝非法 JSON 并进入终态', () => {
  const invalid = createDecoder();
  const body = Buffer.from('not json', 'utf8');
  const frame = Buffer.concat([(() => { const head = Buffer.alloc(4); head.writeUInt32LE(body.length, 0); return head; })(), body]);
  invalid.decoder.push(frame);
  assert.equal(invalid.errors.length, 1);
  assert.match(invalid.errors[0].message, /JSON 无效/u);
  assert.equal(invalid.decoder.failed, true);
  // 终态后继续推送不再派发、不再报错。
  invalid.decoder.push(encodeNativeMessage({id: 9}));
  assert.equal(invalid.received.length, 0);
  assert.equal(invalid.errors.length, 1);
});

test('解码器拒绝非对象 JSON（数组、字符串、null）', () => {
  for (const raw of ['[1,2]', '"text"', 'null', '42']) {
    const {decoder, received, errors} = createDecoder();
    const body = Buffer.from(raw, 'utf8');
    const head = Buffer.alloc(4);
    head.writeUInt32LE(body.length, 0);
    decoder.push(Buffer.concat([head, body]));
    assert.equal(received.length, 0, raw + ' 不应派发');
    assert.match(errors[0].message, /格式无效/u);
    assert.equal(decoder.failed, true);
  }
});

test('解码器在残留不完整缓冲上调用 end 时报错', () => {
  const {decoder, errors} = createDecoder();
  // 长度前缀用小端序写入：声明 5 字节但只跟到 2 字节，push 期间应静默等待。
  const head = Buffer.alloc(4);
  head.writeUInt32LE(5, 0);
  decoder.push(Buffer.concat([head, Buffer.from([65, 66])]));
  assert.equal(errors.length, 0);
  decoder.end();
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /不完整/u);

  const clean = createDecoder();
  clean.decoder.push(encodeNativeMessage({id: 1}));
  clean.decoder.end();
  assert.equal(clean.errors.length, 0);
});

test('解码器忽略非 Buffer 输入', () => {
  const {decoder, received, errors} = createDecoder();
  decoder.push('not a buffer');
  decoder.push(null);
  assert.equal(received.length, 0);
  assert.equal(errors.length, 0);
});

test('encode 拒绝超限消息并允许普通 JSON 负载', () => {
  assert.throws(() => encodeNativeMessage({big: 'x'.repeat(MAX_NATIVE_MESSAGE_BYTES)}), /过大/u);
  assert.throws(() => encodeNativeMessage({ok: true}, 8), /过大/u);
  // null 与 {} 是合法 JSON 负载（序列化为 'null'/'{}'），编码器不做业务语义校验。
  assert.ok(encodeNativeMessage({}).length > 0);
  assert.deepEqual(JSON.parse(encodeNativeMessage(null).subarray(4).toString('utf8')), null);
});

test('validateExtensionOrigin 只接受配置内的 chrome-extension 来源', () => {
  assert.equal(validateExtensionOrigin(VALID_ORIGIN, VALID_ORIGIN), true);
  assert.equal(validateExtensionOrigin([VALID_ORIGIN], VALID_ORIGIN), true);
  assert.equal(validateExtensionOrigin([`chrome-extension://${'b'.repeat(32)}`, VALID_ORIGIN], VALID_ORIGIN), true);
  // 回归：安装白名单带结尾斜杠、调用方不带（或反之）都必须是合法来源。
  assert.equal(validateExtensionOrigin(`${VALID_ORIGIN}/`, VALID_ORIGIN), true, '白名单带斜杠、实际不带');
  assert.equal(validateExtensionOrigin(VALID_ORIGIN, `${VALID_ORIGIN}/`), true, '白名单不带斜杠、实际带');

  assert.equal(validateExtensionOrigin([`chrome-extension://${'b'.repeat(32)}`], VALID_ORIGIN), false, '未列入白名单');
  assert.equal(validateExtensionOrigin(VALID_ORIGIN, 'https://example.com'), false, '协议不符');
  assert.equal(validateExtensionOrigin(VALID_ORIGIN, `chrome-extension://${'a'.repeat(31)}`), false, 'ID 长度不足');
  assert.equal(validateExtensionOrigin(VALID_ORIGIN, `chrome-extension://${'a'.repeat(33)}`), false, 'ID 长度超出');
  assert.equal(validateExtensionOrigin(VALID_ORIGIN, `chrome-extension://${'z'.repeat(32)}`), false, '字符超出 a–p');
  assert.equal(validateExtensionOrigin(VALID_ORIGIN, `${VALID_ORIGIN}/page`), false, '不允许路径');
  assert.equal(validateExtensionOrigin(VALID_ORIGIN, `chrome-extension://user@${'a'.repeat(32)}`), false, '不允许凭据');
  assert.equal(validateExtensionOrigin(VALID_ORIGIN, `${VALID_ORIGIN}?q=1`), false, '不允许查询');
  assert.equal(validateExtensionOrigin(VALID_ORIGIN, `${VALID_ORIGIN}#frag`), false, '不允许片段');
  assert.equal(validateExtensionOrigin(VALID_ORIGIN, 42), false, '来源必须是字符串');
  assert.equal(validateExtensionOrigin(undefined, VALID_ORIGIN), false, '未配置白名单');
});

test('帧上限为 1MB', () => {
  assert.equal(MAX_NATIVE_MESSAGE_BYTES, 1024 * 1024);
});
