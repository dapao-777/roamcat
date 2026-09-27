/**
 * @file src/i18n-runtime.js
 * 文件职责：Lit/ESM 页面侧的多语言查词包装——薄封装 globalThis.RoamCatI18n
 *   （extension/i18n.js 经典脚本，先于模块加载），供模板字符串内直接调用。
 * 主要内容：t() 查词（缺运行时时回退 key）、i18n() 访问器、data-i18n 静态回填。
 * 模块边界：不持有字典与偏好状态，全部委托 RoamCatI18n。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
export const i18n = () => globalThis.RoamCatI18n;
export const t = (key, vars) => globalThis.RoamCatI18n?.t(key, vars) ?? key;
