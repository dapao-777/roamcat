/**
 * @file src/pages/options/shell.js
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
import {heroArt} from '../../components/hero-art.js';

export const shellTop = html`
  <!-- Left Minimalist Swiss Sidebar -->
  <aside class="sidebar" data-purpose="sidebar-navigation">
      <div class="sidebar-top-section">
        <!-- Brand Header -->
        <div class="sidebar-brand-lockup" data-purpose="brand-header">
          <div class="sidebar-brand-left">
            <div class="sidebar-brand-icon" id="sidebar-brand-logo" title="RoamCat · 随心阅">
              <img src="../icons/roamcat.svg" width="30" height="30" alt="RoamCat · 随心阅" style="display:block;border-radius:5px;">
            </div>
            <div class="brand-info-wrap">
              <div class="brand-title-row">
                <span class="brand-title">RoamCat · 随心阅</span>
                <span class="brand-pro-tag">0.2</span>
              </div>
              <p class="brand-subtitle">随心漫游 · 自在阅读</p>
            </div>
          </div>
          <div class="sidebar-header-actions">
            <button type="button" id="sidebar-collapse-btn" class="sidebar-collapse-btn" title="折叠侧边栏" aria-label="折叠侧边栏">
              <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </button>
          </div>
        </div>

        <!-- Navigation Menu -->
        <nav class="sidebar-nav-menu" aria-label="设置导航" data-purpose="nav-menu">
          <!-- Group 1: 核心阅读 / CORE READING -->
          <div class="nav-group">
            <div class="nav-group-header">
              <span>阅读设置</span>
            </div>
            <a href="#assistance" data-section="assistance" class="cyber-nav-item active" data-tooltip="阅读偏好">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                  </svg>
                </span>
                <span class="nav-text">阅读偏好</span>
              </div>
            </a>
            <a href="#appearance" data-section="appearance" class="cyber-nav-item" data-tooltip="显示与解构">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                    <polyline points="2 17 12 22 22 17"></polyline>
                    <polyline points="2 12 12 17 22 12"></polyline>
                  </svg>
                </span>
                <span class="nav-text">显示与解构</span>
              </div>
            </a>
            <a href="#sites" data-section="sites" class="cyber-nav-item" data-tooltip="网站规则">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                  </svg>
                </span>
                <span class="nav-text">网站规则</span>
              </div>
            </a>
            <a href="#advanced" data-section="advanced" class="cyber-nav-item" data-tooltip="领域识别">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                  </svg>
                </span>
                <span class="nav-text">领域识别</span>
              </div>
            </a>
          </div>

          <!-- Group 2: 知识记忆 / MEMORY MATRIX -->
          <div class="nav-group">
            <div class="nav-group-header">
              <span>词汇与记忆</span>
            </div>
            <a href="#terms" data-section="terms" class="cyber-nav-item" data-tooltip="生词记忆矩阵">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
                    <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
                    <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
                    <rect x="3" y="14" width="7" height="7" rx="1.5"></rect>
                  </svg>
                </span>
                <span class="nav-text">生词记忆矩阵</span>
              </div>
            </a>
            <a href="#personalization" data-section="personalization" class="cyber-nav-item" data-tooltip="已认识词与自适应">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                  </svg>
                </span>
                <span class="nav-text">已认识词与自适应</span>
              </div>
            </a>
            <a href="#history" data-section="history" class="cyber-nav-item" data-tooltip="阅读记录">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                </span>
                <span class="nav-text">阅读记录</span>
              </div>
            </a>
            <a href="#privacy" data-section="privacy" class="cyber-nav-item" data-tooltip="数据与隐私">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                </span>
                <span class="nav-text">数据与隐私</span>
              </div>
            </a>
          </div>

          <!-- Group 3: 系统协议 / PROTOCOL & SYS -->
          <div class="nav-group">
            <div class="nav-group-header">
              <span>服务与诊断</span>
            </div>
            <a href="#service" data-section="service" class="cyber-nav-item" data-tooltip="模型服务">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="4" y="4" width="16" height="16" rx="2"></rect>
                    <rect x="9" y="9" width="6" height="6"></rect>
                    <line x1="9" y1="1" x2="9" y2="4"></line>
                    <line x1="15" y1="1" x2="15" y2="4"></line>
                    <line x1="9" y1="20" x2="9" y2="23"></line>
                    <line x1="15" y1="20" x2="15" y2="23"></line>
                    <line x1="20" y1="9" x2="23" y2="9"></line>
                    <line x1="20" y1="14" x2="23" y2="14"></line>
                    <line x1="1" y1="9" x2="4" y2="9"></line>
                    <line x1="1" y1="14" x2="4" y2="14"></line>
                  </svg>
                </span>
                <span class="nav-text">模型服务</span>
              </div>
            </a>
            <a href="#diagnostics" data-section="diagnostics" class="cyber-nav-item" data-tooltip="运行诊断">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="4 17 10 11 4 5"></polyline>
                    <line x1="12" y1="19" x2="20" y2="19"></line>
                  </svg>
                </span>
                <span class="nav-text">运行诊断</span>
              </div>
            </a>
          </div>

          <!-- Group 4: 帮助与说明 / MANUAL & HELP -->
          <div class="nav-group">
            <div class="nav-group-header">
              <span>帮助与说明</span>
            </div>
            <a href="#guide" data-section="guide" class="cyber-nav-item" data-tooltip="快捷键与使用手册">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                    <line x1="6" y1="8" x2="6" y2="8"></line>
                    <line x1="10" y1="8" x2="10" y2="8"></line>
                    <line x1="14" y1="8" x2="14" y2="8"></line>
                    <line x1="18" y1="8" x2="18" y2="8"></line>
                    <line x1="6" y1="12" x2="6" y2="12"></line>
                    <line x1="18" y1="12" x2="18" y2="12"></line>
                    <line x1="10" y1="16" x2="14" y2="16"></line>
                  </svg>
                </span>
                <span class="nav-text">快捷键与使用手册</span>
              </div>
            </a>
          </div>
        </nav>
      </div>

            <!-- Bottom 随心阅 Stamp Card (Free Roam · 漫游猫) -->
      <div class="sidebar-user-card-wrap" data-purpose="user-status-card">
        <div class="nav-group-header stamp-group-header">品牌印记</div>
        <div class="matrix-stamp-card" id="sidebar-stamp-card" aria-label="了解随心阅的设计理念" role="button" tabindex="0" title="随心阅 · 随心漫步 · 点击了解设计寓意" data-tooltip="随心阅">
          <!-- Left: Halftone Dot Matrix Art Container -->
          <div class="stamp-art-box">
            ${heroArt('stamp-tree-svg stamp-cat-svg')}
          </div>

          <!-- Right: Typographic Hierarchy & Rubber Stamp Seal -->
          <div class="stamp-content-wrap">
            <div class="stamp-eyebrow">Ex-Libris</div>
            <div class="stamp-hero-num">漫游猫</div>
            <div class="stamp-meta-info"><span class="stamp-meta-title">陪你自在阅读</span></div>
            <div class="stamp-pet-status" id="stamp-pet-status"><span class="stamp-status-dot" aria-hidden="true"></span><span class="stamp-status-text">伴读猫</span></div>
          </div>

          <!-- Circular Rubber Stamp (钢印/邮戳) -->
          <span class="stamp-seal-badge" aria-hidden="true">
            <svg class="stamp-seal-svg" viewBox="0 0 56 56" fill="none">
              <defs><path id="stamp-seal-ring" d="M28 28 m -18.5 0 a 18.5 18.5 0 1 1 37 0 a 18.5 18.5 0 1 1 -37 0"/></defs>
              <circle cx="28" cy="28" r="26" stroke="currentColor" stroke-width="1.4"/>
              <circle cx="28" cy="28" r="13.5" stroke="currentColor" stroke-width="0.7" stroke-dasharray="1.2 2.2"/>
              <text font-size="5.6" letter-spacing="1.7" fill="currentColor" font-family="var(--font-mono, monospace)"><textPath href="#stamp-seal-ring">ROAMCAT · FREE ROAM · 随心阅 ·</textPath></text>
              <path d="M28 21.5 l1.6 4.9 4.9 1.6 -4.9 1.6 -1.6 4.9 -1.6 -4.9 -4.9 -1.6 4.9 -1.6 z" fill="currentColor"/>
            </svg>
          </span>
        </div>
      </div>
    </aside>

    <!-- Right Main Panel -->
`;

export const mainToolbar = html`
      <header class="settings-toolbar">
        <div class="toolbar-left">
          <div class="toolbar-breadcrumb">
            <span id="toolbar-category-title">设置</span>
            <span class="breadcrumb-sep">/</span>
            <span id="toolbar-breadcrumb-title" class="breadcrumb-current">阅读偏好</span>
          </div>
          <span class="toolbar-divider">|</span>
          <span class="toolbar-engine-badge">
            <span class="engine-pulse-dot"></span>
            本地优先
          </span>
        </div>
        <div class="toolbar-right">
          <div class="toolbar-sync-state">
            <svg class="sync-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true">
              <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
            <span id="save-state" class="save-state" aria-live="polite">偏好设置</span>
          </div>
          <div class="theme-switch-wrap">
            <button type="button" id="theme-toggle-btn" class="theme-switch-btn" title="当前主题: 跟随系统 (点击切换)">
              <svg id="theme-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <rect x="2" y="3" width="20" height="14" rx="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
              <span id="theme-toggle-label">跟随系统</span>
            </button>
          </div>
          <button type="button" id="preview-hud-btn" class="preview-hud-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true">
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke-linecap="round" stroke-linejoin="round"></path>
              <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
            <span>实时效果预览</span>
          </button>
        </div>
      </header>

`;

export const heroBlock = html`
        <header id="common-workspace-header" class="compact-hero-banner" data-purpose="hero-header">
          <div class="hero-left">
            <div class="hero-tag-row">
              <span id="hero-category-badge" class="hero-pill-badge">阅读设置</span>
              <span id="hero-stage-badge" class="hero-stage-chip">按你的节奏阅读</span>
            </div>
            <h1 id="section-title" class="hero-title" tabindex="-1">阅读偏好设置</h1>
            <p id="hero-desc" class="hero-desc">少一点打断，多一点理解。选择适合你的提示方式，留住阅读的节奏。</p>
          </div>

          <aside class="hero-right-card reading-readout" aria-label="当前阅读偏好">
            <div class="readout-heading"><span class="readout-status-pill">当前生效</span><span class="readout-live-tag">实时同步</span></div>
            <div class="readout-main"><kbd class="readout-key" data-lookup-key>D</kbd><div><strong class="readout-action">快捷查词</strong><span class="readout-caption">按住按键，单击单词</span></div></div>
            <dl class="readout-footer"><div><dt>辅助方式</dt><dd id="readout-mode">自动少量提示</dd></div><div><dt>释义显示</dt><dd id="readout-display">解释卡片</dd></div></dl>
          </aside>
        </header>
        <p id="global-error" class="notice error" role="alert" hidden></p>

        <!-- ========================================================= -->
        <!-- SIGNATURE SECTION: The Reference Ticket / 随心阅 Stamp Card -->
        <!-- ========================================================= -->
`;

export const telemetryFooter = html`
      <!-- Global Bottom Telemetry Bar -->
      <footer class="telemetry-bar" data-purpose="telemetry-footer">
        <div class="telemetry-left">
          <span class="telemetry-brand">RoamCat · 随心阅</span>
          <span class="telemetry-sep">·</span>
          <span>偏好保存在本机</span>
          
        </div>
        <div class="telemetry-right">
          <button type="button" id="footer-reset-config" class="telemetry-btn">恢复至初始配置</button>
          <span class="telemetry-sep-pipe">|</span>
          <button type="button" id="footer-export-rules" class="telemetry-btn-export">导出规则包 (.json) &gt;</button>
        </div>
      </footer>
`;

export const shellDialog = html`
    <!-- 随心阅 Free Roam Manifesto Modal -->
    <dialog id="stamp-manifesto-modal" class="stamp-manifesto-dialog">
      <div class="stamp-dialog-backdrop" id="stamp-modal-backdrop"></div>
      <div class="stamp-dialog-body">
        <div class="stamp-dialog-header">
          <div class="stamp-dialog-badge">随心漫游</div>
          <button type="button" class="stamp-dialog-close" id="stamp-modal-close" aria-label="关闭">&times;</button>
        </div>
        <div class="stamp-dialog-main">
          <div class="stamp-dialog-art-preview">
            ${heroArt('stamp-tree-svg stamp-cat-svg')}
          </div>
          <div class="stamp-dialog-info">
            <h3 class="stamp-dialog-title">漫游猫 · 随心而阅</h3>
            <p class="stamp-dialog-desc">
              猫，生来随心而行。它不为整张地图焦虑，只在自己需要的位置落下脚步；走过的地方，便不再需要回头张望。
            </p>
            <p class="stamp-dialog-desc">
              而在外文阅读的数字世界中，<strong>“一键全页机翻”就像一根一直牵着你的绳索</strong>——虽然快捷，却会带来隐蔽的母语依赖，让阅读者逐渐丧失对真实英文语料的自治理解力。
            </p>
            <p class="stamp-dialog-desc">
              <strong>RoamCat · 随心阅 的核心使命</strong>：以扫描线像素猫与点阵漫游轨迹为设计隐喻，通过「无感渐退的词注脚手架」与「主干句法解构」，助你像猫一样在真实语境中随心漫步，走自己的路，重获原版阅读的自由。
            </p>
            <div class="stamp-dialog-tags">
              <span class="stamp-pill">#扫描线猫</span>
              <span class="stamp-pill">#认知自治</span>
              <span class="stamp-pill">#自适应退火</span>
              <span class="stamp-pill">#随心漫游</span>
            </div>
          </div>
        </div>
        <div class="stamp-dialog-footer">
          <button type="button" id="stamp-modal-goto-pet" class="secondary-button" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:6px 14px;border-radius:4px;cursor:pointer;">
            <span>前往伴读猫设置 🐾</span>
          </button>
          <button type="button" class="js-open-welcome stamp-dialog-link">
            <span>打开新手引导沙盒</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </button>
          <button type="button" class="primary-action stamp-dialog-confirm" id="stamp-modal-confirm">我已明晰</button>
        </div>
      </div>
    </dialog>
`;
