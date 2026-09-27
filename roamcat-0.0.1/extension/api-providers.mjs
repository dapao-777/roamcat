/**
 * @file extension/api-providers.mjs
 * 文件职责：28家自备API服务商目录与8种协议适配——默认模型、并发、密钥可选性与服务归一化。
 * 主要内容：API_PROVIDERS/getApiProvider/normalizeApiService/apiServiceOrigins；HTTPS-only、本机回环除外；
 *   apiKeys 多密钥轮换池归一化与 apiKeyPoolPick/apiKeyPoolCool 纯函数（运行状态由调用方持有）。
 * 模块边界：领域层，可Node安全import；密钥不进内容脚本；被api-transport/background/options引用。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */

const M=(zh,en)=>globalThis.RoamCatI18n?.lang?.()==='en'?en:zh;
const azureFields = [
  {key:'apiMode',label:M('API 模式','API mode'),type:'select',defaultValue:'responses',options:[{value:'responses',label:'Responses API'},{value:'chat',label:'Chat Completions'}]},
  {key:'resourceName',label:M('资源名称','Resource name'),type:'text',placeholder:'my-azure-openai-resource'},
  {key:'apiVersion',label:M('API 版本','API version'),type:'text',placeholder:'v1',defaultValue:'v1'},
];
const bedrockFields = [{key:'region',label:M('区域','Region'),type:'text',placeholder:'us-east-1',defaultValue:'us-east-1'}];
const reasoningEffortOptions = [
  {value:'none',label:M('关闭（none）','Off (none)')},
  {value:'low',label:M('低','Low')},
  {value:'medium',label:M('中','Medium')},
  {value:'high',label:M('高','High')},
];
const stepfunFields = [
  {key:'channel',label:M('接口通道','API channel'),type:'select',defaultValue:'openapi',options:[
    {value:'openapi',label:M('开放平台按量 · api.stepfun.com/v1','Open platform pay-as-you-go · api.stepfun.com/v1')},
    {value:'plan',label:M('Step Plan 订阅 · api.stepfun.com/step_plan/v1','Step Plan subscription · api.stepfun.com/step_plan/v1')},
    {value:'openapi-intl',label:M('国际站按量 · api.stepfun.ai/v1','Global pay-as-you-go · api.stepfun.ai/v1')},
    {value:'plan-intl',label:M('国际站 Step Plan · api.stepfun.ai/step_plan/v1','Global Step Plan · api.stepfun.ai/step_plan/v1')},
  ]},
  {key:'reasoningEffort',label:M('思考等级','Thinking level'),type:'select',defaultValue:'low',options:[
    {value:'low',label:M('低（最快）','Low (fastest)')},
    {value:'medium',label:M('中','Medium')},
    {value:'high',label:M('高（更慢、更耗额度）','High (slower, uses more quota)')},
  ]},
];
const opencodeFields = [
  {key:'channel',label:M('接口通道','API channel'),type:'select',defaultValue:'zen',options:[
    {value:'zen',label:M('Zen 按量 · opencode.ai/zen/v1','Zen pay-as-you-go · opencode.ai/zen/v1')},
    {value:'go',label:M('Go 订阅 · opencode.ai/zen/go/v1','Go subscription · opencode.ai/zen/go/v1')},
  ]},
];
const compatibleFields = [
  {key:'reasoningEffort',label:M('思考等级','Thinking level'),type:'select',defaultValue:'none',options:reasoningEffortOptions},
];

// Provider names and ordering follow the supported service catalog. Hosted defaults are
// selected independently for general reading, explanation, and structured JSON without
// forced reasoning. Empty apiKeyUrl values avoid referral links and guessed console URLs.
export const API_PROVIDERS = [
  {id:'openai',name:'OpenAI',protocol:'responses',baseUrl:'https://api.openai.com/v1',defaultModel:'gpt-5.6-luna',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'deepseek',name:'DeepSeek',protocol:'chat',baseUrl:'https://api.deepseek.com',defaultModel:'deepseek-v4-flash',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'google',name:'Gemini',protocol:'google',baseUrl:'https://generativelanguage.googleapis.com/v1beta',defaultModel:'gemini-2.5-flash-lite',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'anthropic',name:'Anthropic',protocol:'anthropic',baseUrl:'https://api.anthropic.com/v1',defaultModel:'claude-haiku-4-5',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'xai',name:'Grok',protocol:'responses',baseUrl:'https://api.x.ai/v1',defaultModel:'grok-4.20-0309-non-reasoning',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'openai-compatible',name:M('自定义 Chat Completions','Custom Chat Completions'),protocol:'chat',baseUrl:'https://api.example.com/v1',defaultModel:'',apiKeyUrl:'',keyOptional:false,fields:compatibleFields},
  {id:'open-responses',name:M('自定义 Responses','Custom Responses'),protocol:'responses',baseUrl:'https://api.example.com/v1/responses',defaultModel:'',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'openrouter',name:'OpenRouter',protocol:'chat',baseUrl:'https://openrouter.ai/api/v1',defaultModel:'google/gemma-4-31b-it:free',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'requesty',name:M('Requesty · Jev 判定','Requesty · Jev detection'),protocol:'jev',baseUrl:'https://router.requesty.ai/v1',defaultModel:'typesafe/jev-1.13.0',apiKeyUrl:'https://app.requesty.ai',keyOptional:false,fields:[]},
  {id:'opencode',name:'OpenCode',protocol:'chat',baseUrl:'https://opencode.ai/zen/v1',defaultModel:'deepseek-v4-flash',apiKeyUrl:'https://opencode.ai/auth',keyOptional:false,fields:opencodeFields},
  {id:'commandcode',name:'Command Code',protocol:'chat',baseUrl:'https://api.commandcode.ai/provider/v1',defaultModel:'deepseek/deepseek-v4-flash',apiKeyUrl:'https://commandcode.ai/studio/',keyOptional:false,fields:[]},
  {id:'minimax',name:'MiniMax',protocol:'chat',baseUrl:'https://api.minimax.io/v1',defaultModel:'MiniMax-M3',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'siliconflow',name:'SiliconFlow',protocol:'chat',baseUrl:'https://api.siliconflow.cn/v1',defaultModel:'Qwen/Qwen3-Next-80B-A3B-Instruct',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'azure',name:'Azure OpenAI',protocol:'responses',baseUrl:'',defaultModel:'gpt-5.6-luna',apiKeyUrl:'',keyOptional:false,fields:azureFields},
  {id:'bedrock',name:'Amazon Bedrock',protocol:'bedrock',baseUrl:'',defaultModel:'us.amazon.nova-micro-v1:0',apiKeyUrl:'',keyOptional:false,fields:bedrockFields},
  {id:'groq',name:'Groq',protocol:'chat',baseUrl:'https://api.groq.com/openai/v1',defaultModel:'llama-3.3-70b-versatile',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'deepinfra',name:'DeepInfra',protocol:'chat',baseUrl:'https://api.deepinfra.com/v1/openai',defaultModel:'meta-llama/Llama-3.3-70B-Instruct-Turbo',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'mistral',name:'Mistral AI',protocol:'chat',baseUrl:'https://api.mistral.ai/v1',defaultModel:'mistral-small-latest',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'togetherai',name:'Together.ai',protocol:'chat',baseUrl:'https://api.together.xyz/v1',defaultModel:'meta-llama/Llama-3.3-70B-Instruct-Turbo',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'cohere',name:'Cohere',protocol:'cohere',baseUrl:'https://api.cohere.com/v2',defaultModel:'command-a-03-2025',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'fireworks',name:'Fireworks AI',protocol:'chat',baseUrl:'https://api.fireworks.ai/inference/v1',defaultModel:'accounts/fireworks/models/llama-v3p3-70b-instruct',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'cerebras',name:'Cerebras',protocol:'chat',baseUrl:'https://api.cerebras.ai/v1',defaultModel:'qwen-3.8-27b',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'ollama',name:'Ollama',protocol:'ollama',baseUrl:'http://localhost:11434/api',defaultModel:'gemma3:4b',apiKeyUrl:'',keyOptional:true,fields:[]},
  {id:'volcengine',name:'Volcengine',protocol:'chat',baseUrl:'https://ark.cn-beijing.volces.com/api/v3',defaultModel:'doubao-seed-1-6-flash-250828',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'alibaba',name:'Alibaba Cloud',protocol:'chat',baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',defaultModel:'qwen3.8-flash',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'moonshotai',name:'Moonshot AI',protocol:'chat',baseUrl:'https://api.moonshot.ai/v1',defaultModel:'kimi-k2.6',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'stepfun',name:M('阶跃星辰','StepFun'),protocol:'chat',baseUrl:'https://api.stepfun.com/v1',defaultModel:'step-3.7-flash',apiKeyUrl:'',keyOptional:false,fields:stepfunFields},
  {id:'huggingface',name:'Hugging Face',protocol:'chat',baseUrl:'https://router.huggingface.co/v1',defaultModel:'Qwen/Qwen2.5-7B-Instruct-1M',apiKeyUrl:'',keyOptional:false,fields:[]},
];

const providersById = new Map(API_PROVIDERS.map(provider => [provider.id,provider]));

export function getApiProvider(id) {
  return providersById.get(id) || null;
}

function cleanOption(value,key) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error(M(`服务选项 ${key} 必须是文本。`,`Service option ${key} must be text.`));
  return value.trim();
}

function normalizedOptions(provider,source) {
  if (source === undefined) source={};
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error(M('API 服务选项无效。','Invalid API service option.'));
  const allowed=new Set(provider.fields.map(field=>field.key));
  for (const key of Object.keys(source)) if (!allowed.has(key)) throw new Error(M('API 服务包含未知选项。','The API service contains unknown options.'));
  const result={};
  for (const field of provider.fields) {
    let value=cleanOption(source[field.key],field.key);
    if (!value && field.defaultValue) value=field.defaultValue;
    if (field.type==='select' && !field.options.some(option=>option.value===value)) throw new Error(M(`服务选项 ${field.label} 无效。`,`Service option ${field.label} is invalid.`));
    if (value) result[field.key]=value;
  }
  return result;
}

export function apiProviderBaseUrl(providerId,options={}) {
  const provider=getApiProvider(providerId);
  if (!provider) throw new Error(M('不支持的 API 服务商。','Unsupported API provider.'));
  const normalized=normalizedOptions(provider,options);
  if (providerId==='azure') {
    const resourceName=normalized.resourceName || '';
    if (!resourceName) return '';
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(resourceName)) throw new Error(M('Azure 资源名称无效。','Invalid Azure resource name.'));
    return `https://${resourceName}.openai.azure.com/openai/v1`;
  }
  if (providerId==='bedrock') {
    const region=normalized.region || 'us-east-1';
    if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d+$/.test(region)) throw new Error(M('Bedrock 区域无效。','Invalid Bedrock region.'));
    return `https://bedrock-runtime.${region}.amazonaws.com`;
  }
  if (providerId==='stepfun') {
    if (normalized.channel==='plan') return 'https://api.stepfun.com/step_plan/v1';
    if (normalized.channel==='openapi-intl') return 'https://api.stepfun.ai/v1';
    if (normalized.channel==='plan-intl') return 'https://api.stepfun.ai/step_plan/v1';
    return 'https://api.stepfun.com/v1';
  }
  if (providerId==='opencode') {
    if (normalized.channel==='go') return 'https://opencode.ai/zen/go/v1';
    return 'https://opencode.ai/zen/v1';
  }
  return provider.baseUrl;
}

function normalizedBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(M('API 地址不能为空。','The API URL must not be empty.'));
  let url;
  try { url=new URL(value.trim()); } catch { throw new Error(M('请输入有效的 API 地址。','Please enter a valid API URL.')); }
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if ((url.protocol!=='https:' && !(url.protocol==='http:'&&loopback)) || url.username || url.password || url.search || url.hash) throw new Error(M('API 地址必须使用 HTTPS；仅本机服务允许 HTTP，不允许内嵌凭据或查询参数。','The API URL must use HTTPS; HTTP is allowed only for localhost services. Embedded credentials and query params are not allowed.'));
  url.pathname=url.pathname==='/' ? '/' : url.pathname.replace(/\/+$/,'');
  return url.href.replace(/\/$/,'');
}

export const API_SERVICE_CONCURRENCY = Object.freeze({min:1,max:10,default:2});
export const API_SERVICE_KEY_POOL = Object.freeze({max:10,keyMax:4096});

function normalizedKeyPool(row,legacy) {
  const source=legacy||row.apiKeys===undefined?[]:row.apiKeys;
  if (!Array.isArray(source)) throw new Error(M('密钥轮换列表必须是数组。','The key rotation list must be an array.'));
  if (source.length>API_SERVICE_KEY_POOL.max) throw new Error(M(`每个服务最多 ${API_SERVICE_KEY_POOL.max} 把密钥。`,`At most ${API_SERVICE_KEY_POOL.max} keys per service.`));
  const seen=new Set(),pool=[];
  for (const value of source) {
    if (typeof value!=='string') throw new Error(M('密钥必须是文本。','Keys must be text.'));
    const trimmed=value.trim();
    if (!trimmed) continue;
    if (trimmed.length>API_SERVICE_KEY_POOL.keyMax) throw new Error(M('单把密钥不能超过 4096 字符。','A single key must not exceed 4096 characters.'));
    if (!seen.has(trimmed)) { seen.add(trimmed); pool.push(trimmed); }
  }
  const primary=row.apiKey.trim();
  if (primary.length>API_SERVICE_KEY_POOL.keyMax) throw new Error(M('单把密钥不能超过 4096 字符。','A single key must not exceed 4096 characters.'));
  if (primary) { const existing=pool.indexOf(primary); if (existing>=0) pool.splice(existing,1); pool.unshift(primary); }
  if (pool.length>API_SERVICE_KEY_POOL.max) throw new Error(M(`每个服务最多 ${API_SERVICE_KEY_POOL.max} 把密钥。`,`At most ${API_SERVICE_KEY_POOL.max} keys per service.`));
  return pool;
}

export function normalizeApiService(row) {
  if (!row || typeof row!=='object' || Array.isArray(row)) throw new Error(M('无效的 API 服务。','Invalid API service.'));
  const legacy=!Object.hasOwn(row,'providerId');
  const allowed=new Set(legacy?['id','name','baseUrl','model','apiKey','maxConcurrency']:['id','name','providerId','baseUrl','model','apiKey','apiKeys','options','maxConcurrency']);
  for (const key of Object.keys(row)) if (!allowed.has(key)) throw new Error(M('API 服务包含未知字段。','The API service contains unknown fields.'));
  for (const key of ['id','name','baseUrl','model','apiKey']) if (typeof row[key]!=='string') throw new Error(M('无效的 API 服务。','Invalid API service.'));
  const providerId=legacy?'openai-compatible':row.providerId;
  if (typeof providerId!=='string' || !getApiProvider(providerId)) throw new Error(M('不支持的 API 服务商。','Unsupported API provider.'));
  const provider=getApiProvider(providerId),options=normalizedOptions(provider,legacy?{}:row.options);
  const configuredBase=row.baseUrl.trim() || apiProviderBaseUrl(providerId,options);
  const maxConcurrency=row.maxConcurrency===undefined||row.maxConcurrency==='' ? API_SERVICE_CONCURRENCY.default : Number(row.maxConcurrency);
  if (!Number.isInteger(maxConcurrency) || maxConcurrency<API_SERVICE_CONCURRENCY.min || maxConcurrency>API_SERVICE_CONCURRENCY.max) throw new Error(M(`服务并发数须为 ${API_SERVICE_CONCURRENCY.min}–${API_SERVICE_CONCURRENCY.max} 的整数。`,`Service concurrency must be an integer between ${API_SERVICE_CONCURRENCY.min} and ${API_SERVICE_CONCURRENCY.max}.`));
  const apiKeys=normalizedKeyPool(row,legacy);
  return {id:row.id.trim(),name:row.name.trim(),providerId,baseUrl:normalizedBaseUrl(configuredBase),model:row.model.trim(),apiKey:apiKeys[0]||'',apiKeys,options,maxConcurrency};
}

// 轮换池 = 归一化后的 apiKeys（首把即 apiKey 主密钥）；兼容未带 apiKeys 的旧对象。
export function apiServiceKeys(service) {
  const listed=Array.isArray(service?.apiKeys)?service.apiKeys.filter(key=>typeof key==='string'&&key.trim()):[];
  const primary=typeof service?.apiKey==='string'?service.apiKey.trim():'';
  if (primary&&!listed.includes(primary))listed.unshift(primary);
  return listed;
}

// 轮换池运行状态：{cursor:下一个起始下标, cooling:Map<下标,冷却截止毫秒>}。
// 纯函数便于单测；状态本体由调用方（后台 SW）按 service.id 持有，SW 回收即自然归零。
export function apiKeyPoolPick(service,state,{exclude,now=Date.now()}={}) {
  const keys=apiServiceKeys(service);
  if (!keys.length) return null;
  if (!state) return {keyIndex:0,service:keys.length>1?{...service,apiKey:keys[0]}:service};
  for (const [index,until] of state.cooling) if (!(until>now)) state.cooling.delete(index);
  let earliest=-1,earliestUntil=Infinity;
  for (let step=0;step<keys.length;step++) {
    const index=(state.cursor+step)%keys.length;
    if (exclude?.has(index)) continue;
    const until=state.cooling.get(index)||0;
    if (until<=now) { state.cursor=(index+1)%keys.length; return {keyIndex:index,service:{...service,apiKey:keys[index]}}; }
    if (until<earliestUntil) { earliestUntil=until; earliest=index; }
  }
  if (earliest<0) return null;
  state.cursor=(earliest+1)%keys.length;
  return {keyIndex:earliest,service:{...service,apiKey:keys[earliest]}};
}

export function apiKeyPoolCool(state,keyIndex,durationMs,now=Date.now()) {
  if (!state||keyIndex<0) return;
  const until=now+durationMs;
  if ((state.cooling.get(keyIndex)||0)<until) state.cooling.set(keyIndex,until);
}


export function apiServiceReady(service) {
  try {
    const normalized=normalizeApiService(service),provider=getApiProvider(normalized.providerId);
    return Boolean(normalized.model && (provider.keyOptional || normalized.apiKey));
  } catch { return false; }
}

export function apiServiceOrigins(service) {
  const normalized=normalizeApiService(service);
  return [new URL(normalized.baseUrl).origin];
}
