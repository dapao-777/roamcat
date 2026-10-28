/**
 * @file tools/lib/browser.cjs
 * 文件职责：全部浏览器门禁与截图脚本的统一浏览器入口——默认启动本机 ego lite（Chromium 系），
 *   脚本只需把 require('playwright-core') 的 chromium 换成本模块的 chromium，不再各自写死浏览器。
 * 主要内容：resolveBrowser() 按 ROAMCAT_BROWSER 选浏览器（未设置 → 自动找 ego lite；msedge/chrome → Playwright
 *   渠道；其他值 → 浏览器 exe 路径）；chromium.launch / launchPersistentContext 与 Playwright 同名同参：
 *   渠道模式原样转交 Playwright，exe 模式以临时调试端口自启再经 CDP 连接（ego lite 不响应
 *   Playwright 的 --remote-debugging-pipe），并在每个新页面上补 viewport / deviceScaleFactor / colorScheme。
 * 模块边界：只在 Node 侧运行；不改脚本的断言逻辑。ROAMCAT_BROWSER_HEADLESS=0 可开窗观察。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net');
const {spawn, spawnSync} = require('node:child_process');

function loadPlaywright() {
  try { return require('playwright-core'); } catch (first) {
    const override = process.env.PLAYWRIGHT_CORE_PATH;
    if (override) { try { return require(override); } catch {} }
    throw new Error(`找不到 playwright-core（${first?.message || first}）。请设置 PLAYWRIGHT_CORE_PATH。`);
  }
}
const playwright = loadPlaywright().chromium;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const CHANNELS = new Set(['msedge', 'chrome']);

// ego lite 的 Windows 安装位置；ego-browser 命令的 active_version_dir 指向 Application/<版本>/，ego.exe 在其上一级。
function egoCandidates() {
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const found = roots.map(root => path.join(root, 'Citro Labs', 'ego lite', 'Application', 'ego.exe'));
  try { found.push(path.join(fs.realpathSync(path.join(os.homedir(), '.local', 'share', 'ego', 'active_version_dir')), '..', 'ego.exe')); } catch {}
  return found;
}

// → {channel, label} 或 {executable, label}
function resolveBrowser() {
  const pick = (process.env.ROAMCAT_BROWSER || '').trim();
  if (CHANNELS.has(pick)) return {channel: pick, label: pick};
  if (pick) {
    if (!fs.existsSync(pick)) throw new Error(`ROAMCAT_BROWSER 指向的浏览器不存在：${pick}`);
    return {executable: pick, label: path.basename(pick)};
  }
  const executable = egoCandidates().find(file => fs.existsSync(file));
  if (!executable) throw new Error('找不到 ego lite（https://lite.ego.app/）。安装后重试，或设 ROAMCAT_BROWSER=msedge 改用 Edge、设为 exe 路径改用其他 Chromium 系浏览器。');
  return {executable, label: 'ego lite'};
}
const target = resolveBrowser();
const headed = () => process.env.ROAMCAT_BROWSER_HEADLESS === '0';

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.unref();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => { const {port} = server.address(); server.close(() => resolve(port)); });
});

// 自启浏览器并经 CDP 连接；shutdown() 断开、结束进程树，并删除自建的临时配置。
async function startExternal(profile, {headless = true, args = [], viewport} = {}) {
  const ownProfile = !profile;
  const userDataDir = profile || fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-browser-'));
  const port = await freePort();
  const flags = [`--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
    '--no-first-run', '--no-default-browser-check', '--keep-alive-for-test',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'];
  if (viewport) flags.push(`--window-size=${viewport.width},${viewport.height}`);
  if (headless && !headed()) flags.push('--headless=new', '--hide-scrollbars', '--mute-audio');
  const proc = spawn(target.executable, [...flags, ...args, 'about:blank'], {stdio: 'ignore'});
  const kill = () => {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {stdio: 'ignore'});
    else try { process.kill(proc.pid); } catch {}
  };
  const removeProfile = () => { if (ownProfile) fs.rmSync(userDataDir, {recursive: true, force: true, maxRetries: 5, retryDelay: 300}); };
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) { await sleep(500); try { ready = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch {} }
  if (!ready) { kill(); removeProfile(); throw new Error(`${target.label} 调试端口未就绪：${target.executable}`); }
  const browser = await playwright.connectOverCDP(`http://127.0.0.1:${port}`).catch(error => { kill(); removeProfile(); throw error; });
  let closed = false;
  const shutdown = async () => {
    if (closed) return;
    closed = true;
    await browser.close().catch(() => {});
    kill();
    await sleep(800);
    removeProfile();
  };
  return {browser, shutdown};
}

// CDP 连上的默认上下文没有 Playwright 的页面仿真：每个新页面（含扩展自己开的标签页）补上尺寸、像素比与配色。
function emulatePages(context, {viewport, deviceScaleFactor, colorScheme}) {
  if (!viewport && !deviceScaleFactor && !colorScheme) return;
  const size = viewport || {width: 1280, height: 720};
  const done = new WeakMap();
  const apply = async page => {
    if (deviceScaleFactor) {
      const session = await context.newCDPSession(page);
      await session.send('Emulation.setDeviceMetricsOverride', {width: size.width, height: size.height, deviceScaleFactor, mobile: false});
    } else if (viewport) await page.setViewportSize(viewport);
    if (colorScheme) await page.emulateMedia({colorScheme});
  };
  const prepare = page => {
    if (!done.has(page)) done.set(page, apply(page).catch(() => {}));
    return done.get(page);
  };
  context.pages().forEach(prepare);
  context.on('page', prepare);
  const newPage = context.newPage.bind(context);
  context.newPage = async (...rest) => { const page = await newPage(...rest); await prepare(page); return page; };
}

const chromium = {
  // 与 playwright chromium.launch 同参；channel / executablePath 由 ROAMCAT_BROWSER 决定，脚本里写的会被忽略。
  async launch({channel, executablePath, headless = true, args = [], ...rest} = {}) {
    if (target.channel) return playwright.launch({...rest, args, channel: target.channel, headless: headless && !headed()});
    const {browser, shutdown} = await startExternal('', {headless, args});
    browser.close = shutdown;
    return browser;
  },
  // 与 playwright chromium.launchPersistentContext 同参；profile 为空串时用临时配置。
  async launchPersistentContext(profile, {channel, executablePath, headless = true, args = [], ignoreDefaultArgs, viewport, deviceScaleFactor, colorScheme, ...rest} = {}) {
    if (target.channel) {
      return playwright.launchPersistentContext(profile, {...rest, args, ignoreDefaultArgs, viewport, deviceScaleFactor, colorScheme, channel: target.channel, headless: headless && !headed()});
    }
    // 与 Playwright 一致：没给 viewport 时按 1280×720 仿真（窄窗会触发设置页等的窄屏布局）；显式 null 才不仿真。
    if (viewport === undefined) viewport = {width: 1280, height: 720};
    const {browser, shutdown} = await startExternal(profile, {headless, args, viewport});
    const context = browser.contexts()[0];
    emulatePages(context, {viewport, deviceScaleFactor, colorScheme});
    context.close = shutdown;
    return context;
  },
};

module.exports = {chromium, resolveBrowser, browserLabel: target.label, sleep};
