/**
 * @file extension/mt-transport.mjs
 * 文件职责：机器翻译传输层——把一批英文原文按各家协议译成简体中文，统一批量拆分、签名、错误归类与结果校验。
 * 主要内容：mtTranslate（按服务的条数/字符上限分包，逐包请求后按原顺序拼回）；各家请求：DeepL、Google Cloud、
 *   Azure、腾讯云 TC3、阿里云 RPC、百度 MD5、火山引擎 HMAC、有道 v3、小牛、MyMemory、Google 网页、微软 Edge、
 *   DeepLX、Chrome 本机（由调用方注入）；WebCrypto 签名原语与自带 MD5；行内代码占位 ⟦n⟧ 在支持 HTML/XML 的服务里
 *   包成不翻译标记，回来后规整；mtTranslationIssue 复用整页翻译的译文校验。
 * 模块边界：领域层，可 Node 安全 import（fetch 与本机翻译由调用方注入，默认用全局 fetch）；不存密钥、不写诊断，
 *   错误只带错误码与 HTTP 状态，不回显厂商原始错误消息（可能带回请求参数）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {MT_ENDPOINTS,alibabaEndpoint,getMtProvider} from './mt-providers.mjs';
import {translationTextCode} from './gloss.mjs';

const M=(zh,en)=>globalThis.RoamCatI18n?.lang?.()==='en'?en:zh;
const RESPONSE_LIMIT=2*1024*1024;
const encoder=new TextEncoder();
const MARKER=/⟦(\d{1,4})⟧/g;

// ---------- 错误 ----------
function mtError(provider,code,httpStatus) {
  const name=provider?.name||M('机器翻译','Machine translation');
  const reason={
    AUTH:M('拒绝访问，请检查密钥、区域与账户状态。','access denied; check the key, region, and account status.'),
    QUOTA:M('额度已用完或账户欠费。','quota used up or the account is in arrears.'),
    RATE_LIMIT:M('请求过快或被限流，请稍后重试。','too many requests or rate-limited; retry later.'),
    NETWORK:M('无法连接，请检查网络。','cannot connect; check the network.'),
    OUTPUT_INVALID:M('返回的数据无效。','returned invalid data.'),
    NOT_READY:M('当前浏览器不能使用本机翻译：需要 Chrome 138 以上桌面版，并先在设置页准备语言包。','on-device translation is unavailable: it needs desktop Chrome 138+ with the language pack prepared in Settings.'),
    TIMEOUT:M('请求超时。','the request timed out.'),
    HTTP:M(`返回 HTTP ${httpStatus||'错误'}。`,`returned HTTP ${httpStatus||'error'}.`),
  }[code]||M('请求失败。','the request failed.');
  const error=new Error(`${name}${M('：',': ')}${reason}`);
  error.code=code;
  if (httpStatus) error.detail={httpStatus};
  return error;
}
function statusCode(status) {
  if (status===401||status===403) return 'AUTH';
  if (status===402||status===456) return 'QUOTA';
  if (status===429) return 'RATE_LIMIT';
  return 'HTTP';
}

// ---------- 签名原语 ----------
const bytes=value=>typeof value==='string'?encoder.encode(value):new Uint8Array(value);
export function toHex(buffer) { return Array.from(new Uint8Array(buffer),byte=>byte.toString(16).padStart(2,'0')).join(''); }
export function toBase64(buffer) { let text='';for (const byte of new Uint8Array(buffer)) text+=String.fromCharCode(byte);return btoa(text); }
export async function sha256Hex(message) { return toHex(await crypto.subtle.digest('SHA-256',bytes(message))); }
async function hmac(hash,key,message) {
  const cryptoKey=await crypto.subtle.importKey('raw',bytes(key),{name:'HMAC',hash},false,['sign']);
  return crypto.subtle.sign('HMAC',cryptoKey,bytes(message));
}
export const hmacSha256=(key,message)=>hmac('SHA-256',key,message);
export const hmacSha1=(key,message)=>hmac('SHA-1',key,message);
/** RFC 3986 百分号编码（阿里云、火山引擎的规范查询串要求）。 */
export function percentEncode(value) { return encodeURIComponent(value).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase()); }
function canonicalQuery(params) { return Object.keys(params).sort().map(key=>`${percentEncode(key)}=${percentEncode(params[key])}`).join('&'); }

// 百度签名要 MD5，WebCrypto 不提供，按 RFC 1321 自行实现（输入按 UTF-8 编码）。
const MD5_SHIFT=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
const MD5_TABLE=Array.from({length:64},(_,index)=>Math.floor(Math.abs(Math.sin(index+1))*0x100000000)>>>0);
export function md5Hex(input) {
  const data=encoder.encode(input),length=data.length,blocks=new Uint32Array((((length+8)>>>6)+1)*16);
  for (let index=0;index<length;index++) blocks[index>>2]|=data[index]<<((index%4)*8);
  blocks[length>>2]|=0x80<<((length%4)*8);
  blocks[blocks.length-2]=(length*8)>>>0;blocks[blocks.length-1]=Math.floor(length/0x20000000);
  let a=0x67452301,b=0xefcdab89,c=0x98badcfe,d=0x10325476;
  for (let offset=0;offset<blocks.length;offset+=16) {
    let A=a,B=b,C=c,D=d;
    for (let index=0;index<64;index++) {
      let f,g;
      if (index<16) { f=(B&C)|(~B&D);g=index; }
      else if (index<32) { f=(D&B)|(~D&C);g=(5*index+1)%16; }
      else if (index<48) { f=B^C^D;g=(3*index+5)%16; }
      else { f=C^(B|~D);g=(7*index)%16; }
      f=(f+A+MD5_TABLE[index]+blocks[offset+g])>>>0;
      A=D;D=C;C=B;B=(B+((f<<MD5_SHIFT[index])|(f>>>(32-MD5_SHIFT[index]))))>>>0;
    }
    a=(a+A)>>>0;b=(b+B)>>>0;c=(c+C)>>>0;d=(d+D)>>>0;
  }
  return [a,b,c,d].map(word=>[0,8,16,24].map(shift=>((word>>>shift)&255).toString(16).padStart(2,'0')).join('')).join('');
}

// ---------- 文本处理 ----------
const escapeHtml=text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
/** 只解码一次实体，原文里的字面量 &lt; 经过转义往返后仍是 &lt;。 */
export function decodeEntities(text) {
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(entity,code)=>{
    if (!code.startsWith('#')) return named[code.toLowerCase()];
    const value=code[1].toLowerCase()==='x'?parseInt(code.slice(2),16):Number(code.slice(1));
    return value>0&&value<=0x10ffff&&!(value>=0xd800&&value<=0xdfff)?String.fromCodePoint(value):entity;
  });
}
const hasMarkers=text=>/⟦\d{1,4}⟧/.test(text);
// HTML 服务：⟦n⟧ 包进不翻译标记；回来先拆标记再解码实体。
const toProtectedHtml=text=>escapeHtml(text).replace(MARKER,(_m,n)=>`<span class="notranslate" translate="no">⟦${n}⟧</span>`);
const fromProtectedHtml=html=>decodeEntities(html.replace(/<span\b[^>]*>\s*(⟦\d{1,4}⟧)\s*<\/span>/gi,'$1').replace(/<\/?span\b[^>]*>/gi,''));
// DeepL XML 模式：⟦n⟧ 换成自闭合标签 <m i="n"/>。
const toDeeplXml=text=>escapeHtml(text).replace(MARKER,(_m,n)=>`<m i="${n}"/>`);
const fromDeeplXml=xml=>decodeEntities(xml.replace(/<m\s+i="(\d{1,4})"\s*\/>(?:<\/m>)?/g,'⟦$1⟧').replace(/<m\s+i="(\d{1,4})"\s*><\/m>/g,'⟦$1⟧'));
/** 机翻常把占位改写成方括号或拆开的 ⟦ 1 ⟧；规整回 ⟦n⟧，丢失或重复的标记必须触发回退。 */
export function normalizeMarkers(translation) {
  return translation.replace(/⟦\s*(\d{1,4})\s*⟧/g,'⟦$1⟧').replace(/\[\[\s*(\d{1,4})\s*\]\]/g,'⟦$1⟧');
}

/** 机翻译文的逐条校验：与整页翻译同一套规则（必须含汉字，短标签可原样保留）。 */
export function mtTranslationIssue(sourceText,translation) {
  if (typeof translation!=='string') return 'TRANSLATION_TYPE';
  const issue=translationTextCode(translation,sourceText);
  if (issue) return issue;
  const markers=text=>[...text.matchAll(MARKER)].map(match=>match[1]).sort().join(',');
  return markers(sourceText)===markers(translation)?null:'OUTPUT_INVALID';
}

/** 按条数与字符上限分包；单条超过上限时独占一包（RoamCat 的单条原文本身不超过 4000 字）。 */
export function chunkTexts(texts,{items,chars}) {
  const chunks=[];let current=[],size=0;
  texts.forEach((text,index)=>{
    if (current.length && (current.length>=items || size+text.length>chars)) { chunks.push(current);current=[];size=0; }
    current.push(index);size+=text.length;
  });
  if (current.length) chunks.push(current);
  return chunks;
}
// MyMemory 单次最多 500 字节：按句末标点或空白切开，码点不截断。
export function splitByBytes(text,limit=500) {
  if (!Number.isInteger(limit) || limit<16) throw new RangeError('Invalid byte limit');
  const pieces=[];let rest=text;
  while (rest) {
    let used=0,end=0,boundary=0;
    for (const char of rest) {
      const size=encoder.encode(char).length;
      if (used+size>limit) break;
      used+=size;end+=char.length;
      if (/[\s.!?;,]/.test(char)) boundary=end;
    }
    let cut=end<rest.length&&boundary>0?boundary:end;
    // 不把 ⟦n⟧ 切成两个请求，否则译文无法恢复行内代码。
    for (const marker of rest.matchAll(MARKER)) if (marker.index<cut && marker.index+marker[0].length>cut) {cut=marker.index;break;}
    pieces.push(rest.slice(0,cut));rest=rest.slice(cut);
  }
  return pieces;
}

// ---------- 网络 ----------
async function call(provider,fetchImpl,url,init,{signal}) {
  let response;
  try { response=await fetchImpl(url,{...init,signal,credentials:'omit',redirect:'error',cache:'no-store'}); }
  catch (error) { if (error?.name==='AbortError') throw error; throw mtError(provider,'NETWORK'); }
  if (!response.ok) { try { await response.body?.cancel(); } catch {} throw mtError(provider,statusCode(response.status),response.status); }
  let text='';
  try {
    const reader=response.body?.getReader();
    if (!reader) text=await response.text();
    else {
      const decoder=new TextDecoder();let size=0;
      try {
        for (;;) {
          const {value,done}=await reader.read();if(done)break;
          size+=value.byteLength;
          if(size>RESPONSE_LIMIT){await reader.cancel();throw mtError(provider,'OUTPUT_INVALID');}
          text+=decoder.decode(value,{stream:true});
        }
        text+=decoder.decode();
      } finally {reader.releaseLock();}
    }
  } catch(error) {
    if(error?.name==='AbortError' || error?.code==='OUTPUT_INVALID')throw error;
    throw mtError(provider,'NETWORK');
  }
  if (text.length>RESPONSE_LIMIT) throw mtError(provider,'OUTPUT_INVALID');
  return {text,response};
}
async function callJson(provider,fetchImpl,url,init,options) {
  const {text}=await call(provider,fetchImpl,url,init,options);
  // 网页接口被限流时常返回 HTML 验证页，按限流处理。
  if (/^\s*</.test(text)) throw mtError(provider,'RATE_LIMIT');
  try { return JSON.parse(text); } catch { throw mtError(provider,'OUTPUT_INVALID'); }
}
const requireStrings=(provider,values,count)=>{
  if (!Array.isArray(values) || values.length!==count || values.some(value=>typeof value!=='string')) throw mtError(provider,'OUTPUT_INVALID');
  return values;
};
const formBody=params=>new URLSearchParams(params).toString();
const FORM='application/x-www-form-urlencoded;charset=UTF-8';
const JSON_TYPE='application/json; charset=utf-8';

// ---------- 各家协议（一包原文 → 一包译文） ----------
const adapters={
  async deepl(provider,service,texts,ctx) {
    const key=service.credentials.apiKey,xml=texts.some(hasMarkers);
    const body={text:xml?texts.map(toDeeplXml):texts,source_lang:'EN',target_lang:'ZH-HANS',preserve_formatting:true,...(xml?{tag_handling:'xml'}:{}),...(texts.length===1&&ctx.context?{context:ctx.context}:{})};
    const value=await callJson(provider,ctx.fetch,key.endsWith(':fx')?MT_ENDPOINTS.deeplFree:MT_ENDPOINTS.deeplPro,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'DeepL-Auth-Key '+key},body:JSON.stringify(body)},ctx);
    const out=requireStrings(provider,value?.translations?.map(item=>item?.text),texts.length);
    return xml?out.map(fromDeeplXml):out;
  },
  async 'google-cloud'(provider,service,texts,ctx) {
    const html=texts.some(hasMarkers);
    const value=await callJson(provider,ctx.fetch,MT_ENDPOINTS.googleCloud,{method:'POST',headers:{'Content-Type':JSON_TYPE,'x-goog-api-key':service.credentials.apiKey},body:JSON.stringify({q:html?texts.map(toProtectedHtml):texts,source:'en',target:'zh-CN',format:html?'html':'text'})},ctx);
    const out=requireStrings(provider,value?.data?.translations?.map(item=>item?.translatedText),texts.length);
    return html?out.map(fromProtectedHtml):out;
  },
  async azure(provider,service,texts,ctx) {
    const html=texts.some(hasMarkers),region=service.credentials.region||'global',url=new URL(MT_ENDPOINTS.azure);
    url.search=new URLSearchParams({'api-version':'3.0',from:'en',to:'zh-Hans',...(html?{textType:'html'}:{})}).toString();
    const value=await callJson(provider,ctx.fetch,url.href,{method:'POST',headers:{'Content-Type':JSON_TYPE,'Ocp-Apim-Subscription-Key':service.credentials.apiKey,...(region==='global'?{}:{'Ocp-Apim-Subscription-Region':region})},body:JSON.stringify((html?texts.map(toProtectedHtml):texts).map(Text=>({Text})))},ctx);
    const out=requireStrings(provider,Array.isArray(value)?value.map(item=>item?.translations?.length===1?item.translations[0]?.text:undefined):undefined,texts.length);
    return html?out.map(fromProtectedHtml):out;
  },
  async tencent(provider,service,texts,ctx) {
    const {secretId,secretKey,region='ap-beijing'}=service.credentials,timestamp=Math.floor(ctx.now()/1000),date=new Date(timestamp*1000).toISOString().slice(0,10);
    const host=new URL(MT_ENDPOINTS.tencent).host,payload=JSON.stringify({Source:'en',Target:'zh',ProjectId:0,SourceTextList:texts});
    const authorization=await tencentAuthorization({secretId,secretKey,host,payload,timestamp,date});
    const value=await callJson(provider,ctx.fetch,MT_ENDPOINTS.tencent,{method:'POST',headers:{'Content-Type':JSON_TYPE,'Authorization':authorization,'X-TC-Action':'TextTranslateBatch','X-TC-Version':'2018-03-21','X-TC-Region':region,'X-TC-Timestamp':String(timestamp)},body:payload},ctx);
    const error=value?.Response?.Error?.Code;
    if (error) throw mtError(provider,/^AuthFailure|UnauthorizedOperation|UserNotRegistered|ServiceIsolate/.test(error)?'AUTH':/NoFreeAmount|Arrear|Balance/.test(error)?'QUOTA':/LimitExceeded/.test(error)?'RATE_LIMIT':'HTTP');
    return requireStrings(provider,value?.Response?.TargetTextList,texts.length);
  },
  async alibaba(provider,service,texts,ctx) {
    const {accessKeyId,accessKeySecret,region}=service.credentials,url=alibabaEndpoint(region);
    const form=await alibabaSignedForm({accessKeyId,accessKeySecret,nonce:ctx.uuid(),timestamp:new Date(ctx.now()).toISOString().replace(/\.\d{3}Z$/,'Z'),params:{Action:'TranslateGeneral',FormatType:'text',Scene:'general',SourceLanguage:'en',TargetLanguage:'zh',SourceText:texts[0]}});
    const value=await callJson(provider,ctx.fetch,url,{method:'POST',headers:{'Content-Type':FORM},body:formBody(form)},ctx);
    const code=String(value?.Code??'');
    if (code!=='200') throw mtError(provider,/AccessKey|Signature|Forbidden|NoPermission|10009|10011/.test(code)?'AUTH':/10010|10013|Arrear/.test(code)?'QUOTA':/Throttling/.test(code)?'RATE_LIMIT':'HTTP');
    return requireStrings(provider,[value?.Data?.Translated],1);
  },
  async baidu(provider,service,texts,ctx) {
    const {appId,secretKey}=service.credentials;
    // 多行原文百度按行逐段返回：没有换行的一包用换行拼成一次请求，否则逐条请求再按行拼回。
    const joined=texts.length>1&&!texts.some(text=>/[\r\n]/.test(text))&&encoder.encode(texts.join('\n')).length<=6000;
    const groups=joined?[texts.join('\n')]:texts;
    const results=[];
    for (const [index,query] of groups.entries()) {
      if (index) await ctx.pace();
      const salt=String(ctx.now())+String(index);
      const value=await callJson(provider,ctx.fetch,MT_ENDPOINTS.baidu,{method:'POST',headers:{'Content-Type':FORM},body:formBody({q:query,from:'en',to:'zh',appid:appId,salt,sign:md5Hex(appId+query+salt+secretKey)})},ctx);
      const code=value?.error_code===undefined?'52000':String(value.error_code);
      if (code!=='52000') throw mtError(provider,['52003','54001','58000','58002','90107'].includes(code)?'AUTH':code==='54004'?'QUOTA':['54003','54005'].includes(code)?'RATE_LIMIT':'HTTP');
      const lines=value?.trans_result?.map(item=>item?.dst);
      if (!Array.isArray(lines) || lines.some(line=>typeof line!=='string')) throw mtError(provider,'OUTPUT_INVALID');
      if (joined) results.push(...requireStrings(provider,lines,texts.length));
      else results.push(lines.join('\n'));
    }
    return results;
  },
  async volcengine(provider,service,texts,ctx) {
    const {accessKeyId,secretAccessKey,region='cn-north-1'}=service.credentials,url=new URL(MT_ENDPOINTS.volcengine),query={Action:'TranslateText',Version:'2020-06-01'};
    url.search=canonicalQuery(query);
    const body=JSON.stringify({SourceLanguage:'en',TargetLanguage:'zh',TextList:texts});
    const headers=await volcengineHeaders({accessKeyId,secretAccessKey,region,host:url.host,query,body,now:new Date(ctx.now())});
    const value=await callJson(provider,ctx.fetch,url.href,{method:'POST',headers,body},ctx);
    const error=value?.ResponseMetadata?.Error;
    if (error) { const code=String(error.Code||''); throw mtError(provider,/Signature|AccessKey|Auth|Denied|Forbidden/i.test(code)?'AUTH':/Quota|Balance|Arrear|Overdue/i.test(code)?'QUOTA':/Limit|Throttl|Flow/i.test(code)?'RATE_LIMIT':'HTTP'); }
    return requireStrings(provider,value?.TranslationList?.map(item=>item?.Translation),texts.length);
  },
  async youdao(provider,service,texts,ctx) {
    const {appKey,appSecret}=service.credentials,q=texts[0],salt=ctx.uuid(),curtime=String(Math.floor(ctx.now()/1000));
    const value=await callJson(provider,ctx.fetch,MT_ENDPOINTS.youdao,{method:'POST',headers:{'Content-Type':FORM},body:formBody({q,from:'en',to:'zh-CHS',appKey,salt,sign:await sha256Hex(appKey+youdaoInput(q)+salt+curtime+appSecret),signType:'v3',curtime})},ctx);
    const code=String(value?.errorCode??'');
    if (code!=='0') throw mtError(provider,['108','110','111','202','206'].includes(code)?'AUTH':code==='401'?'QUOTA':['411','412'].includes(code)?'RATE_LIMIT':'HTTP');
    if (!Array.isArray(value.translation) || !value.translation.length || value.translation.some(item=>typeof item!=='string')) throw mtError(provider,'OUTPUT_INVALID');
    return [value.translation.join('\n')];
  },
  async niutrans(provider,service,texts,ctx) {
    const value=await callJson(provider,ctx.fetch,MT_ENDPOINTS.niutrans,{method:'POST',headers:{'Content-Type':FORM},body:formBody({from:'en',to:'zh',apikey:service.credentials.apiKey,src_text:texts[0]})},ctx);
    if (value?.error_code!==undefined) { const code=String(value.error_code); throw mtError(provider,['13001','13002','13004','13005'].includes(code)?'AUTH':['10001','10002'].includes(code)?'RATE_LIMIT':'HTTP'); }
    return requireStrings(provider,[value?.tgt_text],1);
  },
  async mymemory(provider,service,texts,ctx) {
    let translated='';
    for (const [index,piece] of splitByBytes(texts[0]).entries()) {
      const content=piece.trim();
      if (!content) { translated+=piece;continue; }
      if (index) await ctx.pace();
      const url=new URL(MT_ENDPOINTS.mymemory);
      url.search=new URLSearchParams({q:content,langpair:'en|zh-CN',...(service.credentials.email?{de:service.credentials.email}:{})}).toString();
      const value=await callJson(provider,ctx.fetch,url.href,{method:'GET',headers:{Accept:'application/json'}},ctx);
      const status=Number(value?.responseStatus),text=value?.responseData?.translatedText;
      if (value?.quotaFinished===true || /^MYMEMORY WARNING/i.test(String(text||''))) throw mtError(provider,'QUOTA');
      if (status!==200) throw mtError(provider,status===429?'RATE_LIMIT':status===403?'AUTH':'HTTP',Number.isInteger(status)?status:undefined);
      if (typeof text!=='string' || !text.trim()) throw mtError(provider,'OUTPUT_INVALID');
      translated+=(translated&&!/\s$/.test(translated)?' ':'')+text.trim();
    }
    return [translated];
  },
  async 'google-web'(provider,service,texts,ctx) {
    const url=new URL(MT_ENDPOINTS.googleWeb),body=new URLSearchParams();
    url.search=new URLSearchParams({client:'gtx',sl:'en',tl:'zh-CN',dt:'t'}).toString();
    for (const text of texts) body.append('q',text);
    const value=await callJson(provider,ctx.fetch,url.href,{method:'POST',headers:{'Content-Type':FORM},body:body.toString()},ctx);
    const list=typeof value==='string'?[value]:Array.isArray(value)?value.map(item=>Array.isArray(item)?item[0]:item):undefined;
    return requireStrings(provider,list,texts.length);
  },
  async 'microsoft-edge'(provider,service,texts,ctx) {
    // 该接口总按 HTML 处理文本：纯文本先转义，回来再解码。
    const url=new URL(MT_ENDPOINTS.microsoftEdge);
    url.search=new URLSearchParams({from:'en',to:'zh-Hans',isEnterpriseClient:'false'}).toString();
    const value=await callJson(provider,ctx.fetch,url.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(texts.map(toProtectedHtml))},ctx);
    const out=requireStrings(provider,Array.isArray(value)?value.map(item=>item?.translations?.length===1?item.translations[0]?.text:undefined):undefined,texts.length);
    return out.map(fromProtectedHtml);
  },
  async deeplx(provider,service,texts,ctx) {
    const {endpoint,token}=service.credentials;
    const value=await callJson(provider,ctx.fetch,endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({text:texts[0],source_lang:'EN',target_lang:'ZH'})},ctx);
    if (value?.code!==undefined && Number(value.code)!==200) throw mtError(provider,statusCode(Number(value.code)),Number(value.code)||undefined);
    return requireStrings(provider,[value?.data],1);
  },
  async chrome(provider,service,texts,ctx) {
    if (typeof ctx.local!=='function') throw mtError(provider,'NOT_READY');
    let result;
    try { result=await ctx.local(texts,{signal:ctx.signal}); }
    catch (error) { if (error?.name==='AbortError') throw error; throw mtError(provider,error?.code==='NOT_READY'?'NOT_READY':'OUTPUT_INVALID'); }
    return requireStrings(provider,result,texts.length);
  },
};

/** 有道 v3 签名的 input：原文超过 20 个字符时取前 10 + 长度 + 后 10（按码点计）。 */
export function youdaoInput(text) {
  const chars=Array.from(text);
  return chars.length<=20?text:chars.slice(0,10).join('')+chars.length+chars.slice(-10).join('');
}

/** 腾讯云 API 3.0 的 TC3-HMAC-SHA256 签名，只签 content-type 与 host 两个头。 */
export async function tencentAuthorization({secretId,secretKey,host,payload,timestamp,date,service='tmt'}) {
  const canonicalRequest=['POST','/','',`content-type:${JSON_TYPE}\nhost:${host}\n`,'content-type;host',await sha256Hex(payload)].join('\n');
  const scope=`${date}/${service}/tc3_request`;
  const stringToSign=['TC3-HMAC-SHA256',String(timestamp),scope,await sha256Hex(canonicalRequest)].join('\n');
  const signing=await hmacSha256(await hmacSha256(await hmacSha256('TC3'+secretKey,date),service),'tc3_request');
  return `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=content-type;host, Signature=${toHex(await hmacSha256(signing,stringToSign))}`;
}

/** 阿里云 RPC 风格签名 v1（HMAC-SHA1）：返回带 Signature 的完整表单参数。 */
export async function alibabaSignedForm({accessKeyId,accessKeySecret,params,nonce,timestamp}) {
  const all={...params,Format:'JSON',Version:'2018-10-12',AccessKeyId:accessKeyId,SignatureMethod:'HMAC-SHA1',SignatureVersion:'1.0',SignatureNonce:nonce,Timestamp:timestamp};
  const stringToSign=`POST&${percentEncode('/')}&${percentEncode(canonicalQuery(all))}`;
  return {...all,Signature:toBase64(await hmacSha1(accessKeySecret+'&',stringToSign))};
}

/** 火山引擎 OpenAPI 签名：返回 Content-Type、X-Date、X-Content-Sha256 与 Authorization 四个请求头。 */
export async function volcengineHeaders({accessKeyId,secretAccessKey,region,host,query,body,now,service='translate'}) {
  const xDate=now.toISOString().replace(/[-:]|\.\d{3}/g,''),shortDate=xDate.slice(0,8),payloadHash=await sha256Hex(body);
  const signedHeaders='content-type;host;x-content-sha256;x-date';
  const canonicalHeaders=`content-type:${JSON_TYPE}\nhost:${host}\nx-content-sha256:${payloadHash}\nx-date:${xDate}\n`;
  const canonicalRequest=['POST','/',canonicalQuery(query),canonicalHeaders,signedHeaders,payloadHash].join('\n');
  const scope=`${shortDate}/${region}/${service}/request`;
  const stringToSign=['HMAC-SHA256',xDate,scope,await sha256Hex(canonicalRequest)].join('\n');
  const signing=await hmacSha256(await hmacSha256(await hmacSha256(await hmacSha256(secretAccessKey,shortDate),region),service),'request');
  return {'Content-Type':JSON_TYPE,'X-Date':xDate,'X-Content-Sha256':payloadHash,'Authorization':`HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${toHex(await hmacSha256(signing,stringToSign))}`};
}

/**
 * 把一批原文译成简体中文，返回与输入同序、同长的译文数组（已去首尾空白、规整 ⟦n⟧）。
 * options：signal、fetch（默认全局 fetch）、local（Chrome 本机翻译实现）、context（单条请求时 DeepL 可用的上下文）、
 *   pace（同一服务两次请求之间的等待，调用方按 qps 实现）、now、uuid（测试注入）。
 */
export async function mtTranslate(service,texts,options={}) {
  const provider=getMtProvider(service?.providerId);
  if (!provider) throw mtError(null,'OUTPUT_INVALID');
  if (!Array.isArray(texts) || !texts.length || texts.some(text=>typeof text!=='string' || !text.trim())) throw mtError(provider,'OUTPUT_INVALID');
  const adapter=adapters[provider.id];
  const ctx={signal:options.signal,fetch:options.fetch||((...args)=>globalThis.fetch(...args)),local:options.local,context:options.context||'',pace:options.pace||(async()=>{}),now:options.now||Date.now,uuid:options.uuid||(()=>crypto.randomUUID())};
  // 百度按 UTF-8 字节计量，单条原文也可能超过 6000 字节；拆开后按原条目重新合并。
  const inputs=texts.flatMap((text,at)=>(provider.id==='baidu'?splitByBytes(text,5800):[text]).map(piece=>({text:piece,at})));
  const results=Array.from({length:texts.length},()=>[]);
  for (const [index,chunk] of chunkTexts(inputs.map(item=>item.text),provider.batch).entries()) {
    if (options.signal?.aborted) throw options.signal.reason||new DOMException('Aborted','AbortError');
    if (index) await ctx.pace();
    const out=await adapter(provider,service,chunk.map(at=>inputs[at].text),ctx);
    chunk.forEach((at,position)=>{results[inputs[at].at].push(normalizeMarkers(out[position]).trim());});
  }
  return results.map(pieces=>pieces.join('\n'));
}
