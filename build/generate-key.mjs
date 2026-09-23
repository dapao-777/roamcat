/**
 * @file build/generate-key.mjs
 * 文件职责：一次性生成构建期 manifest key 与对应扩展 ID，落盘 build/extension-key.json。
 * 主要内容：RSA-2048 公钥 DER→base64；用 manifest.mjs 的算法预计算 ID；只写公钥
 *   （加载已解压扩展不需要私钥，release/CWS 亦由商店签名链管理）。
 * 模块边界：构建工具，写入 build/extension-key.json；幂等保护——文件已存在时拒绝
 *   覆盖，除非显式传 --force（换 key 即换 ID，会让连接器注册表里的旧 ID 失效）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {generateKeyPairSync} from 'node:crypto';
import {existsSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {extensionIdFromKey} from './manifest.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, 'extension-key.json');
const force = process.argv.includes('--force');

if (existsSync(target) && !force) {
  const current = JSON.parse((await import('node:fs')).readFileSync(target, 'utf8'));
  console.error(`extension-key.json 已存在（id=${current.id}）。换 key 等于换扩展 ID；确认要换请加 --force。`);
  process.exit(1);
}

const {publicKey} = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {type: 'spki', format: 'der'},
});
const key = Buffer.from(publicKey).toString('base64');
const id = extensionIdFromKey(key);
writeFileSync(target, `${JSON.stringify({key, id}, null, 2)}\n`);
console.log(`已生成 build/extension-key.json\n扩展 ID: ${id}`);
