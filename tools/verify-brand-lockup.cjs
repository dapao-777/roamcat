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
    apiServices: [],
    domainDetection: { mode: 'local', api: {} }
  };
  window.chrome = {
    storage: {
      local: {
        get: async () => ({ ...read() }),
        set: async obj => {
          localStorage.setItem('qa-settings', JSON.stringify({ ...read(), ...obj }));
        }
      },
      onChanged: { addListener() {} }
    },
    permissions: { contains: async () => true, getAll: async () => ({ origins: [] }), request: async () => true },
    runtime: {
      id: 'roamcat-brand-test',
      getURL: p => location.origin + '/' + p,
      onMessage: { addListener() {} },
      sendMessage: async message => {
        let data = {};
        if (message.type === 'STATE_GET') data = { settings: read(), subscription: { connected: true } };
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await context.addInitScript(mockChrome);
    const page = await context.newPage();

    await page.goto(base + '/ui/options.html#assistance');
    await page.waitForTimeout(600);

    // Check brand title text
    const brandTitle = await page.locator('.brand-title').textContent();
    console.log('Brand title text:', JSON.stringify(brandTitle));
    assert.equal(brandTitle.trim(), 'RoamCat · 随心阅');

    // Check brand subtitle text
    const brandSub = await page.locator('.brand-subtitle').textContent();
    console.log('Brand subtitle text:', JSON.stringify(brandSub));
    assert.equal(brandSub.trim(), '随心漫游 · 自在阅读');

    // Check document title on assistance
    let docTitle = await page.title();
    console.log('Document title (#assistance):', JSON.stringify(docTitle));
    assert.ok(docTitle.startsWith('RoamCat · 随心阅 · '), 'Document title must start with full brand name');

    // Check navigation to other sections updates document.title
    const sections = ['appearance', 'sites', 'advanced', 'service', 'diagnostics', 'guide'];
    for (const sec of sections) {
      await page.locator(`[data-section="${sec}"]`).click();
      await page.waitForTimeout(200);
      docTitle = await page.title();
      console.log(`Document title (#${sec}):`, JSON.stringify(docTitle));
      assert.ok(docTitle.startsWith('RoamCat · 随心阅 · '), `Title for #${sec} must start with full brand name`);
    }

    // Capture focused screenshot of brand header
    const brandHeader = page.locator('.sidebar-brand-lockup');
    await brandHeader.screenshot({ path: path.join(previewDir, 'brand-header-crop.png') });
    console.log('Saved brand-header-crop.png');

    // Also capture full top-left sidebar
    const sidebar = page.locator('aside.sidebar');
    const box = await sidebar.boundingBox();
    await page.screenshot({
      path: path.join(previewDir, 'brand-sidebar-crop.png'),
      clip: { x: box.x, y: box.y, width: box.width, height: 260 }
    });
    console.log('Saved brand-sidebar-crop.png');

    console.log('\n=================================================');
    console.log('BRAND IDENTITY VERIFICATION PASSED COMPLETELY!');
    console.log('=================================================');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
