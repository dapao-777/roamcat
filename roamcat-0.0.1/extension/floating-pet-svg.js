/**
 * @file extension/floating-pet-svg.js
 * 文件职责：伴读猫 SVG 形象（classic script，禁 ESM 语法）——坐姿与贴边探头两种姿态的矢量图与边缘光渐变。
 * 主要内容：globalThis.RoamCatPetParts 上的 renderCatSvg、renderPeekingCatSvg；配色走 --pet-cat-* 变量。
 * 模块边界：只产出 SVG 字符串；品牌猫生成器 tools/make-brand-cat.mjs 与宣传片抽取 tools/promo/_extract.mjs
 *   依赖本文件的几何，改动须同步；须排在 floating-pet.js 之前注入；必须保持非 ESM（module-graph R1 强制）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
(() => {
  const parts = (globalThis.RoamCatPetParts ||= {});
  const T = (k, v) => globalThis.RoamCatI18n?.t?.(k, v) ?? k;

  // 伴读猫配色：深色主题是一团近黑麻薯（白五官、白→粉→蓝→金边缘光、底部暖光），
  // 亮色主题换成奶白麻薯（深色五官、粉蓝金柔光加一圈暖棕细描边）。所有颜色走 --pet-cat-* 变量，
  // 默认值即深色版；亮/暗两套取值在 floating-pet-styles.js 顶部的 :host 主题块里（深色两处：:host[data-theme] 与 @media 兜底）。
  const CAT_BODY = 'var(--pet-cat-body, #0b0a0e)', CAT_FACE = 'var(--pet-cat-face, #fbfaff)';
  const CAT_WHISKER = 'var(--pet-cat-whisker, #fbfaff)', CAT_WHISKER_UNDER = 'var(--pet-cat-whisker-under, rgba(0,0,0,0.38))';
  const CAT_LINE = 'var(--pet-cat-line, transparent)';
  // 两种姿态各自一套 id（rc-cat-* / rc-peek-*），同在一个 Shadow root 里也不冲突。
  function catGlowDefs(prefix, glow) {
    return `
      <linearGradient id="${prefix}-rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="var(--pet-cat-rim-0, #ffffff)"/>
      <stop offset="0.3" stop-color="var(--pet-cat-rim-1, #ffe0ee)"/>
      <stop offset="0.55" stop-color="var(--pet-cat-rim-2, #bfe6ff)"/>
      <stop offset="0.8" stop-color="var(--pet-cat-rim-3, #d8f3ff)"/>
      <stop offset="1" stop-color="var(--pet-cat-rim-4, #ffd9a0)"/>
      </linearGradient>
      <radialGradient id="${prefix}-under" gradientUnits="userSpaceOnUse" cx="${glow.x}" cy="${glow.y}" r="${glow.r}">
      <stop offset="0" stop-color="var(--pet-cat-under-0, #ffc79a)" stop-opacity="0.95"/>
      <stop offset="0.3" stop-color="var(--pet-cat-under-1, #d9b8ff)" stop-opacity="0.5"/>
      <stop offset="0.6" stop-color="var(--pet-cat-under-2, #8cc4ff)" stop-opacity="0.18"/>
      <stop offset="1" stop-color="var(--pet-cat-under-2, #7fb8ff)" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="${prefix}-ear" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--pet-cat-ear-0, #d7c2cc)"/>
      <stop offset="1" stop-color="var(--pet-cat-ear-1, #3a3038)"/>
      </linearGradient>
      <linearGradient id="${prefix}-floor" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="var(--pet-cat-floor-1, #ffffff)" stop-opacity="0"/>
      <stop offset="0.3" stop-color="var(--pet-cat-floor-0, #ffe7d2)" stop-opacity="0.9"/>
      <stop offset="0.5" stop-color="var(--pet-cat-floor-1, #ffffff)"/>
      <stop offset="0.7" stop-color="var(--pet-cat-floor-2, #d6ecff)" stop-opacity="0.9"/>
      <stop offset="1" stop-color="var(--pet-cat-floor-1, #ffffff)" stop-opacity="0"/>
      </linearGradient>
      <filter id="${prefix}-bloom" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2"/></filter>`;
  }

  // 贴边姿态：同一团黑麻薯从屏幕右缘探出大半个脑袋，彩虹边缘光勾出轮廓，两只圆爪扒着屏幕边。
  // 左贴边时整张图由 CSS 镜像。
  function renderPeekingCatSvg() {
    const head = 'M56 152 C42 128 48 86 78 72 C100 62 150 62 172 80 L182 152 Z';
    return `
      <svg class="cat-peeking-svg" viewBox="0 0 160 160">
      <title>${T('fp.svgPeek')}</title>
      <defs>${catGlowDefs('rc-peek', {x: 112, y: 156, r: 86})}<clipPath id="rc-peek-clip"><path d="${head}"/></clipPath></defs>
      <g class="peeking-ears">
      <g class="peeking-ear peeking-ear-back">
      <path d="M134 68 L152 46 L162 80 Z" fill="url(#rc-peek-ear)" stroke="url(#rc-peek-rim)" stroke-width="2.4" stroke-linejoin="round"/>
      </g>
      <g class="peeking-ear peeking-ear-front">
      <path d="M68 90 L68 58 L98 72 Z" fill="url(#rc-peek-ear)" stroke="url(#rc-peek-rim)" stroke-width="2.4" stroke-linejoin="round"/>
      </g>
      </g>
      <path d="${head}" fill="none" stroke="url(#rc-peek-rim)" stroke-width="7" style="opacity:var(--pet-cat-bloom, .55)" filter="url(#rc-peek-bloom)"/>
      <path d="${head}" fill="${CAT_BODY}"/>
      <g clip-path="url(#rc-peek-clip)"><rect x="40" y="50" width="150" height="110" fill="url(#rc-peek-under)"/></g>
      <path d="${head}" fill="none" stroke="#ff8fc4" stroke-width="1.4" style="opacity:var(--pet-cat-chroma, .5)" transform="translate(-1 0)"/>
      <path d="${head}" fill="none" stroke="#86dcff" stroke-width="1.4" style="opacity:var(--pet-cat-chroma, .5)" transform="translate(1 0.6)"/>
      <path d="${head}" fill="none" stroke="url(#rc-peek-rim)" stroke-width="2.6"/>
      <path d="${head}" fill="none" stroke="${CAT_LINE}" stroke-width="1.2"/>
      <g class="peeking-eyes-group">
      <g class="peeking-eyes-open" fill="${CAT_FACE}">
      <circle cx="94" cy="110" r="5.4"/>
      <circle cx="134" cy="105" r="5.4"/>
      </g>
      <g class="peeking-eyes-squint" fill="none" stroke="${CAT_FACE}" stroke-width="3" stroke-linecap="round">
      <path d="M88 112 Q94 105 100 112"/>
      <path d="M128 107 Q134 100 140 107"/>
      </g>
      </g>
      <path d="M114 104 v3.2 M109 109 Q112 113.2 115 109.4 Q118 113.2 121 109" fill="none" stroke="${CAT_FACE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <g aria-hidden="true" fill="none" stroke="${CAT_WHISKER_UNDER}" stroke-width="2.6" stroke-linecap="round">
      <line x1="66" y1="118" x2="30" y2="114"/>
      <line x1="66" y1="123" x2="32" y2="126"/>
      <line x1="68" y1="128" x2="38" y2="137"/>
      </g>
      <g class="peeking-whiskers" fill="none" stroke="${CAT_WHISKER}" stroke-width="1.3" stroke-linecap="round" opacity="0.85">
      <line class="whisker whisker-1" x1="66" y1="118" x2="30" y2="114"/>
      <line class="whisker whisker-2" x1="66" y1="123" x2="32" y2="126"/>
      <line class="whisker whisker-3" x1="68" y1="128" x2="38" y2="137"/>
      </g>
      <g class="peeking-paws">
      <g class="peeking-paw paw-upper">
      <path d="M160 112 C148 108 139 115 140 125 C141 133 150 136 160 133 Z" fill="${CAT_BODY}" stroke="url(#rc-peek-rim)" stroke-width="2.2" stroke-linejoin="round"/>
      </g>
      <g class="peeking-paw paw-lower">
      <path d="M160 138 C148 134 139 141 140 151 C141 158 150 160 160 157 Z" fill="${CAT_BODY}" stroke="url(#rc-peek-rim)" stroke-width="2.2" stroke-linejoin="round"/>
      </g>
      </g>
      </svg>
    `;
  }

  // 坐姿：一整团黑麻薯端坐在发光地平线上——尖耳朝外微斜、两个白点眼、ω 嘴、细白胡须，
  // 轮廓是彩虹边缘光加轻微色散，肚子下沿透出暖色反光；小尾巴从右后侧露出一截。
  function renderCatSvg() {
    const body = 'M46 194 C30 176 32 130 56 110 C74 94 126 94 144 110 C168 130 170 176 154 194 C144 202 56 202 46 194 Z';
    return `
      <svg class="cat-svg" viewBox="0 0 200 220">
      <title>${T('fp.svgCat')}</title>
      <defs>${catGlowDefs('rc-cat', {x: 100, y: 200, r: 96})}<clipPath id="rc-cat-clip"><path d="${body}"/></clipPath></defs>
      <g class="cat-ground-shadow">
      <rect x="0" y="194.5" width="200" height="6" rx="3" fill="url(#rc-cat-floor)" filter="url(#rc-cat-bloom)"/>
      <rect x="14" y="196.6" width="172" height="1.8" rx="0.9" fill="url(#rc-cat-floor)"/>
      </g>
      <g class="cat-tail">
      <path d="M152 190 C172 188 182 172 176 158" fill="none" stroke="url(#rc-cat-rim)" stroke-width="12" stroke-linecap="round"/>
      <path d="M152 190 C172 188 182 172 176 158" fill="none" stroke="${CAT_BODY}" stroke-width="7.4" stroke-linecap="round"/>
      </g>
      <g class="cat-ear cat-ear-left">
      <path d="M52 120 L50 82 L82 100 Z" fill="url(#rc-cat-ear)" stroke="url(#rc-cat-rim)" stroke-width="2.6" stroke-linejoin="round"/>
      </g>
      <g class="cat-ear cat-ear-right">
      <path d="M118 100 L150 82 L148 120 Z" fill="url(#rc-cat-ear)" stroke="url(#rc-cat-rim)" stroke-width="2.6" stroke-linejoin="round"/>
      </g>
      <path d="${body}" fill="none" stroke="url(#rc-cat-rim)" stroke-width="8" style="opacity:var(--pet-cat-bloom, .55)" filter="url(#rc-cat-bloom)"/>
      <path d="${body}" fill="${CAT_BODY}"/>
      <g clip-path="url(#rc-cat-clip)"><rect x="0" y="80" width="200" height="130" fill="url(#rc-cat-under)"/></g>
      <path d="${body}" fill="none" stroke="#ff8fc4" stroke-width="1.5" style="opacity:var(--pet-cat-chroma, .5)" transform="translate(-1.2 0)"/>
      <path d="${body}" fill="none" stroke="#86dcff" stroke-width="1.5" style="opacity:var(--pet-cat-chroma, .5)" transform="translate(1.2 0.6)"/>
      <path d="${body}" fill="none" stroke="url(#rc-cat-rim)" stroke-width="2.8"/>
      <path d="${body}" fill="none" stroke="${CAT_LINE}" stroke-width="1.2"/>
      <g class="cat-eyes-group">
      <g class="cat-eyes-open">
      <g class="cat-eye cat-eye-left"><g class="cat-pupil-slot"><circle cx="80" cy="140" r="5.8" fill="${CAT_FACE}"/></g></g>
      <g class="cat-eye cat-eye-right"><g class="cat-pupil-slot"><circle cx="122" cy="135" r="5.8" fill="${CAT_FACE}"/></g></g>
      </g>
      <g class="cat-eyes-squint" fill="none" stroke="${CAT_FACE}" stroke-width="3.2" stroke-linecap="round">
      <path d="M73 142 Q80 134 87 142"/>
      <path d="M115 137 Q122 129 129 137"/>
      </g>
      </g>
      <path d="M102 133 v3.4 M96.5 139 Q99.5 143.5 102.5 139.4 Q105.5 143.5 108.5 139" fill="none" stroke="${CAT_FACE}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <g aria-hidden="true" fill="none" stroke="${CAT_WHISKER_UNDER}" stroke-width="2.6" stroke-linecap="round">
      <line x1="52" y1="150" x2="16" y2="146"/>
      <line x1="52" y1="155" x2="18" y2="158"/>
      <line x1="54" y1="160" x2="24" y2="170"/>
      <line x1="150" y1="122" x2="186" y2="110"/>
      <line x1="150" y1="127" x2="188" y2="122"/>
      <line x1="150" y1="132" x2="184" y2="133"/>
      </g>
      <g class="cat-whiskers" fill="none" stroke="${CAT_WHISKER}" stroke-width="1.3" stroke-linecap="round" opacity="0.85">
      <line x1="52" y1="150" x2="16" y2="146"/>
      <line x1="52" y1="155" x2="18" y2="158"/>
      <line x1="54" y1="160" x2="24" y2="170"/>
      <line x1="150" y1="122" x2="186" y2="110"/>
      <line x1="150" y1="127" x2="188" y2="122"/>
      <line x1="150" y1="132" x2="184" y2="133"/>
      </g>
      </svg>
    `;
  }

  Object.assign(parts, {renderCatSvg, renderPeekingCatSvg});
})();
