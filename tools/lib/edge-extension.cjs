/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// 共享：以持久化上下文启动 Edge 并加载未打包扩展，返回可直接调用
// chrome.scripting 的扩展页（options.html）。扩展 ID 从 manifest.key
// （公钥 SHA-256 前 16 字节 → a-p）或加载目录路径哈希推导，轮询打开。
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
function loadPlaywright() {
  try { return require('playwright-core'); } catch (first) {
    const override = process.env.PLAYWRIGHT_CORE_PATH;
    if (override) { try { return require(override); } catch {} }
    throw new Error(`找不到 playwright-core（${first?.message || first}）。请设置 PLAYWRIGHT_CORE_PATH。`);
  }
}
const { chromium } = loadPlaywright();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const net = require('node:net');
const {spawn, spawnSync} = require('node:child_process');
const freePort = () => new Promise((resolve, reject) => { const srv = net.createServer(); srv.unref(); srv.on('error', reject); srv.listen(0, '127.0.0.1', () => { const {port} = srv.address(); srv.close(() => resolve(port)); }); });

// ROAMCAT_BROWSER=<浏览器 exe 路径> 时改用该 Chromium 系浏览器（如 ego lite）：部分发行版不响应 Playwright 的
// --remote-debugging-pipe，这里自己以临时配置 + 本地调试端口启动，再经 CDP 连接。ROAMCAT_BROWSER_HEADLESS=0 可开窗观察。
async function launchExternal(executable, {extension, profile, viewport, headless}) {
  const port = await freePort();
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
    '--no-first-run', '--no-default-browser-check', `--window-size=${viewport.width},${viewport.height}`];
  if (headless) args.push('--headless=new');
  const proc = spawn(executable, [...args, 'about:blank'], {stdio: 'ignore'});
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) { await sleep(500); try { ready = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch {} }
  const kill = () => { if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {stdio: 'ignore'}); else try { process.kill(proc.pid); } catch {} };
  if (!ready) { kill(); throw new Error(`浏览器调试端口未就绪：${executable}`); }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  return {context, shutdown: async () => { await browser.close().catch(() => {}); kill(); await sleep(800); }};
}
const toId = buf => [...buf.subarray(0, 16)].flatMap(b => [b >> 4, b & 15]).map(n => String.fromCharCode(97 + n)).join('');

// options({headless, extensionDir, viewport}) → {context, extPage, profile, extension, close()}
// extensionDir 会被复制到临时目录（保持源目录不被写），manifest 保持原样。
async function launchExtension({headless = true, extensionDir, viewport = {width: 1366, height: 900}, optionsPage = 'ui/options.html'} = {}) {
  if (!extensionDir || !fs.existsSync(path.join(extensionDir, 'manifest.json')))
    throw new Error(`扩展目录不存在或缺 manifest.json：${extensionDir}（先运行 npm run build）`);
  const extension = fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-edge-ext-'));
  fs.cpSync(extensionDir, extension, {recursive: true});
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-edge-profile-'));
  const external = process.env.ROAMCAT_BROWSER;
  const cleanup = () => { fs.rmSync(extension, {recursive: true, force: true, maxRetries: 5, retryDelay: 300}); fs.rmSync(profile, {recursive: true, force: true, maxRetries: 5, retryDelay: 300}); };
  let context, shutdown;
  if (external) {
    ({context, shutdown} = await launchExternal(external, {extension, profile, viewport, headless: headless && process.env.ROAMCAT_BROWSER_HEADLESS !== '0'}).catch(error => { cleanup(); throw error; }));
  } else {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'msedge', headless, ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
      viewport,
    }).catch(error => { cleanup(); throw error; });
    shutdown = () => context.close().catch(() => {});
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));
  const ids = [];
  if (manifest.key) ids.push(toId(crypto.createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest()));
  ids.push(toId(crypto.createHash('sha256').update(extension, 'utf16le').digest()));
  // 先开扩展页再关旧标签：经 CDP 连接的外部浏览器在关掉最后一个标签时会直接退出。
  const extPage = await context.newPage();
  if (external) await extPage.setViewportSize(viewport);
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
