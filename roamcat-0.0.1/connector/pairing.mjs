/**
 * @file connector/pairing.mjs
 * 文件职责：本机常驻连接服务的配对令牌与双向认证——令牌生成、落盘、读取，挑战—应答证明的计算与比对。
 * 主要内容：令牌是安装时生成的 32 字节随机数（64 位十六进制），只写在当前用户的数据目录（目录 0700、文件 0600；
 *   Windows 靠 %LOCALAPPDATA% 的用户 ACL），扩展经浏览器连接器（host.mjs）要一次。令牌只当 HMAC 密钥，不上线：
 *   扩展握手带 `Sec-WebSocket-Protocol: roamcat.v2, roamcat.nonce.<扩展随机数>`；服务连上后先发
 *   `{event:'hello', data:{nonce, proof}}` 证明自己持有令牌，扩展核对通过才回 `{type:'auth', payload:{proof}}`，
 *   服务核对后回 `{event:'ready'}`，此后才收发业务请求。两边证明用不同角色名，互相不能拿来冒充对方。
 * 模块边界：无依赖的纯工具；service.mjs / host.mjs / service-install.mjs 共用。
 *   扩展侧 subscription.js 用 WebCrypto 镜像同一套协议名与证明算法（extension 不得 import connector），由单测对齐。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";

export const PAIRING_PROTOCOL = "roamcat.v2";
export const PAIRING_NONCE_PREFIX = "roamcat.nonce.";
export const PAIRING_TOKEN_FILE = "pairing-token";
// 证明里的角色名：服务证明自己用 service，扩展回证明用 extension。
export const PROOF_ROLES = Object.freeze({ service: "service", extension: "extension" });
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const NONCE_PATTERN = /^[0-9a-f]{32}$/;
const PROOF_PATTERN = /^[0-9a-f]{64}$/;

export function validPairingToken(value) {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export function validPairingNonce(value) {
  return typeof value === "string" && NONCE_PATTERN.test(value);
}

export function createPairingToken() {
  return randomBytes(32).toString("hex");
}

export function createPairingNonce() {
  return randomBytes(16).toString("hex");
}

// 每次安装都换新令牌：写入后再 chmod，覆盖已存在的旧文件时权限也收紧到 0600。
export async function writePairingToken(path, token = createPairingToken()) {
  await writeFile(path, token + "\n", { mode: 0o600 });
  await chmod(path, 0o600).catch(() => {});
  return token;
}

export async function readPairingToken(path) {
  if (typeof path !== "string" || !path) throw new Error("连接器没有登记常驻服务的配对令牌，请重新运行安装命令。");
  let text;
  try { text = await readFile(path, "utf8"); }
  catch { throw new Error("无法读取常驻服务的配对令牌，请重新运行安装命令。"); }
  const token = text.trim();
  if (!validPairingToken(token)) throw new Error("常驻服务的配对令牌无效，请重新运行安装命令。");
  return token;
}

// 解析握手请求的 Sec-WebSocket-Protocol（逗号分隔；Node 会把重复的头合并成一行）。
export function offeredProtocols(header) {
  return typeof header === "string" ? header.split(",").map(item => item.trim()).filter(Boolean) : [];
}

// 扩展的随机数：子协议里必须恰好有一个 roamcat.nonce.<32 位十六进制>，多了或格式不对都按没提供处理。
export function offeredNonce(protocols) {
  const offered = protocols.filter(item => item.startsWith(PAIRING_NONCE_PREFIX));
  if (offered.length !== 1) return null;
  const nonce = offered[0].slice(PAIRING_NONCE_PREFIX.length);
  return validPairingNonce(nonce) ? nonce : null;
}

// HMAC-SHA256（密钥是令牌的 32 字节原值）覆盖协议名、角色、后端与双方随机数，逐行拼接。
export function pairingProof(token, role, { backend, clientNonce, serviceNonce }) {
  if (!validPairingToken(token)) throw new Error("配对令牌无效");
  const transcript = [PAIRING_PROTOCOL, role, backend, clientNonce, serviceNonce].join("\n");
  return createHmac("sha256", Buffer.from(token, "hex")).update(transcript, "utf8").digest("hex");
}

// 常量时间比对：格式不对直接判不符，格式对的两份 32 字节摘要用 timingSafeEqual。
export function pairingProofMatches(expected, offered) {
  if (typeof expected !== "string" || !PROOF_PATTERN.test(expected) || typeof offered !== "string" || !PROOF_PATTERN.test(offered)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(offered, "hex"));
}
