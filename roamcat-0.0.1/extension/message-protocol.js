/**
 * @file extension/message-protocol.js
 * 文件职责：后台消息协议的唯一事实源——集中登记全部消息类型、内容脚本白名单与可纯函数化的
 *   载荷解析规则，使注册表完整性、信任边界与输入校验脱离 background.js 后仍可被单测覆盖。
 * 主要内容：MESSAGE_TYPES（与 background.js 注册表一一对应的有序清单）、CONTENT_ALLOWED_TYPES
 *   （网页上下文可用的类型子集）、text/domain 校验器、validatePatch 设置补丁校验、
 *   settingsPatchEffects 副作用计划推导，以及 parseDomainTest / parseFloatingPetPatch /
 *   parsePopupIntentTake / parseAnalyze / parseHistoryRuleSet / parseHistoryRecordRef /
 *   parseHistorySummaryEdit 载荷解析器。
 * 模块边界：只依赖 shared.js、domain-routing.js、api-providers.mjs 等领域模块，不访问 chrome、
 *   不发起请求、不读取配置；新增消息类型必须同步 MESSAGE_TYPES、background.js 注册表与
 *   SPEC.md 第 5 节，由 tools/unit/message-router.test.mjs 的源码契约测试强制一致。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {DOMAINS, DEFAULT_SETTINGS, API_TASKS, wordId, activeApiProvider} from './shared.js';
import {normalizeDomainRules} from './domain-routing.js';
import {getApiProvider, normalizeApiService, apiServiceOrigins} from './api-providers.mjs';
import {normalizeAssistanceCommand} from './gloss.mjs';

const M=(zh,en)=>globalThis.RoamCatI18n?.lang?.()==='en'?en:zh;

// 与 subscription.js 的 SUBSCRIPTION_KINDS 对应的协议层副本；领域层不得反向依赖应用层，
// 一致性由 tools/unit 的镜像断言测试保证。
export const CONNECTOR_KINDS = Object.freeze(['chatgpt', 'grok', 'antigravity']);

/** 后台支持的全部消息类型，顺序与 background.js 注册表一致。 */
export const MESSAGE_TYPES = Object.freeze([
  'HISTORY_GET', 'HISTORY_CONFIG', 'HISTORY_BEGIN', 'HISTORY_TICK', 'HISTORY_COMMIT', 'HISTORY_ANNOTATION',
  'WORD_PREFERENCE_SET', 'HISTORY_DELETE', 'HISTORY_SUMMARY_EDIT', 'HISTORY_CLEAR', 'HISTORY_EXPORT',
  'PERSONALIZATION_GET', 'PERSONALIZATION_ANALYZE', 'PERSONALIZATION_APPLY', 'PERSONALIZATION_DISMISS',
  'PERSONALIZATION_ROLLBACK', 'PERSONALIZATION_RESET', 'HISTORY_RULE_SET',
  'DIAGNOSTICS_GET', 'DIAGNOSTICS_EXPORT', 'DIAGNOSTICS_SET', 'DIAGNOSTICS_CLEAR', 'DIAGNOSTICS_RENDER',
  'USAGE_STATS_GET', 'USAGE_STATS_CLEAR',
  'POPUP_INTENT_TAKE', 'PAGE_UI_INJECT', 'ENSURE_PAGE_UI',
  'SENTENCE_GROUPS_GET', 'SENTENCE_GROUPS_SET', 'SENTENCE_GROUPS_DENSITY_SET', 'SENTENCE_GROUPS_LINE_STYLE_SET',
  'AUTO_BOOTSTRAP_CHECK', 'AUTOMATION_GET', 'AUTOMATION_PATCH', 'PAGE_ACTIVITY_SET',
  'VIDEO_SETTINGS_PATCH', 'YOUTUBE_CAPTIONS_BRIDGE', 'FLOATING_PET_POSITION_SET',
  'STATE_GET', 'SUBSCRIPTION_STATUS', 'SUBSCRIPTION_LOGIN', 'SUBSCRIPTION_CANCEL', 'SUBSCRIPTION_LOGOUT',
  'MODELS_LIST', 'API_MODELS_LIST', 'PAGE_DOMAIN_GET', 'PAGE_DOMAIN_SET', 'RESOLVE_DOMAIN', 'DOMAIN_TEST',
  'STATE_PATCH', 'ANALYZE', 'SUPPORT_BATCH', 'SENTENCE_GROUPS_BATCH', 'PREPARED_SUPPORT', 'PREPARED_ASSIST',
  'ASSIST_PREVIEW', 'EMERGENCY_BEGIN', 'PASSAGE_TRANSLATE', 'EMERGENCY_TRANSLATE', 'EMERGENCY_CANCEL_REQUEST',
  'EMERGENCY_END', 'ASSIST', 'ASSIST_COMMIT', 'PROVIDER_TEST', 'ENCOUNTER', 'INTERACT', 'READING_ACTIVITY',
  'READING_DATA_EXPORT', 'ON_DEMAND_SUGGESTION', 'MEMORY_CLEAR', 'PAGE_SUMMARY', 'OPEN_OPTIONS',
  'READER_TRANSLATE',
]);

/**
 * 内容脚本（网页上下文）可使用的消息类型；WORD_PREFERENCE_SET 另在 handle 中按条件放行，
 * 因为非可信来源要额外经过 readingSource 校验。
 */
export const CONTENT_ALLOWED_TYPES = Object.freeze([
  'HISTORY_BEGIN', 'HISTORY_TICK', 'HISTORY_COMMIT', 'HISTORY_ANNOTATION', 'DIAGNOSTICS_RENDER',
  'STATE_GET', 'RESOLVE_DOMAIN', 'ANALYZE', 'SUPPORT_BATCH', 'SENTENCE_GROUPS_GET', 'SENTENCE_GROUPS_SET',
  'SENTENCE_GROUPS_BATCH', 'ASSIST', 'ASSIST_PREVIEW', 'ASSIST_COMMIT', 'ENCOUNTER', 'INTERACT',
  'READING_ACTIVITY', 'YOUTUBE_CAPTIONS_BRIDGE', 'OPEN_OPTIONS', 'AUTO_BOOTSTRAP_CHECK', 'PAGE_ACTIVITY_SET',
  'FLOATING_PET_POSITION_SET', 'VIDEO_SETTINGS_PATCH', 'PREPARED_SUPPORT', 'PREPARED_ASSIST', 'PASSAGE_TRANSLATE',
  'EMERGENCY_BEGIN', 'EMERGENCY_TRANSLATE', 'EMERGENCY_CANCEL_REQUEST', 'EMERGENCY_END', 'PAGE_SUMMARY',
  'ENSURE_PAGE_UI',
]);

/** 字符串载荷校验：必填、去首尾空白、长度上限；错误信息面向用户可操作。 */
export function text(value, name, max, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new Error(name + M('不能为空，且不能超过 ',' must be non-empty and at most ') + max + M(' 个字符。',' characters.'));
  }
  return value.trim();
}

/** 领域标识校验：只接受设置里登记的领域（含 auto 之外的固定集合）。 */
export function domain(value) {
  if (!Object.hasOwn(DOMAINS, value)) throw new Error(M('不支持的领域。','Unsupported domain.'));
  return value;
}

/** DOMAIN_TEST 载荷：正文必填且限长，标题可选。 */
export function parseDomainTest(message) {
  return {
    text: text(message?.text, M('测试正文','Test body'), 40000),
    title: text(message?.title || '', M('标题','Title'), 500, false),
  };
}

/** 伴读猫缩放档位（与 floating-pet.js PET_SCALE_STEPS 保持一致）。 */
export const PET_SCALE_STEPS = [0.8, 1, 1.2, 1.4, 1.6];

/**
 * FLOATING_PET_POSITION_SET 载荷：位置、主题、缩放可单独出现，但至少出现一项；
 * 位置必须是只含 right/bottom 两个有限非负坐标键的对象，缩放必须落在档位内。
 */
export function parseFloatingPetPatch(message) {
  const hasPosition = Boolean(message?.position);
  const hasTheme = typeof message?.themeMode === 'string';
  const hasScale = message?.scale !== undefined;
  if (!hasPosition && !hasTheme && !hasScale) throw new Error(M('伴读猫位置无效。','Invalid companion-pet position.'));
  const floatingPet = {};
  if (hasPosition) {
    const position = message.position;
    if (typeof position !== 'object' || Array.isArray(position)
      || Object.keys(position).some(key => !['right', 'bottom'].includes(key))
      || !Object.hasOwn(position, 'right') || !Object.hasOwn(position, 'bottom')) throw new Error(M('伴读猫位置无效。','Invalid companion-pet position.'));
    floatingPet.position = position;
  }
  if (hasTheme) floatingPet.themeMode = message.themeMode;
  if (hasScale) {
    if (!PET_SCALE_STEPS.includes(message.scale)) throw new Error(M('伴读猫缩放无效。','Invalid companion-pet scale.'));
    floatingPet.scale = message.scale;
  }
  return floatingPet;
}

/** POPUP_INTENT_TAKE 载荷：目标标签页与网址必须完整。 */
export function parsePopupIntentTake(message) {
  if (!Number.isInteger(message?.tabId) || typeof message?.url !== 'string') throw new Error(M('快捷键操作无效。','Invalid shortcut action.'));
  return {tabId: message.tabId, url: message.url};
}

/**
 * 领域识别自定义 API 的协议描述（原 background.js 私有助手，随 validatePatch 一并下沉）。
 */
export function customDetectionService(api, model = '') {
  return {id: 'domain-detection', name: M('领域识别 API','Domain-detection API'), providerId: 'openai-compatible', baseUrl: api.baseUrl, model, apiKey: api.apiKey, options: {}};
}

/**
 * 设置补丁校验（自 background.js 原样迁移）：逐键白名单校验并返回规范化补丁。
 * automation/video 必须走各自接口；readingStyle 委托 RoamCatReadingStyle；
 * API 服务、领域识别、术语、伴读猫均在此完成形态与引用完整性检查。
 * @param {object} patch 待校验补丁
 * @param {object} currentSettings 当前规范化设置（用于默认值与引用校验）
 */
export function validatePatch(patch, currentSettings) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error(M('无效设置。','Invalid settings.'));
  const result = {};
  for (const key of Object.keys(patch)) if (!Object.hasOwn(DEFAULT_SETTINGS, key)) throw new Error(M('未知设置项。','Unknown setting key.'));
  if (patch.automation !== undefined || patch.video !== undefined) throw new Error(M('请使用对应的自动开启或视频设置接口。','Please use the dedicated auto-enable or video-settings API.'));
  if (patch.assistanceMode !== undefined) { if (!['ambient', 'on-demand'].includes(patch.assistanceMode)) throw new Error(M('无效辅助模式。','Invalid assist mode.')); result.assistanceMode = patch.assistanceMode; }
  if (patch.lookupDisplay !== undefined) { if (!['card', 'annotation'].includes(patch.lookupDisplay)) throw new Error(M('无效查词展示方式。','Invalid lookup display mode.')); result.lookupDisplay = patch.lookupDisplay; }
  if (patch.helpLanguage !== undefined) { if (!['zh', 'en'].includes(patch.helpLanguage)) throw new Error(M('无效的帮助语言。','Invalid help language.')); result.helpLanguage = patch.helpLanguage; }
  if (patch.lookupKey !== undefined) { if (typeof patch.lookupKey !== 'string' || !/^[A-Z]$/.test(patch.lookupKey)) throw new Error(M('查词键必须是大写 A-Z 单字符。','The lookup key must be a single uppercase A-Z character.')); result.lookupKey = patch.lookupKey; }
  if (patch.readingStyle !== undefined) result.readingStyle = globalThis.RoamCatReadingStyle.validate(patch.readingStyle);
  if (patch.rememberSupport !== undefined) { if (typeof patch.rememberSupport !== 'boolean') throw new Error(M('无效记忆设置。','Invalid memory setting.')); result.rememberSupport = patch.rememberSupport; }
  if (patch.domain !== undefined) result.domain = domain(patch.domain);
  if (patch.subscriptionModel !== undefined) result.subscriptionModel = text(patch.subscriptionModel, M('订阅模型','Subscription model'), 150, false);
  if (patch.domainRules !== undefined) result.domainRules = normalizeDomainRules(patch.domainRules);
  if (patch.domainDetection !== undefined) {
    const d = patch.domainDetection;
    if (!d || !['local', 'chatgpt', 'grok', 'antigravity', 'api', 'jev'].includes(d.mode) || typeof d.useTranslationApi !== 'boolean') throw new Error(M('无效的领域识别配置。','Invalid domain-detection configuration.'));
    const api = {baseUrl: text(d.api?.baseUrl, M('识别 API 地址','Detection API URL'), 2048), apiKey: text(d.api?.apiKey ?? '', M('识别 API Key','Detection API key'), 4096, false)};
    apiServiceOrigins(customDetectionService(api));
    let jevBaseUrl = text(d.jevBaseUrl ?? 'https://router.requesty.ai/v1', M('Jev 接口地址','Jev endpoint URL'), 2048, false) || 'https://router.requesty.ai/v1';
    try { const parsedUrl = new URL(jevBaseUrl); if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error(); } catch { throw new Error(M('Jev 接口地址必须是有效的 HTTP 或 HTTPS 完整地址。','The Jev endpoint must be a full valid HTTP or HTTPS URL.')); }
    result.domainDetection = {mode: d.mode, subscriptionModel: text(d.subscriptionModel ?? '', M('识别订阅模型','Detection subscription model'), 150, CONNECTOR_KINDS.includes(d.mode)), apiModel: text(d.apiModel ?? '', M('识别 API 模型','Detection API model'), 150, d.mode === 'api'), useTranslationApi: d.useTranslationApi, api, jevModel: text(d.jevModel ?? '', M('Jev 模型','Jev model'), 150, false), jevApiKey: text(d.jevApiKey ?? '', 'Jev API Key', 4096, false), jevBaseUrl};
  }
  if (patch.providerKind !== undefined) { if (!['chatgpt', 'grok', 'antigravity', 'api'].includes(patch.providerKind)) throw new Error(M('不支持的服务类型。','Unsupported service type.')); result.providerKind = patch.providerKind; }
  if (patch.apiServices !== undefined) {
    if (!Array.isArray(patch.apiServices) || patch.apiServices.length > 20) throw new Error(M('API 服务最多保存 20 个。','At most 20 API services can be saved.'));
    const ids = new Set();
    result.apiServices = patch.apiServices.map(value => {
      const service = normalizeApiService(value);
      service.id = text(service.id, M('服务编号','Service ID'), 128); service.name = text(service.name, M('服务名称','Service name'), 60); service.baseUrl = text(service.baseUrl, M('API 地址','API URL'), 2048); service.model = text(service.model, M('模型','Model'), 150); service.apiKey = text(service.apiKey, 'API Key', 4096, false);
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(service.id) || ids.has(service.id)) throw new Error(M('API 服务编号必须安全且唯一。','The API service ID must be safe and unique.'));
      if (!getApiProvider(service.providerId).keyOptional && !service.apiKey) throw new Error(M('API Key 不能为空。','The API key must not be empty.'));
      apiServiceOrigins(service); ids.add(service.id); return service;
    });
  }
  if (patch.activeApiServiceId !== undefined) result.activeApiServiceId = text(patch.activeApiServiceId, M('当前 API 服务','Active API service'), 128, false);
  const services = result.apiServices ?? currentSettings.apiServices, active = result.activeApiServiceId ?? currentSettings.activeApiServiceId;
  if (result.apiServices && currentSettings.activeApiServiceId && !result.apiServices.some(service => service.id === currentSettings.activeApiServiceId) && patch.activeApiServiceId === undefined) throw new Error(M('移除当前 API 服务时必须同时选择替代服务。','Removing the active API service requires choosing a replacement.'));
  if (services.length === 0) { if (active) throw new Error(M('没有 API 服务时当前服务必须为空。','With no API services, the active service must be empty.')); }
  else if (!active || !services.some(service => service.id === active)) throw new Error(M('当前 API 服务必须引用已保存的服务。','The active API service must reference a saved service.'));
  if (patch.apiRouting !== undefined) {
    const routing = patch.apiRouting;
    if (!routing || typeof routing !== 'object' || Array.isArray(routing)) throw new Error(M('无效的任务路由配置。','Invalid task routing configuration.'));
    const tasks = new Set(API_TASKS), normalized = {...currentSettings.apiRouting};
    for (const [task, id] of Object.entries(routing)) {
      if (!tasks.has(task)) throw new Error(M('任务路由包含未知任务。','Task routing contains an unknown task.'));
      const serviceId = text(id ?? '', M('任务路由服务','Routed service'), 128, false);
      if (serviceId && !services.some(service => service.id === serviceId)) throw new Error(M('任务路由必须引用已保存的服务。','Task routing must reference a saved service.'));
      normalized[task] = serviceId;
    }
    result.apiRouting = normalized;
  }
  if (patch.customTerms !== undefined) {
    if (!Array.isArray(patch.customTerms) || patch.customTerms.length > 1000) throw new Error(M('术语表最多保存 1000 条。','At most 1000 custom terms can be saved.'));
    const seen = new Set();
    result.customTerms = patch.customTerms.map(entry => {
      const row = {term: text(entry.term, M('术语','Term'), 100), translation: text(entry.translation, M('译法','Translation'), 300), domain: domain(entry.domain)};
      if (row.domain === 'auto') throw new Error(M('个人术语需要指定领域，或选择通用阅读。','Custom terms need a specific domain, or choose General reading.'));
      const id = wordId(row.term, row.domain);
      if (seen.has(id)) throw new Error(M('同一领域不能重复添加相同术语。','The same term cannot be added twice in one domain.'));
      seen.add(id); return row;
    });
  }
  if (patch.floatingPet !== undefined) {
    const fp = patch.floatingPet;
    if (!fp || typeof fp !== 'object' || Array.isArray(fp)) throw new Error(M('无效的伴读猫设置。','Invalid companion-pet settings.'));
    if (fp.enabled !== undefined && typeof fp.enabled !== 'boolean') throw new Error(M('无效的伴读猫开关。','Invalid companion-pet toggle.'));
    const position = fp.position ?? currentSettings.floatingPet?.position ?? {};
    const right = position.right ?? 24, bottom = position.bottom ?? 84;
    for (const value of [right, bottom]) if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10000) throw new Error(M('伴读猫位置无效。','Invalid companion-pet position.'));
    const themeMode = ['auto', 'dark', 'light'].includes(fp.themeMode) ? fp.themeMode : (currentSettings.floatingPet?.themeMode || 'auto');
    if (fp.scale !== undefined && !PET_SCALE_STEPS.includes(fp.scale)) throw new Error(M('伴读猫缩放无效。','Invalid companion-pet scale.'));
    const scale = fp.scale ?? currentSettings.floatingPet?.scale ?? 1;
    if (fp.quotes !== undefined) {
      const quotes = fp.quotes;
      if (!quotes || typeof quotes !== 'object' || Array.isArray(quotes)) throw new Error(M('无效的伴读猫语录设置。','Invalid companion-pet quote settings.'));
      if (quotes.enabled !== undefined && typeof quotes.enabled !== 'boolean') throw new Error(M('无效的伴读猫语录开关。','Invalid companion-pet quote toggle.'));
      if (quotes.intervalMin !== undefined && ![15, 30, 60].includes(quotes.intervalMin)) throw new Error(M('无效的伴读猫语录间隔。','Invalid companion-pet quote interval.'));
    }
    const currentQuotes = currentSettings.floatingPet?.quotes ?? {enabled: true, intervalMin: 15};
    const quotes = {enabled: fp.quotes?.enabled ?? currentQuotes.enabled ?? true, intervalMin: fp.quotes?.intervalMin ?? currentQuotes.intervalMin ?? 15};
    result.floatingPet = {enabled: fp.enabled ?? currentSettings.floatingPet?.enabled ?? true, position: {right: Math.round(right), bottom: Math.round(bottom)}, themeMode, scale, quotes};
  }
  if (patch.complexSentenceAssist !== undefined) { if (typeof patch.complexSentenceAssist !== 'boolean') throw new Error(M('无效的长难句高亮设置。','Invalid complex-sentence highlight setting.')); result.complexSentenceAssist = patch.complexSentenceAssist; }
  if (patch.formulaAssist !== undefined) { if (typeof patch.formulaAssist !== 'boolean') throw new Error(M('无效的公式识别设置。','Invalid formula-recognition setting.')); result.formulaAssist = patch.formulaAssist; }
  if (patch.pdfReader !== undefined) { if (typeof patch.pdfReader !== 'boolean') throw new Error(M('无效的 PDF 阅读器设置。','Invalid PDF reader setting.')); result.pdfReader = patch.pdfReader; }
  return result;
}

/**
 * 计算 STATE_PATCH 的副作用计划（自 background.js STATE_PATCH 分支提取的纯函数）：
 * 给定当前设置与已校验补丁，推导合并后的设置与四类变更信号，编排层据此决定
 * 缓存失效、权限回收、广播与自动化重算，不再内联长布尔链。
 */
export function settingsPatchEffects(beforeSettings, patch) {
  const nextSettings = {...beforeSettings, ...patch};
  const rememberChanged = patch.rememberSupport !== undefined && patch.rememberSupport !== beforeSettings.rememberSupport;
  const beforeProvider = activeApiProvider(beforeSettings), afterProvider = activeApiProvider(nextSettings);
  const providerChanged = patch.providerKind !== undefined && patch.providerKind !== beforeSettings.providerKind
    || patch.subscriptionModel !== undefined && patch.subscriptionModel !== beforeSettings.subscriptionModel
    || beforeSettings.activeApiServiceId !== nextSettings.activeApiServiceId
    || JSON.stringify(beforeProvider) !== JSON.stringify(afterProvider)
    || patch.apiRouting !== undefined && JSON.stringify({...beforeSettings.apiRouting, ...patch.apiRouting}) !== JSON.stringify(beforeSettings.apiRouting || {});
  const classificationChanged = providerChanged || patch.domainDetection !== undefined || patch.domainRules !== undefined || patch.domain !== undefined;
  const genericChanged = Object.keys(patch).some(key => !['readingStyle', 'helpLanguage', 'apiServices', 'activeApiServiceId', 'apiRouting'].includes(key)) || providerChanged;
  // 伴读猫开关切换需要重跑 reconcileAutomation：注册/注销动态脚本并对已开标签补注入。
  const petEnabledChanged = patch.floatingPet !== undefined && (patch.floatingPet.enabled !== false) !== (beforeSettings.floatingPet?.enabled !== false);
  return {nextSettings, rememberChanged, providerChanged, classificationChanged, genericChanged, petEnabledChanged};
}

/** ANALYZE 载荷：正文限长 20 万字符，领域可选。 */
export function parseAnalyze(message) {
  return {
    source: text(message?.text, M('正文','Body'), 200000, false),
    ...(message?.domain === undefined ? {} : {domain: domain(message.domain)}),
  };
}

/** HISTORY_RULE_SET 载荷：阶段与锁定开关先行校验，编号由调用方核对存在性。 */
export function parseHistoryRuleSet(message) {
  if (![null, 'hint', 'mark', 'quiet'].includes(message?.stage) || typeof message?.locked !== 'boolean') throw new Error(M('提示选择无效。','Invalid hint choice.'));
  return {wordId: text(message.wordId, M('词条编号','Entry ID'), 160), senseKey: text(message.senseKey, M('义项编号','Sense ID'), 160), stage: message.stage, locked: message.locked};
}

/** HISTORY_DELETE 载荷：记录编号。 */
export function parseHistoryRecordRef(message) {
  return {id: text(message?.id, M('记录编号','Record ID'), 160)};
}

/** HISTORY_SUMMARY_EDIT 载荷：记录编号与摘要正文。 */
export function parseHistorySummaryEdit(message) {
  return {id: text(message?.id, M('记录编号','Record ID'), 160), summary: text(message?.summary, M('摘要','Summary'), 600)};
}

/**
 * ASSIST 载荷：剥离消息 type、取出文章准备标识并规范化帮助命令。
 * 与 background.js assist() 顶部的解构完全等价：标识必须是 ≤128 字符字符串，
 * 其余字段交给 gloss.mjs 的帮助命令校验。
 */
export function parseAssistRequest(message) {
  const {type: _type, articleKey = '', ...payload} = message ?? {};
  if (typeof articleKey !== 'string' || articleKey.length > 128) throw new Error(M('文章准备标识无效。','Invalid article-prep key.'));
  return {articleKey, command: normalizeAssistanceCommand(payload)};
}

/** PASSAGE_TRANSLATE 载荷：段落翻译请求编号（与 gloss.mjs IDENTIFIER 一致）。 */
export function parsePassageRequestRef(message) {
  const requestId = message?.requestId;
  if (typeof requestId !== 'string' || !requestId.length || requestId.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(requestId)) throw new Error(M('无效的段落翻译请求编号。','Invalid passage-translation request number.'));
  return {requestId};
}

/**
 * 按需建议判定（自 background.js onDemandSuggestion 提取的纯函数）：
 * 近 27 个 UTC 日内至少 14 天有有效阅读、且期间没有求助/提示/错误记录、
 * 且尚未建议过时，才建议切换按需模式。时间参数可注入以保证可测。
 */
export function onDemandSuggestionDecision(supportUsage, shownAt, now) {
  const cutoffDate = new Date(now);
  cutoffDate.setUTCHours(0, 0, 0, 0);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 27);
  const cutoff = cutoffDate.toISOString().slice(0, 10);
  const rows = (Array.isArray(supportUsage) ? supportUsage : []).filter(row => typeof row?.day === 'string' && row.day >= cutoff);
  const days = rows.filter(row => row.eligiblePages > 0).length;
  const blocked = rows.some(row => row.helpRequests || row.hintsShown || row.errors);
  return {show: !shownAt && days >= 14 && !blocked};
}
