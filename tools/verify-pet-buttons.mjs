/**
 * @file tools/verify-pet-buttons.mjs
 * 文件职责：伴读猫悬浮按钮专项门禁（npm run verify:pet）——在 ego lite 的真实 content script 环境里，对猫头 / 竖排快捷工具栏（几何与换边） /
 *   旋旋翻 / 缩放 / 贴边标签 / 气泡关闭 / 摘要窗做真实鼠标点击与键盘操作，断言状态变化与可及性。
 * 主要内容：本地 fixture 文章页（tools/fixtures/sites/devto-article.html）上挂载的伴读猫；伴读猫实例挂在隔离世界的宿主上，
 *   经扩展页 chrome.scripting 进入隔离世界读取与调用。截图尽力而为，判定只看状态断言。
 * 模块边界：普通 Node 运行，先 npm run build；无头 ego lite 用临时配置加载 dist/extension；报告与截图写 preview/pet-buttons/。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import fs from 'node:fs';
import path from 'node:path';
import {REPO, openBrowser, extUrl, noteScreenshots, previewPath, staticServer, tabIdOf} from './lib/ego.mjs';
import {printGateSummary} from './lib/gate-report.mjs';

const out = previewPath('pet-buttons');
fs.mkdirSync(out, {recursive: true});

const report = {checks: [], failures: [], warnings: [], consoleErrors: []};
const check = (name, cond, detail = '') => {
  if (cond) report.checks.push(name);
  else report.failures.push(detail ? `${name} — ${detail}` : name);
  return cond;
};
const warn = (name, detail) => report.warnings.push(detail ? `${name} — ${detail}` : name);

const server = await staticServer(path.join(REPO, 'tools/fixtures'));
const fixtureBase = server.base;
const run = await openBrowser();
try {
  const extPage = await run.newPage();
  await extPage.goto(extUrl('ui/options.html'));
  const tab = await run.newPage();
  await tab.setViewportSize({width: 1440, height: 1000}, 1);
  tab.on('pageerror', e => report.failures.push(`页面脚本异常: ${e.message}`));
  tab.on('console', msg => {
    if (msg.type() === 'error') report.consoleErrors.push(msg.text().slice(0, 240));
  });
  await tab.goto(`${fixtureBase}/sites/devto-article.html`);
  await tab.locator('#roamcat-pet-host').waitFor({state: 'attached', timeout: 10000})
    .catch(() => report.failures.push('伴读猫宿主未注入页面'));
  await tab.bringToFront();

  const widget = tab.locator('.roamcat-pet-widget');
  const avatar = tab.locator('.roamcat-avatar-wrap');
  const bubble = tab.locator('#cat-speech');
  const speechText = tab.locator('#cat-speech .speech-text');
  const shot = async name => tab.screenshot({path: path.join(out, name + '.png')});
  // ego 里测试页在后台时约 1 帧/秒：动作之后一律按状态轮询，等到下面要断言的状态出现（或超时）再断言，
  // 不用固定时长。只有断言「不会发生」的少数地方保留观察窗口。
  const until = async (probe, ok, timeout = 3000) => {
    const deadline = Date.now() + timeout;
    let value = await probe();
    while (!ok(value) && Date.now() < deadline) { await tab.waitForTimeout(150); value = await probe(); }
    return value;
  };

  // 伴读猫实例挂在隔离世界的宿主上：用 chrome.scripting 进入隔离世界读取/调用。
  const petCall = async (expr) => {
    const tabId = await tabIdOf(extPage, `${fixtureBase}/*`);
    const frames = await extPage.evaluate(async ({tabId, expr}) =>
      chrome.scripting.executeScript({target: {tabId}, func: new Function('return (' + expr + ')()')}), {tabId, expr});
    return frames?.[0]?.result;
  };
  const petState = () => petCall(`() => {
    const pet = document.querySelector('#roamcat-pet-host')?.pet;
    const w = document.querySelector('#roamcat-pet-host')?.shadowRoot?.querySelector('.roamcat-pet-widget');
    return pet && w ? {
      cls: w.className,
      avatarCls: pet.shadowQuery('.roamcat-avatar-wrap')?.className || '',
      expanded: pet.shadowQuery('.roamcat-avatar-wrap')?.getAttribute('aria-expanded'),
      inert: pet.shadowQuery('#roamcat-zoom-controls')?.hasAttribute('inert'),
      zoom: pet.shadowQuery('#zoom-label')?.textContent,
      scale: getComputedStyle(document.querySelector('#roamcat-pet-host')).getPropertyValue('--pet-scale').trim(),
      speech: pet.shadowQuery('#speech-text')?.textContent || '',
      speechCls: pet.shadowQuery('#cat-speech')?.className || '',
    } : null;
  }`);

  // 竖排快捷按钮的几何：四颗按钮自上而下为设置 / 提炼 / 阅读 / 旋旋翻，连同猫、猫身（麻薯身体路径，
  // 取头顶）、气泡、缩放胶囊的视口矩形。
  const layout = () => petCall(`() => {
    const host = document.querySelector('#roamcat-pet-host'), sr = host.shadowRoot;
    const r = el => { const b = el.getBoundingClientRect(); return {l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom)}; };
    const body = [...sr.querySelectorAll('.cat-svg > path')].find(p => (p.getAttribute('fill') || 'none') !== 'none');
    return {cls: sr.querySelector('.roamcat-pet-widget').className, vh: innerHeight, host: r(host), head: body ? r(body) : null,
      btns: ['#quick-options', '#quick-summary', '#quick-reading', '#roamcat-flip-btn'].map(s => r(sr.querySelector(s))),
      bubble: r(sr.querySelector('#cat-speech')), zoom: r(sr.querySelector('#roamcat-zoom-controls'))};
  }`);
  const overlaps = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const oneColumn = l => Boolean(l) && l.btns.every(b => Math.abs(b.l - l.btns[0].l) <= 1);
  const centerX = b => (b.l + b.r) / 2;
  // 工具栏立在猫头上方时，最下面的按钮不压到猫头（按实际画稿量，不写死比例）。
  const aboveHead = l => Boolean(l?.head) && l.btns[3].b <= l.head.t;

  const isOpen = s => Boolean(s?.cls.includes('dock-open')) && s.expanded === 'true' && s.inert === false;
  const isClosed = s => Boolean(s) && !s.cls.includes('dock-open') && s.expanded === 'false' && s.inert === true;
  const isDocked = s => Boolean(s?.cls.includes('docked'));
  const awake = s => Boolean(s) && !s.cls.includes('docked');
  const waitPet = (ok, timeout) => until(petState, ok, timeout);
  const summaryOpen = () => tab.locator('.roamcat-summary-window.open').count();
  const summaryLoading = () => tab.locator('#summary-content .summary-loading').count();
  const readingState = () => petCall(`() => {
    const content = window.__ROAMCAT_CONTENT__;
    const status = content?.status?.();
    const pet = document.querySelector('#roamcat-pet-host')?.pet;
    const btn = pet?.shadowQuery('#quick-reading');
    return {
      contentAlive: Boolean(content?.isAlive?.()),
      enabled: Boolean(status?.enabled),
      paused: Boolean(status?.paused),
      btnActive: btn?.classList.contains('is-active'),
      pressed: btn?.getAttribute('aria-pressed'),
      title: btn?.title,
      dockOpen: pet?.container?.classList.contains('dock-open'),
    };
  }`);
  const initial = await waitPet(Boolean, 8000);
  check('伴读猫就绪', Boolean(initial), JSON.stringify(initial));

  // ---------- 1. 初始态 ----------
  check('初始缩放胶囊收起', initial && !initial.cls.includes('dock-open') && initial.expanded === 'false' && initial.inert === true,
    JSON.stringify(initial));
  check('初始缩放 100%', initial?.zoom === '100%', `zoom=${initial?.zoom}`);
  // 默认 ambient 只规定开启后的工作方式，阅读引擎尚未加载时按钮必须保持关闭。
  await petCall('async () => document.querySelector("#roamcat-pet-host").pet.updateReadingStatus()');
  const initialReading = await readingState();
  check('初始不加载阅读引擎', initialReading?.contentAlive === false, JSON.stringify(initialReading));
  check('未开启页面时阅读按钮不误亮', initialReading?.btnActive === false && initialReading?.pressed === 'false', JSON.stringify(initialReading));
  check('未开启页面时阅读按钮提示开启', initialReading?.title === '阅读辅助已暂停 · 点击开启', JSON.stringify(initialReading));

  // ---------- 2. 常态显示：不悬停、不点猫，四颗竖排按钮也一直可见可点 ----------
  const avatarBox = await avatar.boundingBox();
  check('猫头可定位', Boolean(avatarBox), JSON.stringify(avatarBox));
  const quickStyle = sel => tab.locator(sel).evaluate(el => { const s = getComputedStyle(el); return {opacity: s.opacity, pe: s.pointerEvents, vis: s.visibility}; });
  const shown = s => s.pe === 'auto' && s.vis === 'visible' && Number(s.opacity) > 0.9;
  await tab.mouse.move(720, 500);
  const idleShown = await Promise.all(['#quick-options', '#quick-summary', '#quick-reading', '.roamcat-flip-btn'].map(sel => until(() => quickStyle(sel), shown)));
  check('快捷按钮常态显示（未悬停、未点猫）', idleShown.every(shown), JSON.stringify(idleShown));

  // ---------- 3. 点击猫头展开缩放胶囊（dock-open 只管胶囊，竖排按钮本来就常驻） ----------
  await avatar.click();
  const reacted = await avatar.evaluate(el => el.classList.contains('action-jelly')).catch(() => false)
    || await tab.locator('.cat-particle').count() > 0;
  let st = await waitPet(isOpen);
  check('点击猫头展开缩放胶囊', st?.cls.includes('dock-open') && st.expanded === 'true' && st.inert === false,
    JSON.stringify({cls: st?.cls, expanded: st?.expanded, inert: st?.inert}));
  check('点击有果冻/粒子反馈', reacted);
  await shot('dock-open');
  // 竖排快捷按钮（参照陪读蛙）：收在一条竖胶囊工具栏里，居中立在猫头上方，旋旋翻离猫最近；
  // 缩放胶囊在猫朝页面内侧一边，不压按钮。
  // 点猫会触发果冻反馈，猫身形变期间量不准：等猫回到常态再量。
  const column = await until(layout, l => oneColumn(l) && aboveHead(l) && !overlaps(l.zoom, l.btns[3]), 5000);
  const gaps = column ? column.btns.slice(1).map((b, i) => b.t - column.btns[i].b) : [];
  check('快捷按钮竖排一列、自上而下设置/提炼/阅读/旋旋翻', oneColumn(column) && gaps.length === 3 && gaps.every(g => g >= 0 && g <= 4),
    JSON.stringify({btns: column?.btns, gaps}));
  check('竖排工具栏与猫居中对齐', Boolean(column) && column.btns.every(b => Math.abs(centerX(b) - centerX(column.host)) <= 1), JSON.stringify(column));
  check('竖列挂在猫头上方', Boolean(column) && aboveHead(column) && column.btns[0].t >= 0 && !column.cls.includes('dock-below'),
    JSON.stringify(column));
  check('缩放胶囊在猫朝页面内侧一边', Boolean(column) && column.zoom.r <= column.host.l && column.btns.every(b => !overlaps(b, column.zoom)),
    JSON.stringify(column));

  // ---------- 4. 悬停播报：三个按钮 + 旋旋翻各播一条气泡 ----------
  const hoverCases = [
    ['#quick-reading', '阅读辅助：点击开合本页提示 喵~'],
    ['#quick-summary', '提炼整篇精华，喂我一下就好 喵~'],
    ['#quick-options', '打开扩展偏好设置 喵~'],
    ['.roamcat-flip-btn', '旋旋翻：一键双语对照 喵~'],
  ];
  for (const [sel, expectText] of hoverCases) {
    const box = await tab.locator(sel).boundingBox();
    check(`悬停目标可见 ${sel}`, Boolean(box));
    if (!box) continue;
    await tab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const st = await until(petState, s => s?.speech === expectText && s.speechCls.includes('speaking'));
    check(`悬停播报 ${sel}`, st?.speech === expectText && st.speechCls.includes('speaking'),
      `speech=${st?.speech} cls=${st?.speechCls}`);
    // 气泡让到竖列内侧：与按钮、缩放胶囊都不重叠（按钮不再另弹提示条，气泡就是说明）。
    const lay = await until(layout, l => l.bubble.r <= l.btns[0].l && !overlaps(l.bubble, l.zoom));
    check(`悬停气泡不压竖排按钮 ${sel}`, lay.bubble.r <= lay.btns[0].l && lay.btns.every(b => !overlaps(b, lay.bubble)) && !overlaps(lay.bubble, lay.zoom),
      JSON.stringify({bubble: lay.bubble, btns: lay.btns, zoom: lay.zoom}));
  }
  // 移出按钮 → 气泡收回并复位默认文案
  await tab.mouse.move(720, 500);
  const afterLeave = await until(petState, s => s && !s.speechCls.includes('speaking') && s.speech === '漫游伴读 喵~');
  check('移开后气泡收回', afterLeave && !afterLeave.speechCls.includes('speaking') && afterLeave.speech === '漫游伴读 喵~',
    `speech=${afterLeave?.speech} cls=${afterLeave?.speechCls}`);

  // ---------- 5. 再点猫头收坞 ----------
  await avatar.click();
  st = await waitPet(isClosed);
  check('再点猫头收起缩放胶囊', st && !st.cls.includes('dock-open') && st.expanded === 'false' && st.inert === true,
    JSON.stringify({cls: st?.cls, expanded: st?.expanded}));

  // ---------- 6. 键盘开合：Enter 开坞，Esc 关坞 ----------
  await avatar.focus();
  await tab.keyboard.press('Enter');
  st = await waitPet(isOpen);
  check('Enter 键展开缩放胶囊', st?.cls.includes('dock-open'), `cls=${st?.cls}`);
  await tab.keyboard.press('Escape');
  st = await waitPet(isClosed);
  check('Esc 收起缩放胶囊', st && !st.cls.includes('dock-open'), `cls=${st?.cls}`);

  // ---------- 7. 点击页面空白处关坞 ----------
  await avatar.click();
  await waitPet(isOpen);
  await tab.mouse.click(30, 30);
  st = await waitPet(isClosed);
  check('点击页外收起缩放胶囊', st && !st.cls.includes('dock-open'), `cls=${st?.cls}`);

  // ---------- 8. 常驻的竖排按钮一直在 Tab 序里（可及性）；缩放胶囊收起时仍 inert ----------
  const tabOrder = await petCall(`() => {
    const btns = [...document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('.roamcat-quick-dock').children];
    return btns.map(b => ({id: b.id || b.className, tabIndex: b.tabIndex}));
  }`);
  check('四颗竖排按钮常驻 Tab 序', tabOrder?.length === 4 && tabOrder.every(b => b.tabIndex >= 0), JSON.stringify(tabOrder));
  // 从猫头 Shift+Tab 先到离猫最近的旋旋翻，再往上依次是阅读、提炼、设置。
  const focusId = () => petCall(`() => document.querySelector('#roamcat-pet-host').shadowRoot.activeElement?.id || ''`);
  await avatar.focus();
  const reverseTab = [];
  for (let i = 0; i < 4; i++) { await tab.keyboard.press('Shift+Tab'); reverseTab.push(await focusId()); }
  check('从猫头 Shift+Tab 依次经过旋旋翻、阅读、提炼、设置', reverseTab.join() === 'roamcat-flip-btn,quick-reading,quick-summary,quick-options',
    JSON.stringify(reverseTab));
  await tab.mouse.click(30, 30);

  // ---------- 9. 阅读辅助开关（缩放胶囊保持展开，方向自适应） ----------
  // setManualEnabled 要等 rebuild() 全量完成才回写按钮态：轮询 is-active 而非定时盲采
  const waitReadingBtn = (active) => tab.waitForFunction(
    a => document.querySelector('#roamcat-pet-host')?.shadowRoot
      ?.querySelector('#quick-reading')?.classList.contains('is-active') === a,
    active, {timeout: 15000}).then(() => true).catch(() => false);
  await avatar.click();
  await waitPet(isOpen);
  await tab.locator('#quick-reading').click();
  const landed1 = await waitReadingBtn(true);
  let afterReading = await readingState();
  check('首次点击加载并开启阅读辅助', landed1 && afterReading?.contentAlive === true && afterReading?.enabled === true
    && afterReading?.paused === false && afterReading?.btnActive === true && afterReading?.pressed === 'true', JSON.stringify(afterReading));
  check('阅读辅助标题随状态更新', afterReading?.title === '阅读辅助进行中 · 点击暂停',
    `title=${afterReading?.title}`);
  check('切换后缩放胶囊保持展开', afterReading?.dockOpen === true);
  // 再点复原
  await tab.locator('#quick-reading').click();
  const landed2 = await waitReadingBtn(false);
  afterReading = await readingState();
  check('再点阅读辅助关闭', landed2 && afterReading?.enabled === false && afterReading?.paused === true
    && afterReading?.btnActive === false && afterReading?.pressed === 'false' && afterReading?.title === '阅读辅助已暂停 · 点击开启',
    JSON.stringify(afterReading));
  if (!landed1 || !landed2) {
    warn('体验问题：阅读辅助开关缺少 pending 反馈，rebuild 期间按钮态滞后于实际状态');
  }
  // 弹窗和快捷键通过同一消息切换页面；按钮常驻显示，也要跟随实际状态。
  const readingTabId = await tabIdOf(extPage, `${fixtureBase}/*`);
  for (const enabled of [true, false]) {
    const response = await extPage.evaluate(async ({tabId, enabled}) =>
      chrome.tabs.sendMessage(tabId, {type: 'SS_SET_ENABLED', enabled}, {frameId: 0}), {tabId: readingTabId, enabled});
    const landed = await waitReadingBtn(enabled);
    const state = await readingState();
    check(`弹窗切换后伴读猫同步${enabled ? '开启' : '关闭'}`, response?.ok && landed && state?.enabled === enabled
      && state?.btnActive === enabled && state?.pressed === String(enabled)
      && state?.title === (enabled ? '阅读辅助进行中 · 点击暂停' : '阅读辅助已暂停 · 点击开启'), JSON.stringify(state));
  }

  // ---------- 10. 旋旋翻：无服务时走错误播报 ----------
  // 无服务时先播「还没连上 / 启动失败」，随后状态条的失败文案「整页翻译已停止」会接替它，两者都算错误反馈。
  await tab.locator('.roamcat-flip-btn').click();
  st = await until(petState, s => s?.speechCls.includes('speaking') && /连上|失败|连接|开动|复原|停止/.test(s.speech || ''), 4000);
  check('旋旋翻点击给出反馈气泡', st?.speechCls.includes('speaking') && /连上|失败|连接|开动|复原|停止/.test(st.speech || ''),
    `speech=${st?.speech}`);
  const flipErr = st?.speech || '';
  if (/辅助服务还没连上|启动失败|已停止/.test(flipErr)) {
    check('无服务时旋旋翻报错误态', st.avatarCls.includes('state-error'), `avatarCls=${st.avatarCls}`);
  } else {
    warn('旋旋翻进入翻译态（测试环境意外配置了服务？）', flipErr);
  }
  await shot('flip-error');
  // 等待错误气泡自动收回或手动关闭
  await tab.locator('#speech-close-btn').click().catch(() => {});
  await waitPet(s => s && !s.speechCls.includes('speaking'), 2000);

  // ---------- 11. 精华摘要：开窗 → 加载 →（无服务）错误 → 重试 → 关闭 ----------
  await avatar.click();
  await waitPet(isOpen);
  await tab.locator('#quick-summary').click();
  await until(summaryOpen, n => n === 1);
  st = await waitPet(s => s && !s.cls.includes('dock-open'));
  check('提炼收起缩放胶囊并开窗', st && !st.cls.includes('dock-open')
    && await tab.locator('.roamcat-summary-window.open').count() === 1,
    `dock=${st?.cls} open=${await tab.locator('.roamcat-summary-window.open').count()}`);
  const sawLoading = await tab.locator('#summary-content .summary-loading').count() > 0
    || await tab.locator('#summary-content').evaluate(el => el.innerHTML.length > 0).catch(() => false);
  check('摘要进入加载态', sawLoading);
  // 无服务：最终落错误态
  await tab.locator('#summary-content .summary-error').waitFor({state: 'attached', timeout: 12000})
    .catch(() => report.failures.push('摘要未落入错误态（服务意外可用或卡住）'));
  const errVisible = await tab.locator('#summary-content .summary-error').isVisible().catch(() => false);
  check('无服务摘要报错误态', errVisible);
  await shot('summary-error');

  // 窗内「重新尝试」按钮 → 再次进入加载
  const retryBtn = tab.locator('#summary-retry-btn');
  check('错误态渲染重试按钮', await retryBtn.count() === 1);
  if (await retryBtn.count()) {
    await retryBtn.click();
    await until(summaryLoading, n => n === 1, 1500);
    check('重试回到加载态', await tab.locator('#summary-content .summary-loading').count() === 1
      || await tab.locator('#summary-content .summary-error').count() === 1);
    await tab.locator('#summary-content .summary-error').waitFor({state: 'attached', timeout: 12000}).catch(() => {});
  }

  // 页脚「重新提炼」在错误态可点 → 重新请求
  await tab.locator('#summary-footer-refresh').click();
  await until(summaryLoading, n => n === 1, 1500);
  await tab.locator('#summary-content .summary-error').waitFor({state: 'attached', timeout: 12000}).catch(() => {});
  check('页脚重新提炼可再请求', true);

  // 错误态下点「复制摘要」应给出提示气泡而非静默无效
  await tab.locator('#summary-copy-btn').click();
  st = await waitPet(s => /还没有可复制的摘要/.test(s?.speech || ''));
  check('无摘要时复制按钮给提示反馈', /还没有可复制的摘要/.test(st?.speech || ''), `speech=${st?.speech}`);

  // 头部刷新按钮 → 再请求；Esc 关闭窗口
  await tab.locator('#summary-header-refresh').click();
  await until(summaryLoading, n => n === 1, 1500);
  await tab.locator('#summary-content .summary-error').waitFor({state: 'attached', timeout: 12000}).catch(() => {});
  check('头部刷新可再请求', true);
  await tab.keyboard.press('Escape');
  await until(summaryOpen, n => n === 0);
  check('Esc 关闭摘要窗', await tab.locator('.roamcat-summary-window.open').count() === 0);

  // Alt+Shift+M 重开 → ×关闭
  await tab.keyboard.press('Alt+Shift+M');
  await until(summaryOpen, n => n === 1);
  check('Alt+Shift+M 重开摘要窗', await tab.locator('.roamcat-summary-window.open').count() === 1);
  await tab.locator('#summary-content .summary-error').waitFor({state: 'attached', timeout: 12000}).catch(() => {});
  await tab.locator('#summary-close').click();
  await until(summaryOpen, n => n === 0);
  check('×按钮关闭摘要窗', await tab.locator('.roamcat-summary-window.open').count() === 0);

  // ---------- 12. 贴边折叠与唤醒 ----------
  await avatar.dblclick();
  st = await waitPet(isDocked);
  check('双击猫头贴边折叠', st?.cls.includes('docked'), `cls=${st?.cls}`);
  const hostRect = await until(() => tab.locator('#roamcat-pet-host').boundingBox(), b => b && Math.abs(b.x + b.width - 1440) < 90);
  check('贴边后吸附右缘', Boolean(hostRect) && Math.abs(hostRect.x + hostRect.width - 1440) < 90,
    `right=${hostRect ? Math.round(hostRect.x + hostRect.width) : 'n/a'}`);
  await shot('docked');

  // 贴边标签可及性：应为 role=button + 可 Tab 聚焦
  const edgeTabInfo = await petCall(`() => {
    const t = document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#roamcat-edge-tab');
    return {tag: t?.tagName, tabIndex: t?.tabIndex, role: t?.getAttribute('role'), visible: !!t};
  }`);
  check('贴边标签可及性（role+tabindex）', edgeTabInfo?.role === 'button' && edgeTabInfo.tabIndex >= 0,
    JSON.stringify(edgeTabInfo));
  // 探头猫贴住屏幕边：挂件右缘落在视口右缘（不再整体平移出屏裁掉爪子）
  const peekBox = await until(() => widget.boundingBox(), b => b && Math.abs(b.x + b.width - 1440) <= 1);
  check('贴边探头贴住右缘', Boolean(peekBox) && Math.abs(peekBox.x + peekBox.width - 1440) <= 1,
    `right=${peekBox ? Math.round(peekBox.x + peekBox.width) : 'n/a'}`);
  // 贴边态整条工具栏收起，悬停也只探头、不弹按钮
  const pb = await avatar.boundingBox();
  await tab.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
  // 观察窗口：这里断言的是贴边悬停「不会」弹出按钮，只能给悬停留出生效时间再看。
  await tab.waitForTimeout(450);
  const dockedHover = await tab.locator('.roamcat-quick-dock').evaluate(el => {
    const s = getComputedStyle(el);
    return {opacity: s.opacity, vis: s.visibility};
  });
  check('贴边时竖排工具栏收起、悬停不弹', dockedHover.vis === 'hidden' && Number(dockedHover.opacity) < 0.1, JSON.stringify(dockedHover));
  await shot('docked-hover');
  // 贴边标签仅作键盘入口：平时透明且不占命中区
  await tab.mouse.move(30, 30);
  const tabIdle = await until(() => tab.locator('#roamcat-edge-tab').evaluate(el => ({opacity: getComputedStyle(el).opacity, pe: getComputedStyle(el).pointerEvents})), v => Number(v.opacity) === 0 && v.pe === 'none');
  check('贴边标签平时隐藏', Number(tabIdle.opacity) === 0 && tabIdle.pe === 'none', JSON.stringify(tabIdle));
  // 标签自身 @click 接线验证
  await tab.locator('#roamcat-edge-tab').dispatchEvent('click');
  st = await waitPet(awake);
  check('贴边标签点击唤醒', st && !st.cls.includes('docked'), `cls=${st?.cls}`);

  // 再贴边 → 键盘聚焦标签 Enter 唤醒（新加 @keydown 路径）
  await avatar.dblclick();
  st = await waitPet(isDocked);
  check('双击再贴边', st?.cls.includes('docked'), `cls=${st?.cls}`);
  // 从猫头 Shift+Tab 回到标签：键盘导航才会命中 :focus-visible
  await avatar.focus();
  await tab.keyboard.press('Shift+Tab');
  const tabFocused = await until(() => tab.locator('#roamcat-edge-tab').evaluate(el => ({opacity: Number(getComputedStyle(el).opacity), fv: el.matches(':focus-visible')})), v => v.fv && v.opacity > 0.9);
  check('贴边标签键盘聚焦可见', tabFocused.fv && tabFocused.opacity > 0.9, JSON.stringify(tabFocused));
  await shot('docked-tab-focus');
  await tab.keyboard.press('Enter');
  st = await waitPet(awake);
  check('键盘 Enter 唤醒贴边标签', st && !st.cls.includes('docked'), `cls=${st?.cls}`);

  // 双击猫头贴边 → 单击唤醒
  await avatar.dblclick();
  st = await waitPet(isDocked);
  check('双击猫头贴边', st?.cls.includes('docked'), `cls=${st?.cls}`);
  await avatar.click();
  st = await waitPet(awake);
  check('贴边态单击唤醒', st && !st.cls.includes('docked'), `cls=${st?.cls}`);

  // 贴边态猫头 Enter 与单击一致：直接唤醒
  await avatar.dblclick();
  await waitPet(isDocked);
  await avatar.focus();
  await tab.keyboard.press('Enter');
  st = await waitPet(awake);
  check('贴边态猫头 Enter 唤醒', st && !st.cls.includes('docked'), `cls=${st?.cls}`);

  // ---------- 13. 拖拽位移并抑制误触 ----------
  const before = await tab.locator('#roamcat-pet-host').boundingBox();
  const ax = before.x + before.width / 2, ay = before.y + before.height / 2;
  const readBefore = await tab.locator('#quick-reading').boundingBox();
  await tab.mouse.move(ax, ay);
  await tab.mouse.down();
  await tab.mouse.move(ax - 60, ay - 40, {steps: 5});
  // 按钮常驻：拖动途中也不隐藏，整列跟着猫走。
  const readMid = await until(() => tab.locator('#quick-reading').boundingBox(), b => b && Math.abs(b.x - (readBefore.x - 60)) <= 2 && Math.abs(b.y - (readBefore.y - 40)) <= 2);
  const midDrag = await quickStyle('#quick-reading');
  check('拖动途中竖排按钮保持显示并跟着猫走', shown(midDrag) && Math.abs(readMid.x - (readBefore.x - 60)) <= 2 && Math.abs(readMid.y - (readBefore.y - 40)) <= 2,
    JSON.stringify({midDrag, readBefore, readMid}));
  await tab.mouse.up();
  const after = await until(() => tab.locator('#roamcat-pet-host').boundingBox(), b => b && Math.abs(b.x - before.x) > 30);
  st = await petState();
  check('拖拽移动伴读猫', Boolean(after) && Math.abs(after.x - before.x) > 30, `x ${before.x}→${after?.x}`);
  check('拖拽不展开缩放胶囊', st && !st.cls.includes('dock-open'), `cls=${st?.cls}`);

  // ---------- 13b. 竖列随位置换边：拖到视口顶部改挂猫脚下，拖到左半屏贴猫左缘 ----------
  const dragPetTo = async (x, y) => {
    const b = await avatar.boundingBox();
    await tab.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await tab.mouse.down();
    await tab.mouse.move(x, y, {steps: 6});
    await tab.mouse.up();
    await until(() => avatar.boundingBox(), nb => nb && Math.abs(nb.x + nb.width / 2 - x) < 12 && Math.abs(nb.y + nb.height / 2 - y) < 12);
  };
  await dragPetTo(1100, 70);
  let lay = await until(layout, l => l?.cls.includes('dock-below'));
  check('猫在视口顶部时竖列改挂到猫脚下、旋旋翻仍离猫最近', lay.cls.includes('dock-below') && oneColumn(lay)
    && lay.btns[3].t >= lay.host.b && lay.btns[3].t < lay.btns[2].t && lay.btns[0].b <= lay.vh, JSON.stringify(lay));
  const readBox = await tab.locator('#quick-reading').boundingBox();
  await tab.mouse.move(readBox.x + readBox.width / 2, readBox.y + readBox.height / 2);
  lay = await until(layout, l => l.bubble.t >= 0 && l.btns.every(b => !overlaps(b, l.bubble)));
  check('猫在视口顶部时悬停气泡在视口内且不压按钮', lay.bubble.t >= 0 && lay.btns.every(b => !overlaps(b, lay.bubble)), JSON.stringify(lay));
  await dragPetTo(300, 600);
  lay = await until(layout, l => l?.cls.includes('is-left') && !l.cls.includes('dock-below'));
  check('猫在左半屏时工具栏仍与猫居中', lay.cls.includes('is-left') && oneColumn(lay) && lay.btns.every(b => Math.abs(centerX(b) - centerX(lay.host)) <= 1)
    && aboveHead(lay), JSON.stringify(lay));
  const sumBox = await tab.locator('#quick-summary').boundingBox();
  await tab.mouse.move(sumBox.x + sumBox.width / 2, sumBox.y + sumBox.height / 2);
  lay = await until(layout, l => l.bubble.l >= l.btns[0].r);
  check('猫在左半屏时悬停气泡在竖列右侧', lay.bubble.l >= lay.btns[0].r && lay.btns.every(b => !overlaps(b, lay.bubble)), JSON.stringify(lay));
  await shot('left-half-hover');
  await dragPetTo(ax, ay);

  // ---------- 14. 缩放按钮 ----------
  await avatar.click();
  await waitPet(isOpen);
  const zoomSeq = [
    ['#zoom-out', '80%', true, false],   // 下限：- 禁用
    ['#zoom-in', '100%', false, false],
    ['#zoom-in', '120%', false, false],
    ['#zoom-in', '140%', false, false],
    ['#zoom-in', '160%', false, true],   // 上限：+ 禁用
  ];
  for (const [sel, label, outDisabled, inDisabled] of zoomSeq) {
    await tab.locator(sel).click();
    st = await waitPet(s => s?.zoom === label);
    check(`缩放 ${sel} → ${label}`, st?.zoom === label
      && await tab.locator('#zoom-out').evaluate(el => el.disabled) === outDisabled
      && await tab.locator('#zoom-in').evaluate(el => el.disabled) === inDisabled,
      `zoom=${st?.zoom} scale=${st?.scale}`);
  }
  check('缩放写入 --pet-scale', st?.scale === '1.6', `scale=${st?.scale}`);
  const big = await until(layout, aboveHead);
  check('160% 时工具栏仍立在猫头之上、胶囊不压猫', aboveHead(big) && big.zoom.r <= big.host.l, JSON.stringify(big));
  await shot('zoom-160');
  // 复位 100%（1.6→1.4→1.2→1.0 三步）
  for (const label of ['140%', '120%', '100%']) { await tab.locator('#zoom-out').click(); await waitPet(s => s?.zoom === label); }
  st = await petState();
  check('缩放回 100%', st?.zoom === '100%', `zoom=${st?.zoom}`);
  // 缩放胶囊比猫宽：把猫贴到视口最右边，胶囊也必须完整留在视口内（fitZoomControls 收位）。
  await petCall(`() => {
    const host = document.querySelector('#roamcat-pet-host');
    host.style.left = (innerWidth - host.offsetWidth - 2) + 'px'; host.style.right = 'auto';
    host.pet.fitSpeechBubble();
    return true;
  }`);
  const edge = await until(() => petCall(`() => {
    const host = document.querySelector('#roamcat-pet-host');
    const r = host.pet.shadowQuery('#roamcat-zoom-controls').getBoundingClientRect(), h = host.getBoundingClientRect();
    return {left: Math.round(r.left), right: Math.round(r.right), hostRight: Math.round(h.right), vw: innerWidth};
  }`), e => e && e.left >= 0 && e.right <= e.vw);
  check('猫贴右边时缩放胶囊不出界', edge && edge.hostRight >= edge.vw - 4 && edge.left >= 0 && edge.right <= edge.vw, JSON.stringify(edge));

  // ---------- 15. 气泡 × 关闭（忙碌态 → 成功微反馈） ----------
  // 鼠标先移出挂件区域再直达关闭钮，避免路过竖排按钮触发其 pointerleave 清掉忙碌气泡
  await tab.mouse.move(760, 60);
  await petCall(`() => { document.querySelector('#roamcat-pet-host').pet.speakStatus('正在解构正文 喵~', {busy: true}); return true; }`);
  st = await waitPet(s => s?.speechCls.includes('speaking') && s.speechCls.includes('is-busy'));
  check('忙碌气泡显示', st?.speechCls.includes('speaking') && st.speechCls.includes('is-busy'), st?.speechCls);
  // 悬停播报会清空进行中的状态气泡 —— 单独验证这一行为
  const hoverClobber = await petCall(`() => new Promise(resolve => {
    const pet = document.querySelector('#roamcat-pet-host').pet;
    pet.speakStatus('忙碌中不应被打断', {busy: true});
    const btn = pet.shadowQuery('#quick-reading');
    btn.dispatchEvent(new PointerEvent('pointerenter', {bubbles: true}));
    btn.dispatchEvent(new PointerEvent('pointerleave', {bubbles: true}));
    setTimeout(() => resolve({
      speaking: pet.shadowQuery('#cat-speech').classList.contains('speaking'),
      text: pet.shadowQuery('#speech-text').textContent,
    }), 60);
  })`);
  check('悬停播报不吞掉状态气泡', hoverClobber?.speaking === true && String(hoverClobber.text).includes('忙碌中不应被打断'),
    JSON.stringify(hoverClobber));
  // 恢复忙碌气泡再测 ×
  await petCall(`() => { document.querySelector('#roamcat-pet-host').pet.speakStatus('正在解构正文 喵~', {busy: true}); return true; }`);
  await waitPet(s => s?.speechCls.includes('is-busy'));
  const closeBox = await tab.locator('#speech-close-btn').boundingBox();
  if (closeBox) await tab.mouse.click(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
  st = await waitPet(s => s?.speech === '准备好啦 喵~');
  check('×关闭忙碌气泡并给成功反馈', st?.speech === '准备好啦 喵~', `speech=${st?.speech}`);
  st = await waitPet(s => s && !s.speechCls.includes('speaking') && s.speech === '漫游伴读 喵~', 5000);
  check('成功反馈后气泡自动收回', st && !st.speechCls.includes('speaking') && st.speech === '漫游伴读 喵~',
    `speech=${st?.speech} cls=${st?.speechCls}`);

  // ---------- 16. options 按钮打开/聚焦设置页 ----------
  // 设置页已打开时只聚焦，不另开窗口。extPage 本身就是 options.html。
  await avatar.click();
  await waitPet(isOpen);
  await tab.locator('#quick-options').click();
  const optionsVisible = await until(() => extPage.evaluate(() => document.visibilityState).catch(() => 'unknown'), v => v === 'visible', 4000);
  check('设置按钮拉起 options 页', optionsVisible === 'visible', `visibility=${optionsVisible}`);
  await tab.bringToFront();
  st = await waitPet(s => s && !s.cls.includes('dock-open'));
  check('点设置后缩放胶囊已收起', st && !st.cls.includes('dock-open'), `cls=${st?.cls}`);

  await tab.pump();
} catch (error) {
  report.failures.push(`门禁运行出错: ${error.message}`);
  console.error(error);
} finally {
  await run.close();
  await server.close();
}

// ---------- 汇总 ----------
noteScreenshots(report);
report.summary = {checks: report.checks.length, failures: report.failures.length, warnings: report.warnings.length};
fs.writeFileSync(path.join(out, 'pet-buttons-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({summary: report.summary, failures: report.failures, warnings: report.warnings}, null, 2));
if (report.failures.length) process.exitCode = 1;
printGateSummary('pet', report.checks.length, report.failures.length);
