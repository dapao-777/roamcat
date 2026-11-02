# 机器翻译接入与用途

实现状态：已随 0.8.0 发布。最后核对：2026-11-02。

设置 → 模型服务 → 机器翻译提供 **14 种机器翻译服务**。整页双语、视频字幕、直播聊天、PDF/EPUB 阅读器、选段翻译可分别选择引擎；初始均跟随大模型。查词、阅读解构、摘要与领域识别继续使用原有模型链路。

字幕和聊天优先考虑机翻来减少延迟；长网页和阅读器可用机翻节约模型额度；需要上下文、术语理解或阅读偏好时选大模型。普通机翻只接收待译原文；DeepL 的单条整页请求还会接收有限的标题、章节和相邻正文。

| 服务 | 接口、鉴权与语言方向 | 本扩展的批量和节流 |
|---|---|---|
| Chrome 本机翻译 | `Translator` API，en → zh，无密钥 | 8 条 / 20000 字符，并发 1；设置页点击准备语言包，离屏文档只使用已下载模型 |
| DeepL | `/v2/translate`，`DeepL-Auth-Key`，EN → ZH-HANS | 50 条 / 60000 字符，并发 3；Free Key 的 `:fx` 后缀选择 Free 域名；支持 XML 标记与单条上下文 |
| Google Cloud Translation | `/language/translate/v2`，`x-goog-api-key`，en → zh-CN | 100 条 / 10000 字符，并发 4；HTML 模式保护代码标记 |
| Azure AI Translator | `/translate?api-version=3.0`，Key + Region，en → zh-Hans | 100 条 / 20000 字符，并发 4；HTML 模式保护代码标记 |
| 腾讯云 TMT | `TextTranslateBatch`，TC3-HMAC-SHA256，en → zh | 32 条 / 5000 字符，并发 1，保守限制 1 QPS；旧版产品逐步退市，账号可用性以公告为准 |
| 阿里云机器翻译 | `TranslateGeneral`，RPC HMAC-SHA1，en → zh | 单条 / 5000 字符，并发 4，上限 40 QPS |
| 百度翻译开放平台 | `/api/trans/vip/translate`，APP ID + MD5，en → zh | 16 条 / 5000 字符；按 UTF-8 6000 字节限制额外拆分；标准版 1 QPS，高级版 10 QPS |
| 火山引擎 | `TranslateText`，OpenAPI HMAC-SHA256，en → zh | 16 条 / 5000 字符，并发 3，上限 10 QPS |
| 有道智云 | `/api`，v3 SHA-256，en → zh-CHS | 单条 / 5000 字符，并发 3 |
| 小牛翻译 | `/NiuTransServer/translation`，apikey，en → zh | 单条 / 5000 字符，并发 2 |
| MyMemory | `/get`，无密钥，可选联系邮箱，en → zh-CN | 单条拆到 500 UTF-8 字节，并发 1，上限 3 QPS |
| Google 网页接口 | `/translate_a/t`，无密钥，en → zh-CN | 32 条 / 5000 字符，并发 2；非公开接口，可能限流或失效 |
| 微软 Edge 网页接口 | `/translate/translatetext`，无密钥，en → zh-Hans | 25 条 / 10000 字符，并发 3；非公开接口，HTML 转义后请求 |
| DeepLX 自建 | 用户填写 `/translate` 地址，可选 Bearer Token，EN → ZH | 单条 / 5000 字符，并发 2；不内置公共中转；HTTPS，本机回环可用 HTTP |

表内数字是客户端上限，账户额度、实际 QPS 和收费以各厂商当前规则为准。云端服务并不保证免费。腾讯云的免费资源包与 QPS 调整见[公告](https://cloud.tencent.com/announce/detail/2448)，文本 API 后续退市安排见[较新的通知](https://cloud.tencent.com/announce/detail/2482)。

## 失败与取消

每次 HTTP 请求（包括读取响应体）与本机翻译各有 15 秒时限；拆包后的每次请求重新计时，限速等待不占用下一次请求的时限。后续请求失败会保留此前已完整完成的条目；同一条长文本只有半段完成时，不会当作完整译文交付。

关闭回退时，整页翻译可逐条返回限流、网络、鉴权等受控错误码；成功条目保留，厂商原始报错不进入网页或诊断。

请求失败、限流、额度不足、返回条数不符、正文无中文、行内代码的 `⟦n⟧` 标记丢失或重复时，只把失败的条目交给已连接的大模型重试。设置可关闭此回退；没有大模型时直接显示错误。成功条目保留。限流和额度不足冷却 60 秒，鉴权失败冷却 120 秒；更新机翻设置清除冷却。聊天机翻每标签页每分钟最多 30 批。

译文缓存区分场景、引擎与配置；切换配置清除旧缓存和在途会话。网页换页、停止翻译或换书后，旧结果不能写入新页面或书籍。停止无法撤回服务已经接收的文本。

## 数据边界

凭据以明文存在本机 `chrome.storage.local`，只由后台发请求；内容脚本只拿到翻译可用状态，不含机翻配置、密钥或端点。诊断不记录厂商响应正文、密钥、签名或请求内容。数据导出不包含这些凭据。请求禁用 Cookie 与重定向；DeepLX 地址不接受内嵌账号、查询参数或片段。Chrome 本机翻译的原文不离开设备，初次下载浏览器语言包需要网络与用户点击。

## 参考范围与许可

依据 [FluentRead 的服务目录](https://github.com/FluentRead/FluentRead/blob/main/src/core/config/catalog.ts)（调研时 main `bb0d4db`）和各家接口事实，按官方协议独立实现。FluentRead 使用 GPL-3.0，本项目保持 MPL-2.0，未拷贝其实现。

用户确认的接入方案为上表 14 种。免费池里的腾讯交互翻译、火山网页、Yandex、Reverso、ModernMT、Lara，以及依赖网页隐藏密钥/令牌的有道网页、金山、阿里网页、Lingvanex 暂未接入。B 站和豆包网页实际上走大模型且需要额外请求头权限；Apertium 不提供本项目需要的英译中方向；需额外下载的大型本地模型留作独立功能。

协议依据：[Chrome Translator](https://developer.chrome.com/docs/ai/translator-api)、[DeepL](https://developers.deepl.com/api-reference/translate)、[Google Cloud](https://cloud.google.com/translate/docs/reference/rest/v2/translate)、[Azure](https://learn.microsoft.com/azure/ai-services/translator/reference/v3-0-translate)、[腾讯 TC3](https://cloud.tencent.com/document/api/213/30654)、[阿里云](https://help.aliyun.com/zh/machine-translation/developer-reference/api-alimt-2018-10-12-translategeneral)、[百度](https://fanyi-api.baidu.com/doc/21)、[火山](https://docs.volcengine.com/docs/MachineTranslation/TextTranslationAPI?lang=zh)、[有道](https://ai.youdao.com/DOCSIRMA/html/trans/api/wbfy/index.html)、[小牛](https://niutrans.com/documents/contents/trans_text)、[MyMemory](https://mymemory.translated.net/doc/spec.php)、[DeepLX](https://github.com/OwO-Network/DeepLX)。Google/Edge 网页接口无公开兼容性承诺。

验证用本地假接口与签名对照，不使用用户真实密钥或额度；真实云账户的区域、配额与网络可用性需用户自己的账户复核。
