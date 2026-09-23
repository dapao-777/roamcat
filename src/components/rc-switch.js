/**
 * @file src/components/rc-switch.js
 * 文件职责：共享开关组件——封装 <label class="switch"> 三件套（input/轨道/sr-only），
 *   供扩展页复用；checked/disabled 为响应式属性，change 事件以宿主为目标重发。
 * 主要内容：light DOM 渲染（样式由页面层 .switch 规则提供，保证 document.querySelector
 *   直达 input 的测试钩子与 ui.css 既有视觉不变）；describedby 透传 aria-describedby。
 * 模块边界：展示组件，不接触 chrome API。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {LitElement, html} from 'lit';

export class RcSwitch extends LitElement {
  static properties = {
    checked: {type: Boolean},
    disabled: {type: Boolean},
    label: {type: String},
    describedby: {type: String, attribute: 'describedby'},
  };

  createRenderRoot() { return this; }

  render() {
    return html`<label class="switch"><input type="checkbox" .checked=${this.checked}
      ?disabled=${this.disabled}
      aria-describedby=${this.describedby || null}
      @change=${this.#onChange}><span aria-hidden="true"></span><span class="sr-only">${this.label || ''}</span></label>`;
  }

  #onChange(event) {
    this.checked = event.target.checked;
    this.dispatchEvent(new Event('change', {bubbles: true, composed: true}));
  }
}

customElements.define('rc-switch', RcSwitch);
