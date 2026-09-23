/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

function renderPeekingCatSvg() {
  return `
    <svg class="cat-peeking-svg" viewBox="0 0 160 160" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <title>RoamCat · 伴读猫贴边探头姿态</title>
      
      <!-- 1. Ambient Glow Silhouette -->
      <path class="peeking-base-silhouette" d="M160,20 C130,20 102,30 84,46 C68,58 48,70 38,88 C28,106 32,125 46,138 C64,150 94,156 128,158 C144,159 156,160 160,160 Z" opacity="0.08" />

      <!-- 2. Ears (Behind Head) -->
      <g class="peeking-ears">
        <!-- Back Ear (Near border) -->
        <g class="peeking-ear peeking-ear-back">
          <path d="M106,42 L132,8 C134,5 139,6 141,10 L148,38 Z" fill="currentColor" />
          <path d="M114,40 L132,15 L140,36 Z" fill="var(--pet-primary, #f59e0b)" opacity="0.9" />
        </g>
        
        <!-- Front Ear (Perky inner ear tilted forward into page) -->
        <g class="peeking-ear peeking-ear-front">
          <path d="M66,62 L48,22 C46,17 52,14 56,17 L86,48 Z" fill="currentColor" />
          <path d="M66,55 L54,26 L78,46 Z" fill="var(--pet-primary, #f59e0b)" opacity="0.95" />
        </g>
      </g>

      <!-- 3. Head & Cheek (Signature RoamCat Scanline Design) -->
      <g class="peeking-head">
        <!-- Soft Head Base Volume -->
        <path class="peeking-head-bg" d="M160,36 C136,36 108,44 90,56 C72,68 50,78 42,94 C34,109 38,124 50,135 C66,146 94,152 128,154 L160,154 Z" opacity="0.18" />

        <!-- Signature Scanline Bars (Avoid eye zone so eyes stay clean & crisp!) -->
        <g class="peeking-scanlines">
          <!-- Forehead Bars -->
          <rect x="96" y="44" width="64" height="4.5" rx="2.2" />
          <rect x="84" y="52" width="76" height="4.5" rx="2.2" />
          <rect x="74" y="60" width="86" height="4.5" rx="2.2" />
          <rect x="116" y="68" width="44" height="4.5" rx="2.2" />
          <rect x="118" y="76" width="42" height="4.5" rx="2.2" />
          <rect x="118" y="84" width="42" height="4.5" rx="2.2" />
          <rect x="118" y="92" width="42" height="4.5" rx="2.2" />
          <!-- Cheek & Chin Lower Bars -->
          <rect x="42" y="104" width="118" height="4.5" rx="2.2" />
          <rect x="46" y="112" width="114" height="4.5" rx="2.2" />
          <rect x="54" y="120" width="106" height="4.5" rx="2.2" />
          <rect x="68" y="128" width="92" height="4.5" rx="2.2" />
          <rect x="88" y="136" width="72" height="4.5" rx="2.2" />
          <rect x="112" y="144" width="48" height="4.5" rx="2.2" />
        </g>

        <!-- Cute Blushing Cheeks (Warm amber/rose glow) -->
        <ellipse class="peeking-blush" cx="52" cy="110" rx="10" ry="5.5" fill="var(--pet-primary, #f59e0b)" opacity="0.5" />

        <!-- 4. Expressive Eyes Group (Crisp Solid Eyeballs) -->
        <g class="peeking-eyes-group">
          <!-- Open Eyes: Gazing with curiosity into the text -->
          <g class="peeking-eyes-open">
            <!-- Front Eye (Left, large & glossy) -->
            <ellipse cx="64" cy="86" rx="13" ry="16" fill="#ffffff" stroke="currentColor" stroke-width="2.2" />
            <ellipse cx="61.5" cy="86" rx="8.5" ry="12" fill="currentColor" />
            <!-- Double Glossy Catchlights (✨) -->
            <circle cx="58" cy="81" r="4" fill="#ffffff" />
            <circle cx="65" cy="91" r="2.2" fill="#ffffff" />

            <!-- Perspective Eye (Right, slightly smaller in perspective) -->
            <ellipse cx="98" cy="78" rx="10.5" ry="13.5" fill="#ffffff" stroke="currentColor" stroke-width="2" />
            <ellipse cx="95.5" cy="78" rx="7" ry="10" fill="currentColor" />
            <circle cx="93" cy="74" r="3.2" fill="#ffffff" />
            <circle cx="99" cy="82" r="1.8" fill="#ffffff" />
          </g>

          <!-- Squint Eyes: Happy (^ ^) when hovering or petted -->
          <g class="peeking-eyes-squint">
            <path d="M50,88 C58,74 72,74 80,88" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" />
            <path d="M88,80 C95,68 107,68 114,80" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" />
          </g>
        </g>

        <!-- 5. Snout & Mouth -->
        <g class="peeking-snout">
          <!-- Nose (Amber/Gold triangle) -->
          <path d="M72,97 L82,97 L77,103 Z" fill="var(--pet-primary, #f59e0b)" />
          <!-- W Mouth -->
          <path d="M68,103 Q73,108 77,104 Q81,108 85,103" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
        </g>

        <!-- 6. Whiskers (Dynamic twitching) -->
        <g class="peeking-whiskers" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity="0.85">
          <line x1="44" y1="94" x2="10" y2="88" class="whisker whisker-1" />
          <line x1="42" y1="102" x2="6" y2="102" class="whisker whisker-2" />
          <line x1="44" y1="110" x2="12" y2="118" class="whisker whisker-3" />
        </g>
      </g>

      <!-- =======================================================
           7. High-Contrast Paws Clinging on Edge (扒拉在边框上的肉垫猫爪 🐾)
           Anchored firmly at x=160 (The screen border!)
           ======================================================= -->
      <g class="peeking-paws">
        <!-- Upper Paw (上爪) -->
        <g class="peeking-paw paw-upper">
          <!-- Paw Arm / Base Wrapping over edge -->
          <path d="M160,54 C138,54 126,60 124,71 C123,81 131,89 144,91 C152,92 157,92 160,92 Z" fill="var(--pet-surface-elevated, #ffffff)" stroke="currentColor" stroke-width="2.8" stroke-linejoin="round" />
          <!-- Main Palm Pad (肉垫) -->
          <path d="M138,73 C138,67 148,67 148,73 C148,78 138,78 138,73 Z" fill="var(--pet-primary, #f59e0b)" />
          <!-- 3 Cute Rounded Toe Beans (爪尖肉垫) -->
          <circle cx="128" cy="63" r="4.5" fill="var(--pet-primary, #f59e0b)" stroke="currentColor" stroke-width="1.2" />
          <circle cx="123" cy="73" r="5" fill="var(--pet-primary, #f59e0b)" stroke="currentColor" stroke-width="1.2" />
          <circle cx="128" cy="83" r="4.5" fill="var(--pet-primary, #f59e0b)" stroke="currentColor" stroke-width="1.2" />
        </g>

        <!-- Lower Paw (下爪) -->
        <g class="peeking-paw paw-lower">
          <path d="M160,102 C138,102 126,108 124,119 C123,129 131,137 144,139 C152,140 157,140 160,140 Z" fill="var(--pet-surface-elevated, #ffffff)" stroke="currentColor" stroke-width="2.8" stroke-linejoin="round" />
          <path d="M138,121 C138,115 148,115 148,121 C148,126 138,126 138,121 Z" fill="var(--pet-primary, #f59e0b)" />
          <circle cx="128" cy="111" r="4.5" fill="var(--pet-primary, #f59e0b)" stroke="currentColor" stroke-width="1.2" />
          <circle cx="123" cy="121" r="5" fill="var(--pet-primary, #f59e0b)" stroke="currentColor" stroke-width="1.2" />
          <circle cx="128" cy="131" r="4.5" fill="var(--pet-primary, #f59e0b)" stroke="currentColor" stroke-width="1.2" />
        </g>
      </g>
    </svg>
  `;
}

const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>RoamCat Peeking Mode Visual Verification V3</title>
<style>
  :root {
    --pet-primary: #d97706;
    --pet-surface-elevated: #ffffff;
    --pet-ink: #1e293b;
  }
  body {
    margin: 0;
    padding: 30px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f1f5f9;
    color: #0f172a;
  }
  h2 { margin: 0 0 8px 0; font-size: 22px; font-weight: 700; }
  p.subtitle { margin: 0 0 24px 0; color: #64748b; font-size: 14px; }
  
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
    max-width: 900px;
  }
  .card {
    background: #ffffff;
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.06);
    border: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .card.dark-theme {
    background: #0f172a;
    border-color: #1e293b;
    color: #f8fafc;
    --pet-surface-elevated: #1e293b;
    --pet-primary: #f59e0b;
    --pet-ink: #f8fafc;
  }
  .card h3 {
    margin: 0;
    font-size: 15px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .tag {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 999px;
    background: #e2e8f0;
    color: #475569;
  }
  .card.dark-theme .tag {
    background: #334155;
    color: #cbd5e1;
  }
  
  /* Viewport Edge Simulation */
  .viewport-sim {
    position: relative;
    width: 100%;
    height: 150px;
    background: #f8fafc;
    border: 2px solid #cbd5e1;
    border-radius: 10px;
    overflow: hidden;
  }
  .card.dark-theme .viewport-sim {
    background: #090d16;
    border-color: #334155;
  }
  .viewport-sim::before {
    content: '网页正文阅读区域 (Article Content)...';
    position: absolute;
    top: 20px;
    left: 20px;
    color: #94a3b8;
    font-size: 12px;
    font-style: italic;
  }
  .card.dark-theme .viewport-sim::before {
    color: #475569;
  }

  /* Cat Container Mock */
  .mock-pet-host {
    position: absolute;
    bottom: 25px;
    width: 72px;
    height: 72px;
  }
  .mock-pet-host.dock-right {
    right: 0;
  }
  .mock-pet-host.dock-left {
    left: 0;
  }

  /* SVG styling inside host */
  .cat-peeking-svg {
    width: 100%;
    height: 100%;
    display: block;
    color: var(--pet-ink);
    filter: drop-shadow(0 3px 10px rgba(0,0,0,0.18));
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .card.dark-theme .cat-peeking-svg {
    filter: drop-shadow(0 3px 14px rgba(0,0,0,0.6));
  }

  /* Mirroring for left edge docking */
  .mock-pet-host.dock-left .cat-peeking-svg {
    transform: scaleX(-1);
  }

  /* Hover Peek-out demonstration */
  .mock-pet-host.hover-peek.dock-right .cat-peeking-svg {
    transform: translateX(-16px) rotate(-2deg);
  }
  .mock-pet-host.hover-peek.dock-left .cat-peeking-svg {
    transform: scaleX(-1) translateX(-16px) rotate(-2deg);
  }
  
  .peeking-eyes-squint {
    display: none;
  }
  .mock-pet-host.hover-peek .peeking-eyes-open {
    display: none;
  }
  .mock-pet-host.hover-peek .peeking-eyes-squint {
    display: block !important;
  }

  /* Speech bubble mockup */
  .mock-speech {
    position: absolute;
    bottom: calc(100% + 6px);
    right: 0;
    background: var(--pet-surface-elevated, #ffffff);
    border: 1.5px solid #e2e8f0;
    border-radius: 12px;
    padding: 6px 12px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--pet-ink);
    white-space: nowrap;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .card.dark-theme .mock-speech {
    border-color: #334155;
  }
  .mock-pet-host.dock-left .mock-speech {
    right: auto;
    left: 0;
  }

  /* Satellite Orbit Button mockup */
  .mock-orbit-btn {
    position: absolute;
    top: 18px;
    left: -36px;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--pet-surface-elevated);
    border: 1px solid var(--pet-primary);
    box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
  }
  .mock-pet-host.dock-left .mock-orbit-btn {
    left: auto;
    right: -36px;
  }
</style>
</head>
<body>
  <h2>🐾 RoamCat 贴边探头姿态原型 V3 (双眼明亮无遮挡 · 软萌爪爪紧扣)</h2>
  <p class="subtitle">避开眼周扫描线，眼珠通透有神，双爪紧扣屏幕边界，支持左右贴边与悬停互动。</p>

  <div class="grid">
    <!-- 1. Right Dock Idle -->
    <div class="card">
      <h3>
        <span>1. 贴右侧边缘 · 探头待机状态</span>
        <span class="tag">右贴边 · 亮色</span>
      </h3>
      <div class="viewport-sim">
        <div class="mock-pet-host dock-right">
          ${renderPeekingCatSvg()}
        </div>
      </div>
    </div>

    <!-- 2. Right Dock Hover / Peekout -->
    <div class="card">
      <h3>
        <span>2. 贴右侧边缘 · 悬停探出互动</span>
        <span class="tag">探头更深 (^ ^) · 旋旋翻联动</span>
      </h3>
      <div class="viewport-sim">
        <div class="mock-pet-host dock-right hover-peek">
          <div class="mock-speech"><span>在这呢 喵~</span> <span>🐾</span></div>
          <div class="mock-orbit-btn">翻</div>
          ${renderPeekingCatSvg()}
        </div>
      </div>
    </div>

    <!-- 3. Left Dock Idle -->
    <div class="card dark-theme">
      <h3>
        <span>3. 贴左侧边缘 · 探头待机状态</span>
        <span class="tag">左贴边 · 暗色</span>
      </h3>
      <div class="viewport-sim">
        <div class="mock-pet-host dock-left">
          ${renderPeekingCatSvg()}
        </div>
      </div>
    </div>

    <!-- 4. Left Dock Hover / Peekout -->
    <div class="card dark-theme">
      <h3>
        <span>4. 贴左侧边缘 · 悬停探出互动</span>
        <span class="tag">探头更深 (^ ^) · 暗色联动</span>
      </h3>
      <div class="viewport-sim">
        <div class="mock-pet-host dock-left hover-peek">
          <div class="mock-speech"><span>伴读守护中 喵~</span> <span>🐾</span></div>
          <div class="mock-orbit-btn">翻</div>
          ${renderPeekingCatSvg()}
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;

const htmlFile = path.resolve(__dirname, '../preview/pet/peeking-preview.html');
const previewImg = path.resolve(__dirname, '../preview/pet/peeking-mascot-preview.png');
fs.writeFileSync(htmlFile, htmlContent, 'utf8');

(async () => {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 980, height: 600 } });
  await page.goto('file:///' + htmlFile.replace(/\\/g, '/'), { waitUntil: 'load' });
  await page.screenshot({ path: previewImg, fullPage: true });
  await browser.close();
  console.log('SUCCESS: Saved preview V3 to ' + previewImg);
})();
