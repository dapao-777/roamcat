/**
 * @file connector/grok.mjs
 * 文件职责：xAI 官方 Grok CLI 的订阅连接器客户端，复用 SuperGrok / X Premium+ 配额。
 * 主要内容：Grok 专属适配——环境隔离 env、device-auth 登录流、--prompt-file/-p 回退、
 *   JSON 输出提取与脱敏错误映射；生命周期与任务骨架由 cli-client.mjs 的 CliClient 承载。
 * 模块边界：连接器层；仅 import extension 共享协议文件、cli-client.mjs 与 Node 内置模块。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { delimiter, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import {
  CliClient,
  DEFAULT_TIMEOUT_MS,
  DOMAINS,
  errorWithDiagnostic,
  stripSchemaPattern as grokSchema,
  FIELD_RULES,
} from './cli-client.mjs';

const LOGIN_URL_WAIT_MS = 20_000;
const LOGIN_HOSTS = new Set(["auth.x.ai", "accounts.x.ai"]);

export function buildGrokConfig() {
  return [
    '# Generated for the isolated RoamCat Grok connector.',
    '[cli]',
    'auto_update = false',
    '',
  ].join('\n');
}

export function buildGrokEnv({ grokPath, grokHome, tmpDir }) {
  const pathEntries = [...new Set([
    dirname(grokPath),
    dirname(process.execPath),
    join(homedir(), '.grok', 'bin'),
    process.platform === 'win32' ? process.env.SystemRoot && join(process.env.SystemRoot, 'System32') : '/usr/bin',
    process.platform === 'win32' ? undefined : '/bin',
  ].filter(Boolean))];
  const env = {
    GROK_HOME: grokHome,
    HOME: homedir(),
    LANG: 'en_US.UTF-8',
    PATH: pathEntries.join(delimiter),
    TMPDIR: tmpDir,
    GROK_WRITE_FILE: '0',
    GROK_WEB_FETCH: '0',
    GROK_SUBAGENTS: '0',
    GROK_MEMORY: '0',
    GROK_CRASH_HANDLER: '0',
  };
  if (process.platform === 'win32') {
    env.USERPROFILE = homedir();
    env.SYSTEMROOT = process.env.SYSTEMROOT || process.env.SystemRoot || '';
    env.WINDIR = process.env.WINDIR || env.SYSTEMROOT;
    env.COMSPEC = process.env.COMSPEC || '';
    env.PATHEXT = process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM';
    env.APPDATA = process.env.APPDATA || '';
    env.LOCALAPPDATA = process.env.LOCALAPPDATA || '';
    env.TEMP = tmpDir;
    env.TMP = tmpDir;
  }
  return env;
}

export function parseGrokLoginOutput(text) {
  const source = String(text || '');
  const urls = [];
  for (const match of source.matchAll(/https:\/\/(?:auth|accounts)\.x\.ai[^\s"'<>\\]*/gi)) {
    const cleaned = match[0].replace(/[.,);]+$/g, '');
    try {
      const url = new URL(cleaned);
      if (url.protocol === 'https:' && LOGIN_HOSTS.has(url.hostname) && !url.port && !url.username && !url.password) {
        urls.push(url.href);
      }
    } catch { /* ignore non-URLs */ }
  }
  const complete = urls.find(value => /[?&](?:user_code|code|userCode)=/i.test(value));
  const authUrl = complete || urls[0] || '';
  const labelled = source.match(/(?:user code|verification code|enter code|device code)[:\s]+([A-Z0-9][A-Z0-9-]{3,15})/i);
  const dotted = source.match(/\b([A-Z0-9]{4,8}-[A-Z0-9]{4,8}(?:-[A-Z0-9]{4,8})?)\b/);
  const userCode = (labelled?.[1] || dotted?.[1] || '').toUpperCase();
  return { authUrl, userCode };
}

export function parseGrokModelsJson(text) {
  try {
    const value = JSON.parse(String(text || '').trim());
    const rows = Array.isArray(value) ? value : Array.isArray(value?.models) ? value.models : Array.isArray(value?.data) ? value.data : [];
    const models = [];
    const seen = new Set();
    for (const item of rows) {
      const id = typeof item === 'string' ? item : (item && typeof item.id === 'string' ? item.id : '');
      if (!id || seen.has(id) || !/^grok-[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(id)) continue;
      seen.add(id);
      models.push({
        id,
        name: typeof item?.name === 'string' && item.name ? item.name : (typeof item?.displayName === 'string' && item.displayName ? item.displayName : id),
        isDefault: item?.isDefault === true || item?.default === true,
      });
      if (models.length >= 256) break;
    }
    if (models.length && !models.some(model => model.isDefault)) models[0].isDefault = true;
    return models;
  } catch {
    return [];
  }
}

export function parseGrokModels(text) {
  const models = [];
  const seen = new Set();
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/\b(grok-[A-Za-z0-9][A-Za-z0-9._-]{0,80})\b/);
    if (!match || seen.has(match[1])) continue;
    seen.add(match[1]);
    models.push({
      id: match[1],
      name: match[1],
      isDefault: /\bdefault\b/i.test(line) || models.length === 0,
    });
    if (models.length >= 256) break;
  }
  if (models.length > 1) {
    const explicit = models.filter(model => model.isDefault);
    if (explicit.length > 1) {
      const keep = explicit[0].id;
      for (const model of models) model.isDefault = model.id === keep;
    }
  }
  return models;
}

export function parseGrokAccount(auth) {
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) return null;
  const entries = Object.values(auth).filter(value => value && typeof value === 'object' && !Array.isArray(value));
  for (const value of entries) {
    const email = typeof value.email === 'string' && value.email.includes('@') ? value.email.slice(0, 320) : null;
    const plan = typeof value.principal_type === 'string' && value.principal_type
      ? value.principal_type.slice(0, 100)
      : 'Grok';
    if (email || value.key || value.refresh_token || value.user_id) return { email, plan };
  }
  return entries.length ? { email: null, plan: 'Grok' } : null;
}

export function extractGrokJson(text) {
  const source = String(text || '').trim();
  if (!source) throw new Error('Grok 没有返回内容。');
  const candidates = [];
  try { candidates.push(JSON.parse(source)); } catch { /* whole stdout is not JSON */ }
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { candidates.push(JSON.parse(source.slice(start, end + 1))); } catch { /* surrounding object failed */ }
  }
  if (!candidates.length) {
    for (let index = source.lastIndexOf('{'); index >= 0; index = source.lastIndexOf('{', index - 1)) {
      const close = source.indexOf('}', index);
      if (close < 0) continue;
      try { candidates.push(JSON.parse(source.slice(index, source.lastIndexOf('}') + 1))); break; }
      catch { /* try an earlier opening brace */ }
    }
  }
  if (!candidates.length) throw new Error('Grok 没有返回有效 JSON。');
  return unwrapGrokValue(candidates[candidates.length - 1]);
}

function unwrapGrokValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { return unwrapGrokValue(JSON.parse(trimmed)); } catch { return value; }
    }
    return value;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  if (Object.hasOwn(value, 'structuredOutput') || Object.hasOwn(value, 'structured_output')) {
    const inner = value.structuredOutput ?? value.structured_output;
    if (inner && typeof inner === 'object') return unwrapGrokValue(inner);
    const err = value.structuredOutputError || value.structured_output_error;
    throw new Error(typeof err === 'string' && err ? err : 'Grok 没有返回符合格式的结果。');
  }
  for (const key of ['result', 'output', 'message', 'content', 'data']) {
    if (!Object.hasOwn(value, key)) continue;
    const inner = value[key];
    if (inner && typeof inner === 'object') return unwrapGrokValue(inner);
    if (typeof inner === 'string') return unwrapGrokValue(inner);
  }
  return value;
}

function publicGrokError(error) {
  const joined = String(error?.message ?? error ?? '').toLowerCase();
  let category = 'request_failed', message = 'Grok 请求失败，请根据错误代码检查服务或连接器。';
  if (/invalid.{0,40}schema|schema.{0,80}(invalid|must|unsupported)|json_schema|response_format/.test(joined)) {
    category = 'invalid_output_schema'; message = '结构化输出格式被 Grok 拒绝，请更新扩展与本机连接器。';
  } else if (/context.{0,20}(length|limit|exceed)|too many tokens/.test(joined)) {
    category = 'context_limit'; message = '请求超过模型的上下文限制，请选择更短内容。';
  } else if (/429|rate.?limit|quota|usage.?limit|insufficient.?quota|credits/.test(joined)) {
    category = 'usage_limit'; message = 'Grok 使用额度已达上限，请稍后重试或检查订阅额度。';
  } else if (/401|403|unauthori[sz]ed|authentication|not logged in|login required|sign.?in|(?:invalid|expired)[ _-](?:access[ _-])?token|credential/.test(joined)) {
    category = 'authentication'; message = 'Grok 登录已失效，请重新连接。';
  } else if (/model.{0,100}(not supported|not available|does not exist)|unsupported.{0,20}model|model_not_found/.test(joined)) {
    category = 'unsupported_model'; message = '当前模型不支持这类请求，请在服务设置中选择可用的辅助模型。';
  } else if (/timed?\s*out|timeout/.test(joined)) {
    category = 'timeout'; message = 'Grok 请求超时，请刷新连接后重试。';
  }
  const details = [category].filter(Boolean);
  if (Number.isSafeInteger(error?.code)) details.push('exit ' + error.code);
  return message + '（' + details.join('; ') + '）';
}

function grokErrorCode(error) {
  const text = String(error?.message ?? '').toLowerCase();
  if (/429|rate.?limit|quota|usage.?limit/.test(text)) return 'RATE_LIMIT';
  if (/401|403|unauthori[sz]ed|authentication|login required/.test(text)) return 'AUTH';
  if (/schema|response_format|json/.test(text)) return 'OUTPUT_INVALID';
  if (/timed?\s*out|timeout/.test(text)) return 'TIMEOUT';
  return 'NATIVE_RPC';
}

function parseClassification(value) {
  const payload = value && typeof value === 'object' && DOMAINS.has(value.domain) ? value : unwrapGrokValue(value);
  if (payload && DOMAINS.has(payload.domain)) return { domain: payload.domain, source: 'grok' };
  throw new Error('Grok 返回的领域分类格式无效，请重试。');
}

function trustedAuthUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && LOGIN_HOSTS.has(url.hostname) && !url.port && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

const grokHooks = {
  label: 'Grok',
  // Grok 的 page 范围翻译不回 onProgress 中间进度（整页结果体量大）。
  suppressPageProgress: true,
  env: client => buildGrokEnv({ grokPath: client.cliPath, grokHome: client.grokHome, tmpDir: client.tmpDir }),
  async prepare(client) {
    await Promise.all([
      mkdir(client.grokHome, { recursive: true, mode: 0o700 }),
      mkdir(client.workDir, { recursive: true, mode: 0o700 }),
      mkdir(client.tmpDir, { recursive: true, mode: 0o700 }),
    ]);
    const configPath = join(client.grokHome, 'config.toml');
    await writeFile(configPath, buildGrokConfig(), { mode: 0o600 });
    try { await chmod(configPath, 0o600); } catch { /* Windows may ignore chmod */ }
  },
  probeAccount: client => client.readAccount(),
  accountError: error => publicGrokError(error),
  statusExtras: client => ({ loginPending: Boolean(client.loginChild), userCode: client.loginUserCode }),
  authRequired: () => new Error('请先连接 Grok 订阅。', { cause: 'AUTH_REQUIRED' }),
  async loadModels(client, generation) {
    const result = await client.spawnCli(['models'], { timeoutMs: 30_000 });
    client.ensureModelsFresh(generation);
    let models = parseGrokModelsJson(result.stdout);
    if (!models.length) models = parseGrokModels(result.stdout + '\n' + result.stderr);
    if (!models.length) throw new Error('当前 Grok 订阅没有可用模型。');
    client.modelCache = models;
    return models;
  },
  async executeTask(client, { instructions, payload, schema, model, parse }) {
    const promptPath = join(client.tmpDir, `prompt-${randomUUID()}.txt`);
    try {
      await writeFile(promptPath, `${instructions}\n\n${FIELD_RULES}\n\n${JSON.stringify(payload)}`, { mode: 0o600 });
      const args = [
        '--json-schema', JSON.stringify(grokSchema(schema)),
        '--no-auto-update',
        '--disable-web-search',
        '--no-subagents',
        '--no-memory',
        '--no-plan',
        '--always-approve',
        '--reasoning-effort', 'low',
        '--max-turns', '1',
        '--cwd', client.workDir,
        '--output-format', 'json',
        '--prompt-file', promptPath,
      ];
      if (model) args.push('-m', model);
      const spawnOnce = async () => {
        try {
          return await client.spawnCli(args, { timeoutMs: client.timeoutMs });
        } catch (error) {
          // 旧版 CLI 不认识 --prompt-file：exitError 已据 stderr 原文翻下 promptFileSupported。
          if (!client.promptFileSupported && args.includes('--prompt-file')) {
            const prompt = await readFile(promptPath, 'utf8');
            return client.spawnCli([...args.filter(value => value !== '--prompt-file' && value !== promptPath), '-p', prompt], { timeoutMs: client.timeoutMs });
          }
          throw error;
        }
      };
      let parsed;
      let lastError;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await spawnOnce();
          parsed = parse(extractGrokJson(result.stdout || result.stderr));
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          // 只重试格式类失败（无诊断码的解析/校验错误）；认证、额度、超时一律不重试。
          if (error?.code) break;
        }
      }
      if (lastError) throw lastError;
      return parsed;
    } finally {
      await rm(promptPath, { force: true }).catch(() => {});
    }
  },
  exitError(client, { stdout, stderr, code }) {
    const output = stderr || stdout || '';
    if (client.promptFileSupported && /--prompt-file/i.test(output) && /unknown|unexpected|unrecognized|invalid option/i.test(output)) client.promptFileSupported = false;
    return errorWithDiagnostic(publicGrokError({ message: output || 'Grok CLI 已退出。', code }), grokErrorCode({ message: output }), { exitCode: Number.isInteger(code) && code >= 0 ? code : 0 });
  },
  publicError: error => publicGrokError(error),
  errorCode: error => grokErrorCode(error),
  parseClassification: value => parseClassification(value),
  beforeClose: client => client.stopLogin(),
};

export class GrokClient extends CliClient {
  constructor({ grokPath, dataDir, timeoutMs = DEFAULT_TIMEOUT_MS, spawnImpl = spawn, diagnostic = null }) {
    if (!grokPath || !dataDir) throw new TypeError('grokPath 和 dataDir 为必填项');
    super({ cliPath: resolve(grokPath), dataDir: resolve(dataDir), timeoutMs, spawnImpl, diagnostic, provider: 'grok', hooks: grokHooks });
    this.grokHome = join(this.dataDir, 'grok');
    this.loginChild = null;
    this.loginAuthUrl = null;
    this.loginUserCode = null;
    this.promptFileSupported = true;
  }

  async readAccount() {
    try {
      const raw = await readFile(join(this.grokHome, 'auth.json'), 'utf8');
      return parseGrokAccount(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async login() {
    await this.start();
    if (this.loginChild) throw new Error('Grok 登录正在进行中。');
    this.loginAuthUrl = null;
    this.loginUserCode = null;
    this.loginError = null;
    let child;
    try {
      child = this.spawnImpl(this.cliPath, ['login', '--device-auth'], {
        cwd: this.workDir,
        env: this.env(),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch {
      throw errorWithDiagnostic('无法启动 Grok 登录，请检查 Grok CLI 安装。', 'STARTUP_FAILED');
    }
    this.loginChild = child;
    this.emitStatus();
    let output = '';
    const take = (chunk, stream) => {
      if (stream === 'stderr') this.onStderr(chunk);
      output += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      if (output.length > 2 * 1024 * 1024) output = output.slice(-(2 * 1024 * 1024));
      const parsed = parseGrokLoginOutput(output);
      if (parsed.authUrl && !this.loginAuthUrl) {
        const url = trustedAuthUrl(parsed.authUrl);
        if (!url) {
          this.loginError = 'Grok 返回了不受信任的登录地址，已取消登录。';
          this.stopLogin();
          return;
        }
        this.loginAuthUrl = url;
        this.loginUserCode = parsed.userCode || null;
        this.emitStatus();
      } else if (parsed.userCode && parsed.userCode !== this.loginUserCode) {
        this.loginUserCode = parsed.userCode;
        this.emitStatus();
      }
    };
    child.stdout.on('data', chunk => take(chunk, 'stdout'));
    child.stderr.on('data', chunk => take(chunk, 'stderr'));
    const finished = new Promise(resolveExit => {
      child.once('exit', (code, signal) => resolveExit({ code, signal }));
      child.once('error', () => resolveExit({ code: 1, signal: null }));
    });
    finished.then(async ({ code }) => {
      if (this.loginChild !== child) return;
      this.loginChild = null;
      this.loginAuthUrl = null;
      this.loginUserCode = null;
      if (code === 0) {
        this.loginError = null;
        await this.refreshStatus();
      } else {
        this.loginError = this.loginError || 'Grok 登录未完成，请重试。';
        this.account = await this.readAccount();
        this.emitStatus();
      }
    }).catch(() => {});
    const deadline = Date.now() + LOGIN_URL_WAIT_MS;
    while (!this.loginAuthUrl && this.loginChild === child && Date.now() < deadline) {
      await new Promise(resolveWait => setTimeout(resolveWait, 150));
    }
    if (this.loginAuthUrl) return { authUrl: this.loginAuthUrl, userCode: this.loginUserCode };
    if (this.loginChild !== child) {
      if (this.account) return { authUrl: 'https://auth.x.ai/', userCode: null };
      throw new Error(this.loginError || 'Grok 登录未返回官方登录地址。');
    }
    this.stopLogin();
    throw new Error('Grok 未在时限内返回官方登录地址。请更新 Grok CLI 后重试。');
  }

  stopLogin() {
    const child = this.loginChild;
    this.loginChild = null;
    this.loginAuthUrl = null;
    this.loginUserCode = null;
    if (child && !child.killed) {
      try { child.kill('SIGTERM'); } catch { /* already exited */ }
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, 2000).unref?.();
    }
  }

  async cancelLogin() {
    await this.start();
    this.stopLogin();
    this.loginError = null;
    return this.emitStatus();
  }

  async logout() {
    await this.start();
    this.account = null;
    this.authGeneration++;
    this.modelCache = null;
    this.stopLogin();
    this.emitStatus();
    try { await this.spawnCli(['logout'], { timeoutMs: 20_000 }); } catch { /* still clear local auth */ }
    try { await rm(join(this.grokHome, 'auth.json'), { force: true }); } catch { /* ignore */ }
    this.account = null;
    this.loginError = null;
    return this.emitStatus();
  }
}
