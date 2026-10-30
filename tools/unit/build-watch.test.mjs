/**
 * @file 持续构建回归：真实 Vite 小项目验证页内 UI/只复制脚本/配置的增删改，以及忙时排队和失败恢复。
 * 主要内容：所有输入产物位于隔离临时目录；通过输出内容等待构建完成，结束时关闭监听。
 * 模块边界：node:test 与项目构建工具，不启动浏览器、不写实际 src/ 或 dist/。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {watchBuild} from '../watch-build.mjs';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'roamcat-watch-'));
  for (const dir of ['src/content-ui', 'roamcat-0.0.1/extension', 'build']) await fs.mkdir(path.join(root, dir), {recursive: true});
  return root;
}

async function until(predicate) {
  const deadline = Date.now() + 20000;
  do {
    if (await predicate()) return;
    await delay(30);
  } while (Date.now() < deadline);
  assert.fail('持续构建未在限定时间内更新产物。');
}

async function read(file) { try { return await fs.readFile(file, 'utf8'); } catch { return ''; } }
async function removeFixture(root) {
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('roamcat-watch-'));
  await fs.rm(root, {recursive: true, force: true});
}

test('watchBuild() 真实 Vite 持续更新页内 UI、复制脚本、文件增删与原子替换的配置', {timeout: 60000}, async () => {
  const root = await fixture();
  let run;
  try {
    await fs.writeFile(path.join(root, 'src/content-ui/index.js'), 'globalThis.watchUI = "initial-ui";');
    await fs.writeFile(path.join(root, 'src/app.js'), 'globalThis.watchPage = "initial-page";');
    const ext = path.join(root, 'roamcat-0.0.1/extension');
    await fs.writeFile(path.join(ext, 'background.js'), 'initial-background');
    await fs.writeFile(path.join(root, 'vite.content-ui.config.mjs'), `
      import path from 'node:path';
      import {fileURLToPath} from 'node:url';
      const root = path.dirname(fileURLToPath(import.meta.url));
      export default {logLevel: 'silent', build: {outDir: path.join(root, 'roamcat-0.0.1/extension'), emptyOutDir: false,
        lib: {entry: path.join(root, 'src/content-ui/index.js'), name: 'WatchUI', formats: ['iife'], fileName: () => 'content-ui.js'}}};
    `);
    const config = `
      import fs from 'node:fs';
      import path from 'node:path';
      import {fileURLToPath} from 'node:url';
      const root = path.dirname(fileURLToPath(import.meta.url));
      export default {logLevel: 'silent', root: path.join(root, 'src'),
        build: {outDir: path.join(root, 'dist'), emptyOutDir: true, minify: false, rolldownOptions: {input: path.join(root, 'src/app.js')}},
        plugins: [{name: 'copy-fixture', closeBundle() {
          fs.cpSync(path.join(root, 'roamcat-0.0.1/extension'), path.join(root, 'dist'), {recursive: true});
          fs.writeFileSync(path.join(root, 'dist/config-marker'), 'initial-config');
        }}]};
    `;
    await fs.writeFile(path.join(root, 'vite.config.mjs'), config);
    const errors = [];
    let completed = 0;
    run = watchBuild({root, debounceMs: 30, log: {info() { completed++; }, error(...args) { errors.push(args.map(String).join(' ')); }}});
    await run.ready;
    assert.deepEqual(errors, []);
    const dist = name => path.join(root, 'dist', name);
    assert.match(await read(dist('content-ui.js')), /initial-ui/);

    await fs.writeFile(path.join(root, 'src/content-ui/index.js'), 'globalThis.watchUI = "updated-ui";');
    await until(async () => (await read(dist('content-ui.js'))).includes('updated-ui'));
    await fs.writeFile(path.join(ext, 'background.js'), 'updated-background');
    await until(async () => await read(dist('background.js')) === 'updated-background');

    await fs.writeFile(path.join(ext, 'added.js'), 'new-source');
    await until(async () => await read(dist('added.js')) === 'new-source');
    await fs.unlink(path.join(ext, 'added.js'));
    await until(async () => await read(dist('added.js')) === '');

    const temporary = path.join(root, 'vite.config.next.mjs');
    await fs.writeFile(temporary, config.replace('initial-config', 'updated-config'));
    await fs.rename(temporary, path.join(root, 'vite.config.mjs'));
    await until(async () => await read(dist('config-marker')) === 'updated-config');
    await fs.writeFile(path.join(ext, 'background.js'), 'after-config-replacement');
    await until(async () => await read(dist('background.js')) === 'after-config-replacement');
    await delay(150);
    const settled = completed;
    await delay(250);
    assert.equal(completed, settled, '生成 content-ui.js 不应触发无限重建');
    assert.deepEqual(errors, []);
  } finally {
    await run?.close();
    await removeFixture(root);
  }
});

test('watchBuild() 保存发生于构建期间仍会补构建，失败后可恢复且关闭后停止监听', {timeout: 30000}, async () => {
  const root = await fixture();
  let run, release;
  try {
    let calls = 0, active = 0, peak = 0, failed = 0;
    const entered = new Promise(resolve => {
      run = watchBuild({root, debounceMs: 20, log: {info() {}, error() { failed++; }}, rebuild: async () => {
        calls++;
        peak = Math.max(peak, ++active);
        try {
          if (calls === 1) { resolve(); await new Promise(done => { release = done; }); }
          if (calls === 2) throw new Error('Fixture compilation failure');
        } finally { active--; }
      }});
    });
    await entered;
    await fs.writeFile(path.join(root, 'src/queued.js'), 'saved during compilation');
    await delay(80);
    assert.equal(calls, 1);
    release();
    await run.ready;
    await until(() => failed === 1);
    await fs.writeFile(path.join(root, 'src/queued.js'), 'corrected source');
    await until(() => calls >= 3 && active === 0);
    assert.equal(peak, 1, '构建必须串行执行');
    await run.close();
    const stopped = calls;
    await fs.writeFile(path.join(root, 'src/queued.js'), 'after close');
    await delay(80);
    assert.equal(calls, stopped);
  } finally {
    release?.();
    await run?.close();
    await removeFixture(root);
  }
});
