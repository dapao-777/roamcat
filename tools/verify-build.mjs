/**
 * @file tools/verify-build.mjs
 * 文件职责：构建产物门禁（npm run verify:build）——dist/extension 的静态完整性与 ego lite 实际加载验证。
 * 主要内容：源树逐文件字节比对（manifest.json 与 REPLACED_BY_BUILD 除外）→ 产物 manifest 检查（key、__MSG_*__ 引用）
 *   → 产物 HTML 的 CSP 与资源可解析性 → 无头 ego lite 加载 dist/extension，断言扩展 ID 等于
 *   build/extension-key.json 预计算值 → popup / options / welcome / reader 渲染与 content-ui 工厂冒烟。
 * 模块边界：npm 脚本先跑 npm run build 再执行本文件；只读源树与 key 文件，浏览器用临时配置；
 *   报告写 preview/build-verification.json。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {REPO, openBrowser, DIST, EXT_ID, extUrl, noteScreenshots, previewPath} from './lib/ego.mjs';
import {printGateSummary} from './lib/gate-report.mjs';

const source=path.join(REPO,'roamcat-0.0.1','extension'),dist=DIST,out=previewPath();fs.mkdirSync(out,{recursive:true});
const report={checks:[],failures:[],pageErrors:[],byteDrift:[]};
async function check(name,fn){try{const detail=await fn();report.checks.push({name,...(detail?{detail}:{})});console.log('PASS '+name);}catch(e){report.failures.push({name,error:e.message});console.log('FAIL '+name+': '+e.message);}}
function* walkFiles(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const child=path.join(dir,entry.name);if(entry.isDirectory())yield* walkFiles(child);else if(entry.isFile())yield child;}}

const {REPLACED_BY_BUILD}=await import(pathToFileURL(path.join(REPO,'build','extension-plugin.mjs')).href);
const keyFile=JSON.parse(fs.readFileSync(path.join(REPO,'build','extension-key.json'),'utf8'));

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

const run=await openBrowser();
try{
  await check('Extension ID matches generated key',async()=>{
    assert.equal(run.extensionId,keyFile.id,'ego 推导的扩展 ID 与 build/extension-key.json 不一致');
    assert.equal(EXT_ID,keyFile.id);
    return {id:run.extensionId};
  });

  const page=await run.newPage();
  await page.setViewportSize({width:1280,height:720},1);
  page.on('pageerror',e=>report.pageErrors.push(e.message));
  // auto 主题契约是「无 data-theme 属性、由媒体查询驱动」，种一个非 auto 值
  // 才能区分 theme-init.js 已执行与根本没跑。
  await page.addInitScript(()=>{try{if(location.protocol==='chrome-extension:')localStorage.setItem('roamcat_ui_theme','dark');}catch{}});
  await page.goto(extUrl('ui/popup.html'));

  await check('Popup renders in built extension',async()=>{
    // 直接打开弹窗时背后没有可辅助的网页，开关面板按设计隐藏；只要求它已渲染进 DOM。
    await page.locator('.popup-brand-name').waitFor();
    await page.locator('#toggle-page').waitFor({state:'attached'});
    assert.equal(await page.locator('.popup-brand-name').textContent(),'RoamCat');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.body).width),'360px','样式表未生效');
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme||''),'dark','theme-init.js 未执行');
    await page.screenshot({path:path.join(out,'build-popup.png')});
    return {theme:await page.evaluate(()=>document.documentElement.dataset.theme)};
  });

  await check('Options renders and routes in built extension',async()=>{
    await page.goto(extUrl('ui/options.html'));
    await page.locator('#sidebar-collapse-btn').waitFor();
    assert.equal(await page.locator('#section-title').textContent(),'阅读');
    assert.ok(await page.locator('#assistance').isVisible(),'默认分区未显示');
    assert.ok(!(await page.locator('#terms').isVisible()),'非活跃分区应隐藏');
    await page.evaluate(s=>{location.hash='#'+s},'terms');
    await page.waitForFunction(()=>!document.getElementById('terms').hidden&&document.getElementById('assistance').hidden,undefined,{timeout:5000});
    assert.equal(await page.locator('#section-title').textContent(),'词汇与记录');
    assert.equal(await page.locator('#toolbar-breadcrumb-title').textContent(),'术语表');
    await page.locator('#theme-toggle-btn').click();
    const theme=await page.evaluate(()=>document.documentElement.dataset.theme||'auto');
    assert.match(theme,/^(dark|light|auto)$/u);
    // 状态行（含伴读猫入口）只在「阅读」页显示。
    await page.evaluate(s=>{location.hash='#'+s},'assistance');
    await page.locator('#sidebar-stamp-card').click();
    await page.waitForFunction(()=>document.getElementById('stamp-manifesto-modal').open,undefined,{timeout:5000});
    await page.locator('#stamp-modal-confirm').click();
    await page.waitForFunction(()=>!document.getElementById('stamp-manifesto-modal').open,undefined,{timeout:5000});
    const collapsedBefore=await page.evaluate(()=>document.documentElement.classList.contains('sidebar-collapsed'));
    await page.locator('#sidebar-collapse-btn').click();
    assert.notEqual(await page.evaluate(()=>document.documentElement.classList.contains('sidebar-collapsed')),collapsedBefore,'侧栏折叠未生效');
    await page.screenshot({path:path.join(out,'build-options.png')});
    return {route:'#terms',theme};
  });

  await check('Welcome renders in built extension',async()=>{
    await page.goto(extUrl('ui/welcome.html'));
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
    await page.screenshot({path:path.join(out,'build-welcome.png')});
    return {sandbox:'card/ruby/structure'};
  });

  await check('Reader page renders in built extension',async()=>{
    await page.goto(extUrl('ui/reader.html'));
    await page.locator('.reader-status-card').waitFor();
    assert.match(await page.locator('.reader-status-card h1').textContent(),/阅读器/u);
    assert.equal(await page.locator('#reader-file').count(),1,'文件选择器缺失');
    assert.ok(await page.locator('.reader-toolbar .rc-button').count()>=2,'工具栏按钮缺失');
    await page.screenshot({path:path.join(out,'build-reader.png')});
    return {view:'empty'};
  });

  await check('content-ui.js loads and factories return refs',async()=>{
    await page.goto(extUrl('ui/popup.html'));
    await page.addScriptTag({url:extUrl('content-ui.js')});
    await page.waitForFunction(()=>Boolean(globalThis.RoamCatContentUI?.wordCard),undefined,{timeout:8000});
    const probes=await page.evaluate(()=>{
      const probe=(make)=>{const host=document.createElement('div');document.documentElement.append(host);const shadow=host.attachShadow({mode:'closed'});const refs=make(shadow);host.remove();return refs;};
      const card=probe(shadow=>globalThis.RoamCatContentUI.wordCard(shadow,{brandIconUrl:'x',kind:'word',sourceText:'t',contextText:'c',handlers:{}}));
      const status=probe(shadow=>globalThis.RoamCatContentUI.taskStatus(shadow,{brandIconUrl:'x',onClose(){}}));
      const detail=probe(shadow=>globalThis.RoamCatContentUI.sentenceDetail(shadow,{brandIconUrl:'x',onClose(){}}));
      const toast=probe(shadow=>globalThis.RoamCatContentUI.knownFeedback(shadow,{brandIconUrl:'x',term:'t',onUndo(){}}));
      const pet=probe(shadow=>globalThis.RoamCatContentUI.petWidget(shadow,{domainKey:'general',domainName:'通用阅读',catSvg:'<svg></svg>',peekingCatSvg:'<svg></svg>',onEdgeTabClick(){}}));
      const petIds=['roamcat-edge-tab','roamcat-flip-btn','quick-reading','quick-summary','quick-options','cat-speech','cat-mode-roaming','cat-mode-peeking','roamcat-zoom-controls','zoom-out','zoom-label','zoom-in','summary-domain-badge','summary-header-refresh','summary-close','summary-content','summary-meta','summary-footer-refresh','summary-copy-btn','copy-btn-text'].every(id=>pet.container.getRootNode().getElementById?.(id)||pet.summaryWindow.querySelector('#'+id));
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

  await page.pump();
  await check('No page errors in built popup',()=>{assert.equal(report.pageErrors.length,0,report.pageErrors.join('；'));});
}catch(e){
  report.failures.push({name:'gate',error:e.message});console.error(e);
}finally{
  await run.close();
}
noteScreenshots(report);

fs.writeFileSync(path.join(out,'build-verification.json'),JSON.stringify(report,null,2));
console.log(`\n${report.checks.length} 项通过，${report.failures.length} 项失败。报告: preview/build-verification.json`);
if(report.failures.length)process.exitCode=1;
printGateSummary('build',report.checks.length,report.failures.length);
