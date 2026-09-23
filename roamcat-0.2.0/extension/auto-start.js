/**
 * @file extension/auto-start.js
 * 文件职责：页面侧自动启动引导（classic script）——SS_AUTO_START握手与阅读意图上报。
 * 主要内容：幂等引导哨兵__roamcatAutoBootstrap；只在主框架运行。
 * 模块边界：页面层，不含ESM；只经白名单消息与后台通信。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
(() => {
  if (globalThis.__roamcatAutoBootstrap) return;
  globalThis.__roamcatAutoBootstrap = true;

  let lastArticle = '';
  let scheduled = false;
  const articleUrl = raw => {
    try {
      const url = new URL(raw, location.href);
      const hash = url.hash || '';
      if (!hash.startsWith('#/') && !hash.startsWith('#!/')) url.hash = '';
      url.username = '';
      url.password = '';
      return url.href;
    } catch { return String(raw || '').split('#')[0]; }
  };
  const check = () => {
    scheduled = false;
    const next = articleUrl(location.href);
    if (next === lastArticle) return;
    const sameDocument = lastArticle !== '';
    lastArticle = next;
    chrome.runtime.sendMessage({type:'AUTO_BOOTSTRAP_CHECK', ...(sameDocument ? {sameDocument:true} : {})}).catch(() => {});
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(check);
  };

  addEventListener('popstate',schedule,{passive:true});
  addEventListener('hashchange',schedule,{passive:true});
  const wrap = method => {
    const original = history[method];
    history[method] = function(...args) {
      const result = original.apply(this,args);
      schedule();
      return result;
    };
  };
  wrap('pushState');
  wrap('replaceState');
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'SS_AUTO_RECHECK') {
      lastArticle = '';
      schedule();
    }
  });
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();
})();
