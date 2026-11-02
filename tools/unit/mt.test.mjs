/**
 * @file tools/unit/mt.test.mjs
 * 文件职责：机翻配置、14 家传输协议、签名与凭据边界的回归测试；全部使用假网络，不消耗真实额度。
 * 主要内容：设置归一化与场景引用、删除凭据与缓存失效、HTML/XML 占位保护、字节拆包、错误脱敏、签名独立核对。
 * 模块边界：只 import 纯模块；签名以 Node crypto 为独立对照，不启动浏览器。
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {MT_PROVIDERS,MT_SCENES,normalizeMtService,normalizeMtServices,mergeMtCredentials,normalizeTranslationEngines,mtEngineFor,mtServiceOrigins,mtRequestInterval} from '../../roamcat-0.0.1/extension/mt-providers.mjs';
import {mtTranslate,mtTranslationIssue,splitByBytes,decodeEntities,md5Hex,tencentAuthorization,alibabaSignedForm,volcengineHeaders,youdaoInput} from '../../roamcat-0.0.1/extension/mt-transport.mjs';
import {normalizeSettings} from '../../roamcat-0.0.1/extension/shared.js';
import {validatePatch,settingsPatchEffects,CONTENT_ALLOWED_TYPES} from '../../roamcat-0.0.1/extension/message-protocol.js';
import {diagnosticError} from '../../roamcat-0.0.1/extension/diagnostics.mjs';

const source='The database uses an index to find records quickly.';
const translation='数据库用索引快速查找记录。';
const fixtureService=id=>normalizeMtService({providerId:id,credentials:Object.fromEntries(MT_PROVIDERS.find(p=>p.id===id).fields.filter(f=>f.required&&f.type!=='select').map(f=>[f.key,f.type==='url'?'http://127.0.0.1:1234/translate':'fixture-secret']))});
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});

test('14 种机翻与五个场景独立于大模型，凭据严格校验',()=>{
  assert.equal(MT_PROVIDERS.length,14);assert.equal(new Set(MT_PROVIDERS.map(p=>p.id)).size,14);
  assert.deepEqual(MT_SCENES,['page','video','liveChat','reader','passage']);
  assert.deepEqual(normalizeSettings().translationEngines,Object.fromEntries(MT_SCENES.map(s=>[s,''])));
  for(const provider of MT_PROVIDERS)assert.equal(fixtureService(provider.id).providerId,provider.id);
  for(const row of [{providerId:'unknown'},{providerId:'deepl',credentials:{}},{providerId:'deepl',credentials:{apiKey:'x\ny'}},{providerId:'chrome',credentials:{apiKey:'secret'}},{providerId:'chrome',extra:true}])assert.throws(()=>normalizeMtService(row));
  for(const endpoint of ['http://example.com/translate','https://user:pass@example.com/translate','https://example.com/translate?key=secret','file:///secret'])assert.throws(()=>normalizeMtService({providerId:'deeplx',credentials:{endpoint}}));
  assert.throws(()=>normalizeMtServices([fixtureService('deepl'),fixtureService('deepl')],{strict:true}));
  assert.equal(CONTENT_ALLOWED_TYPES.includes('MT_TEST'),false);
});

test('保存、删除与场景引用及缓存失效保持一致，空白密钥沿用旧值',()=>{
  const saved=fixtureService('deepl'),before=normalizeSettings({mtServices:[saved],translationEngines:{page:'deepl',video:'google-web'}});
  assert.equal(mergeMtCredentials({providerId:'deepl',credentials:{apiKey:''}},[saved]).credentials.apiKey,'fixture-secret');
  const patch=validatePatch({mtServices:[]},before);
  assert.equal(patch.translationEngines.page,'');assert.equal(patch.translationEngines.video,'google-web');
  assert.equal(settingsPatchEffects(before,patch).translationChanged,true);
  assert.equal(settingsPatchEffects(before,{mtFallback:false}).translationChanged,true);
  assert.equal(settingsPatchEffects(before,{mtServices:[saved]}).translationChanged,false);
  assert.throws(()=>validatePatch({translationEngines:{page:'azure'}},before));
  assert.throws(()=>validatePatch({translationEngines:{summary:'google-web'}},before));
  assert.throws(()=>validatePatch({mtFallback:'yes'},before));
  assert.equal(mtEngineFor(before,'page').providerId,'deepl');
  assert.equal(mtEngineFor(before,'summary'),null);
  assert.equal(normalizeTranslationEngines({page:'missing'},[]).page,'');
  assert.deepEqual(mtServiceOrigins(fixtureService('chrome')),[]);
  assert.ok(mtRequestInterval(fixtureService('baidu'))>=1000);
  const old=[{providerId:'deeplx',credentials:{endpoint:'https://old.example/translate',token:'private'}}];
  assert.throws(()=>mergeMtCredentials({providerId:'deeplx',credentials:{endpoint:'https://new.example/translate',token:''}},old));
  assert.equal(mergeMtCredentials({providerId:'deeplx',credentials:{endpoint:'https://old.example/v2',token:''}},old).credentials.token,'private');
});

const responses={
  deepl:{translations:[{text:translation}]},'google-cloud':{data:{translations:[{translatedText:translation}]}},azure:[{translations:[{text:translation}]}],
  tencent:{Response:{TargetTextList:[translation]}},alibaba:{Code:'200',Data:{Translated:translation}},baidu:{trans_result:[{dst:translation}]},
  volcengine:{TranslationList:[{Translation:translation}]},youdao:{errorCode:'0',translation:[translation]},niutrans:{tgt_text:translation},
  mymemory:{responseStatus:200,responseData:{translatedText:translation}},'google-web':[translation],'microsoft-edge':[{translations:[{text:translation}]}],deeplx:{code:200,data:translation},
};
for(const provider of MT_PROVIDERS)test(`${provider.id}：请求协议、密钥隔离与结果映射`,async()=>{
  let calls=0;
  const result=await mtTranslate(fixtureService(provider.id),[source],{now:()=>1700000000000,uuid:()=> 'fixture-nonce',local:async texts=>{assert.deepEqual(texts,[source]);calls++;return [translation];},fetch:async(url,init)=>{
    calls++;assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
    assert.equal(new URL(url).username,'');assert.equal(new URL(url).search.includes('fixture-secret'),false);
    if(provider.id==='deepl')assert.equal(init.headers.Authorization,'DeepL-Auth-Key fixture-secret');
    if(provider.id==='google-cloud')assert.equal(init.headers['x-goog-api-key'],'fixture-secret');
    if(provider.id==='tencent'){assert.match(init.headers.Authorization,/TC3-HMAC-SHA256/);assert.equal(init.headers['X-TC-Action'],'TextTranslateBatch');}
    if(provider.id==='volcengine')assert.match(init.headers.Authorization,/HMAC-SHA256/);
    if(provider.id==='alibaba')assert.ok(new URLSearchParams(init.body).get('Signature'));
    if(provider.id==='youdao')assert.equal(new URLSearchParams(init.body).get('signType'),'v3');
    return json(responses[provider.id]);
  }});
  assert.equal(calls,1);assert.deepEqual(result,[translation]);
});

test('逐条校验保留全部代码标记，丢失、重复、伪造或非中文正文必须回退',()=>{
  const original='Use ⟦0⟧ with ⟦1⟧ to read records.';
  assert.equal(mtTranslationIssue(original,'使用 ⟦1⟧ 和 ⟦0⟧ 读取记录。'),null);
  for(const text of ['使用 ⟦0⟧ 读取记录。','使用 ⟦0⟧、⟦0⟧、⟦1⟧ 读取记录。','使用 ⟦0⟧、⟦1⟧、⟦2⟧ 读取记录。'])assert.equal(mtTranslationIssue(original,text),'OUTPUT_INVALID');
  assert.equal(mtTranslationIssue(source,source),'TRANSLATION_NO_HAN');
  assert.equal(mtTranslationIssue('GitHub','GitHub'),null);
});

test('DeepL XML 与 HTML 服务保护代码标记，实体只解码一次',async()=>{
  assert.equal(decodeEntities('&amp;lt; &#x1f431; &#999999999;'),'&lt; 🐱 &#999999999;');
  const deepl=await mtTranslate(fixtureService('deepl'),['Use ⟦0⟧ & <x>.'],{fetch:async(_,init)=>{const body=JSON.parse(init.body);assert.equal(body.tag_handling,'xml');assert.match(body.text[0],/<m i="0"\/>/);return json({translations:[{text:'使用 <m i="0"/> &amp; &lt;x&gt;。'}]});}});
  assert.deepEqual(deepl,['使用 ⟦0⟧ & <x>。']);
  const edge=await mtTranslate(fixtureService('microsoft-edge'),['Use ⟦0⟧ & <x>.'],{fetch:async(_,init)=>{assert.match(JSON.parse(init.body)[0],/translate="no"/);return json([{translations:[{text:'使用 <span translate="no">⟦0⟧</span> &amp; &lt;x&gt;。'}]}]);}});
  assert.deepEqual(edge,['使用 ⟦0⟧ & <x>。']);
});

test('UTF-8 拆分不截断码点与代码标记，百度长条目合并回同一项',async()=>{
  const text='a'.repeat(490)+'⟦1234⟧'+'🐱é'.repeat(800);
  const pieces=splitByBytes(text);assert.equal(pieces.join(''),text);
  assert.ok(pieces.every(p=>Buffer.byteLength(p)<=500&&!p.includes('\ufffd')));
  assert.equal(pieces.filter(p=>p.includes('⟦1234⟧')).length,1);
  assert.throws(()=>splitByBytes(text,0),RangeError);
  let calls=0;
  const result=await mtTranslate(fixtureService('baidu'),['é'.repeat(4000)],{fetch:async(_,init)=>{calls++;assert.ok(Buffer.byteLength(new URLSearchParams(init.body).get('q'))<=6000);return json({trans_result:[{dst:'译文'}]});}});
  assert.equal(calls,2);assert.deepEqual(result,['译文\n译文']);
});

test('批量拆分维持顺序、请求间让速且检查取消',async()=>{
  let calls=0,paced=0;
  const result=await mtTranslate(fixtureService('deeplx'),[source,source],{pace:async()=>paced++,fetch:async()=>json({data:'译文'+(++calls)})});
  assert.deepEqual(result,['译文1','译文2']);assert.equal(paced,1);
  await assert.rejects(mtTranslate(fixtureService('deeplx'),[source],{signal:AbortSignal.abort()}),{name:'AbortError'});
});

test('后续请求失败时保留已完整完成的条目，长条目的一半不能冒充完整译文',async()=>{
  let calls=0;
  await assert.rejects(mtTranslate(fixtureService('deeplx'),[source,source],{fetch:async()=>++calls===1?json({data:translation}):new Response('limited',{status:429})}),error=>{
    assert.equal(error.code,'RATE_LIMIT');assert.deepEqual(error.partialTranslations,[translation,null]);assert.ok(!JSON.stringify(diagnosticError(error)).includes(translation));return true;
  });
  calls=0;
  await assert.rejects(mtTranslate(fixtureService('baidu'),['é'.repeat(4000)],{fetch:async()=>++calls===1?json({trans_result:[{dst:'前半段译文'}]}):new Response('limited',{status:429})}),error=>{
    assert.equal(error.code,'RATE_LIMIT');assert.ok(!error.partialTranslations?.some(Boolean));return true;
  });
  calls=0;
  await assert.rejects(mtTranslate(fixtureService('baidu'),['First line.\nSecond line.','The later item can fail.'],{fetch:async()=>++calls===1?json({trans_result:[{dst:translation}]}):new Response('limited',{status:429})}),error=>{
    assert.deepEqual(error.partialTranslations,[translation,null]);return true;
  });
});

// 回归：单条接口的服务（DeepLX 等）曾把一批逐条串行往返，第一条早已译完也要等整批结束才交出。
test('子请求按给定并发并行发出，每条译完立即回调，结果仍按原顺序',async()=>{
  const ids=['A','B','C','D','E','F','G','H'],releases=[],order=[];let active=0,peak=0,wrapped=0;
  const pending=mtTranslate(fixtureService('deeplx'),ids.map(id=>`Item ${id} compares evidence.`),{
    concurrency:3,run:task=>{wrapped++;return task();},onItem:(index,text)=>order.push([index,text]),
    fetch:async(_,init)=>{const id=JSON.parse(init.body).text.split(' ')[1];active++;peak=Math.max(peak,active);await new Promise(resolve=>releases.push(()=>resolve()));active--;return json({data:'译文'+id});}
  });
  const settle=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
  await settle();assert.equal(releases.length,3);assert.deepEqual(order,[]);
  releases[1]();await settle();
  assert.deepEqual(order,[[1,'译文B']],'第二条先回来就先交出，不等第一条');
  for(let i=0;i<ids.length;i++){releases[i]?.();await settle();}
  for(const release of releases)release();
  assert.deepEqual(await pending,ids.map(id=>'译文'+id));
  assert.equal(peak,3);assert.equal(wrapped,8);assert.equal(order.length,8);
});

test('MyMemory 长文本的内部拆包每次都经过服务闸门与限速，全部完成后才交付原条目',async()=>{
  let calls=0,runs=0,paced=0;const shown=[];
  const result=await mtTranslate(fixtureService('mymemory'),['Evidence '.repeat(180)],{
    run:async task=>{runs++;return task();},pace:async()=>{paced++;},onItem:(index,text)=>shown.push({index,text,calls}),
    fetch:async()=>{calls++;return json({responseStatus:200,responseData:{translatedText:'完整译文'}});}
  });
  assert.equal(calls,4);assert.equal(runs,calls);assert.equal(paced,calls-1);
  assert.equal(shown.length,1);assert.equal(shown[0].calls,calls);assert.equal(shown[0].text,result[0]);
});

test('本机翻译在服务闸门校验失败时保留过期错误，不启动本机模型',async()=>{
  let calls=0;
  await assert.rejects(mtTranslate(fixtureService('chrome'),[source],{
    run:async()=>{throw Object.assign(new Error('stale consumer'),{code:'STALE'});},
    local:async()=>{calls++;return [translation];}
  }),{code:'STALE'});
  assert.equal(calls,0);
});

test('并发时某个子请求失败：不再发新请求，等在途的结束，已完成的照样保留',async()=>{
  let started=0;
  await assert.rejects(mtTranslate(fixtureService('deeplx'),['One fails here.','Two finishes later.','Three never starts.','Four never starts.'],{concurrency:2,fetch:async(_,init)=>{
    started++;const text=JSON.parse(init.body).text;
    if(text.startsWith('One'))return new Response('limited',{status:429});
    await new Promise(resolve=>setTimeout(resolve,20));return json({data:translation});
  }}),error=>{assert.equal(error.code,'RATE_LIMIT');assert.deepEqual(error.partialTranslations,[null,translation,null,null]);return true;});
  assert.equal(started,2);
  // 百度长条目的分片并行时先后回来，仍按分片顺序拼回原条目。
  let calls=0;
  const pieces=await mtTranslate(fixtureService('baidu'),['é'.repeat(4000)],{concurrency:2,fetch:async()=>{const n=++calls;await new Promise(resolve=>setTimeout(resolve,n===1?30:0));return json({trans_result:[{dst:'片'+n}]});}});
  assert.deepEqual(pieces,['片1\n片2']);
});

test('超时按单次请求计算，让速等待和多包总耗时不占下一包的时间',{timeout:1500},async()=>{
  let calls=0;
  const result=await mtTranslate(fixtureService('deeplx'),[source,source],{timeoutMs:40,pace:async()=>new Promise(resolve=>setTimeout(resolve,60)),fetch:async()=>{calls++;return json({data:translation});}});
  assert.equal(calls,2);assert.deepEqual(result,[translation,translation]);
  await assert.rejects(mtTranslate(fixtureService('deeplx'),[source],{timeoutMs:20,fetch:async()=>new Promise(()=>{})}),{code:'TIMEOUT'});
  await assert.rejects(mtTranslate(fixtureService('deeplx'),[source],{timeoutMs:20,fetch:async()=>new Response(new ReadableStream({start(){}}))}),{code:'TIMEOUT'});
  await assert.rejects(mtTranslate(fixtureService('chrome'),[source],{timeoutMs:20,local:async()=>new Promise(()=>{})}),{code:'TIMEOUT'});
  const cancelled=new AbortController(),reason=new DOMException('cancelled','AbortError');
  const pending=mtTranslate(fixtureService('deeplx'),[source],{signal:cancelled.signal,fetch:async()=>new Promise(()=>{})});cancelled.abort(reason);
  await assert.rejects(pending,error=>error===reason);
});

test('含句号及空白的多句英文不得被当作无需翻译的短标签',()=>{
  for(const text of ['Alpha beta. Gamma delta','Alpha beta.\nGamma delta','Alpha beta! Gamma delta'])assert.equal(mtTranslationIssue(text,text),'TRANSLATION_NO_HAN');
  for(const text of ['API reference','Release 2.3.1','example.com'])assert.equal(mtTranslationIssue(text,text),null);
});

test('传输错误只返回受控原因码，不泄露厂商消息、凭据或响应正文',async()=>{
  for(const [status,code]of [[401,'AUTH'],[403,'AUTH'],[429,'RATE_LIMIT'],[456,'QUOTA'],[500,'HTTP']])await assert.rejects(mtTranslate(fixtureService('deepl'),[source],{fetch:async()=>new Response('fixture-secret vendor request details',{status})}),error=>error.code===code&&!error.message.includes('fixture-secret'));
  for(const value of [{Response:{Error:{Code:'AuthFailure',Message:'fixture-secret'}}},{Response:{Error:{Code:'LimitExceeded',Message:'fixture-secret'}}}])await assert.rejects(mtTranslate(fixtureService('tencent'),[source],{fetch:async()=>json(value)}),error=>['AUTH','RATE_LIMIT'].includes(error.code)&&!error.message.includes('fixture-secret'));
  await assert.rejects(mtTranslate(fixtureService('deepl'),[source],{fetch:async()=>new Response('fixture-secret not JSON')}),{code:'OUTPUT_INVALID'});
  await assert.rejects(mtTranslate(fixtureService('deepl'),[source],{fetch:async()=>json({translations:[]})}),{code:'OUTPUT_INVALID'});
  await assert.rejects(mtTranslate(fixtureService('deepl'),[source],{fetch:async()=>new Response('x'.repeat(2*1024*1024+1))}),{code:'OUTPUT_INVALID'});
  await assert.rejects(mtTranslate(fixtureService('chrome'),[source],{local:async()=>{throw Object.assign(new Error('private details'),{code:'NOT_READY'});}}),error=>error.code==='NOT_READY'&&!error.message.includes('private details'));
});

test('MD5、腾讯 TC3、阿里 RPC 与火山签名用独立 Node crypto 核对',async()=>{
  for(const value of ['',source,'中文🐱','a'.repeat(1000)])assert.equal(md5Hex(value),createHash('md5').update(value).digest('hex'));
  const hash=value=>createHash('sha256').update(value).digest('hex'),mac=(key,value)=>createHmac('sha256',key).update(value).digest();
  const payload='{"Source":"en","Target":"zh","SourceTextList":["hello"]}',date='2023-11-14',timestamp=1700000000,host='tmt.tencentcloudapi.com';
  const canonical=`POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:${host}\n\ncontent-type;host\n${hash(payload)}`;
  const stringToSign=`TC3-HMAC-SHA256\n${timestamp}\n${date}/tmt/tc3_request\n${hash(canonical)}`;
  const signature=mac(mac(mac('TC3secret',date),'tmt'),'tc3_request');
  assert.equal(await tencentAuthorization({secretId:'id',secretKey:'secret',host,payload,timestamp,date}),`TC3-HMAC-SHA256 Credential=id/${date}/tmt/tc3_request, SignedHeaders=content-type;host, Signature=${mac(signature,stringToSign).toString('hex')}`);
  const signed=await alibabaSignedForm({accessKeyId:'id',accessKeySecret:'secret',params:{Action:'TranslateGeneral',SourceText:"a b!*'()"},nonce:'nonce',timestamp:'2023-11-14T22:13:20Z'});
  const encode=value=>encodeURIComponent(value).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
  const query=Object.keys(signed).filter(k=>k!=='Signature').sort().map(k=>encode(k)+'='+encode(signed[k])).join('&');
  assert.equal(signed.Signature,createHmac('sha1','secret&').update('POST&%2F&'+encode(query)).digest('base64'));
  const headers=await volcengineHeaders({accessKeyId:'id',secretAccessKey:'secret',region:'cn-north-1',host:'translate.volcengineapi.com',query:{Version:'2020-06-01',Action:'TranslateText'},body:payload,now:new Date(timestamp*1000)});
  const vCanonical=`POST\n/\nAction=TranslateText&Version=2020-06-01\ncontent-type:application/json; charset=utf-8\nhost:translate.volcengineapi.com\nx-content-sha256:${hash(payload)}\nx-date:20231114T221320Z\n\ncontent-type;host;x-content-sha256;x-date\n${hash(payload)}`;
  const scope='20231114/cn-north-1/translate/request',vString=`HMAC-SHA256\n20231114T221320Z\n${scope}\n${hash(vCanonical)}`;
  assert.ok(headers.Authorization.endsWith(mac(mac(mac(mac(mac('secret','20231114'),'cn-north-1'),'translate'),'request'),vString).toString('hex')));
  assert.equal(youdaoInput('1234567890123456789012345'),'1234567890256789012345');
});
