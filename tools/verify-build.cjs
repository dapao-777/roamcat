/**
 * @file tools/verify-build.cjs
 * 文件职责：构建产物门禁——dist/extension 的静态完整性与真实浏览器加载验证。
 * 主要内容：npm run build → 源树逐文件字节比对（manifest.json 与 REPLACED_BY_BUILD
 *   除外）→ 产物 manifest 检查（key、__MSG_*__ 引用）→ 产物 HTML 的 CSP 与资源可解析性
 *   → Edge 实际加载并断言扩展 ID 等于 build/extension-key.json 预计算值 → popup 渲染冒烟。
 * 模块边界：只读源树与 build/extension-key.json，写 preview/ 报告；不修改源文件。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
function loadPlaywright(){try{return require('playwright-core');}catch(first){const override=process.env.PLAYWRIGHT_CORE_PATH;if(override){try{return require(override);}catch{}}throw new Error(`找不到 playwright-core（${first?.message || first}）。请在项目根运行 npm i -D playwright-core，或设置 PLAYWRIGHT_CORE_PATH 指向可用副本。`);}}
const repoRoot=path.resolve(__dirname,'..'),source=path.join(repoRoot,'roamcat-0.0.1','extension'),dist=path.join(repoRoot,'dist','extension'),out=path.join(repoRoot,'preview');fs.mkdirSync(out,{recursive:true});
const report={checks:[],failures:[],pageErrors:[],byteDrift:[]};
async function check(name,fn){try{const detail=await fn();report.checks.push({name,...(detail?{detail}:{})});console.log('PASS '+name);}catch(e){report.failures.push({name,error:e.message});console.log('FAIL '+name+': '+e.message);}}
function* walkFiles(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const child=path.join(dir,entry.name);if(entry.isDirectory())yield* walkFiles(child);else if(entry.isFile())yield child;}}

(async()=>{
 const {REPLACED_BY_BUILD}=await import('../build/extension-plugin.mjs');
 const keyFile=JSON.parse(fs.readFileSync(path.join(repoRoot,'build','extension-key.json'),'utf8'));

 const viteCli=path.join(repoRoot,'node_modules','vite','bin','vite.js');
 execFileSync(process.execPath,[viteCli,'build','--config','vite.content-ui.config.mjs','--mode','development'],{cwd:repoRoot,stdio:'inherit'});
 execFileSync(process.execPath,[viteCli,'build','--mode','development'],{cwd:repoRoot,stdio:'inherit'});

 await check('Source layer copied byte-for-byte to dist',()=>{
   const skipped=['manifest.json',...REPLACED_BY_BUILD];
   let count=0;
   for(const file of walkFiles(source)){
     const relative=path.relative(source,file).split(path.sep).join('/');
     if(skipped.includes(relative))continue;
     const target=path.join(dist,relative);
     if(!fs.existsSync(target)){report.byteDrift.push(`缺失: ${relative}`);continue;}
     if(!fs.readFileSync(file).equals(fs.readFileSync(target)))report.byteDrift.push(`内容不一致: ${relative}`);
     count++;
   }
   assert.equal(report.byteDrift.length,0,report.byteDrift.slice(0,10).join('；'));
   return {files:count,skipped};
 });

 await check('dist manifest carries dev key and localized name',()=>{
   const manifest=JSON.parse(fs.readFileSync(path.join(dist,'manifest.json'),'utf8'));
   assert.equal(manifest.key,keyFile.key);
   assert.equal(manifest.name,'__MSG_extName__');
   return {version:manifest.version,minimum:manifest.minimum_chrome_version};
 });

 await check('Built popup.html is CSP-clean and resolvable',()=>{
   const html=fs.readFileSync(path.join(dist,'ui','popup.html'),'utf8');
   const withoutComments=html.replace(/<!--[\s\S]*?-->/gu,'');
   assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/iu.test(withoutComments),'存在内联 <script>');
   assert.ok(!/\son[a-z]+\s*=/iu.test(withoutComments),'存在内联事件属性');
   assert.ok(!html.includes('@ext/'),'残留未解析的 @ext 别名');
   const refs=[...html.matchAll(/(?:src|href)="([^"]+)"/gu)].map(m=>m[1]).filter(u=>!u.startsWith('#')&&!u.startsWith('data:')&&!/^[a-z][a-z0-9+.-]*:/iu.test(u));
   for(const ref of refs){
     const clean=ref.split('?')[0];
     const target=clean.startsWith('/')?path.join(dist,clean):path.resolve(dist,'ui',clean);
     assert.ok(fs.existsSync(target),`引用不可解析: ${ref}`);
   }
   assert.ok(fs.readdirSync(path.join(dist,'assets')).length>0,'dist/assets 为空');
   return {refs};
 });

 const {chromium}=loadPlaywright();
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'roamcat-build-'));
 const context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--disable-extensions-except='+dist,'--load-extension='+dist]});
 try{
   const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
   const id=new URL(worker.url()).host;

   await check('Extension ID matches generated key',()=>{
     assert.equal(id,keyFile.id,'Chrome 推导的扩展 ID 与 build/extension-key.json 不一致');
     return {id};
   });

   const page=await context.newPage();page.setDefaultTimeout(10000);
   page.on('pageerror',e=>report.pageErrors.push(e.message));
   await page.goto(`chrome-extension://${id}/ui/popup.html`);

   await check('Popup renders in built extension',async()=>{
     await page.locator('#toggle-page').waitFor();
     assert.equal(await page.locator('.popup-brand-name').textContent(),'ROAMCAT');
     assert.equal(await page.evaluate(()=>getComputedStyle(document.body).width),'360px','样式表未生效');
     assert.match(await page.evaluate(()=>document.documentElement.dataset.theme||''),/^(light|dark)$/u,'theme-init.js 未执行');
     await page.screenshot({path:path.join(out,'build-popup.png')});
     return {theme:await page.evaluate(()=>document.documentElement.dataset.theme)};
   });

   await check('Options renders and routes in built extension',async()=>{
     await page.goto(`chrome-extension://${id}/ui/options.html`);
     await page.locator('#sidebar-collapse-btn').waitFor();
     assert.equal(await page.locator('#section-title').textContent(),'阅读偏好设置');
     assert.ok(await page.locator('#assistance').isVisible(),'默认分区未显示');
     assert.ok(!(await page.locator('#terms').isVisible()),'非活跃分区应隐藏');
     await page.locator('[data-section="terms"]').click();
     await page.waitForFunction(()=>!document.getElementById('terms').hidden&&document.getElementById('assistance').hidden,null,{timeout:5000});
     assert.equal(await page.locator('#section-title').textContent(),'生词记忆矩阵');
     assert.equal(await page.locator('#toolbar-breadcrumb-title').textContent(),'生词记忆');
     await page.locator('#theme-toggle-btn').click();
     const theme=await page.evaluate(()=>document.documentElement.dataset.theme||'auto');
     assert.match(theme,/^(dark|light|auto)$/u);
     await page.locator('#sidebar-stamp-card').click();
     await page.waitForFunction(()=>document.getElementById('stamp-manifesto-modal').open,null,{timeout:5000});
     await page.locator('#stamp-modal-confirm').click();
     await page.waitForFunction(()=>!document.getElementById('stamp-manifesto-modal').open,null,{timeout:5000});
     await page.locator('#sidebar-collapse-btn').click();
     assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('sidebar-collapsed')),'侧栏折叠未生效');
     await page.screenshot({path:path.join(out,'build-options.png')});
     return {route:'#terms',theme};
   });

   await check('Welcome renders in built extension',async()=>{
     await page.goto(`chrome-extension://${id}/ui/welcome.html`);
     await page.locator('#welcome-hero-title').waitFor();
     assert.match(await page.locator('.brand-name').textContent(),/ROAMCAT/u);
     await page.locator('[data-mode="ruby"]').click();
     assert.ok(await page.locator('#sandbox-text ruby').count()>=1,'ruby 形态未生效');
     await page.locator('[data-mode="structure"]').click();
     assert.ok(await page.locator('#sandbox-text .syntax-pred').count()>=1,'解构形态未生效');
     await page.locator('[data-mode="card"]').click();
     assert.ok(await page.locator('#sandbox-hud').isVisible(),'HUD 卡片未恢复');
     await page.locator('#welcome-keycap-display').click();
     assert.match(await page.locator('#welcome-keycap-char').textContent(),/^[A-Z]$/u);
     await page.screenshot({path:path.join(out,'build-welcome.png'),fullPage:false});
     return {sandbox:'card/ruby/structure'};
   });

   await check('content-ui.js loads and factories return refs',async()=>{
     await page.goto(`chrome-extension://${id}/ui/popup.html`);
     await page.addScriptTag({url:`chrome-extension://${id}/content-ui.js`});
     await page.waitForFunction(()=>Boolean(globalThis.RoamCatContentUI?.wordCard),null,{timeout:8000});
     const probes=await page.evaluate(()=>{
       const probe=(make)=>{const host=document.createElement('div');document.documentElement.append(host);const shadow=host.attachShadow({mode:'closed'});const refs=make(shadow);host.remove();return refs;};
       const card=probe(shadow=>globalThis.RoamCatContentUI.wordCard(shadow,{brandIconUrl:'x',kind:'word',sourceText:'t',contextText:'c',handlers:{}}));
       const status=probe(shadow=>globalThis.RoamCatContentUI.taskStatus(shadow,{brandIconUrl:'x',onClose(){}}));
       const detail=probe(shadow=>globalThis.RoamCatContentUI.sentenceDetail(shadow,{brandIconUrl:'x',onClose(){}}));
       const toast=probe(shadow=>globalThis.RoamCatContentUI.knownFeedback(shadow,{brandIconUrl:'x',term:'t',onUndo(){}}));
       const pet=probe(shadow=>globalThis.RoamCatContentUI.petWidget(shadow,{domainKey:'general',domainName:'通用阅读',catSvg:'<svg></svg>',peekingCatSvg:'<svg></svg>',onEdgeTabClick(){}}));
       const petIds=['roamcat-edge-tab','roamcat-flip-btn','quick-reading','quick-summary','quick-options','quick-dock','cat-speech','cat-mode-roaming','cat-mode-peeking','roamcat-zoom-controls','zoom-out','zoom-label','zoom-in','summary-domain-badge','summary-header-refresh','summary-close','summary-content','summary-meta','summary-footer-refresh','summary-copy-btn','copy-btn-text'].every(id=>pet.container.getRootNode().getElementById?.(id)||pet.summaryWindow.querySelector('#'+id));
      const menuDomainSvg=Boolean(pet.container.getRootNode().getElementById?.('summary-domain-badge')?.querySelector('svg'));
       const dd=document.createElement('dd');dd.textContent='old';globalThis.RoamCatContentUI.renderExplanationText(dd,'new text','x');const firstOk=dd.textContent==='new text';dd.textContent='again';globalThis.RoamCatContentUI.renderExplanationText(dd,'second','x');const secondOk=dd.textContent==='second';
       return {
         rerender:firstOk&&secondOk,
         card:Boolean(card.card&&card.answer&&card.explanation&&card.sentenceLine&&card.more&&card.less&&card.repair&&card.known&&card.rescue&&card.retry&&card.wrong&&card.note&&card.speechNotice&&card.sentenceTranslation&&card.sentenceToggle&&card.sourceHeader&&card.original&&card.originalLabel),
         status:Boolean(status.panel&&status.indicator&&status.label&&status.count&&status.more&&status.detail&&status.collapse&&status.close),
         detail:Boolean(detail.panel&&detail.tree&&detail.close),
         toast:Boolean(toast.panel&&toast.message&&toast.undo),
         pet:Boolean(pet.container&&pet.edgeTab&&pet.flipBtn&&pet.quickDock&&pet.avatarWrap&&pet.zoomControls&&pet.summaryWindow&&petIds&&menuDomainSvg),
       };
     });
     assert.deepEqual(probes,{rerender:true,card:true,status:true,detail:true,toast:true,pet:true},'content-ui 工厂返回引用不完整');
   });

   await check('No page errors in built popup',()=>{assert.equal(report.pageErrors.length,0,report.pageErrors.join('；'));});
 }finally{
   await context.close();
 }

 fs.writeFileSync(path.join(out,'build-verification.json'),JSON.stringify(report,null,2));
 console.log(`\n${report.checks.length} 项通过，${report.failures.length} 项失败。报告: preview/build-verification.json`);
 if(report.failures.length)process.exit(1);
})();
