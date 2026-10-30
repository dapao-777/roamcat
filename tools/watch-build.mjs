/**
 * @file 持续构建协调器：监听页内 UI、页面和扩展源码，以完整开发构建顺序更新产物。
 * 主要内容：递归监听增删改、合并连续保存、串行构建；构建中再有修改则排入下一轮，失败后仍可恢复。
 * 模块边界：只监听构建输入；生成的 content-ui.js 不触发自身，关闭时释放监听并等待当前构建结束。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INPUT_DIRS = ['src', 'roamcat-0.0.1/extension', 'build'];
const INPUT_FILES = new Set(['package.json', 'package-lock.json', 'vite.config.mjs', 'vite.content-ui.config.mjs']);
const GENERATED_UI = 'roamcat-0.0.1/extension/content-ui.js';

async function rebuildDevelopment(root) {
  const {build} = await import('vite');
  await build({configFile: path.join(root, 'vite.content-ui.config.mjs'), mode: 'development'});
  await build({configFile: path.join(root, 'vite.config.mjs'), mode: 'development'});
}

export function watchBuild({root = ROOT, rebuild = rebuildDevelopment, debounceMs = 150, log = console} = {}) {
  const watchers = [];
  let closed = false, dirty = false, timer, running;

  function schedule() {
    if (closed) return;
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => { void flush(); }, debounceMs);
  }

  async function flush() {
    if (closed || running) return;
    dirty = false;
    running = (async () => {
      try {
        await rebuild(root);
        log.info('[build:watch] 构建完成，继续监听源码。');
      } catch (error) {
        log.error('[build:watch] 构建失败；修正源码后会自动重试。', error);
      }
    })();
    try { await running; }
    finally {
      running = null;
      if (dirty && !closed) schedule();
    }
  }

  function observe(relative, recursive) {
    const watcher = fs.watch(path.join(root, relative), {recursive}, (_event, filename) => {
      const name = filename?.toString().replaceAll('\\', '/');
      if (!recursive && name && !INPUT_FILES.has(name)) return;
      const changed = relative ? `${relative}/${name}` : name;
      if (changed === GENERATED_UI) return;
      schedule();
    });
    watcher.on('error', error => {
      log.error('[build:watch] 文件监听失败。', error);
      void close();
      process.exitCode = 1;
    });
    watchers.push(watcher);
  }

  async function close() {
    closed = true;
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
    await running;
  }

  try {
    for (const relative of INPUT_DIRS) observe(relative, true);
    // 监听目录而非单个配置文件，编辑器原子替换配置后也不会丢失监听。
    observe('', false);
  } catch (error) {
    for (const watcher of watchers) watcher.close();
    throw error;
  }
  return {ready: flush(), close};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = watchBuild();
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void run.close(); });
  await run.ready;
}
