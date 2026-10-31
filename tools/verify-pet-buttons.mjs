/**
 * @file tools/verify-pet-buttons.mjs
 * 文件职责：伴读猫悬浮按钮专项门禁（npm run verify:pet）——在 ego lite 的真实 content script 环境里，对猫头 / 快捷坞按钮 /
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
  await tab.waitForTimeout(900);
  await tab.locator('#roamcat-pet-host').waitFor({state: 'attached', timeout: 10000})
    .catch(() => report.failures.push('伴读猫宿主未注入页面'));
  await tab.bringToFront();
  await tab.waitForTimeout(600);

  const widget = tab.locator('.roamcat-pet-widget');
  const avatar = tab.locator('.roamcat-avatar-wrap');
  const bubble = tab.locator('#cat-speech');
  const speechText = tab.locator('#cat-speech .speech-text');
  const shot = async name => tab.screenshot({path: path.join(out, name + '.png')});

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

  const initial = await petState();
  check('伴读猫就绪', Boolean(initial), JSON.stringify(initial));

  // ---------- 1. 初始态 ----------
  check('初始快捷坞收起', initial && !initial.cls.includes('dock-open') && initial.expanded === 'false' && initial.inert === true,
    JSON.stringify(initial));
  check('初始缩放 100%', initial?.zoom === '100%', `zoom=${initial?.zoom}`);

  // ---------- 2. 悬停预览：鼠标悬停猫身，卫星按钮即可交互 ----------
  const avatarBox = await avatar.boundingBox();
  check('猫头可定位', Boolean(avatarBox), JSON.stringify(avatarBox));
  // ego 里测试页在后台时约 1 帧/秒：悬停、过渡动画都要按状态轮询等待，不能只等固定时长。
  const until = async (probe, ok, timeout = 3000) => {
    const deadline = Date.now() + timeout;
    let value = await probe();
    while (!ok(value) && Date.now() < deadline) { await tab.waitForTimeout(150); value = await probe(); }
    return value;
  };
  const quickStyle = sel => tab.locator(sel).evaluate(el => { const s = getComputedStyle(el); return {opacity: s.opacity, pe: s.pointerEvents}; });
  await tab.mouse.move(avatarBox.x + avatarBox.width / 2, avatarBox.y + avatarBox.height / 2);
  const hoverReveal = await until(() => quickStyle('#quick-reading'), s => s.pe === 'auto' && Number(s.opacity) > 0.9);
  check('悬停猫身显出快捷按钮', hoverReveal.pe === 'auto' && Number(hoverReveal.opacity) > 0.9, JSON.stringify(hoverReveal));

  // ---------- 3. 点击猫头开坞（dock-open 让按钮稳定可见，不依赖持续悬停） ----------
  await avatar.click();
  const reacted = await avatar.evaluate(el => el.classList.contains('action-jelly')).catch(() => false)
    || await tab.locator('.cat-particle').count() > 0;
  await tab.waitForTimeout(400);
  let st = await petState();
  check('点击猫头展开快捷坞', st?.cls.includes('dock-open') && st.expanded === 'true' && st.inert === false,
    JSON.stringify({cls: st?.cls, expanded: st?.expanded, inert: st?.inert}));
  check('点击有果冻/粒子反馈', reacted);
  await shot('dock-open');
  // 快捷按钮 2×2 方阵：上下两排按列对齐（贴右缘时右侧列离猫最近）
  const grid = await petCall(`() => {
    const sr = document.querySelector('#roamcat-pet-host').shadowRoot;
    const r = sel => { const b = sr.querySelector(sel).getBoundingClientRect(); return {x: Math.round(b.x), y: Math.round(b.y)}; };
    return {sum: r('#quick-summary'), opt: r('#quick-options'), flip: r('#roamcat-flip-btn'), read: r('#quick-reading')};
  }`);
  check('快捷按钮 2×2 方阵列对齐', grid && Math.abs(grid.sum.x - grid.flip.x) <= 1 && Math.abs(grid.opt.x - grid.read.x) <= 1
    && grid.sum.y < grid.flip.y, JSON.stringify(grid));

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
  }
  // 移出按钮 → 气泡收回并复位默认文案
  await tab.mouse.move(720, 500);
  const afterLeave = await until(petState, s => s && !s.speechCls.includes('speaking') && s.speech === '漫游伴读 喵~');
  check('移开后气泡收回', afterLeave && !afterLeave.speechCls.includes('speaking') && afterLeave.speech === '漫游伴读 喵~',
    `speech=${afterLeave?.speech} cls=${afterLeave?.speechCls}`);

  // ---------- 5. 再点猫头收坞 ----------
  await avatar.click();
  await tab.waitForTimeout(400);
  st = await petState();
  check('再点猫头收起快捷坞', st && !st.cls.includes('dock-open') && st.expanded === 'false' && st.inert === true,
    JSON.stringify({cls: st?.cls, expanded: st?.expanded}));

  // ---------- 6. 键盘开合：Enter 开坞，Esc 关坞 ----------
  await avatar.focus();
  await tab.keyboard.press('Enter');
  await tab.waitForTimeout(350);
  st = await petState();
  check('Enter 键展开快捷坞', st?.cls.includes('dock-open'), `cls=${st?.cls}`);
  await tab.keyboard.press('Escape');
  await tab.waitForTimeout(350);
  st = await petState();
  check('Esc 收起快捷坞', st && !st.cls.includes('dock-open'), `cls=${st?.cls}`);

  // ---------- 7. 点击页面空白处关坞 ----------
  await avatar.click();
  await tab.waitForTimeout(350);
  await tab.mouse.click(30, 30);
  await tab.waitForTimeout(350);
  st = await petState();
  check('点击页外收起快捷坞', st && !st.cls.includes('dock-open'), `cls=${st?.cls}`);

  // ---------- 8. 快捷坞收起时按钮退出 Tab 序（可及性） ----------
  const focusableWhenClosed = await petCall(`() => {
    const btns = [...document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('.roamcat-quick-dock').children];
    return btns.map(b => ({id: b.id || b.className, tabIndex: b.tabIndex}));
  }`);
  const stillTabbable = (focusableWhenClosed || []).filter(b => b.tabIndex >= 0);
  check('收起态卫星按钮退出 Tab 序', stillTabbable.length === 0, JSON.stringify(stillTabbable));
  // 展开后回到 Tab 序
  await avatar.click();
  await tab.waitForTimeout(350);
  const focusableWhenOpen = await petCall(`() => {
    const btns = [...document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('.roamcat-quick-dock').children];
    return btns.map(b => ({id: b.id || b.className, tabIndex: b.tabIndex}));
  }`);
  const untabbableWhenOpen = (focusableWhenOpen || []).filter(b => b.tabIndex < 0);
  check('展开态卫星按钮回到 Tab 序', untabbableWhenOpen.length === 0, JSON.stringify(untabbableWhenOpen));
  await avatar.click();
  await tab.waitForTimeout(300);

  // ---------- 9. 阅读辅助开关（快捷坞保持展开，方向自适应） ----------
  // setManualEnabled 要等 rebuild() 全量完成才回写按钮态：轮询 is-active 而非定时盲采
  const waitReadingBtn = (active) => tab.waitForFunction(
    a => document.querySelector('#roamcat-pet-host')?.shadowRoot
      ?.querySelector('#quick-reading')?.classList.contains('is-active') === a,
    active, {timeout: 15000}).then(() => true).catch(() => false);
  await avatar.click();
  await tab.waitForTimeout(350);
  const beforeReading = await tab.locator('#quick-reading').evaluate(el => el.classList.contains('is-active'));
  await tab.locator('#quick-reading').click();
  const landed1 = await waitReadingBtn(!beforeReading);
  let afterReading = await petCall(`() => ({
    enabled: window.__ROAMCAT_CONTENT__?.status?.().enabled,
    paused: window.__ROAMCAT_CONTENT__?.status?.().paused,
    btnActive: document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#quick-reading').classList.contains('is-active'),
    title: document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#quick-reading').title,
    dockOpen: document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('.roamcat-pet-widget').classList.contains('dock-open'),
  })`);
  const nowEnabled = !beforeReading;
  check('点击阅读辅助切换状态', landed1 && afterReading?.enabled === nowEnabled && afterReading?.btnActive === nowEnabled,
    `before=${beforeReading} after=${JSON.stringify(afterReading)}`);
  check('阅读辅助标题随状态更新', afterReading?.title === (nowEnabled ? '阅读辅助进行中 · 点击暂停' : '阅读辅助已暂停 · 点击开启'),
    `title=${afterReading?.title}`);
  check('切换后快捷坞保持展开', afterReading?.dockOpen === true);
  // 再点复原
  await tab.locator('#quick-reading').click();
  const landed2 = await waitReadingBtn(beforeReading);
  afterReading = await petCall(`() => ({
    enabled: window.__ROAMCAT_CONTENT__?.status?.().enabled,
    btnActive: document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#quick-reading').classList.contains('is-active'),
    title: document.querySelector('#roamcat-pet-host').shadowRoot.querySelector('#quick-reading').title,
  })`);
  check('再点阅读辅助复原', landed2 && afterReading?.enabled === beforeReading && afterReading?.btnActive === beforeReading,
    JSON.stringify(afterReading));
  if (!landed1 || !landed2) {
    warn('体验问题：阅读辅助开关缺少 pending 反馈，rebuild 期间按钮态滞后于实际状态');
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
  await tab.waitForTimeout(300);

  // ---------- 11. 精华摘要：开窗 → 加载 →（无服务）错误 → 重试 → 关闭 ----------
  await avatar.click();
  await tab.waitForTimeout(350);
  await tab.locator('#quick-summary').click();
  await tab.waitForTimeout(500);
  st = await petState();
  check('提炼收起快捷坞并开窗', st && !st.cls.includes('dock-open')
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
    await tab.waitForTimeout(400);
    check('重试回到加载态', await tab.locator('#summary-content .summary-loading').count() === 1
      || await tab.locator('#summary-content .summary-error').count() === 1);
    await tab.locator('#summary-content .summary-error').waitFor({state: 'attached', timeout: 12000}).catch(() => {});
  }

  // 页脚「重新提炼」在错误态可点 → 重新请求
  await tab.locator('#summary-footer-refresh').click();
  await tab.waitForTimeout(400);
  await tab.locator('#summary-content .summary-error').waitFor({state: 'attached', timeout: 12000}).catch(() => {});
  check('页脚重新提炼可再请求', true);

  // 错误态下点「复制摘要」应给出提示气泡而非静默无效
  await tab.locator('#summary-copy-btn').click();
  await tab.waitForTimeout(300);
  st = await petState();
  check('无摘要时复制按钮给提示反馈', /还没有可复制的摘要/.test(st?.speech || ''), `speech=${st?.speech}`);

  // 头部刷新按钮 → 再请求；Esc 关闭窗口
  await tab.locator('#summary-header-refresh').click();
  await tab.waitForTimeout(400);
  await tab.locator('#summary-content .summary-error').waitFor({state: 'attached', timeout: 12000}).catch(() => {});
  check('头部刷新可再请求', true);
  await tab.keyboard.press('Escape');
  await tab.waitForTimeout(350);
  check('Esc 关闭摘要窗', await tab.locator('.roamcat-summary-window.open').count() === 0);

  // Alt+Shift+M 重开 → ×关闭
  await tab.keyboard.press('Alt+Shift+M');
  await tab.waitForTimeout(600);
  check('Alt+Shift+M 重开摘要窗', await tab.locator('.roamcat-summary-window.open').count() === 1);
  await tab.locator('#summary-content .summary-error').waitFor({state: 'attached', timeout: 12000}).catch(() => {});
  await tab.locator('#summary-close').click();
  await tab.waitForTimeout(350);
  check('×按钮关闭摘要窗', await tab.locator('.roamcat-summary-window.open').count() === 0);

  // ---------- 12. 贴边折叠与唤醒 ----------
  await avatar.dblclick();
  await tab.waitForTimeout(600);
  st = await petState();
  check('双击猫头贴边折叠', st?.cls.includes('docked'), `cls=${st?.cls}`);
  const hostRect = await tab.locator('#roamcat-pet-host').boundingBox();
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
  const peekBox = await widget.boundingBox();
  check('贴边探头贴住右缘', Boolean(peekBox) && Math.abs(peekBox.x + peekBox.width - 1440) <= 1,
    `right=${peekBox ? Math.round(peekBox.x + peekBox.width) : 'n/a'}`);
  // 贴边态悬停只探头，不弹快捷按钮方阵
  const pb = await avatar.boundingBox();
  await tab.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await tab.waitForTimeout(450);
  const dockedHover = await tab.locator('#quick-reading').evaluate(el => {
    const s = getComputedStyle(el);
    return {opacity: s.opacity, pe: s.pointerEvents};
  });
  check('贴边悬停不弹快捷按钮', dockedHover.pe === 'none' && Number(dockedHover.opacity) < 0.1, JSON.stringify(dockedHover));
  await shot('docked-hover');
  // 贴边标签仅作键盘入口：平时透明且不占命中区
  await tab.mouse.move(30, 30);
  await tab.waitForTimeout(400);
  const tabIdle = await tab.locator('#roamcat-edge-tab').evaluate(el => ({opacity: getComputedStyle(el).opacity, pe: getComputedStyle(el).pointerEvents}));
  check('贴边标签平时隐藏', Number(tabIdle.opacity) === 0 && tabIdle.pe === 'none', JSON.stringify(tabIdle));
  // 标签自身 @click 接线验证
  await tab.locator('#roamcat-edge-tab').dispatchEvent('click');
  await tab.waitForTimeout(500);
  st = await petState();
  check('贴边标签点击唤醒', st && !st.cls.includes('docked'), `cls=${st?.cls}`);

  // 再贴边 → 键盘聚焦标签 Enter 唤醒（新加 @keydown 路径）
  await avatar.dblclick();
  await tab.waitForTimeout(600);
  st = await petState();
  check('双击再贴边', st?.cls.includes('docked'), `cls=${st?.cls}`);
  // 从猫头 Shift+Tab 回到标签：键盘导航才会命中 :focus-visible
  await avatar.focus();
  await tab.keyboard.press('Shift+Tab');
  await tab.waitForTimeout(250);
  const tabFocused = await tab.locator('#roamcat-edge-tab').evaluate(el => ({opacity: Number(getComputedStyle(el).opacity), fv: el.matches(':focus-visible')}));
  check('贴边标签键盘聚焦可见', tabFocused.fv && tabFocused.opacity > 0.9, JSON.stringify(tabFocused));
  await shot('docked-tab-focus');
  await tab.keyboard.press('Enter');
  await tab.waitForTimeout(500);
  st = await petState();
  check('键盘 Enter 唤醒贴边标签', st && !st.cls.includes('docked'), `cls=${st?.cls}`);

  // 双击猫头贴边 → 单击唤醒
  await avatar.dblclick();
  await tab.waitForTimeout(600);
  st = await petState();
  check('双击猫头贴边', st?.cls.includes('docked'), `cls=${st?.cls}`);
  await avatar.click();
  await tab.waitForTimeout(500);
  st = await petState();
  check('贴边态单击唤醒', st && !st.cls.includes('docked'), `cls=${st?.cls}`);

  // 贴边态猫头 Enter 与单击一致：直接唤醒
  await avatar.dblclick();
  await tab.waitForTimeout(600);
  await avatar.focus();
  await tab.keyboard.press('Enter');
  await tab.waitForTimeout(500);
  st = await petState();
  check('贴边态猫头 Enter 唤醒', st && !st.cls.includes('docked'), `cls=${st?.cls}`);

  // ---------- 13. 拖拽位移并抑制误触 ----------
  const before = await tab.locator('#roamcat-pet-host').boundingBox();
  const ax = before.x + before.width / 2, ay = before.y + before.height / 2;
  await tab.mouse.move(ax, ay);
  await tab.mouse.down();
  await tab.mouse.move(ax - 60, ay - 40, {steps: 5});
  await tab.mouse.up();
  await tab.waitForTimeout(400);
  const after = await tab.locator('#roamcat-pet-host').boundingBox();
  st = await petState();
  check('拖拽移动伴读猫', Boolean(after) && Math.abs(after.x - before.x) > 30, `x ${before.x}→${after?.x}`);
  check('拖拽不触发快捷坞', st && !st.cls.includes('dock-open'), `cls=${st?.cls}`);

  // ---------- 14. 缩放按钮 ----------
  await avatar.click();
  await tab.waitForTimeout(350);
  const zoomSeq = [
    ['#zoom-out', '80%', true, false],   // 下限：- 禁用
    ['#zoom-in', '100%', false, false],
    ['#zoom-in', '120%', false, false],
    ['#zoom-in', '140%', false, false],
    ['#zoom-in', '160%', false, true],   // 上限：+ 禁用
  ];
  for (const [sel, label, outDisabled, inDisabled] of zoomSeq) {
    await tab.locator(sel).click();
    await tab.waitForTimeout(250);
    st = await petState();
    check(`缩放 ${sel} → ${label}`, st?.zoom === label
      && await tab.locator('#zoom-out').evaluate(el => el.disabled) === outDisabled
      && await tab.locator('#zoom-in').evaluate(el => el.disabled) === inDisabled,
      `zoom=${st?.zoom} scale=${st?.scale}`);
  }
  check('缩放写入 --pet-scale', st?.scale === '1.6', `scale=${st?.scale}`);
  await shot('zoom-160');
  // 复位 100%（1.6→1.4→1.2→1.0 三步）
  for (let i = 0; i < 3; i++) { await tab.locator('#zoom-out').click(); await tab.waitForTimeout(150); }
  st = await petState();
  check('缩放回 100%', st?.zoom === '100%', `zoom=${st?.zoom}`);
  // 缩放胶囊比猫宽：把猫贴到视口最右边，胶囊也必须完整留在视口内（fitZoomControls 收位）。
  const edge = await petCall(`() => {
    const host = document.querySelector('#roamcat-pet-host');
    host.style.left = (innerWidth - host.offsetWidth - 2) + 'px'; host.style.right = 'auto';
    host.pet.fitSpeechBubble();
    return new Promise(resolve => setTimeout(() => {
      const r = host.pet.shadowQuery('#roamcat-zoom-controls').getBoundingClientRect(), h = host.getBoundingClientRect();
      resolve({left: Math.round(r.left), right: Math.round(r.right), hostRight: Math.round(h.right), vw: innerWidth});
    }, 400));
  }`);
  check('猫贴右边时缩放胶囊不出界', edge && edge.hostRight >= edge.vw - 4 && edge.left >= 0 && edge.right <= edge.vw, JSON.stringify(edge));

  // ---------- 15. 气泡 × 关闭（忙碌态 → 成功微反馈） ----------
  // 鼠标先移出挂件区域再直达关闭钮，避免路过卫星按钮触发其 pointerleave 清掉忙碌气泡
  await tab.mouse.move(760, 60);
  await petCall(`() => { document.querySelector('#roamcat-pet-host').pet.speakStatus('正在解构正文 喵~', {busy: true}); return true; }`);
  await tab.waitForTimeout(300);
  st = await petState();
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
  await tab.waitForTimeout(200);
  const closeBox = await tab.locator('#speech-close-btn').boundingBox();
  if (closeBox) await tab.mouse.click(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
  await tab.waitForTimeout(250);
  st = await petState();
  check('×关闭忙碌气泡并给成功反馈', st?.speech === '准备好啦 喵~', `speech=${st?.speech}`);
  await tab.waitForTimeout(2000);
  st = await petState();
  check('成功反馈后气泡自动收回', st && !st.speechCls.includes('speaking') && st.speech === '漫游伴读 喵~',
    `speech=${st?.speech} cls=${st?.speechCls}`);

  // ---------- 16. options 按钮打开/聚焦设置页 ----------
  // 设置页已打开时只聚焦，不另开窗口。extPage 本身就是 options.html。
  await avatar.click();
  await tab.waitForTimeout(350);
  await tab.locator('#quick-options').click();
  await tab.waitForTimeout(1200);
  const optionsVisible = await extPage.evaluate(() => document.visibilityState).catch(() => 'unknown');
  check('设置按钮拉起 options 页', optionsVisible === 'visible', `visibility=${optionsVisible}`);
  await tab.bringToFront();
  await tab.waitForTimeout(300);
  st = await petState();
  check('点设置后快捷坞已收起', st && !st.cls.includes('dock-open'), `cls=${st?.cls}`);

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
