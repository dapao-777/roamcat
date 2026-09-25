/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// 回归：验证「自动连接本机连接器」的节流与失败退避（无需真实连接器/注册表）。
// 观察信号：未安装连接器时，一次失败的自动连接会把 subscription.error 写成「未找到或未授权本地…」。
//   · 修复后：首次尝试失败即在会话内标记 failed，后续 load() 不再尝试
//             （chrome.storage.session 在 Service Worker 空闲重启后仍然保留，重启后同样被阻止）
//             → SW 重启后 subscription.error 恢复为 null（新模块未发起过连接）
//   · 修复前：没有节流标记，且 load() 会同步等待连接（连接器无响应时最长 45 秒）
// 运行：PLAYWRIGHT_CORE_PATH=<playwright-core 路径> node tools/verify-connector-throttle.cjs
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
function loadPlaywright() {
  const override = process.env.PLAYWRIGHT_CORE_PATH;
  try { return require(override || 'playwright-core'); } catch { throw new Error('需要 PLAYWRIGHT_CORE_PATH'); }
}
const { chromium } = loadPlaywright();
const source = path.resolve(process.env.EXTENSION_DIR || path.join(__dirname, '../roamcat-0.0.1/extension'));
const extension = fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-throttle-ext-'));
fs.cpSync(source, extension, { recursive: true });
const manifestPath = path.join(extension, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
fs.writeFileSync(manifestPath, JSON.stringify(manifest));

const report = { checks: [], failures: [] };
async function check(name, fn) {
  try { const detail = await fn(); report.checks.push({ name, ...(detail ? { detail } : {}) }); console.log('PASS ' + name + (detail ? ' · ' + detail : '')); }
  catch (e) { report.failures.push({ name, error: e.message }); console.log('FAIL ' + name + ': ' + e.message); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-throttle-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge', headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
    viewport: { width: 1280, height: 800 },
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const page = await context.newPage();
    page.on('pageerror', e => report.failures.push({ name: 'pageerror', error: e.message }));
    await page.goto('chrome-extension://' + id + '/ui/options.html');
    await page.waitForTimeout(500);
    const request = async (type, payload = {}) => page.evaluate(m => chrome.runtime.sendMessage(m), { type, ...payload });
    const marker = () => page.evaluate(async () => (await chrome.storage.session.get('autoConnect:chatgpt'))['autoConnect:chatgpt'] || null);

    await check('first auto-connect attempt happens once and backs off on failure', async () => {
      await page.evaluate(async () => {
        const { settings } = await chrome.storage.local.get('settings');
        await chrome.storage.local.set({ subscriptionLinked: true, settings: { ...settings, providerKind: 'chatgpt' } });
      });
      for (let i = 0; i < 8; i++) { const r = await request('STATE_GET'); assert.ok(r?.ok, r?.error); }
      await sleep(2500);
      const value = await marker();
      assert.ok(value && value.failed === true, '首次尝试失败后应标记 failed：' + JSON.stringify(value));
      const state = await request('STATE_GET');
      assert.ok(state.data.subscription.error, '首次失败应记录错误信息');
      return JSON.stringify(value);
    });

    await check('the auto-connect marker is stable across repeated loads', async () => {
      // 旧代码没有节流标记：此断言在旧实现下会失败（标记不存在）。
      // 标记稳定即说明后续 load() 没有再发起新的自动连接尝试。
      const before = JSON.stringify(await marker());
      for (let i = 0; i < 6; i++) { const r = await request('STATE_GET'); assert.ok(r?.ok, r?.error); }
      await sleep(1500);
      const after = JSON.stringify(await marker());
      assert.equal(after, before, `自动连接标记被改写：${before} -> ${after}（说明又尝试了一次）`);
      return after;
    });

    await check('extension stays healthy without a connector installed', async () => {
      const models = await request('MODELS_LIST', { refresh: false, kind: 'chatgpt' });
      assert.ok(models?.ok === false, '未安装连接器时 MODELS_LIST 应返回可读错误');
      assert.ok(/连接器/.test(models.error), '错误信息应可读：' + models.error);
      const state = await request('STATE_GET');
      assert.ok(state?.ok);
      return 'STATE_GET / MODELS_LIST 行为正常';
    });
  } finally {
    await context.close();
  }
  console.log(JSON.stringify({ passed: report.checks.length, failures: report.failures }, null, 2));
  if (report.failures.length) process.exitCode = 1;
})();
