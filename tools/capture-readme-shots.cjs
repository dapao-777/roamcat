/**
 * @file tools/capture-readme-shots.cjs
 * 文件职责：重拍 README 里原本手工截取的两张图，保证换 logo/界面后能一条命令复现：
 *   - .github/assets/popup-dark.png：英文界面、深色主题的工具栏弹窗（1.5 倍像素，模型服务显示阶跃星辰）；
 *   - .github/assets/options-zh-dark.png：中文界面、深色主题的设置页「阅读偏好」分区（1440×824 缩到 1024 宽）。
 * 主要内容：经 tools/lib/edge-extension.cjs 在临时配置里加载 dist/extension；写入一个仅供展示的
 *   阶跃星辰服务（占位密钥，本脚本不发起任何模型请求），切主题/语言后截图。
 * 用法：npm run build && node tools/capture-readme-shots.cjs
 * 模块边界：只写上述两张 PNG；临时扩展副本与浏览器配置在结束时删除。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
const path = require('node:path');
const {launchExtension} = require('./lib/edge-extension.cjs');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, '.github', 'assets');

// 仅用于截图展示的服务行；密钥是占位串，脚本全程不触发请求。
const DEMO_SERVICE = {
  id: 'readme-stepfun', name: '阶跃星辰', providerId: 'stepfun', baseUrl: 'https://api.stepfun.com/v1',
  model: 'step-3.7-flash', apiKey: 'readme-placeholder-key', options: {}, maxConcurrency: 2,
};

// Playwright 的 page.screenshot 会按自己的视口重设缩放，像素倍率改用 CDP 设备度量 + 直接截图。
async function captureAt(context, page, {width, height, scale, clip}, file) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: scale, mobile: false});
  await page.waitForTimeout(500);
  const {data} = await cdp.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false, ...(clip ? {clip: {...clip, scale: 1}} : {})});
  require('node:fs').writeFileSync(file, Buffer.from(data, 'base64'));
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await cdp.detach();
}

async function prepare(page, {lang, theme}) {
  await page.evaluate(async ({lang, theme, service}) => {
    localStorage.setItem('roamcat_ui_theme', theme);
    localStorage.setItem('roamcat_ui_lang', lang);
    const {settings = {}} = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({
      roamcat_ui_lang: lang,
      settings: {...settings, providerKind: 'api', apiServices: [service], activeApiServiceId: service.id},
    });
  }, {lang, theme, service: DEMO_SERVICE});
}

(async () => {
  const run = await launchExtension({extensionDir: path.join(root, 'dist', 'extension')});
  const {context, extPage} = run;
  try {
    // Node 的 URL 对 chrome-extension: 返回 origin "null"，直接截取扩展根。
    const base = extPage.url().split('/ui/')[0];

    await prepare(extPage, {lang: 'en', theme: 'dark'});
    const popup = await context.newPage();
    await popup.setViewportSize({width: 420, height: 900});
    await popup.goto(`${base}/ui/popup.html`);
    await popup.waitForTimeout(900);
    // 真实弹窗只有内容那么宽高：按渲染内容的外包框裁切，不留独立页签里多出的空白。
    const clip = await popup.evaluate(() => {
      let right = 0, bottom = 0;
      for (const el of document.querySelectorAll('roamcat-popup *')) {
        const rect = el.getBoundingClientRect();
        if (rect.width && rect.height) { right = Math.max(right, rect.right); bottom = Math.max(bottom, rect.bottom); }
      }
      return {x: 0, y: 0, width: Math.ceil(right), height: Math.ceil(bottom) + 12};
    });
    // 1.5 倍像素，与原图一致。
    await captureAt(context, popup, {width: 420, height: 900, scale: 1.5, clip}, path.join(assets, 'popup-dark.png'));
    await popup.close();

    await prepare(extPage, {lang: 'zh', theme: 'dark'});
    // 设置页只允许一个页签（shared.js 会关掉重复的），所以在扩展自带的那一页里跳转。
    await extPage.setViewportSize({width: 1440, height: 824});
    // 先前停在设置页，同址只改 hash 不会重新加载；强制 reload 让主题与语言按新偏好初始化。
    await extPage.goto(`${base}/ui/options.html#assistance`);
    await extPage.reload();
    await extPage.waitForTimeout(1200);
    await extPage.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      window.scrollTo(0, 0);
      document.querySelector('.main-panel')?.scrollTo(0, 0);
    });
    await extPage.waitForTimeout(300);
    // 1440 宽的窗口按 1024 宽输出：缩放因子 1024/1440。
    await captureAt(context, extPage, {width: 1440, height: 824, scale: 1024 / 1440}, path.join(assets, 'options-zh-dark.png'));

    console.log('✔ .github/assets/popup-dark.png');
    console.log('✔ .github/assets/options-zh-dark.png');
  } finally {
    await run.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
