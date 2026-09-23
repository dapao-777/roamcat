/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
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
const source = path.resolve(process.env.EXTENSION_DIR || path.join(__dirname, '../roamcat-0.2.0/extension'));
const tempExt = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-test-ext-'));
fs.cpSync(source, tempExt, { recursive: true });

// Ensure host permissions include mock origins for testing
const manifestPath = path.join(tempExt, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*', 'https://router.requesty.ai/*', 'https://custom-jev.example.com/*'];
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-test-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${tempExt}`,
      `--load-extension=${tempExt}`
    ],
    viewport: { width: 1440, height: 1000 }
  });

  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extId = new URL(worker.url()).host;
    const base = `chrome-extension://${extId}`;
    const page = await context.newPage();

    console.log('1. Navigating to Options #advanced...');
    await page.goto(`${base}/ui/options.html#advanced`);
    await page.waitForTimeout(500);

    // 1. Verify Jev radio button exists
    const jevRadio = page.locator('input[name="domain-detection-mode"][value="jev"]');
    assert.equal(await jevRadio.count(), 1, 'Jev radio button not found');
    await jevRadio.check();
    await page.waitForTimeout(200);

    // 2. Verify detection-jev panel becomes visible
    const jevPanel = page.locator('#detection-jev');
    assert.equal(await jevPanel.isVisible(), true, 'detection-jev should be visible when Jev mode is selected');

    // 3. Verify inputs exist
    const modelInput = page.locator('#detection-jev-model');
    const urlInput = page.locator('#detection-jev-url');
    const keyInput = page.locator('#detection-jev-key');

    assert.equal(await modelInput.inputValue(), 'typesafe/jev-1.13.0', 'Default model should be typesafe/jev-1.13.0');
    assert.equal(await urlInput.inputValue(), 'https://router.requesty.ai/v1', 'Default URL should be https://router.requesty.ai/v1');

    // 4. Test filling custom Key & custom URL
    console.log('2. Filling custom Key and custom URL...');
    await keyInput.fill('sk-requesty-custom-secret-key-999');
    await urlInput.fill('https://custom-jev.example.com/v1');
    await modelInput.fill('typesafe/jev-custom-model');

    await page.locator('#save-recognition').click();
    await page.waitForTimeout(600);

    // 5. Verify backend storage has updated
    const savedSettings = await worker.evaluate(async () => {
      const state = await chrome.storage.local.get('settings');
      return state.settings?.domainDetection;
    });
    console.log('Saved settings in storage:', savedSettings);
    assert.equal(savedSettings.mode, 'jev', 'Mode must be jev');
    assert.equal(savedSettings.jevModel, 'typesafe/jev-custom-model', 'jevModel must match');
    assert.equal(savedSettings.jevApiKey, 'sk-requesty-custom-secret-key-999', 'jevApiKey must match');
    assert.equal(savedSettings.jevBaseUrl, 'https://custom-jev.example.com/v1', 'jevBaseUrl must match');

    // 6. Reload options page and verify persistence & placeholder
    console.log('3. Reloading page to test persistence and masking...');
    await page.reload();
    await page.waitForTimeout(500);

    assert.equal(await jevRadio.isChecked(), true, 'Jev radio must stay checked after reload');
    assert.equal(await jevPanel.isVisible(), true, 'Jev panel must remain visible');
    assert.equal(await modelInput.inputValue(), 'typesafe/jev-custom-model', 'Saved model must be retained');
    assert.equal(await urlInput.inputValue(), 'https://custom-jev.example.com/v1', 'Saved URL must be retained');

    const placeholder = await keyInput.getAttribute('placeholder');
    assert.ok(placeholder.includes('已保存'), 'Key placeholder should indicate key is saved');

    const keyState = await page.locator('#detection-jev-key-state').textContent();
    assert.ok(keyState.includes('已保存在本机'), 'Key state should indicate key is saved');

    // 7. Test Clear Jev Key
    console.log('4. Testing Clear Jev Key...');
    page.on('dialog', async dialog => {
      await dialog.accept();
    });
    await page.locator('#clear-detection-jev-key').click();
    await page.waitForTimeout(600);

    const afterClearSettings = await worker.evaluate(async () => {
      const state = await chrome.storage.local.get('settings');
      return state.settings?.domainDetection;
    });
    assert.equal(afterClearSettings.jevApiKey, '', 'jevApiKey must be cleared in storage');
    assert.equal(afterClearSettings.jevModel, 'typesafe/jev-custom-model', 'jevModel should remain intact');
    assert.equal(afterClearSettings.jevBaseUrl, 'https://custom-jev.example.com/v1', 'jevBaseUrl should remain intact');

    console.log('\n=========================================');
    console.log('ALL JEV CUSTOM KEY & URL TESTS PASSED 100%!');
    console.log('=========================================\n');
  } finally {
    await context.close();
    try {
      fs.rmSync(tempExt, { recursive: true, force: true });
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {}
  }
})();
