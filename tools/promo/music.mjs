/**
 * @file tools/promo/music.mjs
 * 宣传片配乐合成：chiptune（脉冲方波主旋律 + 三角波贝斯 + 噪声鼓组 + 和声垫），
 * 直出 44.1kHz/16bit 立体声 WAV → preview/promo/music.wav。节拍与 anim.js 场景对齐。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const SR = 44100, DUR = 52, BPM = 104;
const BEAT = 60 / BPM, BAR = BEAT * 4;      // beat≈0.577s, bar≈2.308s
const N = m => 440 * Math.pow(2, (m - 69) / 12);
const CH = { C: [48, 55, 64, 67], Cm7: [48, 55, 64, 70], G: [43, 50, 59, 67], Am: [45, 52, 60, 67], Am7: [45, 52, 60, 67], F: [41, 48, 57, 65], Fmaj7: [41, 48, 57, 64], Dm: [38, 45, 57, 62], Em: [40, 47, 59, 64], Cmaj7: [48, 55, 59, 64] };
const BASS = { C: 36, G: 31, Am: 33, F: 29, Dm: 26, Em: 28, Cmaj7: 36, Am7: 33, Fmaj7: 29, Cm7: 36 };

const len = Math.ceil(DUR * SR);
const L = new Float32Array(len), R = new Float32Array(len);

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 * 2 - 1;

function add(t, dur, fn, vol = .2, pan = 0) {
  const s0 = Math.floor(t * SR), s1 = Math.min(len, Math.floor((t + dur) * SR));
  const ca = Math.cos((pan + 1) * Math.PI / 4), sa = Math.sin((pan + 1) * Math.PI / 4);
  for (let i = s0; i < s1; i++) {
    const v = fn((i - s0) / SR, i - s0) * vol;
    L[i] += v * ca; R[i] += v * sa;
  }
}
/* 乐器 */
const pulse = (f, duty = .25) => (tt) => (tt * f % 1) < duty ? 1 : -1;
const tri = f => tt => { const p = tt * f % 1; return p < .5 ? 4 * p - 1 : 3 - 4 * p; };
const sin = f => tt => Math.sin(2 * Math.PI * f * tt);
const env = (a, d, s = 0) => tt => tt < a ? tt / a : Math.max(s, Math.exp(-(tt - a) / d));

function kick(t, v = .5) {
  add(t, .22, (tt) => Math.sin(2 * Math.PI * (140 * Math.exp(-tt * 22) + 46) * tt) * env(.002, .09)(tt), v);
}
function hat(t, v = .075, dur = .05) { add(t, dur, (tt) => rnd() * env(.001, .016)(tt), v, .18); }
function snare(t, v = .14) {
  add(t, .19, (tt) => (rnd() * .7 + Math.sin(2 * Math.PI * 185 * tt) * .4) * env(.002, .05)(tt), v, .1);
}
function bass(m, t, d, v = .26) {
  add(t, d, (tt) => tri(N(m))(tt) * env(.008, .14, .0)(tt), v, -.1);
}
function lead(m, t, d, v = .15, duty = .25) {
  const f = N(m);
  add(t, d, (tt) => pulse(f, duty)(tt) * env(.006, .10)(tt), v, -.16);
  add(t, d, (tt) => pulse(f * 1.005, duty)(tt) * env(.006, .10)(tt), v * .5, .22); // 失谐副声部
}
function pad(m, t, d, v = .042) {
  const f = N(m);
  add(t, d, (tt) => (sin(f)(tt) * .6 + tri(f)(tt) * .3 + sin(f * 2.001)(tt) * .12) * env(.3, .6, .35)(tt) * (tt > d - .5 ? Math.max(0, (d - tt) / .5) : 1), v);
}
function pluck(m, t, v = .18) {
  const f = N(m);
  add(t, .5, (tt) => pulse(f, .5)(tt) * env(.003, .06)(tt), v, .12);
}
function sparkle(t, base = 84, v = .13) { // 上行琶音闪音
  [0, 4, 7, 12, 16, 19].forEach((s, i) => {
    const f = N(base + s), tt0 = t + i * .055;
    add(tt0, .4, (tt) => pulse(f, .5)(tt) * env(.002, .09)(tt), v, i % 2 ? .3 : -.3);
  });
}
function riser(t, d = .8, v = .06) { // 噪声上行过门
  add(t, d, (tt) => rnd() * env(.05, .3)(tt) * (tt / d), v);
}

/* ---------------- 编曲 ---------------- */
// 引子 0–4.6（bar 0-1）：Cmaj7 → Am7 pad + logo 闪音
pad(48, 0, 2.6); pad(55, 0, 2.6); pad(59, .1, 2.5); pad(64, .2, 2.4);
pad(45, 2.3, 2.5); pad(52, 2.35, 2.4); pad(60, 2.4, 2.3); pad(67, 2.5, 2.2);
sparkle(1.45, 84);
sparkle(3.9, 79, .09);

// A 段 4.615–23.08（bar 2-9）：C G Am F ×2，鼓组进入
const A = ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'];
const LEAD_A = [ // 每小节主旋律（midi, 拍内偏移, 拍长）
  [[76, 0, 1], [79, 1, .5], [81, 1.5, .5], [79, 2, 1], [76, 3, 1]],
  [[74, 0, .5], [76, .5, .5], [74, 1, 1], [71, 2, 1], [74, 3, 1]],
  [[72, 0, .5], [76, .5, .5], [79, 1, 1], [76, 2, .5], [74, 2.5, .5], [72, 3, 1]],
  [[69, 0, .5], [72, .5, .5], [76, 1, 1], [74, 2, .5], [72, 2.5, .5], [69, 3, 1]],
  [[76, 0, 1], [79, 1, .5], [84, 1.5, 1.5], [83, 3, .5], [81, 3.5, .5]],
  [[79, 0, 1], [74, 1, .5], [71, 1.5, .5], [74, 2, 1], [79, 3, 1]],
  [[77, 0, .5], [76, .5, .5], [72, 1, 1], [69, 2, .5], [72, 2.5, .5], [74, 3, 1]],
  [[71, 0, 1], [74, 1, .5], [79, 1.5, .5], [81, 2, 1.5], [79, 3.5, .5]],
];
for (let b = 0; b < 8; b++) {
  const t0 = 4.615 + b * BAR, ch = A[b];
  for (const m of CH[ch]) pad(m, t0, BAR * 1.05, .038);
  for (let e = 0; e < 8; e++) bass(BASS[ch] + (e % 4 === 2 ? 7 : 0), t0 + e * BEAT / 2, .3);
  kick(t0); kick(t0 + BEAT * 2); snare(t0 + BEAT * 2, .09);
  for (let e = 0; e < 8; e += 2) hat(t0 + e * BEAT / 2 + BEAT / 4);
  for (const [m, sb, lb] of LEAD_A[b]) lead(m, t0 + sb * BEAT, lb * BEAT * .92);
}

// B 段 23.08–34.6（bar 10-14）：Am F C G Am，加密鼓点
const B = ['Am', 'F', 'C', 'G', 'Am'];
const LEAD_B = [
  [[81, 0, .5], [79, .5, .5], [76, 1, .5], [72, 1.5, .5], [76, 2, 1], [79, 3, 1]],
  [[77, 0, .5], [76, .5, .5], [72, 1, .5], [69, 1.5, .5], [72, 2, 1], [76, 3, 1]],
  [[79, 0, 1], [76, 1, .5], [72, 1.5, .5], [76, 2, 1], [79, 3, .5], [81, 3.5, .5]],
  [[83, 0, 1], [79, 1, .5], [74, 1.5, .5], [79, 2, 1.5], [78, 3.5, .5]],
  [[76, 0, 1], [72, 1, .5], [69, 1.5, .5], [72, 2, 1], [76, 3, 1]],
];
for (let b = 0; b < 5; b++) {
  const t0 = 23.08 + b * BAR, ch = B[b];
  for (const m of CH[ch]) pad(m, t0, BAR * 1.05, .034);
  for (let e = 0; e < 8; e++) bass(BASS[ch] + (e === 6 ? 7 : e === 7 ? 12 : 0), t0 + e * BEAT / 2, .26, .24);
  kick(t0); kick(t0 + BEAT * 2); kick(t0 + BEAT * 3.5, .3); snare(t0 + BEAT * 2);
  for (let e = 0; e < 16; e++) hat(t0 + e * BEAT / 4, e % 4 === 2 ? .08 : .05);
  for (const [m, sb, lb] of LEAD_B[b]) lead(m + 12, t0 + sb * BEAT, lb * BEAT * .9, .12, .2);
}
pluck(88, 22.15); // 词卡弹出
pluck(91, 22.24, .14);

// C 段 34.6–41.5（bar 15-17）：F C G 推进
const Csec = ['F', 'C', 'G'];
for (let b = 0; b < 3; b++) {
  const t0 = 34.6 + b * BAR, ch = Csec[b];
  for (const m of CH[ch]) pad(m, t0, BAR * 1.05, .036);
  for (let e = 0; e < 8; e++) bass(BASS[ch] + (e % 4 === 3 ? 7 : 0), t0 + e * BEAT / 2, .3);
  kick(t0); kick(t0 + BEAT * 2); snare(t0 + BEAT * 2, .11);
  for (let e = 0; e < 8; e += 2) hat(t0 + e * BEAT / 2 + BEAT / 4);
  [0, 2, 4].forEach((e, i) => lead(CH[ch][i % 4] + 24, t0 + e * BEAT / 2, .42, .11, .2));
}

// 收束 41.5–52（bar 18+）：pad 回归 + 点缀 + 终式和弦
for (const m of CH.Cmaj7) pad(m, 41.5, 4.9, .04);
for (const m of CH.Am7) pad(m, 46.3, 3.4, .036);
for (const m of [48, 55, 59, 64, 67]) pad(m, 49.6, 2.6, .05);
kick(41.5); sparkle(42.3, 81, .08);
pluck(79, 45.9, .12); pluck(84, 46.15, .1); pluck(88, 46.4, .1);
sparkle(47.5, 84, .11); sparkle(49.9, 88, .15);
riser(4.2, .4); riser(34.2, .35); riser(45.5, .4);
lead(84, 50.4, 1.3, .13, .5); lead(88, 50.4, 1.3, .09, .5);

/* 简易延迟（主旋律空间感）已混入双声道声像替代 */

/* ---------------- 母带 & 写盘 ---------------- */
mkdirSync('preview/promo', { recursive: true });
const g = 1.25;
for (let i = 0; i < len; i++) {                       // soft clip + 淡入淡出
  const fi = Math.min(1, i / (SR * .25)), fo = Math.min(1, (len - i) / (SR * 1.4));
  L[i] = Math.tanh(L[i] * g) * fi * fo; R[i] = Math.tanh(R[i] * g) * fi * fo;
}
const buf = Buffer.alloc(44 + len * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + len * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(len * 4, 40);
for (let i = 0; i < len; i++) {
  buf.writeInt16LE(Math.max(-1, Math.min(1, L[i])) * 32767 | 0, 44 + i * 4);
  buf.writeInt16LE(Math.max(-1, Math.min(1, R[i])) * 32767 | 0, 46 + i * 4);
}
const out = path.resolve('preview/promo/music.wav');
writeFileSync(out, buf);
console.log('wav →', out, (buf.length / 1048576).toFixed(1) + 'MB');
