/**
 * @file connector/codex.mjs
 * 文件职责：ChatGPT后端——经官方Codex CLI app-server复用订阅权益。
 * 主要内容：隔离CODEX_HOME但保留真实HOME供钥匙串；RPC30s/次、总90s、并发≤3。
 * 模块边界：Node侧；登录态缺失时才复制~/.codex/auth.json。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, chmod, copyFile, mkdir, rename, writeFile } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import {
  SUPPORT_INSTRUCTIONS,SUPPORT_CORRECTION_INSTRUCTIONS,SUPPORT_SCHEMA,normalizeSupportProviderItems,inspectSupportResponse,normalizeSupportCorrections,normalizePreparationContext,
  ASSISTANCE_INSTRUCTIONS,assistanceSchema,normalizeAssistanceRequest,normalizeAssistanceResult,
  EMERGENCY_INSTRUCTIONS,PAGE_TRANSLATION_INSTRUCTIONS,EMERGENCY_SCHEMA,normalizeEmergencyItems,normalizeEmergencyResult,normalizePageTranslationItems,inspectPageTranslationResult,
  PAGE_SUMMARY_INSTRUCTIONS,PAGE_SUMMARY_SCHEMA,normalizePageSummaryResult,
} from '../extension/gloss.mjs';
import {diagnosticError} from '../extension/diagnostics.mjs';
import {SENTENCE_GROUPS_INSTRUCTIONS,SENTENCE_GROUPS_SCHEMA,normalizeSentenceGroupItems,prepareSentenceGroupItems,normalizeSentenceGroupResponse} from '../extension/sentence-groups.mjs';
import {assistanceProgress,translationProgress} from '../extension/assistance-stream.mjs';
import {SUMMARY_INSTRUCTIONS,SUMMARY_SCHEMA,PERSONALIZATION_INSTRUCTIONS,PERSONALIZATION_SCHEMA} from '../extension/personalization.mjs';
import {
  DEFAULT_TIMEOUT_MS,MAX_WORK_ITEMS,MAX_CACHED_MODELS,STDERR_REPORT_INTERVAL_MS,DOMAINS,
  CLASSIFICATION_SCHEMA,CLASSIFIER_INSTRUCTIONS,
  normalizePreferences,errorWithDiagnostic,stderrCategory,
} from './cli-client.mjs';
const RPC_LINE_LIMIT = 8 * 1024 * 1024;
const MAX_MODEL_PAGES = 10;
const ASSIST_CONTENT_LIMIT = 24_000;


export function buildCodexConfig() {
  return [
    '# Generated for the isolated RoamCat connector.',
    'forced_login_method = "chatgpt"',
    'cli_auth_credentials_store = "auto"',
    'approval_policy = "never"',
    'sandbox_mode = "read-only"',
    'allow_login_shell = false',
    'web_search = "disabled"',
    'check_for_update_on_startup = false',
    'include_apps_instructions = false',
    'project_doc_max_bytes = 0',
    '', '[analytics]', 'enabled = false',
    '', '[feedback]', 'enabled = false',
    '', '[apps._default]',
    'enabled = false',
    'destructive_enabled = false',
    'open_world_enabled = false',
    '', '[features]',
    'apps = false',
    'auth_elicitation = false',
    'browser_use = false',
    'browser_use_external = false',
    'browser_use_full_cdp_access = false',
    'code_mode = false',
    'code_mode_host = false',
    'computer_use = false',
    'goals = false',
    'hooks = false',
    'image_generation = false',
    'in_app_browser = false',
    'in_app_local_automation = false',
    'memories = false',
    'multi_agent = false',
    'multi_agent_v2 = false',
    'plugin_sharing = false',
    'plugins = false',
    'remote_plugin = false',
    'shell_snapshot = false',
    'shell_tool = false',
    'unified_exec = false',
    'skill_mcp_dependency_install = false',
    'skip_host_skill_discovery = true',
    'skill_search = false',
    'sleep_tool = false',
    'tool_call_mcp_elicitation = false',
    'tool_suggest = false',
    'view_image = false',
    'workspace_dependencies = false',
    '',
  ].join("\n");
}

export function buildCodexEnv({ codexPath, codexHome, tmpDir }) {
  const isWin = process.platform === "win32";
  const pathEntries = [...new Set([
    dirname(codexPath),
    dirname(process.execPath),
    isWin ? (process.env.SystemRoot && join(process.env.SystemRoot, "System32")) : "/usr/bin",
    isWin ? undefined : "/bin",
    isWin ? undefined : "/usr/sbin",
    isWin ? undefined : "/sbin",
  ].filter(Boolean))];
  const env = {
    CODEX_HOME: codexHome,
    // System keychain discovery needs the real HOME; Codex data and document discovery stay isolated.
    HOME: homedir(),
    LANG: "en_US.UTF-8",
    PATH: pathEntries.join(delimiter),
    TMPDIR: tmpDir,
  };
  if (isWin) {
    env.USERPROFILE = homedir();
    env.APPDATA = process.env.APPDATA || "";
    env.LOCALAPPDATA = process.env.LOCALAPPDATA || "";
    env.SYSTEMROOT = process.env.SYSTEMROOT || process.env.SystemRoot || "";
    env.WINDIR = process.env.WINDIR || env.SYSTEMROOT;
    env.PATHEXT = process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM";
    env.TEMP = tmpDir;
    env.TMP = tmpDir;
  }
  return env;
}

export function buildThreadStartParams(workDir, model = "", baseInstructions = "") {
  const params = {
    approvalPolicy: "never",
    baseInstructions,
    cwd: workDir,
    ephemeral: true,
    sandbox: "read-only",
  };
  if (model) {
    params.model = model;
    params.allowProviderModelFallback = false;
  }
  return params;
}


export function buildClassificationTurnStartParams(threadId, text, title = "", effort = "none") {
  return buildStructuredTurnParams(threadId, JSON.stringify({title,source:text}), CLASSIFICATION_SCHEMA, effort);
}


function buildStructuredTurnParams(threadId, text, outputSchema, effort) {
  return {
    threadId,
    input: [{ type: "text", text }],
    approvalPolicy: "never",
    sandboxPolicy: { type: "readOnly" },
    outputSchema,
    ...(effort ? {effort} : {}),
  };
}

function publicRpcError(error, method = '') {
  const info = error?.data?.codexErrorInfo ?? error?.codexErrorInfo;
  const name = typeof info === 'string' ? info : info && typeof info === 'object' ? Object.keys(info)[0] : '';
  const known = /^(contextWindowExceeded|sessionBudgetExceeded|usageLimitExceeded|rateLimitExceeded|serverOverloaded|internalServerError|unauthorized|badRequest|sandboxError|httpConnectionFailed|responseStreamConnectionFailed|responseStreamDisconnected|responseTooManyFailedAttempts|other)$/.test(name) ? name : '';
  const upstreamStatus = info && typeof info === 'object' ? info[name]?.httpStatusCode : null;
  const httpStatus = Number.isInteger(upstreamStatus) && upstreamStatus >= 100 && upstreamStatus <= 599 ? upstreamStatus : null;
  const joined = (String(error?.message ?? '')+' '+known).toLowerCase();
  let category = 'request_failed', message = 'Codex 请求失败，请根据错误代码检查服务或连接器。';
  if (/invalid.{0,40}schema|schema.{0,80}(invalid|must|unsupported)|json_schema|response_format|outputschema/.test(joined)) {
    category = 'invalid_output_schema'; message = '结构化输出格式被 Codex 拒绝，请更新扩展与本机连接器。';
  } else if (/contextwindowexceeded|sessionbudgetexceeded|context.{0,20}(length|limit|exceed)/.test(joined)) {
    category = 'context_limit'; message = '请求超过模型的上下文限制，请选择更短内容。';
  } else if (httpStatus === 429 || /rate.?limit|quota|usage.?limit|insufficient.?quota|credits/.test(joined)) {
    category = 'usage_limit'; message = 'ChatGPT 使用额度已达上限，请稍后重试或检查订阅额度。';
  } else if (httpStatus === 401 || /unauthori[sz]ed|authentication|not logged in|login required|sign.?in|(?:invalid|expired)[ _-](?:access[ _-])?token|credential/.test(joined)) {
    category = 'authentication'; message = 'ChatGPT 登录已失效，请重新连接。';
  } else if (/(?:reasoning|effort).{0,60}(?:none).{0,60}(?:not supported|unsupported|invalid)|(?:none).{0,60}(?:reasoning|effort).{0,60}(?:not supported|unsupported|invalid)/.test(joined)) {
    category = 'reasoning_not_disabled'; message = '当前模型不支持关闭思考，已停止请求；不会降低到其他思考档位。';
  } else if (/model.{0,100}(not supported|not available|does not exist)|unsupported.{0,20}model|model_not_found/.test(joined)) {
    category = 'unsupported_model'; message = '当前模型不支持这类请求，请在服务设置中选择可用的辅助模型。';
  } else if (error?.code === -32601) {
    category = 'unsupported_rpc'; message = '当前 Codex CLI 不支持连接器调用的接口，请更新 Codex CLI。';
  } else if (error?.code === -32602 || known === 'badRequest' || httpStatus === 400) {
    category = 'invalid_request'; message = 'Codex 拒绝了请求参数，请更新扩展与本机连接器。';
  } else if ((httpStatus !== null && httpStatus >= 500) || /serveroverloaded|internalservererror/.test(joined)) {
    category = 'upstream_unavailable'; message = 'Codex 上游服务暂时不可用，请稍后重试。';
  }
  // Do not echo upstream text: it can contain selected text, URLs, or credentials.
  const details = [category,method,known].filter(Boolean);
  if (Number.isSafeInteger(error?.code)) details.push('RPC '+error.code);
  if (httpStatus !== null) details.push('HTTP '+httpStatus);
  return message+'（'+details.join('; ')+'）';
}

function rpcErrorCode(error) {
  const info = error?.data?.codexErrorInfo ?? error?.codexErrorInfo;
  const name = typeof info === 'string' ? info : info && typeof info === 'object' ? Object.keys(info)[0] : '';
  const status = info && typeof info === 'object' ? info[name]?.httpStatusCode : null;
  const text = String(error?.message ?? '').toLowerCase();
  if (status === 429 || /rate.?limit|quota|usage.?limit/.test(text)) return 'RATE_LIMIT';
  if (status === 401 || /unauthori[sz]ed|authentication|login required/.test(text)) return 'AUTH';
  if (/schema|response_format|outputschema/.test(text)) return 'OUTPUT_INVALID';
  if (Number.isInteger(status) && status >= 500) return 'HTTP';
  return 'NATIVE_RPC';
}

function parseClassification(value) {
  if (value && DOMAINS.has(value.domain)) return { domain: value.domain, source: "chatgpt" };
  throw new Error("Codex 返回的领域分类格式无效，请重试。");
}


function parseStructuredOutput(text, parse, raw = false) {
  if(raw)return parse(text);
  try { return parse(JSON.parse(text)); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error("Codex 返回的结构化结果无效，请重试。");
    throw error;
  }
}

export class CodexClient extends EventEmitter {
  constructor({ codexPath, dataDir, timeoutMs = DEFAULT_TIMEOUT_MS, spawnImpl = spawn, diagnostic = null }) {
    super();
    if (!codexPath || !dataDir) throw new TypeError("codexPath 和 dataDir 为必填项");
    this.codexPath = resolve(codexPath);
    this.dataDir = resolve(dataDir);
    this.codexHome = join(this.dataDir, "codex");
    this.workDir = join(this.dataDir, "work");
    this.tmpDir = join(this.dataDir, "tmp");
    this.timeoutMs = timeoutMs;
    this.spawnImpl = spawnImpl;
    this.diagnostic = typeof diagnostic === 'function' ? diagnostic : null;
    this.child = null;
    this.started = null;
    this.stdoutBuffer = "";
    this.nextId = 1;
    this.pending = new Map();
    this.tasks = new Map();
    this.workSlots = 0;
    this.modelCache = null;
    this.modelRefresh = null;
    this.pendingLoginId = null;
    this.loginError = null;
    this.account = null;
    this.stopping = false;
    this.authGeneration = 0;
    this.stderrReports = new Map();
  }

  #record(record) {
    if (!this.diagnostic) return;
    try { Promise.resolve(this.diagnostic({ at: Date.now(), provider: 'chatgpt', ...record })).catch(() => {}); } catch {}
  }

  #context(operation, traceId, model = '') {
    return Object.freeze({ operation, ...(traceId ? { traceId } : {}), ...(model ? { modelRef: createHash('sha256').update(model).digest('hex') } : {}) });
  }

  async start() {
    if (this.started) return this.started;
    this.#record({ operation: 'CONNECTION', stage: 'connection', status: 'start', code: 'NATIVE_START' });
    this.started = this.#start();
    try {
      await this.started;
      this.#record({ operation: 'CONNECTION', stage: 'connection', status: 'ok', code: 'OK' });
    }
    catch (error) {
      this.started = null;
      this.#record({ operation: 'CONNECTION', stage: 'connection', status: 'error', code: 'STARTUP_FAILED' });
      throw error;
    }
  }

  async #start() {
    await Promise.all([
      mkdir(this.codexHome, { recursive: true, mode: 0o700 }),
      mkdir(this.workDir, { recursive: true, mode: 0o700 }),
      mkdir(this.tmpDir, { recursive: true, mode: 0o700 }),
    ]);
    const configPath = join(this.codexHome, "config.toml");
    const temporary = `${configPath}.${process.pid}.tmp`;
    await writeFile(temporary, buildCodexConfig(), { mode: 0o600 });
    await chmod(temporary, 0o600).catch(() => {});
    await rename(temporary, configPath);

    const userAuth = join(homedir(), ".codex", "auth.json");
    const targetAuth = join(this.codexHome, "auth.json");
    try {
      if (await access(userAuth).then(() => true).catch(() => false)) {
        if (!await access(targetAuth).then(() => true).catch(() => false)) {
          await copyFile(userAuth, targetAuth);
          await chmod(targetAuth, 0o600).catch(() => {});
        }
      }
    } catch {}

    // Windows npm 全局的 codex 落盘为 codex.cmd，必须经 shell 才能 spawn（否则 EINVAL）。
    const codexNeedsShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(this.codexPath);
    const child = this.spawnImpl(this.codexPath, ["app-server", "--stdio", "--strict-config"], {
      cwd: this.workDir,
      env: buildCodexEnv({ codexPath: this.codexPath, codexHome: this.codexHome, tmpDir: this.tmpDir }),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      ...(codexNeedsShell ? { shell: true } : {}),
    });
    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => this.#onStdout(chunk));
    child.stderr.on("data", (chunk) => this.#onStderr(chunk));
    child.on("error", () => { if (this.child === child) this.#onExit(); });
    child.on("exit", (code) => { if (this.child === child) this.#onExit(code); });

    await this.#request("initialize", {
      clientInfo: { name: "roamcat_translate", title: "RoamCat", version: "0.0.1" },
      capabilities: { optOutNotificationMethods: ["reasoning/textDelta", "reasoning/summaryTextDelta"] },
    });
    this.#notify("initialized", {});
    try {
      const accountResult = await this.#request("account/read", { refreshToken: false });
      this.account = accountResult?.account?.type === "chatgpt" ? accountResult.account : null;
    } catch (error) {
      this.loginError = publicRpcError(error);
    }
    this.#emitStatus();
  }

  #send(message) {
    if (!this.child?.stdin?.writable) throw new Error("Codex 服务未运行");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #request(method, params, context = null) {
    const id = this.nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.#record({ ...(context ?? { operation: 'CONNECTION' }), stage: 'rpc', status: 'error', code: 'RPC_TIMEOUT', durationMs: 30_000 });
        rejectPromise(errorWithDiagnostic("Codex 服务响应超时，请刷新连接后重试。", 'RPC_TIMEOUT', { durationMs: 30_000 }));
      }, 30_000);
      timer.unref?.();
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer, method, context });
      try { this.#send(params === undefined ? { method, id } : { method, id, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); rejectPromise(error); }
    });
  }

  #notify(method, params) {
    this.#send({ method, params });
  }

  #onStderr(chunk) {
    const bytes = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
    if (!bytes) return;
    const code = stderrCategory(chunk);
    const now = Date.now();
    const report = this.stderrReports.get(code) ?? { bytes: 0, last: 0, timer: null };
    report.bytes = Math.min(100_000_000, report.bytes + bytes);
    const flush = () => {
      report.timer = null;
      if (!report.bytes) return;
      this.#record({ operation: 'CONNECTION', stage: 'stderr', status: 'error', code, stderrBytes: report.bytes });
      report.bytes = 0;
      report.last = Date.now();
    };
    if (now - report.last >= STDERR_REPORT_INTERVAL_MS) flush();
    else if (!report.timer) {
      report.timer = setTimeout(flush, STDERR_REPORT_INTERVAL_MS - (now - report.last));
      report.timer.unref?.();
    }
    this.stderrReports.set(code, report);
  }

  #clearStderrReports() {
    for (const report of this.stderrReports.values()) clearTimeout(report.timer);
    this.stderrReports.clear();
  }

  #onStdout(chunk) {
    this.stdoutBuffer += chunk;
    if (Buffer.byteLength(this.stdoutBuffer) > RPC_LINE_LIMIT && !this.stdoutBuffer.includes("\n")) {
      this.#terminateBroken();
      return;
    }
    for (;;) {
      const newline = this.stdoutBuffer.indexOf("\n");
      if (newline < 0) break;
      const line = this.stdoutBuffer.slice(0, newline);
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (!line.trim()) continue;
      if (Buffer.byteLength(line) > RPC_LINE_LIMIT) { this.#terminateBroken(); return; }
      let message;
      try { message = JSON.parse(line); } catch { this.#terminateBroken(); return; }
      this.#onMessage(message);
    }
  }

  #onMessage(message) {
    if (!message || typeof message !== "object" || Array.isArray(message)) return;
    if (message.id !== undefined && typeof message.method === "string") {
      // Server-initiated approvals must never be mistaken for our RPC replies.
      try { this.#send({ id: message.id, error: { code: -32601, message: "Tools and approvals are disabled in this translation client." } }); } catch {}
      return;
    }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        const info = message.error?.data?.codexErrorInfo ?? message.error?.codexErrorInfo;
        const name = info && typeof info === 'object' ? Object.keys(info)[0] : '';
        const httpStatus = info && typeof info === 'object' ? info[name]?.httpStatusCode : null;
        const detail = Number.isSafeInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? { httpStatus } : {};
        const error = errorWithDiagnostic(publicRpcError(message.error, pending.method), rpcErrorCode(message.error), detail);
        this.#record({ ...(pending.context ?? { operation: 'CONNECTION' }), stage: 'rpc', status: 'error', code: error.code, ...detail });
        pending.reject(error);
      } else pending.resolve(message.result);
      return;
    }
    if (typeof message.method !== "string") return;
    const params = message.params ?? {};
    if (message.method === "account/updated") {
      void this.refreshStatus().catch(() => {});
    } else if (message.method === "account/login/completed") {
      if (this.pendingLoginId && params.loginId === this.pendingLoginId) {
        this.pendingLoginId = null;
        this.loginError = params.success ? null : "ChatGPT 登录未完成，请重试。";
        void this.refreshStatus().catch(() => this.#emitStatus());
      }
    } else if (message.method === "item/started") {
      this.#startAgentMessage(params);
    } else if (message.method === "item/agentMessage/delta") {
      this.#appendAgentMessage(params);
    } else if (message.method === "item/completed") {
      this.#completeAgentMessage(params);
    } else if (message.method === "turn/completed") {
      this.#completeTurn(params);
    }
  }

  #streamFor(params, create = false) {
    const active = this.tasks.get(params.threadId);
    if (!active?.onProgress || typeof params.turnId !== 'string' || !params.turnId) return null;
    let stream = active.streams.get(params.turnId);
    if (!stream && create && active.streams.size < 4) {
      stream = { itemId: null, text: '', firstDeltaAt:0 };
      active.streams.set(params.turnId, stream);
    }
    return stream ? { active, stream } : null;
  }

  #startAgentMessage(params) {
    if (params.item?.type !== 'agentMessage' || typeof params.item.id !== 'string' || !params.item.id) return;
    const state = this.#streamFor(params, true);
    if (state && state.stream.itemId === null) state.stream.itemId = params.item.id;
  }

  #appendAgentMessage(params) {
    if (typeof params.itemId !== 'string' || !params.itemId || typeof params.delta !== 'string' || !params.delta) return;
    const state = this.#streamFor(params);
    if (!state || state.stream.itemId !== params.itemId) return;
    const {active,stream} = state;
    if (active.turnId && active.turnId !== params.turnId) return;
    if (!stream.firstDeltaAt) stream.firstDeltaAt = Date.now();
    if (stream.text.length + params.delta.length > ASSIST_CONTENT_LIMIT) {
      if (!active.turnId) { active.streams.delete(params.turnId); return; }
      active.reject(new Error('Codex 返回的帮助内容过长。'));
      void this.#request('turn/interrupt', {threadId:active.threadId,turnId:active.turnId}, active.context).catch(()=>{});
      this.#finishTask(active.threadId);
      return;
    }
    stream.text += params.delta;
    if (active.turnId === params.turnId) this.#emitTaskProgress(active,stream);
  }

  #emitTaskProgress(active,stream) {
    if (!active.firstContent && stream.firstDeltaAt) {
      active.firstContent = true;
      this.#record({ ...active.context, stage: 'first_content', status: 'ok', code: 'OK', durationMs: stream.firstDeltaAt - active.startedAt });
    }
    const progress = active.translationItems
      ? translationProgress(stream.text,active.translationItems)
      : assistanceProgress(stream.text,active.assistanceRequest,{envelope:'result'});
    if (!progress || (!active.translationItems && !Object.keys(progress).length)) return;
    const signature = JSON.stringify(progress);
    if (signature === active.lastProgress) return;
    active.lastProgress = signature;
    try { Promise.resolve(active.onProgress(progress)).catch(()=>{}); } catch {}
  }

  #completeAgentMessage(params) {
    if (params.item?.type !== 'agentMessage' || typeof params.item.text !== 'string' || typeof params.turnId !== 'string' || !params.turnId) return;
    const active = this.tasks.get(params.threadId);
    if (!active || (active.turnId && params.turnId !== active.turnId)) return;
    if (active.onProgress) {
      const state = this.#streamFor(params, true);
      const itemId = typeof params.item.id === 'string' && params.item.id ? params.item.id : null;
      if (!state || (state.stream.itemId && state.stream.itemId !== itemId)) return;
      if (!state.stream.itemId) state.stream.itemId = itemId;
      if (active.translationItems) {
        state.stream.text = params.item.text;
        if (active.turnId === params.turnId) this.#emitTaskProgress(active,state.stream);
      }
    }
    active.finalTexts.set(params.turnId,params.item.text);
    if (active.turnId === params.turnId) active.finalText = params.item.text;
  }
  #completeTurn(params) {
    const active = this.tasks.get(params.threadId);
    if (!active) return;
    if (!active.turnId) {
      const turnId=params.turn?.id;
      if (typeof turnId==='string' && turnId && active.completedTurns.size<4) active.completedTurns.set(turnId,params);
      return;
    }
    if (params.turn?.id !== active.turnId) return;
    if (params.turn.status === "completed") {
      try { active.resolve(parseStructuredOutput(active.finalText, active.parse, active.rawOutput)); }
      catch (error) {
        this.#record({ ...active.context, stage: 'validation', status: 'error', ...diagnosticError(error) });
        active.reject(error);
      }
    } else if (params.turn.status === "interrupted") {
      active.reject(errorWithDiagnostic("请求已取消。", 'CANCELLED'));
    } else {
      const info = params.turn.error?.codexErrorInfo;
      const name = info && typeof info === 'object' ? Object.keys(info)[0] : '';
      const httpStatus = info && typeof info === 'object' ? info[name]?.httpStatusCode : null;
      const detail = Number.isSafeInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? { httpStatus } : {};
      const error = errorWithDiagnostic(publicRpcError(params.turn.error,"turn/completed"), 'TURN_FAILED', detail);
      this.#record({ ...active.context, stage: 'provider', status: 'error', code: 'TURN_FAILED', ...detail });
      active.reject(error);
    }
    this.#finishTask(params.threadId);
  }

  async refreshStatus() {
    await this.start();
    const previousAccount = this.account;
    try {
      const result = await this.#request("account/read", { refreshToken: false });
      this.account = result?.account?.type === "chatgpt" ? result.account : null;
      if (this.account) this.loginError = null;
    } catch (error) {
      this.account = null;
      this.loginError = publicRpcError(error);
    }
    if (Boolean(previousAccount) !== Boolean(this.account) || (previousAccount?.email ?? null) !== (this.account?.email ?? null)) {
      this.authGeneration++;
      this.modelCache = null;
      if (!this.account) await this.#interruptAll("请求已因账户状态变化而取消。");
    }
    return this.#emitStatus();
  }



  status() {
    return {
      connected: Boolean(this.child && !this.child.killed),
      authenticated: Boolean(this.account),
      email: this.account?.email ?? null,
      plan: this.account?.planType ?? null,
      loginPending: Boolean(this.pendingLoginId),
      error: this.loginError,
    };
  }

  #emitStatus() {
    const status = this.status();
    this.emit("status", status);
    return status;
  }

  async login() {
    await this.start();
    if (this.pendingLoginId) throw new Error("ChatGPT 登录正在进行中。");
    const result = await this.#request("account/login/start", {
      type: "chatgpt",
      useHostedLoginSuccessPage: true,
      appBrand: "chatgpt",
    });
    const url = new URL(result?.authUrl);
    if (url.protocol !== "https:" || url.hostname !== "auth.openai.com" || url.port || url.username || url.password) {
      if (result?.loginId) await this.#request("account/login/cancel", { loginId: result.loginId }).catch(() => {});
      throw new Error("Codex 返回了不受信任的登录地址，已取消登录。", { cause: "UNTRUSTED_AUTH_URL" });
    }
    this.pendingLoginId = result.loginId;
    this.loginError = null;
    this.#emitStatus();
    return { authUrl: url.href };
  }

  async cancelLogin() {
    await this.start();
    const loginId = this.pendingLoginId;
    this.pendingLoginId = null;
    if (loginId) await this.#request("account/login/cancel", { loginId });
    this.loginError = null;
    return this.#emitStatus();
  }

  async logout() {
    await this.start();
    this.account = null;
    this.authGeneration++;
    this.modelCache = null;
    this.#emitStatus();
    await this.#interruptAll("请求已因退出登录而取消。");
    const loginId = this.pendingLoginId;
    this.pendingLoginId = null;
    if (loginId) await this.#request("account/login/cancel", { loginId }).catch(() => {});
    await this.#request("account/logout");
    this.account = null;
    this.loginError = null;
    return this.#emitStatus();
  }

  async listModels({ refresh = false } = {}) {
    await this.start();
    if (!this.account) throw new Error("请先连接 ChatGPT 订阅。", { cause: "AUTH_REQUIRED" });
    if (!refresh && this.modelCache) return this.modelCache.map(model => ({ ...model, supportedReasoningEfforts: model.supportedReasoningEfforts ? [...model.supportedReasoningEfforts] : undefined }));
    if (!this.modelRefresh) {
      const generation = this.authGeneration;
      this.modelRefresh = this.#loadModels(generation).finally(() => { this.modelRefresh = null; });
    }
    const models = await this.modelRefresh;
    return models.map(model => ({ ...model, supportedReasoningEfforts: model.supportedReasoningEfforts ? [...model.supportedReasoningEfforts] : undefined }));
  }

  async #loadModels(generation) {
    const models = [];
    const seenCursors = new Set();
    let cursor = null;
    for (let page = 0; page < MAX_MODEL_PAGES; page++) {
      const result = await this.#request("model/list", { cursor, includeHidden: false, limit: 100 });
      if (generation !== this.authGeneration || !this.account || this.stopping) throw new Error("模型列表已因账户状态变化而取消。");
      if (!Array.isArray(result?.data)) throw new Error("Codex 返回的模型列表格式无效，请更新本地连接器。");
      for (const item of result.data) {
        if (item?.hidden === true || typeof item?.id !== "string" || !item.id || typeof item?.displayName !== "string") continue;
        const efforts = Array.isArray(item.supportedReasoningEfforts)
          ? item.supportedReasoningEfforts.map(option => option?.reasoningEffort).filter(value => typeof value === "string" && value)
          : [];
        models.push({ id: item.id, name: item.displayName, isDefault: item.isDefault === true, ...(efforts.length ? { supportedReasoningEfforts: efforts } : {}) });
        if (models.length >= MAX_CACHED_MODELS) break;
      }
      if (models.length >= MAX_CACHED_MODELS || !result.nextCursor) break;
      if (typeof result.nextCursor !== "string" || seenCursors.has(result.nextCursor)) throw new Error("Codex 返回了无效的模型分页信息。");
      seenCursors.add(result.nextCursor);
      cursor = result.nextCursor;
    }
    if (!models.length) throw new Error("当前 ChatGPT 订阅没有可用模型。");
    this.modelCache = models;
    return models;
  }

  async #validateModel(model) {
    if (typeof model !== "string" || !model || model.length > 200) throw new Error("请选择一个可用的 ChatGPT 模型。");
    const models = await this.listModels();
    if (!models.some(item => item.id === model)) throw new Error(`所选模型“${model}”当前不可用。请刷新模型列表后重新选择。`);
  }
  async #noReasoningEffort(model) {
    const models = await this.listModels();
    const selected = model ? models.find(item => item.id === model) : models.find(item => item.isDefault);
    if (model && !selected) throw new Error(`所选模型“${model}”当前不可用。请刷新模型列表后重新选择。`);
    if (!selected) throw new Error('当前没有可用的 ChatGPT 模型。');
    const efforts = Array.isArray(selected.supportedReasoningEfforts) ? selected.supportedReasoningEfforts : [];
    if (efforts.includes('none')) return 'none';
    if (efforts.includes('low')) return 'low';
    if (efforts.length > 0) return efforts[0];
    return 'none';
  }


  async classify({ text, title = "", model }, { traceId } = {}) {
    if (typeof text !== "string" || !text.trim() || text.length > 6000) throw new Error("分类正文须为 1–6000 个字符。");
    if (typeof title !== "string" || title.length > 1000) throw new Error("网页标题过长。");
    await this.#validateModel(model);
    const context = this.#context('RESOLVE_DOMAIN', traceId, model);
    return this.#runTask({ context, model, baseInstructions: CLASSIFIER_INSTRUCTIONS, prepare:()=>this.#noReasoningEffort(model), turnParams: (threadId,effort) => buildClassificationTurnStartParams(threadId, text, title, effort), parse: parseClassification });
  }

  async supportBatch({items,model='',article,personalization,corrections=[]}, {traceId}={}) {
    const selected=normalizeSupportProviderItems(items),context=normalizePreparationContext(article),preferences=normalizePreferences(personalization),issues=normalizeSupportCorrections(corrections,selected);
    const effort=await this.#noReasoningEffort(model);
    const providerItems=selected.map(item=>({...item,candidates:item.candidates.map(({text,evidence,knownSenses})=>({text,...(evidence?{evidence}:{}),...(knownSenses?{knownSenses}:{})}))}));
    return this.#runTask({context:this.#context('SUPPORT_BATCH',traceId,model),model,baseInstructions:issues.length?SUPPORT_CORRECTION_INSTRUCTIONS:SUPPORT_INSTRUCTIONS,
      turnParams:threadId=>buildStructuredTurnParams(threadId,JSON.stringify({items:providerItems,article:context,...(issues.length?{corrections:issues}:{}),...(preferences?{personalization:preferences}:{})}),SUPPORT_SCHEMA,effort),
      parse:value=>inspectSupportResponse(value,selected,context)});
  }

  async assist({model='',personalization,...request},{traceId,onProgress}={}) {
    const selected=normalizeAssistanceRequest(request),preferences=normalizePreferences(personalization);
    return this.#runTask({context:this.#context('ASSIST',traceId,model),model,baseInstructions:ASSISTANCE_INSTRUCTIONS+'\nPut the assistance object in result.',
      prepare:()=>this.#noReasoningEffort(model),
      turnParams:(threadId,effort)=>buildStructuredTurnParams(threadId,JSON.stringify({...selected,...(preferences?{personalization:preferences}:{})}),assistanceSchema(selected),effort),
      parse:value=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!Object.hasOwn(value,'result'))throw new Error('Codex 返回的帮助结果封装无效。');return normalizeAssistanceResult(value.result,selected);},
      ...(typeof onProgress==='function'?{onProgress,assistanceRequest:selected}:{})});
  }

  async sentenceGroups({items,model=''},{traceId}={}) {
    const selected=normalizeSentenceGroupItems(items),effort=await this.#noReasoningEffort(model);
    return this.#runTask({context:this.#context('SENTENCE_GROUPS_BATCH',traceId,model),model,baseInstructions:SENTENCE_GROUPS_INSTRUCTIONS,
      turnParams:threadId=>buildStructuredTurnParams(threadId,JSON.stringify({items:prepareSentenceGroupItems(selected)}),SENTENCE_GROUPS_SCHEMA,effort),parse:value=>normalizeSentenceGroupResponse(value,selected)});
  }

  async emergencyTranslate({scope,items,model='',personalization},{traceId,onProgress}={}) {
    if(scope!=='page'&&scope!=='passage')throw new Error('翻译范围无效。');
    const page=scope==='page',selected=page?normalizePageTranslationItems(items):normalizeEmergencyItems(items),preferences=normalizePreferences(personalization),effort=await this.#noReasoningEffort(model);
    return this.#runTask({context:this.#context('EMERGENCY_TRANSLATE',traceId,model),model,baseInstructions:page?PAGE_TRANSLATION_INSTRUCTIONS:EMERGENCY_INSTRUCTIONS,
      turnParams:threadId=>buildStructuredTurnParams(threadId,JSON.stringify({items:selected,...(preferences?{personalization:preferences}:{})}),EMERGENCY_SCHEMA,effort),parse:value=>page?inspectPageTranslationResult(value,selected):normalizeEmergencyResult(value,selected),rawOutput:page,
      ...(typeof onProgress==='function'?{onProgress,translationItems:selected}:{})});
  }

  async historyModel({kind,payload,model=''},{traceId}={}) {
    if(!['summary','personalization'].includes(kind)||!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('历史模型请求无效。');
    const instructions=kind==='summary'?SUMMARY_INSTRUCTIONS:PERSONALIZATION_INSTRUCTIONS;
    const schema=kind==='summary'?SUMMARY_SCHEMA:PERSONALIZATION_SCHEMA;
    const effort=await this.#noReasoningEffort(model);
    return this.#runTask({context:this.#context(kind==='summary'?'HISTORY_SUMMARY':'PERSONALIZATION_ANALYZE',traceId,model),model,baseInstructions:instructions,
      turnParams:threadId=>buildStructuredTurnParams(threadId,JSON.stringify(payload),schema,effort),parse:value=>{
        if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('历史模型返回格式无效。');return value;
      }});
  }

  async summarize({title='',text='',url='',model=''},{traceId}={}) {
    const sample = `${title ? '# ' + title + '\n\n' : ''}${text}`.slice(0, 15000);
    const effort = await this.#noReasoningEffort(model);
    return this.#runTask({
      context: this.#context('PAGE_SUMMARY', traceId, model),
      model,
      baseInstructions: PAGE_SUMMARY_INSTRUCTIONS,
      turnParams: threadId => buildStructuredTurnParams(threadId, JSON.stringify({ title, sample }), PAGE_SUMMARY_SCHEMA, effort),
      parse: value => normalizePageSummaryResult(value)
    });
  }
  async #runTask({ context, model, baseInstructions, turnParams, parse, prepare = null, onProgress = null, assistanceRequest = null, translationItems = null, rawOutput = false }) {
    await this.start();
    if (!this.account) throw new Error("请先连接 ChatGPT 订阅。", { cause: "AUTH_REQUIRED" });
    if (this.workSlots >= MAX_WORK_ITEMS) throw new Error("当前订阅任务较多，请稍后重试。");
    this.workSlots += 1;
    let threadId;
    const generation = this.authGeneration;
    try {
      const preparedPromise = (prepare ? Promise.resolve().then(prepare) : Promise.resolve(undefined))
        .then(value=>({value}),error=>({error}));
      const threadResult = await this.#request("thread/start", buildThreadStartParams(this.workDir, model, baseInstructions), context);
      threadId = threadResult?.thread?.id;
      if (!threadId) throw new Error("Codex 无法创建处理会话。");
      const preparation = await preparedPromise;
      if (preparation.error) throw preparation.error;
      const prepared = preparation.value;
      if (generation !== this.authGeneration || this.stopping) throw new Error("请求已因账户状态变化而取消。");
      let resolveResult;
      let rejectResult;
      const resultPromise = new Promise((resolvePromise, rejectPromise) => { resolveResult = resolvePromise; rejectResult = rejectPromise; });
      resultPromise.catch(() => {});
      const timer = setTimeout(() => {
        const active = this.tasks.get(threadId);
        if (!active) return;
        this.#record({ ...context, stage: 'provider', status: 'error', code: 'TIMEOUT', durationMs: this.timeoutMs });
        active.reject(errorWithDiagnostic("订阅请求超时，请重试。", 'TIMEOUT', { durationMs: this.timeoutMs }));
        if (active.turnId) void this.#request("turn/interrupt", { threadId, turnId: active.turnId }, context).catch(() => {});
        this.#finishTask(threadId);
      }, this.timeoutMs);
      timer.unref?.();
      const active = { context, threadId, turnId: null, finalText: null, finalTexts:new Map(), completedTurns:new Map(), timer, resolve: resolveResult, reject: rejectResult, parse, rawOutput, onProgress, assistanceRequest, translationItems, streams:new Map(), lastProgress:'', firstContent:false, startedAt:Date.now() };
      this.tasks.set(threadId, active);
      void this.#request("turn/start", turnParams(threadId,prepared), context).then(turnResult => {
        const turnId = turnResult?.turn?.id;
        if (!this.tasks.has(threadId)) {
          if (turnId) void this.#request("turn/interrupt", { threadId, turnId }).catch(() => {});
          return;
        }
        if (!turnId) throw new Error("Codex 无法启动请求。");
        active.turnId = turnId;
        active.finalText = active.finalTexts.get(turnId) ?? null;
        for (const candidate of active.streams.keys()) if (candidate !== turnId) active.streams.delete(candidate);
        const stream = active.streams.get(turnId);
        if (stream) this.#emitTaskProgress(active,stream);
        const completed=active.completedTurns.get(turnId);
        if (completed) this.#completeTurn(completed);
      }).catch(error => { active.reject(error); this.#finishTask(threadId); });
      return resultPromise;
    } catch (error) {
      if (threadId && this.tasks.has(threadId)) this.#finishTask(threadId);
      else {
        this.workSlots = Math.max(0, this.workSlots - 1);
        if (threadId) void this.#request("thread/unsubscribe", { threadId }).catch(() => {});
      }
      throw error;
    }
  }

  #finishTask(threadId) {
    const active = this.tasks.get(threadId);
    if (!active) return;
    clearTimeout(active.timer);
    this.tasks.delete(threadId);
    this.workSlots = Math.max(0, this.workSlots - 1);
    void this.#request("thread/unsubscribe", { threadId }).catch(() => {});
  }

  async #interruptAll(message) {
    const active = [...this.tasks.values()];
    for (const item of active) {
      item.reject(new Error(message));
      if (item.turnId) void this.#request("turn/interrupt", { threadId: item.threadId, turnId: item.turnId }).catch(() => {});
      this.#finishTask(item.threadId);
    }
  }

  #terminateBroken() {
    this.loginError = "Codex 服务返回了无效数据，连接已关闭。";
    this.child?.kill("SIGTERM");
    this.#onExit();
  }

  #onExit(exitCode) {
    if (!this.child) return;
    this.child = null;
    this.#clearStderrReports();
    this.#record({ operation: 'CONNECTION', stage: 'connection', status: this.stopping ? 'ok' : 'error', code: 'CODEX_EXIT', ...(Number.isSafeInteger(exitCode) && exitCode >= 0 ? { exitCode } : {}) });
    const error = errorWithDiagnostic("Codex 服务已断开。", 'DISCONNECTED');
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    for (const active of this.tasks.values()) {
      clearTimeout(active.timer);
      active.reject(error);
    }
    this.tasks.clear();
    this.workSlots = 0;
    this.account = null;
    this.pendingLoginId = null;
    this.stdoutBuffer = "";
    this.authGeneration++;
    this.modelCache = null;
    if (!this.stopping) {
      this.started = null;
      this.loginError = error.message;
      this.#emitStatus();
    }
  }

  async close() {
    this.stopping = true;
    this.authGeneration++;
    await this.#interruptAll("翻译已取消。");
    const child = this.child;
    if (!child) return;
    const exited = new Promise(resolveExit => child.once("exit", resolveExit));
    const killTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
    child.kill("SIGTERM");
    await exited;
    clearTimeout(killTimer);
    if (this.child === child) this.#onExit();
  }
}
