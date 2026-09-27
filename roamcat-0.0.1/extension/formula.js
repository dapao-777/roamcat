/** @file 公式保护：已渲染数学容器选择器 + 文本节点内 LaTeX 定界符检测；content.js 纯逻辑模块。 */
(() => {
  'use strict';
  // Elements that already render math on the page; their text must never enter translation units or sentence splitting.
  const MATH_SELECTOR = 'math,.katex,.katex-display,.MathJax,.MathJax_Display,.MathJax_Preview,.MathJax_SVG,.MathJax_SVG_Display,mjx-container,mjx-assistive-mml,.mjx-chtml,.tex2jax_ignore,.latex,.latex-rendered,.cmath,.wmformula,.wiris,.fm-math,script[type*="math/tex"],script[type="math/mml"],annotation[encoding]';
  const ENVS = '(?:equation|align|gather|multline|eqnarray|displaymath|math)\\*?';
  const PAIRS = [
    {re: /\$\$[\s\S]+?\$\$/gu, kind: 'display'},
    {re: /\\begin\{ENVS\}[\s\S]+?\\end\{ENVS\}/gu, kind: 'env'},
    {re: /\\\[[\s\S]+?\\\]/gu, kind: 'display'},
    {re: /\\\([\s\S]+?\\\)/gu, kind: 'inline'},
    {re: /(^|[^\w$\\])\$[^\s$][^$\n]*?[^\s$\\]\$(?!\w)/gu, kind: 'dollar'}
  ];
  const MATH_HINT_RE = /[\\^_{}=]|\b(?:frac|sqrt|sum|prod|int|lim|infty|alpha|beta|gamma|delta|theta|lambda|pi|sigma|omega|cdot|times|leq|geq|neq|approx|partial|nabla)\b/u;
  // Finds LaTeX delimited spans in plain text; $x$ requires a math hint so prices like $5 stay untouched.
  function findInline(text) {
    if (typeof text !== 'string' || !text || text.indexOf('$') === -1 && text.indexOf('\\') === -1) return [];
    const spans = [];
    for (const {re, kind} of PAIRS) {
      const pattern = kind === 'env' ? new RegExp(re.source.replaceAll('ENVS', ENVS), 'gu') : re;
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text))) {
        const lead = match[1] && kind === 'dollar' ? match[1].length : 0;
        const start = match.index + lead, end = match.index + match[0].length;
        const body = text.slice(start, end);
        if (body.length > 4000) continue;
        if (kind === 'dollar' && !MATH_HINT_RE.test(body.replace(/^\$|\$$/gu, ''))) continue;
        spans.push({start, end, kind});
        if (match[0].length === 0) pattern.lastIndex += 1;
      }
    }
    return merge(spans);
  }
  function merge(spans) {
    const sorted = spans.sort((a, b) => a.start - b.start || b.end - a.end);
    const out = [];
    for (const span of sorted) {
      const last = out.at(-1);
      if (last && span.start < last.end) { if (span.end > last.end) last.end = span.end; continue; }
      out.push({...span});
    }
    return out;
  }
  globalThis.RoamCatFormula = {MATH_SELECTOR, findInline};
})();

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
