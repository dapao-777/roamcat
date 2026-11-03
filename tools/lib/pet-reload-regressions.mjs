/**
 * @file tools/lib/pet-reload-regressions.mjs
 * 文件职责：伴读猫门禁的扩展重载回归，保留原网页验证旧隔离世界退役、挂件唯一与翻译恢复。
 * 主要内容：本地假 DeepLX、连续两次 runtime.reload、行内代码及网页身份保持；不调用真实模型或连接器。
 * 模块边界：只由 verify-pet-buttons 在其他按钮检查结束后调用，复用 ego.mjs 的隔离浏览器与报告。
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import http from 'node:http';
import assert from 'node:assert/strict';
import {extUrl,tabIdOf} from './ego.mjs';

export async function verifyPetReloads({run,check,control:initialControl}) {
  let requests=0;
  const server=http.createServer(async(req,res)=>{
    if(req.method==='POST'){
      let body='';for await(const chunk of req)body+=chunk;
      const value=JSON.parse(body);requests++;
      res.setHeader('content-type','application/json');res.end(JSON.stringify({code:200,data:'重载后仍能翻译。'+(value.text.match(/⟦\d+⟧/g)||[]).join(' ')}));return;
    }
    res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><title>Reload lifecycle fixture</title><main><article><h1>Reading after an extension reload</h1><p>The database uses <code>SELECT</code> to find records quickly. Careful readers compare the evidence before they reach a conclusion.</p></article></main>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const until=async(probe,ok,timeout=15000)=>{const deadline=Date.now()+timeout;let value;do{value=await probe();if(ok(value))return value;await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<deadline);throw new Error('重载状态未就绪：'+JSON.stringify(value));};
  const verify=async(name,fn)=>{try{const detail=await fn();check(name,true,JSON.stringify(detail));console.log('PASS '+name);return true;}catch(error){check(name,false,error.message);console.error('FAIL '+name+': '+error.message);return false;}};
  try{
    const manager=await run.newPage();await manager.goto('chrome://extensions/');
    // 命令行加载会绕过首次检查；重载前仍须开启临时配置的开发者模式，避免被 ego 的开发版策略禁用。
    await manager.locator('#devMode').waitFor({state:'visible'});
    if(!await manager.locator('#devMode').isChecked())await manager.locator('#devMode').click();
    // 设置页是单例，复用按钮门禁已有页面，避免新页在导航完成前被去重关闭。
    let control=initialControl;
    if(!control){control=await run.newPage();await control.goto(extUrl('ui/options.html'));}
    await control.waitForFunction(()=>!!window.optionsState);
    const request=async(type,payload={})=>{const reply=await control.evaluate(message=>chrome.runtime.sendMessage(message),{type,...payload});assert.ok(reply?.ok,reply?.error);return reply.data;};
    await request('STATE_PATCH',{patch:{providerKind:'api',apiServices:[],activeApiServiceId:'',assistanceMode:'on-demand',floatingPet:{enabled:true,quotes:{enabled:false}},mtServices:[{providerId:'deeplx',credentials:{endpoint:origin+'/translate',token:'fake-local-token'}}],translationEngines:{page:'deeplx'},mtFallback:false}});
    const article=await run.newPage(),errors=[];article.on('pageerror',error=>errors.push(error.message));
    await article.goto(origin+'/article');const tabId=await tabIdOf(control,origin+'/article');
    await article.evaluate(()=>{window.__roamcatReloadFixture='same-document';});
    const send=type=>control.evaluate(({tabId,type})=>chrome.tabs.sendMessage(tabId,{type},{frameId:0}),{tabId,type});
    const translate=async()=>{
      await request('PAGE_UI_INJECT',{tabId});
      assert.ok((await send('SS_STATUS')).ok);
      assert.ok((await send('SS_EMERGENCY_END')).ok);
      const result=await send('SS_EMERGENCY_TOGGLE');assert.ok(result.ok,result.error);
      await article.locator('p [data-roamcat-ui="emergency-translation"]').waitFor({state:'visible',timeout:15000});
      await until(()=>article.locator('#roamcat-pet-host').count(),count=>count===1);
      // 负向断言：完整观察旧挂件的 1.5 秒恢复定时器，确保它不会在新实例挂上后再冒出来。
      await article.waitForTimeout(1800);assert.equal(await article.locator('#roamcat-pet-host').count(),1);
      assert.equal(await article.locator('p [data-roamcat-ui="emergency-translation"] code').count(),1);
      assert.equal(await article.evaluate(()=>window.__roamcatReloadFixture),'same-document');
      return {requests,petHosts:1,sameDocument:true};
    };
    if(!await verify('扩展重载前：假机翻可用，伴读猫与行内代码各一份',translate))return;
    for(let round=1;round<=2;round++){
      if(!await verify(`扩展第 ${round} 次重载后：原网页可继续翻译且伴读猫不重复`,async()=>{
        await control.evaluate(()=>chrome.runtime.reload()).catch(()=>{});
        await until(async()=>!(await run.browser.send('Target.getTargets')).targetInfos.some(info=>info.type==='page'&&info.url.startsWith(extUrl('ui/options.html'))),Boolean);
        control=await run.newPage();
        await until(async()=>{try{await control.goto(extUrl('ui/options.html'));return true;}catch(error){if(/ERR_BLOCKED_BY_CLIENT|ERR_ABORTED/.test(error.message))return false;throw error;}},Boolean);
        await control.waitForFunction(()=>!!window.optionsState,undefined,{timeout:15000});
        return translate();
      }))break;
    }
    await verify('扩展重载后的原网页没有未捕获异常',()=>assert.deepEqual(errors,[]));
  }finally{
    // 浏览器还开着时可能保留尚未发 HTTP 头的预连接；只关闭本夹具的连接，避免门禁等不到 close。
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
  }
}
