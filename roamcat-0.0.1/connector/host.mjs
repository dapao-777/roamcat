#!/usr/bin/env node
/**
 * @file connector/host.mjs
 * 文件职责：NativeMessaging宿主——stdio帧编解码、来源校验与13种请求分发。
 * 主要内容：4字节长度前缀+UTF8 JSON上限1MB；extensionOrigin白名单；另有只在宿主处理的 pairingToken
 *   （把常驻服务的配对令牌交给扩展，不拉起 CLI）；CLI 在第一条业务请求到达时才启动。
 * 模块边界：Node侧入口；shebang须保持首行，本头紧随其后。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import { readdir, readFile, stat } from "node:fs/promises";
import { endianness } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CodexClient } from "./codex.mjs";
import { GrokClient } from "./grok.mjs";
import { AntigravityClient } from "./antigravity.mjs";
import { DiagnosticStore } from "./diagnostics.mjs";
import { readPairingToken } from "./pairing.mjs";
import { diagnosticError, validTraceId } from "../extension/diagnostics.mjs";

export const MAX_NATIVE_MESSAGE_BYTES = 1024 * 1024;
const READ_UINT32 = endianness() === "LE" ? "readUInt32LE" : "readUInt32BE";
const WRITE_UINT32 = endianness() === "LE" ? "writeUInt32LE" : "writeUInt32BE";

export class NativeMessageDecoder {
  constructor({ maxBytes = MAX_NATIVE_MESSAGE_BYTES, onMessage, onError }) {
    this.maxBytes = maxBytes;
    this.onMessage = onMessage;
    this.onError = onError;
    this.buffer = Buffer.alloc(0);
    this.failed = false;
  }

  push(chunk) {
    if (this.failed || !Buffer.isBuffer(chunk)) return;
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    for (;;) {
      if (this.buffer.length < 4) return;
      const length = this.buffer[READ_UINT32](0);
      if (length === 0 || length > this.maxBytes) return this.#fail(new Error("原生消息长度无效"));
      if (this.buffer.length < length + 4) return;
      const body = this.buffer.subarray(4, length + 4);
      this.buffer = this.buffer.subarray(length + 4);
      let message;
      try { message = JSON.parse(body.toString("utf8")); }
      catch { return this.#fail(new Error("原生消息 JSON 无效")); }
      if (!message || typeof message !== "object" || Array.isArray(message)) {
        return this.#fail(new Error("原生消息格式无效"));
      }
      this.onMessage(message);
      if (this.failed) return;
    }
  }

  end() {
    if (!this.failed && this.buffer.length !== 0) this.#fail(new Error("原生消息不完整"));
  }

  #fail(error) {
    this.failed = true;
    this.buffer = Buffer.alloc(0);
    this.onError(error);
  }
}

export function encodeNativeMessage(message, maxBytes = MAX_NATIVE_MESSAGE_BYTES) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  if (body.length === 0 || body.length > maxBytes) throw new Error("原生消息过大");
  const frame = Buffer.allocUnsafe(body.length + 4);
  frame[WRITE_UINT32](body.length, 0);
  body.copy(frame, 4);
  return frame;
}

export function validateExtensionOrigin(configured, actual) {
  if (typeof actual !== "string") return false;
  // Chrome 调用方传入的 origin 与安装时写入白名单的 origin 可能一个带结尾斜杠、一个不带；
  // 两侧统一去掉单个结尾斜杠后精确比较，避免形态差异把合法来源误判为未授权。
  const normalize = value => (typeof value === "string" && value.endsWith("/")) ? value.slice(0, -1) : value;
  const list = (Array.isArray(configured) ? configured : [configured]).map(normalize);
  if (!list.includes(normalize(actual))) return false;
  try {
    const url = new URL(actual);
    return url.protocol === "chrome-extension:"
      && /^[a-p]{32}$/.test(url.hostname)
      // Node 的 WHATWG URL 对不带路径的 chrome-extension URL 返回空 pathname；带与不带斜杠都是合法 origin 形态。
      && (url.pathname === "" || url.pathname === "/")
      && !url.username
      && !url.password
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

export function validateRequest(message) {
  const validId = (Number.isSafeInteger(message.id) && message.id >= 0)
    || (typeof message.id === "string" && message.id.length > 0 && message.id.length <= 128);
  if (!validId || typeof message.type !== "string") throw new Error("请求格式无效");
  if (message.payload !== undefined && (!message.payload || typeof message.payload !== "object" || Array.isArray(message.payload))) {
    throw new Error("请求参数无效");
  }
  if (message.traceId !== undefined && !validTraceId(message.traceId)) throw new Error("请求追踪标识无效");
  return { id: message.id, type: message.type, payload: message.payload ?? {}, ...(message.traceId ? { traceId: message.traceId.toLowerCase() } : {}) };
}

// Codex 桌面版把 CLI 放在 OpenAI/Codex/bin/<哈希>/codex.exe，更新后换成新的哈希目录、旧目录里的 codex.exe 随之消失。
// 安装时记下的路径失效时，就在同一个 bin 目录下挑最近更新的 codex.exe，不必重跑安装命令。
export async function resolveCodexPath(recorded) {
  const path = resolve(recorded);
  try { await stat(path); return path; } catch { /* look for a sibling build below */ }
  const binDir = dirname(dirname(path));
  if (!/codex/i.test(basename(binDir) === 'bin' ? dirname(binDir) : '')) return path;
  let best = null;
  try {
    for (const entry of await readdir(binDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(binDir, entry.name, basename(path));
      try { const info = await stat(candidate); if (info.isFile() && (!best || info.mtimeMs > best.mtimeMs)) best = { path: candidate, mtimeMs: info.mtimeMs }; } catch { /* not in this build */ }
    }
  } catch { return path; }
  return best ? best.path : path;
}

// 一次请求的分发：NativeMessaging 宿主与本机常驻服务共用。emit 用于推送进度事件（带请求 id）。
export async function dispatchRequest({ client, diagnostics, request, emit }) {
  switch (request.type) {
    case "sentenceGroups": return client.sentenceGroups(request.payload, { traceId: request.traceId });
    case "status": return client.refreshStatus();
    case "login": return client.login();
    case "cancel": return client.cancelLogin();
    case "logout": return client.logout();
    case "models": return { models: await client.listModels({ refresh: request.payload.refresh === true }) };
    case "classify": return client.classify(request.payload, { traceId: request.traceId });
    case "supportBatch": return client.supportBatch(request.payload, { traceId: request.traceId });
    case "assist": return client.assist(request.payload, {
      traceId: request.traceId,
      onProgress: progress => emit({ event: "assistProgress", id: request.id, data: progress }),
    });
    case "emergencyTranslate": return client.emergencyTranslate(request.payload, {
      traceId: request.traceId,
      onProgress: progress => emit({ event: "translationProgress", id: request.id, data: progress }),
    });
    case "historyModel": return client.historyModel(request.payload, { traceId: request.traceId });
    case "summarize": return client.summarize(request.payload, { traceId: request.traceId });
    case "diagnostics": {
      if (request.payload.action === "append") {
        await diagnostics.appendMany(request.payload.events, { broadcast: false });
      } else if (request.payload.action === "clear") {
        await diagnostics.clear();
      } else if (request.payload.action === "configure") {
        await diagnostics.configure(request.payload.enabled);
      } else throw new Error("诊断同步请求无效");
      return { enabled: diagnostics.enabled, storageError: diagnostics.storageError };
    }
    default: throw new Error("不支持的连接器请求，请更新本地连接器。");
  }
}

// 请求失败时回给扩展的统一形状。
export function failureResponse(id, error) {
  const { code, ...detail } = diagnosticError(error);
  return { id, ok: false, error: typeof error?.message === "string" ? error.message : "连接器请求失败", code, detail };
}

// 只校验并读取后端配置，不比对扩展来源（常驻服务在握手时按自己的白名单校验来源）。
export async function loadBackendConfiguration(configPath) {
  let config;
  try { config = JSON.parse(await readFile(resolve(configPath), "utf8")); }
  catch { throw new Error("无法读取连接器配置"); }
  return normalizeConfiguration(config);
}

async function normalizeConfiguration(config) {
  const backend = config?.backend === "grok" ? "grok" : config?.backend === "antigravity" ? "antigravity" : "chatgpt";
  const cliPath = backend === "grok" ? config?.grokPath : backend === "antigravity" ? config?.agyPath : config?.codexPath;
  if (!config || typeof config !== "object" || Array.isArray(config)
    || typeof cliPath !== "string" || !cliPath
    || typeof config.dataDir !== "string" || !config.dataDir) {
    throw new Error("连接器配置或扩展来源无效");
  }
  // 常驻服务配对令牌文件的位置（安装器写入）；旧配置没有这一项，pairingToken 请求会报“请重新运行安装命令”。
  const pairing = typeof config.serviceTokenFile === "string" && config.serviceTokenFile ? { serviceTokenFile: resolve(config.serviceTokenFile) } : {};
  return backend === "grok"
    ? { backend, grokPath: resolve(cliPath), dataDir: resolve(config.dataDir), ...pairing }
    : backend === "antigravity"
    ? { backend, agyPath: resolve(cliPath), dataDir: resolve(config.dataDir), ...pairing }
    : { backend, codexPath: await resolveCodexPath(cliPath), dataDir: resolve(config.dataDir), ...pairing };
}

export function createBackendClient(configuration, options = {}) {
  return configuration.backend === "grok" ? new GrokClient({ ...configuration, ...options })
    : configuration.backend === "antigravity" ? new AntigravityClient({ ...configuration, ...options })
    : new CodexClient({ ...configuration, ...options });
}

async function loadConfiguration(configPath, actualOrigin) {
  let config;
  try { config = JSON.parse(await readFile(resolve(configPath), "utf8")); }
  catch { throw new Error("无法读取连接器配置"); }
  if (!config || typeof config !== "object" || !validateExtensionOrigin(config.extensionOrigin, actualOrigin)) {
    throw new Error("连接器配置或扩展来源无效");
  }
  return normalizeConfiguration(config);
}

function parseHostArgv(argv) {
  if (!Array.isArray(argv) || argv.length < 3 || argv[0] !== "--config") throw new Error("连接器启动参数无效");
  for (const extra of argv.slice(3)) {
    if (typeof extra !== "string" || !/^--parent-window=\d+$/.test(extra)) throw new Error("连接器启动参数无效");
  }
  return { configPath: argv[1], origin: argv[2] };
}

export async function runHost({ argv = process.argv.slice(2), input = process.stdin, output = process.stdout, clientFactory } = {}) {
  const { configPath, origin } = parseHostArgv(argv);
  const configuration = await loadConfiguration(configPath, origin);
  const diagnostics = await DiagnosticStore.create(configuration.dataDir);
  const createClient = clientFactory || (options => createBackendClient(configuration, options));
  const client = createClient({ ...configuration, diagnostic: record => diagnostics.append(record) });
  let closing = false;

  const write = (message) => {
    if (!closing && output.writable) output.write(encodeNativeMessage(message));
  };
  const close = async (exitCode = 0) => {
    if (closing) return;
    closing = true;
    input.destroy();
    await client.close().catch(() => {});
    await diagnostics.idle();
    process.exitCode = exitCode;
  };

  client.on("status", (status) => write({ event: "status", data: status }));
  diagnostics.on("diagnostic", (record) => write({ event: "diagnostic", data: record }));
  if(diagnostics.storageError)write({event:'diagnostic',data:{at:Date.now(),operation:'CONNECTION',stage:'connection',status:'error',code:'STORAGE_ERROR'}});

  // CLI 等第一条业务请求才启动：扩展只来要配对令牌时不必拉起 Codex / Grok / agy。
  let started = null;
  const start = () => { started ??= client.start().catch(() => close(1)); };

  const dispatch = async (raw) => {
    let request;
    try { request = validateRequest(raw); }
    catch (error) {
      if (raw && (typeof raw.id === "string" || Number.isSafeInteger(raw.id))) {
        const { code, ...detail } = diagnosticError(error);
        write({ id: raw.id, ok: false, error: error.message, code, detail });
        return;
      }
      await close(1);
      return;
    }
    // 配对令牌只经浏览器连接器下发（浏览器只为 allowed_origins 里的扩展拉起宿主，宿主又校验了来源）；
    // 不进 dispatchRequest，常驻服务不会把令牌交给 WebSocket 对端。
    if (request.type === "pairingToken") {
      try { write({ id: request.id, ok: true, data: { token: await readPairingToken(configuration.serviceTokenFile) } }); }
      catch (error) { write(failureResponse(request.id, error)); }
      return;
    }
    if (closing) return;
    start();
    try {
      const data = await dispatchRequest({ client, diagnostics, request, emit: write });
      write({ id: request.id, ok: true, data });
    } catch (error) {
      write(failureResponse(request.id, error));
    }
  };

  const decoder = new NativeMessageDecoder({
    onMessage: (message) => { void dispatch(message); },
    onError: () => { void close(1); },
  });
  input.on("data", (chunk) => decoder.push(chunk));
  input.on("end", () => { decoder.end(); void close(decoder.failed ? 1 : 0); });
  input.on("error", () => { void close(1); });

  const onSignal = () => { void close(0); };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  process.once("SIGHUP", onSignal);

  // Configuration and diagnostic setup are asynchronous; if Chrome closed stdin meanwhile, the end event was missed.
  if (input.readableEnded || input.destroyed) await close(0);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  runHost().catch(() => { process.exitCode = 1; });
}
