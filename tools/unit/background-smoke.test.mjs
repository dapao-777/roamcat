/**
 * @file tools/unit/background-smoke.test.mjs
 * 文件职责：在 Node 中以 chrome API mock 对迁移后的 background.js 做模块级冒烟测试——
 *   验证注册表能在真实模块作用域内构造（无 TDZ/引用错误）、消息监听接线完整、
 *   信任边界与载荷校验经注册表派发后行为不变。这是无浏览器环境下最接近 audit-extension.cjs 的一层。
 * 主要内容：mock chrome.runtime/storage/tabs；import 真实 background.js（node:test 每文件独立进程，
 *   模块缓存只在本文件内共享，因此 import 与全部派发断言放在同一测试的子树中）；经 onMessage 监听器
 *   发送 STATE_GET / OPEN_OPTIONS / DOMAIN_TEST / FLOATING_PET_POSITION_SET / API_MODELS_LIST /
 *   LIVE_CHAT_TRANSLATE（主机/开关检查与 API 限额）/ ENSURE_PAGE_UI（Twitch 补注入、阅读脚本与九件套同序）/ 未知类型，断言成功、拒绝与错误文案；导入期不得出现注册表完整性告警。
 * 模块边界：仅 mock 浏览器边界，不 mock 任何被测扩展模块；不访问 IndexedDB（history-store 懒加载，
 *   本测试不触发历史操作）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

function createChromeMock() {
  const areas = {local: new Map(), session: new Map()};
  const openedOptions = {count: 0};
  const registeredScripts = [];
  const listeners = {};
  const runtime = {
    id: 'testextensionid1234567890abcdef',
    lastError: null,
    getURL: path => `chrome-extension://${runtime.id}/${String(path).replace(/^\/+/u, '')}`,
    onConnect: {addListener() {}},
    onMessage: {addListener(fn) { listeners.message = fn; }},
    onInstalled: {addListener(fn) { (listeners.installed ||= []).push(fn); }},
    onStartup: {addListener(fn) { (listeners.startup ||= []).push(fn); }},
    sendMessage: async () => undefined,
    openOptionsPage: async () => { openedOptions.count++; },
    connectNative: () => { throw new Error('mock: 未安装本机连接器'); },
    getContexts: async () => [],
  };
  const createdTabs = [];
  // 按标签页指定网址（缺省 example.com）；probe 为补注入前探测脚本的返回值，files 记录每次补注入的文件清单。
  const tabUrls = new Map();
  const injections = {probe: null, files: []};
  const read = (map, keys) => {
    if (keys === null || keys === undefined) return Object.fromEntries(map);
    const list = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(list.filter(key => map.has(key)).map(key => [key, map.get(key)]));
  };
  const write = (map, value) => { for (const [key, item] of Object.entries(value || {})) map.set(key, structuredClone(item)); };
  const drop = (map, keys) => { for (const key of Array.isArray(keys) ? keys : [keys]) map.delete(key); };
  const storageArea = map => ({
    get: async keys => read(map, keys),
    set: async value => write(map, value),
    remove: async keys => drop(map, keys),
    getBytesInUse: async () => 0,
    QUOTA_BYTES: 10 * 1024 * 1024,
  });
  const chrome = {
    runtime,
    // 断言用的是中文报错文案：界面语言固定为中文，不随运行环境（如英文 CI 机器）的 navigator.language 漂移。
    i18n: {getUILanguage: () => 'zh-CN'},
    storage: {local: storageArea(areas.local), session: storageArea(areas.session)},
    tabs: {
      query: async () => [],
      get: async tabId => ({id: tabId, url: tabUrls.get(tabId) || 'https://example.com/', active: true}),
      sendMessage: async () => undefined,
      create: async props => { createdTabs.push(props); return {id: 99, windowId: props?.windowId ?? 1}; },
      remove: async () => {},
      update: async () => {},
      onRemoved: {addListener() {}},
      onUpdated: {addListener() {}},
      onActivated: {addListener() {}},
    },
    scripting: {
      executeScript: async details => {
        if (details?.files) injections.files.push(details.files);
        return details?.func && injections.probe ? [{result: injections.probe}] : [];
      },
      getRegisteredContentScripts: async () => [],
      registerContentScripts: async list => { registeredScripts.push(...list); return []; },
      unregisterContentScripts: async () => {},
    },
    contextMenus: {removeAll: async () => {}, create: () => {}, onClicked: {addListener() {}}},
    commands: {onCommand: {addListener() {}}},
    // 只对全网主机模式放行：足以驱动伴读猫动态注册，又不影响站点级未授权断言。
    permissions: {
      contains: async perms => Boolean(perms?.origins?.some(o => o === 'http://*/*' || o === 'https://*/*')),
      remove: async () => false, onAdded: {addListener() {}}, onRemoved: {addListener() {}},
    },
    tts: {},
    offscreen: {hasDocument: async () => false, createDocument: async () => {}},
    webNavigation: {getFrame: async () => null, onHistoryStateUpdated: {addListener() {}}, onBeforeNavigate: {addListener() {}}},
    windows: {
      getAll: async () => [{id: 3, focused: true, type: 'normal', tabs: [{id: 1, url: 'https://example.com/'}]}],
      update: async () => {},
    },
  };
  return {chrome, listeners, openedOptions, registeredScripts, createdTabs, tabUrls, injections};
}

const trustedPopup = chrome => ({id: chrome.runtime.id, url: chrome.runtime.getURL('ui/popup.html'), tab: {id: 1, url: 'https://example.com/'}});
const contentPage = chrome => ({id: chrome.runtime.id, url: 'https://example.com/', tab: {id: 1, url: 'https://example.com/'}, frameId: 0});

test('迁移后的 background.js 在 mock 浏览器中构造注册表并按信任边界派发', async (t) => {
  const warnings = [];
  const originalError = console.error;
  console.error = (...args) => warnings.push(args.join(' '));
  const {chrome, listeners, registeredScripts, createdTabs, tabUrls, injections} = createChromeMock();
  globalThis.chrome = chrome;
  try {
    await import('../../roamcat-0.0.1/extension/background.js');
  } finally {
    console.error = originalError;
  }

  // 注册表完整性自检（漏注册/多注册）在导入期必须保持静默。
  assert.deepEqual(warnings.filter(line => line.includes('消息处理器')), []);
  assert.equal(typeof listeners.message, 'function', 'onMessage 监听未注册');
  assert.equal(listeners.installed.length, 3);
  assert.equal(listeners.startup.length, 2);

  const send = (message, sender) => new Promise(resolve => {
    listeners.message(message, sender, response => resolve(response));
  });

  await t.test('受信扩展页读取默认状态', async () => {
    const response = await send({type: 'STATE_GET'}, trustedPopup(chrome));
    assert.equal(response.ok, true, response.error);
    assert.equal(response.data.settings.assistanceMode, 'ambient');
    assert.equal(response.data.settings.lookupKey, 'D');
  });

  await t.test('内容脚本按白名单放行与拒绝', async () => {
    const allowed = await send({type: 'STATE_GET'}, contentPage(chrome));
    assert.equal(allowed.ok, true, allowed.error);
    const denied = await send({type: 'STATE_PATCH', patch: {assistanceMode: 'on-demand'}}, contentPage(chrome));
    assert.equal(denied.ok, false);
    assert.match(denied.error, /此操作不能从网页执行。/u);
  });

  await t.test('未知类型得到与旧 switch default 一致的错误', async () => {
    const unknown = await send({type: 'NOT_A_REAL_TYPE'}, trustedPopup(chrome));
    assert.equal(unknown.ok, false);
    assert.match(unknown.error, /未知请求。/u);
  });

  await t.test('parse 阶段提取的载荷校验经真实派发生效', async () => {
    const badDomainTest = await send({type: 'DOMAIN_TEST', text: '  '}, trustedPopup(chrome));
    assert.equal(badDomainTest.ok, false);
    assert.match(badDomainTest.error, /测试正文不能为空/u);
  });

  await t.test('伴读猫载荷先来源检查后解析再落库', async () => {
    const badPet = await send({type: 'FLOATING_PET_POSITION_SET', position: {right: 1}}, contentPage(chrome));
    assert.equal(badPet.ok, false);
    assert.match(badPet.error, /伴读猫位置无效。/u);
    const goodPet = await send({type: 'FLOATING_PET_POSITION_SET', position: {right: 40, bottom: 120}}, contentPage(chrome));
    assert.equal(goodPet.ok, true, goodPet.error);
    assert.deepEqual(goodPet.data.floatingPet.position, {right: 40, bottom: 120});
    // scale 单独成补丁：合法档位落库，非法档位拒绝。
    const scaledPet = await send({type: 'FLOATING_PET_POSITION_SET', scale: 1.4}, contentPage(chrome));
    assert.equal(scaledPet.ok, true, scaledPet.error);
    assert.equal(scaledPet.data.floatingPet.scale, 1.4);
    const badScale = await send({type: 'FLOATING_PET_POSITION_SET', scale: 2}, contentPage(chrome));
    assert.equal(badScale.ok, false);
    assert.match(badScale.error, /伴读猫缩放无效。/u);
    const emptyPet = await send({type: 'FLOATING_PET_POSITION_SET'}, contentPage(chrome));
    assert.equal(emptyPet.ok, false);
  });

  await t.test('API_MODELS_LIST 仅允许 options 页', async () => {
    const wrongPage = await send({type: 'API_MODELS_LIST', service: {id: 'x'}}, {id: chrome.runtime.id, url: chrome.runtime.getURL('ui/welcome.html')});
    assert.equal(wrongPage.ok, false);
    assert.match(wrongPage.error, /仅设置页可以读取 API 模型列表。/u);
  });

  await t.test('OPEN_OPTIONS 在正在浏览的窗口里只开一个设置页', async () => {
    const opened = await send({type: 'OPEN_OPTIONS', section: 'service'}, trustedPopup(chrome));
    assert.equal(opened.ok, true, opened.error);
    assert.equal(createdTabs.length, 1);
    assert.equal(createdTabs[0].windowId, 3);
    assert.match(createdTabs[0].url, /\/ui\/options\.html#service$/u);
  });

  await t.test('LIVE_CHAT_TRANSLATE 只限 Twitch、开关打开，API 通道按标签页每分钟限 12 次', async () => {
    const twitch = 'https://www.twitch.tv/somechannel';
    tabUrls.set(7, twitch);
    const chatPage = {id: chrome.runtime.id, url: twitch, tab: {id: 7, url: twitch}, frameId: 0};
    const items = [{id: 'lc-1', text: 'that play was insane', context: {title: 'Twitch live chat · somechannel', heading: '', before: '', after: ''}}];
    const translate = sender => send({type: 'LIVE_CHAT_TRANSLATE', requestId: 'chat-1', items}, sender);

    const elsewhere = await translate(contentPage(chrome));
    assert.equal(elsewhere.ok, false);
    assert.match(elsewhere.error, /直播聊天翻译仅适用于 Twitch。/u);
    const off = await translate(chatPage);
    assert.equal(off.ok, false);
    assert.match(off.error, /直播聊天翻译已关闭。/u);

    const enabled = await send({type: 'VIDEO_SETTINGS_PATCH', patch: {liveChat: true}}, chatPage);
    assert.equal(enabled.ok, true, enabled.error);
    assert.equal(enabled.data.video.liveChat, true);
    const {settings} = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({settings: {...settings, providerKind: 'api'}});

    // 没配好 API 服务时每次都会失败，但请求照样占额度；第 13 次不再发请求，直接退回等待时长。
    for (let i = 0; i < 12; i++) {
      const attempt = await translate(chatPage);
      assert.equal(attempt.data?.throttled, undefined, `第 ${i + 1} 次不应被限速`);
    }
    const throttled = await translate(chatPage);
    assert.equal(throttled.ok, true, throttled.error);
    assert.equal(throttled.data.throttled, true);
    assert.deepEqual(throttled.data.items, []);
    assert.ok(throttled.data.retryAfterMs > 0 && throttled.data.retryAfterMs <= 60_000);
    // 限额按标签页计：别的 Twitch 标签页不受影响。
    tabUrls.set(8, twitch);
    const other = await translate({...chatPage, tab: {id: 8, url: twitch}});
    assert.equal(other.data?.throttled, undefined);
  });

  await t.test('补注入给已打开的 Twitch 页带上 live-chat.js，排在文案运行时之后', async () => {
    const ensure = async probe => {
      injections.probe = probe;
      injections.files.length = 0;
      const response = await send({type: 'ENSURE_PAGE_UI'}, {...contentPage(chrome), tab: {id: 9, url: 'https://www.twitch.tv/x'}});
      assert.equal(response.ok, true, response.error);
      return injections.files.flat();
    };
    try {
      const fresh = await ensure({contentAlive: false, petAlive: false, videoAlive: false, liveChatAlive: false, host: 'www.twitch.tv'});
      assert.ok(fresh.includes('live-chat.js'));
      assert.ok(fresh.indexOf('i18n-content.js') < fresh.indexOf('live-chat.js'));
      assert.deepEqual(await ensure({contentAlive: true, petAlive: true, videoAlive: false, liveChatAlive: true, host: 'www.twitch.tv'}), []);
      assert.ok(!(await ensure({contentAlive: false, petAlive: true, videoAlive: false, liveChatAlive: false, host: 'example.com'})).includes('live-chat.js'));
    } finally {
      injections.probe = null;
    }
  });

  await t.test('补注入阅读脚本与 manifest 九件套同集同序', async () => {
    const manifest = JSON.parse(readFileSync(new URL('../../roamcat-0.0.1/extension/manifest.json', import.meta.url), 'utf8'));
    const statics = manifest.content_scripts[0].js;
    injections.probe = {contentAlive: false, petAlive: false, videoAlive: false, liveChatAlive: false, host: 'example.com'};
    injections.files.length = 0;
    try {
      const response = await send({type: 'ENSURE_PAGE_UI'}, {...contentPage(chrome), tab: {id: 10, url: 'https://example.com/a'}});
      assert.equal(response.ok, true, response.error);
      // 漏掉 complexity.js / formula.js 不会报错，只会让长难句高亮变空、公式被送去翻译。
      assert.deepEqual(injections.files.flat().filter(file => statics.includes(file)), statics);
    } finally {
      injections.probe = null;
    }
  });

  await t.test('伴读猫动态注册只注入 floating-pet*.js，依赖由静态 content_scripts 提供', async () => {
    // 导入期 init 会触发 reconcileAutomation → reconcileAutoScript；轮询等待注册落地。
    let pet;
    for (let i = 0; i < 50 && !pet; i++) {
      pet = registeredScripts.find(item => item.id === 'ss-floating-pet');
      if (!pet) await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(pet, 'floatingPet 默认开启且全网放行时必须注册 ss-floating-pet');
    // 重复注册 design/pet-quotes/content-ui 会让每个网页把它们解析执行两遍。
    assert.deepEqual(pet.js, ['floating-pet-helpers.js', 'floating-pet-styles.js', 'floating-pet-svg.js', 'floating-pet-quote-bubble.js', 'floating-pet-summary.js', 'floating-pet.js']);
    const manifest = JSON.parse(readFileSync(new URL('../../roamcat-0.0.1/extension/manifest.json', import.meta.url), 'utf8'));
    const statics = manifest.content_scripts.flatMap(item => item.js);
    for (const dep of ['design.js', 'i18n-content.js', 'pet-quotes.js', 'content-ui.js']) {
      assert.ok(statics.includes(dep), `静态 content_scripts 缺少伴读猫依赖 ${dep}`);
    }
    for (const pattern of pet.matches) {
      assert.ok(manifest.content_scripts.some(item => item.matches.includes(pattern)), `${pattern} 不在静态注入范围内`);
    }
  });
});
