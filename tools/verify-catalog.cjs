/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

function loadPlaywright() {
  try {
    return require('playwright-core');
  } catch (err) {
    const override = process.env.PLAYWRIGHT_CORE_PATH;
    if (override) {
      try {
        return require(override);
      } catch {}
    }
    throw new Error(`找不到 playwright-core：${err.message}`);
  }
}

const { chromium } = loadPlaywright();
const root = path.resolve(process.env.EXTENSION_DIR || path.join(__dirname, '../roamcat-0.0.1/extension'));
const out = path.resolve(__dirname, '../preview');
if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });

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
    get: async (keys, callback) => {
      const data = { sentenceGroupsDensity: 'medium', sentenceGroupsLineStyle: 'solid' };
      callback?.(data);
      return data;
    },
    set: async () => {}
  };
  window.chrome = {
    storage: { local, onChanged: { addListener: fn => listeners.push(fn) } },
    permissions: { contains: async () => true, getAll: async () => ({ origins: [] }), request: async () => true },
    runtime: {
      id: 'roamcat-catalog-test',
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
            data = { models: [{ id: 'gpt-4o', name: 'GPT-4o' }, { id: 'o3-mini', name: 'o3-mini' }] };
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
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    await context.addInitScript(mockChrome);
    const page = await context.newPage();

    console.log('1. Loading options page at #service...');
    await page.goto(base + '/ui/options.html#service');
    await page.waitForTimeout(600);

    // Verify Catalog elements exist
    const rail = page.locator('.service-rail');
    assert.equal(await rail.count(), 1, 'Service rail must exist');
    const items = page.locator('.service-item');
    const count = await items.count();
    console.log(`Found ${count} service items in catalog.`);
    assert.ok(count >= 25, 'Catalog should have at least 25 services');

    // 2. Capture screenshot in Light Mode
    await page.screenshot({ path: out + '/catalog-service-light.png' });
    console.log('Saved catalog-service-light.png');

    // 3. Capture screenshot in Dark Mode
    await page.locator('#theme-toggle-btn').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: out + '/catalog-service-dark.png' });
    console.log('Saved catalog-service-dark.png');

    // Restore to Light Mode
    await page.locator('#theme-toggle-btn').click();
    await page.waitForTimeout(300);

    // 4. Test Search Filtering
    console.log('4. Testing search filtering...');
    const searchInput = page.locator('#catalog-search-input');
    await searchInput.fill('deepseek');
    await page.waitForTimeout(200);
    const filteredCount = await page.locator('.service-item:visible').count();
    console.log(`Filtered for "deepseek": ${filteredCount} visible items.`);
    assert.ok(filteredCount >= 1, 'Search for deepseek should match at least 1 item');
    await page.screenshot({ path: out + '/catalog-search-deepseek.png' });

    // 5. Test clicking a service item in the rail (e.g. deepseek)
    console.log('5. Clicking DeepSeek item...');
    await page.locator('.service-item:visible').first().click();
    await page.waitForTimeout(300);

    const heroTitle = await page.locator('#catalog-hero-title').textContent();
    console.log('Hero Title is:', heroTitle);
    assert.ok(heroTitle.includes('DeepSeek'), 'Hero title should reflect DeepSeek');
    await page.screenshot({ path: out + '/catalog-deepseek-selected.png' });

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(200);

    // 6. Test clicking an unconfigured template like Ollama
    console.log('6. Clicking Ollama template...');
    const ollamaItem = page.locator('.service-item[data-service-key="ollama"]');
    assert.equal(await ollamaItem.count(), 1, 'Ollama item should exist');
    await ollamaItem.click();
    await page.waitForTimeout(300);

    const ollamaHeroTitle = await page.locator('#catalog-hero-title').textContent();
    console.log('Hero Title after clicking Ollama is:', ollamaHeroTitle);
    assert.ok(ollamaHeroTitle.includes('Ollama'), 'Hero title should be Ollama');
    assert.equal(await page.locator('#api-panel').isVisible(), true, 'API panel should be visible for Ollama');
    await page.screenshot({ path: out + '/catalog-ollama-selected.png' });

    // 7. Test clicking ChatGPT subscription
    console.log('7. Clicking ChatGPT subscription...');
    const chatgptItem = page.locator('.service-item[data-service-key="chatgpt"]');
    await chatgptItem.click();
    await page.waitForTimeout(300);

    assert.equal(await page.locator('#subscription-panel').isVisible(), true, 'Subscription panel should be visible');
    assert.equal(await page.locator('#api-panel').isVisible(), false, 'API panel should be hidden');
    await page.screenshot({ path: out + '/catalog-chatgpt-selected.png' });

    console.log('=========================================');
    console.log('ALL SERVICE CATALOG CHECKS PASSED 100%!');
    console.log('=========================================');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(err => {
  console.error(err);
  server.close();
  process.exitCode = 1;
});
