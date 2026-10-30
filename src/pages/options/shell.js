/**
 * @file src/pages/options/shell.js
 * 文件职责：设置页静态分区模板——最初从
 *   extension/ui/options.html 机械切片生成（切片脚本已移除）；id/控件契约与原页完全一致。
 * 主要内容：无绑定静态模板（动态内容由 options-controller.js 命令式填充）；侧栏为五个分组，
 *   运行状态（nowStatus）改为主区顶部一行，原底栏的导出按钮并入页头；
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
      <button type="button" id="sidebar-collapse-btn" class="sidebar-collapse-btn" title="${t('opt.collapseSidebar')}" aria-label="${t('opt.collapseSidebar')}">
        <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      </button>
      <div class="sidebar-top-section">
        <!-- Brand Header -->
        <div class="sidebar-brand-lockup" data-purpose="brand-header">
          <div class="sidebar-brand-left">
            <div class="sidebar-brand-icon" id="sidebar-brand-logo" title="${t('common.brand')}">
              <img class="rc-logo-light" src="../icons/roamcat-light.svg" width="26" height="26" alt="${t('common.brand')}" style="border-radius:4px;"><img class="rc-logo-dark" src="../icons/roamcat.svg" width="26" height="26" alt="${t('common.brand')}" style="display:block;border-radius:4px;">
            </div>
            <div class="brand-info-wrap">
              <div class="brand-title-row">
                <span class="brand-title">RoamCat<span class="brand-title-cn"> · ${t('brand.cn')}</span></span>
              </div>
              <div class="brand-meta-row">
                <span class="brand-pro-tag">v0.0.1</span>
                <p class="brand-subtitle">${t('common.brandTagline')}</p>
              </div>
            </div>
          </div>
        </div>
        <label class="sidebar-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15" aria-hidden="true">
            <circle cx="11" cy="11" r="7"></circle>
            <line x1="16.5" y1="16.5" x2="21" y2="21"></line>
          </svg>
          <input id="sidebar-search" type="search" placeholder="${t('opt.searchPlaceholder')}" aria-label="${t('opt.searchPlaceholder')}" autocomplete="off" spellcheck="false">
          <span class="sidebar-search-kbd">Ctrl+K</span>
        </label>
        <p id="sidebar-search-empty" class="sidebar-search-empty" hidden>${t('opt.searchEmpty')}</p>

        <!-- 六个分组：阅读 / 网站 / 视频与直播 / 模型服务 / 词汇与记录 / 更多；组内多个分区由页头的标签切换 -->
        <nav class="sidebar-nav-menu" aria-label="${t('opt.settingsNav')}" data-purpose="nav-menu">
          <div class="nav-group">
            <a href="#assistance" data-group="reading" class="cyber-nav-item" data-tooltip="${t('opt.group5.reading')}">
              <div class="nav-item-left"><span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="17" height="17" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z"></path><path d="M20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z"></path></svg></span><span class="nav-text">${t('opt.group5.reading')}</span></div>
            </a>
            <a href="#sites" data-group="sites" class="cyber-nav-item" data-tooltip="${t('opt.group5.sites')}">
              <div class="nav-item-left"><span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="17" height="17" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"></path></svg></span><span class="nav-text">${t('opt.group5.sites')}</span></div>
            </a>
            <a href="#video" data-group="video" class="cyber-nav-item" data-tooltip="${t('opt.group5.video')}" data-video-feature hidden>
              <div class="nav-item-left"><span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="17" height="17" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"></rect><path d="M10 9.5v5l4.5-2.5z"></path></svg></span><span class="nav-text">${t('opt.group5.video')}</span></div>
            </a>
            <a href="#service" data-group="service" class="cyber-nav-item" data-tooltip="${t('opt.group5.service')}">
              <div class="nav-item-left"><span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="17" height="17" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="3"></rect><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"></path></svg></span><span class="nav-text">${t('opt.group5.service')}</span></div>
            </a>
            <a href="#terms" data-group="vocab" class="cyber-nav-item" data-tooltip="${t('opt.group5.vocab')}">
              <div class="nav-item-left"><span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="17" height="17" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h7"></path></svg></span><span class="nav-text">${t('opt.group5.vocab')}</span></div>
            </a>
            <a href="#privacy" data-group="more" class="cyber-nav-item" data-tooltip="${t('opt.group5.more')}">
              <div class="nav-item-left"><span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="17" height="17" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle></svg></span><span class="nav-text">${t('opt.group5.more')}</span></div>
            </a>
          </div>
        </nav>
      </div>
    </aside>

    <!-- Right Main Panel -->
`;

export const nowStatus = html`
      <!-- 运行状态：阅读 / 模型 / 最近请求 / 伴读猫，一行显示在「阅读」页顶部；模型项直达模型服务，伴读猫项打开随心阅宣言 -->
      <section id="now-status" class="now-status" aria-label="${t('opt.now.aria')}">
        <div class="now-status-item" id="now-reading-item" data-tone="progress">
          <span class="now-status-k">${t('opt.now.reading')}</span>
          <strong id="now-reading">${t('opt.now.readingNone')}</strong>
        </div>
        <a class="now-status-item" id="now-model-item" data-tone="progress" href="#service">
          <span class="now-status-k">${t('opt.now.model')}</span>
          <strong id="now-model">${t('opt.now.modelNone')}</strong>
        </a>
        <div class="now-status-item" id="now-request-item" data-tone="progress">
          <span class="now-status-k">${t('opt.now.request')}</span>
          <strong id="now-request">${t('opt.now.requestOk')}</strong>
        </div>
        <div class="now-status-item now-status-pet" id="sidebar-stamp-card" role="button" tabindex="0" aria-label="${t('opt.stampCardAria')}" title="${t('opt.stampCardTitle')}">
          <span class="now-status-k">${t('opt.stampCat')}</span>
          <strong id="stamp-pet-status" class="stamp-pet-status"><span class="stamp-status-dot" aria-hidden="true"></span><span class="stamp-status-text">${t('opt.stampPet')}</span></strong>
        </div>
      </section>
`;

export const mainToolbar = html`
      <header class="settings-toolbar">
        <div class="toolbar-left">
          <div class="toolbar-breadcrumb">
            <span id="toolbar-category-title">${t('opt.toolbarRoot')}</span>
            <span class="breadcrumb-sep">/</span>
            <span id="toolbar-breadcrumb-title" class="breadcrumb-current">${t('opt.nav.assist')}</span>
          </div>
        </div>
        <div class="toolbar-right">
          <div class="toolbar-meta">
            <div class="toolbar-sync-state">
              <svg class="sync-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true">
                <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
              <span id="save-state" class="save-state" aria-live="polite"></span>
            </div>
          </div>
          <div class="toolbar-switches">
            <button type="button" id="lang-toggle-btn" class="theme-switch-btn" title="${t('opt.langToggleTitle',{lang:t('common.langAuto')})}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              <span id="lang-toggle-label">${t('opt.langBtnLabel', {label: t('common.langAuto')})}</span>
            </button>
            <button type="button" id="theme-toggle-btn" class="theme-switch-btn" title="${t('opt.themeToggleTitle',{theme:t('opt.themeAuto')})}">
              <svg id="theme-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <rect x="2" y="3" width="20" height="14" rx="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
              <span id="theme-toggle-label">${t('opt.themeBtnLabel', {label: t('opt.themeAuto')})}</span>
            </button>
          </div>
        </div>
      </header>

`;

export const heroBlock = html`
        <header id="common-workspace-header" class="compact-hero-banner" data-purpose="hero-header">
          <div class="hero-left">
            <h1 id="section-title" class="hero-title" tabindex="-1">${t('opt.group5.reading')}</h1>
            <p id="hero-desc" class="hero-desc">${t('opt.group5.readingDesc')}</p>
          </div>
          <!-- 原底栏的「导出规则包」：导出的是网站与领域规则，只在「网站」页显示。 -->
          <div class="hero-actions">
            <button type="button" id="footer-export-rules" class="secondary-button hero-export">${t('opt.footerExport')}</button>
          </div>

        </header>
        <p id="global-error" class="notice error" role="alert" hidden></p>

        <!-- ========================================================= -->
        <!-- SIGNATURE SECTION: The Reference Ticket / 随心阅 Stamp Card -->
        <!-- ========================================================= -->
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
          <button type="button" id="stamp-modal-goto-pet" class="secondary-button" style="display:inline-flex;align-items:center;gap:6px;font-size:var(--fs-1, 12px);padding:6px 14px;border-radius:4px;cursor:pointer;">
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
