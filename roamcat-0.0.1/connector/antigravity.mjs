/**
 * @file connector/antigravity.mjs
 * 文件职责：Antigravity后端——经官方agy CLI复用Google订阅权益。
 * 主要内容：agy 专属适配——用户会话环境、/usage 账户探测、ERROR 信封解析、
 *   --json-schema 剥离 RE2 不支持 pattern、手动终端登录引导；生命周期与任务骨架
 *   由 cli-client.mjs 的 CliClient 承载。
 * 模块边界：连接器层；上游错误只映射分类码，不回显原文。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import { spawn } from 'node:child_process';
import { chmod, mkdir, rm } from 'node:fs/promises';
import { delimiter, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import {
  CliClient,
  DEFAULT_TIMEOUT_MS,
  DOMAINS,
  errorWithDiagnostic,
  stripSchemaPattern as antigravitySchema,
  FIELD_RULES,
} from './cli-client.mjs';

export { antigravitySchema };

export function buildAntgravityEnv({ agyPath, tmpDir }) {
  // Antigravity auth lives in the OS keyring / ~/.gemini for the real user, so
  // the environment must stay attached to the user session (no isolated HOME).
  const pathEntries = [...new Set([
    dirname(agyPath),
    ...String(process.env.PATH || '').split(delimiter).filter(Boolean),
  ])];
  const env = { ...process.env, PATH: pathEntries.join(delimiter) };
  if (tmpDir) {
    env.TMPDIR = tmpDir;
    if (process.platform === 'win32') {
      env.TEMP = tmpDir;
      env.TMP = tmpDir;
    }
  }
  return env;
}

const MODEL_SLUG = /^[a-z0-9][a-z0-9._-]{0,80}$/;

export function parseAntgravityModels(text) {
  const models = [];
  const seen = new Set();
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // Progress / diagnostic lines are not models.
    if (/^(fetching|loading|warning|error)\b/i.test(line)) continue;
    // `agy models` prints "<slug><tab|2+ spaces><display name>".
    const columns = line.split(/\t+|\s{2,}/).map(part => part.trim()).filter(Boolean);
    let id = '', name = '';
    if (columns.length >= 2 && MODEL_SLUG.test(columns[0]) && /[A-Za-z㐀-鿿]/.test(columns[1])) {

      id = columns[0];
      name = columns.slice(1).join(' ');
    } else if (columns.length === 1 && line && !line.endsWith(':')) {
      // Older agy versions list display names only ("Gemini 3.5 Flash (High)").
      id = line;
      name = line;
    } else {
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    models.push({ id, name: name || id, isDefault: models.length === 0 });
    if (models.length >= 256) break;
  }
  return models;
}

export function parseAntgravityEnvelope(text) {
  const source = String(text || '').trim();
  if (!source) throw new Error('Antigravity 没有返回内容。');
  const lines = source.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index--) {
    try {
      const value = JSON.parse(lines[index]);
      if (value && typeof value === 'object' && typeof value.status === 'string') return value;
    } catch { /* not the envelope line */ }
  }
  try {
    const value = JSON.parse(source);
    if (value && typeof value === 'object' && typeof value.status === 'string') return value;
  } catch { /* fall through */ }
  throw new Error('Antigravity 没有返回有效 JSON。');
}

function extractAntigravityPayload(envelope) {
  if (!envelope || typeof envelope !== 'object') throw new Error('Antigravity 没有返回有效结果。');
  if (envelope.status !== 'SUCCESS') {
    throw new Error(typeof envelope.error === 'string' && envelope.error.trim()
      ? envelope.error.trim().slice(0, 600)
      : 'Antigravity 请求未成功，请稍后重试。');
  }
  const structured = envelope.structured_output;
  if (structured && typeof structured === 'object' && !Array.isArray(structured)) return structured;
  const response = envelope.response;
  if (typeof response === 'string' && response.trim()) {
    const trimmed = response.trim();
    try { return JSON.parse(trimmed); }
    catch {
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try { return JSON.parse(trimmed.slice(start, end + 1)); }
        catch { /* fall through to error */ }
      }
    }
  }
  throw new Error('Antigravity 没有返回符合格式的结果。');
}

function publicAntgravityError(error) {
  const joined = String(error?.message ?? error ?? '').toLowerCase();
  let category = 'request_failed', message = 'Antigravity 请求失败，请根据错误代码检查服务或连接器。';
  if (/invalid.{0,40}schema|schema.{0,80}(invalid|must|unsupported)|json_schema|not valid regex|is not valid against metaschema/.test(joined)) {
    category = 'invalid_output_schema'; message = '结构化输出格式被 Antigravity 拒绝，请更新扩展与本机连接器。';
  } else if (/invalid model|not recognized as a known model|unknown model|model .* not (available|found)/.test(joined)) {
    category = 'unsupported_model'; message = '所选模型当前不可用，请刷新模型列表后重新选择。';
  } else if (/context.{0,20}(length|limit|exceed)|too many tokens|prompt too (long|large)/.test(joined)) {
    category = 'context_limit'; message = '请求超过模型的上下文限制，请选择更短内容。';
  } else if (/429|rate.?limit|quota|usage.?limit|insufficient.?quota|credits|weekly limit|5-hour limit|five.hour limit|baseline .* quota|quota reached/.test(joined)) {
    category = 'usage_limit'; message = 'Google 订阅额度已达上限（周配额或 5 小时配额），请稍后重试或检查订阅额度。';
  } else if (/authentication required|not signed in|not authenticated|no .*credential|login required|sign.?in|unauthori[sz]ed|authentication|(?:invalid|expired)[ _-](?:access[ _-])?token/.test(joined)) {
    category = 'authentication'; message = 'Google 登录已失效，请在终端运行 agy 重新登录。';
  } else if (/timed?\s*out|timeout/.test(joined)) {
    category = 'timeout'; message = 'Antigravity 请求超时，请刷新连接后重试。';
  }
  const details = [category].filter(Boolean);
  if (Number.isSafeInteger(error?.code)) details.push('exit ' + error.code);
  return message + '（' + details.join('; ') + '）';
}

function antigravityErrorCode(error) {
  const text = String(error?.message ?? '').toLowerCase();
  if (/429|rate.?limit|quota|usage.?limit|weekly limit|5-hour limit|five.hour limit/.test(text)) return 'RATE_LIMIT';
  if (/authentication required|not signed in|not authenticated|unauthori[sz]ed|authentication|login required/.test(text)) return 'AUTH';
  if (/schema|not valid regex|metaschema|response_format|json/.test(text)) return 'OUTPUT_INVALID';
  if (/timed?\s*out|timeout/.test(text)) return 'TIMEOUT';
  return 'NATIVE_RPC';
}

function parseClassification(value) {
  const payload = value && typeof value === 'object' ? value : null;
  if (payload && DOMAINS.has(payload.domain)) return { domain: payload.domain, source: 'antigravity' };
  throw new Error('Antigravity 返回的领域分类格式无效，请重试。');
}

const agyHooks = {
  label: 'Google',
  env: client => buildAntgravityEnv({ agyPath: client.cliPath, tmpDir: client.tmpDir }),
  async prepare(client) {
    await Promise.all([
      mkdir(client.workDir, { recursive: true, mode: 0o700 }),
      mkdir(client.tmpDir, { recursive: true, mode: 0o700 }),
    ]);
    try { await chmod(client.workDir, 0o700); } catch { /* Windows may ignore chmod */ }
    try { await chmod(client.tmpDir, 0o700); } catch { /* Windows may ignore chmod */ }
  },
  async probeAccount(client) {
    // `/usage` is answered by the CLI itself: instant, zero quota, and it
    // fails when no valid Google session exists.
    const result = await client.spawnCli(['-p', '/usage', '--output-format', 'json'], { timeoutMs: 30_000 });
    const envelope = parseAntgravityEnvelope(result.stdout);
    if (envelope.status !== 'SUCCESS') throw new Error(envelope.error || 'Google 账号状态检查失败。');
    return { email: null, plan: 'Google' };
  },
  accountError(error) {
    const message = String(error?.message || '');
    return /authentication required|not signed in|not authenticated|no .*credential|login required|sign.?in|unauthori[sz]ed/i.test(message)
      ? '尚未登录 Google 账号。请在终端运行 agy，用 Google 账号（Google AI Pro / Ultra 订阅）完成登录，再点击“刷新账户与模型”。'
      : publicAntgravityError(error);
  },
  statusExtras: () => ({ loginPending: false, userCode: null }),
  authRequired: () => new Error('请先连接 Google 订阅：在终端运行 agy 完成登录，再点击“刷新账户与模型”。', { cause: 'AUTH_REQUIRED' }),
  async loadModels(client, generation) {
    const result = await client.spawnCli(['models'], { timeoutMs: 30_000 });
    client.ensureModelsFresh(generation);
    const models = parseAntgravityModels(result.stdout);
    if (!models.length) throw new Error('当前 Google 订阅没有可用模型。');
    client.modelCache = models;
    return models;
  },
  async executeTask(client, { instructions, payload, schema, model, parse }) {
    // Keep user content out of tool reach: sandbox + no slash expansion. The
    // working directory is the isolated connector dir, never the page.
    const args = [];
    if (model) args.push('--model', model);
    args.push('--disable-slash-commands', '--sandbox', '-p', `${instructions}\n\n${FIELD_RULES}\n\n${JSON.stringify(payload)}`, '--output-format', 'json');
    if (schema) args.push('--json-schema', JSON.stringify(antigravitySchema(schema)));
    const result = await client.spawnCli(args, { timeoutMs: client.timeoutMs });
    const envelope = parseAntgravityEnvelope(result.stdout);
    return parse(extractAntigravityPayload(envelope));
  },
  exitError(client, { stdout, stderr, code }) {
    // agy prints a machine-readable ERROR envelope on stdout even on failure.
    let envelope = null;
    try { envelope = parseAntgravityEnvelope(stdout); } catch { envelope = null; }
    const envelopeError = envelope && envelope.status === 'ERROR' && typeof envelope.error === 'string' ? envelope.error : '';
    const message = envelopeError || stderr.trim() || stdout.trim() || 'Antigravity CLI 已退出。';
    return errorWithDiagnostic(publicAntgravityError({ message }), antigravityErrorCode({ message }), { exitCode: Number.isInteger(code) && code >= 0 ? code : 0 });
  },
  publicError: error => publicAntgravityError(error),
  errorCode: error => antigravityErrorCode(error),
  parseClassification: value => parseClassification(value),
};

export class AntigravityClient extends CliClient {
  constructor({ agyPath, dataDir, timeoutMs = DEFAULT_TIMEOUT_MS, spawnImpl = spawn, diagnostic = null }) {
    if (!agyPath || !dataDir) throw new TypeError('agyPath 和 dataDir 为必填项');
    super({ cliPath: resolve(agyPath), dataDir: resolve(dataDir), timeoutMs, spawnImpl, diagnostic, provider: 'antigravity', hooks: agyHooks });
  }

  async login() {
    await this.start();
    await this.refreshStatus().catch(() => {});
    if (this.account) return {};
    // agy 登录必须在交互式终端里完成（系统钥匙串 + 浏览器 OAuth），连接器
    // 没有可代开的官方登录链接，只能指引用户手动登录。
    throw new Error('请在终端运行 agy，按提示用 Google 账号（Google AI Pro / Ultra 订阅）完成登录，然后回扩展点击“刷新账户与模型”。');
  }

  async cancelLogin() {
    await this.start();
    return this.emitStatus();
  }

  async logout() {
    await this.start();
    this.account = null;
    this.authGeneration++;
    this.modelCache = null;
    this.emitStatus();
    // File-based token (SSH/headless) can be removed; keyring sessions can only
    // be cleared from the interactive CLI via `/logout`.
    try { await rm(join(homedir(), '.gemini', 'antigravity-cli', 'antigravity-oauth-token'), { force: true }); } catch { /* ignore */ }
    await this.refreshStatus().catch(() => {});
    if (this.account) {
      this.loginError = '系统钥匙串中仍有 Google 登录。请在终端运行 agy 并输入 /logout 后，再点击刷新。';
      return this.emitStatus();
    }
    this.loginError = null;
    return this.emitStatus();
  }
}
