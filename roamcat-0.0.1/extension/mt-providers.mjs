/**
 * @file extension/mt-providers.mjs
 * 文件职责：机器翻译服务目录——14 种传统机翻（9 家官方 API、4 种免密钥、1 种自建 DeepLX）的凭据字段、
 *   批量与限速参数，以及按场景选用翻译引擎的设置归一化。
 * 主要内容：MT_PROVIDERS/getMtProvider/normalizeMtService/mtServiceReady/mtServiceOrigins；
 *   MT_SCENES 与 normalizeTranslationEngines/mtEngineFor/mtEngineIdentity；
 *   MT_ENDPOINTS 集中登记各家固定接口地址（门禁副本按字面量改写到本机假接口）。
 * 模块边界：领域层，可 Node 安全 import；只做配置与纯计算，不发请求；凭据只在后台使用，
 *   不进内容脚本、诊断与连接器。接口事实参考各家官方文档与 FluentRead（GPL-3.0）的服务清单，未拷贝其代码。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */

const M=(zh,en)=>globalThis.RoamCatI18n?.lang?.()==='en'?en:zh;

// 固定接口地址。verify:audit 等门禁会在测试副本里把这些字面量改写到 127.0.0.1，改写法时同步门禁。
export const MT_ENDPOINTS = Object.freeze({
  deeplFree:'https://api-free.deepl.com/v2/translate',
  deeplPro:'https://api.deepl.com/v2/translate',
  googleCloud:'https://translation.googleapis.com/language/translate/v2',
  azure:'https://api.cognitive.microsofttranslator.com/translate',
  tencent:'https://tmt.tencentcloudapi.com/',
  alibaba:'https://mt.{region}.aliyuncs.com/',
  baidu:'https://fanyi-api.baidu.com/api/trans/vip/translate',
  volcengine:'https://translate.volcengineapi.com/',
  youdao:'https://openapi.youdao.com/api',
  niutrans:'https://api.niutrans.com/NiuTransServer/translation',
  mymemory:'https://api.mymemory.translated.net/get',
  googleWeb:'https://translate.googleapis.com/translate_a/t',
  microsoftEdge:'https://edge.microsoft.com/translate/translatetext',
});

const azureRegions=['global','eastasia','southeastasia','japaneast','koreacentral','centralindia','australiaeast','eastus','eastus2','westus','westus2','centralus','canadacentral','brazilsouth','northeurope','westeurope','uksouth','francecentral','swedencentral','uaenorth'];
const tencentRegions=['ap-beijing','ap-shanghai','ap-guangzhou','ap-chengdu','ap-chongqing','ap-hongkong','ap-singapore','ap-bangkok','ap-mumbai','ap-seoul','ap-tokyo','na-siliconvalley','na-ashburn','na-toronto','eu-frankfurt'];
const regionOptions=values=>values.map(value=>({value,label:value}));
const secret=(key,label)=>({key,label,type:'secret',required:true});
const plain=(key,label)=>({key,label,type:'text',required:true});

// kind：official 官方 API（要密钥）、free 官方免密钥接口、unofficial 非公开网页接口、local 浏览器本机、selfHosted 用户自建。
// batch：单次请求的条数与字符上限；qps：每秒请求上限（同一服务的请求按此间隔起跑）；concurrency：同时在途请求数。
export const MT_PROVIDERS = [
  {id:'chrome',kind:'local',name:M('Chrome 本机翻译','Chrome on-device translation'),desc:M('浏览器自带的本机模型，文本不出本机；需要 Chrome 138 以上桌面版','Built-in browser model; text stays on this device. Needs desktop Chrome 138+'),website:'https://developer.chrome.com/docs/ai/translator-api',fields:[],batch:{items:8,chars:20000},concurrency:1},
  {id:'deepl',kind:'official',name:'DeepL API',desc:M('官方 API；Free 版每月 50 万字符','Official API; the Free plan includes 500,000 characters a month'),website:'https://www.deepl.com/your-account/keys',fields:[secret('apiKey','DeepL API Key')],batch:{items:50,chars:60000},concurrency:3},
  {id:'google-cloud',kind:'official',name:'Google Cloud Translation',desc:M('官方 API；每月 50 万字符免费','Official API; 500,000 free characters a month'),website:'https://console.cloud.google.com/apis/credentials',fields:[secret('apiKey','API Key')],batch:{items:100,chars:10000},concurrency:4},
  {id:'azure',kind:'official',name:M('Azure AI 翻译','Azure AI Translator'),desc:M('官方 API；F0 免费层每月 200 万字符','Official API; the F0 free tier includes 2 million characters a month'),website:'https://portal.azure.com',fields:[secret('apiKey',M('密钥（Key）','Key')),{key:'region',label:M('区域','Region'),type:'select',defaultValue:'global',options:regionOptions(azureRegions)}],batch:{items:100,chars:20000},concurrency:4},
  {id:'tencent',kind:'official',name:M('腾讯云机器翻译','Tencent Cloud Machine Translation'),desc:M('旧版官方 API 正逐步退市；免费资源包已停止发放，请核对官方公告','Legacy official API is being retired; new free resource packs have ended. Check the official notices'),website:'https://console.cloud.tencent.com/cam/capi',fields:[plain('secretId','SecretId'),secret('secretKey','SecretKey'),{key:'region',label:M('地域','Region'),type:'select',defaultValue:'ap-beijing',options:regionOptions(tencentRegions)}],batch:{items:32,chars:5000},concurrency:1,qps:1},
  {id:'alibaba',kind:'official',name:M('阿里云机器翻译','Alibaba Cloud Machine Translation'),desc:M('官方 API；通用版每月 100 万字符免费','Official API; the general edition includes 1 million free characters a month'),website:'https://ram.console.aliyun.com/manage/ak',fields:[plain('accessKeyId','AccessKey ID'),secret('accessKeySecret','AccessKey Secret'),{key:'region',label:M('地域','Region'),type:'select',defaultValue:'cn-hangzhou',options:[{value:'cn-hangzhou',label:M('华东 1（杭州）· cn-hangzhou','China East 1 (Hangzhou) · cn-hangzhou')},{value:'ap-southeast-1',label:M('新加坡 · ap-southeast-1','Singapore · ap-southeast-1')}]}],batch:{items:1,chars:5000},concurrency:4,qps:40},
  {id:'baidu',kind:'official',name:M('百度翻译开放平台','Baidu Translate API'),desc:M('官方 API；标准版每月 5 万字符、每秒 1 次','Official API; the standard edition includes 50,000 characters a month at 1 request/s'),website:'https://fanyi-api.baidu.com/manage/developer',fields:[plain('appId','APP ID'),secret('secretKey',M('密钥','Secret key')),{key:'plan',label:M('版本','Edition'),type:'select',defaultValue:'standard',options:[{value:'standard',label:M('标准版（每秒 1 次）','Standard (1 request/s)')},{value:'advanced',label:M('高级版（每秒 10 次）','Advanced (10 requests/s)')}]}],batch:{items:16,chars:5000},concurrency:1,qps:1},
  {id:'volcengine',kind:'official',name:M('火山引擎机器翻译','Volcengine Machine Translation'),desc:M('官方 API；每月 200 万字符免费','Official API; 2 million free characters a month'),website:'https://console.volcengine.com/iam/keymanage',fields:[plain('accessKeyId','Access Key ID'),secret('secretAccessKey','Secret Access Key'),{key:'region',label:M('地域','Region'),type:'select',defaultValue:'cn-north-1',options:[{value:'cn-north-1',label:M('华北 2（北京）· cn-north-1','China North 2 (Beijing) · cn-north-1')},{value:'ap-southeast-1',label:M('亚太东南（柔佛）· ap-southeast-1','Asia Pacific (Johor) · ap-southeast-1')}]}],batch:{items:16,chars:5000},concurrency:3,qps:10},
  {id:'youdao',kind:'official',name:M('有道智云','Youdao AI Cloud'),desc:M('官方 API；按量付费','Official API; pay as you go'),website:'https://ai.youdao.com/console/',fields:[plain('appKey',M('应用 ID','App key')),secret('appSecret',M('应用密钥','App secret'))],batch:{items:1,chars:5000},concurrency:3},
  {id:'niutrans',kind:'official',name:M('小牛翻译','NiuTrans'),desc:M('官方 API；每天有免费额度','Official API; includes a daily free quota'),website:'https://niutrans.com/cloud/account_info/info',fields:[secret('apiKey','API Key')],batch:{items:1,chars:5000},concurrency:2},
  {id:'mymemory',kind:'free',name:'MyMemory',desc:M('公开免费 API；匿名每天 5000 字符','Free public API; 5,000 characters a day anonymously'),website:'https://mymemory.translated.net/doc/spec.php',fields:[{key:'email',label:M('联系邮箱（可选，额度从每天 5000 字符升到 5 万）','Contact email (optional; raises the daily quota from 5,000 to 50,000 characters)'),type:'email',required:false}],batch:{items:1,chars:5000},concurrency:1,qps:3},
  {id:'google-web',kind:'unofficial',name:M('Google 翻译（网页接口）','Google Translate (web endpoint)'),desc:M('免密钥，网页版用的非公开接口，可能被限流或随时失效','No key; an unofficial web endpoint that may be rate-limited or stop working'),website:'https://translate.google.com',fields:[],batch:{items:32,chars:5000},concurrency:2},
  {id:'microsoft-edge',kind:'unofficial',name:M('微软翻译（Edge 接口）','Microsoft Translator (Edge endpoint)'),desc:M('免密钥，Edge 浏览器用的非公开接口，可能随时失效','No key; an unofficial Edge endpoint that may stop working'),website:'https://www.microsoft.com/translator',fields:[],batch:{items:25,chars:10000},concurrency:3},
  {id:'deeplx',kind:'selfHosted',name:M('DeepLX（自建）','DeepLX (self-hosted)'),desc:M('你自己部署的 DeepLX 服务','Your own self-hosted DeepLX service'),website:'https://github.com/OwO-Network/DeepLX',fields:[{key:'endpoint',label:M('接口地址','Endpoint URL'),type:'url',required:true,placeholder:'https://deeplx.example.com/translate'},{key:'token',label:M('访问令牌（可选）','Access token (optional)'),type:'secret',required:false}],batch:{items:1,chars:5000},concurrency:2},
];

/** 翻译场景：整页双语、视频字幕、直播聊天、PDF/EPUB 阅读器、选段翻译。 */
export const MT_SCENES = Object.freeze(['page','video','liveChat','reader','passage']);
const MT_FIELD_MAX = 4096;
const providersById = new Map(MT_PROVIDERS.map(provider=>[provider.id,provider]));

export function getMtProvider(id) { return providersById.get(id) || null; }
/** 不需要用户保存任何凭据即可使用的服务（MyMemory 的邮箱是可选项）。 */
export function mtKeyless(provider) { return Boolean(provider) && !provider.fields.some(field=>field.required); }

function endpointUrl(value) {
  let url;
  try { url=new URL(value); } catch { throw new Error(M('请输入有效的接口地址。','Enter a valid endpoint URL.')); }
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if ((url.protocol!=='https:' && !(url.protocol==='http:'&&loopback)) || url.username || url.password || url.search || url.hash) throw new Error(M('接口地址必须使用 HTTPS；仅本机服务允许 HTTP，不允许内嵌账号、查询参数或片段。','The endpoint must use HTTPS; HTTP is allowed only for localhost. Embedded credentials, query params, and fragments are not allowed.'));
  return url.href;
}

/**
 * 归一化一条机翻凭据：{providerId, credentials}。strict=true（保存时）要求必填项齐全；
 * 读取存量设置时用 strict=false，缺项的行保留下来但不算就绪。
 */
export function normalizeMtService(row,{strict=true}={}) {
  if (!row || typeof row!=='object' || Array.isArray(row)) throw new Error(M('无效的机器翻译服务。','Invalid machine-translation service.'));
  for (const key of Object.keys(row)) if (!['providerId','credentials'].includes(key)) throw new Error(M('机器翻译服务包含未知字段。','The machine-translation service contains unknown fields.'));
  const provider=getMtProvider(row.providerId);
  if (!provider) throw new Error(M('不支持的机器翻译服务。','Unsupported machine-translation service.'));
  const source=row.credentials===undefined?{}:row.credentials;
  if (!source || typeof source!=='object' || Array.isArray(source)) throw new Error(M('机器翻译凭据无效。','Invalid machine-translation credentials.'));
  const allowed=new Set(provider.fields.map(field=>field.key));
  for (const key of Object.keys(source)) if (!allowed.has(key)) throw new Error(M('机器翻译凭据包含未知字段。','The machine-translation credentials contain unknown fields.'));
  const credentials={};
  for (const field of provider.fields) {
    const raw=source[field.key];
    if (raw!==undefined && raw!==null && typeof raw!=='string') throw new Error(M(`${field.label} 必须是文本。`,`${field.label} must be text.`));
    let value=typeof raw==='string'?raw.trim():'';
    if (value.length>MT_FIELD_MAX) throw new Error(M(`${field.label} 过长。`,`${field.label} is too long.`));
    if (!value && field.defaultValue) value=field.defaultValue;
    if (field.type==='select' && !field.options.some(option=>option.value===value)) throw new Error(M(`${field.label} 无效。`,`${field.label} is invalid.`));
    if (field.type==='url' && value) value=endpointUrl(value);
    if (field.type==='email' && value && (value.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) throw new Error(M('请输入有效的邮箱。','Enter a valid email address.'));
    if (/[\r\n]/.test(value)) throw new Error(M(`${field.label} 不能包含换行。`,`${field.label} must not contain line breaks.`));
    if (strict && field.required && !value) throw new Error(M(`请填写 ${field.label}。`,`Enter ${field.label}.`));
    if (value) credentials[field.key]=value;
  }
  return {providerId:provider.id,credentials};
}

export function mtServiceReady(service) {
  try { normalizeMtService(service); return true; } catch { return false; }
}

/**
 * 设置页提交的草稿：密钥类字段留空表示「沿用已保存的值」（设置页不回显密钥）。返回合并后的 {providerId, credentials}，
 * 不做必填校验；保存与检查连接再各自 normalizeMtService。
 */
export function mergeMtCredentials(draft,savedRows) {
  const provider=getMtProvider(draft?.providerId);
  if (!provider) throw new Error(M('不支持的机器翻译服务。','Unsupported machine-translation service.'));
  const source=draft.credentials&&typeof draft.credentials==='object'&&!Array.isArray(draft.credentials)?draft.credentials:{};
  const saved=(Array.isArray(savedRows)?savedRows:[]).find(row=>row?.providerId===provider.id)?.credentials||{};
  // 自建端点换域名时不能把旧令牌带给新站点，必须重新输入或先删除旧凭据。
  if (provider.id==='deeplx' && saved.token && saved.endpoint && typeof source.endpoint==='string' && source.endpoint.trim() && !source.token?.trim()
    && new URL(endpointUrl(source.endpoint.trim())).origin!==new URL(saved.endpoint).origin) throw new Error(M('更换 DeepLX 接口域名时，请重新填写令牌或先删除旧凭据。','Enter the token again or delete the old credentials before changing the DeepLX endpoint origin.'));
  const credentials={};
  for (const field of provider.fields) {
    const value=typeof source[field.key]==='string'?source[field.key].trim():'';
    if (value) credentials[field.key]=value;
    else if (field.type==='secret' && typeof saved[field.key]==='string' && saved[field.key]) credentials[field.key]=saved[field.key];
  }
  return {providerId:provider.id,credentials};
}

/** 一种服务实际要访问的源（权限核对用）；本机服务没有网络请求。 */
export function mtServiceOrigins(service) {
  const provider=getMtProvider(service?.providerId);
  if (!provider || provider.kind==='local') return [];
  const credentials=service.credentials||{};
  const origin=value=>new URL(value).origin;
  switch (provider.id) {
    case 'deepl': return [origin(String(credentials.apiKey||'').endsWith(':fx')?MT_ENDPOINTS.deeplFree:MT_ENDPOINTS.deeplPro)];
    case 'google-cloud': return [origin(MT_ENDPOINTS.googleCloud)];
    case 'azure': return [origin(MT_ENDPOINTS.azure)];
    case 'tencent': return [origin(MT_ENDPOINTS.tencent)];
    case 'alibaba': return [origin(alibabaEndpoint(credentials.region))];
    case 'baidu': return [origin(MT_ENDPOINTS.baidu)];
    case 'volcengine': return [origin(MT_ENDPOINTS.volcengine)];
    case 'youdao': return [origin(MT_ENDPOINTS.youdao)];
    case 'niutrans': return [origin(MT_ENDPOINTS.niutrans)];
    case 'mymemory': return [origin(MT_ENDPOINTS.mymemory)];
    case 'google-web': return [origin(MT_ENDPOINTS.googleWeb)];
    case 'microsoft-edge': return [origin(MT_ENDPOINTS.microsoftEdge)];
    case 'deeplx': return credentials.endpoint?[origin(credentials.endpoint)]:[];
    default: return [];
  }
}

export function alibabaEndpoint(region) {
  return MT_ENDPOINTS.alibaba.replace('{region}',['cn-hangzhou','ap-southeast-1'].includes(region)?region:'cn-hangzhou');
}

/** 同一服务的请求按每秒上限间隔起跑；百度高级版为每秒 10 次。 */
export function mtRequestInterval(service) {
  const provider=getMtProvider(service?.providerId);
  if (!provider) return 0;
  const qps=provider.id==='baidu'&&service.credentials?.plan==='advanced'?10:provider.qps;
  return qps?Math.ceil(1000/qps)+50:0;
}
export function mtConcurrency(service) {
  const provider=getMtProvider(service?.providerId);
  if (!provider) return 1;
  return provider.id==='baidu'&&service.credentials?.plan==='advanced'?3:provider.concurrency;
}

/** 存量 mtServices：每种服务至多一条，丢弃无法识别的行（不打印凭据）。 */
export function normalizeMtServices(rows,{strict=false}={}) {
  if (rows===undefined) return [];
  if (!Array.isArray(rows)) { if (strict) throw new Error(M('机器翻译服务必须是数组。','Machine-translation services must be an array.')); return []; }
  if (strict && rows.length>MT_PROVIDERS.length) throw new Error(M('机器翻译服务数量超出上限。','Too many machine-translation services.'));
  const seen=new Set(),result=[];
  for (const row of rows) {
    let service;
    try { service=normalizeMtService(row,{strict}); }
    catch (error) { if (strict) throw error; continue; }
    if (seen.has(service.providerId)) { if (strict) throw new Error(M('同一种机器翻译服务只能保存一份。','Each machine-translation service can be saved only once.')); continue; }
    seen.add(service.providerId);result.push(service);
  }
  return result;
}

/** 场景可以选的引擎：免密钥服务随时可选，要密钥的服务必须已保存且必填项齐全。 */
export function mtEngineAvailable(services,providerId) {
  const provider=getMtProvider(providerId);
  if (!provider) return false;
  if (mtKeyless(provider)) return true;
  return (services||[]).some(service=>service.providerId===providerId&&mtServiceReady(service));
}

/** 场景路由：每个场景为空串（跟随大模型）或一个可用的机翻服务；失效引用回落为空串。 */
export function normalizeTranslationEngines(value,services,{strict=false}={}) {
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  if (strict) {
    if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error(M('无效的翻译引擎设置。','Invalid translation-engine settings.'));
    for (const [scene,id] of Object.entries(value)) {
      if (!MT_SCENES.includes(scene)) throw new Error(M('翻译引擎包含未知场景。','Translation engines contain an unknown scene.'));
      if (typeof id!=='string') throw new Error(M('无效的翻译引擎设置。','Invalid translation-engine settings.'));
      if (id && !mtEngineAvailable(services,id)) throw new Error(M('翻译引擎必须引用已配置的机器翻译服务。','A translation engine must reference a configured machine-translation service.'));
    }
  }
  return Object.fromEntries(MT_SCENES.map(scene=>{const id=typeof source[scene]==='string'?source[scene]:'';return [scene,id&&mtEngineAvailable(services,id)?id:''];}));
}

/** 解析某场景实际使用的机翻服务；跟随大模型时返回 null。 */
export function mtEngineFor(settings,scene) {
  const id=settings?.translationEngines?.[scene];
  if (!id || !mtEngineAvailable(settings.mtServices,id)) return null;
  const saved=(settings.mtServices||[]).find(service=>service.providerId===id);
  return saved?normalizeMtService(saved,{strict:false}):{providerId:id,credentials:{}};
}

/** 缓存与会话用的引擎身份：服务种类与区域等非机密选项，不含任何密钥。 */
export function mtEngineIdentity(settings,scene) {
  const engine=mtEngineFor(settings,scene);
  if (!engine) return null;
  const {region='',plan='',endpoint=''}=engine.credentials;
  return [engine.providerId,region,plan,endpoint];
}
