/**
 * @file extension/rate-window.mjs
 * 文件职责：按键计数的滑动时间窗限额——给会持续自动发请求的功能（Twitch 直播聊天翻译）设每分钟上限，
 *   防止热门频道把模型额度烧光。
 * 主要内容：createRateWindow({limit, windowMs}) 返回 take(key, now) 与 forget(key)；
 *   take 在窗口内未满时记一次并放行，满了返回最早一次过期还要等多久。
 * 模块边界：领域层纯函数，可 Node 安全 import；不触碰 chrome。计数只在内存里，
 *   Service Worker 重启后从零开始——它只是防失控的上限，计数丢了不影响正确性。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */

const M=(zh,en)=>globalThis.RoamCatI18n?.lang?.()==='en'?en:zh;

/**
 * @param {{limit:number,windowMs:number}} options 窗口内最多放行 limit 次。
 * @returns {{take:(key:unknown,now?:number)=>{ok:boolean,retryAfterMs:number},forget:(key:unknown)=>void}}
 */
export function createRateWindow({limit, windowMs}) {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isFinite(windowMs) || windowMs <= 0) throw new Error(M('无效的限额设置。','Invalid rate-limit settings.'));
  const hits = new Map();
  function take(key, now = Date.now()) {
    const recent = (hits.get(key) || []).filter(at => now - at < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return {ok: false, retryAfterMs: Math.max(1, windowMs - (now - recent[0]))};
    }
    recent.push(now);
    hits.set(key, recent);
    return {ok: true, retryAfterMs: 0};
  }
  return {take, forget: key => { hits.delete(key); }};
}
