/**
 * @file tools/verify-ui-all.mjs
 * 文件职责：全界面 UI 门禁（npm run verify:ui）——在 ego lite 里遍历所有扩展页（popup / options 全分区 / welcome / reader）
 *   与页内挂件（词卡 HUD / 任务状态条 / 解构详情卡 / 已认识 toast / 选区操作条 / 伴读猫全状态），双主题断言并截图。
 * 主要内容：A 扩展页双主题与 options 四档宽度无横向溢出；B 本地 fixture 文章页上真实 content script 环境渲染各挂件；
 *   C 伴读猫快捷坞 / 贴边 / 气泡 / 语录 / 精华窗；D 英文档语言切换链路（options / popup / content script）。
 *   截图尽力而为（ego 窗口被挡住时跳过并记警告），判定只看 DOM 断言。
 * 模块边界：普通 Node 运行，先 npm run build；无头 ego lite 用临时配置加载 dist/extension；报告与截图写 preview/ui-audit/。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import fs from 'node:fs';
import path from 'node:path';
import {REPO, openBrowser, extUrl, noteScreenshots, previewPath, staticServer, tabIdOf} from './lib/ego.mjs';

const out = previewPath('ui-audit');
// 每轮先清掉上次留下的截图：旧版本生成的文件（如 pet-*.png.png）会混在新截图里误导审查。
if (fs.existsSync(out)) for (const name of fs.readdirSync(out)) if (/\.png$/i.test(name)) fs.rmSync(path.join(out, name), {force: true});
fs.mkdirSync(out, {recursive: true});

const OPTION_SECTIONS = ['assistance', 'appearance', 'sites', 'video', 'service', 'terms', 'personalization', 'history', 'privacy', 'shortcuts', 'guide', 'diagnostics'];
const THEMES = ['light', 'dark'];

const report = {checks: [], failures: [], warnings: [], consoleErrors: {}, overflow: [], widgets: {}};
const check = (name, cond, detail = '') => {
  if (cond) report.checks.push(name);
  else report.failures.push(detail ? `${name} — ${detail}` : name);
  return cond;
};
const warn = (name, detail) => report.warnings.push(detail ? `${name} — ${detail}` : name);
// 现场拼一份单页 PDF（Helvetica 一行文字），xref 偏移按字节算，供阅读器走真实 pdfjs 解析。
const tinyPdf = (text) => {
  const stream = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => { const at = Buffer.byteLength(body); body += `${index + 1} 0 obj\n${object}\nendobj\n`; return at; });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(at => String(at).padStart(10, '0') + ' 00000 n \n').join('')}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
};
const shot = async (page, name, {fullPage = false, minBytes = 40000} = {}) => {
  const file = path.join(out, name + '.png');
  if (!(await page.screenshot({path: file, fullPage}))) return;
  // 合成器竞态白屏自检：整页近乎纯色的 PNG 极小，等待重截一次
  if (fs.existsSync(file) && fs.statSync(file).size < minBytes) {
    await page.waitForTimeout(800);
    if (!(await page.screenshot({path: file, fullPage}))) return;
    if (fs.statSync(file).size < minBytes) {
      // 压平后的弹窗和阅读器空态 PNG 会低于体积阈值，但页面上仍有正文；只有几乎没有可见文字才算白屏。
      const textLength = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, '').length).catch(() => 0);
      if (textLength < 24) report.warnings.push(`截图疑似空白: ${name}.png (${fs.statSync(file).size}B)`);
    }
  }
};
const shotLocator = async (locator, name) => { await locator.screenshot({path: path.join(out, name + '.png')}).catch(error => warn(`挂件截图失败: ${name}`, error.message)); };

const watchPage = (page, tag, reportErrors = true) => {
  page.on('pageerror', e => report.failures.push(`页面脚本异常[${tag}]: ${e.message} :: ${String(e.stack || '').split('\n')[1] || ''}`.trim()));
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    // 资源加载失败的报错文本不含地址，补上来源 URL 才知道是哪个文件。
    const source = msg.location()?.url;
    (report.consoleErrors[tag] ||= []).push((msg.text() + (source ? ` @ ${source}` : '')).slice(0, 300));
  });
  if (reportErrors) page.on('requestfailed', req => {
    const url = req.url();
    if (url.startsWith('chrome-extension://invalid')) return;
    if (url.startsWith('chrome-extension://') || url.startsWith('http://127.0.0.1')) {
      (report.consoleErrors[tag] ||= []).push('请求失败: ' + url.slice(0, 160));
    }
  });
};

const setTheme = async (page, theme) => {
  await page.evaluate(t => localStorage.setItem('roamcat_ui_theme', t), theme);
};

const server = await staticServer(path.join(REPO, 'tools/fixtures'));
const fixtureBase = server.base;
const pdfFile = previewPath('ui-audit', 'sample.pdf');
fs.writeFileSync(pdfFile, tinyPdf('The quiet machinery of morning wakes the city.'));
const run = await openBrowser();
try {
  const extPage = await run.newPage();
  await extPage.setViewportSize({width: 1440, height: 1000}, 1);
  await extPage.goto(extUrl('ui/options.html'));
  watchPage(extPage, 'options');

  // ========== A. 扩展页：options 全分区 / welcome / reader / popup，双主题 ==========
  for (const theme of THEMES) {
    await setTheme(extPage, theme);
    await extPage.goto(extUrl(`ui/options.html#${OPTION_SECTIONS[0]}`));
    await extPage.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    for (const section of OPTION_SECTIONS) {
      if (section !== OPTION_SECTIONS[0]) {
        await extPage.evaluate(s=>{location.hash='#'+s},`${section}`);
      }
      await extPage.waitForTimeout(450);
      await extPage.locator('.main-panel').evaluate(el => el.scrollTo(0, 0)).catch(() => {});
      // 六个分组：侧栏分组高亮；组内有多个分区时，对应标签也要高亮。
      check(`options 分区激活[${section}]`, await extPage.evaluate(name => { const tab = document.querySelector(`[data-section="${name}"]`); return Boolean(document.querySelector('[data-group].active')) && (!tab || tab.classList.contains('active')); }, section));
      const filled = await extPage.evaluate(name => {
        const el = document.getElementById(name);
        return el && !el.hidden && el.children.length;
      }, section);
      check(`options 分区渲染内容[${section}]`, Boolean(filled), `可见 children=${filled}`);
      await shot(extPage, `options-${section}-${theme}`);
    }
    const pageTheme = await extPage.evaluate(() => document.documentElement.getAttribute('data-theme'));
    check(`options 主题生效[${theme}]`, pageTheme === theme, `data-theme=${pageTheme}`);

    // welcome
    const welcome = await run.newPage();
    await welcome.setViewportSize({width: 1440, height: 1000}, 1);
    watchPage(welcome, 'welcome');
    await welcome.goto(extUrl('ui/welcome.html'));
    await welcome.waitForTimeout(500);
    const welcomeLen = await welcome.evaluate(() => document.querySelector('roamcat-welcome')?.innerHTML.length || 0);
    check(`welcome 渲染[${theme}]`, welcomeLen > 500, `innerHTML=${welcomeLen}`);
    check(`welcome 沙盒就绪[${theme}]`, await welcome.locator('.sandbox-browser-mockup').isVisible().catch(() => false));
    // 步骤卡片用 scroll-timeline 入场，回顶即复位——整页截图前直接禁用入场动画
    await welcome.addStyleTag({content: '.welcome-step-card { animation: none !important; opacity: 1 !important; transform: none !important; }'});
    await welcome.waitForTimeout(300);
    await shot(welcome, `welcome-${theme}`, {fullPage: true});
    await welcome.close();

    // reader：空态 + 注入文档的 ready 态
    const reader = await run.newPage();
    await reader.setViewportSize({width: 1440, height: 1000}, 1);
    watchPage(reader, 'reader');
    await reader.goto(extUrl('ui/reader.html'));
    await reader.waitForTimeout(400);
    check(`reader 空态[${theme}]`, await reader.locator('.reader-status-card').isVisible());
    await shot(reader, `reader-empty-${theme}`);
    // 真实走一遍 pdfjs：曾因 pdfjs 6 去掉 doc.destroy()，解析完最后一页才报错、整份 PDF 打不开。
    await reader.setInputFiles('#reader-file', pdfFile);
    await reader.waitForFunction(() => document.querySelectorAll('.reader-block').length > 0 || /pdf|PDF|无法|failed/i.test(document.querySelector('.reader-status-card')?.textContent || ''), undefined, {timeout: 15000}).catch(() => {});
    check(`reader 真实 PDF 解析[${theme}]`, await reader.locator('.reader-block').count() > 0, await reader.locator('.reader-status-card').textContent().catch(() => ''));
    await reader.evaluate(() => {
      const el = document.querySelector('roamcat-reader');
      const blocks = [
        {id: 'b1', anchor: 'sec-c0', role: 'h1', text: 'The Quiet Machinery of Morning'},
        {id: 'b2', anchor: '', role: 'p', text: 'The city wakes before its people. Delivery trucks exhale at the curb, and the streetlights surrender their amber watch to a pale and widening sky.'},
        {id: 'b3', anchor: '', role: 'p', text: 'In a third-floor apartment, a kettle begins its slow ascent toward a whistle — the day’s first small argument against silence.'},
        {id: 'b4', anchor: 'sec-c1', role: 'h2', text: 'A Language of Small Things'},
        {id: 'b5', anchor: '', role: 'p', text: 'We rarely notice the grammar of ordinary objects: the comma of a paused elevator, the ellipsis of an unfinished letter.'}
      ];
      el.finishLoad('The Quiet Machinery of Morning · 演示文档', 'epub',
        [{anchor: 'sec-c0', label: '一 · 清晨的机器'}, {anchor: 'sec-c1', label: '二 · 小事物的语言'}], blocks);
      el.translations = new Map([
        ['b2', '城市比它的居民更早醒来。货车在路边排气，街灯把琥珀色的守夜交给渐亮的天空。'],
        ['b3', '在三楼的一间公寓里，水壶开始缓慢升温，逼近一声哨响——这是白昼对寂静发起的第一个小小抗争。'],
        ['b5', '我们很少注意日常物件的语法：电梯暂停时的逗号，未写完信件的省略号。']
      ]);
    });
    await reader.waitForTimeout(300);
    check(`reader 文档渲染[${theme}]`, await reader.locator('.reader-block').count() === 5);
    check(`reader 双语译文[${theme}]`, await reader.locator('.reader-translation').count() === 3);
    await shot(reader, `reader-doc-${theme}`);
    await reader.close();

    // popup：独立页面 + 窄视口
    const popup = await run.newPage();
    watchPage(popup, 'popup');
    await popup.setViewportSize({width: 420, height: 720}, 1);
    await popup.goto(extUrl('ui/popup.html'));
    await popup.waitForTimeout(450);
    const popupState = await popup.evaluate(() => {
      const el = document.querySelector('roamcat-popup');
      return {len: el?.innerHTML.length || 0, buttons: el?.querySelectorAll('button').length || 0};
    });
    check(`popup 渲染[${theme}]`, popupState.len > 500 && popupState.buttons >= 2, JSON.stringify(popupState));
    await shot(popup, `popup-${theme}`);
    await popup.close();
    await extPage.bringToFront();
  }

  // 响应式：options 主面板在 4 档宽度下不得横向溢出
  await setTheme(extPage, 'light');
  await extPage.goto(extUrl('ui/options.html#assistance'));
  for (const width of [1440, 1100, 800, 480]) {
    await extPage.setViewportSize({width, height: 1000});
    await extPage.waitForTimeout(350);
    await extPage.locator('.main-panel').evaluate(el => el.scrollTo(0, 0)).catch(() => {});
    await shot(extPage, `options-width-${width}`);
    const overflow = await extPage.evaluate(() =>
      [...document.querySelectorAll('.main-panel, .main-canvas-content, .compact-hero-banner, .swiss-card')]
        .filter(el => el.getBoundingClientRect().width && el.scrollWidth > el.clientWidth + 2)
        .map(el => ({cls: String(el.className).slice(0, 60), w: el.clientWidth, sw: el.scrollWidth})));
    if (overflow.length) report.overflow.push({width, overflow});
    check(`options 无横向溢出[${width}px]`, overflow.length === 0, JSON.stringify(overflow).slice(0, 200));
  }
  await extPage.setViewportSize({width: 1440, height: 1000});

  // ========== B. 页内挂件：fixture 文章页上真实 content script 环境 ==========
  const tab = await run.newPage();
  await tab.setViewportSize({width: 1440, height: 1000}, 1);
  watchPage(tab, 'page');
  await tab.goto(`${fixtureBase}/sites/devto-article.html`);
  await tab.waitForTimeout(900);
  await tab.locator('#roamcat-pet-host').waitFor({state: 'attached', timeout: 10000})
    .catch(() => report.failures.push('伴读猫宿主未注入页面'));
  await tab.bringToFront();

  const execInTab = async (fnStr) => {
    const tabId = await tabIdOf(extPage, `${fixtureBase}/*`);
    const frames = await extPage.evaluate(async ({tabId, fnStr}) =>
      chrome.scripting.executeScript({target: {tabId}, func: new Function('return (' + fnStr + ')()')}), {tabId, fnStr});
    return frames?.[0]?.result;
  };
  const petHostReady = await execInTab(`() => Boolean(document.querySelector('#roamcat-pet-host') && globalThis.RoamCatContentUI)`);
  check('content script 与 RoamCatContentUI 就绪', Boolean(petHostReady));

  const WIDGET_HOST = (own, css) => `(() => {
    window.__probe = window.__probe || {};
    window.__probe[${JSON.stringify(own)}]?.host?.remove();
    const host = document.createElement('div');
    host.setAttribute('data-roamcat-ui', ${JSON.stringify(own)});
    host.style.cssText = ${JSON.stringify(css)};
    const shadow = host.attachShadow({mode: 'closed'});
    window.__probe = window.__probe || {};
    window.__probe[${JSON.stringify(own)}] = {host, shadow};
    document.documentElement.append(host);
    return {host, shadow};
  })()`;

  const iconUrl = await execInTab(`() => chrome.runtime.getURL('icons/roamcat.svg')`);

  // B1. 词卡 HUD —— word / passage / error 三种形态 × 双主题
  for (const theme of THEMES) {
    await execInTab(`() => {
      const {host, shadow} = ${WIDGET_HOST('card', `position:fixed;z-index:2147483647;width:min(360px,calc(100vw - 24px));left:24px;top:24px`)};
      host.setAttribute('data-theme', '${theme}');
      const refs = globalThis.RoamCatContentUI.wordCard(shadow, {
        brandIconUrl: ${JSON.stringify(iconUrl)}, kind: 'word', sourceText: 'serendipity',
        contextText: 'It was pure serendipity that we met at the station that morning.',
        knownAvailable: true, handlers: {}
      });
      refs.answer.textContent = 'n. 意外发现珍奇事物的运气；机缘巧合';
      refs.sentenceLine.hidden = false;
      refs.sentenceLine.textContent = '那天早上我们在车站相遇纯属机缘巧合。';
      globalThis.RoamCatContentUI.renderMeaningRows(refs.explanation, [
        {label: '释义', text: 'the faculty of making happy and unexpected discoveries by accident', lang: 'en', word: 'serendipity', definition: '意外发现'},
        {label: '助记', text: 'serene + dip：心情平静时，偶然“蘸”到惊喜', lang: 'zh-CN', word: '', definition: ''}
      ]);
      window.__probe.cardRefs = refs;
      return true;
    }`);
    await tab.waitForTimeout(250);
    const cardRect = await execInTab(`() => { const r = window.__probe.card.host.getBoundingClientRect(); return {w: Math.round(r.width), h: Math.round(r.height)}; }`);
    check(`词卡 HUD 尺寸正常[${theme}]`, cardRect.w > 240 && cardRect.h > 80, JSON.stringify(cardRect));
    await shotLocator(tab.locator('[data-roamcat-ui="card"]'), `widget-wordcard-${theme}`);
  }
  await execInTab(`() => {
    const {host, shadow} = ${WIDGET_HOST('card', `position:fixed;z-index:2147483647;width:min(360px,calc(100vw - 24px));left:24px;top:24px`)};
    window.__probe.cardRefs = globalThis.RoamCatContentUI.wordCard(shadow, {brandIconUrl: ${JSON.stringify(iconUrl)}, kind: 'passage', sourceText: 'The city wakes before its people. Delivery trucks exhale at the curb, and the streetlights surrender their amber watch.', isPassage: true, contextText: '', handlers: {}});
    window.__probe.cardRefs.answer.textContent = '城市比它的居民更早醒来。货车在路边排气，街灯交出了琥珀色的守望。';
    return true;
  }`);
  await tab.waitForTimeout(200);
  await shotLocator(tab.locator('[data-roamcat-ui="card"]'), 'widget-wordcard-passage');
  await execInTab(`() => {
    const {host, shadow} = ${WIDGET_HOST('card', `position:fixed;z-index:2147483647;width:min(360px,calc(100vw - 24px));left:24px;top:24px`)};
    window.__probe.cardRefs = globalThis.RoamCatContentUI.wordCard(shadow, {brandIconUrl: ${JSON.stringify(iconUrl)}, kind: 'word', sourceText: 'unobtainium', error: '本地模型服务暂时不可用，请稍后重试。', handlers: {retry() {}, repair() {}}});
    return true;
  }`);
  await tab.waitForTimeout(200);
  await shotLocator(tab.locator('[data-roamcat-ui="card"]'), 'widget-wordcard-error');
  await execInTab(`() => window.__probe.card.host.remove()`);

  // B2. 任务状态条：忙 / 详情展开 / 错误
  await execInTab(`() => {
    const {host, shadow} = ${WIDGET_HOST('task-status', `position:fixed;top:max(16px,env(safe-area-inset-top));right:max(16px,env(safe-area-inset-right));z-index:2147483647;max-width:calc(100vw - 32px);pointer-events:none`)};
    const refs = globalThis.RoamCatContentUI.taskStatus(shadow, {brandIconUrl: ${JSON.stringify(iconUrl)}, onClose: () => {}});
    refs.label.textContent = '正在分析页面结构';
    refs.count.textContent = '3/12';
    refs.indicator.dataset.busy = 'true';
    refs.detail.textContent = '已处理：github-readme 正文区\\n排队：评论区 4 个区块\\n预计剩余 20 秒';
    window.__probe.status = refs;
    return true;
  }`);
  await tab.waitForTimeout(250);
  await shotLocator(tab.locator('[data-roamcat-ui="task-status"]'), 'widget-taskstatus-busy');
  await execInTab(`() => { window.__probe.status.more.click(); return true; }`);
  await tab.waitForTimeout(200);
  const detailVisible = await execInTab(`() => !window.__probe.status.detail.hidden && window.__probe.status.more.getAttribute('aria-expanded') === 'true'`);
  check('任务状态条详情展开', Boolean(detailVisible));
  await shotLocator(tab.locator('[data-roamcat-ui="task-status"]'), 'widget-taskstatus-detail');
  await execInTab(`() => { const s = window.__probe.status; s.indicator.dataset.busy = 'false'; s.indicator.dataset.error = 'true'; s.panel.dataset.error = 'true'; s.label.textContent = '阅读辅助遇到问题'; s.collapse(); return true; }`);
  await tab.waitForTimeout(200);
  await shotLocator(tab.locator('[data-roamcat-ui="task-status"]'), 'widget-taskstatus-error');
  await execInTab(`() => window.__probe['task-status'].host.remove()`);

  // B3. 解构详情卡（真实 structureRoles/structureColors）
  await execInTab(`() => {
    const {host, shadow} = ${WIDGET_HOST('sentence-detail', `position:fixed;z-index:2147483646;width:min(340px,calc(100vw - 32px));left:24px;top:24px`)};
    const refs = globalThis.RoamCatContentUI.sentenceDetail(shadow, {brandIconUrl: ${JSON.stringify(iconUrl)}, onClose: () => {}});
    const sentence = 'The city wakes before its people.';
    const groups = [
      {parent: -1, role: 'clause', start: 0, end: 31},
      {parent: 0, role: 'subject', start: 0, end: 8},
      {parent: 0, role: 'predicate', start: 9, end: 14},
      {parent: 0, role: 'adverbial', start: 15, end: 31},
      {parent: 3, role: 'object', start: 22, end: 31}
    ];
    const D = globalThis.RoamCatDesign;
    globalThis.RoamCatContentUI.renderStructureTree(refs.tree, {
      groups, sentence,
      // 与 content.js 一致经 i18n 翻译角色名，门禁截图才能发现解构卡的文案回归。
      roleLabel: role => globalThis.RoamCatI18n.t((D.structureRoles[role] || ['?', 'neutral'])[0]),
      roleColor: role => (D.structureColors[(D.structureRoles[role] || [0, 'neutral'])[1]] || ['#666'])[0]
    });
    return true;
  }`);
  await tab.waitForTimeout(250);
  const treeItems = await execInTab(`() => window.__probe['sentence-detail'].shadow.querySelectorAll('li').length`);
  check('解构详情卡树渲染', treeItems >= 5, `li=${treeItems}`);
  await shotLocator(tab.locator('[data-roamcat-ui="sentence-detail"]'), 'widget-sentence-detail');
  await execInTab(`() => window.__probe['sentence-detail'].host.remove()`);

  // B4. 已认识 toast
  await execInTab(`() => {
    const {host, shadow} = ${WIDGET_HOST('known-feedback', `position:fixed;left:50%;bottom:max(20px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 24px)`)};
    globalThis.RoamCatContentUI.knownFeedback(shadow, {brandIconUrl: ${JSON.stringify(iconUrl)}, term: 'serendipity', onUndo: () => {}});
    return true;
  }`);
  await tab.waitForTimeout(250);
  await shotLocator(tab.locator('[data-roamcat-ui="known-feedback"]'), 'widget-known-feedback');
  await execInTab(`() => window.__probe['known-feedback'].host.remove()`);

  // B5. 选区操作条：先启用阅读辅助（真实 SW 管线），再真实鼠标拖选触发（isTrusted 必需）
  await extPage.evaluate(tabId=>chrome.runtime.sendMessage({type:'PAGE_UI_INJECT',tabId}),await tabIdOf(extPage,`${fixtureBase}/*`));
  await execInTab(`() => globalThis.__ROAMCAT_CONTENT__?.setManualEnabled?.(true) ?? Promise.resolve()`);
  await tab.waitForTimeout(1500);
  const assistState = await execInTab(`() => { const s = globalThis.__ROAMCAT_CONTENT__?.status?.(); return s ? {enabled: s.enabled, paused: s.paused} : null; }`);
  check('阅读辅助已启用', Boolean(assistState?.enabled), JSON.stringify(assistState));
  await tab.evaluate(() => { window.scrollTo(0, 200); });
  await tab.bringToFront();
  const paraBox = await tab.locator('p').first().boundingBox();
  if (paraBox) {
    await tab.mouse.move(paraBox.x + 4, paraBox.y + paraBox.height / 2);
    await tab.mouse.down();
    await tab.mouse.move(Math.min(paraBox.x + paraBox.width - 4, paraBox.x + 320), paraBox.y + paraBox.height / 2, {steps: 10});
    await tab.mouse.up();
    await tab.waitForTimeout(500);
    const barVisible = await tab.locator('[data-roamcat-ui="passage-action"]').isVisible().catch(() => false);
    if (barVisible) {
      check('选区操作条出现', true);
      await shotLocator(tab.locator('[data-roamcat-ui="passage-action"]'), 'widget-selection-bar');
      await execInTab(`() => { document.querySelector('[data-roamcat-ui="passage-action"]')?.remove(); getSelection()?.removeAllRanges(); return true; }`);
    } else warn('选区操作条未出现', '可能阅读辅助在该页默认关闭');
  } else warn('选区操作条未测试', 'fixture 无段落');

  // ========== C. 伴读猫：dock / 气泡 / 引用 / 精华窗 / 缩放，双主题 ==========
  const bubbleInside = () => execInTab(`() => {
    const b = document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#cat-speech').getBoundingClientRect();
    return b.left >= -0.5 && b.right <= innerWidth + 0.5 && b.top >= -0.5 && b.bottom <= innerHeight + 0.5;
  }`);

  await execInTab(`() => globalThis.RoamCatPet.openQuickDock()`);
  await tab.waitForTimeout(650);
  const dockOpen = await execInTab(`() => document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('.roamcat-pet-widget').classList.contains('dock-open')`);
  check('伴读猫快捷坞展开', Boolean(dockOpen));
  await shot(tab, 'pet-dock-open');

  await execInTab(`() => { globalThis.RoamCatPet.closeQuickDock(); globalThis.RoamCatPet.dock('right'); }`);
  await tab.waitForTimeout(500);
  const docked = await execInTab(`() => document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('.roamcat-pet-widget').classList.contains('docked')`);
  check('伴读猫贴边折叠', Boolean(docked));
  await shot(tab, 'pet-docked');
  await execInTab(`() => globalThis.RoamCatPet.undock()`);
  await tab.waitForTimeout(400);

  const LONG_SPEECH = '这是一段足够长的伴读猫提示文本，用来验证语音气泡在贴边时仍能完整留在视口之内，并且小尾巴始终指向猫身喵~';
  await execInTab(`() => globalThis.RoamCatPet.speakStatus(${JSON.stringify(LONG_SPEECH)}, {duration: 60000})`);
  await tab.waitForTimeout(400);
  check('伴读猫气泡在视口内', Boolean(await bubbleInside()));
  await shot(tab, 'pet-bubble');
  await execInTab(`() => globalThis.RoamCatPet.clearStatusSpeech()`);
  await tab.waitForTimeout(300);

  await execInTab(`() => globalThis.RoamCatPet.speakQuote()`);
  await tab.waitForTimeout(400);
  const quoteOk = await execInTab(`() => { const b = document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#cat-speech'); return b.classList.contains('quote') && Boolean(b.querySelector('.quote-zh')?.textContent); }`);
  check('伴读猫哲学语录气泡', Boolean(quoteOk));
  check('语录气泡在视口内', Boolean(await bubbleInside()));
  await shot(tab, 'pet-quote');
  await execInTab(`() => globalThis.RoamCatPet.clearStatusSpeech()`);

  await execInTab(`() => {
    const root = document.querySelector('#roamcat-pet-host').shadowRoot;
    globalThis.RoamCatPet.openSummary();
    globalThis.RoamCatContentUI.renderPetSummaryContent(root.querySelector('#summary-content'), {
      meta: {words: 1234, minutes: 6, domainKey: 'tech', domainName: '软件与 AI'},
      takeaway: '索引是数据库查询加速的核心手段：以空间换时间，把随机读变成有序扫描。',
      highlights: ['B-Tree 通过 **平衡多叉树** 把查找复杂度压到 O(log n)', '覆盖索引让查询无需回表，直接命中结果', '联合索引遵循最左前缀匹配原则'],
      keywords: ['B-Tree', '覆盖索引', '最左前缀']
    });
    return true;
  }`);
  await tab.waitForTimeout(500);
  await shot(tab, 'pet-summary-light');
  await tab.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await tab.waitForTimeout(400);
  await shot(tab, 'pet-summary-dark');
  await execInTab(`() => globalThis.RoamCatContentUI.renderPetSummaryLoading(document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#summary-content'))`);
  await tab.waitForTimeout(300);
  await shot(tab, 'pet-summary-loading');
  await execInTab(`() => { globalThis.RoamCatContentUI.renderPetSummaryError(document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#summary-content'), {message: '模型服务暂时不可用，请稍后重试。'}); globalThis.RoamCatPet.closeSummary(); }`);
  await tab.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await tab.waitForTimeout(300);

  // ========== D. 英文档：语言切换链路（options / popup / content script） ==========
  await extPage.evaluate(() => {
    localStorage.setItem('roamcat_ui_lang', 'en');
    return chrome.storage.local.set({roamcat_ui_lang: 'en'});
  });
  await extPage.reload();
  await extPage.waitForTimeout(700);
  const enOpts = await extPage.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-ui-lang'),
    nav: document.querySelector('[data-group="reading"] .nav-text')?.textContent?.trim() || '',
  }));
  check('options 英文档生效', enOpts.attr === 'en' && enOpts.nav === 'Reading', JSON.stringify(enOpts));
  await shot(extPage, 'options-en');

  // 连接器错误串在 SW 侧生成并缓存——触发一次状态刷新让它按当前语言重生成
  await extPage.evaluate(() => chrome.runtime.sendMessage({type: 'SUBSCRIPTION_STATUS'}).catch(() => null));
  await extPage.waitForTimeout(300);

  const popupEn = await run.newPage();
  watchPage(popupEn, 'popup-en');
  await popupEn.setViewportSize({width: 420, height: 720}, 1);
  await popupEn.goto(extUrl('ui/popup.html'));
  await popupEn.waitForTimeout(450);
  const popupEnAttr = await popupEn.evaluate(() => document.documentElement.getAttribute('data-ui-lang'));
  const popupEnText = await popupEn.locator('roamcat-popup').innerText().catch(() => '');
  const popupCjk = popupEnText.match(/[一-鿿]+/g);
  check('popup 英文档生效', popupEnAttr === 'en' && popupEnText.length > 20 && !popupCjk, `attr=${popupEnAttr} cjk=${JSON.stringify(popupCjk)}`);
  await shot(popupEn, 'popup-en');
  await popupEn.close();

  // content script 侧：语言经 storage.local 同步；重载 fixture 重建挂件后断言字典与气泡均为英文
  await tab.bringToFront();
  await tab.reload();
  await tab.locator('#roamcat-pet-host').waitFor({state: 'attached', timeout: 10000});
  await tab.waitForTimeout(900);
  const enPet = await execInTab(`() => {
    const I = globalThis.RoamCatI18n;
    const speech = document.querySelector('#roamcat-pet-host')?.shadowRoot?.querySelector('#speech-text')?.textContent || '';
    return {lang: I?.lang(), hover: I?.t('fp.hover.sum'), speech};
  }`);
  check('content script 英文档生效', enPet?.lang === 'en' && enPet.hover === 'Distill the whole article — just feed me, meow~' && !/[一-鿿]/.test(enPet.speech), JSON.stringify(enPet));
  await shot(tab, 'pet-en');

  for (const page of [extPage, tab]) await page.pump();
} catch (error) {
  report.failures.push(`门禁运行出错: ${error.message}`);
  console.error(error);
} finally {
  await run.close();
  await server.close();
  fs.rmSync(pdfFile, {force: true});
}

// ========== 收尾 ==========
for (const [tag, errors] of Object.entries(report.consoleErrors)) {
  if (errors.length) warn(`控制台错误[${tag}]`, errors.slice(0, 3).join(' | '));
}
noteScreenshots(report);
report.summary = {checks: report.checks.length, failures: report.failures.length, warnings: report.warnings.length};
fs.writeFileSync(path.join(out, 'ui-audit-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({summary: report.summary, failures: report.failures, warnings: report.warnings}, null, 2));
if (report.failures.length) process.exitCode = 1;
