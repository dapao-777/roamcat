/**
 * @file tools/lib/extension-browser.cjs
 * 文件职责：浏览器门禁共享的扩展加载器——以持久化上下文启动 tools/lib/browser.cjs 选定的浏览器（默认 ego lite）
 *   并加载未打包扩展，返回可直接调用 chrome.scripting 的扩展页（默认 ui/options.html）。
 * 主要内容：launchExtension 复制扩展到临时目录后加载，扩展 ID 从 manifest.key（公钥 SHA-256 前 16 字节 → a-p）
 *   或加载目录路径哈希推导并轮询打开；inspectTab / checkSelectors / readProfiles 在目标标签页隔离世界里取数。
 * 模块边界：只在 Node 侧运行；浏览器选择与启动细节全在 browser.cjs。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const {chromium, sleep} = require('./browser.cjs');
const toId = buf => [...buf.subarray(0, 16)].flatMap(b => [b >> 4, b & 15]).map(n => String.fromCharCode(97 + n)).join('');

// options({headless, extensionDir, viewport}) → {context, extPage, profile, extension, close()}
// extensionDir 会被复制到临时目录（保持源目录不被写），manifest 保持原样。
async function launchExtension({headless = true, extensionDir, viewport = {width: 1366, height: 900}, optionsPage = 'ui/options.html'} = {}) {
  if (!extensionDir || !fs.existsSync(path.join(extensionDir, 'manifest.json')))
    throw new Error(`扩展目录不存在或缺 manifest.json：${extensionDir}（先运行 npm run build）`);
  const extension = fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-ext-'));
  fs.cpSync(extensionDir, extension, {recursive: true});
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-profile-'));
  const cleanup = () => { fs.rmSync(extension, {recursive: true, force: true, maxRetries: 5, retryDelay: 300}); fs.rmSync(profile, {recursive: true, force: true, maxRetries: 5, retryDelay: 300}); };
  const context = await chromium.launchPersistentContext(profile, {
    headless, ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
    viewport,
  }).catch(error => { cleanup(); throw error; });
  const shutdown = () => context.close().catch(() => {});
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));
  const ids = [];
  if (manifest.key) ids.push(toId(crypto.createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest()));
  ids.push(toId(crypto.createHash('sha256').update(extension, 'utf16le').digest()));
  // 先开扩展页再关旧标签：开窗模式下关掉最后一个标签，浏览器会直接退出。
  const extPage = await context.newPage();
  for (const existing of context.pages()) if (existing !== extPage) await existing.close().catch(() => {});
  let opened = false;
  for (let attempt = 0; attempt < 45 && !opened; attempt++) {
    const worker = context.serviceWorkers()[0];
    if (worker) ids.unshift(new URL(worker.url()).host);
    for (const id of new Set(ids)) {
      try { await extPage.goto(`chrome-extension://${id}/${optionsPage}`, {timeout: 8000}); opened = true; break; } catch {}
    }
    if (!opened) await sleep(1000);
  }
  if (!opened) { await shutdown(); cleanup(); throw new Error('无法打开扩展页（扩展未加载）'); }
  await extPage.waitForTimeout(500);
  const close = async () => { await shutdown(); cleanup(); };
  return {context, extPage, profile, extension, close};
}

// 在目标 tab 的隔离世界里跑 content.js 的 inspect()（字面量 func，不依赖 eval）。
const inspectTab = (extPage, tabId, limit = 5000, textLimit = 2000) =>
  extPage.evaluate(({tabId, limit, textLimit}) => chrome.scripting.executeScript({
    target: {tabId},
    func: args => globalThis.__ROAMCAT_CONTENT__?.inspect?.(args.limit, args.textLimit),
    args: [{limit, textLimit}]
  }), {tabId, limit, textLimit}).then(frames => frames?.[0]?.result);

// 在目标 tab 的隔离世界里按选择器列表逐个 querySelector 校验合法性。
const checkSelectors = (extPage, tabId, selectors) =>
  extPage.evaluate(({tabId, selectors}) => chrome.scripting.executeScript({
    target: {tabId},
    func: sels => sels.filter(sel => { try { document.createDocumentFragment().querySelector(sel); return false; } catch { return true; } }),
    args: [selectors]
  }), {tabId, selectors}).then(frames => frames?.[0]?.result);

const readProfiles = (extPage, tabId) =>
  extPage.evaluate(tabId => chrome.scripting.executeScript({
    target: {tabId},
    func: () => (globalThis.RoamCatSites?.PROFILES || []).flatMap(p => [...(p.root || []), ...(p.skip || []), ...(p.chrome || [])])
  }), tabId).then(frames => frames?.[0]?.result || []);

module.exports = {launchExtension, inspectTab, checkSelectors, readProfiles, sleep};
