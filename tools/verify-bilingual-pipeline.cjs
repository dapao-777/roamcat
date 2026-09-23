/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// 回归：本页双语的三步调度。
// 1) 附近最多两批同时在飞。
// 2) 一批失败只标这一批，页面继续翻译其它段。
// 3) 流式进度在整批结束前先把已完成的句子画上。
// 运行：PLAYWRIGHT_CORE_PATH=<playwright-core 路径> node tools/verify-bilingual-pipeline.cjs
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
const extension = fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-pipeline-'));
fs.cpSync(source, extension, { recursive: true });
const manifestPath = path.join(extension, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
fs.writeFileSync(manifestPath, JSON.stringify(manifest));

const stats = { active: 0, maxActive: 0, pageRequests: 0, stream: { open: false, ended: false, saw: '' } };
let scenario = 'overlap';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function article(marker) {
  const paragraphs = Array.from({ length: 20 }, (_, index) => `<p id="paragraph-${index}">${marker} paragraph ${index}. The database uses an index to find records quickly. A cache reduces latency when requests repeat.</p>`).join('');
  return `<!doctype html><html lang="en"><head><title>${marker}</title></head><body><nav>Home · About</nav><main style="max-width:760px;margin:40px auto;font:20px/1.5 Georgia"><article><h1>${marker} databases</h1>${paragraphs}</article></main></body></html>`;
}
function pageItems(body) {
  const request = body?.messages?.at(-1)?.content;
  if (typeof request !== 'string' || !request.includes('"context"')) return null;
  try {
    const parsed = JSON.parse(request);
    if (!Array.isArray(parsed.items) || !parsed.items[0]?.context) return null;
    return parsed.items;
  } catch { return null; }
}
function jsonChat(res, content) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }));
}
function writeDelta(res, text, done) {
  res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: done ? 'stop' : null }] })}\n\n`);
}
async function handleApi(req, res, raw) {
  const body = JSON.parse(raw || '{}');
  if (req.url.endsWith('/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ data: [{ id: 'audit-model' }] }));
    return;
  }
  const schema = body.response_format?.json_schema?.schema;
  if (schema?.properties?.probe) return jsonChat(res, JSON.stringify({ probe: schema.properties.probe.enum[0] }));
  const items = pageItems(body);
  if (!items) return jsonChat(res, JSON.stringify({ items: [] }));
  stats.pageRequests += 1;
  const requestNumber = stats.pageRequests;
  stats.active += 1;
  stats.maxActive = Math.max(stats.maxActive, stats.active);
  try {
    if (scenario === 'fail' && requestNumber === 1) {
      await sleep(400);
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: { message: 'fixture batch failed' } }));
      return;
    }
    if (scenario === 'stream' && requestNumber === 1 && body.stream && items.length > 1) {
      const first = items[0], second = items[1];
      const head = `{"items":[{"id":${JSON.stringify(first.id)},"translation":"甲段已经译出。"},{"id":${JSON.stringify(second.id)},"translation":"缓`;
      const tail = items.slice(1).map((item, index) => index === 0 ? '存降低延迟。"}' : `,{"id":${JSON.stringify(item.id)},"translation":"附近段落已译出。"}`).join('') + ']}';
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
      writeDelta(res, head, false);
      stats.stream.open = true;
      stats.stream.saw = 'head';
      await sleep(1200);
      writeDelta(res, tail, true);
      res.write('data: [DONE]\n\n');
      stats.stream.ended = true;
      res.end();
      return;
    }
    await sleep(scenario === 'overlap' ? 450 : 40);
    jsonChat(res, JSON.stringify({ items: items.map(item => ({ id: item.id, translation: '数据库使用索引。' })) }));
  } finally {
    stats.active -= 1;
  }
}
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }).end(); return; }
  if (req.url.startsWith('/v1/')) {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => { void handleApi(req, res, raw).catch(error => { if (!res.headersSent) res.writeHead(500); res.end(String(error && error.stack || error)); }); });
    return;
  }
  const marker = new URL(req.url, 'http://127.0.0.1').searchParams.get('case') || 'Alpha';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(article(marker));
});

const report = { checks: [], failures: [] };
async function check(name, fn) {
  try { const detail = await fn(); report.checks.push({ name, ...(detail ? { detail } : {}) }); console.log('PASS ' + name + (detail ? ' · ' + detail : '')); }
  catch (error) { report.failures.push({ name, error: error.message }); console.log('FAIL ' + name + ': ' + error.message); }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-pipeline-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge', headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
    viewport: { width: 1280, height: 900 },
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host, base = `chrome-extension://${id}`;
    for (const existing of context.pages()) await existing.close().catch(() => {});
    const page = await context.newPage();
    page.on('pageerror', error => report.failures.push({ name: 'pageerror', error: error.message }));
    await page.goto(base + '/ui/options.html');
    await page.waitForTimeout(500);
    const request = async (type, payload = {}) => {
      const response = await page.evaluate(message => chrome.runtime.sendMessage(message), { type, ...payload });
      assert.ok(response?.ok, response?.error || 'No response');
      return response.data;
    };
    await request('STATE_PATCH', { patch: { providerKind: 'api', assistanceMode: 'on-demand', domain: 'general' } });
    await request('STATE_PATCH', { patch: { apiServices: [{ id: 'audit', name: 'Local audit fixture', providerId: 'openai-compatible', baseUrl: origin + '/v1', model: 'audit-model', apiKey: 'audit-fixture-not-a-real-key', maxConcurrency: 2, options: {} }], activeApiServiceId: 'audit' } });
    const tabPage = await context.newPage();
    tabPage.on('pageerror', error => report.failures.push({ name: 'article-pageerror', error: error.message }));
    const inPage = func => page.evaluate(({ tabId, func }) => chrome.scripting.executeScript({ target: { tabId }, func: new Function('return (' + func + ')()') }), { tabId, func: func.toString() });
    let tabId = 0;
    async function openCase(name) {
      scenario = name;
      stats.active = 0; stats.maxActive = 0; stats.pageRequests = 0;
      stats.stream = { open: false, ended: false, saw: '' };
      await tabPage.goto(origin + '/article?case=' + name, { waitUntil: 'domcontentloaded' });
      tabId = await page.evaluate(async url => (await chrome.tabs.query({ url }))[0].id, origin + '/article?case=' + name);
      await request('PAGE_UI_INJECT', { tabId });
      await tabPage.locator('#roamcat-pet-host').waitFor({ state: 'attached', timeout: 10000 });
      const begun = await request('EMERGENCY_BEGIN', { tabId, url: origin + '/article?case=' + name });
      const started = await page.evaluate(({ tabId, message }) => chrome.tabs.sendMessage(tabId, message, { frameId: 0 }), { tabId, message: { type: 'SS_EMERGENCY_START', token: begun.token, resume: false } });
      assert.ok(started?.ok, started?.error || '未能开始双语');
    }
    async function emergency() {
      const frames = await inPage(() => globalThis.__ROAMCAT_CONTENT__.status().emergency);
      return frames[0].result;
    }

    await check('附近两批同时在飞', async () => {
      await openCase('overlap');
      await tabPage.locator('[data-roamcat-ui="emergency-translation"]').first().waitFor({ state: 'visible', timeout: 20000 });
      const status = await emergency();
      assert.equal(stats.maxActive, 2, '同时在飞的本页翻译请求是 ' + stats.maxActive);
      assert.ok(status.active, '整页被停掉了');
      assert.ok(status.completed > 0, '没有段落译完');
      return `峰值 ${stats.maxActive} 批，已译 ${status.completed} 段`;
    });

    await check('一批失败后其它段落继续', async () => {
      await page.evaluate(({ tabId }) => chrome.tabs.sendMessage(tabId, { type: 'SS_EMERGENCY_END' }, { frameId: 0 }).catch(() => {}), { tabId }).catch(() => {});
      await openCase('fail');
      await tabPage.locator('[data-roamcat-ui="emergency-translation"]').first().waitFor({ state: 'visible', timeout: 20000 });
      await tabPage.getByRole('button', { name: '重试这一段' }).first().waitFor({ state: 'visible', timeout: 15000 });
      const before = await emergency();
      assert.equal(before.active, true, '失败后整页停了');
      assert.ok(before.failed > 0, '失败批次没有标出来');
      assert.ok(before.completed > 0, '其它批次没有继续');
      const failedBefore = before.failed;
      await tabPage.getByRole('button', { name: '重试这一段' }).first().click();
      let after = before;
      for (let attempt = 0; attempt < 30 && after.failed >= failedBefore; attempt++) {
        await sleep(400);
        after = await emergency();
      }
      assert.ok(after.failed < failedBefore, '重试没有减少失败段落');
      assert.equal(after.active, true, '重试后整页停了');
      return `失败 ${failedBefore} 段后继续，重试后剩 ${after.failed} 段`;
    });

    await check('流式进度先画出已经译完的句子', async () => {
      await page.evaluate(({ tabId }) => chrome.tabs.sendMessage(tabId, { type: 'SS_EMERGENCY_END' }, { frameId: 0 }).catch(() => {}), { tabId }).catch(() => {});
      const seen = openCase('stream').then(async () => {
        await tabPage.getByText('甲段已经译出。').first().waitFor({ state: 'visible', timeout: 15000 });
        return stats.stream.ended;
      });
      const endedBeforePaint = await seen;
      assert.equal(endedBeforePaint, false, '整批结束后才出现第一句');
      assert.equal(stats.stream.saw, 'head');
      await tabPage.locator('[data-roamcat-ui="emergency-translation"]').first().waitFor({ state: 'visible', timeout: 15000 });
      return '第一句在响应结束前出现';
    });
  } finally {
    await context.close().catch(() => {});
    server.close();
    fs.rmSync(extension, { recursive: true, force: true });
    fs.rmSync(profile, { recursive: true, force: true });
  }
  fs.mkdirSync(path.resolve(__dirname, '../preview/audit'), { recursive: true });
  fs.writeFileSync(path.resolve(__dirname, '../preview/audit/bilingual-pipeline.json'), JSON.stringify(report, null, 2));
  if (report.failures.length) process.exitCode = 1;
  console.log(JSON.stringify({ passed: report.checks.length, failures: report.failures }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
