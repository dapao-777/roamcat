/**
 * @file tools/verify-release.mjs
 * 文件职责：生产构建门禁（npm run verify:release）——生产构建会压缩源层 classic 脚本、去掉开发 key，开发构建的门禁覆盖不到；
 *   这里先做生产构建并拷到临时目录，随即恢复开发构建，再对拷贝做静态检查与浏览器冒烟。
 * 主要内容：manifest 不带 key 且版本与 package.json 一致；全部脚本能编译（单个子进程里 vm 只编译不执行）；
 *   压缩后的源层 classic 脚本保留 MPL 许可头；无头 ego 加载生产版：弹窗与设置页无脚本错误，普通网页只有轻量引导，
 *   按需注入后阅读引擎可开启并建出正文索引。报告与汇总行由 tools/lib/gate-report.mjs 输出。
 * 模块边界：会运行 npm run build:release 与 npm run build（结束时 dist/extension 恢复为开发构建）；
 *   测试网页经请求拦截下发，不访问外网、不连模型。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {openBrowser, DIST, REPO, sleep, tabIdOf} from './lib/ego.mjs';
import {createGateReport} from './lib/gate-report.mjs';

const npm = script => {
  const result = spawnSync('npm', ['run', script], {cwd: REPO, shell: true, encoding: 'utf8'});
  if (result.status !== 0) throw new Error(`npm run ${script} 失败：${(result.stderr || result.stdout).split('\n').slice(-8).join('\n')}`);
};
const gate = createGateReport('release');
const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-release-'));
try {
  npm('build:release');
  fs.cpSync(DIST, copy, {recursive: true});
} finally {
  // 生产构建只用这份拷贝；dist/extension 立刻恢复成开发构建，其他门禁不受影响。
  npm('build');
}
const page = `<!doctype html><html lang="en"><title>Release fixture</title><body><main><article><h1>Readers compare evidence</h1>${Array.from({length: 8}, (_, i) => `<p>Paragraph ${i}: careful readers compare the evidence that each explanation provides before they reach a conclusion about the topic.</p>`).join('')}</article></main></body></html>`;
const errors = [];
try {
  await gate.check('manifest 不带开发 key，版本与 package.json 一致', async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(copy, 'manifest.json'), 'utf8'));
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
    assert.equal('key' in manifest, false);
    assert.equal(manifest.version, pkg.version);
    assert.deepEqual(manifest.content_scripts[0].js, ['page-bootstrap.js']);
    return manifest.version;
  });
  await gate.check('全部脚本能编译', async () => {
    const files = [];
    const walk = dir => { for (const entry of fs.readdirSync(dir, {withFileTypes: true})) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (/\.m?js$/.test(entry.name)) files.push(full); } };
    walk(copy);
    const items = files.map(file => {
      const source = fs.readFileSync(file, 'utf8');
      return {file: path.relative(copy, file), esm: file.endsWith('.mjs') || /(^|[;}\s])(import\s*[\w{*"'(]|export\s)/.test(source.slice(0, 200000)) && !/^\/\*! MPL-2.0; RoamCat/.test(source), source};
    });
    const checker = "const vm=require('node:vm');let input='';process.stdin.on('data',c=>{input+=c;}).on('end',()=>{process.stdout.write(JSON.stringify(JSON.parse(input).map(({file,esm,source})=>{"
      + "try{if(esm)new vm.SourceTextModule(source,{identifier:file});else new vm.Script(source,{filename:file});return null;}catch(error){"
      + "if(!esm){try{new vm.SourceTextModule(source,{identifier:file});return null;}catch{}}return file+': '+String(error&&error.message||error);}})));});";
    const failures = JSON.parse(execFileSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', '-e', checker], {input: JSON.stringify(items), maxBuffer: 256 * 1024 * 1024}).toString()).filter(Boolean);
    assert.deepEqual(failures, []);
    return `${items.length} 个文件`;
  });
  await gate.check('压缩后的源层 classic 脚本保留 MPL 许可头', async () => {
    for (const name of ['page-bootstrap.js', 'content.js', 'live-chat.js', 'video-subtitles.js', 'floating-pet.js']) {
      const source = fs.readFileSync(path.join(copy, name), 'utf8');
      assert.match(source, /^\/\*! MPL-2\.0; RoamCat /, name);
      assert.ok(!/\n\s*\/\/ /.test(source.slice(0, 4000)), `${name} 看起来没有压缩`);
    }
  });
  const run = await openBrowser({extension: copy});
  try {
    const base = `chrome-extension://${run.extensionId}/`;
    const ext = await run.newPage();
    ext.on('pageerror', error => errors.push(`扩展页：${error.message}`));
    await gate.check('弹窗与设置页正常渲染', async () => {
      await ext.goto(base + 'ui/popup.html');
      await ext.waitForFunction(() => document.querySelector('roamcat-popup')?.shadowRoot || document.querySelector('roamcat-popup')?.children.length, undefined, {timeout: 10000});
      await ext.goto(base + 'ui/options.html#video');
      await ext.waitForFunction(() => document.getElementById('video') && !document.getElementById('video').hidden, undefined, {timeout: 10000});
    });
    const tab = run.page;
    tab.on('pageerror', error => errors.push(`网页：${error.message}`));
    await tab.intercept(['https://release.example/*'], async () => ({headers: {'content-type': 'text/html; charset=utf-8'}, body: page}));
    await tab.goto('https://release.example/article');
    await ext.goto(base + 'ui/popup.html');
    const tabId = await tabIdOf(ext, 'https://release.example/*');
    const exec = fn => ext.evaluate(([tabId, source]) => chrome.scripting.executeScript({target: {tabId, frameIds: [0]}, func: new Function(`return (${source})()`)}).then(r => r[0].result), [tabId, String(fn)]);
    await gate.check('普通网页只有轻量引导，未加载阅读引擎', async () => {
      await sleep(800);
      const state = await exec(() => ({bootstrap: Boolean(globalThis.__ROAMCAT_BOOTSTRAP__?.alive?.()), engine: Boolean(globalThis.__ROAMCAT_CONTENT__)}));
      assert.deepEqual(state, {bootstrap: true, engine: false});
    });
    await gate.check('按需注入后阅读引擎可开启并建出正文索引', async () => {
      await ext.evaluate(tabId => chrome.runtime.sendMessage({type: 'PAGE_UI_INJECT', tabId}), tabId);
      await exec(() => globalThis.__ROAMCAT_CONTENT__?.setManualEnabled?.(true) ?? null);
      let stats;
      for (let i = 0; i < 40; i++) { stats = await exec(() => globalThis.__ROAMCAT_CONTENT__?.stats?.() ?? null); if (stats?.indexedBlocks > 0) break; await sleep(150); }
      assert.ok(stats?.indexedBlocks > 0, JSON.stringify(stats));
      return {indexedBlocks: stats.indexedBlocks};
    });
    await gate.check('生产版页面无脚本错误', async () => assert.deepEqual(errors, []));
  } finally {
    await run.close();
  }
} finally {
  fs.rmSync(copy, {recursive: true, force: true, maxRetries: 4, retryDelay: 300});
}
gate.finish({errors});
