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
                    <label class="sec-heading">辅助方式</label>
                  </div>
                  <p class="sec-desc">决定 随心阅 引擎在阅读网页时的主动介入节奏与线索干预强度。</p>
                </div>
                <span class="rec-badge">推荐</span>
              </div>
              <div class="choice-card-grid two-col">
                <!-- Option A: 自动给少量提示 -->
                <label class="choice-card-item is-selected">
                  <input type="radio" name="assistance-mode" value="ambient" checked>
                  <div class="choice-card-content"><span class="choice-illustration art-ambient" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><b></b></span>
                    <div class="choice-card-header">
                      <span class="choice-card-title">自动给少量提示</span>
                      <span class="choice-card-badge cloze">自动</span>
                    </div>
                    <p class="choice-card-desc">
                      在阅读焦点位置给少量线索，通过轻量级遮罩与关键语境标记辅助，不打破连续阅读心流。
                    </p>
                  </div>
                </label>
                <!-- Option B: 只在主动求助时 -->
                <label class="choice-card-item">
                  <input type="radio" name="assistance-mode" value="on-demand">
                  <div class="choice-card-content"><span class="choice-illustration art-demand" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><b></b></span>
                    <div class="choice-card-header">
                      <span class="choice-card-title">只在主动求助时</span>
                      <span class="choice-card-badge manual">手动</span>
                    </div>
                    <p class="choice-card-desc">
                      完全静默沉浸。停止自动词汇扫描，只响应按住快捷键单击、划词选择或手动求助操作。
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
                    <label class="sec-heading">查词按键</label>
                  </div>
                  <p class="sec-desc">按住所选字母并单击单词；在输入框或可编辑区域按键不会误触发。</p>
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
                  <div id="keycap-badge" class="keycap-box" data-lookup-key title="当前查词按键">D</div>
                </div>
              </div>
            </div>

            <!-- 3. 查词显示方式 (HUD Style) -->
            <div class="swiss-card card-subtle-shadow" data-purpose="setting-block-display-mode">
              <div class="swiss-card-header">
                <div>
                  <div class="sec-label-row">
                    <span class="sec-code-badge">03</span>
                    <label class="sec-heading">查词显示方式</label>
                  </div>
                  <p class="sec-desc">沿用查词按键 + 单击；词语显示方式不影响段落的全局深度翻译。</p>
                </div>
              </div>
              <div class="choice-card-grid two-col">
                <!-- Option A: 解释卡片 -->
                <label class="choice-card-item is-selected">
                  <input type="radio" name="lookup-display" value="card" checked>
                  <div class="choice-card-content"><span class="choice-illustration art-card" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><b></b></span>
                    <div class="choice-card-header">
                      <span class="choice-card-title">解释卡片</span>
                      <span class="choice-tag-pill popup">卡片</span>
                    </div>
                    <p class="choice-card-desc">
                      查看精练简释，并可无缝一键展开详细语境、搭配用例与句法语法重组。
                    </p>
                  </div>
                </label>
                <!-- Option B: 顶部释义 -->
                <label class="choice-card-item">
                  <input type="radio" name="lookup-display" value="annotation">
                  <div class="choice-card-content"><span class="choice-illustration art-annotation" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><b></b></span>
                    <div class="choice-card-header">
                      <span class="choice-card-title">顶部释义</span>
                      <span class="choice-tag-pill ruby">词注</span>
                    </div>
                    <p class="choice-card-desc">
                      类似 Ruby 拼音注解，直接在词语上方微注单行意思，不弹卡片遮挡上下文。
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
                  <label for="reading-domain" class="sec-heading">默认领域</label>
                </div>
                <p class="sec-desc">自动识别时优先读取站点规则，并在本地做出领域判断。</p>
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
                  <label for="help-language" class="sec-heading">解释语言</label>
                </div>
                <p class="sec-desc">词义和语境重组的产出语言；长句对照翻译亦同。</p>
                <div class="swiss-select-wrap mt-3">
                  <select id="help-language" class="swiss-select">
                    <option value="zh">中文 (简体) · 智能语境润色</option>
                    <option value="en">英语（英英释义）</option>
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
                    <label class="sec-heading">句子解构粒度</label>
                    <span class="phase-badge">详细程度</span>
                  </div>
                  <p class="sec-desc">
                    从句子主干到细节层次，选择解构下划线的详细程度。与「显示与解构」中的设置同步。
                  </p>
                </div>
                <!-- Big Ticket Number Percentage -->
                <div class="threshold-stat-display">
                  <span id="threshold-stat-num" class="stat-number">02</span>
                  <span class="stat-unit">/ 03 层级</span>
                </div>
              </div>

              <!-- Slider & Discrete Meter Steps -->
              <div class="matrix-meter-wrap">
                <div class="matrix-range-slider-box">
                  <input type="range" id="matrix-index-range" min="1" max="3" step="1" value="2" class="swiss-range-input" aria-label="句子解构粒度" aria-valuetext="中：显示句子成分">
                </div>
                <!-- Scientific Halftone Step Gradient Bar -->
                <div id="matrix-step-gradient" class="matrix-step-gradient-bar" aria-hidden="true"><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span><span class="matrix-step-cell"></span></div>
                <!-- Scale Labels -->
                <div class="matrix-scale-legend">
                  <span>粗 · 突出主干</span>
                  <span id="matrix-step-badge" class="scale-badge">中 · 显示句子成分</span>
                  <span>细 · 最多两层</span>
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
                    <label class="sec-heading">网页伴读猫（悬浮宠物）</label>
                    <span class="phase-badge">漫游伴读</span>
                  </div>
                  <p class="sec-desc">
                    在网页边缘悬浮一只像素伴读猫，替代生硬的翻译悬浮球。随时为你提炼整篇内容精髓，支持自由拖拽、贴边探头与旋旋翻双语速览。
                  </p>
                </div>
              </div>
              <div class="pet-card-body">
                <div class="pet-control-row">
                  <div class="pet-control-info">
                    <strong class="pet-control-label">启用网页悬浮伴读猫</strong>
                    <span class="pet-control-caption">在所有浏览网页常驻一只伴读猫，提供一键摘要、语境拆解与快捷双语入口。</span>
                  </div>
                  <label class="switch" title="开启或关闭网页悬浮伴读猫">
                    <input id="floating-pet-enabled" type="checkbox" checked>
                    <span aria-hidden="true"></span>
                    <span class="sr-only">启用网页悬浮伴读猫</span>
                  </label>
                </div>
                <div class="pet-control-row">
                  <div class="pet-control-info">
                    <strong class="pet-control-label">伴读猫显示模式</strong>
                    <span class="pet-control-caption">智能感知网页明暗，或固定为暗色模式（白猫/夜间）或亮色模式（黑猫/白昼）。</span>
                  </div>
                  <select id="floating-pet-theme" class="swiss-select">
                    <option value="auto">自动感知（随网页明暗）</option>
                    <option value="dark">固定暗色（高亮白珍珠猫）</option>
                    <option value="light">固定亮色（曜黑黑晶石猫）</option>
                  </select>
                </div>
                <div class="pet-control-row">
                  <div class="pet-control-info">
                    <strong class="pet-control-label">哲学语录</strong>
                    <span class="pet-control-caption">伴读猫在你阅读时偶尔冒泡一句哲学思考（可关闭或调间隔）。</span>
                  </div>
                  <div class="pet-quote-controls">
                    <label class="switch" title="开启或关闭伴读猫哲学语录">
                      <input id="floating-pet-quotes-enabled" type="checkbox" checked>
                      <span aria-hidden="true"></span>
                      <span class="sr-only">伴读猫哲学语录开关</span>
                    </label>
                    <select id="floating-pet-quotes-interval" class="swiss-select" title="哲学语录间隔">
                      <option value="15">15 分钟</option>
                      <option value="30">30 分钟</option>
                      <option value="60">60 分钟</option>
                    </select>
                  </div>
                </div>
                <div class="pet-feature-tags">
                  <span class="pet-tag"><span class="pet-tag-icon">${icon('paw', {size: 13})}</span> 贴边探头姿态</span>
                  <span class="pet-tag"><span class="pet-tag-icon">${icon('languages', {size: 13})}</span> 双击旋旋翻双语</span>
                  <span class="pet-tag"><span class="pet-tag-icon">${icon('file-text', {size: 13})}</span> 一键全篇精粹</span>
                  <span class="pet-tag"><span class="pet-tag-icon">${icon('keyboard', {size: 13})}</span> 快捷键 Alt+Shift+M</span>
                </div>
                <div class="pet-footer-row">
                  <span class="pet-hint-text">如果伴读猫被网页遮挡或拖离可视区，可一键复位：</span>
                  <button type="button" id="floating-pet-reset-pos" class="secondary-button pet-reset-btn">恢复默认停靠位置</button>
                </div>
              </div>
            </div>
          </div>
        </section>

`;
