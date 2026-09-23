/**
 * @file vite.config.mjs
 * 文件职责：RoamCat UI 构建链——src/ 下的 Lit 页面应用打包为 dist/extension 中的
 *   扩展产物，未迁移层由 roamcat-extension 插件整体拷贝补齐。
 * 主要内容：root=src、MPA 入口（迁移一个页面加一个入口）、@ext 别名指向扩展源目录、
 *   构建目标跟随 manifest minimum_chrome_version、dev/release 两种 mode 分别对应
 *   注入 key 与不注入。
 * 模块边界：构建配置，不产生运行时依赖；产物供 chrome://extensions 直接加载。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import {roamcatExtension} from './build/extension-plugin.mjs';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const extensionSource = path.join(repoRoot, 'roamcat-0.2.0', 'extension');
const minimumChrome = JSON.parse(readFileSync(path.join(extensionSource, 'manifest.json'), 'utf8')).minimum_chrome_version;

export default defineConfig(({mode}) => ({
  root: path.join(repoRoot, 'src'),
  base: '/',
  publicDir: false,
  resolve: {
    alias: {'@ext': extensionSource},
  },
  build: {
    outDir: path.join(repoRoot, 'dist', 'extension'),
    emptyOutDir: true,
    target: `chrome${minimumChrome}`,
    minify: mode === 'production',
    sourcemap: mode !== 'production',
    modulePreload: {polyfill: false},
    rolldownOptions: {
      input: {
        popup: path.join(repoRoot, 'src', 'ui', 'popup.html'),
        welcome: path.join(repoRoot, 'src', 'ui', 'welcome.html'),
        options: path.join(repoRoot, 'src', 'ui', 'options.html'),
      },
    },
  },
  plugins: [roamcatExtension({mode})],
}));
