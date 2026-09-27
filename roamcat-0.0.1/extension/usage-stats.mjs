/**
 * @file extension/usage-stats.mjs
 * 文件职责：模型用量统计——把每次模型调用聚合成按日/按服务×模型的本地计数，
 *   供设置页「用量统计」卡片展示；只存计数与模型标识，不存正文、密钥或网址。
 * 主要内容：USAGE_STATS_KEY 存储键与空表 factory；recordUsageEvent 记一次调用；
 *   normalizeUsageStats 清洗不受信存储；summarizeUsage 汇总今日/近7日/近30日/累计与明细。
 * 模块边界：领域层纯函数，可 Node 安全 import；不触碰 chrome/网络；写入由
 *   background.js 的 usageStatsWrites 串行化，本模块不产生副作用。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */

export const USAGE_STATS_KEY = 'modelUsageStats';
export const USAGE_STATS_VERSION = 1;
// 按日明细保留约两个月；服务×模型组合有限淘汰，防止无限增长撑爆 storage.local。
export const USAGE_DAY_LIMIT = 62;
export const USAGE_MODEL_LIMIT = 60;
const COUNTERS = ['requests', 'failures', 'inputTokens', 'outputTokens', 'charsIn', 'charsOut', 'ms'];
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SOURCES = new Set(['api', 'chatgpt', 'grok', 'antigravity']);

function count(value) { return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER) : 0; }
function text(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function blankCounters() { return Object.fromEntries(COUNTERS.map(key => [key, 0])); }

/** 本地时区的 YYYY-MM-DD——「今日用量」以用户时钟为准（与 supportUsage 的 UTC 日不同语义）。 */
export function usageDayKey(at) {
  const date = new Date(Number.isFinite(at) ? at : Date.now());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function normalizeRow(value) {
  const row = blankCounters();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of COUNTERS) row[key] = count(value[key]);
  }
  return row;
}

/** 清洗 chrome.storage 中不受信的 modelUsageStats，返回规范结构（未知键一律丢弃）。 */
export function normalizeUsageStats(value) {
  const stats = {version: USAGE_STATS_VERSION, total: blankCounters(), days: {}, models: {}};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return stats;
  stats.total = normalizeRow(value.total);
  if (value.days && typeof value.days === 'object' && !Array.isArray(value.days)) {
    for (const [day, row] of Object.entries(value.days)) {
      if (DAY_PATTERN.test(day)) stats.days[day] = normalizeRow(row);
    }
  }
  if (value.models && typeof value.models === 'object' && !Array.isArray(value.models)) {
    for (const [key, entry] of Object.entries(value.models)) {
      if (typeof key !== 'string' || !key.length || key.length > 400 || !entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const model = text(entry.model, 150);
      if (!model) continue;
      stats.models[key] = {
        ...normalizeRow(entry),
        source: SOURCES.has(entry.source) ? entry.source : 'api',
        provider: text(entry.provider, 60),
        service: text(entry.service, 60),
        model,
        lastAt: count(entry.lastAt),
      };
    }
  }
  return stats;
}

function addTo(row, event) {
  row.requests += 1;
  if (!event.ok) row.failures += 1;
  row.inputTokens += count(event.inputTokens);
  row.outputTokens += count(event.outputTokens);
  row.charsIn += count(event.charsIn);
  row.charsOut += count(event.charsOut);
  row.ms += count(event.ms);
}

function pruneUsage(stats) {
  const days = Object.keys(stats.days).sort();
  for (const day of days.slice(0, Math.max(0, days.length - USAGE_DAY_LIMIT))) delete stats.days[day];
  const models = Object.entries(stats.models);
  if (models.length <= USAGE_MODEL_LIMIT) return;
  // 淘汰最久未使用的条目；并发写入经 background 串行化，淘汰结果随后续调用自然收敛。
  models.sort((a, b) => (a[1].lastAt || 0) - (b[1].lastAt || 0));
  for (const [key] of models.slice(0, models.length - USAGE_MODEL_LIMIT)) delete stats.models[key];
}

/**
 * 记一次模型调用。event = {at, source, provider, serviceId, service, model, ok, ms,
 * charsIn, charsOut, inputTokens, outputTokens}；token 缺省（服务商未上报）时记 0，
 * 展示层用 charsIn/charsOut 做 ≈ 估算。返回可直接写回 storage 的新对象。
 */
export function recordUsageEvent(stored, event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return normalizeUsageStats(stored);
  const model = text(event.model, 150);
  if (!model) return normalizeUsageStats(stored);
  const stats = normalizeUsageStats(stored);
  const at = Number.isFinite(event.at) ? event.at : Date.now();
  addTo(stats.total, event);
  const day = usageDayKey(at);
  const dayRow = stats.days[day] ??= blankCounters();
  addTo(dayRow, event);
  const serviceId = text(event.serviceId, 128);
  const key = `${SOURCES.has(event.source) ? event.source : 'api'}|${serviceId}|${model}`;
  const row = stats.models[key] ??= {
    ...blankCounters(), source: SOURCES.has(event.source) ? event.source : 'api',
    provider: '', service: '', model, lastAt: 0,
  };
  addTo(row, event);
  row.provider = text(event.provider, 60) || row.provider;
  row.service = text(event.service, 60) || row.service;
  row.lastAt = at;
  pruneUsage(stats);
  return stats;
}

function sumDays(days, fromKey, toKey) {
  const total = blankCounters();
  for (const [day, row] of Object.entries(days)) {
    if (day < fromKey || day > toKey) continue;
    for (const key of COUNTERS) total[key] += row[key];
  }
  return total;
}

/**
 * 汇总展示数据：total 累计、today/week/month 按日聚合、models 按请求数降序、
 * days 近 14 天明细（新→旧）。tokens=0 不代表未消耗——服务商可能未上报，
 * 界面据此决定是否退回字符估算。
 */
export function summarizeUsage(stored, now = Date.now()) {
  const stats = normalizeUsageStats(stored);
  const todayKey = usageDayKey(now);
  const weekFrom = usageDayKey(now - 6 * 86400000);
  const monthFrom = usageDayKey(now - 29 * 86400000);
  const models = Object.values(stats.models)
    .sort((a, b) => b.requests - a.requests || (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens) || (b.lastAt || 0) - (a.lastAt || 0));
  const days = Object.keys(stats.days).sort().reverse().slice(0, 14)
    .map(day => ({day, ...stats.days[day]}));
  return {
    total: stats.total,
    today: stats.days[todayKey] ? {...stats.days[todayKey]} : blankCounters(),
    week: sumDays(stats.days, weekFrom, todayKey),
    month: sumDays(stats.days, monthFrom, todayKey),
    models,
    days,
  };
}
