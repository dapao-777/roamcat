/**
 * @file tools/promo/render.mjs
 * 宣传片流水线编排：① 提取资产 _extract → ② 合成音乐 music → ③ 逐帧捕获 capture
 * → ④ ffmpeg 编码合成 preview/promo/roamcat-intro.mp4（H.264 + AAC）。
 * 用法：node tools/promo/render.mjs [--skip-frames] [--fps 30]
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static');
const skip = process.argv.includes('--skip-frames');
const fps = (process.argv[process.argv.indexOf('--fps') + 1] ?? '30');
const OUT = path.resolve('preview/promo');

const run = (cmd, args) => { console.log('▶', cmd, ...args); execFileSync(cmd, args, { stdio: 'inherit' }); };

mkdirSync(OUT, { recursive: true });
run(process.execPath, ['tools/promo/_extract.mjs']);
if (!existsSync(path.join(OUT, 'music.wav'))) run(process.execPath, ['tools/promo/music.mjs']);
if (!skip) run(process.execPath, ['tools/promo/capture.mjs', '--fps', fps]);
run(ffmpeg, [
  '-y', '-framerate', String(fps), '-i', path.join(OUT, 'frames/f%05d.png'),
  '-i', path.join(OUT, 'music.wav'),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest',
  path.join(OUT, 'roamcat-intro.mp4'),
]);
console.log('✔', path.join(OUT, 'roamcat-intro.mp4'));
