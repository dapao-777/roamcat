/**
 * @file tools/capture-readme-shots.cjs
 * 文件职责：重拍 README 里的设置页与弹窗截图，保证换 logo/界面后能一条命令复现：
 *   - .github/assets/popup-dark.png：英文界面、深色主题的工具栏弹窗（1.5 倍像素，模型服务显示阶跃星辰）；
 *   - .github/assets/options-zh-dark.png：中文界面、深色主题的设置页「阅读偏好」分区（1440×824 缩到 1024 宽）；
 *   - .github/assets/options-light.png / options-dark.png：README 主图，中文明暗两版（1440×1000）；
 *   - .github/assets/options-en.png：英文浅色设置页（1440×1000）；popup-light.png：中文浅色弹窗（原尺寸）。
 *   - 欢迎页横幅/全页、阅读器、查词卡、摘要卡：取自 verify:ui 的 preview/ui-audit 截图，按 README 取景裁切或拷贝。
 * 主要内容：经 tools/lib/extension-browser.cjs 在临时配置里加载 dist/extension；写入一个仅供展示的
 *   阶跃星辰服务（占位密钥，本脚本不发起任何模型请求），切主题/语言后截图。
 * 用法：npm run build && npm run verify:ui && node tools/capture-readme-shots.cjs
 * 模块边界：只写 .github/assets 下的上述 PNG；临时扩展副本与浏览器配置在结束时删除。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
const path = require('node:path');
const {launchExtension} = require('./lib/extension-browser.cjs');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, '.github', 'assets');

// 仅用于截图展示的服务行；密钥是占位串，脚本全程不触发请求。
const DEMO_SERVICE = {
  id: 'readme-stepfun', name: '阶跃星辰', providerId: 'stepfun', baseUrl: 'https://api.stepfun.com/v1',
  model: 'step-3.7-flash', apiKey: 'readme-placeholder-key', options: {}, maxConcurrency: 2,
};

// 弹窗截图对着的真实英文页面（RoamCat 支持的技术文档站）。
const DEMO_PAGE = 'https://developer.mozilla.org/en-US/docs/Web/JavaScript';

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

    // 弹窗单独开成页签时，“当前标签页”就是它自己，会显示“此页面不支持”。另开一个真实英文页面，
    // 让弹窗的 tabs.query({active}) 落到那一页——和用户在该页点工具栏图标看到的一样。
    const article = await context.newPage();
    await article.goto(DEMO_PAGE, {waitUntil: 'domcontentloaded'});
    const openPopup = async () => {
      const page = await context.newPage();
      await page.addInitScript(target => {
        const query = chrome.tabs.query.bind(chrome.tabs);
        chrome.tabs.query = async info => info?.active ? (await query({})).filter(tab => tab.url?.startsWith(target)).slice(0, 1) : query(info);
      }, DEMO_PAGE);
      return page;
    };

    await prepare(extPage, {lang: 'en', theme: 'dark'});
    const popup = await openPopup();
    await popup.setViewportSize({width: 420, height: 900});
    await popup.goto(`${base}/ui/popup.html`);
    await popup.waitForTimeout(2000);
    // 真实弹窗 body 限高 580px、超出可滚动；README 要展示整张弹窗，截图前放开限高。
    await popup.evaluate(() => { document.body.style.maxHeight = 'none'; });
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
    // 真实弹窗按内容自适应高度：视口就设成内容高度，整页截取，不另外裁切（裁切会让底栏被高视口的布局压住）。
    await captureAt(context, popup, {width: clip.width, height: clip.height, scale: 1.5}, path.join(assets, 'popup-dark.png'));
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

    // README 主图（明暗随 GitHub 主题切换）与英文版：1440×1000 原尺寸。
    for (const {lang, theme, file} of [
      {lang: 'zh', theme: 'light', file: 'options-light.png'},
      {lang: 'zh', theme: 'dark', file: 'options-dark.png'},
      {lang: 'en', theme: 'light', file: 'options-en.png'},
    ]) {
      await prepare(extPage, {lang, theme});
      await extPage.setViewportSize({width: 1440, height: 1000});
      await extPage.reload();
      await extPage.waitForTimeout(1200);
      await extPage.evaluate(value => {
        document.documentElement.setAttribute('data-theme', value);
        window.scrollTo(0, 0);
        document.querySelector('.main-panel')?.scrollTo(0, 0);
      }, theme);
      await extPage.waitForTimeout(300);
      await captureAt(context, extPage, {width: 1440, height: 1000, scale: 1}, path.join(assets, file));
    }

    // 浅色弹窗：中文界面，原尺寸，按内容高度裁切。
    await prepare(extPage, {lang: 'zh', theme: 'light'});
    const popupLight = await openPopup();
    await popupLight.setViewportSize({width: 420, height: 900});
    await popupLight.goto(`${base}/ui/popup.html`);
    await popupLight.waitForTimeout(2000);
    await popupLight.evaluate(() => { document.body.style.maxHeight = 'none'; });
    const lightClip = await popupLight.evaluate(() => {
      let right = 0, bottom = 0;
      for (const el of document.querySelectorAll('roamcat-popup *')) {
        const rect = el.getBoundingClientRect();
        if (rect.width && rect.height) { right = Math.max(right, rect.right); bottom = Math.max(bottom, rect.bottom); }
      }
      return {x: 0, y: 0, width: Math.ceil(right), height: Math.ceil(bottom) + 12};
    });
    await captureAt(context, popupLight, {width: lightClip.width, height: lightClip.height, scale: 1}, path.join(assets, 'popup-light.png'));
    await popupLight.close();
    await article.close();

    // 欢迎页、阅读器与页内挂件沿用 verify:ui 刚截的图（preview/ui-audit），按 README 的取景裁切或原样拷贝。
    // 裁切在浏览器里完成：把原图按原尺寸铺进页面再截取区域，不引入图像库。
    const audit = path.join(root, 'preview', 'ui-audit');
    const fromAudit = [
      {src: 'welcome-dark.png', file: 'banner-welcome-dark.png', clip: {x: 0, y: 0, width: 1440, height: 628}},
      {src: 'welcome-light.png', file: 'banner-welcome-light.png', clip: {x: 0, y: 0, width: 1440, height: 628}},
      {src: 'pet-summary-dark.png', file: 'pet-summary-dark.png', clip: {x: 856, y: 507, width: 584, height: 479}},
      {src: 'reader-doc-dark.png', file: 'reader-dark.png'},
      {src: 'welcome-dark.png', file: 'welcome-dark.png'},
      {src: 'welcome-light.png', file: 'welcome-light.png'},
      {src: 'widget-wordcard-dark.png', file: 'widget-wordcard-dark.png'},
    ];
    const fs = require('node:fs');
    const copied = [];
    if (fs.existsSync(path.join(audit, 'welcome-dark.png'))) {
      const viewer = await context.newPage();
      for (const {src, file, clip} of fromAudit) {
        const from = path.join(audit, src);
        if (!fs.existsSync(from)) continue;
        if (!clip) { fs.copyFileSync(from, path.join(assets, file)); copied.push(file); continue; }
        const png = fs.readFileSync(from);
        await viewer.setViewportSize({width: png.readUInt32BE(16), height: png.readUInt32BE(20)});
        await viewer.setContent(`<style>html,body{margin:0}img{display:block}</style><img src="data:image/png;base64,${png.toString('base64')}">`);
        await viewer.screenshot({path: path.join(assets, file), clip});
        copied.push(file);
      }
      await viewer.close();
    } else {
      console.warn('preview/ui-audit 里没有 verify:ui 截图，跳过欢迎页/阅读器/挂件图；先运行 npm run verify:ui。');
    }
    for (const file of copied) console.log(`✔ .github/assets/${file}（取自 verify:ui）`);

    for (const file of ['popup-dark.png', 'options-zh-dark.png', 'options-light.png', 'options-dark.png', 'options-en.png', 'popup-light.png']) console.log(`✔ .github/assets/${file}`);
  } finally {
    await run.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
