/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');


const {chromium} = require('./lib/browser.cjs');
const root = path.resolve(process.env.EXTENSION_DIR || path.join(__dirname, '../dist/extension'));
const previewDir = path.resolve(__dirname, '../preview/audit');
if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });

const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (e, data) => {
    if (e) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader('Content-Type', ({
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.mjs': 'text/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.woff2': 'font/woff2'
    })[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});

function mockChrome() {
  const read = () => JSON.parse(localStorage.getItem('qa-settings') || 'null') || {
    assistanceMode: 'ambient',
    lookupDisplay: 'card',
    lookupKey: 'D',
    helpLanguage: 'zh',
    domain: 'auto',
    providerKind: 'chatgpt',
    automation: { sites: [] },
    customTerms: [],
    domainRules: [],
    apiServices: [
      {
        id: 'saved-deepseek',
        name: 'DeepSeek 官方',
        providerId: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        apiKey: 'sk-dpsk-fixture-key',
        options: {}
      }
    ],
    activeApiServiceId: 'saved-deepseek',
    domainDetection: { mode: 'local', api: {} }
  };
  const events = [];
  window.qa = { events };
  const listeners = [];
  const local = {
    get: async keys => {
      const s = read();
      if (typeof keys === 'string') return { [keys]: s[keys] };
      if (Array.isArray(keys)) return Object.fromEntries(keys.map(k => [k, s[k]]));
      return { ...s };
    },
    set: async obj => {
      const s = { ...read(), ...obj };
      localStorage.setItem('qa-settings', JSON.stringify(s));
      listeners.forEach(fn => fn({ ...obj }, 'local'));
    }
  };
  window.chrome = {
    storage: { local, onChanged: { addListener: fn => listeners.push(fn) } },
    permissions: { contains: async () => true, getAll: async () => ({ origins: [] }), request: async () => true },
    runtime: {
      id: 'roamcat-layout-test',
      getURL: p => location.origin + '/' + p,
      onMessage: { addListener() {} },
      sendMessage: async message => {
        events.push(message);
        let data = {};
        switch (message.type) {
          case 'STATE_GET':
            data = { settings: read(), subscription: { connected: true, email: 'user@example.com', plan: 'Plus' } };
            break;
          case 'STATE_PATCH': {
            const settings = { ...read(), ...message.patch };
            localStorage.setItem('qa-settings', JSON.stringify(settings));
            data = { settings, subscription: { connected: true } };
            break;
          }
          case 'AUTOMATION_GET':
            data = { automation: read().automation };
            break;
          case 'SUBSCRIPTION_STATUS':
            data = { connected: true, email: 'user@example.com', plan: 'Plus' };
            break;
          case 'MODELS_LIST':
            data = { models: [{ id: 'gpt-4o', name: 'GPT-4o' }] };
            break;
          case 'API_MODELS_LIST':
            data = { models: [{ id: 'deepseek-chat', name: 'deepseek-chat' }] };
            break;
          case 'SENTENCE_GROUPS_DENSITY_SET':
            data = { density: message.density };
            break;
        }
        return { ok: true, data };
      }
    }
  };
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await context.addInitScript(mockChrome);
    const page = await context.newPage();

    // 1. Visit #service (Model Services)
    await page.goto(base + '/ui/options.html#service');
    await page.waitForTimeout(600);

    const readoutVisibleOnService = await page.locator('.now-status').isVisible();
    console.log('1. Status strip visible on #service (expected false):', readoutVisibleOnService);
    assert.equal(readoutVisibleOnService, false, 'Status strip must be hidden on #service');

    await page.screenshot({ path: path.join(previewDir, 'layout-service-clean.png') });
    console.log('Saved layout-service-clean.png');

    // 2. Visit #sites (Site Rules)
    await page.evaluate(s=>{location.hash='#'+s},'sites');
    await page.waitForTimeout(400);
    const readoutVisibleOnSites = await page.locator('.now-status').isVisible();
    console.log('2. Status strip visible on #sites (expected false):', readoutVisibleOnSites);
    assert.equal(readoutVisibleOnSites, false, 'Status strip must be hidden on #sites');
    await page.screenshot({ path: path.join(previewDir, 'layout-sites-clean.png') });
    console.log('Saved layout-sites-clean.png');

    // 3. Visit #assistance (Reading Preferences)
    await page.evaluate(s=>{location.hash='#'+s},'assistance');
    await page.waitForTimeout(400);
    const readoutVisibleOnAssistance = await page.locator('.now-status').isVisible();
    console.log('3. Status strip visible on #assistance (expected true):', readoutVisibleOnAssistance);
    assert.equal(readoutVisibleOnAssistance, true, 'Status strip must be visible on #assistance');
    await page.screenshot({ path: path.join(previewDir, 'layout-assistance-clean.png') });
    console.log('Saved layout-assistance-clean.png');

    // 4. Test API Key toggle in #service
    await page.evaluate(s=>{location.hash='#'+s},'service');
    await page.waitForTimeout(400);

    // Click Custom API to switch to API panel
    await page.locator('#catalog-add-btn').click();
    await page.waitForTimeout(300);

    // Open API service editor details
    await page.locator('#api-editor').evaluate(e => e.open = true);
    await page.waitForTimeout(200);

    const keyInput = page.locator('#provider-key');
    await keyInput.fill('sk-test-secret-key-12345');
    // 密钥框是多行 textarea（可填多把 Key），没有 type=password，靠 key-pool-revealed 类切换遮罩。
    const revealed = () => keyInput.evaluate(el => el.classList.contains('key-pool-revealed'));
    const maskedBefore = !(await revealed());
    console.log('4. API key masked before toggle (expected true):', maskedBefore);
    assert.equal(maskedBefore, true);

    const toggleBtn = page.locator('.toggle-password-btn[data-toggle-target="provider-key"]');
    await toggleBtn.click();
    await page.waitForTimeout(200);

    const revealedAfter = await revealed();
    console.log('4. API key revealed after toggle (expected true):', revealedAfter);
    assert.equal(revealedAfter, true);
    await page.screenshot({ path: path.join(previewDir, 'layout-api-key-visible.png') });
    console.log('Saved layout-api-key-visible.png');

    // 5. Test Stamp Card Modal & Goto Pet button
    // 印章卡在状态条里，只在「阅读」组显示；从同组的 #appearance 打开，才能验证「去设置伴读猫」跳回 #assistance。
    await page.evaluate(s=>{location.hash='#'+s},'appearance');
    await page.waitForTimeout(400);
    const stampCard = page.locator('#sidebar-stamp-card');
    await stampCard.click();
    await page.waitForTimeout(300);

    const modal = page.locator('#stamp-manifesto-modal');
    const modalOpen = await modal.evaluate(el => el.hasAttribute('open'));
    console.log('5. Stamp modal open (expected true):', modalOpen);
    assert.equal(modalOpen, true);

    const gotoPetBtn = page.locator('#stamp-modal-goto-pet');
    const btnVisible = await gotoPetBtn.isVisible();
    console.log('5. Goto pet button visible (expected true):', btnVisible);
    assert.equal(btnVisible, true);

    await gotoPetBtn.click();
    await page.waitForTimeout(400);

    const currentHash = await page.evaluate(() => location.hash);
    console.log('5. Hash after clicking goto pet (expected #assistance):', currentHash);
    assert.equal(currentHash, '#assistance');

    console.log('\n=================================================');
    console.log('ALL LAYOUT & INTERACTION VERIFICATIONS PASSED 100%!');
    console.log('=================================================');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
