/**
 * @file extension/domain-routing.js
 * 文件职责：领域路由纯函数——手动固定/站点规则/全局固定的优先级裁决与规则归一化。
 * 主要内容：ROUTE_VERSION/normalizeDomainRules/resolveRuleDomain。
 * 模块边界：领域层，可单测；被message-protocol与background引用。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {DOMAINS} from './shared.js';

export const ROUTE_VERSION = 1;
// Only narrowly scoped professional sites/paths; user-generated-content hosts are not whole-site rules.
const BUILTIN_RULES = [
  ['www.postgresql.org','/docs','data'], ['postgresql.org','/docs','data'],
  ['dev.mysql.com','/doc','data'], ['kafka.apache.org','/documentation','data'],
  ['nightlies.apache.org','/flink','data'], ['spark.apache.org','/docs','data'],
  ['docs.python.org','/','tech'], ['developer.mozilla.org','/en-US/docs','tech'],
  ['docs.github.com','/','tech'], ['developer.apple.com','/documentation','tech'],
  ['www.law.cornell.edu','/wex','legal'], ['www.law.cornell.edu','/uscode','legal'],
  ['www.law.cornell.edu','/cfr','legal'], ['pubmed.ncbi.nlm.nih.gov','/','medical'],
  ['www.ncbi.nlm.nih.gov','/books','medical'], ['help.figma.com','/','design'],
  ['www.investopedia.com','/terms','finance'], ['www.sec.gov','/Archives/edgar','finance'],
].map(([host,pathPrefix,domain]) => ({host,pathPrefix,domain,includeSubdomains:false}));

export function normalizeDomainRules(rules) {
  if (!Array.isArray(rules) || rules.length > 200) throw new Error('网站规则最多保存 200 条。');
  const keys = new Set();
  return rules.map(rule => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error('无效的网站规则。');
    if (!Object.hasOwn(DOMAINS,rule.domain) || rule.domain === 'auto') throw new Error('网站规则需要指定领域，或明确选择通用阅读。');
    if (typeof rule.host !== 'string' || rule.host.length > 253 || !rule.host.trim() || /[\s/@?#]/.test(rule.host.trim())) throw new Error('请输入域名，不包含协议、端口或路径。');
    let parsed;
    try { parsed = new URL(`https://${rule.host.trim()}`); } catch { throw new Error('网站域名无效。'); }
    const host = parsed.hostname.toLowerCase().replace(/\.$/,'');
    if (parsed.port || !host || host.includes('*') || parsed.username || parsed.password) throw new Error('网站域名不能包含端口或通配符；子域名请使用开关。');
    const prefix = rule.pathPrefix ?? '/';
    if (typeof prefix !== 'string' || prefix.length > 500 || !prefix.startsWith('/') || prefix.startsWith('//') || /[?#\s]/.test(prefix)) throw new Error('路径应以 / 开头，不包含查询参数或片段。');
    const pathPrefix = new URL(prefix,'https://rules.invalid').pathname.replace(/\/+$/,'') || '/';
    if (rule.includeSubdomains !== undefined && typeof rule.includeSubdomains !== 'boolean') throw new Error('子域名选项必须为开关。');
    const includeSubdomains = rule.includeSubdomains === true;
    const key = JSON.stringify([host,pathPrefix,includeSubdomains]);
    if (keys.has(key)) throw new Error('相同域名、路径和子域名范围不能重复添加规则。');
    keys.add(key);
    return {host,pathPrefix,includeSubdomains,domain:rule.domain};
  });
}
function matchRule(url,rules) {
  if (!url || !['http:','https:'].includes(url.protocol)) return null;
  const hostname = url.hostname.toLowerCase().replace(/\.$/,'');
  let best = null;
  for (const rule of rules) {
    const exact = hostname === rule.host;
    if (!exact && !(rule.includeSubdomains && hostname.endsWith(`.${rule.host}`))) continue;
    const prefix = rule.pathPrefix;
    if (prefix !== '/' && url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) continue;
    const rank = [prefix.length,rule.host.length,Number(!rule.includeSubdomains)];
    if (!best || rank[0] > best.rank[0] || (rank[0] === best.rank[0] && (rank[1] > best.rank[1] || (rank[1] === best.rank[1] && rank[2] > best.rank[2])))) best = {rule,rank};
  }
  return best?.rule || null;
}
export function resolveRuleDomain(url,settings,pageDomain = 'auto') {
  if (pageDomain !== 'auto' && Object.hasOwn(DOMAINS,pageDomain)) return {domain:pageDomain,source:'manual'};
  const personal = matchRule(url,settings.domainRules || []);
  if (personal) return {domain:personal.domain,source:'site-user'};
  if (settings.domain !== 'auto' && Object.hasOwn(DOMAINS,settings.domain)) return {domain:settings.domain,source:'global'};
  const builtin = matchRule(url,BUILTIN_RULES);
  return builtin ? {domain:builtin.domain,source:'site-built-in'} : null;
}
