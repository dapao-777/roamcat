/**
 * @file tools/lib/ego.mjs
 * 文件职责：全部浏览器门禁与截图脚本的共享层——启动一个独立的无头 ego lite（Chromium 系），经 Chrome DevTools Protocol
 *   直接驱动，不依赖 Playwright，也不碰用户日常的 ego 配置与数据。
 * 主要内容：
 *   - openBrowser({extension})：以临时配置启动 ego.exe（--headless=new、--remote-debugging-port=0，端口从 DevToolsActivePort
 *     读出），可加载未打包扩展（默认 dist/extension）；每个页面开在独立窗口里，扩展看到的 tab.active 恒为真。
 *   - Page：goto / evaluate / 截图 / 视口与配色仿真 / 初始化脚本 / 原生鼠标键盘 / 文件上传 / 对话框 / 请求拦截，
 *     以及 pageerror、console、request、requestfailed、response、dialog 事件。
 *   - Locator：在页面里按 CSS 查找（穿透 open shadow root），支持 first / nth / 子 locator 与末尾的 :visible，点击走真实坐标。
 *   - staticServer：本地静态服务（站点图标回 204）。
 * 模块边界：普通 Node（需 22+，用内置 WebSocket）里运行；浏览器可执行文件由 ROAMCAT_EGO 指定或自动找 ego lite 安装位置；
 *   ROAMCAT_HEADED=1 时开窗观察。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkBuildStamp} from '../../build/source-stamp.mjs';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DIST = path.join(REPO, 'dist', 'extension');
export const PREVIEW = path.join(REPO, 'preview');
export const EXT_ID = JSON.parse(fs.readFileSync(path.join(REPO, 'build', 'extension-key.json'), 'utf8')).id;
export const EXT_ORIGIN = `chrome-extension://${EXT_ID}`;
export const extUrl = file => `${EXT_ORIGIN}/${String(file).replace(/^\//, '')}`;
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const previewPath = (...parts) => path.join(PREVIEW, ...parts);
export const gateArgs = () => process.argv.slice(2);

// ---------- 找到 ego lite ----------
// ego-browser 命令的 active_version_dir 指向 Application/<版本>/，ego.exe 在其上一级。
function egoCandidates() {
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const found = roots.map(root => path.join(root, 'Citro Labs', 'ego lite', 'Application', 'ego.exe'));
  try { found.push(path.join(fs.realpathSync(path.join(os.homedir(), '.local', 'share', 'ego', 'active_version_dir')), '..', 'ego.exe')); } catch {}
  return found;
}
export function egoExecutable() {
  const given = (process.env.ROAMCAT_EGO || '').trim();
  if (given) {
    if (!fs.existsSync(given)) throw new Error(`ROAMCAT_EGO 指向的文件不存在：${given}`);
    return given;
  }
  const found = egoCandidates().find(file => fs.existsSync(file));
  if (!found) throw new Error('找不到 ego lite（https://lite.ego.app/）。安装后重试，或用 ROAMCAT_EGO 指定 ego.exe 路径。');
  return found;
}

// ---------- CDP 连接 ----------
class Connection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.sessions = new Map();
    this.browserEvents = new Set();
    socket.addEventListener('message', event => this.receive(JSON.parse(String(event.data))));
    socket.addEventListener('close', () => {
      for (const {reject} of this.pending.values()) reject(new Error('浏览器连接已断开'));
      this.pending.clear();
    });
  }
  static open(url) {
    if (typeof WebSocket !== 'function') throw new Error('浏览器门禁需要 Node.js 22+（内置 WebSocket）。');
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.addEventListener('open', () => resolve(new Connection(socket)), {once: true});
      socket.addEventListener('error', () => reject(new Error(`连不上浏览器调试端口：${url}`)), {once: true});
    });
  }
  receive(message) {
    if (message.id !== undefined) {
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error) waiter.reject(new Error(`${waiter.method}：${message.error.message}${message.error.data ? `（${message.error.data}）` : ''}`));
      else waiter.resolve(message.result);
      return;
    }
    if (message.sessionId) this.sessions.get(message.sessionId)?.onEvent(message.method, message.params || {});
    else for (const fn of this.browserEvents) fn(message.method, message.params || {});
  }
  send(method, params = {}, sessionId, timeout = 60000) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP 请求超时：${method}`)); }, timeout);
      this.pending.set(id, {resolve, reject, timer, method});
      this.socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
    });
  }
  close() { try { this.socket.close(); } catch {} }
}

// ---------- 启动 ----------
const killTree = pid => {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {stdio: 'ignore'});
  else try { process.kill(pid); } catch {}
};

// Chromium 系浏览器在没有缓存的配置上会用空密码以当前 Windows 账户试登一次（LogonUser，判断系统账户是否空密码），
// 每个全新临时配置都会记一次登录失败；门禁连跑十来次就触发账户锁定策略，锁定期间正确的 PIN 和密码都登不进去。
// 预先写好检查结果：os_password_last_changed 不早于实际改密时间时，浏览器沿用缓存的 os_password_blank，不再试登。
// 时间是 base::Time 内部值（自 1601 年起的微秒数），超出 Number 精度，用 BigInt 算。
function seedLocalState(profile) {
  if (process.platform !== 'win32') return;
  const now = (BigInt(Date.now()) + 11644473600000n) * 1000n;
  fs.writeFileSync(path.join(profile, 'Local State'), JSON.stringify({password_manager: {os_password_blank: false, os_password_last_changed: String(now)}}));
}

// extension：未打包扩展目录（默认 dist/extension），传 null 则不加载扩展。
// 门禁被打断（Ctrl+C、崩溃、电脑重启）时临时配置与扩展副本来不及删，一个约 40 MB。启动时顺手清掉一小时前的残留：
// 正在运行的门禁目录都比这新，并行跑的门禁不会互删。
const TEMP_PREFIXES = /^roamcat-(ego|audit-ext|service-e2e|release)-/;
function sweepStaleTemp(maxAgeMs = 60 * 60 * 1000) {
  const now = Date.now();
  let entries = [];
  try { entries = fs.readdirSync(os.tmpdir(), {withFileTypes: true}); } catch { return; }
  for (const entry of entries) {
    if (!entry.isDirectory() || !TEMP_PREFIXES.test(entry.name)) continue;
    const dir = path.join(os.tmpdir(), entry.name);
    try { if (now - fs.statSync(dir).mtimeMs > maxAgeMs) fs.rmSync(dir, {recursive: true, force: true, maxRetries: 2}); } catch { /* 仍被占用就留到下次 */ }
  }
}
// Ctrl+C / 终止信号：先关掉本进程开的浏览器并删掉临时配置，再按信号惯例退出（130 / 143）。
const openBrowsers = new Set();
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.once(signal, () => {
    for (const browser of openBrowsers) killTree(browser.proc.pid);
    // 进程刚被结束时配置目录里的文件可能还被占用：同步等一会儿再删，最多约 3 秒。
    const pause = new Int32Array(new SharedArrayBuffer(4));
    for (const browser of openBrowsers) {
      for (let attempt = 0; attempt < 10; attempt++) {
        try { browser.removeProfile(); break; } catch { Atomics.wait(pause, 0, 0, 300); }
      }
    }
    process.exit(code);
  });
}

// dist/extension 必须是当前源码的开发构建原样：源码在构建后改过、产物被手改过、或是生产构建时，门禁结果不可信。
// 直接加载 dist 的门禁由 openBrowser 自动核对；先拷贝 dist 再改的门禁、或用本地服务读 dist 的门禁自行调用。
// 临时实验（例如故意改产物做对照）可设 ROAMCAT_ALLOW_STALE_DIST=1 跳过，只打印警告。
export function assertFreshDist() {
  const problem = checkBuildStamp();
  if (!problem) return;
  if (process.env.ROAMCAT_ALLOW_STALE_DIST === '1') { console.warn(`[ego] 警告：${problem}`); return; }
  throw new Error(problem);
}

export async function openBrowser({extension = DIST, args = []} = {}) {
  if (extension && !fs.existsSync(path.join(extension, 'manifest.json'))) throw new Error(`扩展目录不存在或缺 manifest.json：${extension}（先运行 npm run build）`);
  if (extension && path.resolve(extension) === DIST) assertFreshDist();
  sweepStaleTemp();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-ego-'));
  seedLocalState(profile);
  const flags = ['--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion', '--mute-audio', '--window-size=1440,1000'];
  if (process.env.ROAMCAT_HEADED !== '1') flags.push('--headless=new', '--hide-scrollbars');
  if (extension) flags.push(`--disable-extensions-except=${extension}`, `--load-extension=${extension}`);
  const proc = spawn(egoExecutable(), [...flags, ...args, 'about:blank'], {stdio: 'ignore'});
  const removeProfile = () => fs.rmSync(profile, {recursive: true, force: true, maxRetries: 8, retryDelay: 300});
  // --remote-debugging-port=0 让浏览器自己挑端口，写进配置目录的 DevToolsActivePort（第一行端口，第二行浏览器端点路径）。
  const portFile = path.join(profile, 'DevToolsActivePort');
  let endpoint = null;
  for (let i = 0; i < 100 && !endpoint; i++) {
    await sleep(150);
    try { const [port, wsPath] = fs.readFileSync(portFile, 'utf8').split(/\r?\n/); if (port && wsPath) endpoint = `ws://127.0.0.1:${port}${wsPath}`; } catch {}
  }
  if (!endpoint) { killTree(proc.pid); removeProfile(); throw new Error('ego lite 没有打开调试端口（DevToolsActivePort 未生成）'); }
  const connection = await Connection.open(endpoint).catch(error => { killTree(proc.pid); removeProfile(); throw error; });
  const browser = new Browser(connection, proc, removeProfile);
  try {
    // 先保留独立窗口，避免无扩展模式下关掉唯一的引导窗口后浏览器开始退出。
    const page = await browser.newPage();
    await browser.closeOnboarding();
    const extensionId = extension ? await browser.extensionId() : null;
    if (extensionId) await browser.closeWelcomeGuide(extensionId);
    return {browser, page, extensionId, newPage: options => browser.newPage(options), close: () => browser.close()};
  } catch (error) {
    await browser.close();
    throw error;
  }
}

class Browser {
  constructor(connection, proc, removeProfile) {
    this.connection = connection;
    this.proc = proc;
    this.removeProfile = removeProfile;
    this.pages = [];
    openBrowsers.add(this);
  }
  send(method, params) { return this.connection.send(method, params); }
  // ego 在全新配置上会自己打开首次引导窗口（chrome://onboarding/，--no-first-run、First Run 标记与 Local State 里的
  // first_run_finished 都挡不住）；引导里会请求「设为默认浏览器」，Windows 随即弹出「默认应用 → ego (lite)」设置页，
  // 每跑一次门禁弹一次。连上调试端口后立刻停止引导并退回空白页。
  async closeOnboarding(timeout = 5000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const {targetInfos} = await this.connection.send('Target.getTargets');
      const onboarding = targetInfos.filter(info => info.url.startsWith('chrome://onboarding'));
      if (onboarding.length) {
        // 直接销毁引导 WebContents 会触发 ego 的首次引导退出流程；无扩展时也会使其他会话失效。
        // 先停止引导页面并导航到空白页，阻止其请求系统默认应用，同时保留浏览器窗口生命周期。
        for (const info of onboarding) {
          const {sessionId}=await this.connection.send('Target.attachToTarget',{targetId:info.targetId,flatten:true});
          try{await this.connection.send('Page.stopLoading',{},sessionId);await this.connection.send('Page.navigate',{url:'about:blank'},sessionId);}
          finally{await this.connection.send('Target.detachFromTarget',{sessionId}).catch(()=>{});}
        }
        return true;
      }
      await sleep(100);
    }
    return false;
  }
  async attach(targetId) {
    const {sessionId} = await this.connection.send('Target.attachToTarget', {targetId, flatten: true});
    const page = new Page(this, targetId, sessionId);
    this.connection.sessions.set(sessionId, page);
    this.pages.push(page);
    await page.init();
    return page;
  }
  // 每个页面开在独立窗口：扩展后台按 tab.active 判断网页是否在前台，同一窗口里的多个页签只有一个算活动。
  async newPage({window = true} = {}) {
    const {targetId} = await this.connection.send('Target.createTarget', {url: 'about:blank', newWindow: window});
    return this.attach(targetId);
  }
  // 扩展 ID 取自后台 service worker 的地址（与 build/extension-key.json 的预计算值对照由 verify:build 负责）。
  async extensionId(timeout = 20000) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const {targetInfos} = await this.connection.send('Target.getTargets');
      const worker = targetInfos.find(info => info.type === 'service_worker' && info.url.startsWith('chrome-extension://'));
      if (worker) return new URL(worker.url).host;
      if (Date.now() > deadline) throw new Error('扩展后台（service worker）没有启动');
      await sleep(200);
    }
  }
  // 全新配置里扩展一安装就会自动开欢迎引导页；引导页是单例，门禁再开一个时扩展会关掉其中一个（可能正是测试页），
  // 所以启动后先等它出现并关掉。
  async closeWelcomeGuide(extensionId, timeout = 4000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const {targetInfos} = await this.connection.send('Target.getTargets');
      const guides = targetInfos.filter(info => info.type === 'page' && info.url.startsWith(`chrome-extension://${extensionId}/ui/welcome.html`));
      if (guides.length) { for (const guide of guides) await this.connection.send('Target.closeTarget', {targetId: guide.targetId}).catch(() => {}); return; }
      await sleep(150);
    }
  }
  async close() {
    for (const page of this.pages) page.stopIntercept();
    await this.connection.send('Browser.close', {}, undefined, 5000).catch(() => {});
    this.connection.close();
    await sleep(500);
    killTree(this.proc.pid);
    await sleep(300);
    try { this.removeProfile(); } catch {}
    openBrowsers.delete(this);
  }
}

// ---------- 页面里执行的查询（扩展页 CSP 不允许 new Function，所以拼成表达式交给 Runtime.evaluate） ----------
const VISIBLE = `(el) => { if (!el || !el.isConnected) return false; const rect = el.getBoundingClientRect(); const style = getComputedStyle(el); return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'; }`;
// steps：[{selector, index, visible}]；逐级在上一级结果（含其 open shadow root）里找。
const QUERY = `(steps) => {
  const deep = (root, selector) => {
    const found = [];
    const visit = node => { found.push(...node.querySelectorAll(selector)); for (const el of node.querySelectorAll('*')) if (el.shadowRoot) visit(el.shadowRoot); };
    visit(root);
    if (root.shadowRoot) visit(root.shadowRoot);
    return found;
  };
  const visible = ${VISIBLE};
  let list = [document];
  for (const step of steps) {
    const next = new Set();
    for (const root of list) for (const el of deep(root, step.selector)) next.add(el);
    let items = [...next];
    if (step.visible) items = items.filter(visible);
    if (step.index !== null && step.index !== undefined) items = [items.at(step.index)].filter(Boolean);
    list = items;
  }
  return list;
}`;

export class Locator {
  constructor(page, steps) { this.page = page; this.steps = steps; }
  static parse(selector) {
    const visible = /:visible$/u.test(selector);
    return {selector: visible ? selector.replace(/:visible$/u, '') : selector, index: null, visible};
  }
  locator(selector) { return new Locator(this.page, [...this.steps, Locator.parse(selector)]); }
  nth(index) { const steps = this.steps.map(step => ({...step})); steps.at(-1).index = index; return new Locator(this.page, steps); }
  first() { return this.nth(0); }
  last() { return this.nth(-1); }
  expression(body, arg) {
    return `(async () => { const els = (${QUERY})(${JSON.stringify(this.steps)}); const visible = ${VISIBLE}; return (${body})(els, ${JSON.stringify(arg ?? null)}, visible); })()`;
  }
  // 在页面里拿到元素后执行 body(els, arg, visible)；body 是函数源码字符串。
  run(body, arg) { return this.page.evaluate(this.expression(body, arg)); }
  describe() { return this.steps.map(step => step.selector + (step.visible ? ':visible' : '') + (step.index === null ? '' : `>>nth=${step.index}`)).join(' >> '); }
  count() { return this.run('els => els.length'); }
  isVisible() { return this.run('(els, _a, visible) => visible(els[0])'); }
  isHidden() { return this.isVisible().then(visible => !visible); }
  textContent() { return this.run('els => els[0] ? els[0].textContent : null'); }
  innerText() { return this.run('els => { if (!els[0]) throw new Error("no element"); return els[0].innerText; }'); }
  allTextContents() { return this.run('els => els.map(el => el.textContent)'); }
  getAttribute(name) { return this.run('(els, name) => els[0] ? els[0].getAttribute(name) : null', name); }
  inputValue() { return this.run('els => { if (!els[0]) throw new Error("no element"); return els[0].value; }'); }
  isDisabled() { return this.run('els => Boolean(els[0] && (els[0].disabled || els[0].getAttribute("aria-disabled") === "true"))'); }
  isChecked() { return this.run('els => Boolean(els[0] && els[0].checked)'); }
  evaluate(fn, arg) { return this.run(`(els, arg) => { if (!els[0]) throw new Error("locator matched nothing"); return (${fn})(els[0], arg); }`, arg); }
  evaluateAll(fn, arg) { return this.run(`(els, arg) => (${fn})(els, arg)`, arg); }
  focus() { return this.run('els => { if (!els[0]) throw new Error("no element"); els[0].focus(); }'); }
  dispatchEvent(type, init = {}) {
    return this.run(`(els, a) => { const el = els[0]; if (!el) throw new Error("no element"); const Ctor = /^(click|dblclick|mouse|pointer|contextmenu)/.test(a.type) ? (a.type.startsWith('pointer') ? PointerEvent : MouseEvent) : /^key/.test(a.type) ? KeyboardEvent : /^focus|^blur/.test(a.type) ? FocusEvent : Event; el.dispatchEvent(new Ctor(a.type, {bubbles: true, cancelable: true, composed: true, ...a.init})); }`, {type, init});
  }
  boundingBox() {
    return this.run('els => { if (!els[0]) return null; const r = els[0].getBoundingClientRect(); return r.width || r.height ? {x: r.x, y: r.y, width: r.width, height: r.height} : null; }');
  }
  async waitFor({state = 'visible', timeout = 10000} = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const [count, visible] = await this.run('(els, _a, visible) => [els.length, visible(els[0])]');
      if ((state === 'attached' && count) || (state === 'detached' && !count) || (state === 'visible' && visible) || (state === 'hidden' && !visible)) return;
      if (Date.now() > deadline) throw new Error(`等待 ${this.describe()} 变为 ${state} 超时（${timeout}ms）`);
      await sleep(100);
    }
  }
  // 与真实点击一致：滚到可见、等可见可用，再按元素中心（或 position 偏移）给出视口坐标。
  async point({timeout = 5000, force = false, position} = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const box = await this.run(`(els, a, visible) => {
        const el = els[0];
        if (!el) return {state: 'missing'};
        if (!a.force && !visible(el)) return {state: 'hidden'};
        if (!a.force && (el.disabled || el.getAttribute('aria-disabled') === 'true')) return {state: 'disabled'};
        let r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) { el.scrollIntoView({block: 'center', inline: 'center'}); r = el.getBoundingClientRect(); }
        return {state: 'ok', x: r.x, y: r.y, width: r.width, height: r.height};
      }`, {force});
      if (box.state === 'ok') return position ? {x: box.x + position.x, y: box.y + position.y} : {x: box.x + box.width / 2, y: box.y + box.height / 2};
      if (Date.now() > deadline) throw new Error(`${this.describe()} 无法点击（${box.state}）`);
      await sleep(100);
    }
  }
  async click(options = {}) {
    const {x, y} = await this.point(options);
    await this.page.mouse.click(x, y, {button: options.button || 'left', clickCount: options.clickCount || 1, delay: options.delay});
  }
  async dblclick(options = {}) { return this.click({...options, clickCount: 2}); }
  async hover(options = {}) { const {x, y} = await this.point(options); await this.page.mouse.move(x, y); }
  async check(options = {}) { if (!(await this.isChecked())) await this.click(options); }
  async fill(value) {
    await this.run('els => { const el = els[0]; if (!el) throw new Error("no element"); el.focus(); if (typeof el.select === "function") el.select(); else { const range = document.createRange(); range.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); } }');
    if (value === '') await this.page.keyboard.press('Delete');
    else await this.page.keyboard.insertText(String(value));
    await this.run('els => els[0] && els[0].dispatchEvent(new Event("change", {bubbles: true}))');
  }
  async type(text) { await this.focus(); await this.page.keyboard.type(String(text)); }
  async press(key) { await this.focus(); await this.page.keyboard.press(key); }
  // 按 value 或可见文字选择，派发 input/change；返回选中的 value 列表。
  selectOption(choice) {
    return this.run(`(els, choice) => {
      const el = els[0]; if (!el) throw new Error('no element');
      const wanted = Array.isArray(choice) ? choice : [choice];
      const match = option => wanted.some(w => typeof w === 'string' ? option.value === w || option.label === w : (w.value !== undefined ? option.value === w.value : w.label !== undefined ? option.label === w.label : option.index === w.index));
      let hit = false;
      for (const option of el.options) { const on = match(option); option.selected = on; hit ||= on; }
      if (!hit) throw new Error('没有匹配的选项：' + JSON.stringify(choice));
      el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true}));
      return [...el.selectedOptions].map(option => option.value);
    }`, choice);
  }
  async scrollIntoViewIfNeeded() { await this.run('els => els[0] && els[0].scrollIntoView({block: "center", inline: "center"})'); }
  // 截图裁剪框按文档坐标（视口坐标加滚动偏移）。
  async screenshot({path: file} = {}) {
    const box = await this.run('els => { if (!els[0]) return null; const r = els[0].getBoundingClientRect(); return r.width && r.height ? {x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height} : null; }');
    if (!box) throw new Error(`${this.describe()} 不可见，无法截图`);
    return this.page.screenshot({path: file, clip: box});
  }
  // 文件上传：在页面里拿到 <input type=file> 的对象引用，再交给 DOM.setFileInputFiles。
  async setInputFiles(files) {
    const {result, exceptionDetails} = await this.page.send('Runtime.evaluate', {expression: this.expression('els => { if (!els[0]) throw new Error("no element"); return els[0]; }'), awaitPromise: true});
    if (exceptionDetails) throw new Error(`${this.describe()}：找不到文件选择框`);
    await this.page.send('DOM.setFileInputFiles', {objectId: result.objectId, files: (Array.isArray(files) ? files : [files]).map(file => path.resolve(file))});
  }
}

// 截图出错（例如超时）只记一次警告，门禁照常用 DOM 断言判定；素材脚本传 required 时直接报错。
const shots = {problem: null};
export const screenshotProblem = () => shots.problem;
export function noteScreenshots(report) {
  if (shots.problem) (report.warnings ||= []).push(shots.problem);
}

// ---------- 键盘：键名与组合键（Playwright 写法，如 Shift+Tab、Alt+Shift+M） ----------
const MODIFIER_BITS = {Alt: 1, Control: 2, Meta: 4, Shift: 8};
const NAMED_KEYS = {
  Enter: {code: 'Enter', keyCode: 13, text: '\r'}, Escape: {code: 'Escape', keyCode: 27}, Tab: {code: 'Tab', keyCode: 9},
  Backspace: {code: 'Backspace', keyCode: 8}, Delete: {code: 'Delete', keyCode: 46}, Space: {key: ' ', code: 'Space', keyCode: 32, text: ' '},
  ArrowLeft: {code: 'ArrowLeft', keyCode: 37}, ArrowUp: {code: 'ArrowUp', keyCode: 38}, ArrowRight: {code: 'ArrowRight', keyCode: 39}, ArrowDown: {code: 'ArrowDown', keyCode: 40},
  Home: {code: 'Home', keyCode: 36}, End: {code: 'End', keyCode: 35}, PageUp: {code: 'PageUp', keyCode: 33}, PageDown: {code: 'PageDown', keyCode: 34},
  Shift: {code: 'ShiftLeft', keyCode: 16}, Control: {code: 'ControlLeft', keyCode: 17}, Alt: {code: 'AltLeft', keyCode: 18}, Meta: {code: 'MetaLeft', keyCode: 91},
};
function keyInfo(name) {
  const normalized = name === 'ControlOrMeta' ? (process.platform === 'darwin' ? 'Meta' : 'Control') : name;
  const named = Object.keys(NAMED_KEYS).find(key => key.toLowerCase() === normalized.toLowerCase());
  if (named) return {key: NAMED_KEYS[named].key || named, ...NAMED_KEYS[named]};
  if (normalized.length === 1) {
    const char = normalized;
    const upper = char.toUpperCase();
    if (/[a-z]/i.test(char)) return {key: char, code: `Key${upper}`, keyCode: upper.charCodeAt(0), text: char};
    if (/[0-9]/.test(char)) return {key: char, code: `Digit${char}`, keyCode: char.charCodeAt(0), text: char};
    return {key: char, code: '', keyCode: char.charCodeAt(0), text: char};
  }
  throw new Error(`不认识的按键：${name}`);
}

export class Page {
  constructor(browser, targetId, sessionId) {
    this.browser = browser;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.listeners = {pageerror: [], console: [], request: [], requestfailed: [], response: [], dialog: []};
    this.waiters = new Set();
    this.requests = new Map();
    this.pointer = {x: 0, y: 0, buttons: 0};
    this.modifiers = 0;
    this.dpr = 1;
    this.interceptor = null;
  }
  send(method, params = {}, timeout) { return this.browser.connection.send(method, params, this.sessionId, timeout); }
  async init() {
    for (const domain of ['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable']) await this.send(domain).catch(() => {});
    // 多个窗口同时存在时每个页面都当作有焦点：键盘事件、:focus-visible 与 document.hasFocus() 不受窗口切换影响。
    await this.send('Emulation.setFocusEmulationEnabled', {enabled: true}).catch(() => {});
    return this;
  }
  on(event, fn) { (this.listeners[event] ||= []).push(fn); return this; }
  once(event, fn) { const wrapped = (...args) => { this.off(event, wrapped); return fn(...args); }; return this.on(event, wrapped); }
  off(event, fn) { this.listeners[event] = (this.listeners[event] || []).filter(item => item !== fn); return this; }
  emit(event, value) { for (const fn of [...(this.listeners[event] || [])]) fn(value); }
  // 事件是实时送达的；保留这两个空方法，门禁里调用它们不影响行为。
  async pump() {}
  async afterAction() {}

  onEvent(method, params) {
    for (const waiter of this.waiters) if (waiter.method === method) waiter.resolve(params);
    if (method === 'Runtime.exceptionThrown') {
      const details = params.exceptionDetails || {};
      const message = details.exception?.description?.split('\n')[0] || details.text || 'Uncaught';
      this.emit('pageerror', Object.assign(new Error(message), {stack: details.exception?.description || '', url: details.url}));
    } else if (method === 'Runtime.consoleAPICalled') {
      const text = (params.args || []).map(arg => arg.value ?? arg.description ?? '').join(' ');
      const frame = params.stackTrace?.callFrames?.[0];
      const type = params.type === 'warning' ? 'warning' : params.type;
      this.emit('console', {type: () => type, text: () => text, location: () => ({url: frame?.url || ''})});
    } else if (method === 'Log.entryAdded' && params.entry?.level === 'error' && params.entry.source === 'network') {
      this.emit('console', {type: () => 'error', text: () => params.entry.text, location: () => ({url: params.entry.url || ''})});
    } else if (method === 'Network.requestWillBeSent') {
      // loadingFailed 只带 requestId，地址要从发出时记下。
      this.requests.set(params.requestId, params.request?.url || '');
      if (this.requests.size > 4000) this.requests.delete(this.requests.keys().next().value);
      this.emit('request', {url: () => params.request?.url || ''});
    } else if (method === 'Network.loadingFailed' && !params.canceled) {
      const url = this.requests.get(params.requestId) || '';
      this.emit('requestfailed', {url: () => url, failure: () => ({errorText: params.errorText})});
    } else if (method === 'Network.responseReceived') {
      this.emit('response', {url: () => params.response.url, status: () => params.response.status});
    } else if (method === 'Page.javascriptDialogOpening') {
      void this.handleDialog(params);
    } else if (method === 'Fetch.requestPaused') {
      void this.interceptor?.(params);
    }
  }
  // 有 dialog 监听就交给它（accept / dismiss），没有就按浏览器默认关掉。
  async handleDialog(params) {
    const answer = (accept, promptText) => this.send('Page.handleJavaScriptDialog', {accept, ...(promptText !== undefined ? {promptText} : {})}).catch(() => {});
    const dialog = {message: () => params.message || '', type: () => params.type || '', accept: text => answer(true, text), dismiss: () => answer(false)};
    const listeners = [...(this.listeners.dialog || [])];
    if (listeners.length) await Promise.all(listeners.map(fn => fn(dialog)));
    else await answer(false);
  }
  waitForEvent(method, timeout = 30000) {
    let waiter;
    const promise = new Promise((resolve, reject) => {
      waiter = {method, resolve};
      waiter.timer = setTimeout(() => reject(new Error(`等待 ${method} 超时`)), timeout);
    });
    this.waiters.add(waiter);
    return promise.finally(() => { clearTimeout(waiter.timer); this.waiters.delete(waiter); });
  }

  async evaluate(fn, arg) {
    const expression = typeof fn === 'function' ? `(${fn})(${arg === undefined ? '' : JSON.stringify(arg)})` : String(fn);
    const {result, exceptionDetails} = await this.send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true, userGesture: true});
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description?.split('\n')[0] || exceptionDetails.text || '页面脚本出错');
    return result.value;
  }
  async waitForFunction(fn, arg, {timeout = 10000, polling = 100} = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const value = await this.evaluate(fn, arg).catch(() => undefined);
      if (value) return value;
      if (Date.now() > deadline) throw new Error(`waitForFunction 超时（${timeout}ms）`);
      await sleep(polling);
    }
  }
  waitForTimeout(ms) { return sleep(ms); }
  waitForSelector(selector, options) { return this.locator(selector).waitFor(options); }
  locator(selector) { return new Locator(this, [Locator.parse(selector)]); }
  async title() { return this.evaluate('document.title'); }
  async url() { return this.evaluate('location.href'); }

  // 跨文档导航等 load（或 DOMContentLoaded）；只改 hash 的同文档导航等 navigatedWithinDocument，
  // 否则紧接着的 reload 会把还没落地的 hash 导航取消掉。
  async goto(url, {timeout = 30000, waitUntil = 'load'} = {}) {
    const event = waitUntil === 'domcontentloaded' ? 'Page.domContentEventFired' : 'Page.loadEventFired';
    const loaded = this.waitForEvent(event, timeout);
    const within = this.waitForEvent('Page.navigatedWithinDocument', 5000);
    loaded.catch(() => {});
    within.catch(() => {});
    const result = await this.send('Page.navigate', {url});
    if (result.errorText) throw new Error(`打开 ${url} 失败：${result.errorText}`);
    if (waitUntil === 'commit') return;
    if (!result.loaderId) { await within.catch(() => {}); return; }
    await loaded;
  }
  async reload({timeout = 30000} = {}) {
    const loaded = this.waitForEvent('Page.loadEventFired', timeout);
    await this.send('Page.reload');
    await loaded;
  }
  async setViewportSize({width, height}, deviceScaleFactor = this.dpr) {
    this.dpr = deviceScaleFactor;
    await this.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor, mobile: false});
  }
  async emulateMedia({colorScheme} = {}) {
    await this.send('Emulation.setEmulatedMedia', {features: colorScheme ? [{name: 'prefers-color-scheme', value: colorScheme}] : []});
  }
  async transparentBackground(on = true) {
    await this.send('Emulation.setDefaultBackgroundColorOverride', on ? {color: {r: 0, g: 0, b: 0, a: 0}} : {});
  }
  // 每个新文档最先执行；fn 为函数时按 (fn)(arg) 调用。
  async addInitScript(fn, arg) {
    const source = typeof fn === 'function' ? `(${fn})(${JSON.stringify(arg ?? null)});` : String(fn);
    await this.send('Page.addScriptToEvaluateOnNewDocument', {source});
  }
  async addScriptTag({url}) {
    await this.evaluate(src => new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = src; script.onload = resolve; script.onerror = () => reject(new Error('脚本加载失败：' + src)); document.head.append(script); }), url);
  }
  async addStyleTag({content}) {
    await this.evaluate(css => { const style = document.createElement('style'); style.textContent = css; document.head.append(style); }, content);
  }
  async setContent(html) {
    const {frameTree} = await this.send('Page.getFrameTree');
    await this.send('Page.setDocumentContent', {frameId: frameTree.frame.id, html});
  }
  async setInputFiles(selector, files) { return this.locator(selector).setInputFiles(files); }
  async bringToFront() { await this.send('Page.bringToFront').catch(() => {}); }
  // 等页面再渲染出 frames 帧：鼠标移动这类输入按帧派发，交给页面的 requestAnimationFrame 收尾。
  async settle(frames = 2) {
    await this.evaluate(n => new Promise(resolve => { let left = n; const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }), frames).catch(() => {});
  }
  // 返回文件路径；出错时返回 null 并记警告（required 时抛错，给素材脚本用）。
  async screenshot({path: file, fullPage = false, clip, omitBackground = false, required = false} = {}) {
    if (!file) throw new Error('screenshot 需要 path');
    fs.mkdirSync(path.dirname(file), {recursive: true});
    try {
      if (omitBackground) await this.transparentBackground(true);
      const params = {format: 'png'};
      if (clip) {
        // 裁剪框在当前视口内时不扩展视口：captureBeyondViewport 会给页面触发一次 resize，
        // 监听 resize 的挂件（如选区操作条）会在截图前自行关闭，截到的就只剩底下的网页。
        const {cssLayoutViewport: view} = await this.send('Page.getLayoutMetrics');
        const inside = clip.x >= view.pageX && clip.y >= view.pageY && clip.x + clip.width <= view.pageX + view.clientWidth && clip.y + clip.height <= view.pageY + view.clientHeight;
        Object.assign(params, {clip: {...clip, scale: 1}, captureBeyondViewport: !inside});
      }
      else if (fullPage) {
        const {cssContentSize} = await this.send('Page.getLayoutMetrics');
        Object.assign(params, {clip: {x: 0, y: 0, width: Math.ceil(cssContentSize.width), height: Math.ceil(cssContentSize.height), scale: 1}, captureBeyondViewport: true});
      }
      const {data} = await this.send('Page.captureScreenshot', params, 30000);
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    } catch (error) {
      shots.problem ||= `截图失败：${error.message}`;
      if (required) throw error;
      return null;
    } finally {
      if (omitBackground) await this.transparentBackground(false).catch(() => {});
    }
  }
  async close() { this.stopIntercept(); await this.browser.send('Target.closeTarget', {targetId: this.targetId}).catch(() => {}); }

  // 拦截：handler(request) 返回 {status, headers, body} 则就地回包，返回 {abort: true} 则拦掉，返回 null 则放行。
  async intercept(patterns, handler) {
    this.interceptor = async ({requestId, request}) => {
      try {
        const reply = await handler(request);
        if (reply?.abort) await this.send('Fetch.failRequest', {requestId, errorReason: 'BlockedByClient'});
        else if (reply) {
          const body = Buffer.from(reply.body ?? '').toString('base64');
          const headers = Object.entries(reply.headers || {}).map(([name, value]) => ({name, value: String(value)}));
          await this.send('Fetch.fulfillRequest', {requestId, responseCode: reply.status || 200, responseHeaders: headers, body});
        } else await this.send('Fetch.continueRequest', {requestId});
      } catch {
        await this.send('Fetch.failRequest', {requestId, errorReason: 'Failed'}).catch(() => {});
      }
    };
    await this.send('Fetch.enable', {patterns: patterns.map(urlPattern => ({urlPattern, requestStage: 'Request'}))});
  }
  stopIntercept() {
    if (!this.interceptor) return;
    this.interceptor = null;
    void this.send('Fetch.disable').catch(() => {});
  }

  // ---------- 原生输入 ----------
  get mouse() {
    const at = this.pointer;
    const dispatch = (type, extra = {}) => this.send('Input.dispatchMouseEvent', {type, x: at.x, y: at.y, modifiers: this.modifiers, ...extra});
    const button = name => ({left: 1, right: 2, middle: 4})[name] || 1;
    return {
      // steps：拖选、拖拽要一串中间点才会触发 selectionchange 与拖动逻辑。
      move: async (x, y, {steps = 1} = {}) => {
        const from = {x: at.x, y: at.y};
        for (let i = 1; i <= steps; i++) {
          at.x = from.x + (x - from.x) * i / steps;
          at.y = from.y + (y - from.y) * i / steps;
          await dispatch('mouseMoved', {buttons: at.buttons, button: at.buttons ? 'left' : 'none'});
        }
        await this.settle();
      },
      down: async ({button: name = 'left', clickCount = 1} = {}) => { at.buttons |= button(name); await dispatch('mousePressed', {button: name, buttons: at.buttons, clickCount}); },
      up: async ({button: name = 'left', clickCount = 1} = {}) => { at.buttons &= ~button(name); await dispatch('mouseReleased', {button: name, buttons: at.buttons, clickCount}); await this.settle(); },
      // 双击与浏览器一致：clickCount 依次为 1、2 的两组按下抬起。
      click: async (x, y, {button: name = 'left', clickCount = 1, delay} = {}) => {
        at.x = x; at.y = y;
        await dispatch('mouseMoved', {buttons: at.buttons, button: 'none'});
        for (let count = 1; count <= clickCount; count++) {
          at.buttons |= button(name);
          await dispatch('mousePressed', {button: name, buttons: at.buttons, clickCount: count});
          if (delay) await sleep(delay);
          at.buttons &= ~button(name);
          await dispatch('mouseReleased', {button: name, buttons: at.buttons, clickCount: count});
        }
        await this.settle();
      },
      wheel: (deltaX, deltaY) => dispatch('mouseWheel', {deltaX, deltaY}),
    };
  }
  get keyboard() {
    const keyEvent = async (type, info) => {
      // 按着 Alt/Ctrl/Meta 时不输入字符（与浏览器一致），只发按键事件。
      const text = type === 'keyDown' && info.text && !(this.modifiers & (MODIFIER_BITS.Alt | MODIFIER_BITS.Control | MODIFIER_BITS.Meta))
        ? ((this.modifiers & MODIFIER_BITS.Shift) && info.text.length === 1 ? info.text.toUpperCase() : info.text) : undefined;
      await this.send('Input.dispatchKeyEvent', {
        type: type === 'keyDown' && !text ? 'rawKeyDown' : type, modifiers: this.modifiers,
        key: (this.modifiers & MODIFIER_BITS.Shift) && info.key.length === 1 ? info.key.toUpperCase() : info.key,
        code: info.code, windowsVirtualKeyCode: info.keyCode, ...(text ? {text, unmodifiedText: text} : {}),
      });
    };
    const down = async name => { const info = keyInfo(name); await keyEvent('keyDown', info); if (MODIFIER_BITS[info.key]) this.modifiers |= MODIFIER_BITS[info.key]; };
    const up = async name => { const info = keyInfo(name); if (MODIFIER_BITS[info.key]) this.modifiers &= ~MODIFIER_BITS[info.key]; await keyEvent('keyUp', info); };
    return {
      down, up,
      // 组合键：依次按下修饰键，按一下最后一个键，再倒序松开。
      press: async chord => {
        const parts = chord === '+' ? ['+'] : chord.split('+').filter(Boolean);
        const modifiers = parts.slice(0, -1);
        for (const name of modifiers) await down(name);
        await down(parts.at(-1));
        await up(parts.at(-1));
        for (const name of modifiers.reverse()) await up(name);
        await this.settle(1);
      },
      type: async text => { for (const char of String(text)) { await down(char); await up(char); } },
      insertText: async text => { await this.send('Input.insertText', {text: String(text)}); },
    };
  }
}

// ---------- 扩展辅助 ----------
// 扩展页里查网页标签页的 id（chrome.tabs 只在扩展页可用）。
export async function tabIdOf(extPage, urlPattern) {
  return extPage.evaluate(async pattern => (await chrome.tabs.query({url: pattern}))[0]?.id ?? null, urlPattern);
}

// ---------- 本地静态服务 ----------
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.wasm': 'application/wasm'};
export const mimeOf = file => MIME[path.extname(file)] || 'application/octet-stream';

export async function staticServer(root, {routes = {}} = {}) {
  const base = path.resolve(root);
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(req.url.split('?')[0]);
    if (routes[pathname]) { await routes[pathname](req, res); return; }
    // 浏览器会自动请求站点图标；fixture 没有这个文件，回空响应免得控制台记一条 404。
    if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    const file = path.resolve(base, '.' + pathname);
    if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', mimeOf(file));
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {server, port: server.address().port, base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve))};
}
