/**
 * @file extension/ui/theme-init.js
 * 文件职责：主题防闪早期脚本——外链文件形式满足CSP，早于渲染同步主题。
 * 主要内容：读本地主题偏好；无网络。
 * 模块边界：扩展页首载脚本，禁内联。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
// Synchronize theme with options as early as possible to prevent flash.
// External file (not inline) to comply with the extension_pages CSP
// (script-src 'self' 'wasm-unsafe-eval'), which forbids inline scripts.
(function () {
  try {
    var savedTheme = localStorage.getItem('roamcat_ui_theme') || 'auto';
    if (savedTheme === 'auto') {
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  } catch (e) { /* keep default theme on storage/matchMedia failure */ }
})();
