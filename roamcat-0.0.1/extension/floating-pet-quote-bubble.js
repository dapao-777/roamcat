/**
 * @file extension/floating-pet-quote-bubble.js
 * 文件职责：伴读猫语录气泡（classic script，禁 ESM 语法）——按间隔从 RoamCatPetQuotes 取句、
 *   经现场守卫与跨标签页节流后在语音气泡里展示。
 * 主要内容：globalThis.RoamCatPetParts.installQuoteBubble(proto, shared)，把 quoteSettings、
 *   start/stop/syncQuoteTicker、maybeShowQuote、speakQuote 装到 RoamCatPetWidget 原型上。
 * 模块边界：shared 是 floating-pet.js 闭包状态的读写桥，本文件不另存状态；语录库本身在 pet-quotes.js；
 *   须排在 floating-pet.js 之前注入；必须保持非 ESM（module-graph R1 强制）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
(() => {
  const parts = (globalThis.RoamCatPetParts ||= {});

  parts.installQuoteBubble = (proto, shared) => parts.defineMethods(proto, {
    // —— 哲学语录 ——
    // 伴读猫每 intervalMin 分钟冒泡一句 RoamCatPetQuotes 里的哲学短句。
    // 定时器 30s 一跳，只在页面可见时累计 quoteVisibleMs；到点先过 maybeShowQuote 的
    // 现场守卫（正在说话/菜单开着/拖拽/贴边/打盹/输入框聚焦等一律跳过），再过
    // chrome.storage.local 的 petQuoteState 跨标签页节流，最后经 speakQuote 复用气泡展示。

    quoteSettings() {
      const quotes = shared.currentSettings?.floatingPet?.quotes;
      return {
        enabled: quotes?.enabled !== false,
        intervalMin: [15, 30, 60].includes(quotes?.intervalMin) ? quotes.intervalMin : 15
      };
    },

    startQuoteTicker() {
      clearInterval(this._quoteTimer);
      this._quoteVisibleMs = 0;
      this._quotePending = false;
      this._quoteTimer = setInterval(() => {
        if (this._disposed) return;
        const {enabled, intervalMin} = this.quoteSettings();
        if (!enabled) {
          this.stopQuoteTicker();
          return;
        }
        if (document.visibilityState === 'visible') this._quoteVisibleMs += 30000;
        if (this._quoteVisibleMs < intervalMin * 60000 || this._quotePending) return;
        this._quotePending = true;
        Promise.resolve(this.maybeShowQuote())
          .catch(() => false)
          .then(done => {
            this._quotePending = false;
            // 被现场守卫挡住时不清零：保持“已到期”，下一个 tick 继续尝试。
            if (done) this._quoteVisibleMs = 0;
          });
      }, 30000);
    },

    stopQuoteTicker() {
      clearInterval(this._quoteTimer);
      this._quoteTimer = 0;
      this._quoteVisibleMs = 0;
      this._quotePending = false;
    },

    // quotes.enabled/intervalMin 变化后调用：开着就（重）置累计并确保定时器在跑，关了就整体停掉。
    syncQuoteTicker() {
      if (this.quoteSettings().enabled && !this._disposed) this.startQuoteTicker();
      else this.stopQuoteTicker();
    },

    async maybeShowQuote() {
      if (this._disposed) return false;
      const {enabled, intervalMin} = this.quoteSettings();
      if (!enabled) return false;
      const api = globalThis.RoamCatPetQuotes;
      if (!api?.next || !Array.isArray(api.list) || !api.list.length) return false;
      const bubble = this.shadowQuery('#cat-speech');
      if (!bubble || bubble.classList.contains('speaking')) return false;
      if (shared.isDockOpen || shared.isSummaryOpen || shared.isDragging || shared.isDocked || this._isSleeping) return false;
      if (shared.petState !== 'idle') return false;
      if (document.visibilityState !== 'visible') return false;
      const active = document.activeElement;
      if (active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName || ''))) return false;

      const intervalMs = intervalMin * 60000;
      try {
        // petQuoteState 全扩展共享：别的前台标签页刚说过，本页就退回重计一轮。
        const stored = await chrome.storage.local.get('petQuoteState');
        if (this._disposed) return false;
        const state = stored?.petQuoteState || {};
        if (Number.isFinite(state.lastQuoteAt) && Date.now() - state.lastQuoteAt < intervalMs - 30000) return true;
        const picked = api.next(state);
        if (!picked?.quote) return false;
        await chrome.storage.local.set({petQuoteState: {lastQuoteAt: Date.now(), order: picked.order, cursor: picked.cursor}});
        this.speakQuote(picked.quote);
        return true;
      } catch {
        // 扩展上下文失效/存储不可用时静默降级到本页内顺序，绝不让定时器抛错。
        const picked = api.next(this._quoteBook || {});
        if (!picked?.quote) return false;
        this._quoteBook = {order: picked.order, cursor: picked.cursor};
        this.speakQuote(picked.quote);
        return true;
      }
    },

    // 复用语音气泡展示语录：quote 类切换多行排版，12s 后自动收起。
    // 公开在 RoamCatPet 上供探针/测试调用；省略 quote 时按本页内顺序取一句。
    speakQuote(quote) {
      if (!quote) {
        const api = globalThis.RoamCatPetQuotes;
        if (!api?.next) return;
        const picked = api.next(this._quoteBook || {});
        if (!picked?.quote) return;
        this._quoteBook = {order: picked.order, cursor: picked.cursor};
        quote = picked.quote;
      }
      if (!quote?.zh) return;
      this.syncTheme();
      const bubble = this.shadowQuery('#cat-speech');
      const textEl = this.shadowQuery('#speech-text');
      if (!bubble || !textEl) return;

      // 只用 textContent 填充，不做 innerHTML 注入。
      const zhLine = document.createElement('div');
      zhLine.className = 'quote-zh';
      zhLine.textContent = quote.zh;
      const enLine = document.createElement('div');
      enLine.className = 'quote-en';
      enLine.textContent = quote.en || '';
      const authorLine = document.createElement('div');
      authorLine.className = 'quote-author';
      authorLine.textContent = `— ${quote.author || ''}`;
      textEl.replaceChildren(zhLine, enLine, authorLine);
      textEl.title = [quote.zh, quote.en].filter(Boolean).join(' ');

      bubble.classList.remove('is-busy', 'is-error');
      bubble.classList.add('speaking', 'quote');
      this.container?.classList.add('has-speech');
      this.fitSpeechBubble();

      clearTimeout(this._speechTimer);
      this._speechTimer = setTimeout(() => {
        this.clearStatusSpeech();
      }, 12000);
    }
  });
})();
