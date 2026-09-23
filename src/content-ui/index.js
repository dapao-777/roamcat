/**
 * @file src/content-ui/index.js
 * 文件职责：页面内 UI 渲染层——经 Vite 构建为 classic IIFE（extension/content-ui.js，
 *   生成物入库），在 manifest 三件套中位于 content.js 之前，向页面暴露
 *   globalThis.RoamCatContentUI。
 * 主要内容：lit-html 模板构建四个 closed-shadow UI（任务状态条 / 解构详情卡 /
 *   已认识 toast / 查词帮助卡）与共享品牌元素、解构树渲染；返回元素引用集，
 *   由 content.js 继续命令式驱动流式更新（编排逻辑不迁移）。
 * 模块边界：页面世界运行，不触密钥；样式经 RoamCatDesign.cssFor 注入 token。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {render, html, svg, nothing} from 'lit-html';
import {ref} from 'lit-html/directives/ref.js';
import {unsafeHTML} from 'lit-html/directives/unsafe-html.js';

const designCss = (selector, theme) => {
  try { return globalThis.RoamCatDesign?.cssFor?.(selector, theme) || ''; } catch { return ''; }
};

const q = root => selector => root.querySelector(selector);

// ---------- 共享品牌元素（返回真实 Element，供 content.js 残留命令式站点使用） ----------

export function brandIcon(url) {
  const icon = document.createElement('img');
  icon.setAttribute('data-roamcat-ui', 'brand-icon');
  icon.src = url;
  icon.alt = 'RoamCat';
  icon.title = 'RoamCat · 随心阅';
  icon.width = icon.height = 16;
  icon.style.cssText = 'display:inline-block;flex:none;width:16px;height:16px;max-width:none;vertical-align:middle;border:0';
  return icon;
}

export function brandLabel(url, context = '') {
  const label = document.createElement('span');
  const icon = brandIcon(url);
  icon.alt = '';
  icon.removeAttribute('title');
  icon.setAttribute('aria-hidden', 'true');
  label.setAttribute('data-roamcat-ui', 'brand');
  label.style.cssText = 'display:inline-flex;align-items:center;gap:var(--space-2);min-width:0;vertical-align:middle;color:var(--muted);font:var(--weight-medium) var(--type-support)/var(--leading-support) var(--sans);text-align:start';
  label.append(icon, document.createTextNode('RoamCat' + (context ? ' · ' + context : '')));
  return label;
}

const brandIconTpl = url => html`<img data-roamcat-ui="brand-icon" src=${url} alt="RoamCat" title="RoamCat · 随心阅" width="16" height="16" style="display:inline-block;flex:none;width:16px;height:16px;max-width:none;vertical-align:middle;border:0">`;
const brandLabelTpl = (url, context) => html`<span data-roamcat-ui="brand" style="display:inline-flex;align-items:center;gap:var(--space-2);min-width:0;vertical-align:middle;color:var(--muted);font:var(--weight-medium) var(--type-support)/var(--leading-support) var(--sans);text-align:start"><img data-roamcat-ui="brand-icon" src=${url} alt="" aria-hidden="true" width="16" height="16" style="display:inline-block;flex:none;width:16px;height:16px;max-width:none;vertical-align:middle;border:0">RoamCat${context ? ' · ' + context : ''}</span>`;

// ---------- 任务状态条（右上角 pill / 详情面板） ----------

const TASK_STATUS_CSS = `:host{font:var(--type-control)/var(--leading-control) var(--sans);color:var(--ink)}*{box-sizing:border-box}[hidden]{display:none!important}.panel{max-width:min(320px,calc(100vw - 32px));border:1px solid var(--line);border-radius:var(--radius-panel);background:var(--surface);box-shadow:var(--shadow-low);pointer-events:auto}.bar{display:flex;align-items:center;gap:var(--space-2);padding:var(--space-1) var(--space-1) var(--space-1) var(--space-3);min-height:40px}.indicator{width:14px;height:14px;flex:none;color:var(--muted);display:grid;place-items:center;font-weight:var(--weight-semibold);font-size:var(--type-support)}.indicator[data-busy=true]{border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:working 1.4s linear infinite}.indicator[data-error=true]{color:var(--danger)}.label{min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.count{color:var(--muted);font-size:var(--type-support);flex:none}button{flex:none;min-height:32px;padding:var(--space-1) var(--space-2);border:0;border-radius:var(--radius-control);background:transparent;color:var(--muted);font:inherit;cursor:pointer}button:hover{background:var(--surface-hover);color:var(--ink)}button:focus-visible{outline:var(--focus-ring);outline-offset:var(--focus-offset)}.close{width:32px;padding:0;display:grid;place-items:center}.close svg{width:14px;height:14px}.detail{border-top:1px solid var(--line);padding:var(--space-3);max-height:min(240px,50vh);overflow:auto;color:var(--muted-strong);font-size:var(--type-support);line-height:var(--leading-body);overflow-wrap:anywhere;white-space:pre-wrap}@keyframes working{to{transform:rotate(360deg)}}@keyframes rc-ui-in{from{opacity:0;translate:0 -6px}to{opacity:1;translate:0 0}}.panel{animation:rc-ui-in var(--rc-dur-fast,160ms) var(--rc-ease-out,cubic-bezier(.16,1,.3,1)) both}@media(prefers-reduced-motion:reduce){.indicator[data-busy=true]{animation:none}.panel{animation:none}}.panel.compact{max-width:none;border-radius:var(--radius-pill)}.panel.compact .bar{gap:0;padding:0;min-height:0}.panel.compact .bar>img{display:none!important}.panel.compact .label,.panel.compact .count,.panel.compact .more,.panel.compact .close{display:none}.panel.compact .indicator{width:18px;height:18px;margin:var(--space-2)}`;

export function taskStatus(shadow, {brandIconUrl, onClose}) {
  render(html`
    <style>${designCss(':host')}${TASK_STATUS_CSS}</style>
    <section class="panel" aria-label="RoamCat 阅读状态">
      <div class="bar">
        ${brandIconTpl(brandIconUrl)}
        <span class="indicator" aria-hidden="true"></span>
        <p class="label" role="status" aria-live="polite" aria-atomic="true"></p>
        <span class="count"></span>
        <button type="button" class="more" aria-expanded="false" aria-controls="status-detail" aria-label="查看阅读状态详情">详情</button>
        <button type="button" class="close" aria-label="隐藏本次提示" title="隐藏提示，任务继续">${svg`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg>`}</button>
      </div>
      <div class="detail" id="status-detail" hidden></div>
    </section>`, shadow);
  const el = q(shadow);
  const detail = el('.detail'), more = el('.more');
  const collapse = () => {
    detail.hidden = true;
    more.textContent = '详情';
    more.setAttribute('aria-expanded', 'false');
    more.setAttribute('aria-label', '查看阅读状态详情');
  };
  more.onclick = () => {
    if (!detail.hidden) { collapse(); return; }
    detail.hidden = false;
    more.textContent = '收起';
    more.setAttribute('aria-expanded', 'true');
    more.setAttribute('aria-label', '收起阅读状态详情');
  };
  const close = el('.close');
  close.onclick = onClose;
  return {panel: el('.panel'), indicator: el('.indicator'), label: el('.label'), count: el('.count'), more, detail, collapse, close};
}

// ---------- 解构详情卡（点击解构下划线弹出） ----------

const SENTENCE_DETAIL_CSS = `:host{font:var(--type-control)/var(--leading-control) var(--sans);color:var(--ink)}section{box-sizing:border-box;max-height:min(60vh,420px);overflow:auto;padding:var(--space-3);background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-panel);box-shadow:var(--shadow-high)}.head{display:flex;align-items:center;justify-content:space-between;gap:12px}button{font:inherit;color:var(--muted);border:0;background:transparent;min-height:32px;cursor:pointer}ul{list-style:none;padding-left:14px;margin:8px 0}section>ul{padding-left:0}li{margin:7px 0;overflow-wrap:anywhere}.role{display:inline-flex;align-items:center;font-size:11px;font-weight:var(--weight-medium);padding:1px 7px;border-radius:999px;border:1px solid currentColor;margin-right:8px;line-height:1.4;vertical-align:middle}@keyframes rc-ui-in{from{opacity:0;scale:.97;translate:0 4px}to{opacity:1;scale:1;translate:0 0}}section{animation:rc-ui-in var(--rc-dur-fast,160ms) var(--rc-ease-out,cubic-bezier(.16,1,.3,1)) both}@media(prefers-reduced-motion:reduce){section{animation:none}}`;

export function sentenceDetail(shadow, {brandIconUrl, onClose}) {
  render(html`
    <style>${designCss(':host')}${SENTENCE_DETAIL_CSS}</style>
    <section role="dialog" aria-label="RoamCat · 本句解构">
      <div class="head">
        ${brandLabelTpl(brandIconUrl, '阅读解构')}
        <button type="button" class="close">关闭</button>
      </div>
      <ul class="tree"></ul>
    </section>`, shadow);
  const el = q(shadow);
  const closeBtn = el('.close');
  closeBtn.onclick = onClose;
  return {panel: el('section'), tree: el('.tree'), close: closeBtn};
}

// 解构树：groups 为 [{parent,role,start,end}...] 数组，父索引 -1 为根层。
export function renderStructureTree(tree, {groups, sentence, roleLabel, roleColor}) {
  const item = (node, children) => {
    const color = roleColor(node.role);
    return html`<li><span class="role" style="color:${color};background-color:color-mix(in srgb, ${color} 12%, transparent);border-color:color-mix(in srgb, ${color} 35%, transparent)">${roleLabel(node.role)}</span><span lang="en">${sentence.slice(node.start, node.end)}</span>${children.length ? html`<ul>${children.map(child => child.tpl)}</ul>` : nothing}</li>`;
  };
  const build = (nodes, parent) => nodes
    .map((node, index) => ({node, index}))
    .filter(entry => entry.node.parent === parent)
    .map(entry => ({tpl: item(entry.node, build(nodes, entry.index))}));
  render(html`${build(groups, -1).map(entry => entry.tpl)}`, tree);
}

// ---------- 已认识反馈 toast（底部居中） ----------

const KNOWN_FEEDBACK_CSS = `:host{font:var(--type-control)/var(--leading-control) var(--sans);color:var(--ink)}div{display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3) var(--space-4);border:1px solid var(--line);border-radius:var(--radius-panel);background:var(--surface);box-shadow:var(--shadow-high)}span{min-width:0;overflow-wrap:anywhere}button{flex:none;min-height:32px;padding:var(--space-1) var(--space-3);border:1px solid var(--line);border-radius:var(--radius-pill);background:var(--surface);color:var(--accent);font:var(--weight-medium) var(--type-control)/var(--leading-control) var(--sans);cursor:pointer}button:hover{background:var(--accent-soft)}button:focus-visible{outline:var(--focus-ring);outline-offset:var(--focus-offset)}button:disabled{color:var(--on-action-disabled);background:var(--action-disabled)}@keyframes rc-ui-in{from{opacity:0;translate:0 8px}to{opacity:1;translate:0 0}}div{animation:rc-ui-in var(--rc-dur-fast,160ms) var(--rc-ease-out,cubic-bezier(.16,1,.3,1)) both}@media(prefers-reduced-motion:reduce){div{animation:none}}`;

export function knownFeedback(shadow, {brandIconUrl, term, onUndo}) {
  render(html`
    <style>${designCss(':host')}${KNOWN_FEEDBACK_CSS}</style>
    <div class="panel">
      ${brandIconTpl(brandIconUrl)}
      <span class="message">已认识“${term}”，以后不再自动提示。</span>
      <button type="button" class="undo">撤销</button>
    </div>`, shadow);
  const el = q(shadow);
  const undo = el('.undo');
  undo.onclick = onUndo;
  return {panel: el('.panel'), message: el('.message'), undo};
}

// ---------- 查词帮助卡（词卡 / 选段帮助主界面） ----------

const WORD_CARD_CSS = `:host{color:var(--ink);font:var(--type-control)/var(--leading-control) var(--sans)}
.card{padding:12px 14px;border:1px solid var(--accent-line);border-top:3px solid var(--accent);border-radius:var(--radius-panel);background:var(--surface);box-shadow:var(--shadow-high);max-height:min(70vh,calc(100vh - 24px));overflow:auto;box-sizing:border-box}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.close-x{flex:none;min-height:28px;min-width:28px;padding:0;margin:0;border:0;border-radius:6px;background:transparent;color:var(--muted);font-size:16px;line-height:1}
.close-x:hover{background:var(--accent-soft);color:var(--ink)}
.source{font-weight:var(--weight-medium);overflow-wrap:anywhere;margin:0 0 8px;white-space:pre-wrap}.source:not(.passage){font-size:18px;line-height:var(--leading-title)}
.answer{white-space:pre-wrap;margin:0 0 8px;overflow-wrap:anywhere;padding:8px 10px;border:1px solid var(--teal-line);border-left:3px solid var(--teal);border-radius:var(--radius-control);background:var(--teal-soft)}.answer:empty,.explanation:empty,.sentence-line:empty{display:none}
.sentence-line{margin:0 0 8px;color:var(--muted-strong);font-size:var(--type-support);line-height:var(--leading-support);overflow-wrap:anywhere}
.explanation{margin:0 0 8px}.explanation dt{font-size:var(--type-support);font-weight:var(--weight-medium);color:var(--muted);margin:0 0 4px}.explanation dt:not(:first-child){border-top:1px solid var(--line);padding-top:8px}.explanation dd{margin:0;padding:0 0 8px;white-space:pre-wrap;overflow-wrap:anywhere}.explanation dd:last-child{padding-bottom:0}
button,summary{font:var(--weight-medium) var(--type-support)/var(--leading-control) var(--sans);cursor:pointer}button{min-height:32px;border:1px solid var(--accent-line);border-radius:var(--radius-pill);padding:4px 10px;background:var(--accent-soft);color:var(--accent);margin:0 6px 6px 0}button:where(:enabled):hover{background:var(--accent-soft);border-color:var(--accent);color:var(--accent-hover)}button:where(:enabled):active{background:var(--action-hover);border-color:var(--action-hover);color:var(--on-action)}button:focus-visible,summary:focus-visible{outline:var(--focus-ring);outline-offset:var(--focus-offset)}button:disabled{border-color:var(--line);background:var(--action-disabled);color:var(--on-action-disabled);cursor:default}
.minor{color:var(--muted);font-size:12px;margin:6px 0 0}.minor:empty{display:none}.error{color:var(--danger)}details.more{border-top:1px solid var(--line);margin-top:6px;padding-top:8px}details.more>summary{color:var(--muted);margin-bottom:8px}
.source-heading{padding:8px 10px;border-radius:var(--radius-control);background:var(--accent-soft);display:flex;align-items:flex-start;gap:8px;margin-bottom:8px}.source-heading .source{color:var(--accent);flex:1;min-width:0;margin:0}.listen{flex-shrink:0;margin:0;min-height:28px;padding:4px 8px}.sentence{margin:0 0 8px}.sentence .explanation{margin:8px 0 0}.sentence-label{display:flex;align-items:center;justify-content:space-between;gap:8px}
.definition-value{color:var(--green);background:var(--green-soft);border:1px solid var(--green-line);border-radius:var(--radius-control);padding:2px 6px;font-weight:var(--weight-medium);-webkit-box-decoration-break:clone;box-decoration-break:clone}.inline-term{font-family:var(--mono);font-size:.95em;color:var(--accent);background:var(--accent-soft);border:1px solid var(--accent-line);border-radius:4px;padding:0 .25em;-webkit-box-decoration-break:clone;box-decoration-break:clone}.meaning-key{color:var(--green);font-weight:var(--weight-medium)}
.language-action{background:var(--violet-soft);border-color:var(--violet-line);color:var(--violet)}.language-action:where(:enabled):hover{background:var(--violet-soft);border-color:var(--violet);color:var(--violet)}.known-action{background:var(--teal);border-color:var(--teal);color:var(--on-teal)}.known-action:where(:enabled):hover,.known-action:where(:enabled):active{background:var(--teal-hover);border-color:var(--teal-hover);color:var(--on-teal)}.dismiss{background:var(--surface);border-color:var(--line);color:var(--muted-strong)}.sentence{border-top:0;padding-top:0}.sentence>summary{padding:4px 8px;border-radius:var(--radius-control);background:var(--accent-soft);color:var(--accent)}.answer.error{background:var(--danger-soft);border-color:var(--danger)}@keyframes rc-ui-in{from{opacity:0;scale:.97;translate:0 4px}to{opacity:1;scale:1;translate:0 0}}.card{animation:rc-ui-in var(--rc-dur-fast,160ms) var(--rc-ease-out,cubic-bezier(.16,1,.3,1)) both}@media(prefers-reduced-motion:reduce){.card{animation:none}}`;

export function wordCard(shadow, {
  brandIconUrl, kind, sourceText, isPassage = false, contextText = '',
  error = '', videoTheme = 'auto', knownAvailable = false, handlers = {},
}) {
  const refs = {};
  render(html`
    <style>${designCss(':host', videoTheme)}${WORD_CARD_CSS}</style>
    <section class="card" role="dialog" aria-label="RoamCat · 帮助理解选中内容" ${ref(el => { refs.card = el; })}>
      <div class="card-head" ${ref(el => { refs.head = el; })}>
        ${brandLabelTpl(brandIconUrl, kind === 'word' ? '词语释义' : '内容释义')}
        <button type="button" class="close-x" aria-label="收起" ${ref(el => { refs.closeX = el; })} @click=${handlers.close}>×</button>
      </div>
      <div class="source-heading" ${ref(el => { refs.sourceHeader = el; })}><p class="source ${isPassage ? 'passage' : ''}" ${ref(el => { refs.source = el; })}>${sourceText}</p></div>
      <p class="answer" aria-live="polite" ${ref(el => { refs.answer = el; })}>${error || '正在给出一条线索…'}</p>
      <p class="sentence-line" lang="zh-CN" hidden ${ref(el => { refs.sentenceLine = el; })}></p>
      <dl class="explanation" aria-live="polite" ${ref(el => { refs.explanation = el; })}></dl>
      <details class="sentence" ?hidden=${isPassage || !contextText} ${ref(el => { refs.sentence = el; })}>
        <summary ${ref(el => { refs.sentenceSummary = el; })}>本句翻译</summary>
        <dl class="explanation" ${ref(el => { refs.sentenceBody = el; })}>
          <dt class="sentence-label" ${ref(el => { refs.originalLabel = el; })}>英文原文</dt><dd class="sentence-original" lang="en" ${ref(el => { refs.original = el; })}>${contextText}</dd>
          <dt>中文翻译</dt><dd class="sentence-translation" lang="zh-CN" ${ref(el => { refs.sentenceTranslation = el; })}>${error ? '尚未获取本句翻译。' : '展开后获取本句翻译。'}</dd>
        </dl>
      </details>
      <button type="button" class="language-action" ?hidden=${Boolean(error)} ${ref(el => { refs.rescue = el; })} @click=${handlers.rescue}>用中文说明</button>
      <button type="button" class="known-action" ?hidden=${!knownAvailable} ${ref(el => { refs.known = el; })} @click=${handlers.known}>我已认识</button>
      <button type="button" hidden ${ref(el => { refs.retry = el; })} @click=${handlers.retry}>重试</button>
      <details class="more" ?hidden=${Boolean(error)} ${ref(el => { refs.more = el; })}>
        <summary>更多</summary>
        <button type="button" ?disabled=${Boolean(error)} ${ref(el => { refs.wrong = el; })} @click=${handlers.wrong}>解释不对</button>
        <button type="button" disabled ${ref(el => { refs.less = el; })} @click=${handlers.less}>少提示这个用法</button>
      </details>
      <p class="minor note" ${ref(el => { refs.note = el; })}></p>
      <p class="minor speech-notice" role="status" ${ref(el => { refs.speechNotice = el; })}></p>
      <button type="button" hidden ${ref(el => { refs.repair = el; })} @click=${handlers.repair}>连接或修复服务</button>
    </section>`, shadow);
  return refs;
}

// ---------- 文本片段渲染（术语高亮 / 释义行） ----------
// 原 content.js explanationText：按词与释义切出 <code.inline-term>/<strong.meaning-key>
// 强调片段；现在产出 lit parts，由 renderExplanationText / renderMeaningRows 渲染。

function explanationParts(text, word, definition = '') {
  const terms = [
    {text: word, cls: 'inline-term', tag: 'code'},
    {text: definition, cls: 'meaning-key', tag: 'strong'},
  ].filter(term => typeof term.text === 'string' && term.text.trim() && term.text.length <= 80)
    .sort((a, b) => b.text.length - a.text.length);
  if (!terms.length) return [text];
  const pattern = terms.map(term => '(' + term.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')').join('|');
  const parts = [];
  let offset = 0;
  for (const match of String(text).matchAll(new RegExp(pattern, 'giu'))) {
    const start = match.index, end = start + match[0].length;
    if (/[A-Za-z0-9_]/.test(match[0][0]) && /[A-Za-z0-9_]/.test(text[start - 1] || '') || /[A-Za-z0-9_]/.test(match[0].at(-1)) && /[A-Za-z0-9_]/.test(text[end] || '')) continue;
    if (start > offset) parts.push(text.slice(offset, start));
    const term = terms[match.findIndex((value, index) => index > 0 && value !== undefined) - 1];
    parts.push(term.tag === 'code'
      ? html`<code class=${term.cls}>${match[0]}</code>`
      : html`<strong class=${term.cls}>${match[0]}</strong>`);
    offset = end;
  }
  if (offset < text.length) parts.push(text.slice(offset));
  return parts;
}

// 等价于原 explanationText(parent,text,word,definition)：整容器重渲染。
export function renderExplanationText(parent, text, word, definition = '') {
  render(html`${explanationParts(text, word, definition)}`, parent);
}

// 等价于原 dt 标签 + dd 释义行（showDetails/showAssistProgress 的构建片段）。
// rows: [{label, text, lang, word, definition}]
export function renderMeaningRows(dl, rows) {
  render(html`${rows.map(row => html`<dt>${row.label}</dt><dd lang=${row.lang}>${explanationParts(row.text, row.word, row.definition)}</dd>`)}`, dl);
}

// ---------- 伴读猫控件骨架（floating-pet.js 经 chrome.scripting 动态注册） ----------
// 只迁移静态 DOM 骨架；状态更新仍由 floating-pet.js 经 shadowQuery 命令式驱动。
// catSvg / peekingCatSvg 为内部可信 SVG 标记，经 unsafeHTML 注入（数据内容一律走文本绑定）。

export function petWidget(shadow, {domainTag = '', catSvg = '', peekingCatSvg = '', onEdgeTabClick} = {}) {
  render(html`
    <div class="roamcat-pet-widget">
      <div class="roamcat-edge-tab" id="roamcat-edge-tab" aria-label="伴读猫贴边标签（点击唤醒）" title="伴读猫正在贴边守护（悬停探出，点击唤醒）" @click=${event => { event.stopPropagation(); onEdgeTabClick?.(); }}>
        <div class="edge-tab-inner">
          <span class="edge-tab-paw">🐾</span>
          <span class="edge-tab-dot"></span>
        </div>
      </div>
      <div class="roamcat-quick-dock">
        <button type="button" class="roamcat-quick-btn" id="quick-reading" aria-label="开启或暂停本页阅读辅助" title="阅读辅助 · 点击开关">
          <span class="quick-glyph" aria-hidden="true">📖</span>
          <span class="quick-tooltip">阅读辅助 · 点击开关</span>
        </button>
        <button type="button" class="roamcat-quick-btn" id="quick-summary" aria-label="提炼整篇文章的精华" title="提炼整篇精华">
          <span class="quick-glyph" aria-hidden="true">📝</span>
          <span class="quick-tooltip">提炼整篇精华</span>
        </button>
        <button type="button" class="roamcat-quick-btn" id="quick-options" aria-label="打开扩展偏好设置" title="扩展设置">
          <span class="quick-glyph" aria-hidden="true">⚙️</span>
          <span class="quick-tooltip">扩展设置</span>
        </button>
        <button type="button" class="roamcat-quick-btn" id="quick-dock" aria-label="贴边折叠伴读猫" title="贴边折叠">
          <span class="quick-glyph" aria-hidden="true">�</span>
          <span class="quick-tooltip">贴边折叠</span>
        </button>
        <button type="button" class="roamcat-flip-btn" id="roamcat-flip-btn" aria-label="旋旋翻 · 双语对照快捷切换">
          <div class="flip-coin">
            <div class="coin-face coin-face-front">
              <span class="coin-glyph-bilingual">
                <span class="glyph-main">中</span><span class="glyph-sep">/</span><span class="glyph-sub">En</span>
              </span>
            </div>
            <div class="coin-face coin-face-back">
              <span class="coin-glyph-active-box">
                <span class="coin-active-dot"></span>
                <span class="coin-glyph-active">双语</span>
              </span>
            </div>
          </div>
          <svg class="flip-orbit-ring" viewBox="0 0 34 34">
            <circle class="orbit-bg" cx="17" cy="17" r="15" />
            <circle class="orbit-active" cx="17" cy="17" r="15" />
          </svg>
          <div class="flip-tooltip" id="flip-tooltip">旋旋翻 · 双语全文对照 (Alt+Shift+T)</div>
        </button>
      </div>
      <div class="roamcat-avatar-wrap" title="RoamCat 随心阅伴读猫（点击展开快捷菜单，双击贴边收起，按住自由拖拽）">
        <div class="cat-speech-bubble" id="cat-speech">
          <span class="speech-spinner" id="speech-spinner"></span>
          <span class="speech-text" id="speech-text">漫游伴读 喵~</span>
          <button type="button" class="speech-close-btn" id="speech-close-btn" title="隐藏提示">✕</button>
        </div>
        <div class="cat-zzz-wrap" aria-hidden="true">
          <span class="zzz-item zzz-1">z</span>
          <span class="zzz-item zzz-2">z</span>
          <span class="zzz-item zzz-3">Z</span>
        </div>
        <div class="cat-mode-roaming" id="cat-mode-roaming">${unsafeHTML(catSvg)}</div>
        <div class="cat-mode-peeking" id="cat-mode-peeking">${unsafeHTML(peekingCatSvg)}</div>
      </div>
      <div class="roamcat-bubble-menu">
        <div class="menu-header">
          <div class="menu-title">
            <span class="menu-pulse-dot"></span>
            <span>RoamCat 伴读猫</span>
          </div>
          <div class="menu-header-right">
            <button type="button" class="menu-theme-btn" id="btn-theme-toggle" title="切换显示模式：随网页感知 / 暗色 / 亮色">🌓</button>
            <span class="menu-domain-tag" id="menu-domain">${domainTag}</span>
            <button type="button" class="menu-close-btn" id="btn-menu-close" title="关闭菜单">✕</button>
          </div>
        </div>
        <button type="button" class="menu-item primary-action" id="btn-summary">
          <span class="menu-item-icon">📝</span>
          <div class="menu-item-info">
            <span class="menu-item-label">提炼整篇精华</span>
            <span class="menu-item-sub">一键提取核心结论与论点</span>
          </div>
          <span class="menu-item-badge" title="快捷键">Alt+Shift+M</span>
        </button>
        <button type="button" class="menu-item" id="btn-options">
          <span class="menu-item-icon">⚙️</span>
          <div class="menu-item-info">
            <span class="menu-item-label">扩展偏好设置</span>
            <span class="menu-item-sub">模型配置与偏好微调</span>
          </div>
        </button>
        <button type="button" class="menu-item" id="btn-dock">
          <span class="menu-item-icon">🐾</span>
          <div class="menu-item-info">
            <span class="menu-item-label">贴边折叠</span>
            <span class="menu-item-sub">缩至屏幕边缘休息</span>
          </div>
        </button>
      </div>
    </div>
    <div class="roamcat-summary-window">
      <div class="summary-header">
        <div class="summary-header-title">
          <span>✨</span>
          <span>RoamCat · 文章精华导读</span>
          <span class="menu-domain-tag" id="summary-domain-badge">${domainTag}</span>
        </div>
        <div class="summary-header-actions">
          <button type="button" class="summary-action-btn" id="summary-header-refresh" title="重新提炼全文">🔄</button>
          <button type="button" class="summary-close-btn" id="summary-close" title="关闭 (Esc)">✕</button>
        </div>
      </div>
      <div class="summary-body" id="summary-content"></div>
      <div class="summary-footer">
        <span class="summary-source-meta" id="summary-meta">⚡ RoamCat · AI 深度提炼</span>
        <div class="summary-footer-actions">
          <button type="button" class="footer-btn" id="summary-footer-refresh">
            <span>🔄</span>
            <span>重新提炼</span>
          </button>
          <button type="button" class="footer-btn primary" id="summary-copy-btn">
            <span>📋</span>
            <span id="copy-btn-text">复制摘要</span>
          </button>
        </div>
      </div>
    </div>`, shadow);
  const el = q(shadow);
  return {
    container: el('.roamcat-pet-widget'), edgeTab: el('.roamcat-edge-tab'),
    flipBtn: el('.roamcat-flip-btn'), quickDock: el('.roamcat-quick-dock'),
    avatarWrap: el('.roamcat-avatar-wrap'), bubbleMenu: el('.roamcat-bubble-menu'),
    summaryWindow: el('.roamcat-summary-window'),
  };
}

// ---------- 伴读猫摘要窗内容渲染（替代原 renderSummary* 的 innerHTML 写入） ----------

export function renderPetSummaryLoading(container) {
  render(html`
    <div class="summary-loading">
      <div class="loading-cat-paws">🐾</div>
      <div class="loading-text">🐱 RoamCat 正在快速通读全文，提炼核心结论、主要论点与专业概念...</div>
    </div>`, container);
}

export function renderPetSummaryError(container, {message = '', onRetry, onOpenSettings} = {}) {
  render(html`
    <div class="summary-error">
      <strong>⚠️ 摘要提取遇到问题</strong>
      <span>${message}</span>
      <div style="display: flex; gap: 8px; margin-top: 6px;">
        <button type="button" class="footer-btn" id="summary-retry-btn" @click=${onRetry}>重新尝试</button>
        <button type="button" class="footer-btn" id="summary-open-settings-btn" @click=${onOpenSettings}>前往扩展设置</button>
      </div>
    </div>`, container);
}

// highlight 文本中的 **强调** 片段（等价于原 formatHighlight：escapeHtml 后包 strong.hl-bold）。
function highlightParts(text) {
  const parts = [];
  let rest = String(text ?? '');
  while (rest) {
    const open = rest.indexOf('**');
    if (open < 0) { parts.push(rest); break; }
    const close = rest.indexOf('**', open + 2);
    if (close < 0) { parts.push(rest); break; }
    if (open) parts.push(rest.slice(0, open));
    parts.push(html`<strong class="hl-bold">${rest.slice(open + 2, close)}</strong>`);
    rest = rest.slice(close + 2);
  }
  return parts;
}

// meta: {words, minutes, domainIcon, domainName}; highlights: string[]; keywords: string[]
// onKeywordClick(pill, keyword)：由调用方负责复制反馈（与原 querySelectorAll 绑定等价）。
export function renderPetSummaryContent(container, {meta, takeaway = '', highlights = [], keywords = [], onKeywordClick} = {}) {
  render(html`
    <div class="summary-meta-strip">
      <div class="meta-item">
        <span>📖</span>
        <span>全文约 ${meta.words.toLocaleString()} 词</span>
      </div>
      <span class="meta-sep">/</span>
      <div class="meta-item">
        <span>⏱️</span>
        <span>预估精读 ${meta.minutes} 分钟</span>
      </div>
      <span class="meta-sep">/</span>
      <div class="meta-item">
        <span>${meta.domainIcon}</span>
        <span class="meta-domain-pill">${meta.domainName}</span>
      </div>
    </div>
    <div class="takeaway-card">
      <div class="takeaway-label">💡 核心精粹 Takeaway</div>
      <div class="takeaway-text">${takeaway}</div>
    </div>
    <div class="highlights-section">
      <div class="section-subtitle">📌 主要论点与关键事实</div>
      <ul class="highlight-list">
        ${highlights.map((hl, idx) => html`
          <li class="highlight-item">
            <span class="highlight-num">${String(idx + 1).padStart(2, '0')}</span>
            <div class="highlight-content">${highlightParts(hl)}</div>
          </li>`)}
      </ul>
    </div>
    ${keywords.length ? html`
      <div class="highlights-section">
        <div class="section-subtitle">🏷️ 专业概念与术语（点击复制）</div>
        <div class="keywords-wrap">
          ${keywords.map(kw => html`<span class="keyword-pill" data-keyword=${kw} title="点击复制" @click=${event => { event.stopPropagation(); onKeywordClick?.(event.currentTarget, kw); }}>${kw}</span>`)}
        </div>
      </div>` : nothing}`, container);
}
