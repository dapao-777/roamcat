/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// 探针：截图伴读猫气泡菜单与快捷坞当前渲染状态（诊断布局问题用）。
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

function loadPlaywright() {
  try { return require('playwright-core'); }
  catch (first) {
    const override = process.env.PLAYWRIGHT_CORE_PATH;
    if (override) { try { return require(override); } catch {} }
    throw new Error('Playwright not found: ' + first?.message);
  }
}

const { chromium } = loadPlaywright();
const extension = path.resolve(process.env.EXTENSION_DIR || path.join(__dirname, '../dist/extension'));
const out = path.resolve(__dirname, '../preview/pet-probe');
fs.mkdirSync(out, { recursive: true });

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>probe</title>
<style>body{font-family:sans-serif;padding:40px;background:#fdfbf7;color:#1c1917}</style>
</head><body><h1>Pet probe</h1><p>Artificial intelligence for bilingual reading assistance.</p></body></html>`);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-probe-profile-'));

  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
    viewport: { width: 1440, height: 900 }
  });

  try {
    let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host, base = `chrome-extension://${id}`;
    for (const existing of context.pages()) await existing.close();
    const optionsPage = await context.newPage();
    await optionsPage.goto(base + '/ui/options.html');
    await optionsPage.waitForTimeout(400);
    const tabPage = await context.newPage();
    await tabPage.goto(origin);
    await tabPage.waitForTimeout(800);
    await tabPage.locator('#roamcat-pet-host').waitFor({ state: 'attached', timeout: 8000 });
    await tabPage.bringToFront();

    const execInPet = async (fnStr) => {
      const tabId = await optionsPage.evaluate(async url => (await chrome.tabs.query({ url }))[0].id, origin);
      const [{ result }] = await optionsPage.evaluate(async ({ tabId, fnStr }) =>
        chrome.scripting.executeScript({ target: { tabId }, func: new Function('return (' + fnStr + ')()') }), { tabId, fnStr });
      return result;
    };

    // 1. undocked pet + quick dock (hover state simulated by adding class)
    await tabPage.waitForTimeout(500);
    await tabPage.screenshot({ path: path.join(out, '01-pet-idle.png') });

    // 2. open bubble menu
    await execInPet(`() => globalThis.RoamCatPet.openMenu()`);
    await tabPage.waitForTimeout(400);
    await tabPage.screenshot({ path: path.join(out, '02-menu-open.png') });

    // 3. dump computed layout of menu + icons for diagnosis
    const diag = await execInPet(`() => {
      const root = document.querySelector('#roamcat-pet-host').shadowRoot;
      const r = el => { const b = el?.getBoundingClientRect(); const cs = el ? getComputedStyle(el) : {}; return b ? {x:+b.x.toFixed(1),y:+b.y.toFixed(1),w:+b.width.toFixed(1),h:+b.height.toFixed(1),ov:cs.overflow,ml:cs.marginLeft,pl:cs.paddingLeft,transform:cs.transform,display:cs.display} : null; };
      return {
        widget: r(root.querySelector('.roamcat-pet-widget')),
        menu: r(root.querySelector('.roamcat-bubble-menu')),
        item1: r(root.querySelector('#btn-summary')),
        icon1: r(root.querySelector('#btn-summary .menu-item-icon')),
        info1: r(root.querySelector('#btn-summary .menu-item-info')),
        quickDock: r(root.querySelector('.roamcat-quick-dock')),
        domainTag: r(root.querySelector('#menu-domain')),
        hostCssOverflow: getComputedStyle(document.querySelector('#roamcat-pet-host')).overflow
      };
    }`);
    console.log(JSON.stringify(diag, null, 2));

    // 4. docked right + menu open
    await execInPet(`() => { globalThis.RoamCatPet.closeMenu?.(); globalThis.RoamCatPet.dock('right'); }`);
    await tabPage.waitForTimeout(500);
    await tabPage.screenshot({ path: path.join(out, '03-docked-right.png') });
    await execInPet(`() => globalThis.RoamCatPet.openMenu()`);
    await tabPage.waitForTimeout(400);
    await tabPage.screenshot({ path: path.join(out, '04-docked-menu.png') });

    console.log('probe done → ' + out);
  } finally {
    await context.close();
    server.close();
  }
})().catch(err => { console.error(err); process.exit(1); });
