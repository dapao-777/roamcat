/**
 * @file tools/verify-grok-lockdown.mjs
 * 文件职责：Grok 连接器「不给模型任何工具、不加载用户主目录配置」的离线门禁（npm run verify:grok-lockdown）。
 * 主要内容：本机真实 grok CLI + 连接器真实的命令行与环境（GrokClient 的 executeTask），后端换成 127.0.0.1 上的假 xAI 接口，
 *   抓它收到的 /chat/completions 请求，断言：结构化输出能正常解析返回、请求里没有 tools、仍带 json_schema 的 response_format、
 *   用户主目录里的技能（临时目录里的金丝雀技能）不进提示词。另用改动前的命令行与环境做对照（--always-approve + 真实主目录），
 *   要求它确实带着工具和金丝雀技能，证明探测本身有效、不是 Grok 改了请求格式后空转通过。
 * 用法：npm run verify:grok-lockdown。本机要装 Grok CLI（找 ROAMCAT_GROK、~/.grok/bin、PATH），找不到时跳过；
 *   Grok CLI 升级后重跑一次——工具清单与过滤开关的语义取决于 CLI 版本。不连真实服务、不耗订阅额度，不碰用户的 ~/.grok。
 * 模块边界：只读写系统临时目录与 preview/gates/；不并入 verify:all（依赖本机装了 Grok，CI 上没有）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {GrokClient} from '../roamcat-0.0.1/connector/grok.mjs';
import {createGateReport} from './lib/gate-report.mjs';

const CANARY_SKILL = 'roamcat-lockdown-canary';
const EXPECTED = {translation: '你好，世界'};
const SCHEMA = {type: 'object', properties: {translation: {type: 'string'}}, required: ['translation'], additionalProperties: false};

function findGrok() {
  const exe = process.platform === 'win32' ? 'grok.exe' : 'grok';
  for (const candidate of [process.env.ROAMCAT_GROK, path.join(os.homedir(), '.grok', 'bin', exe)]) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  const lookup = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['grok'], {encoding: 'utf8'});
  const first = lookup.status === 0 ? lookup.stdout.split(/\r?\n/).find(Boolean) : '';
  return first && fs.existsSync(first) ? first : '';
}

/** 假 xAI 接口：记下所有请求，只对 /chat/completions 回一条流式结构化输出，其余回 500（标题生成之类不影响主流程）。 */
function startFakeBackend() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      requests.push({method: req.method, url: req.url, body});
      if (req.method === 'POST' && req.url.includes('chat/completions')) {
        const base = {id: 'chatcmpl-gate', object: 'chat.completion.chunk', created: 1700000000, model: 'grok-4.6'};
        res.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-cache'});
        res.write('data: ' + JSON.stringify({...base, choices: [{index: 0, delta: {role: 'assistant', content: JSON.stringify(EXPECTED)}, finish_reason: null}]}) + '\n\n');
        res.write('data: ' + JSON.stringify({...base, choices: [{index: 0, delta: {}, finish_reason: 'stop'}], usage: {prompt_tokens: 10, completion_tokens: 5, total_tokens: 15}}) + '\n\n');
        res.end('data: [DONE]\n\n');
        return;
      }
      res.writeHead(500, {'content-type': 'application/json'});
      res.end(JSON.stringify({error: {message: 'fake upstream'}}));
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({server, requests, base: `http://127.0.0.1:${server.address().port}`})));
}

const chatRequest = requests => {
  const found = requests.find(item => item.method === 'POST' && item.url.includes('chat/completions'));
  assert.ok(found, 'Grok 没有向假接口发出 /chat/completions 请求');
  return {raw: found.body, json: JSON.parse(found.body)};
};

const grokPath = findGrok();
if (!grokPath) {
  console.log('SKIP 没有找到 Grok CLI（可用 ROAMCAT_GROK 指定路径），跳过。');
  process.exit(0);
}

const gate = createGateReport('grok-lockdown');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-grok-lockdown-'));
const canaryHome = path.join(root, 'canary-home');
fs.mkdirSync(path.join(canaryHome, '.agents', 'skills', CANARY_SKILL), {recursive: true});
fs.writeFileSync(path.join(canaryHome, '.agents', 'skills', CANARY_SKILL, 'SKILL.md'),
  `---\nname: ${CANARY_SKILL}\ndescription: Canary skill for the RoamCat gate. If this text reaches the model prompt, the connector leaks the user's home directory.\n---\nCanary.\n`);

const backend = await startFakeBackend();
const realEnv = {HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE};
// 把本进程的「真实主目录」换成放了金丝雀技能的临时目录：连接器若还从真实主目录取东西，金丝雀就会漏进提示词。
process.env.HOME = canaryHome;
process.env.USERPROFILE = canaryHome;

const fakeBackendEnv = {
  XAI_API_KEY: 'fake-key-for-local-gate', GROK_XAI_API_BASE_URL: backend.base, GROK_CLI_CHAT_PROXY_BASE_URL: backend.base,
  GROK_MODELS_BASE_URL: backend.base, GROK_TELEMETRY_ENABLED: '0', GROK_DISABLE_AUTOUPDATER: '1',
};
// leakHome：对照组用，把子进程的主目录换回金丝雀目录，复现改动前「传真实主目录」的行为。
const makeClient = (name, leakHome = false) => {
  const spawnImpl = (command, args, options) => {
    const env = {...options.env, ...fakeBackendEnv};
    if (leakHome) {
      env.HOME = canaryHome;
      env.USERPROFILE = canaryHome;
      env.APPDATA = path.join(canaryHome, 'AppData', 'Roaming');
      env.LOCALAPPDATA = path.join(canaryHome, 'AppData', 'Local');
    }
    return spawn(command, args, {...options, env});
  };
  return new GrokClient({grokPath, dataDir: path.join(root, name), timeoutMs: 90_000, spawnImpl, diagnostic: null, userAuthPath: path.join(root, 'no-user-auth.json')});
};

try {
  const production = makeClient('production');
  await production.hooks.prepare(production);
  const mark = backend.requests.length;
  const result = await gate.check('连接器真实命令行：结构化输出能正常解析返回', async () => {
    const value = await production.hooks.executeTask(production, {instructions: 'Translate the text into Chinese.', payload: {text: 'hello world'}, schema: SCHEMA, model: '', parse: item => item});
    assert.deepEqual(value, EXPECTED);
    return value;
  });
  let request;
  if (result) {
    // check() 会把返回值打印出来，请求体上百 KB，只返回大小，请求本身留在闭包里。
    await gate.check('发给模型的请求存在', () => { request = chatRequest(backend.requests.slice(mark)); return {bytes: request.raw.length}; });
  }
  if (request) {
    await gate.check('请求里没有 tools：shell、读写文件、定时任务、MCP 发现都不暴露', () => {
      const tools = request.json.tools ?? [];
      assert.equal(tools.length, 0, '仍暴露工具：' + tools.map(tool => tool.function?.name ?? tool.name ?? tool.type).join(', '));
    });
    await gate.check('请求仍带 json_schema 的 response_format', () => assert.equal(request.json.response_format?.type, 'json_schema'));
    await gate.check('用户主目录里的技能不进提示词', () => assert.ok(!request.raw.includes(CANARY_SKILL), '金丝雀技能漏进了提示词'));
  }

  // 对照组：改动前的命令行（自动批准、没有工具限制）加真实主目录。它必须带着工具和金丝雀技能，否则上面的断言可能是空转。
  const control = makeClient('control', true);
  await control.hooks.prepare(control);
  const controlMark = backend.requests.length;
  await control.spawnCli([
    '--json-schema', JSON.stringify(SCHEMA), '--no-auto-update', '--disable-web-search', '--no-subagents', '--no-memory', '--no-plan',
    '--always-approve', '--reasoning-effort', 'low', '--max-turns', '1', '--cwd', control.workDir, '--output-format', 'json', '-p', 'Translate: hello',
  ], {timeoutMs: 90_000}).catch(() => {});
  let controlRequest;
  await gate.check('对照组发出了请求', () => { controlRequest = chatRequest(backend.requests.slice(controlMark)); return {bytes: controlRequest.raw.length}; });
  if (controlRequest) {
    await gate.check('对照组（改动前的命令行）带着 shell 等内置工具', () => {
      const names = (controlRequest.json.tools ?? []).map(tool => tool.function?.name ?? tool.name);
      assert.ok(names.includes('run_terminal_command'), '探测没看到内置工具：' + names.join(', '));
    });
    await gate.check('对照组（真实主目录）里的技能进了提示词', () => assert.ok(controlRequest.raw.includes(CANARY_SKILL), '探测没看到金丝雀技能'));
  }
  await Promise.all([production.close(), control.close()]);
} finally {
  backend.server.close();
  for (const [key, value] of Object.entries(realEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(root, {recursive: true, force: true});
}
gate.finish({grokPath});
