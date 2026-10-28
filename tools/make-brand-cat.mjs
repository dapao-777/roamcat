/**
 * @file tools/make-brand-cat.mjs
 * 文件职责：品牌猫（黑色麻薯猫 + 彩虹边缘光）的唯一生成器——与伴读猫 floating-pet-svg.js 的坐姿
 *   同一套几何，一次产出产品 logo、单色标、各尺寸 PNG 图标与页面插图，避免各处手改漂移。
 * 主要内容：
 *   - extension/icons/roamcat.svg 与 roamcat-icon-src.svg：砚底圆角砖上的应用图标（完整边缘光）；
 *   - extension/icons/roamcat-light.svg：奶白圆角砖上的亮色版，扩展页与页内挂件在亮色主题下使用；
 *   - extension/icons/roamcat-cat-ink.svg：fill=currentColor 的单色标，眼睛与 ω 嘴以 mask 镂空；
 *   - extension/icons/icon-{16,32,48,128,256,512}.png：经本机 ego lite 栅格化，16/32 用加粗简化版；
 *   - src/components/hero-art.js：欢迎页主图、阅读器空态与设置页印章共用的插图模板
 *     （每次调用生成独立 id，同页多处使用、或位于隐藏分区里也不会互相引用失效）；
 *   - docs/assets/roamcat.svg：落地页 favicon 与标志。
 * 用法：node tools/make-brand-cat.mjs（需 playwright-core 与本机 ego lite，或用 ROAMCAT_BROWSER 指定浏览器）。
 * 模块边界：构建期工具，只写上述产物；伴读猫的 SVG 仍内联在 floating-pet-svg.js，改几何须两边同步。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {writeFileSync, mkdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = join(ROOT, 'roamcat-0.0.1', 'extension', 'icons');
const require = createRequire(import.meta.url);

/* ---------- 几何（viewBox 200×220，与伴读猫坐姿一致） ---------- */
const BODY = 'M46 194 C30 176 32 130 56 110 C74 94 126 94 144 110 C168 130 170 176 154 194 C144 202 56 202 46 194 Z';
const EAR_L = 'M52 120 L50 82 L82 100 Z';
const EAR_R = 'M118 100 L150 82 L148 120 Z';
const EYES = [[80, 140], [122, 135]];
const MOUTH = 'M102 133 v3.4 M96.5 139 Q99.5 143.5 102.5 139.4 Q105.5 143.5 108.5 139';
const WHISKERS = [[52, 150, 16, 146], [52, 155, 18, 158], [54, 160, 24, 170], [150, 122, 186, 110], [150, 127, 188, 122], [150, 132, 184, 133]];
/* ---------- 调色板：深色（近黑麻薯 + 彩虹边缘光）与亮色（奶白麻薯 + 粉蓝金柔光 + 暖棕细描边） ---------- */
// 与 floating-pet-styles.js 的 --pet-cat-* 取值一致；页面插图走 tokens.css 的 --rc-cat-*（同一组键名）。
const DARK = {
  body: '#0b0a0e', face: '#fbfaff', whisker: '#fbfaff', whiskerUnder: 'rgba(0, 0, 0, 0.38)', line: 'transparent',
  rim0: '#ffffff', rim1: '#ffe0ee', rim2: '#bfe6ff', rim3: '#d8f3ff', rim4: '#ffd9a0',
  under0: '#ffc79a', under1: '#d9b8ff', under2: '#8cc4ff', ear0: '#d7c2cc', ear1: '#3a3038',
  floor0: '#ffe7d2', floor1: '#ffffff', floor2: '#d6ecff', bloom: '0.55', chroma: '0.5',
};
const LIGHT = {
  body: '#fffaf3', face: '#3a2e26', whisker: '#9a8a7e', whiskerUnder: 'transparent', line: 'rgba(96, 72, 54, 0.55)',
  rim0: '#ffc2d8', rim1: '#f9bfe0', rim2: '#a9d6ff', rim3: '#b8ecf5', rim4: '#ffd08f',
  under0: '#ffd2b0', under1: '#e8d6ff', under2: '#d2e8ff', ear0: '#ffd3de', ear1: '#fff4ef',
  floor0: '#ead8ca', floor1: '#dcc6b4', floor2: '#e6d9cf', bloom: '0.5', chroma: '0.3',
};
const TILES = {
  dark: {stops: ['#1f2433', '#0b0e13'], border: 'none'},
  // 亮色砖用暖拿铁色：白麻薯在米白界面上的小尺寸 logo 里要有足够对比，奶白砖会和卡片糊成一片。
  light: {stops: ['#e9dccb', '#cdb79e'], border: 'rgba(96, 70, 48, 0.35)'},
};
const kebab = key => key.replace(/[A-Z]/g, ch => '-' + ch.toLowerCase()).replace(/(\D)(\d)$/, '$1-$2');
/** 'vars' 输出 var(--rc-cat-*, 深色默认值)，供随主题切换的页面插图；否则输出该调色板的字面色值。 */
const paint = (palette, key) => (palette === 'vars' ? `var(--rc-cat-${kebab(key)}, ${DARK[key]})` : palette[key]);

/** 渐变与辉光滤镜；id 前缀由调用方保证唯一。 */
function defs(id, pal) {
  const c = key => paint(pal, key);
  return `<linearGradient id="${id}-rim" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0" stop-color="${c('rim0')}"/><stop offset="0.3" stop-color="${c('rim1')}"/><stop offset="0.55" stop-color="${c('rim2')}"/><stop offset="0.8" stop-color="${c('rim3')}"/><stop offset="1" stop-color="${c('rim4')}"/></linearGradient>`
    + `<radialGradient id="${id}-under" gradientUnits="userSpaceOnUse" cx="100" cy="200" r="96">`
    + `<stop offset="0" stop-color="${c('under0')}" stop-opacity="0.95"/><stop offset="0.3" stop-color="${c('under1')}" stop-opacity="0.5"/><stop offset="0.6" stop-color="${c('under2')}" stop-opacity="0.18"/><stop offset="1" stop-color="${c('under2')}" stop-opacity="0"/></radialGradient>`
    + `<linearGradient id="${id}-ear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c('ear0')}"/><stop offset="1" stop-color="${c('ear1')}"/></linearGradient>`
    + `<linearGradient id="${id}-floor" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c('floor1')}" stop-opacity="0"/><stop offset="0.3" stop-color="${c('floor0')}" stop-opacity="0.9"/><stop offset="0.5" stop-color="${c('floor1')}"/><stop offset="0.7" stop-color="${c('floor2')}" stop-opacity="0.9"/><stop offset="1" stop-color="${c('floor1')}" stop-opacity="0"/></linearGradient>`
    + `<filter id="${id}-bloom" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2"/></filter>`
    + `<clipPath id="${id}-clip"><path d="${BODY}"/></clipPath>`;
}

/**
 * 完整猫体（坐标系 200×220）。detail：'full' 带胡须与色散，'icon' 去胡须，'tiny' 只留剪影 + 粗边缘光 + 大眼。
 * whiskerUnderlay 在胡须下垫一层描边（深色版为半透明黑，亮色版透明）。
 */
function catBody(id, pal, {detail = 'full', floor = true, floorInset = 0, whiskerUnderlay = false, lineWidth = 1.2} = {}) {
  const c = key => paint(pal, key);
  const tiny = detail === 'tiny';
  const rimWidth = tiny ? 9 : 2.8;
  const eyeR = tiny ? 11 : 5.8;
  let out = '';
  if (floor && !tiny) out += `<rect x="${floorInset}" y="194.5" width="${200 - floorInset * 2}" height="6" rx="3" fill="url(#${id}-floor)" filter="url(#${id}-bloom)"/><rect x="${14 + floorInset}" y="196.6" width="${172 - floorInset * 2}" height="1.8" rx="0.9" fill="url(#${id}-floor)"/>`;
  out += `<path d="${EAR_L}" fill="url(#${id}-ear)" stroke="url(#${id}-rim)" stroke-width="${tiny ? 7 : 2.6}" stroke-linejoin="round"/>`;
  out += `<path d="${EAR_R}" fill="url(#${id}-ear)" stroke="url(#${id}-rim)" stroke-width="${tiny ? 7 : 2.6}" stroke-linejoin="round"/>`;
  // 耳朵描边先画，随后的身体会盖住耳根，免得描边线穿过脑门。
  out += `<path d="${EAR_L}" fill="none" stroke="${c('line')}" stroke-width="${tiny ? 3 : lineWidth}" stroke-linejoin="round"/><path d="${EAR_R}" fill="none" stroke="${c('line')}" stroke-width="${tiny ? 3 : lineWidth}" stroke-linejoin="round"/>`;
  if (!tiny) out += `<path d="${BODY}" fill="none" stroke="url(#${id}-rim)" stroke-width="8" style="opacity:${c('bloom')}" filter="url(#${id}-bloom)"/>`;
  out += `<path d="${BODY}" fill="${c('body')}"/>`;
  out += `<g clip-path="url(#${id}-clip)"><rect x="0" y="80" width="200" height="130" fill="url(#${id}-under)"/></g>`;
  if (detail === 'full') out += `<path d="${BODY}" fill="none" stroke="#ff8fc4" stroke-width="1.5" style="opacity:${c('chroma')}" transform="translate(-1.2 0)"/><path d="${BODY}" fill="none" stroke="#86dcff" stroke-width="1.5" style="opacity:${c('chroma')}" transform="translate(1.2 0.6)"/>`;
  out += `<path d="${BODY}" fill="none" stroke="url(#${id}-rim)" stroke-width="${rimWidth}"/>`;
  // 亮色版靠细描边托住轮廓；深色版这里是 transparent。
  out += `<path d="${BODY}" fill="none" stroke="${c('line')}" stroke-width="${tiny ? 3.5 : lineWidth}"/>`;
  const eyes = tiny ? [[78, 146], [124, 142]] : EYES;
  out += eyes.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${eyeR}" fill="${c('face')}"/>`).join('');
  if (!tiny) out += `<path d="${MOUTH}" fill="none" stroke="${c('face')}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (detail === 'full') {
    const lines = WHISKERS.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`).join('');
    if (whiskerUnderlay) out += `<g fill="none" stroke="${c('whiskerUnder')}" stroke-width="2.6" stroke-linecap="round">${lines}</g>`;
    out += `<g fill="none" stroke="${c('whisker')}" stroke-width="1.3" stroke-linecap="round" opacity="0.85">${lines}</g>`;
  }
  return out;
}

/** 应用图标：圆角底板 + 猫。theme='dark' 为砚底版（工具栏/商店/README 默认），'light' 为亮色页面里的奶白版。 */
function appIcon(detail, theme = 'dark') {
  const id = theme === 'light' ? 'rc-logo-light' : 'rc-logo';
  const pal = theme === 'light' ? LIGHT : DARK;
  const tile = TILES[theme];
  const tiny = detail === 'tiny';
  // 猫体 x 38–162、y 82–200；放进 128 底板，留出圆角边距。
  const scale = tiny ? 0.84 : 0.72;
  // 猫体纵向 82–200 的中点落在底板中心略偏下，耳尖与圆角之间留白。
  const tx = 64 - 100 * scale, ty = 68 - 141 * scale;
  const border = tile.border === 'none' ? '' : `<rect x="0.75" y="0.75" width="126.5" height="126.5" rx="27.25" fill="none" stroke="${tile.border}" stroke-width="1.5"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>RoamCat</title><defs>${defs(id, pal)}`
    + `<radialGradient id="${id}-tile" cx="0.5" cy="0.9" r="0.85"><stop offset="0" stop-color="${tile.stops[0]}"/><stop offset="1" stop-color="${tile.stops[1]}"/></radialGradient></defs>`
    + `<rect width="128" height="128" rx="28" fill="url(#${id}-tile)"/>${border}`
    + `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale})">${catBody(id, pal, {detail, floor: !tiny, floorInset: 18, lineWidth: theme === 'light' ? 2.6 : 1.2})}</g></svg>`;
}

/** 单色标：剪影取 currentColor，眼睛与嘴以 mask 镂空，可直接作 CSS mask-image。 */
function inkMark() {
  const eyes = EYES.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="6.4" fill="#000"/>`).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="36 76 128 128" fill="currentColor"><title>RoamCat</title>'
    + `<defs><mask id="rc-ink-face" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="220"><rect width="200" height="220" fill="#fff"/>${eyes}<path d="${MOUTH}" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></mask></defs>`
    + `<g mask="url(#rc-ink-face)"><path d="${EAR_L}" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="${EAR_R}" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="${BODY}"/></g></svg>`;
}

/** hero-art.js：Lit svg 模板，每次调用换一组 id。 */
function heroArtModule() {
  const body = catBody('${id}', 'vars', {detail: 'full', whiskerUnderlay: true});
  const header = `/**
 * @file src/components/hero-art.js
 * 文件职责：共享品牌猫插图——麻薯猫坐在地平线上，边缘光勾出轮廓；配色全部取 tokens.css 的
 *   --rc-cat-*，深色主题为近黑麻薯 + 彩虹边缘光，亮色主题为奶白麻薯 + 粉蓝金柔光 + 暖棕细描边。
 *   由 tools/make-brand-cat.mjs 生成（勿手改），欢迎页主图、阅读器空态与设置页印章共用。
 * 主要内容：heroArt(className) 返回 Lit svg 模板；每次调用分配独立 id 前缀，
 *   同页多处使用或位于隐藏分区里时渐变/滤镜引用不会落空。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {svg, nothing} from 'lit';

let heroSerial = 0;
`;
  const template = `<svg class=\${className || nothing} aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 70 200 140"><defs>${defs('${id}', 'vars')}</defs>${body}</svg>`;
  return `${header}export const heroArt = (className = '') => {\n  const id = \`rc-hero-\${++heroSerial}\`;\n  return svg\`${template}\`;\n};\n`;
}

async function rasterize(entries) {
  const {chromium} = require('./lib/browser.cjs');
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage({deviceScaleFactor: 1});
    for (const {size, svgText, file} of entries) {
      await page.setViewportSize({width: size, height: size});
      await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svgText}`);
      await page.screenshot({path: file, omitBackground: true, clip: {x: 0, y: 0, width: size, height: size}});
    }
  } finally {
    await browser.close();
  }
}

const full = appIcon('icon');
const tiny = appIcon('tiny');
for (const name of ['roamcat.svg', 'roamcat-icon-src.svg']) writeFileSync(join(ICONS, name), full + '\n');
writeFileSync(join(ICONS, 'roamcat-light.svg'), appIcon('icon', 'light') + '\n');
writeFileSync(join(ICONS, 'roamcat-cat-ink.svg'), inkMark() + '\n');
mkdirSync(join(ROOT, 'docs', 'assets'), {recursive: true});
writeFileSync(join(ROOT, 'docs', 'assets', 'roamcat.svg'), full + '\n');
writeFileSync(join(ROOT, 'src', 'components', 'hero-art.js'), heroArtModule());
await rasterize([16, 32, 48, 128, 256, 512].map(size => ({size, svgText: size <= 32 ? tiny : full, file: join(ICONS, `icon-${size}.png`)})));
console.log('品牌猫已生成：icons/roamcat*.svg（含亮色版 roamcat-light.svg）、roamcat-cat-ink.svg、icon-16…512.png、src/components/hero-art.js、docs/assets/roamcat.svg');
