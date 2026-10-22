/**
 * @file extension/activation.js
 * 文件职责：自动开启策略与权限事实源——站点规则匹配、SPA导航检测、动态content-script注册与视频/自动化纯函数校验。
 * 主要内容：AUTO_SCRIPT_ID/ALL_HOSTS/pageOrigin/sitePattern/validateAutomation/validateVideo/registrationMatches；registrationMatches是权限与注册的唯一事实源。
 * 模块边界：领域层纯函数，可单测；禁浏览器依赖（R5）；被background.js与auto-start.js引用。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */

const M=(zh,en)=>globalThis.RoamCatI18n?.lang?.()==='en'?en:zh;
export const AUTO_SCRIPT_ID = 'ss-auto-start';
// 伴读猫改按需注入：仅在 floatingPet.enabled 时经 chrome.scripting 动态注册，
// 未启用伴读猫的用户不再为每个网页付出 3884 行脚本的解析成本。
export const PET_SCRIPT_ID = 'ss-floating-pet';
export const CAPTION_SCRIPT_ID = 'ss-youtube-captions';
export const ALL_HOSTS = ['http://*/*','https://*/*'];
export const VIDEO_HOSTS = ['https://www.youtube.com/*','https://m.youtube.com/*'];
// 播放器双语字幕：默认关闭，用户点「双语」后才发送当前字幕文本。
export const VIDEO_SUPPORT_ENABLED = true;

/** YouTube timedtext 地址：只接受 www.youtube.com 的字幕接口，并固定要 json3。 */
export function youtubeTimedtextUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error(M('字幕地址无效。','Invalid caption address.')); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hostname !== 'www.youtube.com' || url.pathname !== '/api/timedtext') throw new Error(M('字幕地址无效。','Invalid caption address.'));
  url.searchParams.set('fmt', 'json3');
  url.hash = '';
  return url.href;
}

export function pageOrigin(value) {
  try {
    const url = value instanceof URL ? value : new URL(value);
    return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url.origin : null;
  } catch { return null; }
}

export function sitePattern(origin) {
  const normalized = pageOrigin(origin);
  if (!normalized || normalized !== origin) throw new Error(M('站点必须是完整的 HTTP 或 HTTPS origin。','The site must be a complete HTTP or HTTPS origin.'));
  return `${normalized}/*`;
}

export function validateAutomation(value, base) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(M('无效的自动开启设置。','Invalid auto-enable settings.'));
  const allowed = new Set(['allSites','sentenceGroupsAllSites','sites','videoSites']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(M('未知的自动开启设置。','Unknown auto-enable setting.'));
  const result = {...base,sentenceGroupsAllSites:base?.sentenceGroupsAllSites === true};
  if (value.allSites !== undefined) {
    if (typeof value.allSites !== 'boolean') throw new Error(M('无效的全部网站设置。','Invalid all-sites setting.'));
    result.allSites = value.allSites;
  }
  if (value.videoSites !== undefined) {
    if (typeof value.videoSites !== 'boolean') throw new Error(M('无效的视频网站设置。','Invalid video-sites setting.'));
    result.videoSites = value.videoSites;
  }
  if (value.sentenceGroupsAllSites !== undefined) {
    if (typeof value.sentenceGroupsAllSites !== 'boolean') throw new Error(M('无效的全部网站阅读解构设置。','Invalid all-sites deconstruction setting.'));
    result.sentenceGroupsAllSites = value.sentenceGroupsAllSites;
  }
  if (value.sites !== undefined) {
    if (!Array.isArray(value.sites) || value.sites.length > 500) throw new Error(M('无效的站点规则。','Invalid site rule.'));
    const seen = new Set();
    result.sites = value.sites.map(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).some(key => !['origin','enabled'].includes(key))) throw new Error(M('无效的站点规则。','Invalid site rule.'));
      const origin = pageOrigin(entry.origin);
      if (!origin || origin !== entry.origin || typeof entry.enabled !== 'boolean' || seen.has(origin)) throw new Error(M('站点规则必须使用唯一且完整的 HTTP 或 HTTPS origin。','Site rules must use unique, complete HTTP or HTTPS origins.'));
      seen.add(origin);
      return {origin,enabled:entry.enabled};
    });
  }
  return result;
}

export function validateVideo(value, base) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(M('无效的视频设置。','Invalid video settings.'));
  const allowed = new Set(['fontSize','theme','bilingual','display','translationFirst','translationColor','blur','offset','karaoke']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(M('未知的视频设置。','Unknown video setting.'));
  const result = {...base};
  if (value.fontSize !== undefined) {
    if (![16,20,24,28].includes(value.fontSize)) throw new Error(M('无效的字幕字号。','Invalid caption font size.'));
    result.fontSize = value.fontSize;
  }
  if (value.theme !== undefined) {
    if (!['auto','light','dark'].includes(value.theme)) throw new Error(M('无效的字幕主题。','Invalid caption theme.'));
    result.theme = value.theme;
  }
  if (value.bilingual !== undefined) {
    if (typeof value.bilingual !== 'boolean') throw new Error(M('无效的双语字幕设置。','Invalid bilingual caption setting.'));
    result.bilingual = value.bilingual;
  }
  // 字幕外观：显示方式、译文在上还是在下、译文颜色、模糊译文（悬停显示），以及拖动后的位置
  // （距画面底部的百分比，-1 表示自动避开控制栏）。
  if (value.display !== undefined) {
    if (!['bilingual','original','translation'].includes(value.display)) throw new Error(M('无效的字幕显示方式。','Invalid caption display mode.'));
    result.display = value.display;
  }
  for (const key of ['translationFirst','blur','karaoke']) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== 'boolean') throw new Error(M('无效的字幕设置。','Invalid caption setting.'));
    result[key] = value[key];
  }
  if (value.translationColor !== undefined) {
    if (!['white','yellow','cyan'].includes(value.translationColor)) throw new Error(M('无效的译文颜色。','Invalid translation color.'));
    result.translationColor = value.translationColor;
  }
  if (value.offset !== undefined) {
    if (!Number.isInteger(value.offset) || value.offset < -1 || value.offset > 80) throw new Error(M('无效的字幕位置。','Invalid caption position.'));
    result.offset = value.offset;
  }
  return result;
}

export function resolveAutomation(automation,activationUrl,paused = false) {
  const origin = pageOrigin(activationUrl);
  const site = origin ? automation.sites.find(entry => entry.origin === origin) : undefined;
  const siteRule = site ? site.enabled : null;
  const effective = Boolean(origin && !paused && (site ? site.enabled : automation.allSites));
  const sentenceGroupsEffective = Boolean(origin && !paused && automation.sentenceGroupsAllSites && siteRule !== false);
  const hostname = origin ? new URL(origin).hostname : '';
  const videoAvailable = Boolean(VIDEO_SUPPORT_ENABLED && !paused && automation.videoSites && ['www.youtube.com','m.youtube.com'].includes(hostname));
  return {origin,siteRule,effective,sentenceGroupsEffective,paused:Boolean(paused),videoAvailable};
}

export function registrationMatches(automation) {
  const matches = new Set();
  if (automation.allSites || automation.sentenceGroupsAllSites) ALL_HOSTS.forEach(pattern => matches.add(pattern));
  for (const site of automation.sites) if (site.enabled) matches.add(sitePattern(site.origin));
  if (VIDEO_SUPPORT_ENABLED && automation.videoSites) VIDEO_HOSTS.forEach(pattern => matches.add(pattern));
  return [...matches].sort();
}

export function requiredPermissionOrigins(automation) {
  return registrationMatches(automation);
}
