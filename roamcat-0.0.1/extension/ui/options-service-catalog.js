/**
 * @file options-service-catalog.js
 * RoamCat · 随心阅 - 模型服务目录化交互控制器
 * 参考 FluentRead Service Catalog 架构，实现左侧分组目录检索 + 右侧统一 Hero 详情卡片工作区
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */

const M=(zh,en)=>globalThis.RoamCatI18n?.lang?.()==='en'?en:zh;

export const CATALOG_CATEGORIES = [
  { id: 'subscription', get label(){return M('订阅通道','Subscription')}, get badge(){return M('免API Key','No API key')} },
  { id: 'popular', get label(){return M('主流大模型','Popular models')}, get badge(){return M('推荐','Recommended')} },
  { id: 'domestic', get label(){return M('国内精选','China picks')}, get badge(){return M('高速直连','Fast direct')} },
  { id: 'opensource', get label(){return M('开源与推理','Open & inference')}, get badge(){return M('高性价比','Cost-effective')} },
  { id: 'cloud', get label(){return M('企业云服务','Enterprise cloud')}, get badge(){return M('稳定','Stable')} },
  { id: 'custom', get label(){return M('自定义 API','Custom API')}, get badge(){return M('自定义','Custom')} },
];

export const CATALOG_TEMPLATES = [
  // 1. 订阅通道
  { id: 'chatgpt', get name(){return M('ChatGPT 订阅','ChatGPT Subscription')}, category: 'subscription', icon: 'openai', get desc(){return M('免 API Key，通过本机连接器免配置直连使用 Codex 权益','No API key — direct access to Codex benefits via the local connector')}, website: 'https://chatgpt.com', keyOptional: true },
  { id: 'grok', get name(){return M('Grok 订阅','Grok Subscription')}, category: 'subscription', icon: 'xai', get desc(){return M('免 API Key，通过 SuperGrok 或 X Premium+ 直连辅助模型','No API key — direct access via SuperGrok or X Premium+')}, website: 'https://x.ai', keyOptional: true },
  { id: 'antigravity', get name(){return M('Google 订阅','Google Subscription')}, category: 'subscription', icon: 'google', get desc(){return M('免 API Key，通过 Google AI Pro / Ultra 权益直连','No API key — direct access via Google AI Pro / Ultra benefits')}, website: 'https://gemini.google.com', keyOptional: true },

  // 2. 主流大模型
  { id: 'deepseek', name: 'DeepSeek', category: 'popular', icon: 'deepseek', get desc(){return M('深度求索大模型，超高性价比，优异的阅读理解与结构化解构','DeepSeek model — great value, strong reading comprehension and structured deconstruction')}, website: 'https://platform.deepseek.com', keyOptional: false },
  { id: 'openai', name: 'OpenAI', category: 'popular', icon: 'openai', get desc(){return M('GPT-4o / GPT-5 系列官方 API 接口','Official API for the GPT-4o / GPT-5 family')}, website: 'https://platform.openai.com/api-keys', keyOptional: false },
  { id: 'google', name: 'Google Gemini', category: 'popular', icon: 'google', get desc(){return M('Gemini 2.5 Flash / Pro 官方接口，高吞吐低延迟','Official Gemini 2.5 Flash / Pro endpoint — high throughput, low latency')}, website: 'https://aistudio.google.com/app/apikey', keyOptional: false },
  { id: 'anthropic', name: 'Anthropic Claude', category: 'popular', icon: 'anthropic', get desc(){return M('Claude 3.7 Sonnet / 3.5 Haiku 官方 API 接口','Official API for Claude 3.7 Sonnet / 3.5 Haiku')}, website: 'https://console.anthropic.com/settings/keys', keyOptional: false },
  { id: 'xai', name: 'xAI Grok API', category: 'popular', icon: 'xai', get desc(){return M('xAI 官方 Grok API 接口通道','Official xAI Grok API endpoint')}, website: 'https://console.x.ai', keyOptional: false },
  { id: 'requesty', get name(){return M('Requesty · Jev 判定','Requesty · Jev')}, category: 'popular', icon: 'custom-api', get desc(){return M('基于 Requesty 的高精度术语与领域结构化识别引擎','High-precision term & domain structured detection powered by Requesty')}, website: 'https://app.requesty.ai', keyOptional: false },

  // 3. 国内精选大模型
  { id: 'stepfun', get name(){return M('阶跃星辰 StepFun','StepFun')}, category: 'domestic', icon: 'custom-api', get desc(){return M('Step-3 系列模型，支持开放平台按量与 Step Plan 订阅通道','Step-3 models; open-platform pay-as-you-go and Step Plan subscription channels')}, website: 'https://platform.stepfun.com', keyOptional: false },
  { id: 'minimax', get name(){return M('MiniMax 名之梦','MiniMax')}, category: 'domestic', icon: 'minimax', get desc(){return M('MiniMax-M3 / abab 系列国内优质多模态语言大模型','MiniMax-M3 / abab — quality multimodal LLMs from China')}, website: 'https://platform.minimaxi.com', keyOptional: false },
  { id: 'siliconflow', get name(){return M('SiliconFlow 硅基流动','SiliconFlow')}, category: 'domestic', icon: 'siliconflow', get desc(){return M('多模型聚合分发平台，极速调度 DeepSeek、Qwen 开源全家桶','Multi-model aggregation platform with fast access to the DeepSeek / Qwen open-source family')}, website: 'https://cloud.siliconflow.cn', keyOptional: false },
  { id: 'moonshotai', name: 'Moonshot AI (Kimi)', category: 'domestic', icon: 'moonshotai', get desc(){return M('月之暗面 Kimi 超长上下文语言大模型','Moonshot Kimi ultra-long-context language model')}, website: 'https://platform.moonshot.cn', keyOptional: false },
  { id: 'alibaba', get name(){return M('阿里云百炼 (通义千问)','Alibaba Bailian (Qwen)')}, category: 'domestic', icon: 'alibaba', get desc(){return M('通义千问 Qwen3 系列模型官方兼容接口通道','Official Qwen3-compatible API endpoint')}, website: 'https://bailian.console.aliyun.com', keyOptional: false },
  { id: 'volcengine', get name(){return M('火山引擎 (豆包)','Volcano Engine (Doubao)')}, category: 'domestic', icon: 'volcengine', get desc(){return M('字节跳动豆包大模型官方接口服务平台','Official ByteDance Doubao model service platform')}, website: 'https://console.volcengine.com/ark', keyOptional: false },

  // 4. 开源与本地部署
  { id: 'ollama', get name(){return M('Ollama 本地模型','Ollama (local)')}, category: 'opensource', icon: 'ollama', get desc(){return M('本机运行 Llama、Gemma、Qwen 等开源模型，完全离线隐私','Run Llama, Gemma, Qwen and more locally — fully offline and private')}, website: 'https://ollama.com', keyOptional: true },
  { id: 'openrouter', name: 'OpenRouter', category: 'opensource', icon: 'openrouter', get desc(){return M('全球模型一站式聚合网关，支持上百种免费与商业模型','One-stop gateway to hundreds of free and commercial models')}, website: 'https://openrouter.ai/keys', keyOptional: false },
  { id: 'opencode', name: 'OpenCode', category: 'opensource', icon: 'custom-api', get desc(){return M('OpenCode 官方网关：Zen 按量与 Go 订阅双通道，含多款免费模型','Official OpenCode gateway — Zen pay-as-you-go & Go subscription channels, with free models')}, website: 'https://opencode.ai', keyOptional: false },
  { id: 'commandcode', name: 'Command Code', category: 'opensource', icon: 'custom-api', get desc(){return M('全模型聚合 API：OpenAI 兼容与 Anthropic Messages 端点，按量无加价','All-model gateway — OpenAI-compatible & Anthropic Messages endpoints, pay-as-you-go at cost')}, website: 'https://commandcode.ai', keyOptional: false },
  { id: 'huggingface', name: 'Hugging Face', category: 'opensource', icon: 'huggingface', get desc(){return M('开源社区 Serverless 推理 API 接口','Open-source community serverless inference API')}, website: 'https://huggingface.co/settings/tokens', keyOptional: false },
  { id: 'groq', get name(){return M('Groq 高速推理','Groq')}, category: 'opensource', icon: 'groq', get desc(){return M('LPU 硬件加速，百毫秒超快实时词义辅助','LPU-accelerated, ~100ms real-time inference')}, website: 'https://console.groq.com/keys', keyOptional: false },
  { id: 'fireworks', name: 'Fireworks AI', category: 'opensource', icon: 'fireworks', get desc(){return M('超快开源大模型云端推理 API 接口','Ultra-fast cloud inference API for open models')}, website: 'https://fireworks.ai', keyOptional: false },
  { id: 'mistral', name: 'Mistral AI', category: 'opensource', icon: 'mistral', get desc(){return M('欧洲顶级开源模型研发商，高效模型 API','Efficient model APIs from a leading European open-model lab')}, website: 'https://console.mistral.ai', keyOptional: false },
  { id: 'togetherai', name: 'Together.ai', category: 'opensource', icon: 'togetherai', get desc(){return M('高性能分布式开源模型云端运行平台','High-performance distributed cloud platform for open models')}, website: 'https://api.together.ai', keyOptional: false },
  { id: 'cerebras', name: 'Cerebras', category: 'opensource', icon: 'cerebras', get desc(){return M('晶圆级超算芯片，极致极速推理通道','Wafer-scale chips for extreme inference speed')}, website: 'https://cloud.cerebras.ai', keyOptional: false },
  { id: 'deepinfra', name: 'DeepInfra', category: 'opensource', icon: 'deepinfra', get desc(){return M('高性价比按量计费的开源模型托管云服务','Cost-effective pay-as-you-go open-model hosting')}, website: 'https://deepinfra.com', keyOptional: false },

  // 5. 企业云平台
  { id: 'azure', name: 'Azure OpenAI', category: 'cloud', icon: 'azure', get desc(){return M('微软企业级托管 OpenAI 模型实例','Microsoft enterprise-grade hosted OpenAI instances')}, website: 'https://portal.azure.com', keyOptional: false },
  { id: 'bedrock', name: 'Amazon Bedrock', category: 'cloud', icon: 'bedrock', get desc(){return M('亚马逊云科技企业级基础模型托管服务','AWS enterprise-grade foundation-model hosting')}, website: 'https://aws.amazon.com/bedrock', keyOptional: false },
  { id: 'cohere', name: 'Cohere', category: 'cloud', icon: 'cohere', get desc(){return M('企业级语义搜索与语言理解 Command 系列模型','Enterprise semantic search & language understanding — Command family')}, website: 'https://dashboard.cohere.com', keyOptional: false },

  // 6. 自定义通用接口
  { id: 'openai-compatible', get name(){return M('自定义 Chat Completions','Custom Chat Completions')}, category: 'custom', icon: 'custom-api', get desc(){return M('兼容任意遵循 OpenAI 标准格式的第三方或自建 API 端点','Works with any third-party or self-hosted OpenAI-format endpoint')}, website: '', keyOptional: false },
  { id: 'open-responses', get name(){return M('自定义 Responses API','Custom Responses API')}, category: 'custom', icon: 'custom-api', get desc(){return M('兼容 OpenAI Responses 格式的自定义端点','Works with endpoints in the OpenAI Responses format')}, website: '', keyOptional: false },
];

export function iconUrlFor(iconName) {
  return `../icons/providers/${iconName || 'custom-api'}.svg`;
}

class ServiceCatalogController {
  constructor() {
    this.selectedKey = ''; // 'chatgpt' | 'deepseek' | ... | 'saved:<id>'
    this.searchQuery = '';
    this.initialized = false;
    this.userSelected = false;
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.railList = document.querySelector('#catalog-directory-list');
    this.searchInput = document.querySelector('#catalog-search-input');
    this.addBtn = document.querySelector('#catalog-add-btn');
    this.heroIcon = document.querySelector('#catalog-hero-icon img');
    this.heroTitle = document.querySelector('#catalog-hero-title');
    this.heroBadge = document.querySelector('#catalog-hero-active-badge');
    this.setDefaultBtn = document.querySelector('#catalog-hero-set-default');
    this.docLink = document.querySelector('#catalog-hero-website');
    this.heroDesc = document.querySelector('#catalog-hero-desc');
    this.checkConnBtn = document.querySelector('#catalog-check-conn-btn');
    this.checkBtnLabel = document.querySelector('#catalog-check-btn-label');
    this.countEl = document.querySelector('#catalog-service-count');

    // 绑定搜索输入
    this.searchInput?.addEventListener('input', () => {
      this.searchQuery = this.searchInput.value.trim().toLowerCase();
      this.renderRailList();
    });

    // 绑定新增自定义服务按钮
    this.addBtn?.addEventListener('click', () => {
      this.triggerNewCustomService();
    });

    // 绑定设为当前默认按钮
    this.setDefaultBtn?.addEventListener('click', () => {
      this.makeCurrentServiceDefault();
    });

    // 绑定检查连接按钮
    this.checkConnBtn?.addEventListener('click', () => {
      this.triggerCheckConnection();
    });
  }

  getCurrentState() {
    return window.optionsState?.settings || {};
  }

  // 渲染左侧服务列表
  renderRailList() {
    if (!this.railList) return;
    const settings = this.getCurrentState();
    const currentKind = settings.providerKind || 'chatgpt';
    const activeServiceId = settings.activeApiServiceId || '';
    const savedServices = settings.apiServices || [];

    // 合并用户自建的自定义服务到列表
    const allItems = [...CATALOG_TEMPLATES];
    savedServices.forEach(s => {
      const isTemplateMatch = CATALOG_TEMPLATES.some(t => t.id === s.providerId);
      if (!isTemplateMatch || savedServices.filter(item => item.providerId === s.providerId).length > 1) {
        allItems.push({
          id: `saved:${s.id}`,
          name: s.name || M('未命名服务','Unnamed service'),
          category: 'custom',
          icon: s.providerId || 'custom-api',
          desc: `${s.model || M('未设模型','No model set')} · ${s.baseUrl || ''}`,
          website: '',
          savedInstance: s,
        });
      }
    });

    if (this.countEl) {
      this.countEl.textContent = String(allItems.length);
    }

    this.railList.innerHTML = '';
    const query = this.searchQuery;

    CATALOG_CATEGORIES.forEach(cat => {
      const groupItems = allItems.filter(item => {
        if (item.category !== cat.id) return false;
        if (!query) return true;
        return (
          item.name.toLowerCase().includes(query) ||
          item.id.toLowerCase().includes(query) ||
          (item.desc && item.desc.toLowerCase().includes(query))
        );
      });

      if (groupItems.length === 0) return;

      const sectionEl = document.createElement('div');
      sectionEl.className = 'directory-section';

      const h4 = document.createElement('h4');
      h4.innerHTML = `<span>${cat.label}</span><small>${groupItems.length}</small>`;
      sectionEl.appendChild(h4);

      const itemsWrap = document.createElement('div');
      itemsWrap.className = 'directory-items';

      groupItems.forEach(item => {
        const itemBtn = document.createElement('button');
        itemBtn.type = 'button';
        itemBtn.className = 'service-item';
        itemBtn.dataset.serviceKey = item.id;

        // 判断是否为当前选中的项
        const isSelected = this.selectedKey === item.id;
        if (isSelected) itemBtn.classList.add('is-selected');

        // 判断是否为当前“默认使用”的服务
        let isDefault = false;
        if (item.category === 'subscription') {
          isDefault = currentKind === item.id;
        } else if (item.id.startsWith('saved:')) {
          isDefault = currentKind === 'api' && activeServiceId === item.savedInstance?.id;
        } else {
          // 内置 API 模板
          const savedMatch = savedServices.find(s => s.id === activeServiceId);
          isDefault = currentKind === 'api' && savedMatch?.providerId === item.id;
        }

        // 判断是否“已配置”
        let isConfigured = false;
        if (item.category === 'subscription') {
          isConfigured = false;
        } else if (item.id.startsWith('saved:')) {
          isConfigured = Boolean(item.savedInstance?.apiKey);
        } else {
          const match = savedServices.find(s => s.providerId === item.id);
          isConfigured = Boolean(match?.apiKey);
        }

        let badgeHtml = '';
        if (isDefault) {
          badgeHtml = `<span class="service-badge is-default">${M('默认','Default')}</span>`;
        } else if (isConfigured) {
          badgeHtml = `<span class="service-badge is-configured">${M('已配置','Configured')}</span>`;
        }

        itemBtn.innerHTML = `
          <div class="service-icon-box">
            <img src="${iconUrlFor(item.icon)}" alt="" width="20" height="20">
          </div>
          <div class="service-copy">
            <strong class="service-name">${item.name}</strong>
            <small class="service-desc">${item.desc}</small>
          </div>
          <div class="service-status-col">
            ${badgeHtml}
          </div>
        `;

        itemBtn.addEventListener('click', () => {
          this.selectService(item.id);
        });

        itemsWrap.appendChild(itemBtn);
      });

      sectionEl.appendChild(itemsWrap);
      this.railList.appendChild(sectionEl);
    });

    this.syncHeroDetail();
  }

  // 选中某一服务
  selectService(key) {
    this.userSelected = true;
    this.selectedKey = key;

    // 更新左侧高亮样式
    this.railList?.querySelectorAll('.service-item').forEach(el => {
      el.classList.toggle('is-selected', el.dataset.serviceKey === key);
    });

    const settings = this.getCurrentState();
    const savedServices = settings.apiServices || [];
    const subPanel = document.querySelector('#subscription-panel');
    const apiPanel = document.querySelector('#api-panel');

    // 订阅类服务通道
    if (['chatgpt', 'grok', 'antigravity'].includes(key)) {
      if (subPanel) subPanel.hidden = false;
      if (apiPanel) apiPanel.hidden = true;
    } else {
      // API 类服务
      if (subPanel) subPanel.hidden = true;
      if (apiPanel) apiPanel.hidden = false;

      if (key.startsWith('saved:')) {
        const targetId = key.replace('saved:', '');
        const select = document.querySelector('#api-service-select');
        if (select && select.value !== targetId) {
          select.value = targetId;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        // 内置模板项（如 deepseek, openai, requesty 等）
        const match = savedServices.find(s => s.providerId === key);
        if (match) {
          // 已保存过该服务商实例：切换到该服务
          const select = document.querySelector('#api-service-select');
          if (select && select.value !== match.id) {
            select.value = match.id;
            select.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } else {
          // 首次配置此服务商模板：触发“新增服务”并切换提供商
          const newBtn = document.querySelector('#new-api-service');
          const cancelBtn = document.querySelector('#cancel-api-service');
          if (cancelBtn && cancelBtn.hidden) {
            newBtn?.click();
          }
          setTimeout(() => {
            const providerSelect = document.querySelector('#provider-id');
            if (providerSelect) {
              providerSelect.value = key;
              providerSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const editor = document.querySelector('#api-editor');
            if (editor) editor.open = true;
          }, 20);
        }
      }

      // 确保编辑表单处于展开状态
      const editor = document.querySelector('#api-editor');
      if (editor) editor.open = true;
    }

    this.syncHeroDetail();
  }

  // 同步右侧 Hero 详情栏状态
  syncHeroDetail() {
    const key = this.selectedKey;
    const settings = this.getCurrentState();
    const currentKind = settings.providerKind || 'chatgpt';
    const activeServiceId = settings.activeApiServiceId || '';
    const savedServices = settings.apiServices || [];

    let item = CATALOG_TEMPLATES.find(t => t.id === key);
    if (!item && key.startsWith('saved:')) {
      const s = savedServices.find(s => s.id === key.replace('saved:', ''));
      if (s) {
        item = {
          id: key,
          name: s.name,
          category: 'custom',
          icon: s.providerId || 'custom-api',
          desc: `${s.model || ''} · ${s.baseUrl || ''}`,
          website: '',
        };
      }
    }

    if (!item) {
      item = CATALOG_TEMPLATES[0];
    }

    if (this.heroTitle) this.heroTitle.textContent = item.name;
    if (this.heroDesc) this.heroDesc.textContent = item.desc || '';
    if (this.heroIcon) this.heroIcon.src = iconUrlFor(item.icon);

    // 判断是否为当前默认
    let isDefault = false;
    if (['chatgpt', 'grok', 'antigravity'].includes(key)) {
      isDefault = currentKind === key;
    } else if (key.startsWith('saved:')) {
      isDefault = currentKind === 'api' && activeServiceId === key.replace('saved:', '');
    } else {
      const match = savedServices.find(s => s.id === activeServiceId);
      isDefault = currentKind === 'api' && match?.providerId === key;
    }

    if (this.heroBadge) {
      this.heroBadge.hidden = !isDefault;
    }
    if (this.setDefaultBtn) {
      this.setDefaultBtn.hidden = isDefault;
    }

    // 官方说明与外链
    if (this.docLink) {
      if (item.website) {
        this.docLink.href = item.website;
        this.docLink.hidden = false;
      } else {
        this.docLink.hidden = true;
      }
    }

    // 检查连接按钮文案
    if (this.checkBtnLabel) {
      this.checkBtnLabel.textContent = ['chatgpt', 'grok', 'antigravity'].includes(key) ? M('刷新连接与状态','Refresh connection & status') : M('检查服务连接','Check connection');
    }
  }

  // 将当前查看的服务设为默认
  async makeCurrentServiceDefault() {
    const key = this.selectedKey;
    const settings = this.getCurrentState();
    const savedServices = settings.apiServices || [];

    if (['chatgpt', 'grok', 'antigravity'].includes(key)) {
      const radio = document.querySelector(`input[name="provider-kind"][value="${key}"]`);
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
      this.userSelected = false;
      this.renderRailList();
      return;
    }

    // API 类服务
    let targetServiceId = '';
    if (key.startsWith('saved:')) {
      targetServiceId = key.replace('saved:', '');
    } else {
      const match = savedServices.find(s => s.providerId === key);
      if (match) {
        targetServiceId = match.id;
      }
    }

    if (targetServiceId) {
      const select = document.querySelector('#api-service-select');
      if (select) {
        select.value = targetServiceId;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      this.userSelected = false;
      this.renderRailList();
    } else {
      // 未保存过的服务：尝试直接触发保存
      const form = document.querySelector('#provider-form');
      const keyInput = document.querySelector('#provider-key');
      if (keyInput && keyInput.required && !keyInput.value.trim()) {
        const resultEl = document.querySelector('#provider-result');
        if (resultEl) {
          resultEl.textContent = M('请先填写接口密钥并点击「保存并使用」将其设为当前服务。','Enter the API key and click "Save & use" to make it the active service.');
        }
        keyInput.focus();
      } else if (form) {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    }
  }

  // 触发连接检查
  triggerCheckConnection() {
    const key = this.selectedKey;
    const spinIcon = this.checkConnBtn?.querySelector('.check-spin-icon');
    spinIcon?.classList.add('is-spinning');

    if (['chatgpt', 'grok', 'antigravity'].includes(key)) {
      const refreshBtn = document.querySelector('#refresh-subscription');
      refreshBtn?.click();
    } else {
      const testBtn = document.querySelector('#test-provider');
      testBtn?.click();
    }

    setTimeout(() => {
      spinIcon?.classList.remove('is-spinning');
    }, 1200);
  }

  // 触发新建自定义 API 服务
  triggerNewCustomService() {
    const newBtn = document.querySelector('#new-api-service');
    newBtn?.click();
    this.userSelected = true;
    this.selectedKey = 'openai-compatible';
    this.renderRailList();
    document.querySelector('#provider-name')?.focus();
  }

  // 外部同步入口（当 optionsState 更新后被调用）
  sync() {
    this.init();
    const settings = this.getCurrentState();
    const currentKind = settings.providerKind || 'chatgpt';
    const activeServiceId = settings.activeApiServiceId || '';
    const savedServices = settings.apiServices || [];

    // 如果未曾手动选择，自动对齐到当前激活的服务
    if (!this.userSelected) {
      if (currentKind !== 'api') {
        this.selectedKey = currentKind;
      } else if (activeServiceId) {
        const activeService = savedServices.find(s => s.id === activeServiceId);
        if (activeService) {
          this.selectedKey = activeService.providerId || `saved:${activeService.id}`;
        } else if (savedServices.length > 0) {
          this.selectedKey = savedServices[0].providerId || `saved:${savedServices[0].id}`;
        } else {
          this.selectedKey = 'openai-compatible';
        }
      } else if (savedServices.length > 0) {
        this.selectedKey = savedServices[0].providerId || `saved:${savedServices[0].id}`;
      } else {
        this.selectedKey = 'openai-compatible';
      }
    }

    this.renderRailList();
  }
}

export const serviceCatalog = new ServiceCatalogController();
