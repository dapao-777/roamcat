/**
 * @file build/source-stamp.mjs
 * 文件职责：构建产物新鲜度——构建结束时把扩展源码层、src/ 与构建配置的「路径 | 大小 | 修改时间」指纹，
 *   连同 dist/extension 自身的指纹写进 dist/.roamcat-build.json；浏览器门禁启动前重新计算并比对，
 *   源码在构建后改过、产物被手改过、或 dist 是生产构建时直接报错，避免拿旧产物得出错误结论。
 * 主要内容：writeBuildStamp(mode) 由 build/extension-plugin.mjs 在产物写完后调用；
 *   checkBuildStamp() 返回 null（产物最新）或一句说明（最多列出 3 个构建后改过的文件）。
 * 模块边界：构建期与门禁共用的 Node 模块；只读文件元数据（不读内容），整个源码层约 160 个文件，毫秒级。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 改了会影响构建产物的输入：扩展源码层、Vite 页面源码、构建脚本与配置。tools/ 只影响门禁本身，不在其中。
const SOURCES = ['roamcat-0.0.1/extension', 'src', 'build', 'vite.config.mjs', 'vite.content-ui.config.mjs', 'package.json'];
const OUTPUT = 'dist/extension';
export const STAMP_FILE = path.join(ROOT, 'dist', '.roamcat-build.json');

function walk(target, out) {
  let stat;
  try { stat = fs.statSync(target); } catch { return; }
  if (stat.isDirectory()) for (const name of fs.readdirSync(target)) walk(path.join(target, name), out);
  else out.push({file: path.relative(ROOT, target).split(path.sep).join('/'), size: stat.size, mtime: Math.round(stat.mtimeMs)});
}
function entries(roots) {
  const out = [];
  for (const root of roots) walk(path.join(ROOT, root), out);
  return out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}
const digest = list => crypto.createHash('sha256').update(list.map(item => `${item.file}|${item.size}|${item.mtime}`).join('\n')).digest('hex');

export function writeBuildStamp(mode) {
  fs.mkdirSync(path.dirname(STAMP_FILE), {recursive: true});
  fs.writeFileSync(STAMP_FILE, JSON.stringify({mode, builtAt: Date.now(), sources: digest(entries(SOURCES)), output: digest(entries([OUTPUT]))}, null, 2) + '\n');
}

export function checkBuildStamp() {
  let stamp;
  try { stamp = JSON.parse(fs.readFileSync(STAMP_FILE, 'utf8')); }
  catch { return '没有找到构建记录（dist/.roamcat-build.json），先运行 npm run build。'; }
  if (stamp.mode !== 'development') return `dist/extension 是 ${stamp.mode} 构建，浏览器门禁需要开发构建（固定扩展 ID），先运行 npm run build。`;
  const sources = entries(SOURCES);
  if (digest(sources) !== stamp.sources) {
    const changed = sources.filter(item => item.mtime > stamp.builtAt).slice(0, 3).map(item => item.file);
    return `dist/extension 不是最新构建：${changed.length ? changed.join('、') + ' 在构建后改过' : '源码有文件增删'}，先运行 npm run build。`;
  }
  if (digest(entries([OUTPUT])) !== stamp.output) return 'dist/extension 在构建后被改动过，已不是构建产物原样，先运行 npm run build。';
  return null;
}
