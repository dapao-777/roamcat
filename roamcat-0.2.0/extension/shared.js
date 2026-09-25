/**
 * @file extension/shared.js
 * 文件职责：扩展共享基座——默认设置、规范化、词ID与后台请求封装。
 * 主要内容：DEFAULT_SETTINGS/normalizeSettings/wordId/request；旧键禁spread复活。
 * 模块边界：领域层；被全扩展引用；改动注意迁移兼容。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import './reading-style.js';
import {normalizeApiService} from './api-providers.mjs';

export const DOMAINS = {auto:'自动识别',general:'通用阅读',tech:'软件与 AI',data:'数据工程',finance:'金融与商业',medical:'医学与生命科学',legal:'法律',design:'设计与产品'};
export const DEFAULT_SETTINGS = {assistanceMode:'ambient',rememberSupport:true,helpLanguage:'zh',lookupKey:'D',lookupDisplay:'card',readingStyle:globalThis.RoamCatReadingStyle.defaults,domain:'auto',providerKind:'chatgpt',subscriptionModel:'',apiServices:[],activeApiServiceId:'',domainRules:[],domainDetection:{mode:'local',subscriptionModel:'',apiModel:'',useTranslationApi:true,api:{baseUrl:'https://api.openai.com/v1',apiKey:''},jevModel:'typesafe/jev-1.13.0',jevApiKey:'',jevBaseUrl:'https://router.requesty.ai/v1'},customTerms:[],automation:{allSites:false,sentenceGroupsAllSites:false,sites:[],videoSites:false},video:{fontSize:20,theme:'auto'},floatingPet:{enabled:true,position:{right:24,bottom:84},themeMode:'auto',scale:1,quotes:{enabled:true,intervalMin:15}}};
// Removed settings must not revive through a spread of an older configuration.
export function normalizeSettings(value = {}) {
  const pick = (defaults, source) => Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, source?.[key] ?? fallback]));
  const settings = pick(DEFAULT_SETTINGS,value);
  settings.assistanceMode = value.assistanceMode === 'on-demand' ? 'on-demand' : 'ambient';
  settings.rememberSupport = value.rememberSupport !== false;
  settings.helpLanguage = value.helpLanguage === 'en' ? 'en' : 'zh';
  settings.lookupKey = typeof value.lookupKey === 'string' && /^[A-Za-z]$/.test(value.lookupKey) ? value.lookupKey.toUpperCase() : DEFAULT_SETTINGS.lookupKey;
  settings.lookupDisplay = value.lookupDisplay === 'annotation' ? 'annotation' : 'card';
  settings.readingStyle = globalThis.RoamCatReadingStyle.normalize(value.readingStyle);
  settings.providerKind = ['chatgpt','grok','antigravity','api'].includes(value.providerKind) ? value.providerKind : (value.provider?.apiKey ? 'api' : 'chatgpt');
  const legacyProvider = !Array.isArray(value.apiServices) && Object.hasOwn(value,'provider');
  const rows = Array.isArray(value.apiServices) ? value.apiServices : (legacyProvider ? [{id:'legacy-api',name:'原有 API 服务',baseUrl:value.provider?.baseUrl,model:value.provider?.model,apiKey:value.provider?.apiKey}] : []);
  const seen=new Set();settings.apiServices=rows.flatMap(row=>{try{const service=normalizeApiService(row);if(!service.id||seen.has(service.id))return [];seen.add(service.id);return [service];}catch{return [];}});
  settings.activeApiServiceId = settings.apiServices.some(service=>service.id===value.activeApiServiceId) ? value.activeApiServiceId : (legacyProvider&&settings.apiServices.some(service=>service.id==='legacy-api')?'legacy-api':'');
  settings.domainDetection = pick(DEFAULT_SETTINGS.domainDetection,value.domainDetection);
  settings.domainDetection.api = pick(DEFAULT_SETTINGS.domainDetection.api,value.domainDetection?.api);
  settings.automation = pick(DEFAULT_SETTINGS.automation,value.automation);
  settings.automation.sites = Array.isArray(value.automation?.sites) ? value.automation.sites.map(({origin,enabled}) => ({origin,enabled})) : [];
  settings.video = pick(DEFAULT_SETTINGS.video,value.video);
  const fp = value.floatingPet;
  settings.floatingPet = {
    enabled: fp?.enabled !== false,
    position: {
      right: typeof fp?.position?.right === 'number' && Number.isFinite(fp.position.right) ? Math.max(0, fp.position.right) : 24,
      bottom: typeof fp?.position?.bottom === 'number' && Number.isFinite(fp.position.bottom) ? Math.max(0, fp.position.bottom) : 84,
    },
    themeMode: ['auto', 'dark', 'light'].includes(fp?.themeMode) ? fp.themeMode : 'auto',
    scale: [0.8, 1, 1.2, 1.4, 1.6].includes(fp?.scale) ? fp.scale : 1,
    quotes: {
      enabled: fp?.quotes?.enabled !== false,
      intervalMin: [15, 30, 60].includes(fp?.quotes?.intervalMin) ? fp.quotes.intervalMin : 15
    }
  };
  return settings;
}
export function activeApiProvider(settings) { return settings?.apiServices?.find(service=>service.id===settings.activeApiServiceId) || null; }
export const wordId = (term, domain = 'general') => `${domain}:${term.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase()}`;
// 后台侧上限：订阅 assist/翻译/总结 120s，其余 45s，自备 API 25s（阶跃星辰 60s）。
// 内容侧超时必须留出余量，只在响应丢失时触发（如 SW 被回收、连接器静默），正常流程永远碰不到。
const LONG_REQUEST_TYPES = new Set(['ASSIST','EMERGENCY_BEGIN','EMERGENCY_TRANSLATE','PASSAGE_TRANSLATE','PAGE_SUMMARY','SENTENCE_GROUPS_BATCH','SUPPORT_BATCH']);
const LONG_REQUEST_TIMEOUT = 150000;
const DEFAULT_REQUEST_TIMEOUT = 60000;
export async function request(type, payload = {}) {
  const timeoutMs = LONG_REQUEST_TYPES.has(type) ? LONG_REQUEST_TIMEOUT : DEFAULT_REQUEST_TIMEOUT;
  let timer;
  try {
    const response = await Promise.race([
      chrome.runtime.sendMessage({type,...payload}),
      new Promise((_,reject) => {
        timer = setTimeout(() => reject(new Error('请求超时，后台可能正忙或已被浏览器回收，请重试。')), timeoutMs);
      }),
    ]);
    if (!response?.ok) throw new Error(response?.error || '插件连接已断开，请刷新页面后重试。');
    return response.data;
  } finally {
    clearTimeout(timer);
  }
}
export const WELCOME_GUIDE_KEY = 'welcomeGuideOpened';
export function welcomeGuideUrl() { return chrome.runtime.getURL('ui/welcome.html'); }
export async function welcomeGuideTabs() {
  const url = welcomeGuideUrl();
  const tabs = [];
  const seen = new Set();
  const collect = (id, windowId) => {
    if (Number.isInteger(id) && !seen.has(id)) { seen.add(id); tabs.push({id, windowId}); }
  };
  // Chromium 40670457：无 tabs 权限时 tabs.query 的 url 过滤对扩展自身页面静默落空，
  // 先用 runtime.getContexts 枚举自家 TAB 文档（documentUrl 以 welcome.html 开头即命中，覆盖 #anchor）；
  // tabs.query 留作兜底，在能拿到 URL 访问权的环境里仍然有效。
  try {
    for (const context of await chrome.runtime.getContexts({contextTypes:['TAB']})) {
      if (typeof context?.documentUrl === 'string' && context.documentUrl.startsWith(url)) collect(context.tabId, context.windowId);
    }
  } catch { /* getContexts 不可用时退回 tabs.query */ }
  try {
    for (const tab of await chrome.tabs.query({url:[url, url + '*']})) collect(tab.id, tab.windowId);
  } catch { /* 查询失败不丢已收集结果 */ }
  return tabs;
}
let welcomeGuideFlight = Promise.resolve();
function queueWelcomeGuide(task) {
  const work = welcomeGuideFlight.then(task, task);
  welcomeGuideFlight = work.catch(() => {});
  return work;
}
export function settleWelcomeGuide(reason) {
  return queueWelcomeGuide(async () => {
    let tabs = await welcomeGuideTabs();
    if (tabs.length > 1) {
      await chrome.tabs.remove(tabs.slice(1).map(tab => tab.id));
      tabs = tabs.slice(0, 1);
    }
    // 未打包扩展每次点「重新加载」也会报 install。用本机记录挡住，避免每改一次就再开一扇引导。
    if (reason !== 'install') return;
    const stored = await chrome.storage.local.get(WELCOME_GUIDE_KEY);
    if (stored[WELCOME_GUIDE_KEY]) return;
    if (!tabs.length) await chrome.tabs.create({url:welcomeGuideUrl()});
    await chrome.storage.local.set({[WELCOME_GUIDE_KEY]:true});
  });
}
export function focusWelcomeGuide() {
  return queueWelcomeGuide(async () => {
    const tabs = await welcomeGuideTabs();
    const [keep, ...extra] = tabs;
    if (extra.length) await chrome.tabs.remove(extra.map(tab => tab.id));
    if (keep) {
      await chrome.tabs.update(keep.id, {active:true});
      if (Number.isInteger(keep.windowId)) await chrome.windows.update(keep.windowId, {focused:true}).catch(() => {});
      return keep;
    }
    return chrome.tabs.create({url:welcomeGuideUrl()});
  });
}
export function closeWelcomeGuide() {
  return queueWelcomeGuide(async () => {
    await chrome.storage.local.set({[WELCOME_GUIDE_KEY]:true, welcomeGuideClosed:true});
    const ids = (await welcomeGuideTabs()).map(tab => tab.id);
    try {
      const self = await chrome.tabs.getCurrent?.();
      if (Number.isInteger(self?.id) && !ids.includes(self.id)) ids.push(self.id);
    } catch { /* service worker 等非页签上下文没有当前页签 */ }
    if (ids.length) await chrome.tabs.remove(ids);
    else window.close();
  });
}