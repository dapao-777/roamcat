/**
 * @file tools/promo/anim.js
 * RoamCat 宣传片时间轴：确定性渲染器 __seek(t)，全场景共用缓动库；
 * 场景边界与 music.mjs 的 SECT 常量保持一致（改一边同步另一边）。
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
const DUR = 52;

const SCENE = { logo: [0, 4.6], pain: [4.6, 10.6], bili: [10.6, 19.5], assist: [19.5, 28.5], pet: [28.5, 34.5], svc: [34.5, 40.5], reader: [40.5, 45.8], out: [45.8, DUR] };

function tr(el, o, x = 0, y = 0, s = 1, extra = '') {
  el.style.opacity = o;
  el.style.visibility = o <= 0.004 ? 'hidden' : 'visible';
  el.style.transform = `translate(${x}px,${y}px) scale(${s}) ${extra}`;
}
function fade(el, p) { el.style.opacity = p; el.style.visibility = p <= 0.004 ? 'hidden' : 'visible'; }
function popIn(el, p, dy = 26, s0 = .96) { tr(el, eo(p), 0, (1 - eo(p)) * dy, lerp(s0, 1, ob(clamp(p)))); }
function camDrift(el, t, a, b, k = 1) {
  const p = seg(t, a, b);
  el.style.transform = `scale(${1.0 + p * 0.022 * k}) translateY(${-p * 6 * k}px)`;
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

let ZH = [];           // .zhwrap 列表（文章）
let ZH_RD = [];        // 阅读器 zhwrap
let pTops = [];        // 各段落在 artScroll 中的 top
let scanRectsLogo = [], scanBaseLogo = [], scanRectsOut = [], scanBaseOut = [];
let petTail, petEyesO, petEyesS, outPetTail, outPetEyesO, outPetEyesS;
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
function setZh(list, idx, p) {
  const w = list[idx]; if (!w) return;
  const h = w._h * eio(clamp(p));
  w.style.height = h + 'px';
  const inner = w.firstElementChild;
  inner.style.opacity = clamp(p * 1.4);
  inner.style.transform = `translateY(${(1 - eo(clamp(p))) * -16}px)`;
}

function init() {
  /* 猫 SVG 注入 */
  $('#logoCat').innerHTML = window.PROMO_ASSETS.scan;
  $('#outCat').innerHTML = window.PROMO_ASSETS.scan;
  $('#petCat').innerHTML = window.PROMO_ASSETS.pet;
  $('#outPet').innerHTML = window.PROMO_ASSETS.pet;
  $('#outPet').style.opacity = 0;

  const lg = $('#logoCat svg'), og = $('#outCat svg');
  scanRectsLogo = [...lg.querySelectorAll('g')[0].children];
  scanBaseLogo = [lg.children[0], lg.children[2], lg.children[3]]; // 剪影/脸/风线
  scanRectsOut = [...og.querySelectorAll('g')[0].children];
  scanBaseOut = [og.children[0], og.children[2], og.children[3]];
  $('#petCat .cat-eyes-squint').style.opacity = 0;
  $('#outPet .cat-eyes-squint').style.opacity = 0;
  petTail = $('#petCat .cat-tail'); petEyesO = $('#petCat .cat-eyes-open'); petEyesS = $('#petCat .cat-eyes-squint');
  outPetTail = $('#outPet .cat-tail'); outPetEyesO = $('#outPet .cat-eyes-open'); outPetEyesS = $('#outPet .cat-eyes-squint');
  petTail.style.transformOrigin = '300px 320px';
  outPetTail.style.transformOrigin = '300px 320px';

  /* 字标字母 */
  for (const el of [$('#wordmark'), $('#outWord')]) {
    el.innerHTML = 'ROAMCAT'.split('').map(c => `<span>${c}</span>`).join('');
  }
  /* 快捷坞 */
  const dockData = [['read', '阅读开关'], ['spark', '文章摘要'], ['kbd', '快捷键'], ['zoom', '缩放'], ['gear', '设置']];
  for (const [ic, tip] of dockData) {
    const b = document.createElement('div');
    b.className = 'dockb'; b.innerHTML = ICONS[ic] + `<span class="tip">${tip}</span>`;
    $('#dock').appendChild(b);
  }
  /* 服务商图标墙 */
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
  /* 收尾 chips & 徽章 */
  R.outChips = mkChips($('#outChips'), [
    '<i class="dot"></i>本地优先', '<i class="dot"></i>零遥测', '<i class="dot"></i>阅读记录默认关闭 · 按站开启', '<i class="dot"></i>API Key 仅存本机', '<i class="dot"></i>33 条白名单消息',
  ]);
  R.outMeta = mkChips($('#outMeta'), [
    'Chrome / Edge 125+', 'Manifest V3', 'License MPL-2.0', '28 家模型服务',
  ], 'badge');

  /* 字幕条 */
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
}

function layout() {
  /* 字体就绪后测量译文卡高度与各段落位置（按文章总高差精确取高） */
  ZH = R.zh; ZH_RD = R.zhRd;
  const art = $('#art'), rdsc = $('#rdscroll');
  const measure = (w, host) => {
    const h0 = host.scrollHeight;
    w.style.height = 'auto';
    w._h = host.scrollHeight - h0;
    w.style.height = '0px';
    w.firstElementChild.style.opacity = 0;
  };
  ZH.forEach(w => measure(w, art));
  ZH_RD.forEach(w => measure(w, rdsc));
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
  R.hw.forEach(w => w.classList.remove('hl', 'query'));
  $('#artScroll').style.transform = 'translateY(0px)';
  $('#btnTr').style.transform = '';
  $('#btnTr').style.boxShadow = '';
}

/* ---------------- 光标（坐标相对 #win，支持元素锚点） ---------------- */
const CUR = $('#cursor'), WIN = $('#win');
function pos(k) {
  if (k.el) {
    const r = $(k.el).getBoundingClientRect(), w = WIN.getBoundingClientRect();
    return [r.left - w.left + r.width * (k.fx ?? .5), r.top - w.top + r.height * (k.fy ?? .5)];
  }
  return [k.x, k.y];
}
function cursor(t, keys) {
  if (t < keys[0].t - .3 || t > keys[keys.length - 1].t + .4) { fade(CUR, 0); return; }
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1];
  const p = eio(seg(t, a.t, b.t));
  const [ax, ay] = pos(a), [bx, by] = pos(b);
  const x = lerp(ax, bx, p), y = lerp(ay, by, p);
  const press = (a.down && t >= a.t && t <= a.t + .18) || (b.down && Math.abs(t - b.t) < .18);
  const appear = seg(t, keys[0].t - .3, keys[0].t), gone = 1 - seg(t, keys[keys.length - 1].t, keys[keys.length - 1].t + .35);
  tr(CUR, appear * gone, x, y, press ? .82 : 1);
}
const KD = $('#keyD');
function keyD(t) { // D 键按下 → 点词
  const p = seg(t, 21.5, 21.8), off = 1 - seg(t, 22.6, 23.0);
  const press = t > 21.9 && t < 22.25;
  const el = KD;
  el.style.opacity = p * off;
  el.style.visibility = p * off <= 0 ? 'hidden' : 'visible';
  const r = $('#wq').getBoundingClientRect(), w = WIN.getBoundingClientRect();
  el.style.transform = `translate(${r.left - w.left + 34}px,${r.top - w.top - 58}px) translateY(${press ? 4 : 0}px)`;
  el.style.boxShadow = press
    ? '0 1px 0 #c9c3ab,0 2px 5px rgba(64,55,28,.25)'
    : '0 4px 0 #c9c3ab,0 6px 12px rgba(64,55,28,.2)';
}

/* ---------------- S0 LOGO ---------------- */
function sLogo(t) {
  const [a, b] = SCENE.logo;
  const el = $('#s-logo');
  fade(el, 1 - seg(t, b - .28, b));
  camDrift(el.firstElementChild, t, a, b, 1.4);
  // 徽章
  const bd = $('#logoBadge');
  tr(bd, eo(seg(t, .1, .5)), 0, (1 - eo(seg(t, .1, .5))) * -14);
  // 扫描线猫：逐行组装
  const rects = scanRectsLogo;
  for (let i = 0; i < rects.length; i++) {
    const p = eo(seg(t, .15 + i * .016, .15 + i * .016 + .28));
    rects[i].style.opacity = p;
    rects[i].style.transform = `translateX(${(1 - p) * -150}px)`;
  }
  const bp = eo(seg(t, .15, 1.5));
  scanBaseLogo[0].style.opacity = .065 * bp;
  const fp = seg(t, 1.35, 1.7);
  scanBaseLogo[1].style.opacity = fp; scanBaseLogo[1].style.transform = `translateY(${(1 - ob(fp)) * 10}px)`;
  scanBaseLogo[2].style.opacity = seg(t, 1.5, 1.9); scanBaseLogo[2].style.transform = `translateX(${(1 - seg(t, 1.5, 1.9)) * 40}px)`;
  // 扫描光束
  const beam = $('#scanline .beam');
  const bpz = seg(t, .2, 1.6);
  beam.style.transform = `translateY(${lerp(-60, 470, bpz)}px)`;
  beam.style.opacity = bpz > 0 && bpz < 1 ? .9 : 0;
  // 字标逐字弹入
  $$('#wordmark span').forEach((s, i) => {
    const p = seg(t, 1.25 + i * .075, 1.25 + i * .075 + .34);
    tr(s, eo(p), 0, (1 - ob(p, 2.2)) * 46, lerp(.7, 1, ob(p, 2.2)));
  });
  // 副题打字
  const zh = $('#logoSub .zht'), en = $('#logoSub .en'), tag = $('#logoTag');
  const zht = '随心阅 · 漫游英文世界', ent = 'ROAM THE ENGLISH WEB LIKE A CAT';
  const zp = seg(t, 2.15, 2.85), ep = seg(t, 2.9, 3.5), tp = seg(t, 3.5, 3.9);
  zh.textContent = zht.slice(0, Math.round(zht.length * zp));
  en.textContent = ent.slice(0, Math.round(ent.length * ep));
  fade(zh, zp > 0 ? 1 : 0); fade(en, ep > 0 ? 1 : 0);
  tr(tag, eo(tp), 0, (1 - eo(tp)) * 12);
  // 波纹横向微移
  $('#dotwave .row').style.backgroundPosition = `${t * 26}px 0`;
}

/* ---------------- 舞台公共 ---------------- */
function stageBase(t) {
  const el = $('#stage');
  const [a] = SCENE.pain, [, b] = SCENE.pet;
  const inn = eo(seg(t, a, a + .5));
  const out = 1 - seg(t, b - .35, b);
  fade(el, Math.min(inn, out));
  const w = $('#win');
  w.style.transform = `translateY(${(1 - eo(seg(t, a, a + .7))) * 60}px) scale(${lerp(.965, 1, eo(seg(t, a, a + .7)))})`;
  w.style.transformOrigin = '50% 60%';
}

function capShow(i, t, a, b) {
  const c = CAPS[i];
  const p = eo(seg(t, a, a + .4)), o = 1 - eo(seg(t, b - .3, b));
  tr(c, p * o, (1 - eo(seg(t, a, a + .45))) * -34);
}

/* ---------------- S1 痛点 ---------------- */
const HL = [['#w1', 5.7], ['#w2', 6.25], ['#w3', 6.85], ['#w4', 7.5]];
function sPain(t) {
  const [a, b] = SCENE.pain;
  const vp = $('#vp').firstElementChild;
  vp.style.transform = 'translateY(0px)';
  $('#artScroll').style.transform = 'translateY(0px)';
  camDrift($('#win'), t, a, b, .5);
  for (const [id, at] of HL) {
    const w = $(id);
    const p = eo(seg(t, at, at + .32));
    w.classList.toggle('hl', p > .55);
  }
  capShow(1, t, a + 1.15, b + .4);
  fade($('#rmark'), 0);
}

/* ---------------- S2 双语翻译 ---------------- */
const ZH_AT = [12.7, 13.3, 13.9, 14.6, 15.4];
function sBili(t) {
  const [a, b] = SCENE.bili;
  capShow(2, t, a + .2, b - .2);
  // popup 开合
  const pp = $('#popup');
  const pin = seg(t, 10.7, 11.15), pout = 1 - seg(t, 12.15, 12.5);
  tr(pp, eo(pin) * pout, 0, (1 - eo(pin)) * -18, lerp(.94, 1, ob(pin)));
  // 按钮按压 11.8-12.1
  const press = t > 11.85 && t < 12.15;
  $('#btnTr').style.transform = `translateY(${press ? 3 : 0}px)`;
  $('#btnTr').style.boxShadow = press
    ? '0 0px 0 #000,inset 0 2px 5px rgba(0,0,0,.5)'
    : '0 3px 0 #000,0 5px 12px rgba(22,21,17,.35),inset 0 1px 0 rgba(255,255,255,.14)';
  // 扩展图标脉冲
  fade($('#extDot .pulse'), t > 11.9 && t < 13.2 ? .5 + .5 * Math.sin(t * 14) : 0);
  // 阅读位置标记下行
  const rm = $('#rmark');
  const mp = eio(seg(t, 12.5, 18.6));
  const y = lerp(pTops[0] - 12, pTops[4] + 60, mp);
  fade(rm, seg(t, 12.4, 12.8) * (1 - seg(t, 18.8, 19.3)));
  rm.style.transform = `translateY(${y}px)`;
  // 译文卡
  ZH.forEach((w, i) => setZh(R.zh, i, seg(t, ZH_AT[i], ZH_AT[i] + .55)));
  R.zhc.forEach(z => z.style.opacity = eo(seg(t, 15.1, 15.6)));
  // 滚动跟随
  const sc = eio(seg(t, 15.3, 19.2));
  $('#artScroll').style.transform = `translateY(${-285 * sc}px)`;
  // 光标：点扩展图标 → 点翻译
  cursor(t, [
    { t: 10.7, el: '#extDot' }, { t: 11.1, el: '#extDot', down: true },
    { t: 11.6, el: '#btnTr', fy: .4 }, { t: 11.95, el: '#btnTr', fy: .4, down: true },
    { t: 12.6, x: 1180, y: 420 }, { t: 13.4, x: 1140, y: 500 },
  ]);
}

/* ---------------- S3 阅读辅助 ---------------- */
function sAssist(t) {
  const [a, b] = SCENE.assist;
  capShow(3, t, a + .35, b - .3);
  // 译文收回 + 回滚
  ZH.forEach((w, i) => setZh(R.zh, i, 1 - seg(t, a + .05 + i * .05, a + .55 + i * .05)));
  const sc = eio(seg(t, a, a + .8));
  $('#artScroll').style.transform = `translateY(${lerp(-285, -30, sc)}px)`;
  fade($('#rmark'), 0);
  // 划词高亮退出
  R.hw.forEach(w => w.classList.remove('hl'));
  // 稀疏提示依次出现（前 3 个），第 4 个不再给 → 渐退
  const GT = [20.5, 20.9, 21.3];
  R.gloss.forEach((g, i) => {
    const on = i < 3 ? eo(seg(t, GT[i], GT[i] + .3)) : 0;
    const fadeout = i === 0 ? 1 - seg(t, 24.0, 24.6) : i === 1 ? 1 - seg(t, 24.3, 24.9) : 1 - seg(t, 24.6, 25.2);
    g.style.opacity = on * fadeout * .95;
    g.style.transform = `translateX(-50%) translateY(${(1 - on) * 6}px) scale(${lerp(.8, 1, on)})`;
  });
  // D 键 + 点击 serendipity → 词卡
  keyD(t);
  const wq = $('#wq');
  const qp = seg(t, 22.0, 22.3), qoff = 1 - seg(t, 27.3, 27.7);
  wq.classList.toggle('query', t > 22.0 && t < 27.7);
  const wc = $('#wordcard');
  const wp = seg(t, 22.15, 22.75), wo = 1 - eo(seg(t, 27.4, 27.9));
  tr(wc, ob(wp) * wo, 0, (1 - ob(wp)) * 60, lerp(.92, 1, ob(wp)));
  // 句解构
  const ULT = [25.0, 25.25, 25.5, 25.8, 26.15];
  R.segUls.forEach((u, i) => { u.style.transform = `scaleX(${eio(seg(t, ULT[i], ULT[i] + .42))})`; });
  fade(R.legend, eo(seg(t, 26.1, 26.6)) * (1 - seg(t, b - .2, b)));
  const lt = R.longtag;
  const lp = seg(t, 26.6, 27.0);
  lt.style.opacity = lp * (1 - seg(t, b - .2, b));
  lt.style.transform = `scale(${lerp(.6, 1, ob(lp))}) translateY(${Math.sin(t * 3) * 1.5}px)`;
  // 光标移向 serendipity
  cursor(t, [
    { t: 21.55, x: 560, y: 430 }, { t: 22.0, el: '#wq', down: true },
    { t: 22.9, x: 700, y: 560 },
  ]);
}

/* ---------------- S4 伴读猫 ---------------- */
function sPet(t) {
  const [a, b] = SCENE.pet;
  capShow(4, t, a + .4, b - .2);
  // 清理 S3 痕迹
  R.segUls.forEach(u => u.style.transform = `scaleX(${1 - seg(t, a, a + .4)})`);
  $('#wq').classList.remove('query');
  fade($('#wordcard'), 0); fade(R.legend, 0); R.longtag.style.opacity = 0;
  R.gloss.forEach(g => g.style.opacity = 0);
  $('#artScroll').style.transform = `translateY(${lerp(-30, -60, eio(seg(t, a, a + 1)))}px)`;
  // 猫升起
  const pw = $('#petwrap'); pw.style.opacity = 1; pw.style.visibility = 'visible';
  const cat = $('#petCat');
  const cp = seg(t, 28.7, 29.5);
  tr(cat, eo(cp), 0, (1 - ob(cp, 1.6)) * 170, lerp(.7, 1, ob(cp, 1.6)));
  petTail.style.transform = `rotate(${Math.sin(t * 5.2) * 7 * clamp(cp)}deg)`;
  // 眨眼（31.4 与 33.6 各一次）
  const blink = (t > 31.35 && t < 31.5) || (t > 33.55 && t < 33.7);
  petEyesO.style.opacity = blink ? 0 : 1; petEyesS.style.opacity = blink ? 1 : 0;
  // 快捷坞
  const pressP = t > 31.1 && t < 31.35;
  R.dock.forEach((d, i) => {
    const p = seg(t, 29.7 + i * .13, 29.7 + i * .13 + .38);
    tr(d, eo(p), (1 - ob(p, 2)) * 34, (i === 1 && pressP) ? 3 : 0, lerp(.5, 1, ob(p, 2)), `rotate(${(1 - ob(p, 2)) * -24}deg)`);
  });
  // 点击摘要钮（idx1）
  const hover1 = t > 30.7 && t < 31.35;
  if (R.dock[1]) R.dock[1].querySelector('.tip').style.opacity = hover1 ? 1 : 0;
  // 摘要卡
  const sc = $('#sumcard');
  const sp = seg(t, 31.35, 32.1);
  tr(sc, eo(sp) * (1 - seg(t, b - .3, b)), 0, (1 - ob(sp)) * 40, lerp(.9, 1, ob(sp)));
  R.pts.forEach((r, i) => tr(r, eo(seg(t, 32.3 + i * .22, 32.3 + i * .22 + .4)), (1 - eo(seg(t, 32.3 + i * .22, 32.3 + i * .22 + .4))) * -24));
  cursor(t, [
    { t: 30.3, x: 1230, y: 640 }, { t: 30.9, el: '#dock .dockb:nth-child(2)', down: true },
    { t: 31.6, x: 1300, y: 700 }, { t: 32.4, x: 1150, y: 700 },
  ]);
}

/* ---------------- S5 模型服务 ---------------- */
function sSvc(t) {
  const [a, b] = SCENE.svc;
  const el = $('#s-svc');
  fade(el, seg(t, a, a + .35) * (1 - seg(t, b - .3, b)));
  camDrift(el.firstElementChild, t, a, b, .8);
  popIn($('#svcTitle'), seg(t, a + .15, a + .6), 30);
  $$('#svcCards .svccard').forEach((c, i) => {
    const p = seg(t, a + .5 + i * .17, a + .5 + i * .17 + .55);
    tr(c, eo(p), 0, (1 - ob(p, 1.5)) * 70, lerp(.93, 1, ob(p, 1.5)));
  });
  // 图标轻微浮动
  $$('#icongrid .ic').forEach((ic, i) => {
    ic.style.transform = `translateY(${Math.sin(t * 1.7 + i * .8) * 4}px)`;
  });
  capShow(5, t, a + .8, b - .15);
}

/* ---------------- S6 阅读器 ---------------- */
function sReader(t) {
  const [a, b] = SCENE.reader;
  const el = $('#s-reader');
  fade(el, seg(t, a, a + .35) * (1 - seg(t, b - .3, b)));
  popIn($('#rdwin'), seg(t, a + .1, a + .7), 46, .965);
  const ZT = [a + 1.6, a + 2.3, a + 3.0];
  ZH_RD.forEach((w, i) => setZh(R.zhRd, i, seg(t, ZT[i], ZT[i] + .55)));
  $('#rdscroll').style.transform = `translateY(${-66 * eio(seg(t, a + 2.4, b - .4))}px)`;
  const pulse = t > a + 3.9 ? .5 + .5 * Math.sin(t * 9) : 0;
  $('#btnTrAll').style.boxShadow = `0 3px 0 #8f8465,0 5px 12px rgba(0,0,0,.4),0 0 ${18 * pulse}px rgba(240,166,60,${.55 * pulse}),inset 0 1px 0 #fff`;
  capShow(6, t, a + .7, b - .15);
}

/* ---------------- S7 收尾 ---------------- */
function sOut(t) {
  const [a, b] = SCENE.out;
  const el = $('#s-out');
  fade(el, seg(t, a, a + .4) * (1 - seg(t, b - .45, b)));
  R.outChips.forEach((c, i) => {
    const p = seg(t, 46.0 + i * .18, 46.0 + i * .18 + .45);
    tr(c, eo(p), 0, (1 - ob(p)) * -26, lerp(.9, 1, ob(p)));
  });
  // 锁标组装（快速）
  const rects = scanRectsOut;
  for (let i = 0; i < rects.length; i++) {
    const p = eo(seg(t, 46.9 + i * .006, 46.9 + i * .006 + .2));
    rects[i].style.opacity = p;
    rects[i].style.transform = `translateX(${(1 - p) * -60}px)`;
  }
  scanBaseOut[0].style.opacity = .065 * eo(seg(t, 46.9, 47.6));
  scanBaseOut[1].style.opacity = seg(t, 47.4, 47.7);
  scanBaseOut[2].style.opacity = seg(t, 47.6, 48.0);
  tr($('#outCat'), eo(seg(t, 46.9, 47.6)), 0, (1 - eo(seg(t, 46.9, 47.6))) * 24, lerp(.94, 1, eo(seg(t, 46.9, 47.6))));
  $$('#outWord span').forEach((s, i) => {
    const p = seg(t, 47.55 + i * .055, 47.55 + i * .055 + .3);
    tr(s, eo(p), 0, (1 - ob(p, 2.2)) * 30, lerp(.7, 1, ob(p, 2.2)));
  });
  tr($('#outSub'), eo(seg(t, 48.3, 48.8)), 0, (1 - eo(seg(t, 48.3, 48.8))) * 14);
  tr($('#outEn'), eo(seg(t, 48.6, 49.1)), 0, (1 - eo(seg(t, 48.6, 49.1))) * 10);
  R.outMeta.forEach((m, i) => tr(m, eo(seg(t, 49.0 + i * .12, 49.0 + i * .12 + .4)), 0, (1 - eo(seg(t, 49.0 + i * .12, 49.0 + i * .12 + .4))) * 16));
  tr($('#outUrl'), eo(seg(t, 49.5, 50.0)), 0, (1 - eo(seg(t, 49.5, 50.0))) * 12);
  // 伴读猫走入坐下
  const pc = $('#outPet');
  const pp = seg(t, 47.8, 48.6);
  pc.style.opacity = eo(pp);
  pc.style.transform = `translateX(${(1 - eio(pp)) * 260}px)`;
  outPetTail.style.transform = `rotate(${Math.sin(t * 5.5) * 6}deg)`;
  const blink = (t > 49.8 && t < 49.95) || (t > 51.0 && t < 51.15);
  outPetEyesO.style.opacity = blink ? 0 : 1; outPetEyesS.style.opacity = blink ? 1 : 0;
  $('#outWave').style.backgroundPosition = `${t * 20}px 0`;
  capShow(7, t, 46.2, 49.6);
}

/* ---------------- 主渲染 ---------------- */
function render(t) {
  t = clamp(t, 0, DUR - .001);
  for (const id of ['#s-logo', '#stage', '#s-svc', '#s-reader', '#s-out']) fade($(id), 0);
  fade(CUR, 0); KD.style.opacity = 0;
  if (t >= SCENE.pain[0] && t < SCENE.pet[1] + .4) resetStage();
  if (t < SCENE.logo[1]) sLogo(t);
  if (t >= SCENE.pain[0] && t < SCENE.pain[1] + .4) { stageBase(t); sPain(t); }
  if (t >= SCENE.bili[0] && t < SCENE.bili[1]) { stageBase(t); sBili(t); }
  if (t >= SCENE.assist[0] && t < SCENE.assist[1]) { stageBase(t); sAssist(t); }
  if (t >= SCENE.pet[0] && t < SCENE.pet[1] + .35) { stageBase(t); sPet(t); }
  if (t >= SCENE.svc[0] && t < SCENE.svc[1]) sSvc(t);
  if (t >= SCENE.reader[0] && t < SCENE.reader[1]) sReader(t);
  if (t >= SCENE.out[0] && t <= DUR) sOut(t);
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
