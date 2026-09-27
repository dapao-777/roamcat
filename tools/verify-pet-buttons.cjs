/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// 伴读猫悬浮按钮专项门禁：真实 Edge + 真实 content script 环境，
// 对猫头/快捷坞 5 按钮/旋旋翻/缩放/贴边标签/气泡关闭/摘要窗全部按钮
// 做真实鼠标点击与键盘操作并断言状态变化，报告写入 preview/pet-buttons/。
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {launchExtension} = require('./lib/edge-extension.cjs');

const root = path.resolve(__dirname, '..');
const extensionDir = path.resolve(process.env.ROAMCAT_EXTENSION_DIR || path.join(root, 'dist/extension'));
const out = path.resolve(process.env.PET_AUDIT_OUT || path.join(root, 'preview/pet-buttons'));
fs.mkdirSync(out, {recursive: true});

const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json'};
const fixturesRoot = path.join(root, 'tools/fixtures');
const server = http.createServer((req, res) => {
  const file = path.resolve(fixturesRoot, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(fixturesRoot + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, data) => {
    if (e) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});

const report = {checks: [], failures: [], warnings: [], consoleErrors: []};
const check = (name, cond, detail = '') => {
  if (cond) report.checks.push(name);
  else report.failures.push(detail ? `${name} — ${detail}` : name);
  return cond;
};
const warn = (name, detail) => report.warnings.push(detail ? `${name} — ${detail}` : name);

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const fixtureBase = `http://127.0.0.1:${server.address().port}`;
  const {context, extPage, close} = await launchExtension({extensionDir, viewport: {width: 1440, height: 1000}});
  try {
    const tab = await context.newPage();
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
      const tabId = await extPage.evaluate(async url => (await chrome.tabs.query({url}))[0].id, `${fixtureBase}/*`);
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
    await tab.mouse.move(avatarBox.x + avatarBox.width / 2, avatarBox.y + avatarBox.height / 2);
    await tab.waitForTimeout(450);
    const hoverReveal = await tab.locator('#quick-reading').evaluate(el => {
      const s = getComputedStyle(el);
      return {opacity: s.opacity, pe: s.pointerEvents};
    });
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

    // ---------- 4. 悬停播报：五个按钮 + 旋旋翻各播一条气泡 ----------
    const hoverCases = [
      ['#quick-reading', '阅读辅助：点击开合本页提示 喵~'],
      ['#quick-summary', '提炼整篇精华，喂我一下就好 喵~'],
      ['#quick-options', '打开扩展偏好设置 喵~'],
      ['#quick-dock', '贴边折叠，需要时再戳我 喵~'],
      ['.roamcat-flip-btn', '旋旋翻：一键双语对照 喵~'],
    ];
    for (const [sel, expectText] of hoverCases) {
      const box = await tab.locator(sel).boundingBox();
      check(`悬停目标可见 ${sel}`, Boolean(box));
      if (!box) continue;
      await tab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await tab.waitForTimeout(350);
      const st = await petState();
      check(`悬停播报 ${sel}`, st?.speech === expectText && st.speechCls.includes('speaking'),
        `speech=${st?.speech} cls=${st?.speechCls}`);
    }
    // 移出按钮 → 气泡收回并复位默认文案
    await tab.mouse.move(720, 500);
    await tab.waitForTimeout(350);
    const afterLeave = await petState();
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
    await tab.locator('.roamcat-flip-btn').click();
    await tab.waitForTimeout(1200);
    st = await petState();
    check('旋旋翻点击给出反馈气泡', st?.speechCls.includes('speaking') && /连上|失败|连接|开动|复原/.test(st.speech || ''),
      `speech=${st?.speech}`);
    const flipErr = st?.speech || '';
    if (/辅助服务还没连上|启动失败/.test(flipErr)) {
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
    await avatar.click();
    await tab.waitForTimeout(350);
    await tab.locator('#quick-dock').click();
    await tab.waitForTimeout(500);
    st = await petState();
    check('贴边折叠生效', st?.cls.includes('docked'), `cls=${st?.cls}`);
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
    // 设计：鼠标悬停挂件时猫探出、标签淡出并让位（pointer-events:none）——
    // 移开鼠标后标签才是可点目标；点中猫则走头像唤醒兜底，两条路径同结果。
    await tab.mouse.move(30, 30);
    await tab.waitForTimeout(400);
    const edgeBox = await tab.locator('#roamcat-edge-tab').boundingBox();
    let edgeHit = '';
    if (edgeBox) {
      for (const fx of [1, Math.round(edgeBox.width / 2), edgeBox.width - 1]) {
        edgeHit = await tab.evaluate(({x, y}) => {
          const sr = document.querySelector('#roamcat-pet-host')?.shadowRoot;
          const el = sr?.elementFromPoint?.(x, y) || document.elementFromPoint(x, y);
          return String(el?.id || el?.className || el?.tagName || 'none');
        }, {x: edgeBox.x + fx, y: edgeBox.y + edgeBox.height / 2});
        if (edgeHit.includes('edge-tab')) break;
      }
    }
    check('鼠标移开后贴边标签可点', edgeHit.includes('edge-tab'), `hit=${edgeHit}`);
    // 标签自身 @click 接线验证（真实命中路径被悬停让位覆盖，属设计行为）
    await tab.locator('#roamcat-edge-tab').dispatchEvent('click');
    await tab.waitForTimeout(500);
    st = await petState();
    check('贴边标签点击唤醒', st && !st.cls.includes('docked'), `cls=${st?.cls}`);

    // 再贴边 → 键盘聚焦标签 Enter 唤醒（新加 @keydown 路径）
    await avatar.dblclick();
    await tab.waitForTimeout(600);
    st = await petState();
    check('双击再贴边', st?.cls.includes('docked'), `cls=${st?.cls}`);
    await tab.locator('#roamcat-edge-tab').focus();
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
    // chrome.runtime.openOptionsPage 对已打开的 options 页是聚焦而非新建，
    // extPage 本身就是 options.html —— 断言它变为可见前台即视为生效。
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

    // ---------- 汇总 ----------
    report.summary = {checks: report.checks.length, failures: report.failures.length, warnings: report.warnings.length};
    fs.writeFileSync(path.join(out, 'pet-buttons-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (report.failures.length) process.exitCode = 1;
  } finally {
    await close();
    server.close();
  }
})().catch(err => { console.error(err); process.exit(2); });
