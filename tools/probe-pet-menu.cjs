/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// 探针：截图伴读猫快捷坞/缩放/语音气泡/跑车动画当前渲染状态（诊断布局问题用）。
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
const out = path.resolve(process.env.PROBE_OUT_DIR || path.join(__dirname, '../preview/pet-probe'));
fs.mkdirSync(out, { recursive: true });

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>probe</title>
<style>body{font-family:sans-serif;padding:40px;background:#fdfbf7;color:#1c1917}</style>
</head><body><h1>Pet probe</h1><p>Artificial intelligence for bilingual reading assistance.</p></body></html>`);
});

const LONG_SPEECH = '这是一段足够长的伴读猫提示文本，用来验证语音气泡在贴边与贴顶时仍能完整留在视口之内，并且小尾巴始终指向猫身，不会跑出屏幕外面喵~';

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

  const diag = {};
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
    const shot = (name) => tabPage.screenshot({ path: path.join(out, name) });
    const bubbleInside = async () => execInPet(`() => {
      const b = document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#cat-speech').getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom,
        inside: b.left >= -0.5 && b.right <= innerWidth + 0.5 && b.top >= -0.5 && b.bottom <= innerHeight + 0.5,
        below: document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#cat-speech').classList.contains('below') };
    }`);
    const dragCat = async (dx, dy) => {
      const b = await execInPet(`() => {
        const r = document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('.roamcat-avatar-wrap').getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }`);
      await tabPage.mouse.move(b.x, b.y);
      await tabPage.mouse.down();
      await tabPage.mouse.move(b.x + dx, b.y + dy, { steps: 8 });
      await tabPage.mouse.up();
      await tabPage.waitForTimeout(400);
    };

    // 1. dock closed (idle)
    await tabPage.waitForTimeout(500);
    await shot('01-dock-closed.png');

    // 2. open dock → mid-animation (~120ms) then settled, right side
    await execInPet(`() => globalThis.RoamCatPet.openQuickDock()`);
    await tabPage.waitForTimeout(120);
    await shot('02-dock-opening.png');
    await tabPage.waitForTimeout(500);
    await shot('03-dock-open-right.png');
    diag.dockOpenRight = await execInPet(`() => {
      const root = document.querySelector('#roamcat-pet-host').shadowRoot;
      const kids = [...root.querySelectorAll('.roamcat-quick-dock > *')];
      return {
        dockOpen: root.querySelector('.roamcat-pet-widget').classList.contains('dock-open'),
        order: kids.map(k => k.id || k.className),
        zoomVisible: getComputedStyle(root.querySelector('#roamcat-zoom-controls')).visibility
      };
    }`);

    // 3. left side: dock left → undock keeps .is-left → open dock
    await execInPet(`() => { globalThis.RoamCatPet.closeQuickDock(); globalThis.RoamCatPet.dock('left'); }`);
    await tabPage.waitForTimeout(400);
    await execInPet(`() => { globalThis.RoamCatPet.undock(); globalThis.RoamCatPet.openQuickDock(); }`);
    await tabPage.waitForTimeout(600);
    await shot('04-dock-open-left.png');
    diag.isLeft = await execInPet(`() => document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('.roamcat-pet-widget').classList.contains('is-left')`);

    // 4. zoom 80% / 160% with dock open (assert host size)
    await execInPet(`() => globalThis.RoamCatPet.setScale(0.8)`);
    await tabPage.waitForTimeout(300);
    diag.host80 = await execInPet(`() => {
      const b = document.querySelector('#roamcat-pet-host').getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height) };
    }`);
    await shot('05-zoom-80.png');
    await execInPet(`() => globalThis.RoamCatPet.setScale(1.6)`);
    await tabPage.waitForTimeout(300);
    diag.host160 = await execInPet(`() => {
      const b = document.querySelector('#roamcat-pet-host').getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height) };
    }`);
    await shot('06-zoom-160.png');
    await execInPet(`() => { globalThis.RoamCatPet.setScale(1); globalThis.RoamCatPet.closeQuickDock(); }`);

    // 5. speech bubble — right edge (pet undocked at left; move it right first)
    await execInPet(`() => { globalThis.RoamCatPet.dock('right'); }`);
    await tabPage.waitForTimeout(300);
    await execInPet(`() => globalThis.RoamCatPet.undock()`);
    await tabPage.waitForTimeout(400);
    await execInPet(`() => globalThis.RoamCatPet.speakStatus(${JSON.stringify(LONG_SPEECH)}, { duration: 60000 })`);
    await tabPage.waitForTimeout(400);
    diag.bubbleRight = await bubbleInside();
    await shot('07-bubble-right.png');

    // left edge
    await execInPet(`() => { globalThis.RoamCatPet.clearStatusSpeech(); globalThis.RoamCatPet.dock('left'); }`);
    await tabPage.waitForTimeout(300);
    await execInPet(`() => { globalThis.RoamCatPet.undock(); globalThis.RoamCatPet.speakStatus(${JSON.stringify(LONG_SPEECH)}, { duration: 60000 }); }`);
    await tabPage.waitForTimeout(400);
    diag.bubbleLeft = await bubbleInside();
    await shot('08-bubble-left.png');

    // top edge: drag cat up near the top → bubble flips below
    await execInPet(`() => globalThis.RoamCatPet.clearStatusSpeech()`);
    await dragCat(60, -760);
    await execInPet(`() => globalThis.RoamCatPet.speakStatus(${JSON.stringify(LONG_SPEECH)}, { duration: 60000 })`);
    await tabPage.waitForTimeout(400);
    diag.bubbleTop = await bubbleInside();
    await shot('09-bubble-top-below.png');
    await execInPet(`() => globalThis.RoamCatPet.clearStatusSpeech()`);
    await dragCat(-60, 700);
    await execInPet(`() => { if (document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('.roamcat-pet-widget').classList.contains('docked')) globalThis.RoamCatPet.undock(); }`);
    await tabPage.waitForTimeout(300);

    // 6. sports car — three frames
    await execInPet(`() => { globalThis.RoamCatPet.driveIn(); }`);
    await tabPage.waitForTimeout(400);
    diag.carMid = await execInPet(`() => Boolean(document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('.pet-car'))`);
    await shot('10-car-enter.png');
    await tabPage.waitForTimeout(500);
    await shot('11-car-brake.png');
    await tabPage.waitForTimeout(900);
    await shot('12-car-exit.png');
    await tabPage.waitForTimeout(1000);

    // 7. dark theme + dock open
    await tabPage.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await tabPage.waitForTimeout(300);
    await execInPet(`() => globalThis.RoamCatPet.openQuickDock()`);
    await tabPage.waitForTimeout(500);
    await shot('13-dark-dock-open.png');
    await execInPet(`() => globalThis.RoamCatPet.closeQuickDock()`);
    await tabPage.evaluate(() => document.documentElement.removeAttribute('data-theme'));

    // 8. summary window states (mock content)
    await execInPet(`() => {
      const root = document.querySelector('#roamcat-pet-host').shadowRoot;
      globalThis.RoamCatPet.openSummary();
      globalThis.RoamCatContentUI.renderPetSummaryContent(root.querySelector('#summary-content'), {
        meta: {words: 1234, minutes: 6, domainKey: 'tech', domainName: '软件与 AI'},
        takeaway: '索引是数据库查询加速的核心手段：以空间换时间，把随机读变成有序扫描。',
        highlights: [
          'B-Tree 通过 **平衡多叉树** 把查找复杂度压到 O(log n)',
          '覆盖索引让查询无需回表，直接命中结果',
          '联合索引遵循最左前缀匹配原则',
          '索引数量与写入放大成正相关，需权衡'
        ],
        keywords: ['B-Tree', '覆盖索引', '最左前缀', '回表', '基数']
      });
    }`);
    await tabPage.waitForTimeout(500);
    await shot('14-summary-light.png');
    await tabPage.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await tabPage.waitForTimeout(400);
    await shot('15-summary-dark.png');
    await tabPage.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    await execInPet(`() => globalThis.RoamCatContentUI.renderPetSummaryLoading(document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#summary-content'))`);
    await tabPage.waitForTimeout(300);
    await shot('16-summary-loading.png');
    await execInPet(`() => globalThis.RoamCatContentUI.renderPetSummaryError(document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#summary-content'), {message: '模型服务暂时不可用，请稍后重试。'})`);
    await tabPage.waitForTimeout(300);
    await shot('17-summary-error.png');

    // 9. philosophical quote bubble — light then dark
    await execInPet(`() => { globalThis.RoamCatPet.closeSummary(); globalThis.RoamCatPet.clearStatusSpeech(); }`);
    await tabPage.waitForTimeout(300);
    await execInPet(`() => globalThis.RoamCatPet.speakQuote()`);
    await tabPage.waitForTimeout(400);
    diag.quoteLight = await bubbleInside();
    diag.quoteDom = await execInPet(`() => {
      const b = document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#cat-speech');
      return {
        quote: b.classList.contains('quote'),
        speaking: b.classList.contains('speaking'),
        zh: b.querySelector('.quote-zh')?.textContent || '',
        en: Boolean(b.querySelector('.quote-en')?.textContent),
        author: Boolean(b.querySelector('.quote-author')?.textContent),
        closeVisible: getComputedStyle(b.querySelector('#speech-close-btn')).display !== 'none'
      };
    }`);
    if (!diag.quoteDom.quote || !diag.quoteDom.zh || !diag.quoteDom.en || !diag.quoteDom.author) {
      throw new Error('quote bubble missing .quote class or lines: ' + JSON.stringify(diag.quoteDom));
    }
    if (!diag.quoteLight.inside) throw new Error('quote bubble outside viewport: ' + JSON.stringify(diag.quoteLight));
    await shot('18-quote-light.png');
    await tabPage.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await tabPage.waitForTimeout(400);
    await execInPet(`() => globalThis.RoamCatPet.speakQuote()`);
    await tabPage.waitForTimeout(300);
    diag.quoteDark = await bubbleInside();
    diag.quoteDarkClass = await execInPet(`() => document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#cat-speech').classList.contains('quote')`);
    if (!diag.quoteDark.inside || !diag.quoteDarkClass) throw new Error('dark quote bubble failed: ' + JSON.stringify(diag.quoteDark));
    await shot('19-quote-dark.png');
    await tabPage.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    await execInPet(`() => globalThis.RoamCatPet.clearStatusSpeech()`);

    console.log(JSON.stringify(diag, null, 2));
    console.log('probe done → ' + out);
  } finally {
    await context.close();
    server.close();
  }
})().catch(err => { console.error(err); process.exit(1); });
