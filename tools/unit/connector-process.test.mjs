/**
 * @file tools/unit/connector-process.test.mjs
 * 文件职责：验证 CLI 请求结束后的子进程回收，超时、超量输出与关闭不会遗留忽略 SIGTERM 的进程。
 * 主要内容：假进程 + 可控时钟断言 TERM/KILL、真实退出清理以及失败后的输出不再进入回调。
 * 模块边界：不启动真实 CLI，不读取认证文件，不创建用户目录或网络连接。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {CliClient, OUTPUT_LIMIT} from '../../roamcat-0.0.1/connector/cli-client.mjs';

function fixture() {
  const child = new EventEmitter(), signals = [], output = [];
  child.stdout = new PassThrough();child.stderr = new PassThrough();
  child.kill = signal => { signals.push(signal); };
  const client = new CliClient({cliPath: 'fixture', dataDir: '.', timeoutMs: 100, spawnImpl: () => child, provider: 'fixture', hooks: {label: 'Fixture', env: () => ({}), exitError: () => new Error('failed')}});
  return {child, client, signals, output};
}

test('超时立即拒绝，但进程仍被跟踪；close 不延后两秒强杀', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {child, client, signals, output} = fixture();
  const rejected = assert.rejects(client.spawnCli([], {onOutput: text => output.push(text)}), error => error.code === 'TIMEOUT');
  t.mock.timers.tick(100);await rejected;
  assert.deepEqual(signals, ['SIGTERM']);assert.ok(client.activeChildren.has(child));
  child.stdout.write('late output');assert.deepEqual(output, []);
  t.mock.timers.tick(1000);await client.close();t.mock.timers.tick(999);
  assert.deepEqual(signals, ['SIGTERM']);t.mock.timers.tick(1);
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);assert.ok(client.activeChildren.has(child));
  child.emit('exit', null, 'SIGKILL');assert.equal(client.activeChildren.size, 0);
});

test('输出超量也会强杀忽略 TERM 的进程，退出后取消强杀', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  for (const exits of [true, false]) {
    const {child, client, signals} = fixture();
    const rejected = assert.rejects(client.spawnCli([]), error => error.code === 'OUTPUT_INVALID');
    child.stdout.write(Buffer.alloc(OUTPUT_LIMIT + 1));await rejected;
    if (exits) child.emit('exit', 1);
    t.mock.timers.tick(2000);
    assert.deepEqual(signals, exits ? ['SIGTERM'] : ['SIGTERM', 'SIGKILL']);
    child.emit('exit', 1);assert.equal(client.activeChildren.size, 0);
  }
});

test('正常退出与启动失败立即移出跟踪，close 不再发送信号', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {child, client, signals} = fixture();
  const pending = client.spawnCli([]);child.stdout.write('ok');child.emit('exit', 0);
  assert.equal((await pending).stdout, 'ok');await client.close();t.mock.timers.tick(5000);assert.deepEqual(signals, []);
  const failed = fixture();const rejected = assert.rejects(failed.client.spawnCli([]), error => error.code === 'STARTUP_FAILED');
  failed.child.emit('error', new Error('spawn failed'));await rejected;assert.equal(failed.client.activeChildren.size, 0);
});
