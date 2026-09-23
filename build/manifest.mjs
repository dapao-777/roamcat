/**
 * @file build/manifest.mjs
 * 文件职责：manifest 构建变换与扩展 ID 算法的纯函数层——dev 注入固定 key 使 dist 目录
 *   的扩展 ID 与源目录无关，release 产物则不携带 key（交由商店签名）。
 * 主要内容：transformManifest 返回新对象不污染入参；extensionIdFromKey 复现 Chrome
 *   由公钥推导 ID 的算法（SHA-256 前 16 字节，hex 字符 0-f 映射到 a-p）。
 * 模块边界：纯函数，不读写文件系统；被 vite 插件、key 生成脚本与单元测试共用。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import { createHash } from 'node:crypto';

const KEY_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/u;

/**
 * 由 manifest `key`（公钥 DER 的 base64）推导 32 位扩展 ID。
 * Chrome 算法：SHA-256(DER) 的前 16 字节转为 32 个 hex 字符，0-f 映射为 a-p。
 * @param {string} keyBase64
 * @returns {string} 32 位小写 a-p 字符的扩展 ID
 */
export function extensionIdFromKey(keyBase64) {
  const digest = createHash('sha256').update(Buffer.from(keyBase64, 'base64')).digest();
  let id = '';
  for (const byte of digest.subarray(0, 16)) {
    const hex = byte.toString(16).padStart(2, '0');
    for (const ch of hex) id += String.fromCharCode(97 + Number.parseInt(ch, 16));
  }
  return id;
}

/**
 * 生成构建期 manifest：dev 模式注入固定公钥（dist 目录下的扩展 ID 恒等于
 * build/extension-key.json 中的 id，与加载路径无关）；release 模式不携带 key。
 * @param {object} manifest 源 manifest 对象
 * @param {{dev:boolean,key?:string}} options
 * @returns {object} 新 manifest 对象（不修改入参）
 */
export function transformManifest(manifest, {dev, key}) {
  const result = {...manifest};
  delete result.key;
  if (!dev) return result;
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    throw new Error('dev 构建缺少合法 manifest key；请先运行 node build/generate-key.mjs');
  }
  result.key = key;
  return result;
}
