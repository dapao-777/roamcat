/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// 回归：伴读猫快捷键行为（当前产品方向：Alt+Shift+T / 翻译本页 立即开始，不做二次确认）
// 1) 页面上按 Alt+Shift+T 会开始整页翻译；在输入框中按不触发。
// 2) Alt+Shift+M 提炼摘要；在输入框中按不触发。
// 3) 旋旋翻按钮仍可切换双语翻译。
// 运行：PLAYWRIGHT_CORE_PATH=<playwright-core 路径> node tools/verify-bilingual-shortcut.cjs
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os'), assert = require('node:assert/strict');
function loadPlaywright() {
  try { return require('playwright-core'); } catch (first) {
    const override = process.env.PLAYWRIGHT_CORE_PATH;
    if (override) { try { return require(override); } catch {} }
    throw new Error(`找不到 playwright-core（${first?.message || first}）。请设置 PLAYWRIGHT_CORE_PATH。`);
  }
}
const { chromium } = loadPlaywright();
const source = path.resolve(process.env.EXTENSION_DIR || path.join(__dirname, '../roamcat-0.2.0/extension'));
const extension = fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-shortcut-'));
fs.cpSync(source, extension, { recursive: true });
const manifestPath = path.join(extension, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
fs.writeFileSync(manifestPath, JSON.stringify(manifest));

const article = `<!doctype html><html lang="en"><head><title>Reading fixture</title></head><body><nav>Home · About</nav><main style="max-width:760px;margin:60px auto;font:20px/1.8 Georgia"><article><h1>How databases reduce latency</h1>${Array.from({ length: 8 }, (_, i) => `<p id="paragraph-${i}">The database uses an index to find records quickly. A cache reduces latency when requests repeat. Careful readers compare the evidence before they reach a conclusion.</p>`).join('')}<input aria-label="Excluded input" value="Do not annotate this input"></article></main></body></html>`;
const calls = { translation: 0, summary: 0 };
function fixtureResult(b) {
  const schema = b.response_format?.json_schema?.schema;
  if (schema?.properties?.probe) return { probe: schema.properties.probe.enum[0] };
  const request = JSON.parse(b.messages.at(-1).content);
  if (schema?.properties?.takeaway) return { takeaway: '索引可以加快数据库查询。', highlights: ['**性能**：减少查找耗时。'], keywords: ['index'], domain: 'data' };
  if (request.items) {
    const groups = schema?.properties?.items?.items?.properties?.groups;
    if (groups) return { items: request.items.map(item => ({ id: item.id, groups: [{ role: 'subject', first: 1, last: 2 }] })) };
    if (typeof request.items[0]?.sentence === 'string') return { items: request.items.map(item => ({ id: item.id, target: null, meaning: { en: null, zh: null }, sentenceTranslation: null })) };
    calls.translation += request.items.length;
    return { items: request.items.map(item => ({ id: item.id, translation: '数据库使用索引快速查找记录。' })) };
  }
  return { result: { level: request.level, [request.level === 'hint' ? 'hint' : 'translation']: request.level === 'hint' ? 'a lookup structure' : '索引', sense: 'database lookup structure' } };
}
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }).end(); return; }
  if (req.url.startsWith('/v1/')) {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      const b = JSON.parse(body || '{}');
      if (b.response_format?.json_schema?.schema?.properties?.takeaway) calls.summary += 1;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'audit-model' }] }));
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(fixtureResult(b)) }, finish_reason: 'stop' }] }));
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(article);
});

const report = { checks: [], failures: [] };
async function check(name, fn) {
  try { const detail = await fn(); report.checks.push({ name, ...(detail ? { detail } : {}) }); console.log('PASS ' + name + (detail ? ' · ' + detail : '')); }
  catch (e) { report.failures.push({ name, error: e.message }); console.log('FAIL ' + name + ': ' + e.message); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-shortcut-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge', headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
    viewport: { width: 1440, height: 1000 },
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host, base = `chrome-extension://${id}`;
    for (const existing of context.pages()) await existing.close();
    const page = await context.newPage();
    page.on('pageerror', e => report.failures.push({ name: 'pageerror', error: e.message }));
    await page.goto(base + '/ui/options.html');
    await page.waitForTimeout(600);
    const request = async (type, payload = {}) => {
      const r = await page.evaluate(m => chrome.runtime.sendMessage(m), { type, ...payload });
      assert.ok(r?.ok, r?.error || 'No response'); return r.data;
    };
    await request('STATE_PATCH', { patch: { providerKind: 'api', assistanceMode: 'ambient', domain: 'general' } });
    await request('STATE_PATCH', { patch: { apiServices: [{ id: 'audit', name: 'Local audit fixture', providerId: 'openai-compatible', baseUrl: origin + '/v1', model: 'audit-model', apiKey: 'audit-fixture-not-a-real-key', options: {} }], activeApiServiceId: 'audit' } });
    const tabPage = await context.newPage();
    await tabPage.goto(origin + '/article');
    const tabId = await page.evaluate(async url => (await chrome.tabs.query({ url }))[0].id, origin + '/article');
    await request('PAGE_UI_INJECT', { tabId });
    const send = message => page.evaluate(({ tabId, message }) => chrome.tabs.sendMessage(tabId, message, { frameId: 0 }), { tabId, message });
    let r = await send({ type: 'SS_SET_ENABLED', enabled: true });
    assert.ok(r.ok, r.error);
    await tabPage.locator('#roamcat-pet-host').waitFor({ state: 'attached', timeout: 10000 });
    await tabPage.bringToFront();

    // content script 位于隔离世界：统一通过 chrome.scripting.executeScript 访问
    const inPage = func => page.evaluate(({ tabId, func }) => chrome.scripting.executeScript({ target: { tabId }, func: new Function('return (' + func + ')()') }), { tabId, func: func.toString() });
    const translations = () => tabPage.locator('[data-roamcat-ui="emergency-translation"]').count();
    const endTranslation = async () => { await send({ type: 'SS_EMERGENCY_END' }).catch(() => {}); await sleep(300); };

    await check('Alt+Shift+T starts page translation on the page', async () => {
      const before = calls.translation;
      await tabPage.locator('h1').click();
      await tabPage.keyboard.press('Alt+Shift+T');
      await tabPage.locator('[data-roamcat-ui="emergency-translation"]').first().waitFor({ state: 'visible', timeout: 20000 });
      assert.ok(calls.translation > before, '没有发出翻译请求');
      await tabPage.locator('nav [data-roamcat-ui="emergency-translation"]').first().waitFor({ state: 'attached', timeout: 15000 });
      const count = await translations();
      await endTranslation();
      assert.equal(await translations(), 0);
      return `已译 ${count} 段，返回英文正常`;
    });

    await check('Alt+Shift+T inside an input is ignored', async () => {
      const before = calls.translation;
      await tabPage.locator('input').focus();
      await tabPage.keyboard.press('Alt+Shift+T');
      await sleep(1500);
      assert.equal(await translations(), 0, '输入框中的快捷键仍然开始了翻译');
      assert.equal(calls.translation, before, '输入框中的快捷键仍然发出了翻译请求');
      return '输入框中不触发';
    });

    await check('Alt+Shift+M summarizes on the page but is ignored inside an input', async () => {
      await tabPage.locator('h1').click();
      await tabPage.keyboard.press('Alt+Shift+M');
      await tabPage.locator('#summary-content').getByText('索引可以加快数据库查询。').waitFor({ timeout: 15000 });
      assert.equal(calls.summary, 1);
      await inPage(() => globalThis.RoamCatPet.closeSummary());
      await tabPage.locator('input').focus();
      await tabPage.keyboard.press('Alt+Shift+M');
      await sleep(1500);
      assert.equal(calls.summary, 1, '输入框中的 Alt+Shift+M 仍然请求了摘要');
      return '页面触发 / 输入框忽略';
    });

    await check('Flip button toggles bilingual translation', async () => {
      await inPage(() => globalThis.RoamCatPet.closeSummary());
      await inPage(() => globalThis.RoamCatPet.openQuickDock());
      await tabPage.locator('#roamcat-flip-btn').click();
      await tabPage.locator('[data-roamcat-ui="emergency-translation"]').first().waitFor({ state: 'visible', timeout: 20000 });
      await inPage(() => globalThis.RoamCatPet.openQuickDock());
      await tabPage.locator('#roamcat-flip-btn').click();
      await sleep(800);
      assert.equal(await translations(), 0, '再次点击旋旋翻没有返回英文');
      return '开 / 关均正常';
    });

    await check('Toolbar entry still translates after confirmation-free flow', async () => {
      const { token } = await request('EMERGENCY_BEGIN', { tabId, url: origin + '/article' });
      r = await send({ type: 'SS_EMERGENCY_START', token, resume: false });
      assert.ok(r.ok, r.error);
      await tabPage.locator('[data-roamcat-ui="emergency-translation"]').first().waitFor({ state: 'visible', timeout: 15000 });
      await endTranslation();
      return '工具栏入口正常';
    });
  } finally {
    await context.close(); server.close();
  }
  fs.writeFileSync(path.resolve(__dirname, '../preview/audit/bilingual-shortcut.json'), JSON.stringify(report, null, 2));
  if (report.failures.length) process.exitCode = 1;
  console.log(JSON.stringify({ passed: report.checks.length, failures: report.failures }, null, 2));
})();
