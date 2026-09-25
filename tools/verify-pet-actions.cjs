/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const http = require('http');

function loadPlaywright() {
  try { return require('playwright-core'); }
  catch (first) {
    const override = process.env.PLAYWRIGHT_CORE_PATH;
    if (override) {
      try { return require(override); } catch {}
    }
    throw new Error('Playwright not found');
  }
}

const { chromium } = loadPlaywright();
const source = path.resolve(process.env.EXTENSION_DIR || path.join(__dirname, '../roamcat-0.0.1/extension'));
const extension = fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-pet-ext-'));
const out = path.resolve(__dirname, '../preview/pet');
fs.mkdirSync(out, { recursive: true });
fs.cpSync(source, extension, { recursive: true });

// Update manifest permissions for local fixture server
const manifestPath = path.join(extension, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath));
manifest.host_permissions = ['http://127.0.0.1/*'];
fs.writeFileSync(manifestPath, JSON.stringify(manifest));

// Local test HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>RoamCat Mascot Pet Test Page</title>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 40px; line-height: 1.6; max-width: 800px; margin: 0 auto; background: #fdfbf7; color: #1c1917; }
    h1 { color: #d97706; }
    p { margin-bottom: 20px; font-size: 16px; }
  </style>
</head>
<body>
  <h1>RoamCat 伴读猫功能与视觉验证</h1>
  <p id="p1">深度测试伴读猫常驻网页动作（自然呼吸、摇尾巴、动耳朵、眨眼、伸懒腰、好奇歪头、踏踏踩奶、打盹 zZ 气泡、果冻弹跳爱心反馈）以及卓越的贴边半隐探头和毛玻璃吸附胶囊标签显示形态。</p>
  <p id="p2">Artificial intelligence for bilingual reading assistance and comprehensive summarization.</p>
</body>
</html>`);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'roamcat-pet-profile-'));

  console.log('Launching browser with extension:', extension);
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
    await tabPage.waitForTimeout(600);
    const tabId = await optionsPage.evaluate(async url => (await chrome.tabs.query({ url }))[0].id, origin);

    const execInPet = async (fnStr) => {
      const [{ result }] = await optionsPage.evaluate(async ({ tabId, fnStr }) => {
        return chrome.scripting.executeScript({
          target: { tabId },
          func: new Function('return (' + fnStr + ')()')
        });
      }, { tabId, fnStr });
      return result;
    };

    // Wait for pet host to be attached
    await tabPage.locator('#roamcat-pet-host').waitFor({ state: 'attached', timeout: 5000 });
    console.log('✓ Pet host attached to DOM');

    // 1. Verify structure and elements inside shadow DOM
    const structure = await execInPet(`() => {
      const host = document.querySelector('#roamcat-pet-host');
      const root = host?.shadowRoot;
      const pet = globalThis.RoamCatPet;
      return {
        hasRoot: Boolean(root),
        hasPetObject: Boolean(pet),
        hasAvatar: Boolean(root?.querySelector('.roamcat-avatar-wrap')),
        hasEdgeTab: Boolean(root?.querySelector('.roamcat-edge-tab')),
        hasFlipBtn: Boolean(root?.querySelector('.roamcat-flip-btn')),
        hasTail: Boolean(root?.querySelector('.cat-tail')),
        hasLeftEar: Boolean(root?.querySelector('.cat-ear-left')),
        hasRightEar: Boolean(root?.querySelector('.cat-ear-right')),
        hasOpenEyes: Boolean(root?.querySelector('.cat-eyes-open')),
        hasSquintEyes: Boolean(root?.querySelector('.cat-eyes-squint')),
        hasZzzWrap: Boolean(root?.querySelector('.cat-zzz-wrap')),
        avatarWidth: root?.querySelector('.roamcat-avatar-wrap')?.getBoundingClientRect()?.width || 0
      };
    }`);

    console.log('Structure inspection:', structure);
    assert.ok(structure.hasRoot, 'Shadow root must exist');
    assert.ok(structure.hasPetObject, 'globalThis.RoamCatPet must exist');
    assert.ok(structure.hasAvatar, 'roamcat-avatar-wrap must exist');
    assert.ok(structure.hasEdgeTab, 'roamcat-edge-tab must exist');
    assert.ok(structure.hasTail, 'cat-tail must exist');
    assert.ok(structure.hasLeftEar, 'cat-ear-left must exist');
    assert.ok(structure.hasRightEar, 'cat-ear-right must exist');
    assert.ok(structure.hasOpenEyes, 'cat-eyes-open must exist');
    assert.ok(structure.hasSquintEyes, 'cat-eyes-squint must exist');
    assert.ok(structure.hasZzzWrap, 'cat-zzz-wrap must exist');
    assert.ok(structure.avatarWidth > 40, 'Avatar width must be > 40px');

    // Capture 1: Normal Idle Resident Pet
    await tabPage.bringToFront();
    await tabPage.screenshot({ path: path.join(out, '01-idle-resident-cat.png') });
    console.log('✓ Captured 01-idle-resident-cat.png');

    // 2. Test Micro-Actions: Stretch, Tilt, Knead
    console.log('Testing micro-action: action-stretch...');
    await execInPet(`() => {
      const root = document.querySelector('#roamcat-pet-host').shadowRoot;
      const avatar = root.querySelector('.roamcat-avatar-wrap');
      avatar.classList.add('action-stretch');
    }`);
    await tabPage.waitForTimeout(300);
    await tabPage.screenshot({ path: path.join(out, '02-action-stretch.png') });
    console.log('✓ Captured 02-action-stretch.png');

    console.log('Testing micro-action: action-tilt...');
    await execInPet(`() => {
      const root = document.querySelector('#roamcat-pet-host').shadowRoot;
      const avatar = root.querySelector('.roamcat-avatar-wrap');
      avatar.classList.remove('action-stretch');
      avatar.classList.add('action-tilt');
    }`);
    await tabPage.waitForTimeout(300);
    await tabPage.screenshot({ path: path.join(out, '03-action-tilt.png') });
    console.log('✓ Captured 03-action-tilt.png');

    console.log('Testing micro-action: action-knead...');
    await execInPet(`() => {
      const root = document.querySelector('#roamcat-pet-host').shadowRoot;
      const avatar = root.querySelector('.roamcat-avatar-wrap');
      avatar.classList.remove('action-tilt');
      avatar.classList.add('action-knead');
    }`);
    await tabPage.waitForTimeout(300);
    await tabPage.screenshot({ path: path.join(out, '04-action-knead.png') });
    console.log('✓ Captured 04-action-knead.png');

    // 3. Test Inactivity Sleeping / Snoozing state (zZ floating particles)
    console.log('Testing sleep mode (state-sleeping)...');
    await execInPet(`() => {
      const root = document.querySelector('#roamcat-pet-host').shadowRoot;
      const avatar = root.querySelector('.roamcat-avatar-wrap');
      avatar.classList.remove('action-knead');
      globalThis.RoamCatPet.fallAsleep();
    }`);
    await tabPage.waitForTimeout(400);
    const sleepingCheck = await execInPet(`() => {
      const root = document.querySelector('#roamcat-pet-host').shadowRoot;
      const avatar = root.querySelector('.roamcat-avatar-wrap');
      const zzz = root.querySelector('.cat-zzz-wrap');
      return {
        isSleeping: avatar.classList.contains('state-sleeping'),
        zzzDisplay: window.getComputedStyle(zzz).display
      };
    }`);
    assert.equal(sleepingCheck.isSleeping, true);
    assert.notEqual(sleepingCheck.zzzDisplay, 'none');
    await tabPage.screenshot({ path: path.join(out, '05-state-sleeping-zzz.png') });
    console.log('✓ Captured 05-state-sleeping-zzz.png');

    // Wake up
    await execInPet(`() => globalThis.RoamCatPet.wakeUp()`);
    await tabPage.waitForTimeout(300);

    // 4. Test Click Feedback (Jelly bounce & heart particle)
    console.log('Testing click reaction (jelly + heart)...');
    await execInPet(`() => globalThis.RoamCatPet.triggerClickReaction()`);
    await tabPage.waitForTimeout(100);
    const particleCheck = await execInPet(`() => {
      const root = document.querySelector('#roamcat-pet-host').shadowRoot;
      return Boolean(root.querySelector('.cat-particle'));
    }`);
    assert.equal(particleCheck, true, 'Particle element should exist on click');
    await tabPage.screenshot({ path: path.join(out, '06-click-jelly-heart.png') });
    console.log('✓ Captured 06-click-jelly-heart.png');

    // 5. Test Right Docking & Refined Edge Tab
    console.log('Testing dock on right edge...');
    await execInPet(`() => globalThis.RoamCatPet.dock('right')`);
    await tabPage.waitForTimeout(400);
    const rightDockCheck = await execInPet(`() => {
      const root = document.querySelector('#roamcat-pet-host').shadowRoot;
      const widget = root.querySelector('.roamcat-pet-widget');
      const edgeTab = root.querySelector('.roamcat-edge-tab');
      return {
        isDocked: widget.classList.contains('docked'),
        edgeTabVisible: window.getComputedStyle(edgeTab).display !== 'none'
      };
    }`);
    assert.equal(rightDockCheck.isDocked, true);
    assert.equal(rightDockCheck.edgeTabVisible, true);
    await tabPage.screenshot({ path: path.join(out, '07-docked-right-peeking.png') });
    console.log('✓ Captured 07-docked-right-peeking.png');

    // Test Right Dock Hover / Peek-Out
    console.log('Testing hover peek-out on right docked pet...');
    const widgetPos = await execInPet(`() => {
      const root = document.querySelector('#roamcat-pet-host').shadowRoot;
      const b = root.querySelector('.roamcat-edge-tab').getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }`);
    await tabPage.mouse.move(widgetPos.x, widgetPos.y);
    await tabPage.waitForTimeout(400);
    await tabPage.screenshot({ path: path.join(out, '08-docked-right-hover-peekout.png') });
    console.log('✓ Captured 08-docked-right-hover-peekout.png');

    // 6. Test Left Docking & Refined Edge Tab
    console.log('Testing dock on left edge...');
    await execInPet(`() => globalThis.RoamCatPet.dock('left')`);
    await tabPage.waitForTimeout(400);
    const leftDockCheck = await execInPet(`() => {
      const root = document.querySelector('#roamcat-pet-host').shadowRoot;
      const widget = root.querySelector('.roamcat-pet-widget');
      const edgeTab = root.querySelector('.roamcat-edge-tab');
      return {
        isDocked: widget.classList.contains('docked'),
        isLeft: widget.classList.contains('is-left'),
        edgeTabVisible: window.getComputedStyle(edgeTab).display !== 'none'
      };
    }`);
    assert.equal(leftDockCheck.isDocked, true);
    assert.equal(leftDockCheck.isLeft, true);
    assert.equal(leftDockCheck.edgeTabVisible, true);
    await tabPage.screenshot({ path: path.join(out, '09-docked-left-peeking.png') });
    console.log('✓ Captured 09-docked-left-peeking.png');

    // 7. Test Speaking while Docked (Pet auto springs forward so speech bubble is never cut off)
    console.log('Testing speaking while docked...');
    await execInPet(`() => globalThis.RoamCatPet.speakStatus('发现一篇干货好文，我来为你整理要点 喵~', { busy: false, duration: 5000 })`);
    await tabPage.waitForTimeout(400);
    await tabPage.screenshot({ path: path.join(out, '10-docked-speaking-peekout.png') });
    console.log('✓ Captured 10-docked-speaking-peekout.png');

    // 8. Undock and verify return to normal
    console.log('Testing undock...');
    await execInPet(`() => {
      globalThis.RoamCatPet.clearStatusSpeech();
      globalThis.RoamCatPet.undock();
    }`);
    await tabPage.waitForTimeout(400);
    const undockCheck = await execInPet(`() => {
      const root = document.querySelector('#roamcat-pet-host').shadowRoot;
      const widget = root.querySelector('.roamcat-pet-widget');
      const edgeTab = root.querySelector('.roamcat-edge-tab');
      return {
        isDocked: widget.classList.contains('docked'),
        edgeTabHidden: window.getComputedStyle(edgeTab).display === 'none'
      };
    }`);
    assert.equal(undockCheck.isDocked, false);
    assert.equal(undockCheck.edgeTabHidden, true);
    console.log('✓ Successfully undocked');

    // 9. Click cat → quick dock opens; click again → closes
    console.log('Testing click-to-toggle quick dock...');
    const avatarBox = await execInPet(`() => {
      const b = document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('.roamcat-avatar-wrap').getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }`);
    await tabPage.mouse.click(avatarBox.x, avatarBox.y);
    await tabPage.waitForTimeout(450);
    const dockOpenCheck = await execInPet(`() => {
      const root = document.querySelector('#roamcat-pet-host').shadowRoot;
      const widget = root.querySelector('.roamcat-pet-widget');
      const avatar = root.querySelector('.roamcat-avatar-wrap');
      return {
        dockOpen: widget.classList.contains('dock-open'),
        ariaExpanded: avatar.getAttribute('aria-expanded'),
        dockVisible: getComputedStyle(root.querySelector('.roamcat-quick-dock')).visibility,
        zoomInert: root.querySelector('#roamcat-zoom-controls').hasAttribute('inert'),
        zoomVisible: getComputedStyle(root.querySelector('#roamcat-zoom-controls')).visibility
      };
    }`);
    assert.equal(dockOpenCheck.dockOpen, true, 'click should open quick dock');
    assert.equal(dockOpenCheck.ariaExpanded, 'true');
    assert.equal(dockOpenCheck.dockVisible, 'visible', 'dock must be visible when open');
    assert.equal(dockOpenCheck.zoomInert, false, 'zoom controls inert must be lifted when open');
    assert.equal(dockOpenCheck.zoomVisible, 'visible');
    await tabPage.screenshot({ path: path.join(out, '11-quick-dock-open.png') });
    console.log('✓ Captured 11-quick-dock-open.png');

    await tabPage.mouse.click(avatarBox.x, avatarBox.y);
    // 点击后指针仍悬在猫上：悬停探出会保持按钮排可见。移开指针越过 360ms 收起延迟再断言隐藏。
    await tabPage.mouse.move(40, 40);
    await tabPage.waitForTimeout(900);
    const dockClosedCheck = await execInPet(`() => {
      const root = document.querySelector('#roamcat-pet-host').shadowRoot;
      return {
        dockOpen: root.querySelector('.roamcat-pet-widget').classList.contains('dock-open'),
        ariaExpanded: root.querySelector('.roamcat-avatar-wrap').getAttribute('aria-expanded'),
        dockVisible: getComputedStyle(root.querySelector('.roamcat-quick-dock')).visibility
      };
    }`);
    assert.equal(dockClosedCheck.dockOpen, false, 'second click should close quick dock');
    assert.equal(dockClosedCheck.ariaExpanded, 'false');
    assert.equal(dockClosedCheck.dockVisible, 'hidden', 'closed dock must be non-interactive via visibility');
    console.log('✓ Quick dock toggles on cat click');

    // 10. driveIn() sports-car mid-animation capture
    console.log('Testing driveIn() sports car...');
    await execInPet(`() => { globalThis.RoamCatPet.driveIn(); }`);
    await tabPage.waitForTimeout(800);
    const carCheck = await execInPet(`() => {
      const root = document.querySelector('#roamcat-pet-host').shadowRoot;
      const car = root.querySelector('.pet-car');
      return { hasCar: Boolean(car), wheels: root.querySelectorAll('.car-wheel').length, speedLines: root.querySelectorAll('.speed-line').length };
    }`);
    assert.equal(carCheck.hasCar, true, 'pet-car element should exist mid-driveIn');
    assert.equal(carCheck.wheels, 2);
    assert.equal(carCheck.speedLines, 3);
    await tabPage.screenshot({ path: path.join(out, '12-drive-in-car.png') });
    console.log('✓ Captured 12-drive-in-car.png');
    await tabPage.waitForTimeout(2200);
    const carGone = await execInPet(`() => !document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('.pet-car')`);
    assert.equal(carGone, true, 'pet-car element should be removed after driveIn');
    console.log('✓ driveIn completed and car removed');

    console.log('\n========================================');
    console.log('ALL ROAMCAT PET ACTION & DOCKING CHECKS PASSED!');
    console.log('Screenshots generated in preview/pet/');
    console.log('========================================\n');
  } finally {
    await context.close();
    server.close();
  }
})().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
