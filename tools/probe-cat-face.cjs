/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// 探针：截图漫游猫新形象（伪2D体积 / 大眼 / 腮红 / 眼睛跟随 / 按压果冻）+ 探头猫。
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const { chromium } = require('playwright-core');
const extension = path.resolve(process.env.EXTENSION_DIR || path.join(__dirname, '../dist/extension'));
const out = path.resolve(process.env.PROBE_OUT_DIR || path.join(__dirname, '../preview/cat-face'));
fs.mkdirSync(out, { recursive: true });

const server = http.createServer((req, res) => {
  const dark = req.url.includes('dark');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>probe</title>
<style>body{font-family:sans-serif;padding:40px;background:${dark ? '#17191d' : '#fdfbf7'};color:${dark ? '#e8e4d8' : '#1c1917'}}</style>
</head><body><h1>Cat face probe</h1></body></html>`);
});

const shot = async (page, name, clip) => {
  await page.screenshot({ path: path.join(out, name + '.png'), clip });
};

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}/`;

  for (const theme of ['light', 'dark']) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-face-'));
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'msedge',
      headless: true,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 3,
      colorScheme: theme === 'dark' ? 'dark' : 'light',
    });
    try {
      let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
      const id = new URL(worker.url()).host, base = `chrome-extension://${id}`;
      for (const p of context.pages()) await p.close();
      const opt = await context.newPage();
      await opt.goto(base + '/ui/options.html');
      await opt.waitForTimeout(400);
      const page = await context.newPage();
      await page.goto(origin + (theme === 'dark' ? '?dark=1' : ''));
      await page.waitForTimeout(1200);
      const tabId = await opt.evaluate(async url => (await chrome.tabs.query({ url }))[0].id, origin + (theme === 'dark' ? '?dark=1' : ''));
      const execInPet = async (fnStr) => (await opt.evaluate(async ({ tabId, fnStr }) =>
        chrome.scripting.executeScript({ target: { tabId }, func: new Function('return (' + fnStr + ')()') }), { tabId, fnStr }))[0].result;
      const host = page.locator('#roamcat-pet-host');
      await host.waitFor({ state: 'attached', timeout: 8000 });
      await page.bringToFront();
      await page.waitForTimeout(800);

      const hostBox = await host.boundingBox();
      const clip = { x: Math.max(0, hostBox.x - 50), y: Math.max(0, hostBox.y - 90), width: 190, height: 190 };

      // 1. idle
      await shot(page, `${theme}-1-idle`, clip);

      // 2. hover → squint eyes
      await page.mouse.move(hostBox.x + hostBox.width / 2, hostBox.y + hostBox.height / 2, { steps: 4 });
      await page.waitForTimeout(350);
      await shot(page, `${theme}-2-hover-squint`, clip);

      // 3. gaze: cursor to upper-right of cat (eyes should look there)
      await page.mouse.move(hostBox.x + 220, hostBox.y - 140, { steps: 6 });
      await page.waitForTimeout(350);
      await shot(page, `${theme}-3-gaze-right`, clip);
      // gaze left
      await page.mouse.move(hostBox.x - 160, hostBox.y + 40, { steps: 6 });
      await page.waitForTimeout(350);
      await shot(page, `${theme}-4-gaze-left`, clip);

      // 4. pressed squash
      await page.mouse.move(hostBox.x + hostBox.width / 2, hostBox.y + hostBox.height / 2, { steps: 3 });
      await page.mouse.down();
      await page.waitForTimeout(200);
      await shot(page, `${theme}-5-pressed`, clip);
      await page.mouse.up();
      await page.waitForTimeout(400);

      // 5. docked peeking cat
      await execInPet(`() => globalThis.RoamCatPet.dock('right')`);
      await page.waitForTimeout(700);
      const h2 = await host.boundingBox();
      const clip2 = { x: Math.max(0, h2.x - 120), y: Math.max(0, h2.y - 60), width: 260, height: 200 };
      await shot(page, `${theme}-6-peeking`, clip2);
    } finally {
      await context.close();
      fs.rmSync(profile, { recursive: true, force: true });
    }
  }
  server.close();
  console.log('done →', out);
})().catch(e => { console.error(e); process.exit(1); });
