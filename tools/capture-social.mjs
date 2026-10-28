/**
 * @file tools/capture-social.mjs
 * 生成 GitHub social preview 与落地页 og:image：无头 ego lite（tools/lib/ego.mjs）截图
 * tools/social-preview.html（1280×640）→ .github/assets/social-preview.png
 * 并同步拷贝为 docs/assets/og-cover.png。
 * 用法：node tools/capture-social.mjs
 * 许可：MPL-2.0
 */
import { copyFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, openBrowser } from './lib/ego.mjs';

const SRC = pathToFileURL(path.join(REPO, 'tools/social-preview.html')).href;
const OUT_SOCIAL = path.join(REPO, '.github/assets/social-preview.png');
const OUT_OG = path.join(REPO, 'docs/assets/og-cover.png');

const main = async () => {
  const run = await openBrowser({ extension: null, args: ['--allow-file-access-from-files', '--force-color-profile=srgb'] });
  try {
    const page = run.page;
    await page.setViewportSize({ width: 1280, height: 640 }, 1);
    await page.goto(SRC);
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await page.screenshot({ path: OUT_SOCIAL, required: true });
  } finally {
    await run.close();
  }
  copyFileSync(OUT_SOCIAL, OUT_OG);
  console.log('✔', OUT_SOCIAL);
  console.log('✔', OUT_OG);
};
main().catch(e => { console.error(e); process.exit(1); });
