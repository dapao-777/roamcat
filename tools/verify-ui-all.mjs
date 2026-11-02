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
import {printGateSummary} from './lib/gate-report.mjs';

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
// 动作之后不用固定时长：按状态轮询，等到要断言或要截图的状态出现（或超时）再继续。
// settled：有限次的动画与过渡都跑完（无限循环的加载动画不算），再等两帧让画面落定（后台页 rAF 可能停摆，最多等 0.5 秒）。
const until = async (page, probe, ok, timeout = 4000) => {
  const deadline = Date.now() + timeout;
  let value = await probe();
  while (!ok(value) && Date.now() < deadline) { await page.waitForTimeout(100); value = await probe(); }
  return value;
};
const settled = async page => {
  await until(page, () => page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getTiming?.().iterations !== Infinity).length).catch(() => 0), n => n === 0, 3000);
  await page.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); setTimeout(resolve, 500); })).catch(() => {});
};
// 版式体检（只看可见元素）：一字一行的竖排挤压、单行省略且没有悬停提示的截断文字、右边缘超出视口的元素。
// .sr-only（仅读屏可见）与按设计可横向滚动的键盘图不算。
const layoutLint = (page, rootSelector = 'body') => page.evaluate(rootSelector => {
  const out = {squeezed: [], truncated: [], offscreen: []};
  const label = el => `${el.id ? '#' + el.id : ''}.${String(el.className || el.tagName).trim().split(/\s+/)[0]} «${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 20)}»`;
  for (const el of document.querySelector(rootSelector)?.querySelectorAll('*') || []) {
    if (el.closest('.sr-only, [hidden], .kbd-map')) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (!r.width || !r.height || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    const size = parseFloat(cs.fontSize) || 14;
    if (own.length >= 4 && r.width < size * 2.2 && r.height > size * 3.2) out.squeezed.push(label(el));
    if (own.length >= 2 && cs.whiteSpace.includes('nowrap') && cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && !el.closest('[title]')) out.truncated.push(label(el));
    if (r.right > innerWidth + 1) out.offscreen.push(label(el));
  }
  for (const key of Object.keys(out)) out[key] = [...new Set(out[key])].slice(0, 6);
  return out;
}, rootSelector);
const lintClean = lint => !lint.squeezed.length && !lint.truncated.length && !lint.offscreen.length;
const shot = async (page, name, {fullPage = false, minBytes = 40000} = {}) => {
  const file = path.join(out, name + '.png');
  if (!(await page.screenshot({path: file, fullPage}))) return;
  // 合成器竞态白屏自检：整页近乎纯色的 PNG 极小，等待重截一次
  if (fs.existsSync(file) && fs.statSync(file).size < minBytes) {
    await settled(page);
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
      await until(extPage, () => extPage.evaluate(id => { const el = document.getElementById(id); return Boolean(el && !el.hidden && el.offsetHeight); }, section), Boolean);
      await settled(extPage);
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
    const welcomeLen = await until(welcome, () => welcome.evaluate(() => document.querySelector('roamcat-welcome')?.innerHTML.length || 0), n => n > 500);
    check(`welcome 渲染[${theme}]`, welcomeLen > 500, `innerHTML=${welcomeLen}`);
    check(`welcome 沙盒就绪[${theme}]`, await welcome.locator('.sandbox-browser-mockup').isVisible().catch(() => false));
    // 步骤卡片用 scroll-timeline 入场，回顶即复位——整页截图前直接禁用入场动画
    await welcome.addStyleTag({content: '.welcome-step-card { animation: none !important; opacity: 1 !important; transform: none !important; }'});
    await settled(welcome);
    await shot(welcome, `welcome-${theme}`, {fullPage: true});
    if (theme === 'light') {
      // 引导页窄窗口（分屏、小屏笔记本）：顶栏不挤成竖排，整页不出现横向滚动。
      for (const width of [480, 375]) {
        await welcome.setViewportSize({width, height: 900}, 1);
        await settled(welcome);
        const lint = await layoutLint(welcome);
        const scroll = await welcome.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        check(`welcome 窄窗口版式体检[${width}px]`, lintClean(lint) && scroll <= 0, JSON.stringify({scroll, ...lint}).slice(0, 300));
        if (width === 480) await shot(welcome, 'welcome-480', {minBytes: 1});
      }
    }
    await welcome.close();

    // reader：空态 + 注入文档的 ready 态
    const reader = await run.newPage();
    await reader.setViewportSize({width: 1440, height: 1000}, 1);
    watchPage(reader, 'reader');
    await reader.goto(extUrl('ui/reader.html'));
    await until(reader, () => reader.locator('.reader-status-card').isVisible().catch(() => false), Boolean);
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
    await until(reader, () => reader.locator('.reader-translation').count(), n => n === 3);
    await settled(reader);
    check(`reader 文档渲染[${theme}]`, await reader.locator('.reader-block').count() === 5);
    check(`reader 双语译文[${theme}]`, await reader.locator('.reader-translation').count() === 3);
    await shot(reader, `reader-doc-${theme}`);
    await reader.close();

    // popup：独立页面 + 窄视口
    const popup = await run.newPage();
    watchPage(popup, 'popup');
    await popup.setViewportSize({width: 420, height: 720}, 1);
    await popup.goto(extUrl('ui/popup.html'));
    const popupState = await until(popup, () => popup.evaluate(() => {
      const el = document.querySelector('roamcat-popup');
      return {len: el?.innerHTML.length || 0, buttons: el?.querySelectorAll('button').length || 0};
    }), v => v.len > 500 && v.buttons >= 2);
    await settled(popup);
    check(`popup 渲染[${theme}]`, popupState.len > 500 && popupState.buttons >= 2, JSON.stringify(popupState));
    await shot(popup, `popup-${theme}`);
    if (theme === 'light') {
      // 快捷键/右键菜单失败（图标红色「!」）的原因：弹窗打开时取走并显示在顶部，取走后记录清空。
      const tabError = '辅助服务尚未连接。请到设置里连接服务后再翻译本页。';
      // 不能 reload：标签页跳转本身就会按设计撤掉旧的失败记录。重新挂载弹窗组件，等同于再打开一次弹窗。
      await popup.evaluate(async message => {
        const tab = await chrome.tabs.getCurrent();
        await chrome.storage.session.set({['tabError:' + tab.id]: {message, at: Date.now()}});
        const old = document.querySelector('roamcat-popup');
        old.replaceWith(document.createElement('roamcat-popup'));
      }, tabError);
      const card = await until(popup, () => popup.evaluate(() => { const el = document.querySelector('#tab-error'); return el && !el.hidden ? document.querySelector('#tab-error-copy').textContent : ''; }), Boolean);
      const left = await popup.evaluate(async () => { const tab = await chrome.tabs.getCurrent(); return (await chrome.storage.session.get('tabError:' + tab.id))['tabError:' + tab.id] || null; });
      check('popup 显示上次快捷键失败原因并取走记录', card === tabError && left === null, JSON.stringify({card, left}));
      await settled(popup);
      await shot(popup, 'popup-tab-error');
      await popup.locator('#tab-error-dismiss').click();
      check('popup 失败原因可以关掉', await until(popup, () => popup.evaluate(() => document.querySelector('#tab-error').hidden), Boolean));
    }
    await popup.close();
    await extPage.bringToFront();
  }

  // 响应式：options 主面板在 4 档宽度下不得横向溢出
  await setTheme(extPage, 'light');
  await extPage.goto(extUrl('ui/options.html#assistance'));
  for (const width of [1440, 1100, 800, 600, 480, 375]) {
    await extPage.setViewportSize({width, height: 1000});
    await settled(extPage);
    await extPage.locator('.main-panel').evaluate(el => el.scrollTo(0, 0)).catch(() => {});
    await shot(extPage, `options-width-${width}`);
    const overflow = await extPage.evaluate(() =>
      [...document.querySelectorAll('.main-panel, .main-canvas-content, .compact-hero-banner, .swiss-card')]
        .filter(el => el.getBoundingClientRect().width && el.scrollWidth > el.clientWidth + 2)
        .map(el => ({cls: String(el.className).slice(0, 60), w: el.clientWidth, sw: el.scrollWidth})));
    if (overflow.length) report.overflow.push({width, overflow});
    check(`options 无横向溢出[${width}px]`, overflow.length === 0, JSON.stringify(overflow).slice(0, 200));
    // 只查横向溢出发现不了标题错位和侧栏挤占：页头标题必须和下方内容左对齐，主区可视高度不低于视口 70%，
    // 窄屏（≤760）顶部导航要带文字。
    const shell = await extPage.evaluate(() => {
      const left = sel => Math.round([...document.querySelectorAll(sel)].find(el => el.getBoundingClientRect().width)?.getBoundingClientRect().left ?? -1);
      const main = document.querySelector('.main-panel').getBoundingClientRect();
      const nav = document.querySelector('[data-group="reading"] .nav-text');
      const items = [...document.querySelectorAll('.sidebar .cyber-nav-item:not([hidden])')].map(el => el.getBoundingClientRect());
      return {title: left('.hero-title'), body: left('.main-canvas-content .settings-section:not([hidden]) .opt-group, .main-canvas-content .settings-section:not([hidden]) .swiss-card, .now-status'), mainShare: main.height / innerHeight, navText: nav ? getComputedStyle(nav).display !== 'none' && nav.getBoundingClientRect().width > 0 : false, navClipped: items.filter(r => !r.width || r.right > innerWidth + 1 || r.left < -1).length};
    });
    check(`options 页头与内容左对齐[${width}px]`, shell.title >= 0 && Math.abs(shell.title - shell.body) <= 4, JSON.stringify(shell));
    check(`options 主区可视高度 ≥70%[${width}px]`, shell.mainShare >= 0.7, JSON.stringify(shell));
    if (width <= 760) check(`options 窄屏导航带文字且全部分组可见[${width}px]`, shell.navText && shell.navClipped === 0, JSON.stringify(shell));
  }
  // 快捷键页：键盘 + 清单按卡片宽度排版（容器查询）。侧栏展开时可用宽度最窄，清单说明不得被挤成一字一行；
  // 标签栏不得因溢出冒出滚动条。
  await extPage.goto(extUrl('ui/options.html#shortcuts'));
  for (const width of [1440, 1280, 1150, 1000, 800, 480]) {
    await extPage.setViewportSize({width, height: 1000});
    await until(extPage, () => extPage.evaluate(() => Boolean(document.querySelector('#shortcuts:not([hidden]) .combo-info')?.offsetWidth)), Boolean);
    await settled(extPage);
    const lab = await extPage.evaluate(() => {
      const infos = [...document.querySelectorAll('#shortcuts .combo-info')].map(el => Math.round(el.getBoundingClientRect().width));
      const lefts = [...document.querySelectorAll('#shortcuts .combo-info')].map(el => Math.round(el.getBoundingClientRect().left));
      const tabs = document.querySelector('.group-tabs');
      // 只有可滚动的容器溢出才会画出滚动条（overflow: visible 时 1px 的负下边距只是正常压线）。
      const scrollable = tabs && /auto|scroll/.test(getComputedStyle(tabs).overflowY + getComputedStyle(tabs).overflowX);
      return {minInfo: Math.min(...infos), infoLeftSpread: Math.max(...lefts) - Math.min(...lefts), tabsScrollbar: Boolean(scrollable && (tabs.scrollHeight > tabs.clientHeight || tabs.scrollWidth > tabs.clientWidth))};
    });
    if (width === 1150) await shot(extPage, 'options-shortcuts-1150');
    check(`快捷键清单说明不被挤窄[${width}px]`, lab.minInfo >= 160, JSON.stringify(lab));
    check(`设置页标签栏不出现滚动条[${width}px]`, !lab.tabsScrollbar, JSON.stringify(lab));
    check(`快捷键清单说明左对齐[${width}px]`, lab.infoLeftSpread <= 1, JSON.stringify(lab));
  }
  await extPage.setViewportSize({width: 1440, height: 1000});

  // 版式体检：设置页全部分区在三档宽度（含侧栏展开时内容区最窄的 1150）下没有竖排挤压、无提示截断或溢出视口。
  for (const width of [1440, 1150, 480]) {
    await extPage.setViewportSize({width, height: 1000});
    const dirty = [];
    for (const section of OPTION_SECTIONS) {
      await extPage.evaluate(s => { location.hash = '#' + s; }, section);
      await until(extPage, () => extPage.evaluate(id => { const el = document.getElementById(id); return Boolean(el && !el.hidden && el.offsetHeight); }, section), Boolean);
      await settled(extPage);
      const lint = await layoutLint(extPage, '.options-body');
      if (!lintClean(lint)) dirty.push({section, ...lint});
    }
    check(`options 全部分区版式体检[${width}px]`, dirty.length === 0, JSON.stringify(dirty).slice(0, 300));
  }
  await extPage.setViewportSize({width: 1440, height: 1000});

  // 机翻凭据表单与五场景路由：全部服务、双主题和三档宽度一起体检。
  for (const theme of THEMES) {
    await setTheme(extPage, theme);
    await extPage.goto(extUrl('ui/options.html#service'));
    await extPage.waitForFunction(()=>Boolean(window.optionsState));
    await extPage.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
    const keys=await extPage.evaluate(()=>[...document.querySelectorAll('[data-service-key^="mt:"]')].map(el=>el.dataset.serviceKey));
    check(`机器翻译服务目录[${theme}]`,keys.length===14,`count=${keys.length}`);
    for (const width of [1440,1150,480]) {
      await extPage.setViewportSize({width,height:1000});
      const dirty=[];
      for (const key of keys) {
        await extPage.locator(`[data-service-key="${key}"]`).click();
        await extPage.locator('#mt-panel').evaluate(el=>el.scrollIntoView({block:'start'}));
        await settled(extPage);
        const lint=await layoutLint(extPage,'.options-body');
        if(!lintClean(lint))dirty.push({key,...lint});
        if(key==='mt:deeplx'){
          const heights=await extPage.evaluate(()=>[...document.querySelectorAll('#translation-engines .route-row')].map(el=>Math.round(el.getBoundingClientRect().height)));
          check(`机翻场景行保持紧凑[${theme}/${width}px]`,heights.length===5&&Math.max(...heights)<=100,JSON.stringify(heights));
          await shot(extPage,`options-mt-${theme}-${width}`);
        }
      }
      check(`机器翻译全部表单版式[${theme}/${width}px]`,dirty.length===0,JSON.stringify(dirty).slice(0,800));
    }
  }
  await extPage.setViewportSize({width:1440,height:1000});

  // ========== B. 页内挂件：fixture 文章页上真实 content script 环境 ==========
  const tab = await run.newPage();
  await tab.setViewportSize({width: 1440, height: 1000}, 1);
  watchPage(tab, 'page');
  await tab.goto(`${fixtureBase}/sites/devto-article.html`);
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

  // 弹窗主状态：在网页所在窗口里开一个后台标签页加载 popup.html，它取到的活动标签页就是这张网页（与点工具栏图标时一致）。
  const popupTabId = await extPage.evaluate(async base => {
    const [page] = await chrome.tabs.query({url: base + '/*'});
    return (await chrome.tabs.create({windowId: page.windowId, url: chrome.runtime.getURL('ui/popup.html'), active: false})).id;
  }, fixtureBase);
  const popupTarget = await until(extPage, async () => (await run.browser.connection.send('Target.getTargets')).targetInfos.find(info => info.url.endsWith('/ui/popup.html')), Boolean);
  if (popupTarget) {
    const pagePopup = await run.browser.attach(popupTarget.targetId);
    await pagePopup.setViewportSize({width: 380, height: 640}, 1);
    // 先显示占位「当前标签页」，取到网页信息后换成主机名：等到主机名出现再断言。
    const popupHost = await until(pagePopup, () => pagePopup.evaluate(() => document.querySelector('#site-hostname')?.textContent?.trim() || ''), host => host.includes('127.0.0.1'), 8000);
    await settled(pagePopup);
    const popupLint = await layoutLint(pagePopup, 'roamcat-popup');
    check('popup 在普通网页上显示本页开关', popupHost.includes('127.0.0.1'), popupHost);
    check('popup 普通网页状态版式体检（说明不截断）', lintClean(popupLint), JSON.stringify(popupLint));
    // 主次模式：双语翻译排在阅读辅助之前，卡片里唯一的实心主按钮是「翻译本页」，「开启本页」是描边按钮。
    const modeOrder = await pagePopup.evaluate(() => {
      const card = document.querySelector('.activation-panel');
      const translate = document.querySelector('#emergency-panel'), assist = document.querySelector('.assist-panel');
      return {
        translateFirst: Boolean(translate && assist && translate.compareDocumentPosition(assist) & Node.DOCUMENT_POSITION_FOLLOWING),
        primary: [...card.querySelectorAll('.primary-action:not([hidden])')].map(button => button.id),
        assistButton: document.querySelector('#toggle-page')?.className || '',
      };
    });
    check('popup 主模式双语翻译在上、副模式阅读辅助在下', modeOrder.translateFirst && modeOrder.primary.join() === 'emergency-open' && modeOrder.assistButton.includes('secondary-button'), JSON.stringify(modeOrder));
    await shot(pagePopup, 'popup-page', {minBytes: 1});
    // 「双语 / 仅译文」：默认双语；真实点击切到仅译文后后台设置跟着变，再切回双语。
    const displayChoice = () => pagePopup.evaluate(() => [...document.querySelectorAll('#emergency-display button')].map(button => `${button.dataset.display}:${button.getAttribute('aria-pressed')}`).join());
    const savedDisplay = () => extPage.evaluate(async () => (await chrome.runtime.sendMessage({type: 'STATE_GET'})).data.settings.pageTranslationDisplay);
    check('popup 整页翻译显示方式默认双语', await displayChoice() === 'bilingual:true,translation:false', await displayChoice());
    await pagePopup.locator('#emergency-display button[data-display="translation"]').click();
    const switched = await until(extPage, savedDisplay, value => value === 'translation');
    check('popup 切到仅译文并写入设置', switched === 'translation' && await displayChoice() === 'bilingual:false,translation:true', `${switched} ${await displayChoice()}`);
    await pagePopup.locator('#emergency-display button[data-display="bilingual"]').click();
    check('popup 切回双语', await until(extPage, savedDisplay, value => value === 'bilingual') === 'bilingual', await savedDisplay());
  } else check('popup 在普通网页上显示本页开关', false, 'popup target not found');
  await extPage.evaluate(id => chrome.tabs.remove(id), popupTabId).catch(() => {});

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
    await settled(tab);
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
  await settled(tab);
  await shotLocator(tab.locator('[data-roamcat-ui="card"]'), 'widget-wordcard-passage');
  await execInTab(`() => {
    const {host, shadow} = ${WIDGET_HOST('card', `position:fixed;z-index:2147483647;width:min(360px,calc(100vw - 24px));left:24px;top:24px`)};
    window.__probe.cardRefs = globalThis.RoamCatContentUI.wordCard(shadow, {brandIconUrl: ${JSON.stringify(iconUrl)}, kind: 'word', sourceText: 'unobtainium', error: '本地模型服务暂时不可用，请稍后重试。', handlers: {retry() {}, repair() {}}});
    return true;
  }`);
  await settled(tab);
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
  await settled(tab);
  await shotLocator(tab.locator('[data-roamcat-ui="task-status"]'), 'widget-taskstatus-busy');
  await execInTab(`() => { window.__probe.status.more.click(); return true; }`);
  const detailVisible = await until(tab, () => execInTab(`() => !window.__probe.status.detail.hidden && window.__probe.status.more.getAttribute('aria-expanded') === 'true'`), Boolean);
  await settled(tab);
  check('任务状态条详情展开', Boolean(detailVisible));
  await shotLocator(tab.locator('[data-roamcat-ui="task-status"]'), 'widget-taskstatus-detail');
  await execInTab(`() => { const s = window.__probe.status; s.indicator.dataset.busy = 'false'; s.indicator.dataset.error = 'true'; s.panel.dataset.error = 'true'; s.label.textContent = '阅读辅助遇到问题'; s.collapse(); return true; }`);
  await settled(tab);
  await shotLocator(tab.locator('[data-roamcat-ui="task-status"]'), 'widget-taskstatus-error');
  await execInTab(`() => window.__probe['task-status'].host.remove()`);

  // 网页明暗判断在 content-ui 里（伴读猫关掉时页内卡片也靠它）：浅色 fixture 判成 light，显式 data-theme=dark 判成 dark。
  const themeHint = await execInTab(`() => {
    const UI = globalThis.RoamCatContentUI, root = document.documentElement, before = root.getAttribute('data-theme');
    const plain = UI.pageThemeHint();
    root.setAttribute('data-theme', 'dark');
    const forced = UI.pageTheme();
    if (before === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', before);
    return {plain, forced};
  }`);
  check('网页明暗判断：浅色页 light、data-theme=dark 判 dark', themeHint?.plain === 'light' && themeHint?.forced === 'dark', JSON.stringify(themeHint));

  // B3. 解构详情卡（真实 structureRoles/structureColors）
  await execInTab(`() => {
    const {host, shadow} = ${WIDGET_HOST('sentence-detail', `position:fixed;z-index:2147483646;width:min(340px,calc(100vw - 32px));left:24px;top:24px`)};
    // 与 content.js 一致：卡片带自己的 data-theme，成分颜色按卡片明暗取（深色卡最容易出现深字压深底）。
    host.setAttribute('data-theme', 'dark');
    const refs = globalThis.RoamCatContentUI.sentenceDetail(shadow, {brandIconUrl: ${JSON.stringify(iconUrl)}, onClose: () => {}});
    const sentence = 'The city wakes before its people.';
    const groups = [
      {parent: -1, role: 'clause', start: 0, end: 32},
      {parent: 0, role: 'subject', start: 0, end: 8},
      {parent: 0, role: 'predicate', start: 9, end: 14},
      {parent: 0, role: 'adverbial', start: 15, end: 32},
      {parent: 3, role: 'object', start: 22, end: 32}
    ];
    const D = globalThis.RoamCatDesign;
    globalThis.RoamCatContentUI.renderStructureTree(refs.tree, {
      groups, sentence,
      // 与 content.js 一致经 i18n 翻译角色名，门禁截图才能发现解构卡的文案回归。
      roleLabel: role => globalThis.RoamCatI18n.t((D.structureRoles[role] || ['?', 'neutral'])[0]),
      roleColor: role => D.structureColor(role, host.getAttribute('data-theme'))
    });
    return true;
  }`);
  await settled(tab);
  const treeItems = await execInTab(`() => window.__probe['sentence-detail'].shadow.querySelectorAll('li').length`);
  check('解构详情卡树渲染', treeItems >= 5, `li=${treeItems}`);
  // 成分标签文字与卡片底色对比度 ≥4.5:1（标签底色只叠了 12% 的成分色，按卡片底色算）。
  const chipContrast = await execInTab(`() => {
    const shadow = window.__probe['sentence-detail'].shadow;
    const rgb = value => (value.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const card = [...shadow.querySelectorAll('*')].map(el => getComputedStyle(el).backgroundColor).find(color => !/rgba\\(0, 0, 0, 0\\)|transparent/.test(color));
    const bg = lum(rgb(card || 'rgb(0,0,0)'));
    return [...shadow.querySelectorAll('.role')].map(chip => { const fg = lum(rgb(getComputedStyle(chip).color)); const [hi, lo] = fg > bg ? [fg, bg] : [bg, fg]; return {text: chip.textContent, ratio: Math.round((hi + 0.05) / (lo + 0.05) * 10) / 10}; });
  }`);
  check('解构卡成分标签对比度 ≥4.5', chipContrast.length >= 5 && chipContrast.every(item => item.ratio >= 4.5), JSON.stringify(chipContrast));
  await shotLocator(tab.locator('[data-roamcat-ui="sentence-detail"]'), 'widget-sentence-detail');
  await execInTab(`() => window.__probe['sentence-detail'].host.remove()`);

  // B4. 已认识 toast
  await execInTab(`() => {
    const {host, shadow} = ${WIDGET_HOST('known-feedback', `position:fixed;left:50%;bottom:max(20px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 24px)`)};
    globalThis.RoamCatContentUI.knownFeedback(shadow, {brandIconUrl: ${JSON.stringify(iconUrl)}, term: 'serendipity', onUndo: () => {}});
    return true;
  }`);
  await settled(tab);
  await shotLocator(tab.locator('[data-roamcat-ui="known-feedback"]'), 'widget-known-feedback');
  await execInTab(`() => window.__probe['known-feedback'].host.remove()`);

  // B4b. 整页翻译「双语 / 仅译文」切换 × 双主题：一行排开、点击后按下态切到仅译文
  for (const theme of THEMES) {
    const toggle = await execInTab(`() => {
      const {host, shadow} = ${WIDGET_HOST('translation-display', `position:fixed;left:16px;bottom:16px;z-index:2147483646;max-width:calc(100vw - 32px)`)};
      host.setAttribute('data-theme', '${theme}');
      const ui = globalThis.RoamCatContentUI.translationDisplayToggle(shadow, {brandIconUrl: ${JSON.stringify(iconUrl)}, onChange: display => ui.update(display)});
      ui.update('bilingual');
      ui.buttons[1].click();
      const rects = ui.buttons.map(button => button.getBoundingClientRect());
      return {pressed: ui.buttons.map(button => button.getAttribute('aria-pressed')).join(), oneRow: Math.abs(rects[0].top - rects[1].top) < 1, height: Math.round(ui.panel.getBoundingClientRect().height), labels: ui.buttons.map(button => button.textContent.trim()).join()};
    }`);
    check(`整页翻译显示切换[${theme}]：一行排开、点击切到仅译文`, Boolean(toggle?.oneRow && toggle.height <= 48 && toggle.pressed === 'false,true' && toggle.labels === '双语,仅译文'), JSON.stringify(toggle));
    await settled(tab);
    await shotLocator(tab.locator('[data-roamcat-ui="translation-display"]'), `widget-translation-display-${theme}`);
  }
  await execInTab(`() => window.__probe['translation-display'].host.remove()`);

  // B5. 选区操作条：先启用阅读辅助（真实 SW 管线），再真实鼠标拖选触发（isTrusted 必需）
  await extPage.evaluate(tabId=>chrome.runtime.sendMessage({type:'PAGE_UI_INJECT',tabId}),await tabIdOf(extPage,`${fixtureBase}/*`));
  await execInTab(`() => globalThis.__ROAMCAT_CONTENT__?.setManualEnabled?.(true) ?? Promise.resolve()`);
  const assistState = await until(tab, () => execInTab(`() => { const s = globalThis.__ROAMCAT_CONTENT__?.status?.(); return s ? {enabled: s.enabled, paused: s.paused} : null; }`), v => Boolean(v?.enabled), 8000);
  check('阅读辅助已启用', Boolean(assistState?.enabled), JSON.stringify(assistState));
  await tab.evaluate(() => { window.scrollTo(0, 200); });
  await tab.bringToFront();
  const paraBox = await tab.locator('p').first().boundingBox();
  if (paraBox) {
    await tab.mouse.move(paraBox.x + 4, paraBox.y + paraBox.height / 2);
    await tab.mouse.down();
    await tab.mouse.move(Math.min(paraBox.x + paraBox.width - 4, paraBox.x + 320), paraBox.y + paraBox.height / 2, {steps: 10});
    await tab.mouse.up();
    const barVisible = await until(tab, () => tab.locator('[data-roamcat-ui="passage-action"]').isVisible().catch(() => false), Boolean, 3000);
    if (barVisible) {
      await settled(tab);
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

  // 竖排快捷按钮常驻显示：不悬停、不点猫也可见可点（点猫只开合猫自己的缩放胶囊）。
  const idleQuick = await until(tab, () => execInTab(`() => [...document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('.roamcat-toolbar').querySelectorAll('button')]
    .map(b => { const s = getComputedStyle(b); return s.visibility === 'visible' && Number(s.opacity) > 0.9 && s.pointerEvents === 'auto'; })`), v => v?.length === 4 && v.every(Boolean));
  check('伴读猫快捷按钮常态显示（未点猫）', idleQuick?.length === 4 && idleQuick.every(Boolean), JSON.stringify(idleQuick));
  await execInTab(`() => globalThis.RoamCatPet.openQuickDock()`);
  const dockOpen = await until(tab, () => execInTab(`() => document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('.roamcat-pet-widget').classList.contains('dock-open')`), Boolean);
  await settled(tab);
  check('伴读猫快捷坞展开', Boolean(dockOpen));
  await shot(tab, 'pet-dock-open');
  // 猫与工具栏分开：工具栏是独立挂件、贴在屏幕右缘，猫在右下角只做提示；悬停按钮显示按钮自带提示，不动猫的气泡。
  // 双主题各截一张近景（工具栏 + 悬停提示 + 猫），供审查两者的位置关系。
  const petLayout = () => execInTab(`() => {
    const host = document.querySelector('#roamcat-pet-host'), sr = host.shadowRoot;
    const r = el => { const b = el.getBoundingClientRect(); return {l: b.left, t: b.top, r: b.right, b: b.bottom}; };
    const btn = sr.querySelector('#quick-summary'), tip = getComputedStyle(btn, '::after');
    return {vw: innerWidth, vh: innerHeight, host: r(host), bar: r(sr.querySelector('.roamcat-toolbar')),
      btns: ['#quick-options', '#quick-summary', '#quick-reading', '#roamcat-flip-btn'].map(s => r(sr.querySelector(s))),
      zoom: r(sr.querySelector('#roamcat-zoom-controls')), speaking: sr.querySelector('#cat-speech').classList.contains('speaking'),
      tip: {text: btn.dataset.tip, opacity: Number(tip.opacity)}, speech: sr.querySelector('#speech-text').textContent, bubbleCls: sr.querySelector('#cat-speech').className};
  }`);
  const boxesOverlap = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
  const toolbarLayout = await petLayout();
  check('伴读猫与工具栏分开：工具栏独立贴在屏幕右缘、竖排一列、不压猫', Math.abs(toolbarLayout.bar.r - toolbarLayout.vw) < 1 && !boxesOverlap(toolbarLayout.bar, toolbarLayout.host)
    && toolbarLayout.btns.every((b, i) => Math.abs(b.l - toolbarLayout.btns[0].l) < 1 && (i === 0 || b.t >= toolbarLayout.btns[i - 1].b)), JSON.stringify(toolbarLayout));
  check('伴读猫缩放胶囊在猫内侧且不压工具栏', toolbarLayout.zoom.r <= toolbarLayout.host.l && !boxesOverlap(toolbarLayout.zoom, toolbarLayout.bar), JSON.stringify(toolbarLayout));
  const sumBox = await tab.locator('#quick-summary').boundingBox();
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') {
      await tab.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await until(tab, () => execInTab(`() => document.querySelector('#roamcat-pet-host').getAttribute('data-theme')`), v => v === 'dark');
    }
    await tab.mouse.move(400, 400);
    const beforeHover = await petLayout();
    await tab.mouse.move(sumBox.x + sumBox.width / 2, sumBox.y + sumBox.height / 2);
    const hovered = await until(tab, petLayout, g => g.tip.opacity > 0.9);
    await settled(tab);
    check(`工具栏按钮悬停显示自带提示、不动猫的气泡（${theme}）`, hovered.tip.opacity > 0.9 && hovered.tip.text === '提炼整篇精华'
      && hovered.speech === beforeHover.speech && hovered.bubbleCls === beforeHover.bubbleCls,
      JSON.stringify({tip: hovered.tip, speech: [beforeHover.speech, hovered.speech], cls: [beforeHover.bubbleCls, hovered.bubbleCls]}));
    const x = Math.max(0, Math.min(hovered.host.l, hovered.bar.l) - 240), y = Math.max(0, hovered.bar.t - 40);
    await tab.screenshot({path: path.join(out, `pet-toolbar-${theme}.png`), clip: {x, y, width: hovered.vw - x, height: Math.min(hovered.vh, hovered.host.b + 24) - y}});
  }
  await tab.mouse.move(400, 400);
  await tab.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await until(tab, () => execInTab(`() => document.querySelector('#roamcat-pet-host').getAttribute('data-theme')`), v => v === 'light');

  await execInTab(`() => { globalThis.RoamCatPet.closeQuickDock(); globalThis.RoamCatPet.dock('right'); }`);
  const docked = await until(tab, () => execInTab(`() => document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('.roamcat-pet-widget').classList.contains('docked')`), Boolean);
  await settled(tab);
  check('伴读猫贴边折叠', Boolean(docked));
  await shot(tab, 'pet-docked');
  await execInTab(`() => globalThis.RoamCatPet.undock()`);
  await until(tab, () => execInTab(`() => !document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('.roamcat-pet-widget').classList.contains('docked')`), Boolean);
  await settled(tab);

  const LONG_SPEECH = '这是一段足够长的伴读猫提示文本，用来验证语音气泡在贴边时仍能完整留在视口之内，并且小尾巴始终指向猫身喵~';
  await execInTab(`() => globalThis.RoamCatPet.speakStatus(${JSON.stringify(LONG_SPEECH)}, {duration: 60000})`);
  await until(tab, () => execInTab(`() => document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#cat-speech').classList.contains('speaking')`), Boolean);
  await settled(tab);
  check('伴读猫气泡在视口内', Boolean(await bubbleInside()));
  await shot(tab, 'pet-bubble');
  await execInTab(`() => globalThis.RoamCatPet.clearStatusSpeech()`);
  await until(tab, () => execInTab(`() => !document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#cat-speech').classList.contains('speaking')`), Boolean);

  await execInTab(`() => globalThis.RoamCatPet.speakQuote()`);
  await until(tab, () => execInTab(`() => document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#cat-speech').classList.contains('quote')`), Boolean);
  await settled(tab);
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
  await until(tab, () => execInTab(`() => Boolean(document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('.roamcat-summary-window.open'))`), Boolean);
  await settled(tab);
  await shot(tab, 'pet-summary-light');
  await tab.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await until(tab, () => execInTab(`() => document.querySelector('#roamcat-pet-host').getAttribute('data-theme')`), v => v === 'dark');
  await settled(tab);
  await shot(tab, 'pet-summary-dark');
  await execInTab(`() => globalThis.RoamCatContentUI.renderPetSummaryLoading(document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#summary-content'))`);
  await settled(tab);
  await shot(tab, 'pet-summary-loading');
  await execInTab(`() => { globalThis.RoamCatContentUI.renderPetSummaryError(document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#summary-content'), {message: '模型服务暂时不可用，请稍后重试。'}); globalThis.RoamCatPet.closeSummary(); }`);
  await tab.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await settled(tab);

  // ========== D. 英文档：语言切换链路（options / popup / content script） ==========
  // 在另一个扩展页（阅读器）里切换语言：开着的设置页要自己整页换成英文（不能中英混杂），阅读器就地重渲染。
  const langReader = await run.newPage();
  await langReader.goto(extUrl('ui/reader.html'));
  await until(langReader, () => langReader.evaluate(() => Boolean(document.querySelector('roamcat-reader')?.shadowRoot || document.querySelector('roamcat-reader'))), Boolean);
  await langReader.evaluate(() => globalThis.RoamCatI18n.setPref('en'));
  const readerEn = await until(langReader, () => langReader.evaluate(() => document.querySelector('roamcat-reader')?.innerText || ''), text => text.length > 20 && !/[一-鿿]/.test(text));
  check('阅读器就地切换到英文', readerEn.length > 20 && !/[一-鿿]/.test(readerEn), readerEn.slice(0, 120));
  await langReader.close();
  await extPage.bringToFront();
  const enOpts = await until(extPage, () => extPage.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-ui-lang'),
    nav: document.querySelector('[data-group="reading"] .nav-text')?.textContent?.trim() || '',
    han: (document.querySelector('.options-body')?.innerText.match(/[一-鿿]{2,}/g) || []).filter(word => !['随心阅'].includes(word)).slice(0, 5),
  })).catch(() => ({attr: '', nav: '', han: ['loading']})), v => v.attr === 'en' && v.nav === 'Reading' && !v.han.length, 8000);
  await settled(extPage);
  check('options 英文档生效（别的页面切换后自动整页换语言，不中英混杂）', enOpts.attr === 'en' && enOpts.nav === 'Reading' && !enOpts.han.length, JSON.stringify(enOpts));
  // 英文选项比中文长：行内下拉框必须按内容加宽，不能把当前选项截掉。
  const clippedSelects = await extPage.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
    document.body.append(probe);
    const out = [...document.querySelectorAll('.opt-row-control .swiss-select')].filter(el => el.getBoundingClientRect().width).flatMap(el => {
      const cs = getComputedStyle(el); probe.style.font = cs.font;
      probe.textContent = el.selectedOptions[0]?.textContent || '';
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return probe.getBoundingClientRect().width > room + 1 ? [{id: el.id, text: probe.textContent, room: Math.round(room)}] : [];
    });
    probe.remove();
    return out;
  });
  check('options 英文下拉框不截断当前选项', clippedSelects.length === 0, JSON.stringify(clippedSelects).slice(0, 200));
  await shot(extPage, 'options-en');

  // 连接器错误串在 SW 侧生成并缓存——触发一次状态刷新让它按当前语言重生成
  await extPage.evaluate(() => chrome.runtime.sendMessage({type: 'SUBSCRIPTION_STATUS'}).catch(() => null));

  const popupEn = await run.newPage();
  watchPage(popupEn, 'popup-en');
  await popupEn.setViewportSize({width: 420, height: 720}, 1);
  await popupEn.goto(extUrl('ui/popup.html'));
  const popupEnAttr = await until(popupEn, () => popupEn.evaluate(() => document.documentElement.getAttribute('data-ui-lang')), v => v === 'en');
  const popupEnText = await until(popupEn, () => popupEn.locator('roamcat-popup').innerText().catch(() => ''), text => text.length > 20 && !/[一-鿿]/.test(text));
  await settled(popupEn);
  const popupCjk = popupEnText.match(/[一-鿿]+/g);
  check('popup 英文档生效', popupEnAttr === 'en' && popupEnText.length > 20 && !popupCjk, `attr=${popupEnAttr} cjk=${JSON.stringify(popupCjk)}`);
  await shot(popupEn, 'popup-en');
  await popupEn.close();

  // content script 侧：语言经 storage.local 同步；重载 fixture 重建挂件后断言字典与气泡均为英文
  await tab.bringToFront();
  await tab.reload();
  await tab.locator('#roamcat-pet-host').waitFor({state: 'attached', timeout: 10000});
  const enPet = await until(tab, () => execInTab(`() => {
    const I = globalThis.RoamCatI18n;
    const sr = document.querySelector('#roamcat-pet-host')?.shadowRoot;
    const speech = sr?.querySelector('#speech-text')?.textContent || '';
    return {lang: I?.lang(), tip: sr?.querySelector('#quick-summary')?.dataset.tip || '', speech};
  }`), v => v?.lang === 'en' && Boolean(v.speech) && !/[一-鿿]/.test(v.speech), 6000);
  await settled(tab);
  check('content script 英文档生效', enPet?.lang === 'en' && enPet.tip === 'Summarize article' && !/[一-鿿]/.test(enPet.speech), JSON.stringify(enPet));
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
printGateSummary('ui', report.checks.length, report.failures.length);
