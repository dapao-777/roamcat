#!/usr/bin/env node
/**
 * @file connector/service.mjs
 * 文件职责：本机常驻连接服务——只监听 127.0.0.1，扩展经 WebSocket 连接，不依赖浏览器的 NativeMessaging 注册。
 * 主要内容：最小 WebSocket 服务端（RFC 6455 文本帧、分片、ping/close，单条上限 1MB）；握手校验 Host 为本机、
 *   Origin 在安装时登记的扩展白名单内；每个订阅后端常驻一个客户端（ChatGPT / Grok / Google），多个连接共享，
 *   状态与诊断广播给该后端的全部连接，请求响应与进度只回给发起的连接；无连接 30 分钟后收起后端 CLI。
 *   请求分发与 NativeMessaging 宿主共用 host.mjs 的 dispatchRequest。
 * 模块边界：Node 侧入口；`node service.mjs --config service.json`；/v1/health 返回服务与后端概况。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DiagnosticStore } from "./diagnostics.mjs";
import {
  MAX_NATIVE_MESSAGE_BYTES, createBackendClient, dispatchRequest, failureResponse,
  loadBackendConfiguration, validateExtensionOrigin, validateRequest,
} from "./host.mjs";

export const SERVICE_VERSION = 1;
export const DEFAULT_SERVICE_PORT = 47821;
export const SERVICE_BACKENDS = Object.freeze(["chatgpt", "grok", "antigravity"]);
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const DEFAULT_IDLE_MS = 30 * 60000;

// ---------- WebSocket 帧 ----------

export function encodeFrame(opcode, payload = Buffer.alloc(0)) {
  const length = payload.length;
  const head = length < 126 ? Buffer.alloc(2) : length < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
  head[0] = 0x80 | opcode;
  if (length < 126) head[1] = length;
  else if (length < 65536) { head[1] = 126; head.writeUInt16BE(length, 2); }
  else { head[1] = 127; head.writeBigUInt64BE(BigInt(length), 2); }
  return Buffer.concat([head, payload]);
}

// 解析客户端帧：浏览器发来的帧必须带掩码；文本消息可分片，控制帧不可分片且不超过 125 字节。
export class FrameDecoder {
  constructor({ maxBytes = MAX_NATIVE_MESSAGE_BYTES, onText, onPing, onClose, onError }) {
    Object.assign(this, { maxBytes, onText, onPing, onClose, onError });
    this.buffer = Buffer.alloc(0);
    this.fragments = null;
    this.failed = false;
  }
  push(chunk) {
    if (this.failed) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (!this.failed) {
      if (this.buffer.length < 2) return;
      const first = this.buffer[0], second = this.buffer[1];
      const fin = (first & 0x80) !== 0, opcode = first & 0x0f, masked = (second & 0x80) !== 0;
      let length = second & 0x7f, offset = 2;
      if (length === 126) { if (this.buffer.length < 4) return; length = this.buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) {
        if (this.buffer.length < 10) return;
        const big = this.buffer.readBigUInt64BE(2);
        if (big > BigInt(this.maxBytes)) return this.#fail(1009, "message too large");
        length = Number(big); offset = 10;
      }
      if (!masked) return this.#fail(1002, "client frames must be masked");
      if (length > this.maxBytes) return this.#fail(1009, "message too large");
      if (this.buffer.length < offset + 4 + length) return;
      const mask = this.buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(this.buffer.subarray(offset + 4, offset + 4 + length));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buffer = this.buffer.subarray(offset + 4 + length);
      if (opcode >= 0x8) {
        if (!fin || length > 125) return this.#fail(1002, "invalid control frame");
        if (opcode === 0x8) { this.onClose?.(payload.length >= 2 ? payload.readUInt16BE(0) : 1005); return; }
        if (opcode === 0x9) this.onPing?.(payload);
        continue; // 0xA pong：忽略
      }
      if (opcode === 0x2) return this.#fail(1003, "binary frames are not supported");
      if (opcode === 0x1) {
        if (this.fragments) return this.#fail(1002, "unexpected new message");
        this.fragments = [payload];
      } else if (opcode === 0x0) {
        if (!this.fragments) return this.#fail(1002, "unexpected continuation");
        this.fragments.push(payload);
      } else return this.#fail(1002, "unknown opcode");
      const total = this.fragments.reduce((sum, part) => sum + part.length, 0);
      if (total > this.maxBytes) return this.#fail(1009, "message too large");
      if (fin) { const text = Buffer.concat(this.fragments).toString("utf8"); this.fragments = null; this.onText?.(text); }
    }
  }
  #fail(code, reason) { this.failed = true; this.buffer = Buffer.alloc(0); this.onError?.(code, reason); }
}

// ---------- 握手校验 ----------

// 只接受本机地址的 Host（防 DNS 重绑定）；端口必须与监听端口一致。
export function validHost(header, port) {
  if (typeof header !== "string") return false;
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(header.toLowerCase());
}

export function acceptKey(key) {
  return createHash("sha1").update(key + WS_GUID).digest("base64");
}

// ---------- 后端会话 ----------

class BackendSession {
  constructor({ kind, configPath, clientFactory, idleMs, log }) {
    Object.assign(this, { kind, configPath, clientFactory, idleMs, log });
    this.sockets = new Set();
    this.ready = null;
    this.lastStatus = null;
    this.idleTimer = null;
  }
  async ensure() {
    if (!this.ready) {
      this.ready = (async () => {
        const configuration = await loadBackendConfiguration(this.configPath);
        if (configuration.backend !== this.kind) throw new Error("连接器配置与后端不一致");
        const diagnostics = await DiagnosticStore.create(configuration.dataDir);
        const factory = this.clientFactory || ((config, options) => createBackendClient(config, options));
        const client = factory(configuration, { diagnostic: record => diagnostics.append(record) });
        client.on("status", status => { this.lastStatus = status; this.broadcast({ event: "status", data: status }); });
        diagnostics.on("diagnostic", record => this.broadcast({ event: "diagnostic", data: record }));
        // start 失败也保留会话：状态里会带上错误，扩展可再次刷新；下次 ensure 不重复建客户端。
        await client.start().catch(error => this.log(`[${this.kind}] 启动失败：${error?.message || error}`));
        return { client, diagnostics };
      })();
      this.ready.catch(() => { this.ready = null; });
    }
    return this.ready;
  }
  attach(socket) {
    this.sockets.add(socket);
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    if (this.lastStatus) socket.send({ event: "status", data: this.lastStatus });
  }
  detach(socket) {
    this.sockets.delete(socket);
    if (!this.sockets.size && this.ready && !this.idleTimer) {
      this.idleTimer = setTimeout(() => { this.idleTimer = null; if (!this.sockets.size) void this.shutdown(); }, this.idleMs);
      this.idleTimer.unref?.();
    }
  }
  broadcast(message) { for (const socket of this.sockets) socket.send(message); }
  async handle(socket, raw) {
    let request;
    try { request = validateRequest(raw); }
    catch (error) {
      if (raw && (typeof raw.id === "string" || Number.isSafeInteger(raw.id))) socket.send(failureResponse(raw.id, error));
      else socket.close(1008, "invalid request");
      return;
    }
    try {
      const { client, diagnostics } = await this.ensure();
      const data = await dispatchRequest({ client, diagnostics, request, emit: message => socket.send(message) });
      socket.send({ id: request.id, ok: true, data });
    } catch (error) {
      socket.send(failureResponse(request.id, error));
    }
  }
  async shutdown() {
    const ready = this.ready;
    this.ready = null;
    this.lastStatus = null;
    if (!ready) return;
    try { const { client, diagnostics } = await ready; await client.close().catch(() => {}); await diagnostics.idle(); }
    catch { /* 会话没建起来，无需收尾 */ }
  }
}

// ---------- 连接 ----------

class ServiceSocket {
  constructor(socket, { onText, onClose }) {
    this.socket = socket;
    this.open = true;
    this.decoder = new FrameDecoder({
      onText,
      onPing: payload => this.#write(encodeFrame(0xa, payload)),
      onClose: code => this.close(code === 1005 ? 1000 : code),
      onError: (code, reason) => this.close(code, reason),
    });
    socket.on("data", chunk => this.decoder.push(chunk));
    socket.on("close", () => { if (this.open) { this.open = false; onClose(); } });
    socket.on("error", () => socket.destroy());
    this.onClose = onClose;
  }
  send(message) {
    if (!this.open) return;
    let body;
    try { body = Buffer.from(JSON.stringify(message), "utf8"); } catch { return; }
    if (body.length > MAX_NATIVE_MESSAGE_BYTES) return;
    this.#write(encodeFrame(0x1, body));
  }
  close(code = 1000, reason = "") {
    if (!this.open) return;
    this.open = false;
    const payload = Buffer.alloc(2 + Buffer.byteLength(reason));
    payload.writeUInt16BE(code, 0);
    payload.write(reason, 2);
    this.#write(encodeFrame(0x8, payload));
    this.socket.end();
    this.onClose();
  }
  #write(frame) { if (!this.socket.destroyed) this.socket.write(frame); }
}

// ---------- 服务 ----------

export async function startService({
  port = DEFAULT_SERVICE_PORT, host = "127.0.0.1", allowedOrigins = [], backends = {},
  clientFactory, idleMs = DEFAULT_IDLE_MS, log = () => {},
} = {}) {
  const sessions = new Map();
  for (const kind of SERVICE_BACKENDS) {
    if (typeof backends[kind] === "string" && backends[kind]) {
      sessions.set(kind, new BackendSession({ kind, configPath: backends[kind], clientFactory, idleMs, log }));
    }
  }
  let boundPort = port;
  // 升级后的 WebSocket 连接不再归 http 服务器管理；关闭服务时要逐个收掉，否则 server.close 会一直等。
  const liveSockets = new Set();
  const server = createServer((request, response) => {
    if (!validHost(request.headers.host, boundPort)) { response.writeHead(403).end(); return; }
    const url = new URL(request.url, `http://127.0.0.1:${boundPort}`);
    if (request.method === "GET" && url.pathname === "/v1/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify({ ok: true, service: "roamcat-connector", version: SERVICE_VERSION, pid: process.pid, backends: [...sessions.keys()] }));
      return;
    }
    response.writeHead(404).end();
  });
  server.on("connection", socket => { liveSockets.add(socket); socket.on("close", () => liveSockets.delete(socket)); });
  server.on("upgrade", (request, socket) => {
    const reject = (status) => { socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`); };
    try {
      const url = new URL(request.url, `http://127.0.0.1:${boundPort}`);
      const kind = url.searchParams.get("backend");
      if (url.pathname !== "/v1/connect") return reject("404 Not Found");
      if (!validHost(request.headers.host, boundPort)) return reject("403 Forbidden");
      if (!validateExtensionOrigin(allowedOrigins, request.headers.origin)) return reject("403 Forbidden");
      if (request.headers.upgrade?.toLowerCase() !== "websocket" || request.headers["sec-websocket-version"] !== "13") return reject("400 Bad Request");
      const key = request.headers["sec-websocket-key"];
      if (typeof key !== "string" || Buffer.from(key, "base64").length !== 16) return reject("400 Bad Request");
      const session = sessions.get(kind);
      if (!session) return reject("404 Not Found");
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`);
      socket.setNoDelay(true);
      const connection = new ServiceSocket(socket, {
        onText: text => {
          let message;
          try { message = JSON.parse(text); } catch { connection.close(1007, "invalid json"); return; }
          void session.handle(connection, message);
        },
        onClose: () => session.detach(connection),
      });
      session.attach(connection);
      // 先把后端拉起来：扩展连上后第一时间会问 status，此时 CLI 已在启动。
      void session.ensure().catch(error => log(`[${kind}] 配置无效：${error?.message || error}`));
    } catch {
      reject("400 Bad Request");
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => { server.off("error", rejectListen); resolveListen(); });
  });
  boundPort = server.address().port;
  return {
    port: boundPort,
    sessions,
    async close() {
      const closed = new Promise(done => server.close(() => done()));
      server.closeAllConnections?.();
      for (const socket of liveSockets) socket.destroy();
      await closed;
      await Promise.all([...sessions.values()].map(session => session.shutdown()));
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] !== "--config" || !args[1]) throw new Error("用法：node service.mjs --config service.json");
  const configPath = resolve(args[1]);
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const pidPath = typeof config.pidFile === "string" ? config.pidFile : null;
  const log = message => process.stderr.write(`${new Date().toISOString()} ${message}\n`);
  const service = await startService({
    port: Number.isInteger(config.port) ? config.port : DEFAULT_SERVICE_PORT,
    allowedOrigins: config.allowedOrigins,
    backends: config.backends || {},
    log,
  });
  if (pidPath) await writeFile(pidPath, String(process.pid)).catch(() => {});
  log(`RoamCat 连接服务已启动：127.0.0.1:${service.port}（${[...service.sessions.keys()].join(", ") || "无后端"}）`);
  const stop = async () => {
    await service.close().catch(() => {});
    if (pidPath) await rm(pidPath, { force: true }).catch(() => {});
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  process.once("SIGHUP", stop);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch(error => {
    process.stderr.write(`RoamCat 连接服务启动失败：${error?.code === "EADDRINUSE" ? "端口已被占用（可能已有一个服务在运行）" : error?.message || error}\n`);
    process.exitCode = 1;
  });
}
