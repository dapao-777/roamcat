# 参与贡献

感谢你对 RoamCat 的兴趣。这是一个预发布项目，模块边界和安全约束都比较严格——提交前请先花十分钟了解下面的约定。

## 环境准备

- Node.js **20.11+**（Node 24 已验证）。
- Chrome 或 Edge（`npm run build` 后在 `chrome://extensions` 开发者模式加载 `dist/extension/`）。
- 仅运行单元测试和静态检查不需要浏览器。

```sh
git clone https://github.com/dapao-777/roamcat.git
cd roamcat
npm ci
npm run build         # Vite 构建 → dist/extension（dev 注入固定 key）
npm run verify        # 模块图静态门禁（11 条规则）
npm test              # 单元测试（node --test）
npm run verify:build  # 构建产物门禁（改构建链后必跑）
```

## 必须遵守的硬约束

CI 会强制以下检查，本地先跑一遍能省一轮返工：

1. **`npm run verify`** — `tools/verify-module-graph.cjs` 的模块图门禁：
   - 每个手写源文件必须以 `/** @file … */` 文件头开头（职责/主要内容/模块边界三段式）。
   - 分层方向：协议层 → 领域层 → 应用层 → 页面层，不允许反向依赖、不允许循环。
   - 连接器闭包（`connector/`）不得引用 chrome API。
   - manifest 声明的资源必须存在；content script 按 `CONTENT_SCRIPT_ORDER` 顺序加载。
2. **`npm test`** — `tools/unit/**/*.test.mjs`，纯 Node 单测。
3. **消息协议单一事实源**：新增消息类型必须先在 `extension/message-protocol.js` 的 `MESSAGE_TYPES` 登记并写校验器，background 注册表必须与之一一对应。
4. **信任边界**：`sender.id !== chrome.runtime.id` 的消息一律拒绝；网页可见类型仅限 `CONTENT_ALLOWED_TYPES` 子集。修改路由/校验逻辑必须附带对应单测。

## 提交规范

- 提交信息用中文或英文均可，说明**为什么**改，不只是改了什么。
- 不要在提交信息、PR、代码注释中加入 AI 工具署名或 trailer。
- 改动涉及隐私/权限/消息路由时，同步更新 `SPEC.md`、`PRIVACY.md`、`CHROMEWEBSTORE.md` 中的对应声明。

## 报告问题

- Bug：用 Issue 模板的「缺陷报告」，附上 `chrome://extensions` 的扩展版本和设置页「数据与隐私 → 导出诊断」的脱敏 JSON。
- 安全漏洞：**不要**开公开 Issue，见 [SECURITY.md](SECURITY.md)。

## 许可证

提交的代码默认按仓库根目录的 [MPL-2.0](LICENSE) 授权。第三方/生成文件另有声明，见 `roamcat-0.0.1/NOTICE.txt`。
