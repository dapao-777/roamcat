/**
 * @file tools/lib/mt-regressions.mjs
 * 文件职责：真后台机翻回归——审计门禁内验证五场景、失败回退、凭据隔离、限流、配置失效与缓存。
 * 主要内容：本机 DeepLX/大模型假接口与 Twitch URL fixture；只用 ego.mjs 的浏览器，不接触真实密钥或额度。
 * 模块边界：由 audit-extension.mjs 调用并复用其 check/report；结束恢复测试配置并关闭自建页面和服务。
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import http from 'node:http';
import assert from 'node:assert/strict';
import {extUrl,tabIdOf} from './ego.mjs';

export async function verifyMtRegressions({run,control,request,check}) {
  let mode='ok',held,release,mtCalls=0,modelCalls=0;
  const modelItemIds=[];
  const server=http.createServer(async(req,res)=>{
    if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}).end();return;}
    let body='';for await(const part of req)body+=part;
    res.setHeader('Access-Control-Allow-Origin','*');
    if(req.url==='/translate'){
      mtCalls++;const value=JSON.parse(body);
      assert.equal(req.headers.authorization,'Bearer fixture-mt-token');
      assert.equal(req.headers.cookie,undefined);
      if(mode==='held'){held?.();await new Promise(resolve=>{release=resolve;});}
      if(mode==='rate'||mode==='partial-rate'&&value.text.includes('fail-after-success')){res.writeHead(429).end('private vendor details fixture-mt-token');return;}
      const markers=mode==='markers'?'':(value.text.match(/⟦\d+⟧/g)||[]).join(' ');
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({code:200,data:'机翻译文。'+markers}));return;
    }
    if(req.url==='/v1/chat/completions'){
      const value=JSON.parse(body),raw=value.messages.at(-1).content,input=JSON.parse(raw.slice(raw.indexOf('{')));
      if(input.probe){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(input)},finish_reason:'stop'}]}));return;}
      modelCalls++;modelItemIds.push(input.items.map(item=>item.id));
      const result={items:input.items.map(item=>({id:item.id,translation:'模型回退译文。'+(item.text.match(/⟦\d+⟧/g)||[]).join(' ')}))};
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(result)},finish_reason:'stop'}]}));return;
    }
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><title>MT fixture</title><main><article><p>The database uses an index to find records quickly.</p></article></main>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const previous=(await request('STATE_GET')).settings;
  const article=await run.newPage(),reader=await run.newPage(),twitch=await run.newPage();
  const direct=async(page,type,payload={})=>{
    const result=await page.evaluate(message=>chrome.runtime.sendMessage(message),{type,...payload});
    assert.ok(result?.ok,result?.error);return result.data;
  };
  const fromTab=async(tabId,type,payload={})=>{
    const [{result}]=await control.evaluate(({tabId,message})=>chrome.scripting.executeScript({target:{tabId},func:message=>chrome.runtime.sendMessage(message),args:[message]}),{tabId,message:{type,...payload}});
    return result;
  };
  const context={title:'MT fixture',heading:'',before:'',after:''};
  const item=(id,text='The database uses an index to find records quickly.')=>({id,text,context});
  const saved={providerId:'deeplx',credentials:{endpoint:origin+'/translate',token:'fixture-mt-token'}};
  const engines=Object.fromEntries(['page','video','liveChat','reader','passage'].map(scene=>[scene,'deeplx']));
  const patch=patch=>request('STATE_PATCH',{patch});
  try{
    await article.goto(origin+'/article');
    await reader.goto(extUrl('ui/reader.html'));
    await twitch.intercept(['https://www.twitch.tv/*'],async()=>({headers:{'content-type':'text/html'},body:'<!doctype html><title>MT chat fixture</title><main>Live chat fixture</main>'}));
    await twitch.goto('https://www.twitch.tv/roamcat_fixture');
    const articleId=await tabIdOf(control,origin+'/article'),twitchId=await tabIdOf(control,'https://www.twitch.tv/roamcat_fixture');
    await patch({providerKind:'api',apiServices:[],activeApiServiceId:'',mtServices:[saved],translationEngines:engines,mtFallback:false,floatingPet:{enabled:false}});
    await request('VIDEO_SETTINGS_PATCH',{patch:{liveChat:true}});
    await check('MT only: all five scenes translate without an AI model',async()=>{
      const begin=await request('EMERGENCY_BEGIN',{tabId:articleId,url:origin+'/article'});
      const page=await fromTab(articleId,'EMERGENCY_TRANSLATE',{token:begin.token,requestSeq:1,items:[item('page')]});
      assert.ok(page.ok,page.error);assert.match(page.data.items[0].translation,/机翻/);
      const video=await fromTab(articleId,'VIDEO_CUE_TRANSLATE',{items:[item('video')]});assert.ok(video.ok,video.error);
      const chat=await fromTab(twitchId,'LIVE_CHAT_TRANSLATE',{items:[item('chat')],requestId:'mt-chat'});assert.ok(chat.ok,chat.error);
      const passage=await fromTab(articleId,'PASSAGE_TRANSLATE',{items:[{id:'passage',text:item('').text}],requestId:'mt-passage'});assert.ok(passage.ok,passage.error);
      const book=await direct(reader,'READER_TRANSLATE',{items:[{id:'reader',text:item('').text}]});assert.match(book.items[0].translation,/机翻/);
      assert.equal(modelCalls,0);assert.ok(mtCalls>=1);
      await request('EMERGENCY_END',{tabId:articleId,token:begin.token});
    });
    await check('MT scene routes are independent and AI-only features still require a model',async()=>{
      await patch({translationEngines:{reader:''}});
      const result=await reader.evaluate(()=>chrome.runtime.sendMessage({type:'READER_TRANSLATE',items:[{id:'unrouted',text:'A new reader passage needs a configured engine.'}]}));
      assert.equal(result.ok,false);
      const summary=await fromTab(articleId,'PAGE_SUMMARY',{title:'fixture',url:origin+'/article',text:item('').text});assert.equal(summary.ok,false);
      await patch({translationEngines:{reader:'deeplx'}});
    });
    await check('MT only: the page translation toggle works through the real content UI',async()=>{
      await request('PAGE_UI_INJECT',{tabId:articleId});
      const toggle=()=>control.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'SS_EMERGENCY_TOGGLE'},{frameId:0}),articleId);
      const result=await toggle();assert.ok(result.ok,result.error);
      await article.locator('[data-roamcat-ui="emergency-translation"]').first().waitFor({state:'visible',timeout:10000});
      assert.equal(modelCalls,0);assert.ok((await toggle()).ok);
    });
    await check('MT only: Translate page in the real popup starts translation',async()=>{
      await article.reload();await request('PAGE_UI_INJECT',{tabId:articleId});
      const url=extUrl('ui/popup.html?mt-fixture=1');
      await control.evaluate(async({tabId,url})=>{const tab=await chrome.tabs.get(tabId);await chrome.tabs.create({windowId:tab.windowId,url,active:false});},{tabId:articleId,url});
      const targets=await run.browser.connection.send('Target.getTargets'),target=targets.targetInfos.find(info=>info.url===url);
      assert.ok(target);const popup=await run.browser.attach(target.targetId);
      try{
        await popup.locator('#emergency-open').waitFor({state:'visible',timeout:10000});
        await popup.locator('#emergency-open').click();
        await article.locator('[data-roamcat-ui="emergency-translation"]').first().waitFor({state:'visible',timeout:10000});
        assert.equal(modelCalls,0);
        await control.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'SS_EMERGENCY_END'},{frameId:0}),articleId);
      }finally{await popup.close();}
    });
    await check('MT credentials never reach content scripts, diagnostics or data exports',async()=>{
      const snapshot=await fromTab(articleId,'STATE_GET');assert.ok(snapshot.ok);assert.equal(snapshot.data.providerConfigured,false);assert.equal(snapshot.data.pageTranslationReady,true);
      const serialized=JSON.stringify(snapshot);assert.ok(!serialized.includes('fixture-mt-token'));assert.equal(snapshot.data.settings.mtServices,undefined);
      assert.equal((await fromTab(articleId,'MT_TEST',{service:saved})).ok,false);
      const diagnostics=JSON.stringify(await request('DIAGNOSTICS_EXPORT'));assert.ok(!diagnostics.includes('fixture-mt-token'));
      const exported=JSON.stringify(await request('READING_DATA_EXPORT'));assert.ok(!exported.includes('fixture-mt-token'));
    });
    await check('MT connection test uses saved credentials without returning them',async()=>{
      const result=await request('MT_TEST',{service:{providerId:'deeplx',credentials:{endpoint:origin+'/translate',token:''}}});assert.match(result.translation,/机翻/);assert.equal('credentials' in result,false);
    });
    await check('MT caches repeated text but invalidates it on engine changes',async()=>{
      const items=[{id:'cache',text:'A cache fixture should make one machine translation request.'}];
      const before=mtCalls;await direct(reader,'READER_TRANSLATE',{items});await direct(reader,'READER_TRANSLATE',{items});assert.equal(mtCalls,before+1);
      await patch({mtFallback:true});await direct(reader,'READER_TRANSLATE',{items});assert.equal(mtCalls,before+2);
    });
    await patch({apiServices:[{id:'mt-model',name:'MT model fixture',providerId:'openai-compatible',baseUrl:origin+'/v1',apiKey:'fixture-model-key',model:'fixture-model',options:{}}],activeApiServiceId:'mt-model'});
    await check('MT invalid markers fall back only failed items and preserve successful translations',async()=>{
      mode='markers';const before=modelCalls;
      const items=[item('good','A good passage remains machine translated without code.'),item('bad','Use ⟦0⟧ to read the database records safely.')];
      const begin=await request('EMERGENCY_BEGIN',{tabId:articleId,url:origin+'/article'});
      const result=await fromTab(articleId,'EMERGENCY_TRANSLATE',{token:begin.token,requestSeq:1,items});assert.ok(result.ok,result.error);
      assert.match(result.data.items.find(i=>i.id==='good').translation,/机翻/);assert.match(result.data.items.find(i=>i.id==='bad').translation,/模型回退/);assert.match(result.data.items.find(i=>i.id==='bad').translation,/⟦0⟧/);assert.equal(modelCalls,before+1);
      await request('EMERGENCY_END',{tabId:articleId,token:begin.token});mode='ok';
    });
    await check('MT later HTTP failures preserve earlier translations and retry only unfinished items',async()=>{
      mode='partial-rate';const before=modelCalls;
      const items=[item('complete','An earlier complete translation must remain available.'),item('unfinished','The fail-after-success item should be retried separately.')];
      const start=()=>request('EMERGENCY_BEGIN',{tabId:articleId,url:origin+'/article'});
      let begin;
      try{
      begin=await start();
      let result=await fromTab(articleId,'EMERGENCY_TRANSLATE',{token:begin.token,requestSeq:1,items});assert.ok(result.ok,result.error);
      assert.match(result.data.items.find(item=>item.id==='complete').translation,/机翻/);
      assert.match(result.data.items.find(item=>item.id==='unfinished').translation,/模型回退/);
      assert.equal(modelCalls,before+1);assert.deepEqual(modelItemIds.at(-1),['unfinished']);
      await request('EMERGENCY_END',{tabId:articleId,token:begin.token});begin=null;
      await patch({mtFallback:false});begin=await start();
      result=await fromTab(articleId,'EMERGENCY_TRANSLATE',{token:begin.token,requestSeq:1,items});assert.ok(result.ok,result.error);
      assert.equal(result.data.items.length,1);assert.equal(result.data.items[0].id,'complete');
      assert.equal(result.data.errors[0].id,'unfinished');assert.equal(result.data.errors[0].code,'RATE_LIMIT');assert.equal(modelCalls,before+1);
      await request('EMERGENCY_END',{tabId:articleId,token:begin.token});begin=null;
      }finally{
        if(begin)await request('EMERGENCY_END',{tabId:articleId,token:begin.token}).catch(()=>{});
        mode='ok';await patch({mtFallback:false});await patch({mtFallback:true});
      }
    });
    await check('MT invalid markers with fallback disabled keep valid sibling items',async()=>{
      mode='markers';let begin;const before=modelCalls;
      try{
        await patch({mtFallback:false});
        begin=await request('EMERGENCY_BEGIN',{tabId:articleId,url:origin+'/article'});
        const result=await fromTab(articleId,'EMERGENCY_TRANSLATE',{token:begin.token,requestSeq:1,items:[item('valid','A valid sibling keeps its completed machine translation.'),item('broken','Use ⟦0⟧ to read the database safely.')]});
        assert.ok(result.ok,result.error);assert.equal(result.data.items[0].id,'valid');assert.deepEqual(result.data.errors,[{id:'broken',code:'OUTPUT_INVALID'}]);assert.equal(modelCalls,before);
      }finally{
        if(begin)await request('EMERGENCY_END',{tabId:articleId,token:begin.token}).catch(()=>{});
        mode='ok';await patch({mtFallback:true});
      }
    });
    await check('MT rate limit falls back, cools down, and the fallback switch stops extra model requests',async()=>{
      mode='rate';const before=modelCalls;
      const translate=id=>direct(reader,'READER_TRANSLATE',{items:[{id,text:'A rate limit fixture should produce a controlled result. '+id}]});
      await translate('rate1');const calls=mtCalls;await translate('rate2');assert.equal(mtCalls,calls);assert.equal(modelCalls,before+2);
      await patch({mtFallback:false});const stopped=await reader.evaluate(()=>chrome.runtime.sendMessage({type:'READER_TRANSLATE',items:[{id:'rate3',text:'A third rate limit fixture has fallback disabled.'}]}));
      assert.equal(stopped.ok,false);assert.equal(modelCalls,before+2);assert.ok(!JSON.stringify(stopped).includes('fixture-mt-token'));
      await patch({mtFallback:true});mode='ok';
    });
    await check('MT stale in-flight results cannot survive changed settings',async()=>{
      mode='held';const arrived=new Promise(resolve=>{held=resolve;});
      const pending=reader.evaluate(()=>chrome.runtime.sendMessage({type:'READER_TRANSLATE',items:[{id:'old',text:'An in flight fixture must not survive changed settings.'}]}));
      await Promise.race([arrived,new Promise((_,reject)=>setTimeout(()=>reject(new Error('MT request did not arrive')),5000))]);
      await patch({mtFallback:false});release();const result=await pending;assert.equal(result.ok,false);mode='ok';
    });
    await check('MT live chat uses its own 30-batch limit',async()=>{
      await patch({mtFallback:true});let throttled=false;
      for(let n=0;n<31;n++){const response=await fromTab(twitchId,'LIVE_CHAT_TRANSLATE',{requestId:'rate-'+n,items:[item('chat-'+n)]});assert.ok(response.ok,response.error);if(response.data.throttled){assert.ok(response.data.retryAfterMs>0);throttled=true;break;}}
      assert.ok(throttled);
    });
    await check('Deleting MT credentials resets scene routes and removes page readiness',async()=>{
      await patch({mtServices:[],apiServices:[],activeApiServiceId:''});const snapshot=await fromTab(articleId,'STATE_GET');assert.equal(snapshot.data.pageTranslationReady,false);
      const state=await request('STATE_GET');assert.ok(Object.values(state.settings.translationEngines).every(value=>value===''));
    });
  }finally{
    release?.();await patch(previous).catch(()=>{});
    await Promise.allSettled([article.close(),reader.close(),twitch.close()]);
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
  }
}
