/**
 * @file tools/promo/capture.mjs
 * 宣传片逐帧捕获：Playwright 驱动本机 Edge 无头加载 intro.html，
 * 以 window.__seek(t) 确定性推进，多页并行截图到 preview/promo/frames/。
 * 用法：node tools/promo/capture.mjs [--fps 30] [--workers 4] [--from 0 --to 52]
 *        [--only t1,t2,...]（抽帧审查）
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FPS = num('--fps', 30);
const WORKERS = num('--workers', 4);
const FROM = num('--from', 0);
const TO = num('--to', 52);
const ONLY = arg('--only')?.split(',').map(Number) ?? null;
const OUT = path.resolve('preview/promo/frames');
const W = 1920, H = 1080;

function arg(k) { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; }
function num(k, d) { const v = arg(k); return v == null ? d : Number(v); }

async function worker(browser, frames, tag) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto('file:///D:/RoamCat/tools/promo/intro.html');
  await page.evaluate(() => window.__ready);
  for (const i of frames) {
    const t = i / FPS;
    await page.evaluate(tt => window.__seek(tt), t);
    await page.screenshot({ path: path.join(OUT, `f${String(i).padStart(5, '0')}.png`), type: 'png' });
    if (i % 150 === 0) console.log(`[w${tag}] frame ${i}`);
  }
  await page.close();
}

const main = async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EDGE, headless: true,
    args: ['--allow-file-access-from-files', '--hide-scrollbars', '--disable-lcd-text', '--force-color-profile=srgb'],
  });
  const all = ONLY ? ONLY.map(t => Math.round(t * FPS)) : (() => { const a = []; for (let i = Math.round(FROM * FPS); i <= Math.round(TO * FPS); i++) a.push(i); return a; })();
  const buckets = Array.from({ length: WORKERS }, () => []);
  all.forEach((f, i) => buckets[i % WORKERS].push(f));
  console.log(`capturing ${all.length} frames @${FPS}fps, ${WORKERS} workers → ${OUT}`);
  const t0 = Date.now();
  await Promise.all(buckets.filter(b => b.length).map((b, i) => worker(browser, b, i)));
  await browser.close();
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
};
main().catch(e => { console.error(e); process.exit(1); });
