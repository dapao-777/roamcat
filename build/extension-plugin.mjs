/**
 * @file build/extension-plugin.mjs
 * 文件职责：Vite 插件——把未迁移的扩展源码层整体拷贝进 dist，并用构建期 manifest
 *   覆盖源 manifest，使 dist/extension 成为完整可加载产物。
 * 主要内容：closeBundle 中递归拷贝 roamcat-0.0.1/extension（排除 manifest.json 与
 *   REPLACED_BY_BUILD 清单中已由 Vite 产物替代的文件），随后写入 transform 后的
 *   manifest；dev 模式注入固定 key。
 * 模块边界：构建期插件，只写 dist；不触碰源树。REPLACED_BY_BUILD 随迁移进度增长。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {cpSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transformManifest} from './manifest.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSION_SOURCE = path.join(repoRoot, 'roamcat-0.0.1', 'extension');
const KEY_FILE = path.join(repoRoot, 'build', 'extension-key.json');

/**
 * 已由 Vite 产物替代的源文件（posix 相对路径）：拷贝时跳过，产物以构建输出为准。
 * 页面迁移已全部完成且旧源文件已删除，当前清单为空；机制保留，供未来同类迁移复用。
 */
export const REPLACED_BY_BUILD = Object.freeze(new Set([]));

/**
 * @param {{mode:string}} options Vite 当前 mode（development/production）
 * @returns {import('vite').Plugin}
 */
export function roamcatExtension({mode}) {
  let outDir;
  return {
    name: 'roamcat-extension',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      cpSync(EXTENSION_SOURCE, outDir, {
        recursive: true,
        filter(source) {
          const relative = path.relative(EXTENSION_SOURCE, source).split(path.sep).join('/');
          if (!relative) return true;
          if (relative === 'manifest.json') return false;
          if (REPLACED_BY_BUILD.has(relative)) return false;
          return true;
        },
      });
      const manifest = JSON.parse(readFileSync(path.join(EXTENSION_SOURCE, 'manifest.json'), 'utf8'));
      const key = mode === 'production' ? undefined : JSON.parse(readFileSync(KEY_FILE, 'utf8')).key;
      const output = transformManifest(manifest, {dev: mode !== 'production', key});
      writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(output, null, 2)}\n`);
      console.log(`[roamcat-extension] 已拷贝扩展源码层并写入 manifest（mode=${mode}）`);
    },
  };
}
