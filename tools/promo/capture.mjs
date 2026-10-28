/**
 * @file tools/promo/capture.mjs
 * 宣传片逐帧捕获：无头 ego lite（tools/lib/ego.mjs）加载 intro.html，
 * 以 window.__seek(t) 确定性推进，多页并行截图到 preview/promo/frames/。
 * 用法：node tools/promo/capture.mjs [--fps 30] [--workers 4] [--from 0 --to 52]
 *        [--only t1,t2,...]（抽帧审查）
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, openBrowser } from '../lib/ego.mjs';

const FPS = num('--fps', 30);
const WORKERS = num('--workers', 4);
const FROM = num('--from', 0);
const TO = num('--to', 33.6);
const ONLY = arg('--only')?.split(',').map(Number) ?? null;
const OUT = path.join(REPO, 'preview/promo/frames');
const INTRO = pathToFileURL(path.join(REPO, 'tools/promo/intro.html')).href;
const W = 1920, H = 1080;

function arg(k) { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; }
function num(k, d) { const v = arg(k); return v == null ? d : Number(v); }

async function worker(run, frames, tag) {
  const page = await run.newPage();
  await page.setViewportSize({ width: W, height: H }, 1);
  await page.goto(INTRO);
  await page.evaluate(() => Promise.resolve(window.__ready).then(() => true));
  for (const i of frames) {
    const t = i / FPS;
    await page.evaluate(tt => window.__seek(tt), t);
    await page.screenshot({ path: path.join(OUT, `f${String(i).padStart(5, '0')}.png`), required: true });
    if (i % 150 === 0) console.log(`[w${tag}] frame ${i}`);
  }
  await page.close();
}

const main = async () => {
  mkdirSync(OUT, { recursive: true });
  const run = await openBrowser({ extension: null, args: ['--allow-file-access-from-files', '--disable-lcd-text', '--force-color-profile=srgb'] });
  const all = ONLY ? ONLY.map(t => Math.round(t * FPS)) : (() => { const a = []; for (let i = Math.round(FROM * FPS); i <= Math.round(TO * FPS); i++) a.push(i); return a; })();
  const buckets = Array.from({ length: WORKERS }, () => []);
  all.forEach((f, i) => buckets[i % WORKERS].push(f));
  console.log(`capturing ${all.length} frames @${FPS}fps, ${WORKERS} workers → ${OUT}`);
  const t0 = Date.now();
  try {
    await Promise.all(buckets.filter(b => b.length).map((b, i) => worker(run, b, i)));
  } finally {
    await run.close();
  }
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
};
main().catch(e => { console.error(e); process.exit(1); });
