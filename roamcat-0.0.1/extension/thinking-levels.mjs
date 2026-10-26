/**
 * @file extension/thinking-levels.mjs
 * 文件职责：按「服务商 + 模型」声明思考档位——每个模型只列官方文档实际支持的档位、默认档与对应请求参数。
 * 主要内容：thinkingProfile 按模型匹配档位描述（levels/defaultValue/request）；resolveThinkingLevel 把已存档位
 *   落到该模型可用的档位（不适用时回到默认档）；THINKING_LEVEL_VALUES 为全部档位取值，供设置项归一化校验。
 *   档位名沿用官方取值（none/low/medium/high/xhigh/max/adaptive/auto），只有开关的模型用 on，思考预算用 budget-N。
 * 模块边界：领域层，纯数据与纯函数，可 Node 安全 import；被 api-providers/api-transport/设置页引用。
 *   未收录的模型返回 null，由调用方沿用原有「关闭思考」参数，不猜测新模型的取值。
 *
 * 官方依据（2026-10 查阅）：
 *   智谱 https://docs.bigmodel.cn/api-reference/模型-api/对话补全 · https://docs.z.ai/api-reference/llm/chat-completion
 *   DeepSeek https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/
 *   Kimi https://platform.kimi.ai/docs/guide/use-thinking-models
 *   腾讯 TokenHub https://cloud.tencent.com/document/product/1823/131208
 *   百度千帆 https://cloud.baidu.com/doc/qianfan-docs/s/Wm95lyynv
 *   商汤 Token Plan https://platform.sensenova.cn/docs
 *   火山方舟 https://docs.volcengine.com/docs/ark/deep-thinking 与各模型详情页（Seed 1.6/1.8）
 *   MiniMax https://platform.minimax.io/docs/api-reference/text-chat-openai
 *   阿里云百炼 https://help.aliyun.com/zh/model-studio/deep-thinking
 *   SiliconFlow https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions
 *   小米 MiMo https://mimo.mi.com/docs/en-US/api/chat/openai-api
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

const M=(zh,en)=>globalThis.RoamCatI18n?.lang?.()==='en'?en:zh;

// 标签在取用时才求值，跟随当前界面语言。
const LABELS = {
  none:()=>M('关闭（none）','Off (none)'),
  on:()=>M('开启','On'),
  forced:()=>M('始终开启（该模型不可关闭）','Always on (cannot be disabled)'),
  auto:()=>M('auto · 模型自行判断是否思考','auto · model decides whether to think'),
  adaptive:()=>M('adaptive · 模型自适应思考','adaptive · model adapts its thinking'),
  minimal:()=>M('minimal · 几乎不思考','minimal · almost no thinking'),
  low:()=>M('low · 轻度思考','low · light thinking'),
  medium:()=>M('medium · 均衡','medium · balanced'),
  high:()=>M('high · 深度思考','high · deep thinking'),
  xhigh:()=>M('xhigh · 更高强度','xhigh · higher effort'),
  max:()=>M('max · 最高强度','max · maximum effort'),
  'budget-1024':()=>M('开启 · 思考预算 1024 tokens','On · 1024-token thinking budget'),
  'budget-4096':()=>M('开启 · 思考预算 4096 tokens','On · 4096-token thinking budget'),
};
export const THINKING_LEVEL_VALUES = Object.freeze(Object.keys(LABELS));
const BUDGETS = {'budget-1024':1024,'budget-4096':4096};

const toggle = type => ({thinking:{type}});
const profile = (levels,defaultValue,request,labels={}) => ({levels,defaultValue,request,labels});
const NO_THINKING = profile([],'',()=>({}));

// thinking.type 开关（关=disabled，开=enabled）。
const thinkingSwitch = () => profile(['none','on'],'none',level=>toggle(level==='none'?'disabled':'enabled'));
// thinking.type 开关 + reasoning_effort 档位。
const thinkingEffort = efforts => profile(['none',...efforts],'none',level=>level==='none'?toggle('disabled'):{...toggle('enabled'),reasoning_effort:level});
// 始终思考、只认 reasoning_effort（不能带 thinking 关闭）。
const forcedEffort = (efforts,defaultValue,{withThinking=false}={}) => profile(efforts,defaultValue,level=>({...(withThinking?toggle('enabled'):{}),reasoning_effort:level}));
// 始终思考、没有可调参数。
const forced = () => profile(['forced'],'forced',()=>({}));
// 只用 reasoning_effort（none 即关闭）。
const effortOnly = efforts => profile(['none',...efforts],'none',level=>({reasoning_effort:level}));
// enable_thinking 开关。
const enableSwitch = () => profile(['none','on'],'none',level=>({enable_thinking:level!=='none'}));
// enable_thinking 开关 + thinking_budget 思考 token 上限；on=不设预算（模型默认上限）。
const enableBudget = () => profile(['none','budget-1024','budget-4096','on'],'none',level=>level==='none'?{enable_thinking:false}:{enable_thinking:true,...(BUDGETS[level]?{thinking_budget:BUDGETS[level]}:{})},{on:()=>M('开启 · 不限预算（模型默认上限）','On · no budget (model default limit)')});
// enable_thinking 开关 + reasoning_effort。
const enableEffort = efforts => profile(['none',...efforts],'none',level=>level==='none'?{enable_thinking:false}:{enable_thinking:true,reasoning_effort:level});
// MiniMax-M3：thinking.type 只认 adaptive / disabled。
const adaptiveSwitch = () => profile(['none','adaptive'],'none',level=>toggle(level==='none'?'disabled':'adaptive'));

// 每个服务商按顺序匹配小写模型 ID，首个命中的规则生效；百炼与 SiliconFlow 的模型 ID 可能带 vendor/ 前缀。
const RULES = {
  zhipu:[
    // GLM-5.3 系列只能开启，reasoning_effort 只认 low/high/max（默认 max）。
    [/^glm-5\.3/,()=>forcedEffort(['low','high','max'],'max',{withThinking:true})],
    // GLM-5.2：none/minimal 关闭思考，low/medium 映射为 high，xhigh 映射为 max，实际可区分 high / max。
    [/^glm-5\.2/,()=>thinkingEffort(['high','max'])],
    [/^glm-(?:5(?:\.1)?|5v|4\.[5-7])(?:$|[-_.v])/,thinkingSwitch],
  ],
  deepseek:[
    // reasoning_effort 原生 low/high/max（minimal→low、medium/xhigh→high）。
    [/^deepseek-v4/,()=>thinkingEffort(['low','high','max'])],
    [/^deepseek-reasoner$/,()=>forcedEffort(['low','high','max'],'high')],
  ],
  moonshotai:[
    // K3 系列始终思考，只认 reasoning_effort low/high/max（默认 max），不得带 thinking。
    [/^kimi-k3/,()=>forcedEffort(['low','high','max'],'max')],
    [/^kimi-k2\.7-code/,forced],
    [/^kimi-k2\.[56]/,thinkingSwitch],
  ],
  tencent:[
    [/^hy4/,()=>thinkingEffort(['high'])],
    [/^hy3(?:$|[-_.])/,()=>thinkingEffort(['low','high'])],
    [/^deepseek-v4/,()=>thinkingEffort(['low','high','max'])],
    [/^glm-5\.3/,()=>forcedEffort(['low','high','max'],'max')],
    [/^glm-5\.2/,()=>thinkingEffort(['high','max'])],
    [/^glm-5v/,thinkingSwitch],
    [/^kimi-k3/,()=>forcedEffort(['low','high','max'],'max')],
    [/^kimi-k2\.7-code/,forced],
    [/^kimi-k2\.[56]/,thinkingSwitch],
    [/^minimax-m2\.[57]/,forced],
    [/^minimax-m3(?:$|[-_])/,adaptiveSwitch],
    [/^qwen3\.5/,thinkingSwitch],
  ],
  qianfan:[
    [/^glm-5\.3/,forced],
    // 千帆的 reasoning_effort 只有 high / max（low、medium 映射为 high）。
    [/^deepseek-v4/,()=>thinkingEffort(['high','max'])],
    [/^(?:deepseek-v3\.2|kimi-k2\.5|glm-5(?:\.[12])?(?:-fast)?)$/,thinkingSwitch],
    [/^deepseek-v3\.2-think$/,()=>profile(['on','budget-1024','budget-4096'],'on',level=>BUDGETS[level]?{thinking_budget:BUDGETS[level]}:{},{on:()=>M('始终开启 · 不限预算','Always on · no budget')})],
    [/^ernie-5\.0-thinking-preview$/,enableBudget],
    [/^(?:qwen3-(?:32b|14b|8b)|ernie-4\.5-turbo-vl(?:-32k)?-preview|ernie-4\.5-vl-28b-a3b)$/,enableSwitch],
    [/^ernie-x1/,forced],
  ],
  sensenova:[
    [/^sensenova-6\.8-flash-lite/,()=>effortOnly(['low','medium','high','max'])],
    [/^sensenova-u1\.5/,()=>NO_THINKING],
    [/^deepseek-(?:v4-)?flash/,()=>effortOnly(['low','high','max'])],
    [/^glm-5\.2/,()=>effortOnly(['high','max'])],
    [/^kimi-k3/,()=>thinkingEffort(['low','medium','high','max'])],
  ],
  volcengine:[
    // Seed 2.x / evolving / character 与 Seed 1.8、1.6 251015、1.6 lite：reasoning_effort minimal(不思考)/low/medium/high。
    [/^doubao-seed-(?:evolving|character|2-|1-8|1-6-lite|1-6-251015)/,()=>thinkingEffort(['low','medium','high'])],
    // Seed 1.6 250615：thinking.type 支持 enabled / disabled / auto。
    [/^doubao-seed-1-6-250615$/,()=>profile(['none','auto','on'],'none',level=>toggle(level==='none'?'disabled':level==='auto'?'auto':'enabled'))],
    [/^doubao-seed-1-6-flash/,thinkingSwitch],
    [/^glm-5-3/,()=>forcedEffort(['low','high','max'],'max',{withThinking:true})],
    [/^glm-5-2/,()=>thinkingEffort(['high','max'])],
    [/^deepseek-v4/,()=>thinkingEffort(['low','high','max'])],
    [/^kimi-k3/,()=>forcedEffort(['low','high','max'],'max',{withThinking:true})],
  ],
  minimax:[
    [/^minimax-m3\.1-flash/,()=>forcedEffort(['low','medium','high','xhigh','max'],'max')],
    [/^minimax-m3(?:$|[-_])/,adaptiveSwitch],
    [/^minimax-m2/,forced],
  ],
  alibaba:[
    [/^minimax\/minimax-m3\.1-flash/,()=>forcedEffort(['low','medium','high','xhigh','max'],'max')],
    [/^minimax\/minimax-m3(?:$|[-_])/,adaptiveSwitch],
    [/^(?:kimi\/)?kimi-k(?:3|2\.7-code)|^glm-5\.3/,forced],
    // Qwen-Max 与 -Instruct / -Thinking 定版模型不支持切换，不在此列。
    [/^(?:qwen3(?:\.\d+)?-(?!max)(?!.*(?:instruct|thinking))|qwen-(?:plus|flash|turbo)|glm-5(?:$|[-_.])|(?:kimi\/)?kimi-k2\.[56])/,enableBudget],
    [/^deepseek-v4/,enableSwitch],
  ],
  siliconflow:[
    // reasoning_effort 仅 DeepSeek-V4 系列与 GLM-5.2 支持，取值 high / max。
    [/(?:^|\/)(?:deepseek-v4|glm-5\.2)/,()=>enableEffort(['high','max'])],
    // 其余混合推理模型用 enable_thinking + thinking_budget；-Instruct / -Thinking 定版模型不在此列。
    [/(?:^|\/)(?:qwen3(?:\.\d+)?-(?!.*(?:instruct|thinking))|glm-(?:4\.[5-7]|5(?:\.1)?)(?:$|[-_.]))/,enableBudget],
  ],
  xiaomi:[
    [/^mimo-/,thinkingSwitch],
  ],
};

/** 该服务商是否按模型声明思考档位。 */
export function hasModelThinkingLevels(providerId) { return Object.hasOwn(RULES,providerId); }

/**
 * 返回模型的思考档位描述：{levels:[{value,label}], defaultValue, request(level)}；未收录返回 null，
 * 已知不支持思考参数的模型返回 levels 为空的描述（请求不带任何思考字段）。
 */
export function thinkingProfile(providerId,model,options={}) {
  const rules=RULES[providerId];
  if (!rules) return null;
  if (providerId==='sensenova'&&options?.channel==='sensecore') return null;
  const id=String(model||'').trim().toLowerCase();
  if (!id) return null;
  for (const [pattern,make] of rules) {
    if (!pattern.test(id)) continue;
    const found=make();
    return {
      defaultValue:found.defaultValue,
      request:found.request,
      levels:found.levels.map(value=>({value,label:(found.labels[value]||LABELS[value])()})),
    };
  }
  return null;
}

/** 把已存档位落到该模型可用的档位；不适用（或未设置）时回到模型默认档。 */
export function resolveThinkingLevel(profileValue,stored) {
  if (!profileValue||!profileValue.levels.length) return '';
  return profileValue.levels.some(level=>level.value===stored)?stored:profileValue.defaultValue;
}
