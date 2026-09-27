/**
 * @file tools/capture-social.mjs
 * 生成 GitHub social preview 与落地页 og:image：Playwright 驱动本机 Edge 无头
 * 截图 tools/social-preview.html（1280×640）→ .github/assets/social-preview.png
 * 并同步拷贝为 docs/assets/og-cover.png。
 * 用法：node tools/capture-social.mjs
 * 许可：MPL-2.0
 */
import { chromium } from 'playwright-core';
import { copyFileSync } from 'node:fs';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const SRC = 'file:///' + path.resolve('tools/social-preview.html').replace(/\\/g, '/');
const OUT_SOCIAL = path.resolve('.github/assets/social-preview.png');
const OUT_OG = path.resolve('docs/assets/og-cover.png');

const main = async () => {
  const browser = await chromium.launch({
    executablePath: EDGE, headless: true,
    args: ['--allow-file-access-from-files', '--hide-scrollbars', '--force-color-profile=srgb'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
  await page.goto(SRC);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT_SOCIAL, type: 'png' });
  await browser.close();
  copyFileSync(OUT_SOCIAL, OUT_OG);
  console.log('✔', OUT_SOCIAL);
  console.log('✔', OUT_OG);
};
main().catch(e => { console.error(e); process.exit(1); });
