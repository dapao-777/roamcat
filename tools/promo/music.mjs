/**
 * @file tools/promo/music.mjs
 * 宣传片配乐合成：动感电子（四分底鼓 + 侧链抽动垫音/和弦刺 + 锯齿波琶音 + 噪声鼓组
 * + riser/鼓花），直出 44.1kHz/16bit 立体声 WAV → preview/promo/music.wav。
 * 128 BPM，场景边界与 anim.js 的 SCENE/WIPES/FLASHES 对齐。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const SR = 44100, DUR = 33.6, BPM = 128;
const BEAT = 60 / BPM, BAR = BEAT * 4;      // beat=0.46875s, bar=1.875s
const N = m => 440 * Math.pow(2, (m - 69) / 12);
const CH = { C: [48, 55, 64, 67], G: [43, 50, 59, 67], Am: [45, 52, 60, 67], F: [41, 48, 57, 65], Cmaj7: [48, 55, 59, 64], Am7: [45, 52, 60, 67] };
const BASS = { C: 36, G: 31, Am: 33, F: 29, Cmaj7: 36, Am7: 33 };

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
const saw = f => tt => 2 * (tt * f % 1) - 1;
const pulse = (f, duty = .25) => (tt) => (tt * f % 1) < duty ? 1 : -1;
const tri = f => tt => { const p = tt * f % 1; return p < .5 ? 4 * p - 1 : 3 - 4 * p; };
const sin = f => tt => Math.sin(2 * Math.PI * f * tt);
const env = (a, d, s = 0) => tt => tt < a ? tt / a : Math.max(s, Math.exp(-(tt - a) / d));
/* 侧链抽动：每拍起点压瘪后回弹，模拟 pump */
const pump = tt => 1 - .62 * Math.exp(-(tt % BEAT) / .11);

function kick(t, v = .5) {
  add(t, .22, (tt) => (Math.sin(2 * Math.PI * (145 * Math.exp(-tt * 26) + 46) * tt)) * env(.001, .09)(tt), v);
  add(t, .03, (tt) => rnd() * env(.0005, .006)(tt), v * .4);
}
function clap(t, v = .16) {
  for (let k = 0; k < 3; k++) add(t + k * .012, .16, (tt) => rnd() * env(.001, .035 + k * .03)(tt), v * (k === 2 ? 1 : .55), (k - 1) * .15);
}
function hat(t, v = .06, dur = .05) { add(t, dur, (tt) => rnd() * env(.0008, .012)(tt), v, .2); }
function ohat(t, v = .085) { add(t, .2, (tt) => rnd() * env(.001, .07)(tt), v, .22); }
function snare(t, v = .2) {
  add(t, .18, (tt) => (rnd() * .65 + sin(190)(tt) * .45) * env(.001, .045)(tt), v, .08);
}
function bass(m, t, d, v = .3) {
  const f = N(m);
  add(t, d, (tt) => (sin(f)(tt) * .75 + tri(f)(tt) * .3) * env(.004, .1)(tt), v, -.06);
}
/* 锯齿波和弦刺 + 侧链 */
function stab(m, t, d, v = .075) {
  const f = N(m);
  add(t, d, (tt) => (saw(f)(tt) * .5 + saw(f * 1.007)(tt) * .3 + saw(f * .993)(tt) * .3) * env(.003, .13)(tt) * pump(tt), v);
}
function pad(m, t, d, v = .045, pumped = false) {
  const f = N(m);
  add(t, d, (tt) => (sin(f)(tt) * .55 + tri(f)(tt) * .3 + sin(f * 2.003)(tt) * .13)
    * env(.2, .5, .35)(tt) * (tt > d - .35 ? Math.max(0, (d - tt) / .35) : 1)
    * (pumped ? pump(tt) : 1), v);
}
/* 琶音方波——动感主线 */
function arp(m, t, d, v = .11) {
  const f = N(m);
  add(t, d, (tt) => (pulse(f, .5)(tt) * .6 + pulse(f * 2, .5)(tt) * .25) * env(.002, .06)(tt), v, -.12);
}
function pluck(m, t, v = .15) {
  const f = N(m);
  add(t, .4, (tt) => pulse(f, .5)(tt) * env(.002, .05)(tt), v, .12);
}
function sparkle(t, base = 84, v = .12) {
  [0, 4, 7, 12, 16, 19].forEach((s, i) => {
    const f = N(base + s), tt0 = t + i * .04;
    add(tt0, .3, (tt) => pulse(f, .5)(tt) * env(.002, .07)(tt), v, i % 2 ? .3 : -.3);
  });
}
function riser(t, d, v = .09) { // 噪声上扬 + 啁啾升调
  add(t, d, (tt) => rnd() * env(.03, .3)(tt) * Math.pow(tt / d, 1.8), v);
  add(t, d, (tt) => { const f = 350 + 2600 * tt / d; return Math.sin(2 * Math.PI * f * tt) * .3; } , v * .5);
}
function snareRoll(t, v = .14) { // 军鼓渐密鼓花
  const offs = [0, .234, .469, .586, .645, .703, .732, .762, .791, .82, .85, .879];
  offs.forEach((o, i) => snare(t + o * BEAT, v * (.5 + .5 * i / offs.length)));
}
function impact(t, v = .5) { // 段落落点重锤
  kick(t, v * 1.25);
  add(t, .5, (tt) => rnd() * env(.002, .15)(tt), v * .32);
  [36, 48, 55, 64].forEach(m => add(t, .7, (tt) => (sin(N(m))(tt) * .7 + tri(N(m))(tt) * .3) * env(.002, .22)(tt), .12));
}

/* ---------------- 编曲 ---------------- */
/* 小节表：能量 0=pad 氛围 / 1=行进 / 2=全开drop */
const BARS = [
  ['Cmaj7', 0], ['Am7', 0],                              // 0-1   片头
  ['C', 2], ['G', 2], ['Am', 2], ['F', 2], ['C', 2], ['G', 2], // 2-7   痛点+双语+辅助前段
  ['Am', 1], ['F', 1],                                   // 8-9   辅助尾/伴读猫
  ['C', 1],                                              // 10    伴读猫
  ['Am', 1], ['F', 1],                                   // 11-12 服务商 build
  ['C', 2], ['G', 2],                                    // 13-14 阅读器 drop B
  ['Cmaj7', 0], ['Am7', 0], ['Cmaj7', 0],                // 15-17 收尾
];

const ARP_SEQ = [0, 7, 12, 16, 19, 16, 12, 7, 0, 7, 12, 16, 19, 21, 19, 16];
const ROOT = { C: 60, G: 55, Am: 57, F: 53, Cmaj7: 60, Am7: 57 };

BARS.forEach(([ch, energy], b) => {
  const t0 = b * BAR;
  if (energy === 0) {
    for (const m of CH[ch]) pad(m, t0, BAR * 1.06, .048);
    return;
  }
  for (const m of CH[ch]) pad(m, t0, BAR * 1.02, .026, true);
  const root = ROOT[ch];

  if (energy === 1) {
    kick(t0); kick(t0 + BEAT * 2); kick(t0 + BEAT * 3.5, .34);
    clap(t0 + BEAT * 2, .1);
    for (let e = 0; e < 8; e += 2) hat(t0 + e * BEAT / 2 + BEAT / 4, .05);
    ohat(t0 + BEAT * 3.5, .05);
    for (let e = 0; e < 8; e++) bass(BASS[ch] + (e === 5 ? 7 : e === 7 ? 12 : 0), t0 + e * BEAT / 2, .22, .26);
    /* 八分稀疏琶音 */
    for (let s = 0; s < 8; s += 2) arp(root + ARP_SEQ[(b * 8 + s) % 16], t0 + s * BEAT / 2, .2, .085);
  } else {
    for (let k = 0; k < 4; k++) kick(t0 + k * BEAT);
    clap(t0 + BEAT); clap(t0 + BEAT * 3);
    for (let e = 0; e < 16; e++) hat(t0 + e * BEAT / 4, e % 4 === 2 ? .062 : .035);
    ohat(t0 + BEAT * 1.5, .06); ohat(t0 + BEAT * 3.5, .06);
    /* 十六分驱动贝斯 */
    for (let e = 0; e < 16; e++) bass(BASS[ch] + (e % 8 === 6 ? 12 : 0), t0 + e * BEAT / 4, .11, e % 2 ? .18 : .24);
    /* 反拍和弦刺 */
    for (const m of CH[ch]) for (const obb of [.5, 1.5, 3.5]) stab(m, t0 + obb * BEAT, .3);
    /* 十六分琶音主旋律 */
    for (let s = 0; s < 16; s++) arp(root + ARP_SEQ[(b * 16 + s) % 16], t0 + s * BEAT / 4, .11, .1);
  }
});

/* build：服务商段落末尾鼓花 + riser 顶进阅读器 drop */
riser(23.1, 1.25, .07);
snareRoll(24.375 - .879 * BEAT);
riser(2.15, .95, .08);                       // 片头 → 第一落点
snareRoll(3.75 - .879 * BEAT - .05, .11);

/* 场景对位音效（对齐 anim.js） */
sparkle(1.05, 84);                           // 片头猫组装完成
impact(3.1);                                 // 页面登场
pluck(88, 7.42, .14); pluck(93, 7.52, .1);   // 「翻译本页」按下
pluck(91, 14.15, .13);                       // 词卡弹出
sparkle(18.8, 86, .09);                      // 摘要卡展开
impact(24.375, .45);                         // 阅读器 drop
sparkle(29.0, 84, .12);                      // 收尾猫标锁定 + 闪光
impact(29.0, .55);                           // 终式重锤
arp(96, 29.0, .9, .1); arp(100, 29.0, .9, .07);

/* ---------------- 母带 & 写盘 ---------------- */
mkdirSync('preview/promo', { recursive: true });
const g = 1.15;
for (let i = 0; i < len; i++) {
  const fi = Math.min(1, i / (SR * .12)), fo = Math.min(1, (len - i) / (SR * .9));
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
