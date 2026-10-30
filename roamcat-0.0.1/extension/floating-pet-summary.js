/**
 * @file extension/floating-pet-summary.js
 * 文件职责：伴读猫文章摘要窗（classic script，禁 ESM 语法）——正文抽取、PAGE_SUMMARY 请求、
 *   加载/失败/结果三态渲染与摘要复制。
 * 主要内容：globalThis.RoamCatPetParts.installSummary(proto, shared)，把 extractArticle、requestArticleSummary、
 *   open/closeSummary、renderSummary*、copySummaryText 装到 RoamCatPetWidget 原型上。
 * 模块边界：shared 是 floating-pet.js 闭包状态的读写桥，本文件不另存状态；DOM 渲染经 RoamCatContentUI；
 *   须排在 floating-pet.js 之前注入；必须保持非 ESM（module-graph R1 强制）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
(() => {
  const parts = (globalThis.RoamCatPetParts ||= {});
  const T = (k, v) => globalThis.RoamCatI18n?.t?.(k, v) ?? k;
  const {calculateReadingMeta, domainName} = parts;

  parts.installSummary = (proto, shared) => parts.defineMethods(proto, {
    async extractArticle() {
      await this.ensurePageContent();
      if (typeof window.__ROAMCAT_CONTENT__?.getArticleSummarySource === 'function') {
        try {
          const res = await window.__ROAMCAT_CONTENT__.getArticleSummarySource();
          if (res?.text && res.text.trim().length > 50) return res;
        } catch {}
      }

      // Semantic HTML extraction
      const candidateSelectors = ['article', 'main', '[role="main"]', '.post-content', '.article-body', '.content', '#content'];
      let bestEl = null;
      let maxLen = 0;

      for (const sel of candidateSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const len = (el.innerText || '').trim().length;
          if (len > maxLen) {
            maxLen = len;
            bestEl = el;
          }
        }
      }

      const rawText = bestEl ? bestEl.innerText : document.body.innerText;
      const text = (rawText || '').slice(0, 15000);
      const meta = calculateReadingMeta(text);

      return {
        title: document.title || '',
        url: location.href,
        text,
        wordCount: meta.words,
        domain: shared.detectedDomain || 'general'
      };
    },

    async requestArticleSummary() {
      if (this._disposed) return;
      if (this._summaryPending && this._summaryRequest?.url === location.href) { this.openSummary(); return; }
      const request = { url: location.href };
      this._summaryRequest = request;
      const isCurrent = () => !this._disposed && this._summaryRequest === request;
      this._summaryPending = true;
      shared.cachedSummary = null;
      shared.cachedSummarySource = null;
      this.openSummary();
      this.renderSummaryLoading();
      this.setPetState('thinking');

      try {
        const article = await this.extractArticle();
        if (!isCurrent()) return;
        if (location.href !== request.url || article.url !== request.url) throw new Error(T('fp.pageChanged'));
        if (!article.text || article.text.trim().length < 40) {
          throw new Error(T('fp.noContent'));
        }

        shared.currentArticleMeta = calculateReadingMeta(article.text);
        if (article.domain) this.setDomain(article.domain);

        const res = await chrome.runtime.sendMessage({
          type: 'PAGE_SUMMARY',
          title: article.title,
          text: article.text,
          url: article.url
        });

        if (!isCurrent()) return;
        if (location.href !== request.url) throw new Error(T('fp.pageChanged'));
        if (!res?.ok) {
          throw new Error(res?.error || T('fp.sumFail'));
        }

        shared.cachedSummary = res.data;
        shared.cachedSummarySource = { title: article.title, url: article.url };
        if (res.data.domain) this.setDomain(res.data.domain);

        this.setPetState('success');
        this.renderSummaryContent(res.data);
      } catch (error) {
        if (!isCurrent()) return;
        this.setPetState('error');
        this.renderSummaryError(error.message || T('fp.sumFailGeneric'));
      } finally {
        if (isCurrent()) {
          this._summaryPending = false;
          this._summaryRequest = null;
        }
      }
    },

    openSummary() {
      shared.isSummaryOpen = true;
      this.clampPosition();
      this.summaryWindow.classList.add('open');
    },

    closeSummary() {
      shared.isSummaryOpen = false;
      this.summaryWindow.classList.remove('open');
      this.setPetState('idle');
    },

    renderSummaryLoading() {
      const container = this.shadowQuery('#summary-content');
      if (!container) return;
      globalThis.RoamCatContentUI.renderPetSummaryLoading(container);
    },

    renderSummaryError(errorMsg) {
      const container = this.shadowQuery('#summary-content');
      if (!container) return;
      globalThis.RoamCatContentUI.renderPetSummaryError(container, {
        message: errorMsg,
        onRetry: () => this.requestArticleSummary(),
        onOpenSettings: () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }),
      });
    },

    renderSummaryContent(data) {
      const container = this.shadowQuery('#summary-content');
      if (!container) return;

      const words = shared.currentArticleMeta?.words || 1200;
      const minutes = shared.currentArticleMeta?.minutes || Math.max(1, Math.ceil(words / 220));
      const domainKey = data.domain || shared.detectedDomain || 'general';

      globalThis.RoamCatContentUI.renderPetSummaryContent(container, {
        meta: {words, minutes, domainKey, domainName: domainName(domainKey)},
        takeaway: data.takeaway,
        highlights: data.highlights || [],
        keywords: data.keywords || [],
        onKeywordClick(pill, kw) {
          navigator.clipboard.writeText(kw).then(() => {
            const originalText = pill.textContent;
            pill.textContent = `${kw} ✓`;
            pill.classList.add('copied');
            setTimeout(() => {
              pill.textContent = originalText;
              pill.classList.remove('copied');
            }, 1600);
          });
        },
      });
    },

    copySummaryText() {
      if (!shared.cachedSummary || !shared.cachedSummarySource) {
        this.speakStatus(T('fp.copyEmpty'), {duration: 2200});
        return;
      }
      const text = [
        T('fp.copyHead',{title:shared.cachedSummarySource.title}),
        ``,
        T('fp.copyConcl'),
        `${shared.cachedSummary.takeaway}`,
        ``,
        T('fp.copyPoints'),
        ...(shared.cachedSummary.highlights || []).map((h, i) => `${i + 1}. ${h.replace(/\*\*/g, '')}`),
        ``,
        shared.cachedSummary.keywords?.length ? T('fp.copyTerms',{list:shared.cachedSummary.keywords.join('、')}) : '',
        T('fp.copySrc',{url:shared.cachedSummarySource.url})
      ].filter(Boolean).join('\n');

      navigator.clipboard.writeText(text).then(() => {
        const btn = this.shadowQuery('#summary-copy-btn');
        const textSpan = this.shadowQuery('#copy-btn-text');
        if (btn && textSpan) {
          btn.classList.add('copied');
          textSpan.textContent = T('fp.copied');
          setTimeout(() => {
            btn.classList.remove('copied');
            textSpan.textContent = T('pet.copyBtn');
          }, 2500);
        }
      }).catch(err => {
        console.error('Failed to copy', err);
      });
    }
  });
})();
