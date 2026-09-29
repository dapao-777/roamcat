/**
 * @file tools/promo/anim.js
 * RoamCat 宣传片时间轴：确定性渲染器 __seek(t)，全场景共用缓动库；
 * 场景边界与 music.mjs 的编排对齐（改一边同步另一边）。
 * 节奏档位：高动能快剪——对角擦除转场 / 3D 倾斜进场 / 冲击波 / 光标拖影 / glitch。
 */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eo = t => 1 - Math.pow(1 - t, 3);
const eio = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const ob = (t, s = 1.9) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
const lerp = (a, b, t) => a + (b - a) * t;
const DUR = 33.6;

const SCENE = { logo: [0, 3.1], pain: [3.1, 6.6], bili: [6.6, 11.9], assist: [11.9, 16.6], pet: [16.6, 20.6], svc: [20.6, 24.4], reader: [24.4, 27.6], out: [27.6, DUR] };
const WIPES = [3.1, 20.6, 24.4, 27.6];        // 对角擦除转场时刻
const FLASHES = [3.08, 29.0];                  // 硬切闪光帧
const SHOCKS = [{ t: 7.42, el: '#btnTr' }, { t: 18.72, el: '#dock .dockb:nth-child(2)' }];

function tr(el, o, x = 0, y = 0, s = 1, extra = '') {
  el.style.opacity = o;
  el.style.visibility = o <= 0.004 ? 'hidden' : 'visible';
  el.style.transform = `translate(${x}px,${y}px) scale(${s}) ${extra}`;
}
function fade(el, p) { el.style.opacity = p; el.style.visibility = p <= 0.004 ? 'hidden' : 'visible'; }
function popIn(el, p, dy = 26, s0 = .96, extra = '') { tr(el, eo(p), 0, (1 - eo(p)) * dy, lerp(s0, 1, ob(clamp(p))), extra); }
/* 冲切镜头：入场 scale 1.055→1 + 全程缓推 */
function camPunch(el, t, a, b, k = 1) {
  const pin = eo(seg(t, a, a + .42)), p = seg(t, a, b);
  el.style.transform = `scale(${1 + (1 - pin) * .055 + p * .016 * k}) translateY(${-p * 5 * k}px)`;
  el.style.transformOrigin = '50% 44%';
}

/* ---------------- 初始化 ---------------- */
const ICONS = {
  read: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/></svg>',
  kbd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M7 10h.01M11 10h.01M15 10h.01M17 10h.01M7 14h.01M17 14h.01M9.5 14h5"/></svg>',
  zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M8.5 11h5M11 8.5v5"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"/></svg>',
};

let ZH = [], ZH_RD = [], pTops = [];
let scanRectsLogo = [], scanBaseLogo = [], scanRectsOut = [], scanBaseOut = [];
let petTail, petEyesO, petEyesS, outPetTail, outPetEyesO, outPetEyesS;
let CUR, WIN, G1, G2, SHOCK;
const R = {};
const CAPS = [];

function mkCap(sceneEl, n, zh, en, dark) {
  const d = document.createElement('div');
  d.className = 'cap' + (dark ? ' d' : '');
  d.innerHTML = `<span class="n">${n}</span><div><b>${zh}</b><i>${en}</i></div>`;
  sceneEl.appendChild(d); fade(d, 0); return d;
}
function mkChips(row, list, cls = 'chip') {
  return list.map(t => { const c = document.createElement('span'); c.className = cls; c.innerHTML = t; row.appendChild(c); return c; });
}
/* 译文卡：高度展开 + rotateX 翻入 */
function setZh(list, idx, p) {
  const w = list[idx]; if (!w) return;
  const q = clamp(p);
  w.style.height = w._h * eio(q) + 'px';
  const inner = w.firstElementChild;
  inner.style.opacity = clamp(q * 1.5);
  inner.style.transform = `perspective(700px) rotateX(${(1 - eo(q)) * -48}deg) translateY(${(1 - eo(q)) * -14}px)`;
}

function init() {
  $('#logoCat').innerHTML = window.PROMO_ASSETS.scan;
  $('#outCat').innerHTML = window.PROMO_ASSETS.scan;
  $('#petCat').innerHTML = window.PROMO_ASSETS.pet;
  $('#outPet').innerHTML = window.PROMO_ASSETS.pet;
  $('#outPet').style.opacity = 0;

  const lg = $('#logoCat svg'), og = $('#outCat svg');
  scanRectsLogo = [...lg.querySelectorAll('g')[0].children];
  scanBaseLogo = [lg.children[0], lg.children[2], lg.children[3]];
  scanRectsOut = [...og.querySelectorAll('g')[0].children];
  scanBaseOut = [og.children[0], og.children[2], og.children[3]];
  $('#petCat .cat-eyes-squint').style.opacity = 0;
  $('#outPet .cat-eyes-squint').style.opacity = 0;
  petTail = $('#petCat .cat-tail'); petEyesO = $('#petCat .cat-eyes-open'); petEyesS = $('#petCat .cat-eyes-squint');
  outPetTail = $('#outPet .cat-tail'); outPetEyesO = $('#outPet .cat-eyes-open'); outPetEyesS = $('#outPet .cat-eyes-squint');
  petTail.style.transformOrigin = '300px 320px';
  outPetTail.style.transformOrigin = '300px 320px';

  for (const el of [$('#wordmark'), $('#outWord')]) {
    el.innerHTML = 'ROAMCAT'.split('').map(c => `<span>${c}</span>`).join('');
  }
  const dockData = [['read', '阅读开关'], ['spark', '文章摘要'], ['kbd', '快捷键'], ['zoom', '缩放'], ['gear', '设置']];
  for (const [ic, tip] of dockData) {
    const b = document.createElement('div');
    b.className = 'dockb'; b.innerHTML = ICONS[ic] + `<span class="tip">${tip}</span>`;
    $('#dock').appendChild(b);
  }
  const provs = ['openai', 'deepseek', 'google', 'anthropic', 'xai', 'moonshotai', 'volcengine', 'ollama'];
  for (const p of provs) {
    const d = document.createElement('div'); d.className = 'ic';
    d.innerHTML = `<img src="../../roamcat-0.0.1/extension/icons/providers/${p}.svg">`;
    $('#icongrid').appendChild(d);
  }
  const more = document.createElement('div'); more.className = 'ic more'; more.textContent = '+20';
  $('#icongrid').appendChild(more);
  $('#svcRows').innerHTML = [
    ['openai', 'Codex CLI', 'CHATGPT 订阅'],
    ['xai', 'Grok CLI', 'SUPERGROK / X PREMIUM+'],
    ['google', 'Antigravity agy', 'GOOGLE AI PRO / ULTRA'],
  ].map(([ic, b, dt]) => `<div class="svcrow"><span class="rowic"><img src="../../roamcat-0.0.1/extension/icons/providers/${ic}.svg"></span><b>${b}</b><span class="dt">${dt}</span></div>`).join('');
  R.outChips = mkChips($('#outChips'), [
    '<i class="dot"></i>本地优先', '<i class="dot"></i>零遥测', '<i class="dot"></i>阅读记录默认关闭 · 按站开启', '<i class="dot"></i>API Key 仅存本机', '<i class="dot"></i>33 条白名单消息',
  ]);
  R.outMeta = mkChips($('#outMeta'), [
    'Chrome / Edge 125+', 'Manifest V3', 'License MPL-2.0', '28 家模型服务',
  ], 'badge');

  CAPS[1] = mkCap($('#stage'), '01', '读英文网页，生词总在打断你', 'EVERY UNKNOWN WORD BREAKS THE FLOW', false);
  CAPS[2] = mkCap($('#stage'), '02', '主模式 · 本页双语翻译', 'FOLLOWS YOUR READING POSITION — NEVER PRE-TRANSLATES', false);
  CAPS[3] = mkCap($('#stage'), '03', '副模式 · 阅读辅助', 'SPARSE HINTS · ON-DEMAND RESCUE · SENTENCE DECONSTRUCTION', false);
  CAPS[4] = mkCap($('#stage'), '04', '伴读猫 · 安静守在页边', 'THE COMPANION CAT — DIGEST, SWITCH & SETTINGS ONE TAP AWAY', false);
  CAPS[5] = mkCap($('#s-svc'), '05', '能力来源，你来选择', '28 PROVIDERS · SUBSCRIPTION CONNECTOR · LOCAL MODEL', true);
  CAPS[6] = mkCap($('#s-reader'), '06', '内置阅读器', 'PDF · EPUB · PASTED ARTICLES — SAME BILINGUAL ENGINE', true);
  CAPS[7] = mkCap($('#s-out'), '07', '本地优先，数据去向说清楚', 'LOCAL-FIRST — NO TELEMETRY, KEYS NEVER LEAVE YOUR MACHINE', false);

  R.zh = $$('#art .zhwrap'); R.zhRd = $$('#rdscroll .zhwrap');
  R.segUls = $$('#p3 .seg .ul'); R.legend = $('.legend'); R.longtag = $('.longtag');
  R.gloss = ['#w1', '#w2', '#w3', '#w4'].map(id => $(id).querySelector('.gloss'));
  R.hw = ['#w1', '#w2', '#w3', '#w4'].map(id => $(id));
  R.dock = $$('#dock .dockb'); R.pts = $$('#sumcard .pt');
  R.zhc = $$('table.tb .zhc');

  CUR = $('#cursor'); WIN = $('#win');
  G1 = CUR.cloneNode(true); G2 = CUR.cloneNode(true);
  G1.className = 'curg'; G2.className = 'curg';
  CUR.parentNode.appendChild(G1); CUR.parentNode.appendChild(G2);
  SHOCK = document.createElement('div'); SHOCK.className = 'shock'; WIN.appendChild(SHOCK);
}

function layout() {
  ZH = R.zh; ZH_RD = R.zhRd;
  const measure = (w) => {
    const inner = w.firstElementChild, cs = getComputedStyle(inner);
    w._h = inner.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
    w.style.height = '0px';
    inner.style.opacity = 0;
  };
  ZH.forEach(measure);
  ZH_RD.forEach(measure);
  const artTop = $('#art').getBoundingClientRect().top;
  pTops = ['#p1', '#p2', '#p3', '#p4', '#p5'].map(id => $(id).getBoundingClientRect().top - artTop);
}

/* 每帧渲染前的舞台瞬态复位——场景函数只负责写自己拥有的属性 */
function resetStage() {
  for (const w of R.zh) { w.style.height = '0px'; w.firstElementChild.style.opacity = 0; }
  R.zhc.forEach(z => z.style.opacity = 0);
  ['#rmark', '#popup', '#wordcard', '#sumcard', '#extDot .pulse'].forEach(s => fade($(s), 0));
  const pw = $('#petwrap'); pw.style.opacity = 0; pw.style.visibility = 'hidden';
  R.dock.forEach(d => fade(d, 0));
  R.gloss.forEach(g => g.style.opacity = 0);
  R.segUls.forEach(u => u.style.transform = 'scaleX(0)');
  fade(R.legend, 0); R.longtag.style.opacity = 0;
  R.hw.forEach(w => { w.classList.remove('hl', 'query'); w.style.removeProperty('--hlw'); });
  $('#artScroll').style.transform = 'translateY(0px)';
  $('#btnTr').style.transform = '';
  $('#btnTr').style.boxShadow = '';
}

/* ---------------- 光标（坐标相对 #win，支持元素锚点 + 拖影） ---------------- */
function pos(k) {
  if (k.el) {
    const r = $(k.el).getBoundingClientRect(), w = WIN.getBoundingClientRect();
    return [r.left - w.left + r.width * (k.fx ?? .5), r.top - w.top + r.height * (k.fy ?? .5)];
  }
  return [k.x, k.y];
}
function cursorPos(t, keys) {
  if (t < keys[0].t || t > keys[keys.length - 1].t) return null;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1];
  const p = eio(seg(t, a.t, b.t));
  const [ax, ay] = pos(a), [bx, by] = pos(b);
  return [lerp(ax, bx, p), lerp(ay, by, p)];
}
function cursor(t, keys) {
  if (t < keys[0].t - .25 || t > keys[keys.length - 1].t + .35) {
    fade(CUR, 0); fade(G1, 0); fade(G2, 0); return;
  }
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1];
  const p = eio(seg(t, a.t, b.t));
  const [ax, ay] = pos(a), [bx, by] = pos(b);
  const x = lerp(ax, bx, p), y = lerp(ay, by, p);
  const press = (a.down && t >= a.t && t <= a.t + .16) || (b.down && Math.abs(t - b.t) < .16);
  const appear = seg(t, keys[0].t - .25, keys[0].t), gone = 1 - seg(t, keys[keys.length - 1].t, keys[keys.length - 1].t + .3);
  tr(CUR, appear * gone, x, y, press ? .82 : 1);
  /* 拖影：速度越快越明显 */
  for (const [g, dt, k] of [[G1, .055, .32], [G2, .11, .16]]) {
    const gp = cursorPos(t - dt, keys);
    if (!gp) { fade(g, 0); continue; }
    const d = Math.hypot(x - gp[0], y - gp[1]);
    tr(g, clamp(d / 70) * k * appear * gone, gp[0], gp[1], press ? .82 : 1);
  }
}
const KD = $('#keyD');
function keyD(t, tOn, tPress, tOff) {
  const p = seg(t, tOn, tOn + .28), off = 1 - seg(t, tOff, tOff + .35);
  const press = t > tPress && t < tPress + .3;
  const el = KD;
  el.style.opacity = p * off;
  el.style.visibility = p * off <= 0 ? 'hidden' : 'visible';
  const r = $('#wq').getBoundingClientRect(), w = WIN.getBoundingClientRect();
  el.style.transform = `translate(${r.left - w.left + 34}px,${r.top - w.top - 58}px) translateY(${press ? 4 : 0}px)`;
  el.style.boxShadow = press
    ? '0 1px 0 #c9c3ab,0 2px 5px rgba(64,55,28,.25)'
    : '0 4px 0 #c9c3ab,0 6px 12px rgba(64,55,28,.2)';
}

/* ---------------- 全屏特效：擦除 / 闪光 / 冲击波 ---------------- */
function fxWipe(t) {
  const w = $('#wipe'); let p = 0;
  for (const W of WIPES) { const q = seg(t, W - .08, W + .44); if (q > 0 && q < 1) p = Math.max(p, q); }
  w.style.opacity = p > 0 ? 1 : 0;
  w.style.transform = `translateX(${lerp(-115, 115, eio(p))}%)`;
}
function fxFlash(t) {
  let o = 0;
  for (const F of FLASHES) o = Math.max(o, seg(t, F, F + .035) * (1 - seg(t, F + .035, F + .2)));
  $('#flash').style.opacity = o * .8;
}
function fxShock(t) {
  for (const sh of SHOCKS) {
    const p = seg(t, sh.t, sh.t + .48);
    if (p > 0 && p < 1) {
      const [x, y] = pos({ el: sh.el });
      SHOCK.style.left = x + 'px'; SHOCK.style.top = y + 'px';
      SHOCK.style.opacity = (1 - p) * .8;
      SHOCK.style.transform = `scale(${lerp(.15, 2.9, eo(p))})`;
      return;
    }
  }
  SHOCK.style.opacity = 0;
}
/* 冲击波时的画面微震 */
function punchAt(t) {
  let k = 1;
  for (const sh of SHOCKS) {
    const p = seg(t, sh.t, sh.t + .3);
    k *= 1 + .014 * Math.sin(Math.min(1, p) * Math.PI) * (p > 0 && p < 1 ? 1 : 0);
  }
  return k;
}
/* glitch 抖动（确定性伪随机） */
const jit = (t, k = 1) => Math.sin(t * 197.3) * 5 * k;

/* ---------------- S0 LOGO ---------------- */
function sLogo(t) {
  const [a, b] = SCENE.logo;
  const el = $('#s-logo');
  fade(el, 1 - seg(t, b - .3, b));
  camPunch(el.firstElementChild, t, a, b, 1.3);
  const bd = $('#logoBadge');
  tr(bd, eo(seg(t, .05, .3)), 0, (1 - eo(seg(t, .05, .3))) * -14);
  const rects = scanRectsLogo;
  for (let i = 0; i < rects.length; i++) {
    const p = eo(seg(t, .08 + i * .009, .08 + i * .009 + .18));
    rects[i].style.opacity = p;
    rects[i].style.transform = `translateX(${(1 - p) * -150}px)`;
  }
  scanBaseLogo[0].style.opacity = .065 * eo(seg(t, .08, .9));
  const fp = seg(t, .8, 1.05);
  scanBaseLogo[1].style.opacity = fp; scanBaseLogo[1].style.transform = `translateY(${(1 - ob(fp)) * 10}px)`;
  const wp = seg(t, .92, 1.18);
  scanBaseLogo[2].style.opacity = wp; scanBaseLogo[2].style.transform = `translateX(${(1 - wp) * 40}px)`;
  const beam = $('#scanline .beam');
  const bpz = seg(t, .1, 1.0);
  beam.style.transform = `translateY(${lerp(-60, 470, bpz)}px)`;
  beam.style.opacity = bpz > 0 && bpz < 1 ? .9 : 0;
  /* 组装完成的 glitch 一抖 */
  const gp = seg(t, 1.02, 1.16);
  $('#logoCat').style.transform = (gp > 0 && gp < 1) ? `translate(${jit(t, 1 - gp)}px,${jit(t * 1.31, (1 - gp) * .6)}px)` : '';
  $('#logoCat').style.filter = (gp > 0 && gp < .45) ? 'brightness(1.9)' : '';
  $$('#wordmark span').forEach((s, i) => {
    const p = seg(t, .82 + i * .042, .82 + i * .042 + .24);
    tr(s, eo(p), 0, (1 - ob(p, 2.2)) * 46, lerp(.7, 1, ob(p, 2.2)), `rotate(${(1 - ob(p, 2.2)) * -14}deg)`);
  });
  const zh = $('#logoSub .zht'), en = $('#logoSub .en'), tag = $('#logoTag');
  const zht = '随心阅 · 漫游英文世界', ent = 'ROAM THE ENGLISH WEB LIKE A CAT';
  const zp = seg(t, 1.35, 1.78), ep = seg(t, 1.8, 2.25), tp = seg(t, 2.2, 2.55);
  zh.textContent = zht.slice(0, Math.round(zht.length * zp));
  en.textContent = ent.slice(0, Math.round(ent.length * ep));
  fade(zh, zp > 0 ? 1 : 0); fade(en, ep > 0 ? 1 : 0);
  tr(tag, eo(tp), 0, (1 - eo(tp)) * 12);
  $('#dotwave .row').style.backgroundPosition = `${t * 30}px 0`;
}

/* ---------------- 舞台公共 ---------------- */
function stageBase(t) {
  const el = $('#stage');
  const [a] = SCENE.pain, [, b] = SCENE.pet;
  const inn = eo(seg(t, a - .06, a + .34));
  const out = 1 - seg(t, b - .3, b + .06);
  fade(el, Math.min(inn, out));
  const w = $('#win');
  const pin = eo(seg(t, a - .04, a + .5));
  const tilt = (1 - pin) * -7;
  const floatY = Math.sin(t * 1.05) * 2.4 * inn * out;
  w.style.transform = `translateY(${(1 - pin) * 64 + floatY}px) rotateX(${tilt}deg) scale(${lerp(.955, 1, pin) * punchAt(t)})`;
  w.style.transformOrigin = '50% 55%';
}

function capShow(i, t, a, b) {
  const c = CAPS[i];
  const p = eo(seg(t, a, a + .28)), o = 1 - eo(seg(t, b - .22, b));
  tr(c, p * o, (1 - eo(seg(t, a, a + .32))) * -38);
  const bb = c.querySelector('b');
  bb.style.letterSpacing = lerp(.18, .01, eo(seg(t, a, a + .45))) + 'em';
  const nn = c.querySelector('.n');
  const np = ob(seg(t, a, a + .3), 2);
  nn.style.transform = `scale(${lerp(.6, 1, np)})`;
}

/* ---------------- S1 痛点 ---------------- */
const HL = [['#w1', 3.75], ['#w2', 4.2], ['#w3', 4.65], ['#w4', 5.1]];
function sPain(t) {
  const [a, b] = SCENE.pain;
  for (const [id, at] of HL) {
    const w = $(id);
    const p = eo(seg(t, at, at + .22));
    w.classList.toggle('hl', p > 0);
    w.style.setProperty('--hlw', `${p * 100}%`);
  }
  capShow(1, t, a + .5, b + .25);
}

/* ---------------- S2 双语翻译 ---------------- */
const ZH_AT = [7.95, 8.4, 8.85, 9.4, 10.1];
function sBili(t) {
  const [a, b] = SCENE.bili;
  capShow(2, t, a + .12, b - .15);
  R.hw.forEach(w => { w.classList.add('hl'); w.style.setProperty('--hlw', '100%'); });
  const pp = $('#popup');
  const pin = seg(t, 6.68, 7.02), pout = 1 - seg(t, 7.62, 7.92);
  tr(pp, eo(pin) * pout, 0, (1 - eo(pin)) * -18, lerp(.94, 1, ob(pin)));
  const press = t > 7.32 && t < 7.56;
  $('#btnTr').style.transform = `translateY(${press ? 3 : 0}px)`;
  $('#btnTr').style.boxShadow = press
    ? '0 0px 0 #000,inset 0 2px 5px rgba(0,0,0,.5)'
    : '0 3px 0 #000,0 5px 12px rgba(22,21,17,.35),inset 0 1px 0 rgba(255,255,255,.14)';
  fade($('#extDot .pulse'), t > 7.4 && t < 8.4 ? .5 + .5 * Math.sin(t * 14) : 0);
  const rm = $('#rmark');
  const mp = eio(seg(t, 8.0, 11.35));
  const y = lerp(pTops[0] - 12, pTops[4] + 60, mp);
  fade(rm, seg(t, 7.9, 8.15) * (1 - seg(t, 11.5, 11.9)));
  rm.style.transform = `translateY(${y}px)`;
  ZH.forEach((w, i) => setZh(R.zh, i, seg(t, ZH_AT[i], ZH_AT[i] + .42)));
  R.zhc.forEach(z => z.style.opacity = eo(seg(t, 9.35, 9.7)));
  const sc = eio(seg(t, 9.35, 11.7));
  $('#artScroll').style.transform = `translateY(${-285 * sc}px)`;
  cursor(t, [
    { t: 6.7, el: '#extDot' }, { t: 6.98, el: '#extDot', down: true },
    { t: 7.34, el: '#btnTr', fy: .4 }, { t: 7.56, el: '#btnTr', fy: .4, down: true },
    { t: 8.2, x: 1180, y: 420 }, { t: 8.8, x: 1140, y: 500 },
  ]);
}

/* ---------------- S3 阅读辅助 ---------------- */
function sAssist(t) {
  const [a, b] = SCENE.assist;
  capShow(3, t, a + .2, b - .2);
  R.hw.forEach(w => { w.classList.add('hl'); w.style.setProperty('--hlw', '100%'); });
  ZH.forEach((w, i) => setZh(R.zh, i, 1 - seg(t, a + .05 + i * .04, a + .45 + i * .04)));
  const sc = eio(seg(t, a, a + .6));
  $('#artScroll').style.transform = `translateY(${lerp(-285, -30, sc)}px)`;
  const GT = [12.65, 13.0, 13.35];
  R.gloss.forEach((g, i) => {
    const on = i < 3 ? eo(seg(t, GT[i], GT[i] + .26)) : 0;
    const fadeout = i === 0 ? 1 - seg(t, 14.9, 15.3) : i === 1 ? 1 - seg(t, 15.15, 15.55) : 1 - seg(t, 15.4, 15.8);
    g.style.opacity = on * fadeout * .95;
    g.style.transform = `translateX(-50%) translateY(${(1 - on) * 6}px) scale(${lerp(.8, 1, on)})`;
  });
  keyD(t, 13.55, 13.95, 14.65);
  const wq = $('#wq');
  wq.classList.toggle('query', t > 14.05 && t < 15.75);
  wq.classList.remove('hl');
  const wc = $('#wordcard');
  const wp = seg(t, 14.15, 14.62), wo = 1 - eo(seg(t, 15.7, 16.05));
  tr(wc, ob(wp) * wo, 0, (1 - ob(wp)) * 60, lerp(.92, 1, ob(wp)), `perspective(800px) rotateX(${(1 - ob(wp)) * -16}deg)`);
  const ULT = [14.95, 15.15, 15.35, 15.55, 15.75];
  R.segUls.forEach((u, i) => { u.style.transform = `scaleX(${eio(seg(t, ULT[i], ULT[i] + .3)) * (1 - seg(t, b - .15, b))})`; });
  fade(R.legend, eo(seg(t, 15.85, 16.15)) * (1 - seg(t, b - .15, b)));
  const lt = R.longtag;
  const lp = seg(t, 16.0, 16.3);
  lt.style.opacity = lp * (1 - seg(t, b - .15, b));
  lt.style.transform = `scale(${lerp(.6, 1, ob(lp))}) translateY(${Math.sin(t * 3) * 1.5}px)`;
  cursor(t, [
    { t: 13.6, x: 560, y: 430 }, { t: 14.05, el: '#wq', down: true },
    { t: 14.6, x: 700, y: 560 },
  ]);
}

/* ---------------- S4 伴读猫 ---------------- */
function sPet(t) {
  const [a, b] = SCENE.pet;
  capShow(4, t, a + .25, b - .15);
  R.hw.forEach(w => { w.classList.add('hl'); w.style.setProperty('--hlw', '100%'); });
  R.segUls.forEach(u => u.style.transform = `scaleX(${1 - seg(t, a, a + .28)})`);
  $('#artScroll').style.transform = `translateY(${lerp(-30, -60, eio(seg(t, a, a + .7)))}px)`;
  const pw = $('#petwrap'); pw.style.opacity = 1; pw.style.visibility = 'visible';
  const cat = $('#petCat');
  const cp = seg(t, 16.72, 17.35);
  tr(cat, eo(cp), 0, (1 - ob(cp, 1.6)) * 170, lerp(.7, 1, ob(cp, 1.6)));
  petTail.style.transform = `rotate(${Math.sin(t * 5.2) * 7 * clamp(cp)}deg)`;
  const blink = (t > 18.3 && t < 18.44) || (t > 19.95 && t < 20.09);
  petEyesO.style.opacity = blink ? 0 : 1; petEyesS.style.opacity = blink ? 1 : 0;
  const pressP = t > 18.55 && t < 18.8;
  R.dock.forEach((d, i) => {
    const p = seg(t, 17.45 + i * .09, 17.45 + i * .09 + .3);
    tr(d, eo(p), (1 - ob(p, 2)) * 34, (i === 1 && pressP) ? 3 : 0, lerp(.5, 1, ob(p, 2)), `rotate(${(1 - ob(p, 2)) * -24}deg)`);
  });
  const hover1 = t > 18.15 && t < 18.8;
  if (R.dock[1]) R.dock[1].querySelector('.tip').style.opacity = hover1 ? 1 : 0;
  const sc = $('#sumcard');
  const sp = seg(t, 18.8, 19.4);
  tr(sc, eo(sp) * (1 - seg(t, b - .25, b)), 0, (1 - ob(sp)) * 40, lerp(.9, 1, ob(sp)), `perspective(900px) rotateX(${(1 - ob(sp)) * -14}deg)`);
  R.pts.forEach((r, i) => tr(r, eo(seg(t, 19.45 + i * .13, 19.45 + i * .13 + .3)), (1 - eo(seg(t, 19.45 + i * .13, 19.45 + i * .13 + .3))) * -24));
  cursor(t, [
    { t: 17.9, x: 1230, y: 640 }, { t: 18.5, el: '#dock .dockb:nth-child(2)', down: true },
    { t: 19.1, x: 1300, y: 700 }, { t: 19.8, x: 1150, y: 700 },
  ]);
}

/* ---------------- S5 模型服务 ---------------- */
function sSvc(t) {
  const [a, b] = SCENE.svc;
  const el = $('#s-svc');
  fade(el, seg(t, a - .04, a + .26) * (1 - seg(t, b - .28, b)));
  camPunch(el.firstElementChild, t, a, b, .8);
  popIn($('#svcTitle'), seg(t, a + .1, a + .42), 30);
  $$('#svcCards .svccard').forEach((c, i) => {
    const p = seg(t, a + .4 + i * .12, a + .4 + i * .12 + .42);
    tr(c, eo(p), 0, (1 - ob(p, 1.5)) * 70, lerp(.93, 1, ob(p, 1.5)), `perspective(900px) rotateX(${(1 - ob(p, 1.5)) * -13}deg)`);
  });
  /* 图标涟漪：一道脉冲从左向右扫过网格 */
  $$('#icongrid .ic').forEach((ic, i) => {
    const wave = seg(t, a + 1.15 + i * .055, a + 1.15 + i * .055 + .34);
    const pulse = Math.sin(Math.min(1, wave) * Math.PI) * .16;
    ic.style.transform = `translateY(${Math.sin(t * 1.7 + i * .8) * 4}px) scale(${1 + pulse})`;
  });
  capShow(5, t, a + .6, b - .12);
}

/* ---------------- S6 阅读器 ---------------- */
function sReader(t) {
  const [a, b] = SCENE.reader;
  const el = $('#s-reader');
  fade(el, seg(t, a - .04, a + .26) * (1 - seg(t, b - .25, b)));
  const rp = seg(t, a + .08, a + .5);
  tr($('#rdwin'), eo(rp), 0, (1 - eo(rp)) * 46, lerp(.965, 1, ob(rp)), `perspective(1200px) rotateY(${(1 - ob(rp)) * -7}deg)`);
  const ZT = [a + .9, a + 1.4, a + 1.9];
  ZH_RD.forEach((w, i) => setZh(R.zhRd, i, seg(t, ZT[i], ZT[i] + .42)));
  $('#rdscroll').style.transform = `translateY(${-66 * eio(seg(t, a + 1.5, b - .3))}px)`;
  const pulse = t > a + 2.0 ? .5 + .5 * Math.sin(t * 9) : 0;
  $('#btnTrAll').style.boxShadow = `0 3px 0 #8f8465,0 5px 12px rgba(0,0,0,.4),0 0 ${18 * pulse}px rgba(240,166,60,${.55 * pulse}),inset 0 1px 0 #fff`;
  capShow(6, t, a + .5, b - .12);
}

/* ---------------- S7 收尾 ---------------- */
function sOut(t) {
  const [a, b] = SCENE.out;
  const el = $('#s-out');
  fade(el, seg(t, a - .04, a + .3) * (1 - seg(t, b - .35, b)));
  R.outChips.forEach((c, i) => {
    const p = seg(t, 27.75 + i * .11, 27.75 + i * .11 + .32);
    tr(c, eo(p), 0, (1 - ob(p)) * -26, lerp(.9, 1, ob(p)));
  });
  const rects = scanRectsOut;
  for (let i = 0; i < rects.length; i++) {
    const p = eo(seg(t, 28.35 + i * .004, 28.35 + i * .004 + .14));
    rects[i].style.opacity = p;
    rects[i].style.transform = `translateX(${(1 - p) * -60}px)`;
  }
  scanBaseOut[0].style.opacity = .065 * eo(seg(t, 28.3, 28.9));
  scanBaseOut[1].style.opacity = seg(t, 28.75, 29.05);
  scanBaseOut[2].style.opacity = seg(t, 28.9, 29.2);
  const gp = seg(t, 29.0, 29.14);
  $('#outCat').style.transform = (gp > 0 && gp < 1) ? `translate(${jit(t, 1 - gp)}px,${jit(t * 1.31, (1 - gp) * .6)}px)` : `translateY(${(1 - eo(seg(t, 28.3, 28.9))) * 24}px)`;
  $$('#outWord span').forEach((s, i) => {
    const p = seg(t, 29.15 + i * .04, 29.15 + i * .04 + .22);
    tr(s, eo(p), 0, (1 - ob(p, 2.2)) * 30, lerp(.7, 1, ob(p, 2.2)), `rotate(${(1 - ob(p, 2.2)) * -12}deg)`);
  });
  tr($('#outSub'), eo(seg(t, 29.8, 30.2)), 0, (1 - eo(seg(t, 29.8, 30.2))) * 14);
  tr($('#outEn'), eo(seg(t, 29.95, 30.4)), 0, (1 - eo(seg(t, 29.95, 30.4))) * 10);
  R.outMeta.forEach((m, i) => tr(m, eo(seg(t, 30.5 + i * .08, 30.5 + i * .08 + .3)), 0, (1 - eo(seg(t, 30.5 + i * .08, 30.5 + i * .08 + .3))) * 16));
  tr($('#outUrl'), eo(seg(t, 30.9, 31.3)), 0, (1 - eo(seg(t, 30.9, 31.3))) * 12);
  const pc = $('#outPet');
  const pp = seg(t, 27.95, 28.6);
  pc.style.opacity = eo(pp);
  pc.style.transform = `translateX(${(1 - eio(pp)) * 260}px)`;
  outPetTail.style.transform = `rotate(${Math.sin(t * 5.5) * 6}deg)`;
  const blink = t > 31.3 && t < 31.44;
  outPetEyesO.style.opacity = blink ? 0 : 1; outPetEyesS.style.opacity = blink ? 1 : 0;
  $('#outWave').style.backgroundPosition = `${t * 24}px 0`;
  capShow(7, t, 27.9, 31.6);
}

/* ---------------- 主渲染 ---------------- */
function render(t) {
  t = clamp(t, 0, DUR - .001);
  for (const id of ['#s-logo', '#stage', '#s-svc', '#s-reader', '#s-out']) fade($(id), 0);
  fade(CUR, 0); fade(G1, 0); fade(G2, 0); KD.style.opacity = 0;
  if (t >= SCENE.pain[0] && t < SCENE.pet[1] + .3) resetStage();
  if (t < SCENE.logo[1]) sLogo(t);
  if (t >= SCENE.pain[0] && t < SCENE.pain[1] + .3) { stageBase(t); sPain(t); }
  if (t >= SCENE.bili[0] && t < SCENE.bili[1]) { stageBase(t); sBili(t); }
  if (t >= SCENE.assist[0] && t < SCENE.assist[1]) { stageBase(t); sAssist(t); }
  if (t >= SCENE.pet[0] && t < SCENE.pet[1] + .3) { stageBase(t); sPet(t); }
  if (t >= SCENE.svc[0] && t < SCENE.svc[1]) sSvc(t);
  if (t >= SCENE.reader[0] && t < SCENE.reader[1]) sReader(t);
  if (t >= SCENE.out[0] && t <= DUR) sOut(t);
  fxWipe(t); fxFlash(t); fxShock(t);
}

window.__seek = render;
window.__ready = (async () => {
  init();
  await document.fonts.ready;
  await new Promise(r => setTimeout(r, 60));
  layout();
  render(0);
  return true;
})();
})();
