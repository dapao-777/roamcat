/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// 回归：本页双语的调度与失败恢复。
// 1) 附近最多两批同时在飞。
// 2) 一批失败按退避表静默自动重发（页内 ROAMCAT_EMERGENCY_RETRY_DELAYS=[300,700,1200] 提速），
//    3 次耗尽才出手动「重试这一段」，点击后人工重发。
// 3) 流式进度在整批结束前先把已完成的句子画上。
// 4) 瞬时失败静默自动重发，成功后不露出重试按钮；重试间隔 ≥ 退避表首档。
// 5) 自动重试耗尽前绝不渲染失败 UI；耗尽后单元稳定 failed 且其它段落照常译出。
// 6) 批级 429 失败触发整泵冷却：同批指纹相邻请求间隔 ≥ 首档退避，全部批次最终译出。
// 运行：node tools/verify-bilingual-pipeline.cjs（需先 npm run build 生成 dist/extension；Edge + playwright-core，可用 PLAYWRIGHT_CORE_PATH 覆盖）
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os'), assert = require('node:assert/strict');
const { launchExtension } = require('./lib/edge-extension.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// 源码层（roamcat-0.0.1/extension）不含构建期页面 ui/*.html，无法作为 unpacked 扩展加载；
// 默认指向 dist/extension，缺产物时给出明确指引而不是在浏览器里超时。
const distDir = path.join(__dirname, '../dist/extension');
const legacyDir = path.join(__dirname, '../roamcat-0.0.1/extension');
const source = path.resolve(process.env.EXTENSION_DIR || (fs.existsSync(path.join(distDir, 'manifest.json')) ? distDir : legacyDir));
if (!fs.existsSync(path.join(source, 'ui/options.html')))
  throw new Error(`扩展目录缺少构建页面（ui/options.html）：${source}——请先运行 npm run build 生成 dist/extension，或用 EXTENSION_DIR 指向其它产物目录。`);
// 先暂存一份并补 host_permissions，再交给 launchExtension 二次拷贝加载；
// manifest.key 原样保留，dev 构建的固定扩展 ID 不变。
const staged = fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-pipeline-src-'));
fs.cpSync(source, staged, { recursive: true });
const manifestPath = path.join(staged, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
fs.writeFileSync(manifestPath, JSON.stringify(manifest));

const stats = { active: 0, maxActive: 0, pageRequests: 0, failKey: '', failRejects: 0, failAttempts: 0, stream: { open: false, ended: false, saw: '' }, requestLog: [], seenKeys: new Set() };
let scenario = 'overlap';
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
  const key = items.map(item => String(item.text)).join('\n');
  const logRow = { key, at: Date.now(), rejected: false };
  stats.requestLog.push(logRow);
  const reject = async (status, body) => {
    logRow.rejected = true;
    await sleep(status === 429 ? 40 : 400);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(body));
  };
  try {
    // fail/autoretry/exhaust 按首批文本指纹连拒（自动/手动重发同一批时文本一致）：
    // fail 连拒 4 次（初始 + 3 次退避自动重试）把批次留成稳定失败；autoretry 只拒 1 次；
    // exhaust 永远拒，验证重试耗尽后才落 failed。
    if (['fail', 'autoretry', 'exhaust'].includes(scenario) && requestNumber === 1) stats.failKey = key;
    if (stats.failKey && key === stats.failKey) {
      stats.failAttempts += 1;
      const allowed = scenario === 'fail' ? 4 : scenario === 'exhaust' ? Infinity : 1;
      if (stats.failRejects < allowed) {
        stats.failRejects += 1;
        await reject(500, { error: { message: 'fixture batch failed' } });
        return;
      }
    }
    // cooldown：每个批次指纹首次出现一律 429，检验批级失败把整泵打进冷却后再放行。
    if (scenario === 'cooldown' && !stats.seenKeys.has(key)) {
      stats.seenKeys.add(key);
      await reject(429, { error: { message: 'fixture rate limited' } });
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
  let browser;
  try {
    browser = await launchExtension({ headless: true, extensionDir: staged });
    const { context, extPage: page } = browser;
    page.on('pageerror', error => report.failures.push({ name: 'pageerror', error: error.message }));
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
      stats.failKey = ''; stats.failRejects = 0; stats.failAttempts = 0;
      stats.stream = { open: false, ended: false, saw: '' };
      stats.requestLog = []; stats.seenKeys = new Set();
      await tabPage.goto(origin + '/article?case=' + name, { waitUntil: 'domcontentloaded' });
      tabId = await page.evaluate(async url => (await chrome.tabs.query({ url }))[0].id, origin + '/article?case=' + name);
      await request('PAGE_UI_INJECT', { tabId });
      await tabPage.locator('#roamcat-pet-host').waitFor({ state: 'attached', timeout: 10000 });
      // content.js 在 document_idle 已执行，退避表按延迟读取设计——此处覆盖仍对后续调度生效。
      await inPage(() => { window.ROAMCAT_EMERGENCY_RETRY_DELAYS = [300, 700, 1200]; });
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
      // 失败批按退避表静默自动重发 3 次（1 初始 + 3 重试共 4 次全部被拒），等稳定失败态再读状态。
      for (let attempt = 0; attempt < 60 && stats.failAttempts < 4; attempt++) await sleep(250);
      assert.equal(stats.failAttempts, 4, '失败批次没有按退避表自动重发 3 次（attempts=' + stats.failAttempts + '）');
      await tabPage.getByRole('button', { name: '重试这一段' }).first().waitFor({ state: 'visible', timeout: 15000 });
      let before = await emergency();
      for (let attempt = 0; attempt < 25 && !before.failed; attempt++) { await sleep(200); before = await emergency(); }
      assert.equal(before.active, true, '失败后整页停了');
      assert.ok(before.failed > 0, '失败批次没有标出来');
      assert.ok(before.completed > 0, '其它批次没有继续');
      // 每个失败单元各出一枚按钮；逐枚点完，failed 应降到 0（第 5 次请求起 mock 放行）。
      let after = before;
      for (let attempt = 0; attempt < 40 && after.failed > 0; attempt++) {
        const buttons = tabPage.getByRole('button', { name: '重试这一段' });
        if (await buttons.count()) await buttons.first().click();
        await sleep(300);
        after = await emergency();
      }
      assert.equal(after.failed, 0, '手动重试后仍有失败段落');
      assert.equal(after.active, true, '重试后整页停了');
      return `失败批 4 次尝试耗尽后出手动按钮，点击重发后失败清零（已译 ${after.completed} 段）`;
    });

    await check('瞬时失败自动重试一次且不留按钮', async () => {
      await page.evaluate(({ tabId }) => chrome.tabs.sendMessage(tabId, { type: 'SS_EMERGENCY_END' }, { frameId: 0 }).catch(() => {}), { tabId }).catch(() => {});
      await openCase('autoretry');
      await tabPage.locator('[data-roamcat-ui="emergency-translation"]').first().waitFor({ state: 'visible', timeout: 20000 });
      // 滚一遍全文让所有段落都进入调度窗口（near 只译视口附近的单元），同时等失败批的自动重发完成。
      // 译文插入会让页面变高，每步重读 scrollHeight；上限 20000 防意外死循环。
      for (let y = 0; y <= 20000; y += 700) {
        if (y > (await tabPage.evaluate(() => document.body?.scrollHeight || 0))) break;
        await tabPage.evaluate(top => scrollTo(0, top), y);
        await sleep(220);
      }
      await tabPage.evaluate(() => scrollTo(0, 0));
      let sawRetrying = 0;
      for (let attempt = 0; attempt < 40 && stats.failAttempts < 2; attempt++) {
        const s = await emergency();
        sawRetrying = Math.max(sawRetrying, s.retrying || 0);
        await sleep(150);
      }
      assert.equal(stats.failAttempts, 2, '失败批次没有被自动重发（attempts=' + stats.failAttempts + '）');
      assert.equal(stats.failRejects, 1, 'autoretry 场景应只拒绝一次（rejects=' + stats.failRejects + '）');
      // 退避表首档 300ms：同批指纹的相邻请求间隔必须 ≥250ms（证明走了静默退避而非立刻重发）。
      const failAttemptsLog = stats.requestLog.filter(row => row.key === stats.failKey);
      assert.ok(failAttemptsLog.length >= 2, '失败批没有留下重发记录');
      const retryGap = failAttemptsLog[1].at - failAttemptsLog[0].at;
      assert.ok(retryGap >= 250, '自动重发间隔过短：' + retryGap + 'ms');
      let status = await emergency();
      for (let attempt = 0; attempt < 50 && (status.failed || status.pending || status.retrying); attempt++) { await sleep(400); status = await emergency(); sawRetrying = Math.max(sawRetrying, status.retrying || 0); }
      assert.equal(status.failed, 0, '自动重试后仍有失败段落：' + JSON.stringify(status));
      assert.equal(status.pending + status.retrying, 0, '自动重试后仍有待译段落：' + JSON.stringify(status));
      const rendered = await tabPage.locator('[data-roamcat-ui="emergency-translation"]').count();
      assert.ok(rendered >= 20, '译文块数不足：' + rendered);
      // 全部译完后持续观察 ~3s：失败段已恢复，任何时刻都不该再看到「重试这一段」。
      for (let attempt = 0; attempt < 8; attempt++) {
        assert.equal(await tabPage.getByRole('button', { name: '重试这一段' }).count(), 0, '自动重试成功后仍看到重试按钮');
        await sleep(400);
      }
      return `失败批第 ${stats.failAttempts} 次请求译出（退避间隔 ${retryGap}ms，retrying 峰值 ${sawRetrying}），${status.completed} 段完成、${rendered} 块译文`;
    });

    await check('自动重试耗尽前不露失败 UI', async () => {
      await page.evaluate(({ tabId }) => chrome.tabs.sendMessage(tabId, { type: 'SS_EMERGENCY_END' }, { frameId: 0 }).catch(() => {}), { tabId }).catch(() => {});
      await openCase('exhaust');
      await tabPage.locator('[data-roamcat-ui="emergency-translation"]').first().waitFor({ state: 'visible', timeout: 20000 });
      // 指纹批永远被拒：退避窗口内持续断言失败单元静默重发、不渲染「本段未译完 / 重试这一段」。
      let sawRetrying = 0;
      for (let attempt = 0; attempt < 80 && stats.failAttempts < 4; attempt++) {
        assert.equal(await tabPage.getByRole('button', { name: '重试这一段' }).count(), 0, '退避重试期间就露出重试按钮');
        assert.equal(await tabPage.getByText('本段未译完').count(), 0, '退避重试期间就渲染失败提示');
        const s = await emergency();
        sawRetrying = Math.max(sawRetrying, s.retrying || 0);
        await sleep(120);
      }
      assert.equal(stats.failAttempts, 4, '失败批次没有跑满 1+3 次尝试（attempts=' + stats.failAttempts + '）');
      assert.ok(sawRetrying > 0, '退避期间没有观察到 retrying 单元');
      await tabPage.getByRole('button', { name: '重试这一段' }).first().waitFor({ state: 'visible', timeout: 15000 });
      let status = await emergency();
      for (let attempt = 0; attempt < 25 && !status.failed; attempt++) { await sleep(200); status = await emergency(); }
      assert.ok(status.failed > 0, '耗尽后失败批次没有标出来');
      assert.ok(status.completed > 0, '耗尽期间其它单元没有继续翻译');
      // 再观察 ~1.5s：自动机会已用尽，不得再发第 5 次，失败态保持稳定。
      await sleep(1500);
      const stable = await emergency();
      assert.equal(stats.failAttempts, 4, '耗尽后仍在自动重发（attempts=' + stats.failAttempts + '）');
      assert.equal(stable.failed, status.failed, '失败态不稳定');
      return `1+3 次尝试耗尽后落 failed（retrying 峰值 ${sawRetrying}），其它 ${stable.completed} 段照常译出`;
    });

    await check('批级 429 后整泵冷却', async () => {
      await page.evaluate(({ tabId }) => chrome.tabs.sendMessage(tabId, { type: 'SS_EMERGENCY_END' }, { frameId: 0 }).catch(() => {}), { tabId }).catch(() => {});
      await openCase('cooldown');
      await tabPage.locator('[data-roamcat-ui="emergency-translation"]').first().waitFor({ state: 'visible', timeout: 20000 });
      // 每个批次指纹首次出现都被 429：滚全文让所有单元进调度窗口，等待全部重发成功。
      for (let y = 0; y <= 20000; y += 700) {
        if (y > (await tabPage.evaluate(() => document.body?.scrollHeight || 0))) break;
        await tabPage.evaluate(top => scrollTo(0, top), y);
        await sleep(200);
      }
      await tabPage.evaluate(() => scrollTo(0, 0));
      let status = await emergency();
      for (let attempt = 0; attempt < 80 && (status.failed || status.pending || status.retrying); attempt++) { await sleep(300); status = await emergency(); }
      assert.equal(status.failed, 0, '429 重试后仍有失败段落：' + JSON.stringify(status));
      assert.equal(status.pending + status.retrying, 0, '429 重试后仍有未完成段落：' + JSON.stringify(status));
      // 冷却作用于整泵：同一批指纹的相邻两次请求间隔必须 ≥250ms（首档退避 300ms）。
      const byKey = new Map();
      for (const row of stats.requestLog) { const list = byKey.get(row.key) || []; list.push(row.at); byKey.set(row.key, list); }
      let minGap = Infinity, retried = 0;
      for (const list of byKey.values()) {
        if (list.length < 2) continue;
        retried++;
        for (let i = 1; i < list.length; i++) minGap = Math.min(minGap, list[i] - list[i - 1]);
      }
      assert.ok(retried > 0, 'cooldown 场景没有批次被重发');
      assert.ok(minGap >= 250, '批级失败后重发间隔过短：' + minGap + 'ms');
      return `${retried} 个批指纹被 429 后全部重发成功（最短间隔 ${minGap}ms），${status.completed} 段完成`;
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
    await browser?.close().catch(() => {});
    server.close();
    fs.rmSync(staged, { recursive: true, force: true });
  }
  fs.mkdirSync(path.resolve(__dirname, '../preview/audit'), { recursive: true });
  fs.writeFileSync(path.resolve(__dirname, '../preview/audit/bilingual-pipeline.json'), JSON.stringify(report, null, 2));
  if (report.failures.length) process.exitCode = 1;
  console.log(JSON.stringify({ passed: report.checks.length, failures: report.failures }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
