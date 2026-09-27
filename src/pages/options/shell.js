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
import {icon} from '../../components/icons.js';
import {t} from '../../i18n-runtime.js';

export const shellTop = html`
  <!-- Left Minimalist Swiss Sidebar -->
  <aside class="sidebar" data-purpose="sidebar-navigation">
      <div class="sidebar-top-section">
        <!-- Brand Header -->
        <div class="sidebar-brand-lockup" data-purpose="brand-header">
          <div class="sidebar-brand-left">
            <div class="sidebar-brand-icon" id="sidebar-brand-logo" title="${t('common.brand')}">
              <img src="../icons/roamcat.svg" width="26" height="26" alt="${t('common.brand')}" style="display:block;border-radius:4px;">
              <span class="brand-live-dot" aria-hidden="true"></span>
            </div>
            <div class="brand-info-wrap">
              <div class="brand-title-row">
                <span class="brand-title">RoamCat<span class="brand-title-cn"> · ${t('brand.cn')}</span></span>
                <span class="brand-pro-tag">v0.2</span>
              </div>
              <p class="brand-subtitle">${t('common.brandTagline')}</p>
            </div>
          </div>
          <div class="sidebar-header-actions">
            <button type="button" id="sidebar-collapse-btn" class="sidebar-collapse-btn" title="${t('opt.collapseSidebar')}" aria-label="${t('opt.collapseSidebar')}">
              <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </button>
          </div>
        </div>

        <!-- Navigation Menu -->
        <nav class="sidebar-nav-menu" aria-label="${t('opt.settingsNav')}" data-purpose="nav-menu">
          <!-- Group 1: 核心阅读 / CORE READING -->
          <div class="nav-group">
            <div class="nav-group-header">
              <span>${t('opt.group.reading')}</span>
            </div>
            <a href="#assistance" data-section="assistance" class="cyber-nav-item active" data-tooltip="${t('opt.nav.assist')}">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                  </svg>
                </span>
                <span class="nav-text">${t('opt.nav.assist')}</span>
              </div>
            </a>
            <a href="#appearance" data-section="appearance" class="cyber-nav-item" data-tooltip="${t('opt.nav.appearance')}">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                    <polyline points="2 17 12 22 22 17"></polyline>
                    <polyline points="2 12 12 17 22 12"></polyline>
                  </svg>
                </span>
                <span class="nav-text">${t('opt.nav.appearance')}</span>
              </div>
            </a>
            <a href="#sites" data-section="sites" class="cyber-nav-item" data-tooltip="${t('opt.nav.sites')}">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                  </svg>
                </span>
                <span class="nav-text">${t('opt.nav.sites')}</span>
              </div>
            </a>
            <a href="#advanced" data-section="advanced" class="cyber-nav-item" data-tooltip="${t('opt.nav.advanced')}">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                  </svg>
                </span>
                <span class="nav-text">${t('opt.nav.advanced')}</span>
              </div>
            </a>
          </div>

          <!-- Group 2: 知识记忆 / MEMORY MATRIX -->
          <div class="nav-group">
            <div class="nav-group-header">
              <span>${t('opt.group.memory')}</span>
            </div>
            <a href="#terms" data-section="terms" class="cyber-nav-item" data-tooltip="${t('opt.nav.terms')}">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
                    <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
                    <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
                    <rect x="3" y="14" width="7" height="7" rx="1.5"></rect>
                  </svg>
                </span>
                <span class="nav-text">${t('opt.nav.terms')}</span>
              </div>
            </a>
            <a href="#personalization" data-section="personalization" class="cyber-nav-item" data-tooltip="${t('opt.nav.personalization')}">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                  </svg>
                </span>
                <span class="nav-text">${t('opt.nav.personalization')}</span>
              </div>
            </a>
            <a href="#history" data-section="history" class="cyber-nav-item" data-tooltip="${t('opt.nav.history')}">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                </span>
                <span class="nav-text">${t('opt.nav.history')}</span>
              </div>
            </a>
            <a href="#privacy" data-section="privacy" class="cyber-nav-item" data-tooltip="${t('opt.nav.privacy')}">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                </span>
                <span class="nav-text">${t('opt.nav.privacy')}</span>
              </div>
            </a>
          </div>

          <!-- Group 3: 系统协议 / PROTOCOL & SYS -->
          <div class="nav-group">
            <div class="nav-group-header">
              <span>${t('opt.group.system')}</span>
            </div>
            <a href="#service" data-section="service" class="cyber-nav-item" data-tooltip="${t('opt.nav.model')}">
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
                <span class="nav-text">${t('opt.nav.model')}</span>
              </div>
            </a>
            <a href="#diagnostics" data-section="diagnostics" class="cyber-nav-item" data-tooltip="${t('opt.nav.diagnostics')}">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="4 17 10 11 4 5"></polyline>
                    <line x1="12" y1="19" x2="20" y2="19"></line>
                  </svg>
                </span>
                <span class="nav-text">${t('opt.nav.diagnostics')}</span>
              </div>
            </a>
          </div>

          <!-- Group 4: 帮助与说明 / MANUAL & HELP -->
          <div class="nav-group">
            <div class="nav-group-header">
              <span>${t('opt.group.help')}</span>
            </div>
            <a href="#shortcuts" data-section="shortcuts" class="cyber-nav-item" data-tooltip="${t('opt.nav.shortcuts')}">
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
                <span class="nav-text">${t('opt.nav.shortcuts')}</span>
              </div>
            </a>
            <a href="#guide" data-section="guide" class="cyber-nav-item" data-tooltip="${t('opt.nav.guide')}">
              <div class="nav-item-left">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                  </svg>
                </span>
                <span class="nav-text">${t('opt.nav.guide')}</span>
              </div>
            </a>
          </div>
        </nav>
      </div>

            <!-- Bottom 随心阅 Stamp Card (Free Roam · 漫游猫) -->
      <div class="sidebar-user-card-wrap" data-purpose="user-status-card">
        <div class="nav-group-header stamp-group-header">${t('opt.brandSeal')}</div>
        <div class="matrix-stamp-card" id="sidebar-stamp-card" aria-label="${t('opt.stampCardAria')}" role="button" tabindex="0" title="${t('opt.stampCardTitle')}" data-tooltip="${t('opt.stampTooltip')}">
          <!-- Left: Halftone Dot Matrix Art Container -->
          <div class="stamp-art-box">
            ${heroArt('stamp-tree-svg stamp-cat-svg')}
          </div>

          <!-- Right: Typographic Hierarchy & Rubber Stamp Seal -->
          <div class="stamp-content-wrap">
            <div class="stamp-eyebrow">Ex-Libris</div>
            <div class="stamp-hero-num">${t('opt.stampCat')}</div>
            <div class="stamp-meta-info"><span class="stamp-meta-title">${t('opt.stampMotto')}</span></div>
            <div class="stamp-pet-status" id="stamp-pet-status"><span class="stamp-status-dot" aria-hidden="true"></span><span class="stamp-status-text">${t('opt.stampPet')}</span></div>
          </div>

          <!-- Circular Rubber Stamp (钢印/邮戳) -->
          <span class="stamp-seal-badge" aria-hidden="true">
            <svg class="stamp-seal-svg" viewBox="0 0 56 56" fill="none">
              <defs><path id="stamp-seal-ring" d="M28 28 m -18.5 0 a 18.5 18.5 0 1 1 37 0 a 18.5 18.5 0 1 1 -37 0"/></defs>
              <circle cx="28" cy="28" r="26" stroke="currentColor" stroke-width="1.4"/>
              <circle cx="28" cy="28" r="13.5" stroke="currentColor" stroke-width="0.7" stroke-dasharray="1.2 2.2"/>
              <text font-size="5.6" letter-spacing="1.7" fill="currentColor" font-family="var(--font-display, monospace)"><textPath href="#stamp-seal-ring">ROAMCAT · FREE ROAM · 随心阅 ·</textPath></text>
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
            <span id="toolbar-category-title">${t('opt.toolbarRoot')}</span>
            <span class="breadcrumb-sep">/</span>
            <span id="toolbar-breadcrumb-title" class="breadcrumb-current">${t('opt.nav.assist')}</span>
          </div>
          <span class="toolbar-divider">|</span>
          <span class="toolbar-engine-badge">
            <span class="engine-pulse-dot"></span>
            ${t('common.localOnly')}
          </span>
        </div>
        <div class="toolbar-right">
          <div class="toolbar-sync-state">
            <svg class="sync-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true">
              <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
            <span id="save-state" class="save-state" aria-live="polite">${t('opt.saveState')}</span>
          </div>
          <div class="theme-switch-wrap">
            <button type="button" id="theme-toggle-btn" class="theme-switch-btn" title="${t('opt.themeToggleTitle',{theme:t('opt.themeAuto')})}">
              <svg id="theme-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <rect x="2" y="3" width="20" height="14" rx="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
              <span id="theme-toggle-label">${t('opt.themeBtnLabel', {label: t('opt.themeAuto')})}</span>
            </button>
          </div>
          <div class="theme-switch-wrap">
            <button type="button" id="lang-toggle-btn" class="theme-switch-btn" title="${t('opt.langToggleTitle',{lang:t('common.langAuto')})}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              <span id="lang-toggle-label">${t('opt.langBtnLabel', {label: t('common.langAuto')})}</span>
            </button>
          </div>
          <button type="button" id="preview-hud-btn" class="preview-hud-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true">
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke-linecap="round" stroke-linejoin="round"></path>
              <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
            <span>${t('opt.previewHud')}</span>
          </button>
        </div>
      </header>

`;

export const heroBlock = html`
        <header id="common-workspace-header" class="compact-hero-banner" data-purpose="hero-header">
          <div class="hero-left">
            <div class="hero-tag-row">
              <span id="hero-category-badge" class="hero-pill-badge">${t('opt.group.reading')}</span>
              <span id="hero-stage-badge" class="hero-stage-chip">${t('opt.heroStage')}</span>
            </div>
            <h1 id="section-title" class="hero-title" tabindex="-1">${t('opt.meta.assistance.title')}</h1>
            <p id="hero-desc" class="hero-desc">${t('opt.meta.assistance.desc')}</p>
          </div>

          <aside class="hero-right-card reading-readout" aria-label="${t('opt.readoutAria')}">
            <div class="readout-heading"><span class="readout-status-pill">${t('opt.readoutActive')}</span><span class="readout-live-tag">${t('opt.readoutLive')}</span></div>
            <div class="readout-main"><kbd class="readout-key" data-lookup-key>D</kbd><div><strong class="readout-action">${t('opt.readoutAction')}</strong><span class="readout-caption">${t('opt.readoutActionHint')}</span></div></div>
            <dl class="readout-footer"><div><dt>${t('opt.readoutMode')}</dt><dd id="readout-mode">${t('opt.readoutModeAuto')}</dd></div><div><dt>${t('opt.readoutGloss')}</dt><dd id="readout-display">${t('opt.readoutGlossCard')}</dd></div></dl>
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
          <span class="telemetry-brand">${t('common.brand')}</span>
          <span class="telemetry-sep">·</span>
          <span>${t('opt.footerLocal')}</span>
          
        </div>
        <div class="telemetry-right">
          <button type="button" id="footer-reset-config" class="telemetry-btn">${t('opt.footerReset')}</button>
          <span class="telemetry-sep-pipe">|</span>
          <button type="button" id="footer-export-rules" class="telemetry-btn-export">${t('opt.footerExport')}</button>
        </div>
      </footer>
`;

export const shellDialog = html`
    <!-- 随心阅 Free Roam Manifesto Modal -->
    <dialog id="stamp-manifesto-modal" class="stamp-manifesto-dialog">
      <div class="stamp-dialog-backdrop" id="stamp-modal-backdrop"></div>
      <div class="stamp-dialog-body">
        <div class="stamp-dialog-header">
          <div class="stamp-dialog-badge">${t('opt.stampBadge')}</div>
          <button type="button" class="stamp-dialog-close" id="stamp-modal-close" aria-label="${t('common.close')}">&times;</button>
        </div>
        <div class="stamp-dialog-main">
          <div class="stamp-dialog-art-preview">
            ${heroArt('stamp-tree-svg stamp-cat-svg')}
          </div>
          <div class="stamp-dialog-info">
            <h3 class="stamp-dialog-title">${t('opt.stampTitle')}</h3>
            <p class="stamp-dialog-desc">
              ${t('opt.stampP1')}
            </p>
            <p class="stamp-dialog-desc">
              ${t('opt.stampP2a')}<strong>${t('opt.stampP2strong')}</strong>${t('opt.stampP2b')}
            </p>
            <p class="stamp-dialog-desc">
              <strong>${t('opt.stampP3strong')}</strong>${t('opt.stampP3b')}
            </p>
            <div class="stamp-dialog-tags">
              <span class="stamp-pill">${t('opt.stampPill1')}</span>
              <span class="stamp-pill">${t('opt.stampPill2')}</span>
              <span class="stamp-pill">${t('opt.stampPill3')}</span>
              <span class="stamp-pill">${t('opt.stampPill4')}</span>
            </div>
          </div>
        </div>
        <div class="stamp-dialog-footer">
          <button type="button" id="stamp-modal-goto-pet" class="secondary-button" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:6px 14px;border-radius:4px;cursor:pointer;">
            ${icon('paw', {size: 14})}<span>${t('opt.stampGotoPet')}</span>
          </button>
          <button type="button" class="js-open-welcome stamp-dialog-link">
            <span>${t('opt.stampSandbox')}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </button>
          <button type="button" class="primary-action stamp-dialog-confirm" id="stamp-modal-confirm">${t('opt.stampConfirm')}</button>
        </div>
      </div>
    </dialog>
`;
