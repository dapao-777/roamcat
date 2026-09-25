/**
 * @file extension/api-providers.mjs
 * 文件职责：26家自备API服务商目录与8种协议适配——默认模型、并发、密钥可选性与服务归一化。
 * 主要内容：API_PROVIDERS/getApiProvider/normalizeApiService/apiServiceOrigins；HTTPS-only、本机回环除外。
 * 模块边界：领域层，可Node安全import；密钥不进内容脚本；被api-transport/background/options引用。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
const azureFields = [
  {key:'apiMode',label:'API 模式',type:'select',defaultValue:'responses',options:[{value:'responses',label:'Responses API'},{value:'chat',label:'Chat Completions'}]},
  {key:'resourceName',label:'资源名称',type:'text',placeholder:'my-azure-openai-resource'},
  {key:'apiVersion',label:'API 版本',type:'text',placeholder:'v1',defaultValue:'v1'},
];
const bedrockFields = [{key:'region',label:'区域',type:'text',placeholder:'us-east-1',defaultValue:'us-east-1'}];
const reasoningEffortOptions = [
  {value:'none',label:'关闭（none）'},
  {value:'low',label:'低'},
  {value:'medium',label:'中'},
  {value:'high',label:'高'},
];
const stepfunFields = [
  {key:'channel',label:'接口通道',type:'select',defaultValue:'openapi',options:[
    {value:'openapi',label:'开放平台按量 · api.stepfun.com/v1'},
    {value:'plan',label:'Step Plan 订阅 · api.stepfun.com/step_plan/v1'},
    {value:'openapi-intl',label:'国际站按量 · api.stepfun.ai/v1'},
    {value:'plan-intl',label:'国际站 Step Plan · api.stepfun.ai/step_plan/v1'},
  ]},
  {key:'reasoningEffort',label:'思考等级',type:'select',defaultValue:'low',options:[
    {value:'low',label:'低（最快）'},
    {value:'medium',label:'中'},
    {value:'high',label:'高（更慢、更耗额度）'},
  ]},
];
const compatibleFields = [
  {key:'reasoningEffort',label:'思考等级',type:'select',defaultValue:'none',options:reasoningEffortOptions},
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
  {id:'openai-compatible',name:'自定义 Chat Completions',protocol:'chat',baseUrl:'https://api.example.com/v1',defaultModel:'',apiKeyUrl:'',keyOptional:false,fields:compatibleFields},
  {id:'open-responses',name:'自定义 Responses',protocol:'responses',baseUrl:'https://api.example.com/v1/responses',defaultModel:'',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'openrouter',name:'OpenRouter',protocol:'chat',baseUrl:'https://openrouter.ai/api/v1',defaultModel:'google/gemma-4-31b-it:free',apiKeyUrl:'',keyOptional:false,fields:[]},
  {id:'requesty',name:'Requesty · Jev 判定',protocol:'jev',baseUrl:'https://router.requesty.ai/v1',defaultModel:'typesafe/jev-1.13.0',apiKeyUrl:'https://app.requesty.ai',keyOptional:false,fields:[]},
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
  {id:'stepfun',name:'阶跃星辰',protocol:'chat',baseUrl:'https://api.stepfun.com/v1',defaultModel:'step-3.7-flash',apiKeyUrl:'',keyOptional:false,fields:stepfunFields},
  {id:'huggingface',name:'Hugging Face',protocol:'chat',baseUrl:'https://router.huggingface.co/v1',defaultModel:'Qwen/Qwen2.5-7B-Instruct-1M',apiKeyUrl:'',keyOptional:false,fields:[]},
];

const providersById = new Map(API_PROVIDERS.map(provider => [provider.id,provider]));

export function getApiProvider(id) {
  return providersById.get(id) || null;
}

function cleanOption(value,key) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error(`服务选项 ${key} 必须是文本。`);
  return value.trim();
}

function normalizedOptions(provider,source) {
  if (source === undefined) source={};
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('API 服务选项无效。');
  const allowed=new Set(provider.fields.map(field=>field.key));
  for (const key of Object.keys(source)) if (!allowed.has(key)) throw new Error('API 服务包含未知选项。');
  const result={};
  for (const field of provider.fields) {
    let value=cleanOption(source[field.key],field.key);
    if (!value && field.defaultValue) value=field.defaultValue;
    if (field.type==='select' && !field.options.some(option=>option.value===value)) throw new Error(`服务选项 ${field.label} 无效。`);
    if (value) result[field.key]=value;
  }
  return result;
}

export function apiProviderBaseUrl(providerId,options={}) {
  const provider=getApiProvider(providerId);
  if (!provider) throw new Error('不支持的 API 服务商。');
  const normalized=normalizedOptions(provider,options);
  if (providerId==='azure') {
    const resourceName=normalized.resourceName || '';
    if (!resourceName) return '';
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(resourceName)) throw new Error('Azure 资源名称无效。');
    return `https://${resourceName}.openai.azure.com/openai/v1`;
  }
  if (providerId==='bedrock') {
    const region=normalized.region || 'us-east-1';
    if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d+$/.test(region)) throw new Error('Bedrock 区域无效。');
    return `https://bedrock-runtime.${region}.amazonaws.com`;
  }
  if (providerId==='stepfun') {
    if (normalized.channel==='plan') return 'https://api.stepfun.com/step_plan/v1';
    if (normalized.channel==='openapi-intl') return 'https://api.stepfun.ai/v1';
    if (normalized.channel==='plan-intl') return 'https://api.stepfun.ai/step_plan/v1';
    return 'https://api.stepfun.com/v1';
  }
  return provider.baseUrl;
}

function normalizedBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('API 地址不能为空。');
  let url;
  try { url=new URL(value.trim()); } catch { throw new Error('请输入有效的 API 地址。'); }
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if ((url.protocol!=='https:' && !(url.protocol==='http:'&&loopback)) || url.username || url.password || url.search || url.hash) throw new Error('API 地址必须使用 HTTPS；仅本机服务允许 HTTP，不允许内嵌凭据或查询参数。');
  url.pathname=url.pathname==='/' ? '/' : url.pathname.replace(/\/+$/,'');
  return url.href.replace(/\/$/,'');
}

export const API_SERVICE_CONCURRENCY = Object.freeze({min:1,max:10,default:2});

export function normalizeApiService(row) {
  if (!row || typeof row!=='object' || Array.isArray(row)) throw new Error('无效的 API 服务。');
  const legacy=!Object.hasOwn(row,'providerId');
  const allowed=new Set(legacy?['id','name','baseUrl','model','apiKey','maxConcurrency']:['id','name','providerId','baseUrl','model','apiKey','options','maxConcurrency']);
  for (const key of Object.keys(row)) if (!allowed.has(key)) throw new Error('API 服务包含未知字段。');
  for (const key of ['id','name','baseUrl','model','apiKey']) if (typeof row[key]!=='string') throw new Error('无效的 API 服务。');
  const providerId=legacy?'openai-compatible':row.providerId;
  if (typeof providerId!=='string' || !getApiProvider(providerId)) throw new Error('不支持的 API 服务商。');
  const provider=getApiProvider(providerId),options=normalizedOptions(provider,legacy?{}:row.options);
  const configuredBase=row.baseUrl.trim() || apiProviderBaseUrl(providerId,options);
  const maxConcurrency=row.maxConcurrency===undefined||row.maxConcurrency==='' ? API_SERVICE_CONCURRENCY.default : Number(row.maxConcurrency);
  if (!Number.isInteger(maxConcurrency) || maxConcurrency<API_SERVICE_CONCURRENCY.min || maxConcurrency>API_SERVICE_CONCURRENCY.max) throw new Error(`服务并发数须为 ${API_SERVICE_CONCURRENCY.min}–${API_SERVICE_CONCURRENCY.max} 的整数。`);
  return {id:row.id.trim(),name:row.name.trim(),providerId,baseUrl:normalizedBaseUrl(configuredBase),model:row.model.trim(),apiKey:row.apiKey.trim(),options,maxConcurrency};
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
