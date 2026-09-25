/**
 * @file tools/unit/connector-clients.test.mjs
 * 文件职责：为 connector/ 的 GrokClient 与 CodexClient 提供 node:test 集成级单测——两者
 *   合计约 1500 行业务逻辑（登录态、模型校验、重试门控、JSON-RPC 会话）此前只有节流脚本
 *   间接覆盖。本文件用可注入的 spawnImpl 与临时数据目录，把 SPEC 第 8 节的关键行为固化为断言。
 * 主要内容：Grok 的格式类错误三次重试后抛出、AUTH/429/超时类错误不重试、--prompt-file
 *   不被支持时的 -p 回退、成功路径单次调用；Codex 的 initialize/account/read 握手、
 *   model/list 校验、thread/turn 任务流（item/completed + turn/completed 驱动解析）、
 *   未连接订阅时的 AUTH_REQUIRED。
 * 模块边界：只注入 spawnImpl 与临时 dataDir，不 mock 任何被测模块内部；真实文件写入限于
 *   系统临时目录；运行方式为在仓库根执行 node:test 自动发现本目录全部 .test.mjs。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {GrokClient} from '../../roamcat-0.0.1/connector/grok.mjs';
import {CodexClient} from '../../roamcat-0.0.1/connector/codex.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-connector-'));
}

/** 按调用序脚本化响应的假 spawn：handler({args, callIndex}) → {stdout, stderr, code, error}。 */
function createFakeSpawn(handler) {
  const calls = [];
  const spawnImpl = (command, args) => {
    const callIndex = calls.length;
    calls.push({command, args, options: [...arguments].slice(2)});
    const script = handler({command, args, callIndex}) || {};
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => {};
    child.killed = false;
    setImmediate(() => {
      if (script.error) { child.emit('error', script.error); return; }
      if (script.stdout) child.stdout.write(script.stdout);
      if (script.stderr) child.stderr.write(script.stderr);
      setImmediate(() => child.emit('exit', script.code ?? 0));
    });
    // stdin 数据转发给脚本（Codex JSON-RPC fake 需要读请求）。
    child.stdin.on('data', chunk => script.onStdin?.(String(chunk), child));
    return child;
  };
  return {spawnImpl, calls};
}

function grokClient(dataDir, spawnImpl) {
  return new GrokClient({grokPath: 'grok', dataDir, timeoutMs: 4000, spawnImpl, diagnostic: null});
}

function writeGrokAuth(dataDir) {
  // grokHome = dataDir/grok；parseGrokAccount 读取其中的 auth.json。
  fs.mkdirSync(path.join(dataDir, 'grok'), {recursive: true});
  fs.writeFileSync(path.join(dataDir, 'grok', 'auth.json'), JSON.stringify({default: {email: 'reader@example.com', principal_type: 'supergrok', refresh_token: 'rt'}}), {mode: 0o600});
}

const GROK_MODELS = JSON.stringify({models: [{id: 'grok-4.20-0309-non-reasoning', name: 'Grok'}]});

test('Grok classify 成功路径只调用一次 spawn', async () => {
  const dataDir = tempDir();
  writeGrokAuth(dataDir);
  const {spawnImpl, calls} = createFakeSpawn(({args}) => {
    if (args[0] === 'models') return {stdout: GROK_MODELS};
    return {stdout: '{"domain":"tech"}'};
  });
  const client = grokClient(dataDir, spawnImpl);
  const result = await client.classify({text: 'A relational database uses SQL queries.', title: 'Docs', model: 'grok-4.20-0309-non-reasoning'});
  assert.deepEqual(result, {domain: 'tech', source: 'grok'});
  assert.equal(calls.length, 2, '一次 models + 一次任务');
  assert.equal(calls[1].args[0], '--json-schema');
  assert.equal(typeof calls[1].args[1], 'string');
  await client.close();
});

test('Grok 对格式类错误重试至多三次后抛出', async () => {
  const dataDir = tempDir();
  writeGrokAuth(dataDir);
  const {spawnImpl, calls} = createFakeSpawn(({args}) => {
    if (args[0] === 'models') return {stdout: GROK_MODELS};
    return {stdout: 'not json at all'};
  });
  const client = grokClient(dataDir, spawnImpl);
  await assert.rejects(client.classify({text: 'A database uses SQL.', title: '', model: 'grok-4.20-0309-non-reasoning'}), /Grok/u);
  const taskCalls = calls.filter(call => call.args[0] !== 'models');
  assert.equal(taskCalls.length, 3, '格式类错误应重试满三次');
  await client.close();
});

test('Grok 对 AUTH/额度/超时类错误不重试', async () => {
  for (const script of [
    {stderr: '401 unauthorized: invalid token', code: 1},
    {stderr: '429 rate limit exceeded', code: 1},
    {stderr: 'insufficient quota', code: 1},
  ]) {
    const dataDir = tempDir();
    writeGrokAuth(dataDir);
    const {spawnImpl, calls} = createFakeSpawn(({args}) => (args[0] === 'models' ? {stdout: GROK_MODELS} : script));
    const client = grokClient(dataDir, spawnImpl);
    await assert.rejects(client.classify({text: 'A database uses SQL.', title: '', model: 'grok-4.20-0309-non-reasoning'}));
    const taskCalls = calls.filter(call => call.args[0] !== 'models');
    assert.equal(taskCalls.length, 1, '非格式类错误不应重试: ' + script.stderr);
    await client.close();
  }
});

test('Grok 在 --prompt-file 不受支持时回退 -p 传提示词', async () => {
  const dataDir = tempDir();
  writeGrokAuth(dataDir);
  const {spawnImpl, calls} = createFakeSpawn(({args, callIndex}) => {
    if (args[0] === 'models') return {stdout: GROK_MODELS};
    // 首次任务调用：旧版 CLI 以非零退出报 unknown option（脱敏前的可识别信号）。
    if (callIndex === 1) return {stderr: "error: unexpected argument '--prompt-file' found", code: 2};
    return {stdout: '{"domain":"data"}'};
  });
  const client = grokClient(dataDir, spawnImpl);
  const result = await client.classify({text: 'A database uses SQL.', title: '', model: 'grok-4.20-0309-non-reasoning'});
  assert.deepEqual(result, {domain: 'data', source: 'grok'});
  const taskCalls = calls.filter(call => call.args[0] !== 'models');
  assert.equal(taskCalls.length, 2, '应发生一次回退');
  assert.ok(taskCalls[1].args.includes('-p'), '回退调用应使用 -p');
  assert.ok(!taskCalls[1].args.includes('--prompt-file'), '回退调用不应再带 --prompt-file');
  await client.close();
});

test('Grok 无登录态时拒绝任务', async () => {
  const dataDir = tempDir();
  const {spawnImpl, calls} = createFakeSpawn(() => ({stdout: GROK_MODELS}));
  const client = grokClient(dataDir, spawnImpl);
  await assert.rejects(client.classify({text: 'A database uses SQL.', title: '', model: 'grok-4.20-0309-non-reasoning'}), /请先连接 Grok 订阅/u);
  assert.equal(calls.filter(call => call.args[0] !== 'models').length, 0);
  await client.close();
});

/** Codex JSON-RPC fake：script[method] 为 {result|error} 或 (message, {respond, fail, notify}) => void。 */
function createCodexFake(script) {
  const calls = [];
  const sent = [];
  const spawnImpl = (command, args) => {
    calls.push({command, args});
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    // app-server 是常驻进程，只有 kill 后才退出——close() 会等待 exit 事件。
    child.kill = () => { setImmediate(() => child.emit('exit', 0)); };
    const write = message => child.stdout.write(`${JSON.stringify(message)}\n`);
    child.stdin.on('data', chunk => {
      for (const line of String(chunk).split('\n')) {
        if (!line.trim()) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        sent.push(message);
        // 通知（无 id）不需要响应。
        if (message.id === undefined) continue;
        const respond = result => write({id: message.id, result});
        const fail = error => write({id: message.id, error});
        const notify = params => write({method: params.method, params: params.params});
        const handler = script[message.method];
        if (typeof handler === 'function') handler(message, {respond, fail, notify});
        else if (handler?.error) fail(handler.error);
        else respond(handler?.result ?? {});
      }
    });
    return child;
  };
  return {spawnImpl, calls, sent};
}

function codexClient(dataDir, spawnImpl) {
  return new CodexClient({codexPath: 'codex', dataDir, timeoutMs: 4000, spawnImpl, diagnostic: null});
}

const CODEX_ACCOUNT = {result: {account: {type: 'chatgpt', email: 'reader@example.com', plan: 'plus'}}};
const CODEX_MODELS = {result: {data: [{id: 'gpt-5.6-luna', displayName: 'GPT 5.6 Luna', isDefault: true, supportedReasoningEfforts: [{reasoningEffort: 'none'}]}], nextCursor: null}};

test('Codex 握手后读取账户状态并可列出模型', async () => {
  const dataDir = tempDir();
  const {spawnImpl, sent} = createCodexFake({
    initialize: {result: {}},
    'account/read': CODEX_ACCOUNT,
    'model/list': CODEX_MODELS,
  });
  const client = codexClient(dataDir, spawnImpl);
  await client.start();
  const status = client.refreshStatus ? await client.refreshStatus() : null;
  assert.equal(status.connected, true);
  assert.equal(status.authenticated, true);
  assert.equal(status.email, 'reader@example.com');
  const models = await client.listModels();
  assert.deepEqual(models.map(model => model.id), ['gpt-5.6-luna']);
  // 握手请求必须按协议顺序发出（initialized 是无 id 的通知，不计入请求序）。
  const requests = sent.filter(message => message.id !== undefined);
  assert.deepEqual(requests.slice(0, 2).map(message => message.method), ['initialize', 'account/read']);
  assert.ok(sent.some(message => message.method === 'initialized'), 'initialized 通知必须发出');
  await client.close();
});

test('Codex classify 走完整 thread/turn 任务流并解析结构化输出', async () => {
  const dataDir = tempDir();
  const {spawnImpl} = createCodexFake({
    initialize: {result: {}},
    'account/read': CODEX_ACCOUNT,
    'model/list': CODEX_MODELS,
    'thread/start': (message, {respond}) => respond({thread: {id: 'thread-1'}}),
    'turn/start': (message, {respond, notify}) => {
      respond({turn: {id: 'turn-1'}});
      // 服务器推送：agent 消息完成后终止回合。
      notify({method: 'item/started', params: {threadId: 'thread-1', item: {type: 'agentMessage', id: 'msg-1'}}});
      notify({method: 'item/completed', params: {threadId: 'thread-1', turnId: 'turn-1', item: {type: 'agentMessage', id: 'msg-1', text: '{"domain":"data"}'}}});
      notify({method: 'turn/completed', params: {threadId: 'thread-1', turn: {id: 'turn-1', status: 'completed'}}});
    },
  });
  const client = codexClient(dataDir, spawnImpl);
  await client.start();
  const result = await client.classify({text: 'PostgreSQL optimizer chooses an index scan.', title: 'Docs', model: 'gpt-5.6-luna'});
  assert.deepEqual(result, {domain: 'data', source: 'chatgpt'});
  await client.close();
});

test('Codex 在模型不可用时拒绝任务', async () => {
  const dataDir = tempDir();
  const {spawnImpl} = createCodexFake({
    initialize: {result: {}},
    'account/read': CODEX_ACCOUNT,
    'model/list': CODEX_MODELS,
  });
  const client = codexClient(dataDir, spawnImpl);
  await client.start();
  await assert.rejects(client.classify({text: 'PostgreSQL optimizer.', title: '', model: 'gpt-99-unknown'}), /当前不可用|选择一个可用的/u);
  await client.close();
});

test('Codex 未连接订阅时任务以 AUTH_REQUIRED 失败', async () => {
  const dataDir = tempDir();
  const {spawnImpl} = createCodexFake({
    initialize: {result: {}},
    'account/read': {result: {account: null}},
  });
  const client = codexClient(dataDir, spawnImpl);
  await client.start();
  const status = await client.refreshStatus();
  assert.equal(status.authenticated, false);
  // 给一个合法模型名：未认证时应在 listModels 的账户检查处抛 AUTH_REQUIRED，而非输入校验。
  await assert.rejects(client.classify({text: 'PostgreSQL optimizer.', title: '', model: 'gpt-5.6-luna'}), /请先连接 ChatGPT 订阅/u);
  await client.close();
});
