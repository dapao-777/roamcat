/**
 * @file connector/pairing.mjs
 * 文件职责：本机常驻连接服务的配对令牌——生成、落盘、读取与握手比对。
 * 主要内容：Origin 头能被本机任何进程伪造，常驻服务另要求握手带上安装时生成的随机令牌（64 位十六进制）。
 *   令牌文件只写在当前用户的数据目录（目录 0700、文件 0600；Windows 靠 %LOCALAPPDATA% 的用户 ACL），
 *   扩展经浏览器连接器（host.mjs）要一次，握手时放在 Sec-WebSocket-Protocol 里：
 *   `roamcat.v1, roamcat.token.<令牌>`，服务只回 `roamcat.v1`，令牌不进 URL。
 * 模块边界：无依赖的纯工具；service.mjs / host.mjs / service-install.mjs 共用。
 *   扩展侧 subscription.js 镜像这两个协议名（extension 不得 import connector），由单测对齐。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";

export const PAIRING_PROTOCOL = "roamcat.v1";
export const PAIRING_TOKEN_PREFIX = "roamcat.token.";
export const PAIRING_TOKEN_FILE = "pairing-token";
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export function validPairingToken(value) {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export function createPairingToken() {
  return randomBytes(32).toString("hex");
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

// 常量时间比对：先各自哈希成等长摘要，再 timingSafeEqual，长度不同也不提前返回。
export function pairingTokenMatches(expected, protocols) {
  const offered = protocols.find(item => item.startsWith(PAIRING_TOKEN_PREFIX));
  if (!validPairingToken(expected) || offered === undefined) return false;
  const digest = value => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(PAIRING_TOKEN_PREFIX + expected), digest(offered));
}
