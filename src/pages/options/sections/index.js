/**
 * @file src/pages/options/sections/index.js
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
export {assistanceSection} from './assistance.js';
export {appearanceSection} from './appearance.js';
export {sitesSection} from './sites.js';
export {advancedSection} from './advanced.js';
export {termsSection} from './terms.js';
export {serviceSection} from './service.js';
export {privacySection} from './privacy.js';
export {historySection} from './history.js';
export {personalizationSection} from './personalization.js';
export {diagnosticsSection} from './diagnostics.js';
export {guideSection} from './guide.js';
