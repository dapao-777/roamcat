/**
 * @file extension/floating-pet-helpers.js
 * 文件职责：伴读猫的无状态辅助函数（classic script，禁 ESM 语法）——领域名称、快捷键抢键判断、
 *   阅读量估算与页面背景色取样，以及把拆分文件里的原型方法装回 RoamCatPetWidget 的 defineMethods。
 * 主要内容：globalThis.RoamCatPetParts 上的 domainName、petShortcutBlocked、calculateReadingMeta、hasKeepOut、keepOutRight（避让站点固定侧栏）、
 *   getLuminance、getElementBg（伴读猫所在位置的底色取样；网页整体明暗由 content-ui 的 pageThemeHint 判断）、defineMethods。
 * 模块边界：不持有伴读猫状态、不挂 DOM；须与其余 floating-pet-*.js 同批注入且排在 floating-pet.js 之前；
 *   必须保持非 ESM（module-graph R1 强制）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
(() => {
  const parts = (globalThis.RoamCatPetParts ||= {});
  const T = (k, v) => globalThis.RoamCatI18n?.t?.(k, v) ?? k;

  function domainName(key) {
    const map = {
      general: 'domain.general',
      tech: 'domain.tech',
      data: 'domain.data',
      finance: 'domain.finance',
      medical: 'domain.medical',
      legal: 'domain.legal',
      design: 'domain.design'
    };
    return T(map[key] || '') || T('fp.domainFallback');
  }

  // escapeHtml/formatHighlight 已由 content-ui 渲染层的文本绑定与 highlightParts 取代。

  // 在输入框或可编辑区域中操作时，全局快捷键不应抢走按键。
  function petShortcutBlocked(event) {
    if (document.designMode === 'on') return true;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    return path.some(node => node && node.nodeType === Node.ELEMENT_NODE &&
      (node.isContentEditable || node.matches?.('input,textarea,select,[role="textbox"],[role="searchbox"],[role="combobox"]')));
  }

  function calculateReadingMeta(text) {
    if (!text) return { words: 0, minutes: 1 };
    const clean = text.trim();
    const enWords = (clean.match(/[a-zA-Z0-9_\-]+/g) || []).length;
    const cjkChars = (clean.match(/[\u4e00-\u9fa5]/g) || []).length;
    const totalWords = Math.max(enWords + Math.round(cjkChars * 0.6), 1);
    const minutes = Math.max(1, Math.ceil(totalWords / 220));
    return { words: totalWords, minutes };
  }

  function parseRgba(colorStr) {
    if (!colorStr || colorStr === 'transparent' || colorStr === 'rgba(0, 0, 0, 0)') return null;
    const match = colorStr.match(/[\d.]+/g);
    if (!match || match.length < 3) return null;
    const [r, g, b, a] = match.map(Number);
    if (a !== undefined && a < 0.1) return null;
    return { r, g, b, a: a ?? 1 };
  }

  function getLuminance(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function getElementBg(el) {
    if (!el || !(el instanceof Element)) return null;
    let curr = el;
    while (curr) {
      try {
        const style = window.getComputedStyle(curr);
        const bg = parseRgba(style.backgroundColor);
        if (bg) return bg;
      } catch {}
      if (curr === document.documentElement) break;
      curr = curr.parentElement;
    }
    return null;
  }

  // 站点上固定占着右侧的区域（Twitch 聊天栏，输入框和表情按钮都在里面）：猫落在里面时，
  // 显示位置挪到这块区域左边；只算显示位置，不改保存的位置。左边放不下就不挪。
  const KEEP_OUT = {'www.twitch.tv': '.right-column, .chat-shell'};
  function hasKeepOut() { return Boolean(KEEP_OUT[location.hostname]); }
  function keepOutRight(right, bottom, petW, petH) {
    const selector = KEEP_OUT[location.hostname];
    if (!selector) return right;
    const left = window.innerWidth - right - petW;
    const top = window.innerHeight - bottom - petH;
    for (const zone of document.querySelectorAll(selector)) {
      const rect = zone.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 120) continue;
      if (left >= rect.right || left + petW <= rect.left || top >= rect.bottom || top + petH <= rect.top) continue;
      const shifted = Math.round(window.innerWidth - rect.left + 8);
      return shifted + petW <= window.innerWidth ? shifted : right;
    }
    return right;
  }

  // 按类方法的语义（不可枚举、可写、可配置）把方法装到原型上，供拆出的摘要窗/语录气泡使用。
  function defineMethods(proto, methods) {
    for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(methods))) {
      Object.defineProperty(proto, name, {...descriptor, enumerable: false});
    }
  }

  Object.assign(parts, {domainName, petShortcutBlocked, calculateReadingMeta, getLuminance, getElementBg, hasKeepOut, keepOutRight, defineMethods});
})();
