/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
function loadPlaywright(){try{return require('playwright-core');}catch(first){const override=process.env.PLAYWRIGHT_CORE_PATH;if(override){try{return require(override);}catch{}}throw new Error(`找不到 playwright-core（${first?.message || first}）。请在项目根运行 npm i -D playwright-core，或设置 PLAYWRIGHT_CORE_PATH 指向可用副本。`);}}
const {chromium}=loadPlaywright();
const root=process.env.ROAMCAT_EXTENSION_DIR?path.resolve(process.env.ROAMCAT_EXTENSION_DIR):path.resolve(__dirname,'../roamcat-0.0.1/extension'),out=path.resolve(__dirname,'../preview');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
function mockPopupChrome(){
  const tab={id:7,url:'https://example.com/article',windowId:1};
  window.qa={events:[],tabMessages:[],intentFocus:Boolean(window.qaIntentFocus),emergency:{active:false,displayed:false,phase:'off',total:0,completed:0,failed:0,pending:0,skipped:0,error:''}};
  window.chrome={
    storage:{local:{get:async()=>({}),set:async()=>{}},onChanged:{addListener(){}}},
    permissions:{request:async()=>true,contains:async()=>true,getAll:async()=>({origins:[]})},
    tabs:{
      query:async()=>[tab],
      get:async()=>tab,
      sendMessage:async(_id,message)=>{
        window.qa.tabMessages.push(message);
        if(message.type==='SS_STATUS')return {ok:true,data:{enabled:true,emergency:window.qa.emergency}};
        if(message.type==='SS_EMERGENCY_START'){
          window.qa.emergency={active:true,displayed:true,phase:'translating',total:4,completed:1,failed:0,pending:3,skipped:0,error:''};
          return {ok:true,data:{emergency:window.qa.emergency}};
        }
        if(message.type==='SS_EMERGENCY_STOP'){
          window.qa.emergency={...window.qa.emergency,active:false,displayed:true,phase:'stopped'};
          return {ok:true,data:{emergency:window.qa.emergency}};
        }
        if(message.type==='SS_EMERGENCY_END'){
          window.qa.emergency={active:false,displayed:false,phase:'off',total:0,completed:0,failed:0,pending:0,skipped:0,error:''};
          return {ok:true,data:{emergency:window.qa.emergency}};
        }
        return {ok:true,data:{enabled:true}};
      }
    },
    runtime:{
      id:'roamcat-ui-test',
      getURL:p=>location.origin+'/'+p,
      onMessage:{addListener(){}},
      openOptionsPage(){},
      sendMessage:async message=>{
        window.qa.events.push(message);
        switch(message.type){
          case 'STATE_GET':return {ok:true,data:{settings:{assistanceMode:'ambient',lookupKey:'D',providerKind:'api'},providerConfigured:true,subscription:{connected:true}}};
          case 'AUTOMATION_GET':return {ok:true,data:{automation:{sites:[]},siteRule:false}};
          case 'SENTENCE_GROUPS_GET':return {ok:true,data:{enabled:false,density:'medium'}};
          case 'POPUP_INTENT_TAKE':return {ok:true,data:{focus:window.qa.intentFocus}};
          case 'ON_DEMAND_SUGGESTION':return {ok:true,data:{show:false}};
          case 'PAGE_UI_INJECT':return {ok:true,data:{}};
          case 'EMERGENCY_BEGIN':return {ok:true,data:{token:'qa-token'}};
          case 'EMERGENCY_END':return {ok:true,data:{}};
          default:return {ok:true,data:{}};
        }
      }
    }
  };
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const report={checks:[],errors:[]};
  try{
    const context=await browser.newContext({viewport:{width:380,height:660},deviceScaleFactor:2});
    await context.addInitScript(mockPopupChrome);
    const page=await context.newPage();
    page.on('pageerror',e=>report.errors.push(e.message));
    await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());

    await page.goto(base+'/ui/popup.html');
    await page.waitForSelector('#emergency-open');
    assert.equal(await page.locator('#emergency-confirm').count(),0);
    assert.equal(await page.locator('#emergency-start').count(),0);
    assert.equal(await page.locator('#emergency-cancel').count(),0);
    await page.waitForFunction(()=>!document.querySelector('#emergency-open').disabled);
    assert.equal(await page.locator('#emergency-open').isVisible(),true);
    assert.equal(await page.locator('#emergency-progress').isVisible(),false);
    await page.screenshot({path:path.join(out,'popup-emergency-ready.png')});
    report.checks.push('Popup has 翻译本页 and no confirm/cancel step');

    await page.locator('#emergency-open').click();
    await page.waitForFunction(()=>window.qa.events.some(e=>e.type==='EMERGENCY_BEGIN'));
    await page.waitForFunction(()=>window.qa.tabMessages.some(e=>e.type==='SS_EMERGENCY_START'&&e.resume===false));
    assert.equal(await page.locator('#emergency-confirm').count(),0);
    assert.equal(await page.locator('#emergency-open').isVisible(),false);
    assert.equal(await page.locator('#emergency-progress').isVisible(),true);
    assert.match(await page.locator('#emergency-result').textContent(),/已开始/);
    assert.match(await page.locator('#emergency-progress-copy').textContent(),/已译 1 \/ 已识别 4/);
    assert.equal(await page.locator('#emergency-stop').isVisible(),true);
    await page.screenshot({path:path.join(out,'popup-emergency-started.png')});
    report.checks.push('Clicking 翻译本页 starts bilingual translation immediately');

    await page.locator('#emergency-stop').click();
    await page.waitForFunction(()=>window.qa.tabMessages.some(e=>e.type==='SS_EMERGENCY_STOP'));
    await page.waitForSelector('#emergency-resume:visible');
    await page.locator('#emergency-resume').click();
    await page.waitForFunction(()=>window.qa.tabMessages.filter(e=>e.type==='SS_EMERGENCY_START'&&e.resume===true).length>=1);
    assert.equal(await page.locator('#emergency-confirm').count(),0);
    assert.match(await page.locator('#emergency-result').textContent(),/已继续/);
    report.checks.push('Resume continues immediately without a confirm button');

    const intentPage=await context.newPage();
    intentPage.on('pageerror',e=>report.errors.push(e.message));
    await intentPage.addInitScript(()=>{window.qaIntentFocus=true;});
    await intentPage.addInitScript(mockPopupChrome);
    await intentPage.goto(base+'/ui/popup.html');
    await intentPage.waitForFunction(()=>window.qa.events.some(e=>e.type==='EMERGENCY_BEGIN'));
    await intentPage.waitForFunction(()=>window.qa.tabMessages.some(e=>e.type==='SS_EMERGENCY_START'));
    assert.equal(await intentPage.locator('#emergency-confirm').count(),0);
    assert.equal(await intentPage.locator('#emergency-progress').isVisible(),true);
    report.checks.push('Shortcut intent starts translation without a confirm panel');
    await intentPage.close();

    for(const theme of ['light','dark']){
      await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      await page.waitForTimeout(120);
      await page.screenshot({path:path.join(out,`popup-emergency-${theme}.png`)});
    }

    await page.goto(base+'/ui/options.html');
    await page.waitForTimeout(250);
    const optionsHtml=await page.content();
    assert.equal(optionsHtml.includes('单独确认'),false);
    assert.equal(optionsHtml.includes('点「翻译本页」后立即开始')||optionsHtml.includes('点「翻译本页」即开始'),true);
    report.checks.push('Options copy no longer asks for a separate confirmation');

    fs.writeFileSync(path.join(out,'popup-emergency-verification.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
    if(report.errors.length)throw new Error(report.errors.join('\n'));
  }finally{
    await browser.close();
    server.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
