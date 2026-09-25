/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os'), assert = require('node:assert/strict');
function loadPlaywright() {
  try { return require('playwright-core'); } catch (first) {
    const override = process.env.PLAYWRIGHT_CORE_PATH;
    if (override) { try { return require(override); } catch {} }
    throw new Error(`找不到 playwright-core（${first?.message || first}）。`);
  }
}
const { chromium } = loadPlaywright();
const source = path.resolve(process.env.EXTENSION_DIR || path.join(__dirname, '../roamcat-0.0.1/extension'));
const extension = fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-dockfix-'));
fs.cpSync(source, extension, { recursive: true });
const manifestPath = path.join(extension, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
fs.writeFileSync(manifestPath, JSON.stringify(manifest));

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>RoamCat Dock Verification</title>
  <style>
    body { margin: 0; padding: 40px; background: #0f1117; color: #f3f4f6; font-family: system-ui, sans-serif; min-height: 200vh; }
    h1 { color: #f59e0b; font-size: 28px; }
  </style>
</head>
<body>
  <h1>RoamCat 伴读猫贴边与气泡防溢出验证</h1>
  <p>验证当猫猫贴边靠右或靠左时，提示语与状态气泡能够自适应朝内侧展开，且贴边标签不遮挡猫身。</p>
</body>
</html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const outDir = path.resolve(__dirname, '../preview/pet');
  fs.mkdirSync(outDir, { recursive: true });

  const context = await chromium.launchPersistentContext('', {
    channel: 'msedge', headless: true,
    args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
    viewport: { width: 1280, height: 800 }
  });

  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extId = new URL(worker.url()).host;
    const ctrlPage = await context.newPage();
    await ctrlPage.goto(`chrome-extension://${extId}/ui/options.html`);
    await ctrlPage.waitForTimeout(300);

    const page = await context.newPage();
    await page.goto(url);
    await page.waitForTimeout(500);
    const tabId = await ctrlPage.evaluate(async (u) => {
      const tabs = await chrome.tabs.query({ url: u });
      return tabs[0].id;
    }, url);

    const exec = async (fn) => {
      const [{ result }] = await ctrlPage.evaluate(async ({ tabId, fnStr }) => {
        return chrome.scripting.executeScript({
          target: { tabId },
          func: new Function('return (' + fnStr + ')()')
        });
      }, { tabId, fnStr: fn.toString() });
      return result;
    };

    // 1. Right Docking Test
    console.log('1. Testing Right Docking...');
    await exec(() => globalThis.RoamCatPet.dock('right'));
    await page.waitForTimeout(300);

    const rightDock = await exec(() => {
      const root = globalThis.RoamCatPet.getShadowRoot();
      const host = document.querySelector('#roamcat-pet-host');
      const widget = root.querySelector('.roamcat-pet-widget');
      const tab = root.querySelector('.roamcat-edge-tab');
      return {
        hostRight: host.style.right,
        isDocked: widget.classList.contains('docked'),
        tabDisplay: window.getComputedStyle(tab).display,
        tabOpacity: window.getComputedStyle(tab).opacity
      };
    });
    console.log('Right dock state:', rightDock);
    assert.equal(rightDock.hostRight, '0px', 'Docked right should be flush with right edge 0px');
    assert.equal(rightDock.isDocked, true);
    assert.notEqual(rightDock.tabDisplay, 'none');

    // 2. Trigger Speech Bubble while docked on right (the exact user issue!)
    console.log('2. Triggering Speech Bubble while docked on right (User Screenshot Reproduction)...');
    await exec(() => {
      globalThis.RoamCatPet.speak('旋旋翻：一键双语对照 | 单击切换双语，双击精炼全文', { busy: true, timeoutMs: 0 });
    });
    await page.waitForTimeout(400);

    const speechLayout = await exec(() => {
      const root = globalThis.RoamCatPet.getShadowRoot();
      const bubble = root.querySelector('#cat-speech');
      const tab = root.querySelector('.roamcat-edge-tab');
      const rect = bubble.getBoundingClientRect();
      const screenW = window.innerWidth;
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        screenW,
        overflowsRight: rect.right > screenW,
        overflowsLeft: rect.left < 0,
        tabOpacity: window.getComputedStyle(tab).opacity
      };
    });
    console.log('Speech layout on right dock:', speechLayout);
    assert.equal(speechLayout.overflowsRight, false, 'Speech bubble must NOT overflow right screen edge!');
    assert.equal(speechLayout.overflowsLeft, false, 'Speech bubble must NOT overflow left screen edge!');
    assert.equal(speechLayout.tabOpacity, '0', 'Edge tab must be hidden when speaking!');

    const shotPath = path.join(outDir, 'dock-fix-verified.png');
    await page.screenshot({ path: shotPath });
    console.log('✓ Captured ' + shotPath);

    // 3. Undock test
    console.log('3. Testing Undock...');
    await exec(() => globalThis.RoamCatPet.undock());
    await page.waitForTimeout(300);

    const undockState = await exec(() => {
      const root = globalThis.RoamCatPet.getShadowRoot();
      const widget = root.querySelector('.roamcat-pet-widget');
      const tab = root.querySelector('.roamcat-edge-tab');
      return {
        isDocked: widget.classList.contains('docked'),
        tabDisplay: window.getComputedStyle(tab).display
      };
    });
    assert.equal(undockState.isDocked, false);
    assert.equal(undockState.tabDisplay, 'none');

    console.log('==============================================');
    console.log('ALL DOCKING FIX CHECKS PASSED WITH ZERO ERRORS!');
    console.log('==============================================');
  } finally {
    await context.close();
    server.close();
  }
})();
