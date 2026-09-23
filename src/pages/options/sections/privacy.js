/**
 * @file src/pages/options/sections/privacy.js
 * 文件职责：设置页静态分区模板——由 build/split-options.mjs 从
 *   extension/ui/options.html 机械切片生成；id/控件契约与原页完全一致。
 * 主要内容：无绑定静态模板（动态内容由 options-controller.js 命令式填充），
 *   分区可见性由 options-app 统一驱动。
 * 模块边界：纯展示模板。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {html} from 'lit';

export const privacySection = html`
<section id="privacy" class="settings-section data-section" aria-labelledby="privacy-heading" hidden="">
      <div class="section-intro"><h2 id="privacy-heading" class="sr-only">数据与隐私</h2><p>个人词档案只保存在本机，不含原句、标题或来源网址。预备解释与有限上下文只保留到本次浏览器会话结束。</p></div>
      <p id="data-problem" class="notice error" role="alert" hidden=""></p>
      <div class="paper-card compact-settings-card form-stack">
        <div class="adaptive-setting"><div><b>记住求助词与支持偏好</b><p>在本机保存求助词、简短释义和支持偏好。关闭后不读取或更新，旧档案仍保留。</p></div><label class="switch"><input id="remember-support" type="checkbox"><span aria-hidden="true"></span><span class="sr-only">记住求助词与支持偏好</span></label></div>
        <div class="data-actions"><button id="export-data" class="secondary-button" type="button">导出词档案</button></div><span id="data-result" class="inline-message" aria-live="polite"></span>
      </div>
      <div class="paper-card compact-settings-card history-data-actions"><div><b>阅读与提示数据</b><p class="field-help">查询记录、统计、摘要和个性化版本可单独导出或清理。关闭采集不会删除已有内容。</p></div><div class="data-actions"><button id="history-export" type="button">导出完整记录</button><button id="history-clear" class="danger-button" type="button">清空阅读与个性化数据</button><span id="history-action-result" class="inline-message" aria-live="polite"></span></div><p class="field-help">清空后保留服务配置、站点权限和采集开关；个人词档案仍由上方按钮清理。</p></div>
      <details class="paper-card settings-disclosure"><summary>扩展权限与卸载</summary><div><p class="field-help">在 Chrome 扩展管理页检查权限、停用或卸载。清理数据不会更改账户连接和网站授权。</p><button id="open-extension-manager" class="secondary-button" type="button">打开扩展管理页</button></div></details>
    <details class="paper-card settings-disclosure"><summary>清空全部阅读数据</summary><div><p class="field-help">删除词档案、使用统计、旧版归档，以及阅读记录、摘要和个性化数据。服务配置、网站权限与采集开关保持不变，删除后无法恢复。</p><button id="clear-memory" class="danger-button" type="button">清空全部阅读数据</button></div></details></section>
`;
