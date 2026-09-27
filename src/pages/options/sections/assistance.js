/**
 * @file src/pages/options/sections/assistance.js
 * 文件职责：设置页静态分区模板——由 build/split-options.mjs 从
 *   extension/ui/options.html 机械切片生成；id/控件契约与原页完全一致。
 * 主要内容：无绑定静态模板（动态内容由 options-controller.js 命令式填充），
 *   分区可见性由 options-app 统一驱动。
 * 模块边界：纯展示模板。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {html} from 'lit';
import {t} from '../../../i18n-runtime.js';
import {icon} from '../../../components/icons.js';

export const assistanceSection = html`
        <section id="assistance" class="settings-section" aria-labelledby="section-title">
          <!-- Cards Stack -->
          <div class="settings-cards-stack">
            <!-- 1. 辅助方式 (Assistance Trigger Mode) -->
            <div class="swiss-card card-subtle-shadow" data-purpose="setting-block-assistance">
              <div class="swiss-card-header">
                <div>
                  <div class="sec-label-row">
                    <span class="sec-code-badge">01</span>
                    <label class="sec-heading">${t('sec.assist.mode')}</label>
                  </div>
                  <p class="sec-desc">${t('sec.assist.modeDesc')}</p>
                </div>
                <span class="rec-badge">${t('sec.assist.reco')}</span>
              </div>
              <div class="choice-card-grid two-col">
                <!-- Option A: 自动给少量提示 -->
                <label class="choice-card-item is-selected">
                  <input type="radio" name="assistance-mode" value="ambient" checked>
                  <div class="choice-card-content"><span class="choice-illustration art-ambient" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><b></b></span>
                    <div class="choice-card-header">
                      <span class="choice-card-title">${t('sec.assist.auto')}</span>
                      <span class="choice-card-badge cloze">${t('sec.assist.autoBadge')}</span>
                    </div>
                    <p class="choice-card-desc">
                      ${t('sec.assist.autoDesc')}
                    </p>
                  </div>
                </label>
                <!-- Option B: 只在主动求助时 -->
                <label class="choice-card-item">
                  <input type="radio" name="assistance-mode" value="on-demand">
                  <div class="choice-card-content"><span class="choice-illustration art-demand" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><b></b></span>
                    <div class="choice-card-header">
                      <span class="choice-card-title">${t('sec.assist.manual')}</span>
                      <span class="choice-card-badge manual">${t('sec.assist.manualBadge')}</span>
                    </div>
                    <p class="choice-card-desc">
                      ${t('sec.assist.manualDesc')}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <!-- 2. 查词按键 (Lookup Hotkey) -->
            <div class="swiss-card card-subtle-shadow" data-purpose="setting-block-hotkey">
              <div class="hotkey-card-body">
                <div>
                  <div class="sec-label-row">
                    <span class="sec-code-badge">02</span>
                    <label class="sec-heading">${t('sec.assist.key')}</label>
                  </div>
                  <p class="sec-desc">${t('sec.assist.keyDesc')}</p>
                </div>
                <div class="hotkey-control-wrap">
                  <div class="swiss-select-wrap min-w-select">
                    <select id="lookup-key" class="swiss-select">
                      <option>A</option><option>B</option><option>C</option><option selected="">D</option>
                      <option>E</option><option>F</option><option>G</option><option>H</option>
                      <option>I</option><option>J</option><option>K</option><option>L</option>
                      <option>M</option><option>N</option><option>O</option><option>P</option>
                      <option>Q</option><option>R</option><option>S</option><option>T</option>
                      <option>U</option><option>V</option><option>W</option><option>X</option>
                      <option>Y</option><option>Z</option>
                    </select>
                    <div class="swiss-select-arrow">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"></path>
                      </svg>
                    </div>
                  </div>
                  <div id="keycap-badge" class="keycap-box" data-lookup-key title="${t('sec.assist.keyTitle')}">D</div>
                </div>
              </div>
            </div>

            <!-- 3. 查词显示方式 (HUD Style) -->
            <div class="swiss-card card-subtle-shadow" data-purpose="setting-block-display-mode">
              <div class="swiss-card-header">
                <div>
                  <div class="sec-label-row">
                    <span class="sec-code-badge">03</span>
                    <label class="sec-heading">${t('sec.assist.hud')}</label>
                  </div>
                  <p class="sec-desc">${t('sec.assist.hudDesc')}</p>
                </div>
              </div>
              <div class="choice-card-grid two-col">
                <!-- Option A: 解释卡片 -->
                <label class="choice-card-item is-selected">
                  <input type="radio" name="lookup-display" value="card" checked>
                  <div class="choice-card-content"><span class="choice-illustration art-card" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><b></b></span>
                    <div class="choice-card-header">
                      <span class="choice-card-title">${t('sec.assist.card')}</span>
                      <span class="choice-tag-pill popup">${t('sec.assist.cardBadge')}</span>
                    </div>
                    <p class="choice-card-desc">
                      ${t('sec.assist.cardDesc')}
                    </p>
                  </div>
                </label>
                <!-- Option B: 顶部释义 -->
                <label class="choice-card-item">
                  <input type="radio" name="lookup-display" value="annotation">
                  <div class="choice-card-content"><span class="choice-illustration art-annotation" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><b></b></span>
                    <div class="choice-card-header">
                      <span class="choice-card-title">${t('sec.assist.ruby')}</span>
                      <span class="choice-tag-pill ruby">${t('sec.assist.rubyBadge')}</span>
                    </div>
                    <p class="choice-card-desc">
                      ${t('sec.assist.rubyDesc')}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <!-- 4 & 5. 默认领域 & 解释语言 (Two Columns Grid) -->
            <div class="swiss-cards-grid-2" data-purpose="setting-block-domain-language">
              <!-- 默认领域 -->
              <div class="swiss-card card-subtle-shadow">
                <div class="sec-label-row">
                  <span class="sec-code-badge">04</span>
                  <label for="reading-domain" class="sec-heading">${t('sec.assist.domain')}</label>
                </div>
                <p class="sec-desc">${t('sec.assist.domainDesc')}</p>
                <div class="swiss-select-wrap mt-3">
                  <select id="reading-domain" class="swiss-select"></select>
                  <div class="swiss-select-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                      <path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                  </div>
                </div>
              </div>
              <!-- 解释语言 -->
              <div class="swiss-card card-subtle-shadow">
                <div class="sec-label-row">
                  <span class="sec-code-badge">05</span>
                  <label for="help-language" class="sec-heading">${t('sec.assist.lang')}</label>
                </div>
                <p class="sec-desc">${t('sec.assist.langDesc')}</p>
                <div class="swiss-select-wrap mt-3">
                  <select id="help-language" class="swiss-select">
                    <option value="zh">${t('sec.assist.langZh')}</option>
                    <option value="en">${t('sec.assist.langEn')}</option>
                  </select>
                  <div class="swiss-select-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                      <path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <!-- 6. 母语依赖抑制阈值 / 脱敏矩阵控制 (Scientific Desensitization Meter) -->
            <div class="swiss-card card-subtle-shadow" data-purpose="setting-block-reliance-index">
              <div class="swiss-card-header">
                <div>
                  <div class="sec-label-row">
                    <span class="sec-code-badge">06</span>
                    <label class="sec-heading">${t('sec.assist.density')}</label>
                    <span class="phase-badge">${t('sec.assist.densityBadge')}</span>
                  </div>
                  <p class="sec-desc">
                    ${t('sec.assist.densityDesc')}
                  </p>
                </div>
                <!-- Big Ticket Number Percentage -->
                <div class="threshold-stat-display">
                  <span id="threshold-stat-num" class="stat-number">02</span>
                  <span class="stat-unit">${t('sec.assist.level')}</span>
                </div>
              </div>

              <!-- Slider & Discrete Meter Steps -->
              <div class="matrix-meter-wrap">
                <div class="matrix-range-slider-box">
                  <input type="range" id="matrix-index-range" min="1" max="3" step="1" value="2" class="swiss-range-input" aria-label="${t('sec.assist.density')}" aria-valuetext="${t('sec.assist.dMedium')}">
                </div>
                <!-- Scientific Halftone Step Gradient Bar -->
                <div id="matrix-step-gradient" class="matrix-step-gradient-bar" aria-hidden="true"><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span></div>
                <!-- Scale Labels -->
                <div class="matrix-scale-legend">
                  <span>${t('sec.assist.dCoarse')}</span>
                  <span id="matrix-step-badge" class="scale-badge">${t('sec.assist.dMedium')}</span>
                  <span>${t('sec.assist.dFine')}</span>
                </div>
                <p id="detail-meter-result" class="inline-message" aria-live="polite" hidden></p>
              </div>
            </div>

            <!-- 7. 网页伴读猫（悬浮宠物） (RoamCat Floating Pet) -->
            <div id="setting-block-floating-pet" class="swiss-card card-subtle-shadow" data-purpose="setting-block-floating-pet">
              <div class="swiss-card-header">
                <div>
                  <div class="sec-label-row">
                    <span class="sec-code-badge">07</span>
                    <label class="sec-heading">${t('sec.assist.pet')}</label>
                    <span class="phase-badge">${t('sec.assist.petBadge')}</span>
                  </div>
                  <p class="sec-desc">
                    ${t('sec.assist.petDesc')}
                  </p>
                </div>
              </div>
              <div class="pet-card-body">
                <div class="pet-control-row">
                  <div class="pet-control-info">
                    <strong class="pet-control-label">${t('sec.assist.petEnable')}</strong>
                    <span class="pet-control-caption">${t('sec.assist.petEnableDesc')}</span>
                  </div>
                  <label class="switch" title="${t('sec.assist.petSwitch')}">
                    <input id="floating-pet-enabled" type="checkbox" checked>
                    <span aria-hidden="true"></span>
                    <span class="sr-only">${t('sec.assist.petEnable')}</span>
                  </label>
                </div>
                <div class="pet-control-row">
                  <div class="pet-control-info">
                    <strong class="pet-control-label">${t('sec.assist.petTheme')}</strong>
                    <span class="pet-control-caption">${t('sec.assist.petThemeDesc')}</span>
                  </div>
                  <select id="floating-pet-theme" class="swiss-select">
                    <option value="auto">${t('sec.assist.petAuto')}</option>
                    <option value="dark">${t('sec.assist.petDark')}</option>
                    <option value="light">${t('sec.assist.petLight')}</option>
                  </select>
                </div>
                <div class="pet-control-row">
                  <div class="pet-control-info">
                    <strong class="pet-control-label">${t('sec.assist.petQuotes')}</strong>
                    <span class="pet-control-caption">${t('sec.assist.petQuotesDesc')}</span>
                  </div>
                  <div class="pet-quote-controls">
                    <label class="switch" title="${t('sec.assist.petQuotesSwitch')}">
                      <input id="floating-pet-quotes-enabled" type="checkbox" checked>
                      <span aria-hidden="true"></span>
                      <span class="sr-only">${t('sec.assist.petQuotes')}</span>
                    </label>
                    <select id="floating-pet-quotes-interval" class="swiss-select" title="${t('sec.assist.petQuotesInterval')}">
                      <option value="15">${t('sec.assist.pet15')}</option>
                      <option value="30">${t('sec.assist.pet30')}</option>
                      <option value="60">${t('sec.assist.pet60')}</option>
                    </select>
                  </div>
                </div>
                <div class="pet-feature-tags">
                  <span class="pet-tag"><span class="pet-tag-icon">${icon('paw', {size: 13})}</span> ${t('sec.assist.petTagDock')}</span>
                  <span class="pet-tag"><span class="pet-tag-icon">${icon('languages', {size: 13})}</span> ${t('sec.assist.petTagFlip')}</span>
                  <span class="pet-tag"><span class="pet-tag-icon">${icon('file-text', {size: 13})}</span> ${t('sec.assist.petTagDigest')}</span>
                  <span class="pet-tag"><span class="pet-tag-icon">${icon('keyboard', {size: 13})}</span> ${t('sec.assist.petTagKey')}</span>
                </div>
                <div class="pet-footer-row">
                  <span class="pet-hint-text">${t('sec.assist.petResetHint')}</span>
                  <button type="button" id="floating-pet-reset-pos" class="secondary-button pet-reset-btn">${t('sec.assist.petReset')}</button>
                </div>
              </div>
            </div>

            <!-- 8. 阅读增强（长难句/公式/PDF·电子书） -->
            <div class="swiss-card card-subtle-shadow" data-purpose="setting-block-reading-boost">
              <div class="swiss-card-header">
                <div>
                  <div class="sec-label-row">
                    <span class="sec-code-badge">08</span>
                    <label class="sec-heading">${t('sec.assist.enhance')}</label>
                    <span class="phase-badge">${t('sec.assist.enhanceBadge')}</span>
                  </div>
                  <p class="sec-desc">
                    ${t('sec.assist.enhanceDesc')}
                  </p>
                </div>
              </div>
              <div class="pet-card-body">
                <div class="pet-control-row">
                  <div class="pet-control-info">
                    <strong class="pet-control-label">${t('sec.assist.hard')}</strong>
                    <span class="pet-control-caption">${t('sec.assist.hardDesc')}</span>
                  </div>
                  <label class="switch" title="${t('sec.assist.hardSwitch')}">
                    <input id="complex-assist-enabled" type="checkbox" checked>
                    <span aria-hidden="true"></span>
                    <span class="sr-only">${t('sec.assist.hard')}</span>
                  </label>
                </div>
                <div class="pet-control-row">
                  <div class="pet-control-info">
                    <strong class="pet-control-label">${t('sec.assist.formula')}</strong>
                    <span class="pet-control-caption">${t('sec.assist.formulaDesc')}</span>
                  </div>
                  <label class="switch" title="${t('sec.assist.formulaSwitch')}">
                    <input id="formula-assist-enabled" type="checkbox" checked>
                    <span aria-hidden="true"></span>
                    <span class="sr-only">${t('sec.assist.formula')}</span>
                  </label>
                </div>
                <div class="pet-control-row">
                  <div class="pet-control-info">
                    <strong class="pet-control-label">${t('sec.assist.reader')}</strong>
                    <span class="pet-control-caption">${t('sec.assist.readerDesc')}</span>
                  </div>
                  <div class="pet-quote-controls">
                    <label class="switch" title="${t('sec.assist.readerSwitch')}">
                      <input id="pdf-reader-enabled" type="checkbox" checked>
                      <span aria-hidden="true"></span>
                      <span class="sr-only">${t('sec.assist.reader')}</span>
                    </label>
                    <a class="secondary-button pet-reset-btn" href="reader.html" target="_blank" rel="noopener">${t('sec.assist.readerOpen')}</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

`;
