/**
 * @file src/pages/reader/reader-app.js
 * 文件职责：PDF/EPUB 阅读器——解包为阅读块流、侧栏目录导航、按批次调用 READER_TRANSLATE
 *   做块级双语翻译；本地文件经文件选择器、远程 PDF 经 ?src= 参数与导航重定向进入。
 * 主要内容：按需 loadPdf（pdfjs worker + 首批正文渐进显示）、loadEpub（独立解析线程）、80 块分页、translationBatches
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
import {loadEpub} from './epub-loader.js';
import {translationBatches} from './pdf-blocks.mjs';
import {heroArt} from '../../components/hero-art.js';
import {icon} from '../../components/icons.js';
import '../../components/rc-switch.js';
import {t} from '../../i18n-runtime.js';

const ENGLISH_RE = /[A-Za-z]/u;
const PAGE_BLOCKS=80,MAX_FILE_BYTES=64*1024*1024;

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
    translating: {state: true},
    parsing: {state: true},
    pageIndex: {state: true}
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
    this.parsing=false;
    this._nextId = 1;
    this.pageIndex=0;this._openId=0;
  }

  firstUpdated() {
    const src = new URLSearchParams(location.search).get('src');
    if (src) void this.openRemote(src);
  }

  async openRemote(url) {
    const opening=this.beginOpen();
    this.view = 'loading';
    this.progress = t('rd.downloading');
    try {
      const response = await fetch(url, {credentials: 'omit',signal:opening.signal});
      if (!response.ok) throw new Error(t('rd.dlFail',{status:response.status}));
      if(Number(response.headers.get('Content-Length'))>MAX_FILE_BYTES){await response.body?.cancel();throw new Error(t('rd.tooLarge'));}
      const chunks=[];let size=0;const stream=response.body?.getReader();
      if(stream){try{for(;;){const {done,value}=await stream.read();if(done)break;size+=value.length;if(size>MAX_FILE_BYTES){await stream.cancel();throw new Error(t('rd.tooLarge'));}chunks.push(value);}}finally{stream.releaseLock();}}
      else chunks.push(new Uint8Array(await response.arrayBuffer()));
      const data=new Uint8Array(stream?size:chunks[0].length);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
      const name = decodeURIComponent(new URL(url).pathname.split('/').at(-1) || 'document.pdf');
      if(opening.id!==this._openId)return;await this.openData(data, name,opening);
    } catch (error) {
      if(opening.id!==this._openId||error?.name==='AbortError')return;
      this.error = t('rd.remoteFail',{err:error?.message || error});
      this.view = 'error';
      this.parsing=false;
      this.progress = '';
    }
  }

  async openFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const opening=this.beginOpen();
    this.view = 'loading';
    this.progress = t('rd.reading');
    try {
      if(file.size>MAX_FILE_BYTES)throw new Error(t('rd.tooLarge'));
      const data=new Uint8Array(await file.arrayBuffer());if(opening.id!==this._openId)return;await this.openData(data, file.name,opening);
    } catch (error) {
      if(opening.id!==this._openId||error?.name==='AbortError')return;
      this.error = t('rd.openFail',{err:error?.message || error});
      this.view = 'error';
      this.parsing=false;
      this.progress = '';
    }
  }

  beginOpen(){this._loadController?.abort();this._loadController=new AbortController();this.translating=false;this.parsing=true;this.pageIndex=0;this.error='';return {id:++this._openId,signal:this._loadController.signal};}
  disconnectedCallback(){this._loadController?.abort();this._openId++;super.disconnectedCallback();}
  async openData(data, name,opening=this.beginOpen()) {
    this.blocks = [];
    this.translations = new Map();
    if (data.length > MAX_FILE_BYTES) throw new Error(t('rd.tooLarge'));
    const isPdf = data.length > 4 && data[0] === 0x25 && data[1] === 0x50; // %PDF
    const isZip = data.length > 4 && data[0] === 0x50 && data[1] === 0x4b; // PK
    if (isPdf || /\.pdf$/iu.test(name)) return this.openPdf(data, name,opening);
    if (isZip || /\.epub$/iu.test(name)) return this.openEpub(data, name,opening);
    throw new Error(t('rd.unsupported'));
  }

  async openPdf(data, name,opening) {
    const {loadPdf}=await import('./pdf-loader.js');if(opening.id!==this._openId)return;
    const sidebar = [], blocks = [];let lastPublish=0;
    const pdf = await loadPdf({data, name},undefined,{signal:opening.signal,onPage:(page,total)=>{
      if(opening.id!==this._openId)return;
      const anchor = 'sec-p' + page.number;
      sidebar.push({anchor, label: t('rd.pageN',{n:page.number})});
      for (const [index,block] of page.blocks.entries()) {
        blocks.push({id: 'b' + this._nextId++, anchor: index === 0 ? anchor : '', ...block});
      }
      const now=performance.now();
      if(blocks.length&&(this.view!=='ready'||now-lastPublish>=120||page.number===total)){
        lastPublish=now;this.title=name;this.kind='pdf';this.sidebar=[...sidebar];this.blocks=[...blocks];this.view='ready';this.progress=t('rd.parsingPdf',{done:page.number,total});
      }
    }});
    if(opening.id!==this._openId)return;
    const currentPage=this.pageIndex;
    this.finishLoad(pdf.title, 'pdf', sidebar, blocks);
    this.pageIndex=currentPage;
  }

  async openEpub(data, name,opening) {
    this.progress = t('rd.parsingEpub');
    const book = await loadEpub(data,{signal:opening.signal});
    if(opening.id!==this._openId)return;
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
    this.parsing=false;
    this.pageIndex=0;
    this.progress = '';
    if (!blocks.length) { this.error = t('rd.noText'); this.view = 'error'; return; }
    this.title = title;
    this.kind = kind;
    this.sidebar = sidebar;
    this.blocks = blocks;
    this.view = 'ready';
    document.title = title + ' · ' + t('rd.reader');
  }

  async translateAll() {
    if(this.parsing)return;
    const opening=this._openId;
    const pending = this.blocks.filter(block => ENGLISH_RE.test(block.text) && !this.translations.has(block.id));
    const batches = translationBatches(pending);
    if (!batches.length) return;
    this.translating = true;
    let done = 0;
    try {
      // 两路并发：与后台每个服务默认的 2 个并发名额对齐，按文档顺序取批。
      // 单批失败不拖垮其余批次；结束后再报错，再点一次只补翻没译出的段落。
      let next = 0, failed = null;
      this.progress = t('rd.translating',{done,total:batches.length});
      const worker = async () => {
        while (next < batches.length&&opening===this._openId) {
          const batch = batches[next++];
          try {
            // 模型偶发漏条/夹杂格式时整批被校验拒收：拆成单条逐个重试，一条坏数据不拖累同批其余段落。
            const items = await request('READER_TRANSLATE', {items: batch}).then(result => result.items || [], async error => {
              if (batch.length === 1) throw error;
              const singles = await Promise.allSettled(batch.map(item => request('READER_TRANSLATE', {items: [item]})));
              const ok = singles.filter(single => single.status === 'fulfilled').flatMap(single => single.value.items || []);
              if (ok.length < batch.length) failed ??= singles.find(single => single.status === 'rejected')?.reason || error;
              return ok;
            });
            if(opening!==this._openId)return;
            for (const item of items) this.translations.set(item.id, item.translation);
            this.requestUpdate();
            done += 1;
            this.progress = t('rd.translating',{done,total:batches.length});
          } catch (error) {
            failed ??= error;
          }
        }
      };
      await Promise.all([worker(), worker()]);
      if(opening!==this._openId)return;
      if (failed) throw failed;
      this.progress = t('rd.transDone');
    } catch (error) {
      if(opening!==this._openId)return;
      this.progress = '';
      this.error = t('rd.transFail',{err:error?.message || error});
    } finally {
      if(opening===this._openId){this.translating = false;
      setTimeout(() => { if (opening===this._openId&&this.progress === t('rd.transDone')) this.progress = ''; }, 2000);}
    }
  }

  async scrollTo(anchor) {
    const index=this.blocks.findIndex(block=>block.anchor===anchor);if(index<0)return;
    this.pageIndex=Math.floor(index/PAGE_BLOCKS);await this.updateComplete;
    this.querySelector('#' + anchor)?.scrollIntoView({block: 'start', behavior: 'smooth'});
  }
  async changePage(index){this.pageIndex=Math.max(0,Math.min(Math.ceil(this.blocks.length/PAGE_BLOCKS)-1,index));await this.updateComplete;this.querySelector('.reader-flow')?.scrollIntoView({block:'start'});}
  renderPager(){const pages=Math.ceil(this.blocks.length/PAGE_BLOCKS);if(pages<2)return '';return html`<nav class="reader-pager" aria-label=${t('rd.pagination')}><button class="rc-button" ?disabled=${this.pageIndex===0} @click=${()=>this.changePage(this.pageIndex-1)}>${t('rd.previous')}</button><span role="status">${t('rd.pageOf',{current:this.pageIndex+1,total:pages})}</span><button class="rc-button" ?disabled=${this.pageIndex>=pages-1} @click=${()=>this.changePage(this.pageIndex+1)}>${t('rd.next')}</button></nav>`;}

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
              <button class="rc-button rc-primary" ?disabled=${this.translating||this.parsing} @click=${this.translateAll}>${this.translating ? t('rd.translatingBtn') : t('rd.transAll')}</button>
            ` : ''}
            <button class="rc-button" @click=${this.openFilePicker}>${t('rd.open')}</button>
            <button class="rc-button rc-button-icon" type="button" title=${t('opt.langToggleTitle',{lang:this.#langName()})} aria-label=${t('opt.langToggleTitle',{lang:this.#langName()})} @click=${() => this.#cycleUiLang()}>${icon('globe', {size: 15})}<span>${this.#langShort()}</span></button>
            <button class="rc-button" type="button" @click=${() => { request('OPEN_OPTIONS').catch(() => chrome.runtime.openOptionsPage()); }}>${t('rd.settings')}</button>
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
          ${this.renderPager()}
          ${this.blocks.slice(this.pageIndex*PAGE_BLOCKS,(this.pageIndex+1)*PAGE_BLOCKS).map(block => html`
            ${block.anchor ? html`<span id=${block.anchor} class="reader-anchor"></span>` : ''}
            <p class="reader-block reader-role-${block.role || 'p'}" lang="en">${block.text}</p>
            ${this.bilingual && this.translations.has(block.id) ? html`
              <p class="reader-translation" lang="zh-CN">${this.translations.get(block.id)}</p>` : ''}`)}
          ${this.renderPager()}
        </main>
      </div>`;
  }
}

customElements.define('roamcat-reader', RoamcatReader);
