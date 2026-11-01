/**
 * @file tools/lib/site-walls.mjs
 * 文件职责：真站复核（npm run verify:sites -- --live）识别「墙」页面的单一事实源——人机验证页、限流页、登录页。
 * 主要内容：BLOCKED_RE（中英文）与 isBlockedPage({title, sample, url})。命中时门禁记 SKIP 而不是 FAIL：墙不是站点档案的问题。
 *   浏览器按系统语言显示验证页：中文系统上 Cloudflare 的「Just a moment...」是「请稍候…／正在进行安全验证」，只认英文会把它们记成失败。
 * 模块边界：纯函数，无浏览器与文件依赖；单测 tools/unit/site-walls.test.mjs 用实际抓到的墙页文案固化。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export const BLOCKED_RE = new RegExp([
  // Cloudflare 等人机验证、验证码、拒绝访问
  'just a moment', 'verify you are (a )?human', 'are you a (human|robot)', 'captcha', 'access denied', 'unusual traffic',
  // Hacker News 限流页：Sorry, we're not able to serve your requests this quickly.
  'not able to serve your requests this quickly',
  // 登录墙
  'login\\/\\?reason',
  // 中文系统上的验证页文案
  '请稍候', '正在进行安全验证', '(验证|确认)您是真人', '访问被拒绝',
].join('|'), 'i');

/** 标题、正文开头或最终地址命中任一墙特征就算被墙挡住。 */
export function isBlockedPage({title = '', sample = '', url = ''} = {}) {
  return BLOCKED_RE.test(title) || BLOCKED_RE.test(sample) || BLOCKED_RE.test(url);
}
