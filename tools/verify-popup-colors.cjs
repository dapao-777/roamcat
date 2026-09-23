/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Isolated visual states: no extension operations or user tabs are accessed.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function loadPlaywright(){try{return require('playwright-core');}catch(first){const override=process.env.PLAYWRIGHT_CORE_PATH;if(override){try{return require(override);}catch{}}throw new Error(`找不到 playwright-core（${first?.message || first}）。请在项目根运行 npm i -D playwright-core，或设置 PLAYWRIGHT_CORE_PATH 指向可用副本。`);}}
const {chromium}=loadPlaywright();
const ui=process.env.ROAMCAT_EXTENSION_DIR?path.resolve(process.env.ROAMCAT_EXTENSION_DIR,'ui'):path.resolve(__dirname,'../roamcat-0.2.0/extension/ui'),out=path.resolve(__dirname,'../preview');
const luminance=rgb=>rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:360,height:180},deviceScaleFactor:2});
  const css=['ui.css','refinement.css'].map(n=>fs.readFileSync(path.join(ui,n),'utf8')).join('\n');
  await page.setContent(`<style>${css}</style><body class="popup-body"><div style="padding:28px"><button id="toggle-page" class="primary-action popup-master-btn"><span id="toggle-label">开启本页</span></button></div></body>`);
  const results=[];
  for(const theme of ['light','dark']){
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   for(const state of ['normal','hover','active','disabled']){
    await page.mouse.up();await page.mouse.move(340,160);await page.locator('#toggle-page').evaluate((el,disabled)=>el.disabled=disabled,state==='disabled');
    if(state==='hover'||state==='active')await page.locator('#toggle-page').hover();
    if(state==='active')await page.mouse.down();await page.waitForTimeout(180);
    const colors=await page.locator('#toggle-page').evaluate(el=>({fg:getComputedStyle(el.firstElementChild).color,bg:getComputedStyle(el).backgroundColor}));
    const a=luminance(colors.fg),b=luminance(colors.bg),contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    if(state!=='disabled')assert.ok(contrast>=4.5,`${theme}/${state}: ${contrast}`);
    results.push({theme,state,...colors,contrast:Number(contrast.toFixed(2))});
    if(state==='normal')await page.locator('#toggle-page').screenshot({path:path.join(out,`popup-button-${theme}.png`)});
   }
  }
  console.log(JSON.stringify(results,null,2));fs.writeFileSync(path.join(out,'popup-button-verification.json'),JSON.stringify(results,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
