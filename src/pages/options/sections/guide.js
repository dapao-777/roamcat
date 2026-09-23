/**
 * @file src/pages/options/sections/guide.js
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

export const guideSection = html`
<section id="guide" class="settings-section guide-section" aria-labelledby="guide-heading" hidden>
  <div class="section-intro">
    <h2 id="guide-heading" class="sr-only">使用说明</h2>
    <p>从你读不顺的地方开始，不必先记住一套功能名。</p>
  </div>
  <article class="paper-card guide-start welcome-revisit-banner" style="background: linear-gradient(135deg, var(--color-amber-soft), var(--color-brand-green-soft)); border: 1px solid var(--color-brand-green-border); margin-bottom: 20px;">
    <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;">
      <div>
        <span class="guide-eyebrow" style="color: var(--color-brand-green); font-weight: 700;">新手入门与交互体验</span>
        <h3 style="margin: 4px 0 6px 0;">想要重新体验新手引导与交互沙盒？</h3>
        <p style="margin: 0; color: var(--color-text-secondary, #94a3b8); font-size: 13.5px;">包含实时查词演练沙盒、3 步快速偏好配置与核心按键速查表。</p>
      </div>
      <button type="button" class="js-open-welcome primary-action" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px; padding: 8px 18px; border-radius: var(--radius-pill); font-weight: 600; font-size: 13px; cursor: pointer;">
        <span>打开新手引导向导</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
      </button>
    </div>
  </article>
  <article class="paper-card guide-start">
    <span class="guide-eyebrow">随心阅 · 阅读指南</span>
    <h3>词义卡住，看注释。长句绕住，看解构。</h3>
    <p><strong>注释</strong>帮你理解一个词在这里是什么意思；<strong>阅读解构</strong>帮你看清一句话里谁在做什么、哪些部分是补充。两者可以配合，也可以只开需要的一个。目标是接着读原文，而不是把页面换成中文。</p>
    <p>第一次使用：先到 <a href="#service">模型服务</a> 连接 ChatGPT 订阅、Grok 订阅或 API 并测试连接，再打开英文文章，点击扩展图标，在弹窗中开启本页或打开「阅读解构」。需要的网站可在 <a href="#sites">网站规则</a> 设置自动开启。</p>
  </article>

  <article class="paper-card guide-scene" aria-labelledby="guide-annotation-heading">
    <span class="guide-eyebrow">01 · 注释</span>
    <h3 id="guide-annotation-heading">读到一个词，不确定它在这里是什么意思</h3>
    <p>比如读到下面这句，只有 <span lang="en">latency</span> 绊住了你。先看一条短释义，能读通就继续，不必翻译整个段落。</p>
    <figure class="guide-demo">
      <p class="guide-example" lang="en">The cache reduces <ruby class="guide-word">latency<rt>delay</rt></ruby>.</p>
      <figcaption>原词仍在句中，上方的短释义就是「词注」。这是固定示意，不调用模型；实际语言和样式以你的设置为准。</figcaption>
    </figure>
    <ol class="guide-list">
      <li><strong>主动查这个词：</strong>按住 <kbd data-lookup-key>D</kbd> 并单击原词。这是你当前设置的查词键；只悬停或普通单击不会求助，在输入框里打字也不会触发。</li>
      <li><strong>选适合自己的呈现：</strong>在 <a href="#assistance">阅读偏好</a> 选「解释卡片」，可以继续看语境；选「顶部释义」，意思直接放在原词上方，不弹卡片。解释语言可选中文或简明英文。</li>
      <li><strong>一条释义还不够：</strong>使用解释卡片时，可点「用中文说明」，或展开「本句翻译」查看中文句译和详细语境。简释与详情分开获取，已有结果可复用；补充或重试可能产生新请求。</li>
    </ol>
    <p>也可以让注释先来帮你：在「阅读偏好」选择<strong>「自动给少量提示」</strong>。本页辅助开启后，系统在可识别的正文中挑少量可能需要帮助的位置，不会逐词加注。滚动到新内容时可能提前请求模型；只想自己决定何时查词，就选「只在主动求助时」。</p>
    <details class="guide-note">
      <summary>有原词标记，却没有上方释义？</summary>
      <div>
        <p>标记只是提醒你留意这个表达。已确认的用法可能处在<strong>标记态</strong>：先不附释义，需要时仍可按住查词键单击。也可能是<strong>待确认</strong>：记得你查过这个表达，但还没确认它在这句里的意思，因此不会直接套用旧解释。</p>
        <p>卡片里的「旧参考义」或「本地参考义」也只是参考。若当前上下文不足，选中包含该表达的完整句子再求助。原词标记、上方词注和译文的颜色、字号，可到 <a href="#appearance">显示与解构</a> 分别调整。</p>
      </div>
    </details>
  </article>

  <article class="paper-card guide-scene guide-structure" aria-labelledby="guide-structure-heading">
    <span class="guide-eyebrow">02 · 阅读解构</span>
    <h3 id="guide-structure-heading">每个词都认识，连成一句却读不顺</h3>
    <p>这时需要的不是更多词义，而是看清句子的骨架。阅读解构用彩色下划线标出主语、谓语、宾语以及修饰部分，帮你先读主干，再把条件和补充接回来。</p>
    <figure class="guide-demo">
      <p class="guide-example" lang="en">When requests repeat, <strong>the cache reduces latency</strong>.</p>
      <figcaption>读法示意：先抓住主干，再补上条件；这里的加粗用于讲解，不是网页的实际下划线样式。</figcaption>
      <dl class="guide-definitions">
        <div><dt>先读主干：谁，在做什么？</dt><dd><span lang="en">The cache</span>（主语）→ <span lang="en">reduces</span>（谓语）→ <span lang="en">latency</span>（宾语）。先知道“缓存降低延迟”。</dd></div>
        <div><dt>再补上条件：在什么情况下？</dt><dd><span lang="en">When requests repeat</span> 是状语部分，补充“当请求重复时”。把它接回主干，就能读通整句。</dd></div>
      </dl>
    </figure>
    <ol class="guide-list">
      <li><strong>开启：</strong>打开扩展弹窗，打开「阅读解构」。页面可见、未暂停且模型服务可用时，它会分析正文并画出结构线。</li>
      <li><strong>读结构：</strong>先沿着主谓宾看意思，再看修饰部分。点击结构下划线，可打开「本句解构」查看带成分名称的层级，不必死记颜色。</li>
      <li><strong>嫌密或想看更细：</strong>到 <a href="#appearance">显示与解构</a> 的「句子结构」调整。粗粒度突出大结构，中粒度显示句子成分，细粒度最多展示两层；切换粒度、实线或虚线只改变显示，不额外调用模型。</li>
    </ol>
    <p><strong>结构线不是生词标记。</strong>颜色表示句子成分，不表示难度或熟悉度。解构和注释独立：即使词汇辅助选了「只在主动求助时」，已开启的解构仍会分析正文、产生模型用量。不需要时，在弹窗里关闭它。</p>
  </article>

  <details class="paper-card settings-disclosure guide-chapter">
    <summary>03 · 已经能顺着读了，想让提示少一点</summary>
    <div>
      <p>能读通时，不必逐个点开注释。随心阅 的提示会逐步退后；这只是减少打扰，不是一次“已经掌握”的判定。</p>
      <figure class="memory-circuit-card" aria-label="自适应渐退记忆导线示意图：提示态、标记态、暂缓态、静默态四个阶段由一条导线串联">
        <div class="circuit-header">
          <div class="circuit-header-left">
            <span class="circuit-tag">自适应渐退</span>
            <span class="circuit-title">记忆渐退导线 · 同一词条的四段退后</span>
          </div>
          <span class="circuit-meta-note">UTC 日界计次 · 动态阻尼</span>
        </div>
        <div class="circuit-rail" aria-hidden="true">
          <svg class="circuit-svg-wire" viewBox="0 0 600 20" preserveAspectRatio="none">
            <path d="M 0 10 L 600 10" stroke="currentColor" stroke-opacity="0.22" stroke-width="1.5" stroke-dasharray="3 3"></path>
            <path d="M 0 10 L 600 10" stroke="currentColor" stroke-width="1.5" stroke-dasharray="10 44" opacity="0.9" stroke-linecap="round">
              <animate attributeName="stroke-dashoffset" from="54" to="0" dur="2.2s" repeatCount="indefinite"></animate>
            </path>
          </svg>
          <span class="rail-station" style="left:12.5%;"></span>
          <span class="rail-station" style="left:37.5%;opacity:0.75;"></span>
          <span class="rail-station" style="left:62.5%;opacity:0.55;"></span>
          <span class="rail-station" style="left:87.5%;"></span>
        </div>
        <div class="circuit-track-container">
          <div class="circuit-node node-stage-1" title="初次遇到，提供完整短注脚手架">
            <div class="node-pin-row"><span class="node-pulse-dot"></span><span class="node-step-id">01 / 提示</span></div>
            <div class="node-name">提示态</div>
            <div class="node-desc">原词 + 上方微短注</div>
            <div class="node-metric-pill">依赖 100% · 遇见日 1-3</div>
          </div>
          <div class="circuit-node node-stage-2" title="累计 3 个有效遇见日，撤下释义，仅保留原词标记">
            <div class="node-pin-row"><span class="node-pulse-dot" style="opacity:0.8;"></span><span class="node-step-id">02 / 标记</span></div>
            <div class="node-name">标记态</div>
            <div class="node-desc">仅原词高亮，撤下词注</div>
            <div class="node-metric-pill">依赖 50% · 标记日 1-3</div>
          </div>
          <div class="circuit-node node-stage-3" title="再累计 3 个标记态遇见日后暂缓提示，7 天起阶梯延长">
            <div class="node-pin-row"><span class="node-pulse-dot" style="opacity:0.6;"></span><span class="node-step-id">03 / 暂缓</span></div>
            <div class="node-name">暂缓态</div>
            <div class="node-desc">梯度暂缓 7d → 14d → 28d</div>
            <div class="node-metric-pill">依赖 20% · 阶梯巩固</div>
          </div>
          <div class="circuit-node node-stage-4" title="长期稳定后不再主动显示，沉浸无干扰阅读">
            <div class="node-pin-row"><span class="node-pulse-dot"></span><span class="node-step-id">04 / 静默</span></div>
            <div class="node-name">静默态</div>
            <div class="node-desc">不主动显示，沉浸阅读</div>
            <div class="node-metric-pill">依赖 0% · 自治完成</div>
          </div>
        </div>
        <div class="circuit-loopback-row">
          <div class="loopback-trace">
            <span class="loopback-arrow">↺ 回流机制:</span>
            <span>主动求助，或超过 14 天未在真实语境遇见，自动回到 01 提示态</span>
          </div>
          <span>有效遇见 = 前台可见 ≥ 2s · 每日最多一次</span>
        </div>
      </figure>
      <dl class="guide-definitions">
        <div><dt>一个词已经认识，不想再自动看到它</dt><dd>在词注旁或解释卡片里点「我已认识」。保存后，这个词已有的标记、自动词注、手动词注和解释卡片会撤下；其他词的注释与段落译文保持原位，不重译整页。它也影响跨领域的同词与可识别词形，不只针对当前用法。误点可在 8 秒内「撤销」，以后也可到 <a href="#personalization">提示偏好 → 已认识词</a> 恢复；仍能主动查词。</dd></div>
        <div><dt>只是当前这个意思不需要提示</dt><dd>在解释卡片的「更多」中选「少提示这个用法」，只让当前用法安静下来，不把这个词的所有意思都藏起来。这个选择不因久未遇见自动解除；再次求助或恢复自适应可让帮助回来。</dd></div>
        <div><dt>想完全由自己决定何时求助</dt><dd>在 <a href="#assistance">阅读偏好</a> 选「只在主动求助时」，停止自动词汇扫描、解释预备和遇见计数，保留按键查词、选段翻译。若还开着阅读解构，需要另外关闭；阅读记录也有独立授权。</dd></div>
      </dl>
      <details class="guide-note">
        <summary>没手动调整，为什么同一个词的提示也会变少？</summary>
        <div>
          <p>开启「记住求助词与支持偏好」且记录可用时，同一词条、领域和用法会从<strong>带短注的提示态</strong>，退到<strong>只留原词标记的标记态</strong>，再到<strong>不主动显示的静默态</strong>。不是按一个词在页面上出现了几次来隐藏。</p>
          <ol class="guide-list">
            <li>默认累计 3 个有效遇见日后只留标记；再累计 3 个标记态遇见日后，暂缓提示 7 天。</li>
            <li>暂缓结束通常回到标记态。期间至少有 2 个有效遇见日，下一轮可延长到 14 天，再到 28 天；放着不读不会升级。</li>
            <li>成功求助并保存后，该用法回到提示起点；超过 14 天没有有效遇见，也会重新给提示。</li>
          </ol>
          <p>“有效遇见”要求已确认用法在前台连续可见至少 2 秒且记录成功；同一用法按 UTC 日界每天最多一次，主动求助过的同一页面不计独立遇见。关闭记忆或记录不可用时，不依赖个人词档案推进渐退。</p>
          <p>以上是默认规则，不覆盖「少提示这个用法」或已锁定的手动状态。阅读记录里的锁定选择不会因再次求助自动解除；启用的个性化策略也可能调整提示深度，可在 <a href="#personalization">提示偏好</a> 查看。</p>
        </div>
      </details>
    </div>
  </details>

  <details class="paper-card settings-disclosure guide-chapter">
    <summary>04 · 还是读不通，或者现在只想先知道大意</summary>
    <div>
      <p>不用勉强自己只看英文。先求助眼前这一句或这一段，读通后再接着读。</p>
      <ol class="guide-list">
        <li><strong>一句或一段：</strong>选中需要理解的正文，再点击出现的翻译操作。点击后才发送选段，译文与英文一起保留。</li>
        <li data-video-feature hidden><strong>视频字幕：</strong>播放、展开字幕和滚动本身不调用模型，主动请求翻译才调用。字幕里的生词也可以单独求助。</li>
        <li><strong>本页都吃力：</strong>在扩展弹窗的「本页双语翻译」区域点「翻译本页」即开始。英文会保留，只处理读到附近的正文；可以停止、继续、重试失败段落或「返回英文」。停止不能撤回已发送且可能计费的请求。</li>
      </ol>
      <p>如果你等的是自动词注，却一直没出现：先确认本页已开启、服务已连接。正文无法可靠识别、词已设为认识或提示策略较安静，也可能不显示。导航、输入区、代码等不会当作普通正文；没有标注不代表整页已分析，更不代表你已经认识所有词。请求失败时到 <a href="#diagnostics">运行诊断</a> 查看。</p>
    </div>
  </details>

  <details class="paper-card settings-disclosure guide-chapter">
    <summary>05 · 准备读工作资料，先确认哪些内容会发送和保存</summary>
    <div>
      <p><strong>本地优先，不等于完全离线。</strong>注释、解构和翻译的模型请求会发送给你选择的 ChatGPT 订阅、Grok 订阅或 API。普通辅助可能包含目标词句、标题、章节与上下文；自动预备的文章上下文最多 12,000 字符，短文章可能整体包含在内。敏感页面不要自动开启，也不要把不允许外发的内容提交求助。</p>
      <ul class="guide-list">
        <li><strong>只想记住查过什么：</strong>「记住求助词与支持偏好」默认开启，在本机保存词条、简短释义和支持偏好，不保存原句、标题或来源网址。关闭后不再读取或更新，已有词档案不会自动删除。预备解释与有限上下文另放在当前浏览器会话缓存中。</li>
        <li><strong>想回看读过的内容：</strong>阅读记录需要单独开启并添加允许的网站，可保存查询、原句与来源等信息；关闭采集不等于删除历史，无痕页面不采集。</li>
        <li><strong>想让系统总结或调整提示：</strong>摘要与个性化需要独立授权，不随词档案开关开启。远程领域识别也需另选，默认在本地识别领域。</li>
      </ul>
      <p>先在 <a href="#sites">网站规则</a> 限定自动开启范围，单站点规则优先于「全部网站」，本页暂停时不自动运行。导出或清理已有数据，到 <a href="#privacy">数据与隐私</a>。</p>
    </div>
  </details>
</section>
`;
