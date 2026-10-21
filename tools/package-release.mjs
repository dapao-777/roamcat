/**
 * @file tools/package-release.mjs
 * 文件职责：把 `npm run build:release` 的产物打成 GitHub Release 安装包，按 SPEC 第 13 节的白名单组织：
 *   roamcat-0.0.1/{extension/, connector/, README.md, LICENSE, NOTICE.txt}，并生成 SHA256SUMS。
 * 主要内容：校验 dist/extension 是发布构建（manifest 不带开发 key）；复制到 dist/release/roamcat-<版本>/；
 *   用标准 zip（deflate）写出 dist/release/roamcat-<版本>-extension.zip——旧包曾是改了扩展名的 tar，
 *   双击无法解压；最后写 SHA256SUMS。
 * 用法：npm run build:release && node tools/package-release.mjs
 * 模块边界：只读 dist/extension 与 roamcat-0.0.1/ 下的白名单文件，只写 dist/release/；不上传、不发布。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join, dirname, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {zipSync} from 'fflate';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(ROOT, 'dist', 'extension');
const SOURCE = join(ROOT, 'roamcat-0.0.1');
const manifest = JSON.parse(readFileSync(join(BUILD, 'manifest.json'), 'utf8'));
if ('key' in manifest) throw new Error('dist/extension 是开发构建（带固定 key），请先运行 npm run build:release');

const version = manifest.version;
const name = `roamcat-${version}`;
const OUT = join(ROOT, 'dist', 'release');
const stage = join(OUT, name);
rmSync(OUT, {recursive: true, force: true});
mkdirSync(stage, {recursive: true});
cpSync(BUILD, join(stage, 'extension'), {recursive: true});
cpSync(join(SOURCE, 'connector'), join(stage, 'connector'), {recursive: true});
for (const file of ['README.md', 'LICENSE', 'NOTICE.txt']) cpSync(join(SOURCE, file), join(stage, file));

const entries = {};
const walk = dir => {
  for (const item of readdirSync(dir)) {
    const full = join(dir, item);
    if (statSync(full).isDirectory()) walk(full);
    else entries[relative(OUT, full).split(sep).join('/')] = [readFileSync(full), {level: /\.(png|wasm|onnx|woff2|mp4|gif)$/i.test(item) ? 0 : 9}];
  }
};
walk(stage);
const zipName = `${name}-extension.zip`;
const zip = zipSync(entries, {mtime: new Date()});
writeFileSync(join(OUT, zipName), zip);
const sha = createHash('sha256').update(zip).digest('hex');
writeFileSync(join(OUT, 'SHA256SUMS'), `${sha}  ${zipName}\n`);
console.log(`✔ ${zipName}  ${(zip.length / 1048576).toFixed(1)} MB  ${Object.keys(entries).length} files`);
console.log(`✔ SHA256SUMS  ${sha}`);
console.log(`解压目录（可直接加载 extension/）：${stage}`);
if (!existsSync(join(stage, 'extension', 'ui', 'popup.html'))) throw new Error('打包结果缺少 ui/popup.html');
