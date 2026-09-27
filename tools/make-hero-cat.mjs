/**
 * @file tools/make-hero-cat.mjs
 * 文件职责：扫描线漫游猫图稿生成器——以多边形剪影（正面坐姿猫：尖耳、圆颊、端坐身、右侧弯尾）
 *   逐行光栅化为水平扫描条，挖出眼洞与鼻部缺口，并向右甩出渐隐风线；一次产出细线版
 *   （src/components/hero-art.js 的 svg 模板体）与粗线分组版（伴读猫 renderCatSvg 片段，
 *   保留 .cat-ear/.cat-tail/.cat-scanlines 动画分组）。
 * 用法：node tools/make-hero-cat.mjs [--stdout]
 *   默认重写 src/components/hero-art.js 并把伴读猫片段写入 preview/pet-cat-svg.txt。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {writeFileSync, mkdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- 剪影模型（viewBox 460×490，正面坐姿） ---------- */

// 头+双耳：单多边形，顺时针自左耳外底
const HEAD = [
  [60, 94], [86, 10], [124, 72], [142, 66], [168, 62], [196, 66], [212, 72],
  [250, 10], [274, 94], [284, 124], [288, 156], [278, 180], [258, 198],
  [232, 210], [168, 214], [104, 210], [78, 198], [58, 180], [48, 156], [52, 124]
];

// 身体：颈部收窄、胯部外鼓、底座平直
const BODY = [
  [108, 208], [230, 208], [244, 238], [256, 272], [276, 316], [296, 362],
  [306, 410], [310, 446], [312, 462], [48, 462], [50, 442], [56, 398],
  [66, 348], [82, 300], [96, 258], [104, 228]
];

// 尾巴：从右胯探出、向右甩起、尖端上卷
const TAIL = [
  [296, 318], [334, 324], [374, 318], [408, 300], [432, 272], [446, 242],
  [454, 216], [448, 208], [438, 212], [428, 238], [414, 264], [390, 290],
  [362, 306], [330, 308], [298, 300]
];

const PARTS = {head: HEAD, body: BODY, tail: TAIL};
const SILHOUETTE = [HEAD, BODY, TAIL];

// 耳区行（用于伴读猫分组抽动）
const EAR_Y_MAX = 97;
const EAR_SPLIT_X = 160;

// 眼洞（扫描条镂空）与方块眼位置
const EYE_GAP = {top: 130, bottom: 164, left: [110, 144], right: [192, 226]};
const EYE_BLOCK = {left: [118, 138], right: [200, 220]};

// 内耳点缀（黄铜小三角）
const INNER_EARS = [
  [[76, 62], [88, 30], [106, 62]],
  [[230, 62], [248, 30], [260, 62]]
];

// 风线拖尾：剪影右缘之外的断续延长条
const TRAIL = {min: 404, max: 456, gap: 9};

/* ---------- 光栅化 ---------- */

// 单多边形与水平线的交集区间
function polyIntervals(poly, y) {
  const xs = [];
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
      xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1));
    }
  }
  xs.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] > 1.2) out.push([xs[i], xs[i + 1]]);
  }
  return out;
}

const subtract = (segs, [a, b]) => segs.flatMap(([x0, x1]) =>
  [[x0, Math.min(x1, a)], [Math.max(x0, b), x1]].filter(([s, e]) => e - s > 1.2));

// 每行返回带部位标签的段集：[{part,x0,x1}...]；眼洞只作用于头部段
function scanRows({step, barH, gaps = true, trails = true}) {
  const rows = [];
  let i = 0;
  for (let y = 10; y + barH <= 466; y += step, i++) {
    const probe = y + barH / 2;
    const segs = [];
    for (const [part, poly] of Object.entries(PARTS)) {
      let ints = polyIntervals(poly, probe);
      if (gaps && part === 'head' && y + barH > EYE_GAP.top && y < EYE_GAP.bottom) {
        ints = subtract(ints, EYE_GAP.left);
        ints = subtract(ints, EYE_GAP.right);
      }
      for (const [x0, x1] of ints) segs.push({part, x0, x1});
    }
    if (!segs.length) continue;
    segs.sort((a, b) => a.x0 - b.x0);
    rows.push({y, segs});
    // 拖尾：身体行隔行向右甩出递减风线（耳区与尾尖端不甩）
    const rightEdge = Math.max(...segs.map(s => s.x1));
    if (trails && y > EAR_Y_MAX && rightEdge < TRAIL.min && i % 2 === 1) {
      const reach = TRAIL.min + ((i * 17) % (TRAIL.max - TRAIL.min));
      if (reach > rightEdge + 18) rows.push({y, segs: [{part: 'trail', x0: rightEdge + TRAIL.gap, x1: reach}]});
    }
  }
  return rows;
}

const rect = (x, y, w, h) =>
  `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${h}"/>`;
const polyPath = p => 'M' + p.map(([x, y]) => `${x},${y}`).join('L') + 'Z';
const silhouettePath = () => SILHOUETTE.map(polyPath).join('');

// 方块眼：眼洞内 3 条短粗条（保留扫描线纹理感）
function eyeRects(block) {
  const out = [];
  for (let y = EYE_GAP.top + 4; y + 6 <= EYE_GAP.bottom; y += 9) {
    out.push(rect(block[0], y, block[1] - block[0], 6));
  }
  return out;
}

/* ---------- hero 版：细线、整组 ---------- */

function heroBody() {
  const rows = scanRows({step: 9, barH: 1.8});
  const bars = [], wind = [];
  for (const row of rows) {
    const target = row.segs[0].part === 'trail' ? wind : bars;
    for (const s of row.segs) target.push(rect(s.x0, row.y, s.x1 - s.x0, 1.8));
  }
  return [
    `<path d="${silhouettePath()}" opacity=".065"/>`,
    `<g>${bars.join('')}</g>`,
    `<g opacity=".38">${wind.join('')}</g>`,
    `<g fill="var(--accent, currentColor)">${eyeRects(EYE_BLOCK.left).join('')}${eyeRects(EYE_BLOCK.right).join('')}<path d="M160 178h16l-8 9z"/></g>`,
    `<path d="M40 468h90m40 8h140m30-9h110" fill="none" stroke="currentColor" stroke-width="1.4"/>`
  ].join('');
}

function heroFile() {
  return `/**
 * @file src/components/hero-art.js
 * 文件职责：共享扫描线漫游猫 SVG 图稿——由 tools/make-hero-cat.mjs 从多边形剪影
 *   光栅化生成（正面坐姿猫 + 右侧风线拖尾）；welcome 英雄区与 reader 空态共用。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {svg, nothing} from 'lit';

export const heroArt = (className = '') => svg\`<svg class=\${className || nothing} aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 490" fill="currentColor"><title>随心阅 · 扫描线漫游猫</title>${heroBody()}</svg>\`;
`;
}

/* ---------- pet 版：粗线、按动画分组 ---------- */

function petGroups() {
  const rows = scanRows({step: 9, barH: 4.8});
  const g = {earL: [], earR: [], tail: [], body: [], trail: []};
  const put = (s, y) => rect(s.x0, y, s.x1 - s.x0, 4.8);

  for (const row of rows) {
    if (row.segs[0].part === 'trail') {
      g.trail.push(row.segs.map(s => put(s, row.y)).join(''));
      continue;
    }
    for (const s of row.segs) {
      if (s.part === 'tail') { g.tail.push(put(s, row.y)); continue; }
      if (row.y + 4.8 <= EAR_Y_MAX) {
        // 耳区：按中缝拆左右耳（跨缝段切成两半）
        if (s.x1 <= EAR_SPLIT_X) g.earL.push(put(s, row.y));
        else if (s.x0 >= EAR_SPLIT_X) g.earR.push(put(s, row.y));
        else {
          g.earL.push(rect(s.x0, row.y, EAR_SPLIT_X - s.x0, 4.8));
          g.earR.push(rect(EAR_SPLIT_X, row.y, s.x1 - EAR_SPLIT_X, 4.8));
        }
        continue;
      }
      g.body.push(put(s, row.y));
    }
  }
  return g;
}

function petFragment() {
  const g = petGroups();
  const sil = silhouettePath();
  const eye = (block, cls) => `<g class="cat-eye ${cls}">${eyeRects(block).join('')}</g>`;
  return `        <ellipse class="cat-ground-shadow" cx="190" cy="472" rx="176" ry="13" fill="url(#rc-roam-ground)"/>
        <path class="cat-base" d="${sil}" opacity=".09"/>

        <!-- Wind Trail Lines（向右的风） -->
        <g class="cat-trails" opacity=".34">${g.trail.join('')}</g>

        <!-- Animated Wagging Tail -->
        <g class="cat-tail">${g.tail.join('')}</g>

        <g class="cat-ear cat-ear-left">${g.earL.join('')}</g>
        <g class="cat-ear cat-ear-right">${g.earR.join('')}</g>

        <g class="cat-inner-ears" fill="var(--pet-primary, #f59e0b)" opacity="0.55">${INNER_EARS.map(p => `<path d="${polyPath(p)}"/>`).join('')}</g>

        <!-- Scanline Halftone Body Bars -->
        <g class="cat-scanlines">${g.body.join('')}</g>

        <path class="cat-volume" fill="url(#rc-roam-vol)" d="${sil}"/>

        <g class="cat-eyes-group">
          <g class="cat-eyes-open">
            ${eye(EYE_BLOCK.left, 'cat-eye-left')}
            ${eye(EYE_BLOCK.right, 'cat-eye-right')}
          </g>
          <g class="cat-eyes-squint">
            <rect x="110" y="145" width="30" height="7" rx="3.5"/>
            <rect x="114" y="138" width="22" height="6" rx="3"/>
            <rect x="196" y="145" width="30" height="7" rx="3.5"/>
            <rect x="200" y="138" width="22" height="6" rx="3"/>
          </g>
        </g>

        <g class="cat-blush" fill="var(--pet-primary, #f59e0b)" opacity="0.34">
          <ellipse cx="72" cy="182" rx="13" ry="6.5"/>
          <ellipse cx="262" cy="182" rx="13" ry="6.5"/>
        </g>

        <g class="cat-muzzle">
          <path d="M159 172h18l-9 11z" fill="var(--pet-primary, #f59e0b)"/>
          <path d="M152 188q8 8 16 0q8 8 16 0" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
        </g>

        <path class="cat-trail" d="M40 468h90m40 8h140m30-9h110" fill="none" stroke="currentColor" stroke-width="2.5"/>`;
}

/* ---------- 入口 ---------- */

const hero = heroFile();
if (process.argv.includes('--stdout')) {
  process.stdout.write(hero);
} else {
  writeFileSync(join(ROOT, 'src/components/hero-art.js'), hero);
  mkdirSync(join(ROOT, 'preview'), {recursive: true});
  writeFileSync(join(ROOT, 'preview/pet-cat-svg.txt'), petFragment());
  console.log('hero-art.js rewritten; pet fragment → preview/pet-cat-svg.txt');
}
