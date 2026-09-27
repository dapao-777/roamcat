/**
 * @file src/pages/reader/reader-app.js
 * 文件职责：PDF/EPUB 阅读器——解包为阅读块流、侧栏目录导航、按批次调用 READER_TRANSLATE
 *   做块级双语翻译；本地文件经文件选择器、远程 PDF 经 ?src= 参数与导航重定向进入。
 * 主要内容：loadPdf（pdfjs worker）、parseEpub（fflate + 轻量 XML）、translationBatches
 *   与后台 normalizeEmergencyItems 契约一致（1–4 项 / ≤12000 字符）。
 * 模块边界：扩展页受信上下文；文档内容只经 request() 交给既有翻译管线，
 *   不自行访问模型、不落盘（翻译结果随页面会话存续）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {LitElement, html} from 'lit';
import {request} from '@ext/shared.js';
import {loadPdf} from './pdf-loader.js';
import {parseEpub} from './epub-package.mjs';
import {translationBatches} from './pdf-blocks.mjs';
import {heroArt} from '../../components/hero-art.js';
import '../../components/rc-switch.js';
import {t} from '../../i18n-runtime.js';

const ENGLISH_RE = /[A-Za-z]/u;

export class RoamcatReader extends LitElement {
  static properties = {
    view: {state: true},
    error: {state: true},
    title: {state: true},
    kind: {state: true},
    sidebar: {state: true},
    blocks: {state: true},
    translations: {state: true},
    bilingual: {state: true},
    progress: {state: true},
    translating: {state: true}
  };
  createRenderRoot() { return this; }
  constructor() {
    super();
    this.view = 'empty';
    this.error = '';
    this.title = '';
    this.kind = '';
    this.sidebar = [];
    this.blocks = [];
    this.translations = new Map();
    this.bilingual = true;
    this.progress = '';
    this._nextId = 1;
  }

  firstUpdated() {
    const src = new URLSearchParams(location.search).get('src');
    if (src) void this.openRemote(src);
  }

  async openRemote(url) {
    this.view = 'loading';
    this.progress = t('rd.downloading');
    try {
      const response = await fetch(url, {credentials: 'omit'});
      if (!response.ok) throw new Error(t('rd.dlFail',{status:response.status}));
      const data = new Uint8Array(await response.arrayBuffer());
      const name = decodeURIComponent(new URL(url).pathname.split('/').at(-1) || 'document.pdf');
      await this.openData(data, name);
    } catch (error) {
      this.error = t('rd.remoteFail',{err:error?.message || error});
      this.view = 'error';
    }
  }

  async openFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    this.view = 'loading';
    this.progress = t('rd.reading');
    try {
      await this.openData(new Uint8Array(await file.arrayBuffer()), file.name);
    } catch (error) {
      this.error = t('rd.openFail',{err:error?.message || error});
      this.view = 'error';
    }
  }

  async openData(data, name) {
    this.blocks = [];
    this.translations = new Map();
    if (data.length > 64 * 1024 * 1024) throw new Error(t('rd.tooLarge'));
    const isPdf = data.length > 4 && data[0] === 0x25 && data[1] === 0x50; // %PDF
    const isZip = data.length > 4 && data[0] === 0x50 && data[1] === 0x4b; // PK
    if (isPdf || /\.pdf$/iu.test(name)) return this.openPdf(data, name);
    if (isZip || /\.epub$/iu.test(name)) return this.openEpub(data, name);
    throw new Error(t('rd.unsupported'));
  }

  async openPdf(data, name) {
    const pdf = await loadPdf({data, name}, (done, total) => { this.progress = t('rd.parsingPdf',{done,total}); });
    const sidebar = [], blocks = [];
    for (const page of pdf.pages) {
      const anchor = 'sec-p' + page.number;
      sidebar.push({anchor, label: t('rd.pageN',{n:page.number})});
      for (const block of page.blocks) {
        blocks.push({id: 'b' + this._nextId++, anchor: page.blocks.indexOf(block) === 0 ? anchor : '', ...block});
      }
    }
    this.finishLoad(pdf.title, 'pdf', sidebar, blocks);
  }

  openEpub(data, name) {
    this.progress = t('rd.parsingEpub');
    const book = parseEpub(data);
    const sidebar = [], blocks = [];
    book.chapters.forEach((chapter, index) => {
      const anchor = 'sec-c' + index;
      sidebar.push({anchor, label: chapter.label});
      chapter.blocks.forEach((block, offset) => {
        blocks.push({id: 'b' + this._nextId++, anchor: offset === 0 ? anchor : '', ...block});
      });
    });
    this.finishLoad(book.title + (book.creator ? ' · ' + book.creator : ''), 'epub', sidebar, blocks);
  }

  finishLoad(title, kind, sidebar, blocks) {
    if (!blocks.length) { this.error = t('rd.noText'); this.view = 'error'; return; }
    this.title = title;
    this.kind = kind;
    this.sidebar = sidebar;
    this.blocks = blocks;
    this.view = 'ready';
    document.title = title + ' · ' + t('rd.reader');
  }

  async translateAll() {
    const pending = this.blocks.filter(block => ENGLISH_RE.test(block.text) && !this.translations.has(block.id));
    const batches = translationBatches(pending);
    if (!batches.length) return;
    this.translating = true;
    let done = 0;
    try {
      for (const batch of batches) {
        this.progress = t('rd.translating',{done,total:batches.length});
        const result = await request('READER_TRANSLATE', {items: batch});
        for (const item of result.items || []) this.translations.set(item.id, item.translation);
        this.translations = new Map(this.translations);
        done += 1;
      }
      this.progress = t('rd.transDone');
    } catch (error) {
      this.progress = '';
      this.error = t('rd.transFail',{err:error?.message || error});
    } finally {
      this.translating = false;
      setTimeout(() => { if (this.progress === t('rd.transDone')) this.progress = ''; }, 2000);
    }
  }

  scrollTo(anchor) {
    this.querySelector('#' + anchor)?.scrollIntoView({block: 'start', behavior: 'smooth'});
  }

  openFilePicker() {
    this.querySelector('#reader-file')?.click();
  }

  #langName() {
    const pref = globalThis.RoamCatI18n?.pref?.() || 'auto';
    return t(`common.lang${pref === 'auto' ? 'Auto' : pref === 'zh' ? 'Zh' : 'En'}`);
  }

  #langShort() {
    const pref = globalThis.RoamCatI18n?.pref?.() || 'auto';
    return t(pref === 'auto' ? 'pop.langAuto' : pref === 'zh' ? 'pop.langZh' : 'pop.langEn');
  }

  #cycleUiLang() {
    const i18n = globalThis.RoamCatI18n;
    if (!i18n) return;
    const order = ['auto', 'zh', 'en'];
    i18n.setPref(order[(order.indexOf(i18n.pref()) + 1) % order.length]);
    this.requestUpdate();
  }

  render() {
    return html`
      <div class="reader-shell">
        <header class="reader-toolbar">
          <div class="reader-brand">
            <span class="reader-logo">RoamCat</span>
            <span class="reader-title" title=${this.title}>${this.title || t('rd.defTitle')}</span>
          </div>
          <div class="reader-actions">
            ${this.progress ? html`<span class="reader-progress">${this.progress}</span>` : ''}
            ${this.view === 'ready' ? html`
              <label class="reader-bilingual"><rc-switch .checked=${this.bilingual} @change=${event => { this.bilingual = event.target.checked; }}></rc-switch><span>${t('rd.bilingual')}</span></label>
              <button class="rc-button rc-primary" ?disabled=${this.translating} @click=${this.translateAll}>${this.translating ? t('rd.translatingBtn') : t('rd.transAll')}</button>
            ` : ''}
            <button class="rc-button" @click=${this.openFilePicker}>${t('rd.open')}</button>
            <button class="rc-button" type="button" title=${t('opt.langToggleTitle',{lang:this.#langName()})} @click=${() => this.#cycleUiLang()}>${this.#langShort()}</button>
            <a class="rc-button" href="options.html" target="_blank" rel="noopener">${t('rd.settings')}</a>
          </div>
        </header>
        <input id="reader-file" type="file" accept=".pdf,.epub,application/pdf,application/epub+zip" hidden @change=${this.openFile}>
        ${this.view === 'empty' ? this.renderEmpty() : ''}
        ${this.view === 'loading' ? html`<main class="reader-main"><div class="reader-status-card">${this.progress}</div></main>` : ''}
        ${this.view === 'error' ? html`
          <main class="reader-main">
            <div class="reader-status-card reader-error">
              <p>${this.error}</p>
              <button class="rc-button rc-primary" @click=${this.openFilePicker}>${t('rd.repick')}</button>
            </div>
          </main>` : ''}
        ${this.view === 'ready' ? this.renderDoc() : ''}
      </div>`;
  }

  renderEmpty() {
    return html`
      <main class="reader-main">
        <div class="reader-status-card">
          <div class="reader-hero-art" aria-hidden="true">${heroArt()}</div>
          <h1>${t('rd.heroTitle')}</h1>
          <p>${t('rd.heroDesc')}</p>
          <div class="reader-format-chips" aria-hidden="true"><span>PDF</span><span>EPUB</span><span>${t('rd.chipBilingual')}</span></div>
          <button class="rc-button rc-primary" @click=${this.openFilePicker}>${t('rd.open')}</button>
          <p class="reader-hint">${t('rd.heroHint')}</p>
        </div>
      </main>`;
  }

  renderDoc() {
    return html`
      <div class="reader-body">
        <nav class="reader-sidebar" aria-label=${t('rd.toc')}>
          ${this.sidebar.map(item => html`
            <button class="reader-nav-item" @click=${() => this.scrollTo(item.anchor)} title=${item.label}>${item.label}</button>`)}
        </nav>
        <main class="reader-flow">
          ${this.blocks.map(block => html`
            ${block.anchor ? html`<span id=${block.anchor} class="reader-anchor"></span>` : ''}
            <p class="reader-block reader-role-${block.role || 'p'}" lang="en">${block.text}</p>
            ${this.bilingual && this.translations.has(block.id) ? html`
              <p class="reader-translation" lang="zh-CN">${this.translations.get(block.id)}</p>` : ''}`)}
        </main>
      </div>`;
  }
}

customElements.define('roamcat-reader', RoamcatReader);
