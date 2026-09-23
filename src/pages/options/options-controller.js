/**
 * @file src/pages/options/options-controller.js
 * 文件职责：设置页表单控制器——11分区表单、服务目录、权限回收与诊断入口。
 *   由 build/port-options-controller.mjs 从 extension/ui/options.js 移植；
 *   分区路由/外壳交互已移交 options-app.js，分区进入钩子见 optionsSectionEnter。
 * 主要内容：STATE_PATCH编排、provider目录、重载扩展按钮。
 * 模块边界：扩展页受信上下文；API_MODELS_LIST仅此页可读。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {DOMAINS, request, activeApiProvider, focusWelcomeGuide} from '@ext/shared.js';
import {API_PROVIDERS, API_SERVICE_CONCURRENCY, getApiProvider, apiProviderBaseUrl, normalizeApiService, apiServiceOrigins} from '@ext/api-providers.mjs';
import {createProviderPicker} from '@ext/ui/provider-picker.js';
import {VIDEO_SUPPORT_ENABLED} from '@ext/activation.js';
import {serviceCatalog} from '@ext/ui/options-service-catalog.js';

const optionsSections = ['assistance','appearance','sites','advanced','terms','personalization','history','privacy','service','diagnostics','guide'];
const optionsLabels = {assistance:'阅读偏好',appearance:'显示与解构',sites:'网站规则',advanced:'领域识别',terms:'生词记忆矩阵',personalization:'已认识词与自适应',history:'阅读记录',privacy:'数据与隐私',service:'模型服务',diagnostics:'运行诊断',guide:'快捷键与使用手册'};
const optionsSourceLabels = {personalized:'个性化倾向',manual:'当前页手动','site-user':'个人站点规则',global:'全局固定','site-built-in':'内置站点规则','local-model':'本地模型',chatgpt:'ChatGPT 增强',grok:'Grok 增强',antigravity:'Google 增强',api:'自定义 API',jev:'Jev 增强',general:'通用回退'};
const diagnosticOperationLabels = {PAGE_SUMMARY:'文章总结',SENTENCE_GROUPS_BATCH:'阅读解构',HISTORY_SUMMARY:'阅读摘要',PERSONALIZATION_ANALYZE:'个性化分析',ASSIST_COMMIT:'帮助记录提交',ASSIST:'阅读辅助',SUPPORT_BATCH:'批量辅助',PASSAGE_TRANSLATE:'选段翻译',EMERGENCY_TRANSLATE:'整页翻译',RESOLVE_DOMAIN:'领域识别',PROVIDER_TEST:'服务测试',CONNECTION:'连接器通信',ANALYZE:'本机分析',PREPARED_ASSIST:'预备辅助',PREPARED_SUPPORT:'预备解释'};
const diagnosticStageLabels = {request:'请求',provider:'服务',first_content:'首段内容',validation:'校验',render:'呈现',connection:'连接',rpc:'通信',stderr:'连接器错误'};
const diagnosticStatusLabels = {start:'开始',ok:'完成',error:'失败',cancelled:'已取消'};
const diagnosticCodeLabels = {STARTUP_FAILED:'连接器启动失败',CODEX_EXIT:'模型进程已退出',RPC_TIMEOUT:'连接器通信超时',TURN_FAILED:'模型处理失败',UNKNOWN:'其他异常',OK:'处理完成',LOCAL_RESULT:'使用本机结果',CACHE_HIT:'使用本机缓存',TIMEOUT:'请求超时',NETWORK:'网络错误',AUTH:'服务认证失败',RATE_LIMIT:'请求过于频繁',HTTP:'服务请求失败',JSON_INVALID:'响应解析失败',OUTPUT_INVALID:'响应格式无效',BATCH_SHAPE:'批次格式无效',BATCH_COUNT:'批次数量不符',ITEM_FIELDS:'结果字段无效',ITEM_ID:'结果标识无效',ITEM_DUPLICATE:'结果重复',TRANSLATION_TYPE:'译文类型无效',TRANSLATION_EMPTY:'译文为空',TRANSLATION_WHITESPACE:'译文含首尾空白',TRANSLATION_LENGTH:'译文长度异常',TRANSLATION_NO_HAN:'译文不含汉字',STALE:'请求状态已过期',CANCELLED:'请求已取消',NOT_READY:'服务尚未准备',DISCONNECTED:'连接器已断开',NATIVE_START:'连接器已启动',NATIVE_EXIT:'连接器已退出',NATIVE_RPC:'连接器通信失败',NATIVE_STDERR:'连接器报告错误',STDERR_AUTH:'连接器认证失败',STDERR_RATE_LIMIT:'连接器请求过频',STDERR_TIMEOUT:'连接器处理超时',STDERR_UNKNOWN:'连接器未知错误',STORAGE_ERROR:'本机存储失败',RENDER_INVALID:'呈现数据无效',NOT_DISPLAYED:'结果未能呈现',INTERRUPTED:'请求意外中断',SLOW_REQUEST:'请求耗时较长',REPEATED_FAILURE:'同类请求多次失败'};
const optionsIds = ['section-title','save-state','global-error','reading-domain','lookup-key','automation-all-sites','automation-video-sites','automation-site-form','automation-site-origin','automation-result','automation-site-list','automation-site-empty','video-font-size','video-theme','detection-chatgpt','detection-api','detection-jev','detection-jev-model','detection-jev-url','detection-jev-key','detection-jev-key-state','clear-detection-jev-key','detection-subscription-model','detection-use-translation-api','detection-api-model','detection-api-fields','detection-api-url','detection-api-key','detection-key-state','clear-detection-key','save-recognition','domain-test-text','run-domain-test','domain-test-result','domain-rule-form','rule-host','rule-path','rule-domain','rule-subdomains','domain-rule-result','domain-rule-list','domain-rule-empty','term-form','term-source','term-translation','term-domain','term-list','term-empty','subscription-panel','api-panel','subscription-dot','subscription-state','subscription-detail','refresh-subscription','subscription-account','subscription-email','subscription-plan','subscription-model','subscription-model-note','login-subscription','cancel-subscription','logout-subscription','test-subscription','subscription-result','subscription-user-code','install-command','install-prereq','install-note','copy-install-command','provider-form','provider-url','provider-concurrency','provider-model','provider-key','key-state','test-provider','disconnect-provider','provider-result','remember-support','export-data','clear-memory','data-result','open-extension-manager','help-language','api-service-select','new-api-service','provider-name','delete-api-service','cancel-api-service', 'reading-style-preview', 'reset-reading-style', 'diagnostics-storage-error','diagnostics-enabled','diagnostics-recording-note','diagnostics-native-dot','diagnostics-native-state','diagnostics-native-note','diagnostics-requests','diagnostics-failures','diagnostics-slow','diagnostics-pending','diagnostics-updated','diagnostics-issues','diagnostics-issues-empty','diagnostics-events','diagnostics-events-empty','export-diagnostics','clear-diagnostics','diagnostics-result','reload-extension'];
const optionsEls = Object.fromEntries(optionsIds.map(id => [id.replace(/-([a-z])/g,(_match,char)=>char.toUpperCase()),document.querySelector(`#${id}`)]));
optionsEls.dataProblem = document.querySelector('#data-problem');
Object.assign(optionsEls,Object.fromEntries(['provider-id','provider-key-link','provider-fields','provider-model-list','provider-model-note','list-provider-models'].map(id=>[id.replace(/-([a-z])/g,(_match,char)=>char.toUpperCase()),document.querySelector('#'+id)])));
const optionsProviderPicker=createProviderPicker(optionsEls.providerId,API_PROVIDERS);
const optionsSentenceDensityInputs=[...document.querySelectorAll('input[name="sentence-density"]')];
const optionsSentenceLineInputs=[...document.querySelectorAll('input[name="sentence-line-style"]')];
const optionsSentenceDensityResult=document.querySelector('#sentence-density-result');
const optionsLookupKeyCopies=[...document.querySelectorAll('[data-lookup-key]')];
const optionsLookupDisplayInputs=[...document.querySelectorAll('input[name="lookup-display"]')];
const optionsSentenceAllSites=document.querySelector('#sentence-groups-all-sites');
const optionsSentencePreview=document.querySelector('#sentence-structure-preview');
const optionsSentencePreviewSource=document.querySelector('#sentence-preview-source');
const ALL_HOSTS=['http://*/*','https://*/*'];
const optionsStructureHighlightNames=new Set();
const optionsReadingLayers = ['original','annotation','translation'];
const optionsReadingControls = Object.fromEntries(optionsReadingLayers.map(layer => [layer,{
  group:document.querySelector('[data-reading-layer="'+layer+'"]'),
  style:document.querySelector('#reading-'+layer+'-style'),
  size:document.querySelector('#reading-'+layer+'-size'),
  color:document.querySelector('#reading-'+layer+'-color'),
  palette:document.querySelector('#reading-'+layer+'-palette')
}]));
let optionsSentenceDensity='medium';
let optionsSentenceLineStyle='solid';
let optionsState = null;
let optionsAutomation = null;
let optionsModels = [];
let optionsProviderDirty = false;let optionsDraftServiceId=null;
let optionsProviderModels=[];
let optionsProviderModelsScope='';
const optionsDraftPermissionPatterns=new Set();
let optionsDetectionDirty = false;
let optionsSubscriptionBusy = false;
let optionsSaveTimer = 0;
let optionsSyncTimer = 0;
let optionsDiagnosticsBusy = false;
let optionsDiagnosticsSequence = 0;
let optionsDiagnosticsTimer = 0;
let optionsCurrentSection = '';
let optionsAppearanceView='structure';
for(const element of document.querySelectorAll('[data-video-feature]'))element.hidden=!VIDEO_SUPPORT_ENABLED;
const optionsAppearanceTabs=[...document.querySelectorAll('[data-appearance-tab]')].filter(tab=>!tab.hidden);
const optionsVideoPreviewStyle=document.createElement('style');
document.head.append(optionsVideoPreviewStyle);

function optionsErrorText(error) { return error instanceof Error ? error.message : String(error); }
function optionsSetResult(element,message,isError=false) { element.textContent=message;element.hidden=!message;element.classList.toggle('error',isError); }
function optionsShowError(error) { optionsSetResult(optionsEls.globalError,optionsErrorText(error),true); }
function optionsClearError() { optionsSetResult(optionsEls.globalError,''); }
function optionsShowSaved(message='已保存') { clearTimeout(optionsSaveTimer);optionsEls.saveState.textContent=message;optionsSaveTimer=setTimeout(()=>{optionsEls.saveState.textContent='';},1800); }
function optionsDomainName(domain) { return DOMAINS[domain] || domain || DOMAINS.general; }
function optionsProviderKind() { const kind=optionsState?.settings?.providerKind; return kind==='api'||kind==='grok'||kind==='antigravity'?kind:'chatgpt'; }
function optionsSubscriptionKind(){const kind=optionsProviderKind();return kind==='grok'||kind==='antigravity'?kind:'chatgpt';}
function optionsInstallCommand(){
  const id=window.chrome?.runtime?.id||'YOUR_EXTENSION_ID';
  const kind=optionsSubscriptionKind();
  return kind==='grok'
    ? `node connector/install.mjs --extension-id ${id} --backend grok`
    : kind==='antigravity'
    ? `node connector/install.mjs --extension-id ${id} --backend antigravity`
    : `node connector/install.mjs --extension-id ${id}`;
}
function optionsLookupKey(){const key=optionsState?.settings?.lookupKey;return typeof key==='string'&&/^[A-Z]$/.test(key)?key:'D';}
function optionsRenderLookupKey(){const key=optionsLookupKey();optionsEls.lookupKey.value=key;for(const copy of optionsLookupKeyCopies)copy.textContent=key;}
function optionsFillDomains(select,includeAuto) { select.replaceChildren();for(const [value,label] of Object.entries(DOMAINS)){if(!includeAuto&&value==='auto')continue;select.append(new Option(value==='auto'?'自动识别':label,value));} }
export function optionsSectionEnter(section,previous){
  if(previous==='diagnostics'&&section!=='diagnostics')void optionsSyncState().catch(optionsShowError);
  clearInterval(optionsDiagnosticsTimer);optionsDiagnosticsTimer=0;
  if(section==='diagnostics'){
    if(previous!==section)void optionsRefreshDiagnostics();
    optionsDiagnosticsTimer=setInterval(()=>void optionsRefreshDiagnostics(),5000);
  }
  // 仅在真正进入「模型服务」区时才刷新连接器：查看其他设置不应拉起本机 CLI 进程。
  if(section==='service'&&optionsState&&optionsProviderKind()!=='api')void optionsRefreshSubscription();
  if(section==='appearance')optionsRenderAppearance();
  optionsCurrentSection=section;
}
function optionsRenderModels(select,selected,note) { select.replaceChildren(new Option('由连接器选择默认模型',''));for(const model of optionsModels)select.append(new Option(model.name||model.id,model.id));select.value=[...select.options].some(option=>option.value===selected)?selected:'';note.textContent=optionsModels.length?'可选择账户当前可用模型。':'连接后刷新可用模型；留空由连接器选择。'; }
function optionsParseOrigin(value) { const entered=value.trim();let parsed;try{parsed=new URL(entered);}catch{throw new Error('请输入完整的网站 origin。');}if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error('网站必须是协议 + 主机，可含端口但不能含路径。');return parsed.origin; }
function optionsRenderAutomation() { const automation=optionsAutomation?.automation||optionsState.settings.automation||{allSites:false,sites:[],videoSites:false};optionsEls.automationAllSites.checked=Boolean(automation.allSites);optionsEls.automationVideoSites.checked=Boolean(automation.videoSites);optionsEls.automationSiteList.replaceChildren();for(const site of automation.sites||[]){const row=document.createElement('div');row.className='automation-site-item';const code=document.createElement('code');code.textContent=site.origin;const toggle=document.createElement('button');toggle.className='secondary-button';toggle.type='button';toggle.textContent=site.enabled?'已启用':'已停用';toggle.addEventListener('click',()=>void optionsToggleSite(site,!site.enabled));const remove=document.createElement('button');remove.className='delete-button';remove.type='button';remove.textContent='移除';remove.addEventListener('click',()=>void optionsToggleSite(site,null));row.append(code,toggle,remove);optionsEls.automationSiteList.append(row);}optionsEls.automationSiteEmpty.hidden=Boolean(automation.sites?.length); }
function optionsDetectionSettings(){return optionsState.settings.domainDetection||{mode:'local',subscriptionModel:'',apiModel:'',useTranslationApi:true,api:{baseUrl:'https://api.openai.com/v1',apiKey:''},jevModel:'typesafe/jev-1.13.0',jevApiKey:'',jevBaseUrl:'https://router.requesty.ai/v1'};}
function optionsRenderDetection(){const value=optionsDetectionSettings();const radio=document.querySelector(`input[name="domain-detection-mode"][value="${value.mode}"]`);if(radio)radio.checked=true;optionsEls.detectionChatgpt.hidden=value.mode!=='chatgpt'&&value.mode!=='grok'&&value.mode!=='antigravity';optionsEls.detectionApi.hidden=value.mode!=='api';if(optionsEls.detectionJev)optionsEls.detectionJev.hidden=value.mode!=='jev';optionsEls.detectionUseTranslationApi.checked=value.useTranslationApi!==false;optionsEls.detectionApiFields.hidden=optionsEls.detectionUseTranslationApi.checked;optionsRenderModels(optionsEls.detectionSubscriptionModel,value.subscriptionModel||'',document.createElement('span'));if(!optionsDetectionDirty){optionsEls.detectionApiModel.value=value.apiModel||'';optionsEls.detectionApiUrl.value=value.api?.baseUrl||'https://api.openai.com/v1';optionsEls.detectionApiKey.value='';if(optionsEls.detectionJevModel)optionsEls.detectionJevModel.value=value.jevModel||'typesafe/jev-1.13.0';if(optionsEls.detectionJevUrl)optionsEls.detectionJevUrl.value=value.jevBaseUrl||'https://router.requesty.ai/v1';if(optionsEls.detectionJevKey)optionsEls.detectionJevKey.value='';}const hasKey=Boolean(value.api?.apiKey);optionsEls.detectionApiKey.placeholder=hasKey?'已保存；同源留空保持':'输入单独的 API Key';optionsEls.detectionKeyState.textContent=hasKey?'单独的识别密钥已保存在本机。':'留空不会复制辅助 API 密钥。';optionsEls.clearDetectionKey.disabled=!hasKey;if(optionsEls.detectionJevKey){const hasJevKey=Boolean(value.jevApiKey);optionsEls.detectionJevKey.placeholder=hasJevKey?'已保存；留空保持':'输入 Jev API Key（TypeSafe 或 Requesty）';if(optionsEls.detectionJevKeyState)optionsEls.detectionJevKeyState.textContent=hasJevKey?'Jev 自定义密钥已保存在本机。':'TypeSafe 官方地址走原生判定协议，其余地址按 Requesty 转发。';if(optionsEls.clearDetectionJevKey)optionsEls.clearDetectionJevKey.disabled=!hasJevKey;}}
function optionsDeleteButton(label,handler){const button=document.createElement('button');button.type='button';button.className='delete-button';button.textContent=label;button.addEventListener('click',handler);return button;}
function optionsRenderRules(){
  const rules=optionsState.settings.domainRules||[];
  optionsEls.domainRuleList.replaceChildren();
  rules.forEach((rule,index)=>{const row=document.createElement('div');row.className='rule-item';const info=document.createElement('div');const strong=document.createElement('b');strong.textContent=`${rule.includeSubdomains?'*.':''}${rule.host}${rule.pathPrefix}`;const domain=document.createElement('span');domain.textContent=optionsDomainName(rule.domain);info.append(strong,domain);row.append(info,optionsDeleteButton('删除',()=>void optionsSavePatch({domainRules:rules.filter((_item,itemIndex)=>itemIndex!==index)},'站点规则已删除')));optionsEls.domainRuleList.append(row);});
  optionsEls.domainRuleEmpty.hidden=Boolean(rules.length);
}
function optionsRenderTerms(){
  const terms=optionsState.settings.customTerms||[];
  optionsEls.termList.replaceChildren();
  terms.forEach((term,index)=>{const row=document.createElement('div');row.className='term-item';const source=document.createElement('h3');source.textContent=term.term;const translation=document.createElement('p');translation.textContent=term.translation;const domain=document.createElement('small');domain.textContent=optionsDomainName(term.domain);row.append(source,translation,domain,optionsDeleteButton('删除',()=>void optionsSavePatch({customTerms:terms.filter((_item,itemIndex)=>itemIndex!==index)},'术语已删除')));optionsEls.termList.append(row);});
  optionsEls.termEmpty.hidden=Boolean(terms.length);
}
function optionsSubscriptionLabel(kind){return kind==='grok'?'Grok':kind==='antigravity'?'Google':'ChatGPT';}
function optionsRenderSubscription(){
  const kind=optionsSubscriptionKind(),label=optionsSubscriptionLabel(kind);
  const subscription=optionsState?.subscription||{};
  const connected=Boolean(subscription.connected),authenticated=Boolean(subscription.authenticated),pending=Boolean(subscription.loginPending);
  optionsEls.subscriptionDot.classList.toggle('active',authenticated);
  optionsEls.subscriptionDot.classList.toggle('connected',connected&&!authenticated);
  optionsEls.subscriptionAccount.hidden=!authenticated;
  optionsEls.subscriptionEmail.textContent=subscription.email||'未提供';
  optionsEls.subscriptionPlan.textContent=subscription.plan||'未提供';
  if(!connected){optionsEls.subscriptionState.textContent='本机连接器未连接';optionsEls.subscriptionDetail.textContent=subscription.error||'请按下方步骤安装连接器。';}
  else if(authenticated){optionsEls.subscriptionState.textContent=label+' 已登录';optionsEls.subscriptionDetail.textContent=subscription.error||'当前账户可用于英文线索与局部中文说明。';}
  else if(pending){optionsEls.subscriptionState.textContent='等待 '+label+' 登录';optionsEls.subscriptionDetail.textContent=subscription.error||'请完成刚打开的登录流程。';}
  else{optionsEls.subscriptionState.textContent='连接器已就绪';optionsEls.subscriptionDetail.textContent=subscription.error||'登录后即可使用订阅权益。';}
  optionsRenderModels(optionsEls.subscriptionModel,optionsState?.settings?.subscriptionModel||'',optionsEls.subscriptionModelNote);
  optionsEls.loginSubscription.textContent='使用 '+label+' 登录';
  optionsEls.loginSubscription.hidden=!connected||authenticated||pending;
  optionsEls.cancelSubscription.hidden=!pending;
  optionsEls.logoutSubscription.hidden=!authenticated;
  optionsEls.loginSubscription.disabled=optionsSubscriptionBusy||!connected;
  optionsEls.cancelSubscription.disabled=optionsSubscriptionBusy;
  optionsEls.logoutSubscription.disabled=optionsSubscriptionBusy;
  optionsEls.refreshSubscription.disabled=optionsSubscriptionBusy;
  optionsEls.subscriptionModel.disabled=optionsSubscriptionBusy||!authenticated;
  optionsEls.testSubscription.disabled=optionsSubscriptionBusy||!['chatgpt','grok','antigravity'].includes(kind)||!optionsState?.providerConfigured;
  document.getElementById('subscription-model-field').hidden=!authenticated;
  optionsEls.testSubscription.hidden=!authenticated;
  if(optionsEls.subscriptionUserCode){
    const code=pending&&subscription.userCode?subscription.userCode:'';
    optionsEls.subscriptionUserCode.hidden=!code;
    optionsEls.subscriptionUserCode.textContent=code?'请在打开的页面输入代码 '+code:'';
  }
  if(optionsEls.installCommand)optionsEls.installCommand.textContent=optionsInstallCommand();
  if(optionsEls.installPrereq)optionsEls.installPrereq.textContent=kind==='grok'
    ?'安装 Node.js 20+ 与官方 Grok CLI（npm i -g @xai-official/grok，Windows 也可用 irm https://x.ai/cli/install.ps1 | iex）后，在项目根目录运行：'
    :kind==='antigravity'
    ?'安装 Node.js 20+ 与官方 Antigravity CLI（macOS / Linux 运行 curl -fsSL https://antigravity.google/cli/install.sh | bash，Windows 运行 irm https://antigravity.google/cli/install.ps1 | iex），先在终端运行 agy 用 Google 账号（Google AI Pro / Ultra 订阅）完成登录，再在项目根目录运行：'
    :'安装 Node.js 20+ 与官方 Codex 后，在项目根目录运行：';
  if(optionsEls.installNote)optionsEls.installNote.textContent=kind==='grok'
    ?'Grok 订阅使用 SuperGrok 或 X Premium+ 权益。连接失效时重新运行安装命令并刷新。Windows 可安装此连接器。'
    :kind==='antigravity'
    ?'Google 订阅使用 Google AI Pro / Ultra 的 Antigravity 权益。登录必须在终端里的 agy 完成，扩展内“登录”按钮只会给出指引；退出请在 agy 里输入 /logout。macOS / Linux / Windows 均可安装此连接器。'
    :'连接失效时重新运行安装命令并刷新，不需要重新选择账户。当前 ChatGPT 连接器安装程序支持 macOS / Linux。';
  const install=document.getElementById('connector-install');
  if(install.dataset.connected!==String(connected)){install.open=!connected;install.dataset.connected=String(connected);}
}
function optionsReadingStyleValue(){return globalThis.RoamCatReadingStyle.validate(Object.fromEntries(optionsReadingLayers.map(layer=>{const controls=optionsReadingControls[layer];return[layer,{style:controls.style.value,color:controls.group.dataset.color||'auto',size:Number(controls.size.value)}];})));}
let optionsReadingDraft=null,optionsReadingWrites=Promise.resolve();
function optionsSaveReadingStyle(readingStyle,message='阅读样式已保存'){optionsReadingDraft=readingStyle;optionsRenderReadingStyle();const save=async()=>{await optionsSavePatch({readingStyle},message);if(optionsReadingDraft===readingStyle){optionsReadingDraft=null;optionsRenderReadingStyle();}};optionsReadingWrites=optionsReadingWrites.then(save,save);return optionsReadingWrites;}
let optionsReadingPreviewObserver=null;
function optionsSizeStylePreview(){const doc=optionsEls.readingStylePreview.contentDocument;if(!doc?.body)return;const height=Math.ceil(doc.body.getBoundingClientRect().height),current=parseFloat(optionsEls.readingStylePreview.style.height)||0;if(current!==height)optionsEls.readingStylePreview.style.height=height+'px';}
function optionsObserveStylePreview(){optionsReadingPreviewObserver?.disconnect();const body=optionsEls.readingStylePreview.contentDocument?.body;if(!body)return;optionsReadingPreviewObserver=new ResizeObserver(optionsSizeStylePreview);optionsReadingPreviewObserver.observe(body);optionsSizeStylePreview();}
function optionsBuildReadingPalettes(){
  for(const layer of optionsReadingLayers){const container=optionsReadingControls[layer].palette;if(container.childElementCount)continue;const choices=[{id:'auto',label:'跟随网页',color:''},...globalThis.RoamCatReadingStyle.palettes];for(const choice of choices){const button=document.createElement('button');button.type='button';button.className='reading-color-option';button.dataset.color=choice.id==='auto'?'auto':choice.color;button.setAttribute('aria-label','颜色：'+choice.label);button.setAttribute('aria-pressed','false');const swatch=document.createElement('span');swatch.className='reading-color-swatch';swatch.setAttribute('aria-hidden','true');if(choice.id==='auto')swatch.dataset.auto='true';else swatch.style.setProperty('--swatch-color',choice.color);const label=document.createElement('span');label.textContent=choice.label;button.append(swatch,label);container.append(button);}}
}
function optionsUpdateReadingColorUI(layer){const controls=optionsReadingControls[layer],selected=controls.group.dataset.color||'auto';let preset=false;for(const button of controls.palette.querySelectorAll('button')){const active=button.dataset.color.toLowerCase()===selected.toLowerCase();button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));preset||=active;}controls.color.closest('.reading-custom-color').classList.toggle('selected',!preset);}
function optionsPreviewReadingStyle(value){
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || (document.documentElement.getAttribute('data-theme') !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  const theme = isDark ? 'dark' : 'light';
  const css=globalThis.RoamCatDesign.cssFor(':root', theme)+'body{margin:0;padding:16px;font:16px/1.65 var(--sans);color:var(--ink);background:var(--paper);overflow-wrap:anywhere}p{margin:0 0 12px}'+globalThis.RoamCatReadingStyle.css(value,{mark:'#preview-word',hint:'#preview-hint',block:'#preview-translation',annotation:'#preview-annotation'});
  const doc=optionsEls.readingStylePreview.contentDocument;
  if(doc?.documentElement)doc.documentElement.setAttribute('data-theme',theme);
  const existing=doc?.getElementById('preview-style');
  if(existing){existing.textContent=css;optionsSizeStylePreview();return;}
  optionsEls.readingStylePreview.srcdoc='<!doctype html><html lang="en" data-theme="'+theme+'"><meta charset="utf-8"><style id="preview-style">'+css+'</style><body><p>The model uses <span id="preview-annotation" data-roamcat-annotation="推理"><span id="preview-word">reasoning</span><span id="preview-hint" lang="zh-CN">推理</span></span> to compare possible answers.</p><div id="preview-translation" lang="zh-CN"><p>模型通过推理比较可能的答案。</p></div></body></html>';
}
function optionsRenderReadingStyle(){optionsBuildReadingPalettes();const value=globalThis.RoamCatReadingStyle.normalize(optionsReadingDraft||optionsState.settings.readingStyle);for(const layer of optionsReadingLayers){const controls=optionsReadingControls[layer],layerValue=value[layer];controls.style.value=layerValue.style;controls.size.value=String(layerValue.size);controls.group.dataset.color=layerValue.color;controls.color.value=layerValue.color==='auto'?globalThis.RoamCatReadingStyle.palettes[0].color:layerValue.color;optionsUpdateReadingColorUI(layer);}optionsPreviewReadingStyle(value);}
function optionsDiscardProviderDraft(){return !optionsProviderDirty||confirm('表单有未保存的更改。确定放弃这些更改吗？');}
function optionsProviderOptions(){return Object.fromEntries([...optionsEls.providerFields.querySelectorAll('[data-provider-option]')].map(input=>[input.dataset.providerOption,input.value.trim()]));}
function optionsRenderProviderFields(meta,values={}){
  optionsEls.providerFields.replaceChildren();
  for(const field of meta.fields||[]){const label=document.createElement('label');label.className='field';const title=document.createElement('span');title.textContent=field.label;let input;if(field.type==='select'){input=document.createElement('select');for(const choice of field.options||[])input.append(new Option(choice.label,choice.value));}else{input=document.createElement('input');input.type='text';input.autocomplete='off';input.spellcheck=false;if(field.placeholder)input.placeholder=field.placeholder;}input.dataset.providerOption=field.key;input.value=values[field.key]??field.defaultValue??'';input.required=true;input.addEventListener('input',()=>{optionsProviderDirty=true;optionsInvalidateProviderModels();if(meta.id==='azure'&&(field.key==='resourceName'||field.key==='apiMode'))optionsEls.providerUrl.value=apiProviderBaseUrl(meta.id,optionsProviderOptions());});input.addEventListener('change',()=>{optionsProviderDirty=true;optionsInvalidateProviderModels();if(meta.id==='azure'||meta.id==='bedrock'||meta.id==='stepfun')optionsEls.providerUrl.value=apiProviderBaseUrl(meta.id,optionsProviderOptions());});label.append(title,input);optionsEls.providerFields.append(label);}
}
function optionsModelScope(service){return JSON.stringify([service.providerId,service.baseUrl,service.apiKey,service.options]);}
function optionsCurrentModelScope(){try{return optionsModelScope(optionsCurrentProviderService({allowEmptyModel:true}));}catch{return '';}}
function optionsRenderProviderModels(){
  optionsEls.providerModelList.replaceChildren(new Option(optionsProviderModels.length?'选择已获取的模型':'获取后选择',''),...optionsProviderModels.map(model=>new Option(model.name||model.id,model.id)));
  optionsEls.providerModelList.value=optionsProviderModels.some(model=>model.id===optionsEls.providerModel.value)?optionsEls.providerModel.value:'';
  optionsEls.providerModelNote.textContent=optionsProviderModels.length?'已获取 '+optionsProviderModels.length+' 个模型；仍可手动填写模型 ID。':'也可直接填写模型 ID。';
}
function optionsInvalidateProviderModels(){optionsProviderModels=[];optionsProviderModelsScope='';optionsRenderProviderModels();}
function optionsRenderProvider(){const kind=optionsProviderKind(),radio=document.querySelector('input[name="provider-kind"][value="'+kind+'"]');if(radio)radio.checked=true;
  const isApi = Boolean(optionsDraftServiceId) || (typeof serviceCatalog !== 'undefined' && serviceCatalog?.userSelected ? !['chatgpt', 'grok', 'antigravity'].includes(serviceCatalog.selectedKey) : kind === 'api');
  optionsEls.subscriptionPanel.hidden=isApi;optionsEls.apiPanel.hidden=!isApi;optionsRenderSubscription();
  const services=optionsState.settings.apiServices||[],active=activeApiProvider(optionsState.settings),provider=optionsDraftServiceId?{id:optionsDraftServiceId,name:'',providerId:'openai',baseUrl:'',model:'',apiKey:'',options:{}}:active;
  optionsEls.apiServiceSelect.replaceChildren(...services.map(service=>new Option(service.name+' · '+service.model,service.id)));if(!services.length)optionsEls.apiServiceSelect.append(new Option('尚未保存 API 服务',''));optionsEls.apiServiceSelect.value=optionsState.settings.activeApiServiceId||'';optionsEls.apiServiceSelect.disabled=!services.length;
  if(!optionsProviderDirty){const providerId=provider?(provider.providerId||'openai-compatible'):'openai',meta=getApiProvider(providerId)||getApiProvider('openai-compatible');optionsEls.providerId.value=meta.id;optionsRenderProviderFields(meta,provider?.options||{});optionsEls.providerName.value=provider?.name||meta.name;optionsEls.providerUrl.value=provider?.baseUrl||apiProviderBaseUrl(meta.id,provider?.options||{});optionsEls.providerConcurrency.value=provider?.maxConcurrency??API_SERVICE_CONCURRENCY.default;optionsEls.providerModel.value=provider?.model||meta.defaultModel||'';optionsEls.providerKey.value='';}
  if(optionsProviderModelsScope!==optionsCurrentModelScope()){optionsProviderModels=[];optionsProviderModelsScope='';}
  optionsProviderPicker.sync();
  const meta=getApiProvider(optionsEls.providerId.value),hasKey=Boolean(provider?.apiKey);optionsEls.providerKeyLink.hidden=!meta?.apiKeyUrl;optionsEls.providerKeyLink.href=meta?.apiKeyUrl||'#';optionsEls.providerKey.required=!meta?.keyOptional&&!hasKey;optionsEls.providerKey.placeholder=hasKey?'已保存；服务商与域名不变时留空保持':meta?.keyOptional?'可选':'输入此服务的 API Key';optionsEls.keyState.textContent=meta?.keyOptional?'本地服务可不填密钥；填写后也只用于此服务。':hasKey?'密钥保存在本机；更换服务商或域名不会带入。':'密钥只用于此服务，不会复制到其他服务。';
  optionsRenderProviderModels();
  optionsEls.testProvider.disabled=kind!=='api'||!active||Boolean(optionsDraftServiceId)||optionsProviderDirty;optionsEls.disconnectProvider.disabled=!active?.apiKey||Boolean(optionsDraftServiceId);optionsEls.deleteApiService.disabled=!active||Boolean(optionsDraftServiceId);optionsEls.cancelApiService.hidden=!optionsDraftServiceId;optionsEls.newApiService.disabled=services.length>=20;
  const editor=document.getElementById('api-editor');
  if(!active||optionsDraftServiceId)editor.open=true;
  editor.querySelector('summary').textContent=optionsDraftServiceId||!active?'配置 API 服务':'编辑当前服务';
  serviceCatalog.sync();
  window.serviceCatalog=serviceCatalog;
}
function optionsRenderSentenceDensity(){optionsRenderDetailMeter();for(const input of optionsSentenceDensityInputs)input.checked=input.value===optionsSentenceDensity;}
function optionsRenderSentenceLineStyle(){for(const input of optionsSentenceLineInputs)input.checked=input.value===optionsSentenceLineStyle;}
function optionsRenderSentenceAllSites(){optionsSentenceAllSites.checked=Boolean((optionsAutomation?.automation||optionsState?.settings?.automation)?.sentenceGroupsAllSites);}
function optionsStructureSegments(){
  const relative='that each explanation provides',adverbial='before they reach a conclusion';
  if(optionsSentenceDensity==='coarse')return[['attributive',relative,3],['adverbial',adverbial,3]];
  const fine=optionsSentenceDensity==='fine',segments=[['subject','Careful readers',3],['predicate','compare',3],['object','the evidence '+relative,fine?9:3],['adverbial',adverbial,fine?9:3]];
  if(fine)segments.push(['attributive',relative,3],['subject','they',3],['predicate','reach',3],['object','a conclusion',3]);
  return segments;
}
function optionsClearStructureHighlights(){if(!globalThis.CSS?.highlights)return;for(const name of optionsStructureHighlightNames)CSS.highlights.delete(name);optionsStructureHighlightNames.clear();}
function optionsRenderStructureLegend(){
  const row=document.querySelector('.structure-legend-row');
  if(!row)return;
  const {structureColors:colors,structureRoles:roles}=globalThis.RoamCatDesign;
  const isDark=document.documentElement.getAttribute('data-theme')==='dark'||(document.documentElement.getAttribute('data-theme')!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);
  const dark=isDark?1:0;
  for(const item of row.querySelectorAll('.structure-legend-item')){
    const role=item.dataset.role,dot=item.querySelector('.legend-dot');
    if(dot&&roles[role]&&colors[roles[role][1]])dot.style.backgroundColor=colors[roles[role][1]][dark];
  }
}
function optionsRenderStructurePreview(){
  if(optionsSentencePreview.hidden||!globalThis.CSS?.highlights)return;
  const isDark=document.documentElement.getAttribute('data-theme')==='dark'||(document.documentElement.getAttribute('data-theme')!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);
  const text=optionsSentencePreviewSource.firstChild,{structureColors:colors,structureRoles:roles}=globalThis.RoamCatDesign,dark=isDark?1:0;
  optionsClearStructureHighlights();
  let css=document.querySelector('#sentence-preview-highlight-style');if(!css){css=document.createElement('style');css.id='sentence-preview-highlight-style';document.head.append(css);}
  const rules=[];
  for(const [role,fragment,offset] of optionsStructureSegments()){
    const start=text.data.indexOf(fragment);if(start<0)continue;
    const range=new Range();range.setStart(text,start);range.setEnd(text,start+fragment.length);
    const name='roamcat-preview-'+role+'-'+offset;let highlight=CSS.highlights.get(name);
    const thickness = role === 'predicate' ? '2px' : (role === 'attributive' || role === 'adverbial' ? '1.25px' : '1.5px');
    if(!highlight){highlight=new Highlight();highlight.priority=offset===9?0:1;CSS.highlights.set(name,highlight);optionsStructureHighlightNames.add(name);rules.push('::highlight('+name+'){text-decoration:underline '+optionsSentenceLineStyle+' '+colors[roles[role][1]][dark]+' '+thickness+';text-underline-offset:'+offset+'px;text-decoration-skip-ink:auto}');}
    highlight.add(range);
  }
  css.textContent=rules.join('');
  optionsRenderStructureLegend();
}
function optionsRefreshStructurePreview(){optionsRenderAppearance();}
function optionsRenderAppearance(){
  const view=optionsAppearanceView;
  for(const tab of optionsAppearanceTabs){const active=tab.dataset.appearanceTab===view;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
  for(const panel of document.querySelectorAll('[data-appearance-panel]'))panel.hidden=panel.dataset.appearancePanel!==view;
  optionsSentencePreview.hidden=view!=='structure';
  optionsEls.readingStylePreview.hidden=!optionsReadingLayers.includes(view);
  optionsEls.resetReadingStyle.parentElement.hidden=!optionsReadingLayers.includes(view);
  const videoPreview=document.getElementById('video-style-preview');videoPreview.hidden=view!=='video';
  if(view==='structure')optionsRenderStructurePreview();else optionsClearStructureHighlights();
  if(optionsReadingLayers.includes(view))optionsSizeStylePreview();
  if(view==='video'){
    const video=optionsState?.settings?.video||{fontSize:20,theme:'auto'};
    optionsVideoPreviewStyle.textContent=globalThis.RoamCatDesign.cssFor('#video-style-preview',video.theme);
    videoPreview.querySelector('p').style.fontSize=video.fontSize+'px';
  }
}
function optionsSelectAppearance(view){optionsAppearanceView=view;optionsRenderAppearance();}
function optionsRenderAll(){
  optionsRenderReadingReadout();
  optionsEls.readingDomain.value=optionsState.settings.domain||'auto';
  optionsRenderLookupKey();
  for(const input of optionsLookupDisplayInputs)input.checked=input.value===(optionsState.settings.lookupDisplay||'card');
  optionsEls.helpLanguage.value=optionsState.settings.helpLanguage||'zh';
  const mode=document.querySelector('input[name="assistance-mode"][value="'+(optionsState.settings.assistanceMode||'ambient')+'"]');
  if(mode)mode.checked=true;
  optionsEls.rememberSupport.checked=optionsState.settings.rememberSupport!==false;
  const petCheckbox = document.querySelector('#floating-pet-enabled');
  const petEnabled = optionsState.settings.floatingPet?.enabled !== false;
  if (petCheckbox) petCheckbox.checked = petEnabled;
  const petStatus = document.querySelector('#stamp-pet-status');
  if (petStatus) {
    petStatus.classList.toggle('is-on', petEnabled);
    petStatus.querySelector('.stamp-status-text').textContent = petEnabled ? '伴读猫 · 在线' : '伴读猫 · 已关闭';
  }
  const petThemeSelect = document.querySelector('#floating-pet-theme');
  if (petThemeSelect) petThemeSelect.value = optionsState.settings.floatingPet?.themeMode || 'auto';
  optionsSetResult(optionsEls.dataProblem,optionsState.dataProblem||'',Boolean(optionsState.dataProblem));
  const video=optionsState.settings.video||{fontSize:20,theme:'auto'};
  optionsEls.videoFontSize.value=String(video.fontSize||20);optionsEls.videoTheme.value=video.theme||'auto';
  optionsRenderAutomation();optionsRenderSentenceAllSites();optionsRenderDetection();optionsRenderReadingStyle();optionsRenderSentenceDensity();optionsRenderSentenceLineStyle();optionsRenderRules();optionsRenderTerms();optionsRenderProvider();void optionsRefreshStructurePreview();syncChoiceCards();
}
async function optionsSavePatch(patch,message='已保存'){optionsClearError();try{optionsState=await request('STATE_PATCH',{patch});window.optionsState=optionsState;optionsRenderAll();optionsShowSaved(message);return true;}catch(error){optionsShowError(error);optionsRenderAll();return false;}}
async function optionsPatchAutomation(patch,message){optionsClearError();try{optionsAutomation=await request('AUTOMATION_PATCH',{patch});optionsState.settings.automation=optionsAutomation.automation;optionsRenderAutomation();optionsRenderSentenceAllSites();void optionsRefreshStructurePreview();optionsShowSaved(message);return true;}catch(error){optionsShowError(error);optionsRenderAutomation();optionsRenderSentenceAllSites();void optionsRefreshStructurePreview();return false;}}
async function optionsSetSentenceLineStyle(lineStyle){
  if(!['solid','dashed','dotted','wavy'].includes(lineStyle))return;
  const previous=optionsSentenceLineStyle;optionsSentenceLineStyle=lineStyle;optionsRenderSentenceLineStyle();optionsRenderStructurePreview();
  optionsSentenceLineInputs.forEach(input=>{input.disabled=true;});optionsSetResult(optionsSentenceDensityResult,'正在保存…');
  try{const saved=await request('SENTENCE_GROUPS_LINE_STYLE_SET',{lineStyle});optionsSentenceLineStyle=saved.lineStyle;optionsRenderSentenceLineStyle();optionsRenderStructurePreview();optionsSetResult(optionsSentenceDensityResult,'下划线样式已保存，并已应用到开启的阅读页。');optionsShowSaved('下划线样式已保存');}
  catch(error){optionsSentenceLineStyle=previous;optionsRenderSentenceLineStyle();optionsRenderStructurePreview();optionsSetResult(optionsSentenceDensityResult,optionsErrorText(error),true);}
  finally{optionsSentenceLineInputs.forEach(input=>{input.disabled=false;});}
}
async function optionsSetSentenceDensity(density){
  if(!['coarse','medium','fine'].includes(density))return;
  const showResult=(message,isError=false)=>{optionsSetResult(optionsSentenceDensityResult,message,isError);optionsSetResult(document.querySelector('#detail-meter-result'),message,isError);};
  const previous=optionsSentenceDensity;optionsSentenceDensity=density;optionsRenderSentenceDensity();optionsRenderStructurePreview();
  optionsSentenceDensityInputs.forEach(input=>{input.disabled=true;});document.querySelector('#matrix-index-range').disabled=true;showResult('正在保存…');
  try{const saved=await request('SENTENCE_GROUPS_DENSITY_SET',{density});optionsSentenceDensity=['coarse','medium','fine'].includes(saved?.density)?saved.density:density;optionsRenderSentenceDensity();optionsRenderStructurePreview();showResult('解构粒度已保存，并已应用到开启的阅读页。');optionsShowSaved('解构粒度已保存');}
  catch(error){optionsSentenceDensity=previous;optionsRenderSentenceDensity();optionsRenderStructurePreview();showResult(optionsErrorText(error),true);}
  finally{optionsSentenceDensityInputs.forEach(input=>{input.disabled=false;});document.querySelector('#matrix-index-range').disabled=false;}
}
async function optionsToggleSite(site,enabled){const sites=optionsAutomation.automation.sites.filter(item=>item.origin!==site.origin);if(enabled!==null)sites.push({...site,enabled});await optionsPatchAutomation({sites},enabled===null?'网站已移除':'网站设置已保存');}
function optionsParseProviderURL(value){const baseUrl=value.trim();if(!baseUrl||baseUrl.length>2048)throw new Error('请输入有效的 API 地址。');let url;try{url=new URL(baseUrl);}catch{throw new Error('请输入有效的 API 地址。');}const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);if(!url.hostname||(url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback)))throw new Error('API 地址必须使用 HTTPS；仅本机地址可使用 HTTP。');if(url.username||url.password||url.search||url.hash)throw new Error('API 地址不能包含用户名、密码、查询参数或片段。');return{baseUrl:baseUrl.replace(/\/+$/,''),url};}
function optionsOriginPattern(baseUrl){try{return baseUrl?`${new URL(baseUrl).origin}/*`:'';}catch{return'';}}
function optionsCredentialPatterns(settings){const patterns=new Set();for(const service of settings.apiServices||[])if(service.baseUrl)patterns.add(optionsOriginPattern(service.baseUrl));if(settings.domainDetection?.api?.apiKey&&settings.domainDetection?.api?.baseUrl)patterns.add(optionsOriginPattern(settings.domainDetection.api.baseUrl));if(settings.domainDetection?.jevApiKey)patterns.add(optionsOriginPattern(settings.domainDetection.jevBaseUrl||'https://router.requesty.ai/v1'));for(const site of settings.automation?.sites||[])if(site.enabled)patterns.add(site.origin+'/*');patterns.delete('');return patterns;}
async function optionsRemoveUnusedPermissions(before,after){if(after.automation?.allSites||after.automation?.sentenceGroupsAllSites)return;const needed=optionsCredentialPatterns(after);for(const pattern of optionsCredentialPatterns(before))if(!needed.has(pattern))await chrome.permissions.remove({origins:[pattern]});}
async function optionsEnsurePermission(pattern,needed){if(!needed)return false;const had=await chrome.permissions.contains({origins:[pattern]});const granted=had||await chrome.permissions.request({origins:[pattern]});if(!granted)throw new Error('未获得该服务域名的访问权限，配置尚未保存。');return !had;}
function optionsParseConcurrency(value){const n=Math.trunc(Number(value));if(!Number.isInteger(n)||n<API_SERVICE_CONCURRENCY.min||n>API_SERVICE_CONCURRENCY.max)throw new Error(`并发数须为 ${API_SERVICE_CONCURRENCY.min}–${API_SERVICE_CONCURRENCY.max} 的整数。`);return n;}
function optionsCurrentProviderService({allowEmptyModel=false}={}){
  const before=optionsState.settings,current=optionsDraftServiceId?null:activeApiProvider(before),providerId=optionsEls.providerId.value,options=optionsProviderOptions(),baseUrl=optionsEls.providerUrl.value.trim()||apiProviderBaseUrl(providerId,options),pattern=optionsOriginPattern(baseUrl),sameCredentialScope=(current?.providerId||'openai-compatible')===providerId&&optionsOriginPattern(current?.baseUrl)===pattern,enteredKey=optionsEls.providerKey.value.trim();
  const service=normalizeApiService({id:optionsDraftServiceId||current?.id||crypto.randomUUID(),name:optionsEls.providerName.value.trim()||getApiProvider(providerId)?.name||'',providerId,baseUrl,model:optionsEls.providerModel.value.trim(),apiKey:enteredKey||(sameCredentialScope?current?.apiKey||'':''),options,maxConcurrency:optionsParseConcurrency(optionsEls.providerConcurrency.value)});
  if(!allowEmptyModel&&!service.model)throw new Error('请填写模型 ID。');if(service.name.length>60||service.model.length>150||service.apiKey.length>4096)throw new Error('请检查服务名称、模型和密钥长度。');if(!getApiProvider(providerId)?.keyOptional&&!service.apiKey)throw new Error('请填写此服务的 API Key。');return service;
}
async function optionsCleanupDraftPermissions(){for(const pattern of optionsDraftPermissionPatterns){if(!optionsCredentialPatterns(optionsState.settings).has(pattern))await chrome.permissions.remove({origins:[pattern]}).catch(()=>{});}optionsDraftPermissionPatterns.clear();}
async function optionsListProviderModels(){optionsSetResult(optionsEls.providerResult,'正在获取模型…');optionsEls.listProviderModels.disabled=true;let service,pattern,granted=false;try{service=optionsCurrentProviderService({allowEmptyModel:true});pattern=apiServiceOrigins(service)[0]+'/*';granted=await optionsEnsurePermission(pattern,true);if(granted)optionsDraftPermissionPatterns.add(pattern);const scope=optionsModelScope(service),result=await request('API_MODELS_LIST',{service});if(scope!==optionsCurrentModelScope()){optionsSetResult(optionsEls.providerResult,'配置已更改，请重新获取模型。');return;}optionsProviderModelsScope=scope;optionsProviderModels=Array.isArray(result.models)?result.models.filter(model=>model&&typeof model.id==='string'):[];optionsRenderProvider();optionsSetResult(optionsEls.providerResult,optionsProviderModels.length?'已获取模型。可从列表选择，或继续手动填写 ID。':'服务商返回了空模型列表，请手动填写模型 ID。');}catch(error){if(granted){optionsDraftPermissionPatterns.delete(pattern);await chrome.permissions.remove({origins:[pattern]}).catch(()=>{});}optionsSetResult(optionsEls.providerResult,'无法获取模型：'+optionsErrorText(error)+' 仍可手动填写模型 ID。',true);}finally{optionsEls.listProviderModels.disabled=false;}}
async function optionsSaveProvider(event){
  event.preventDefault();optionsSetResult(optionsEls.providerResult,'');let service,pattern,granted=false;const before=structuredClone(optionsState.settings),current=optionsDraftServiceId?null:activeApiProvider(before);
  try{service=optionsCurrentProviderService();pattern=apiServiceOrigins(service)[0]+'/*';granted=await optionsEnsurePermission(pattern,true);const services=before.apiServices||[],apiServices=services.some(item=>item.id===service.id)?services.map(item=>item.id===service.id?service:item):[...services,service];if(!await optionsSavePatch({providerKind:'api',apiServices,activeApiServiceId:service.id},'服务已保存并切换')){if(granted&&!optionsCredentialPatterns(before).has(pattern))await chrome.permissions.remove({origins:[pattern]});return;}optionsDraftPermissionPatterns.delete(pattern);optionsDraftServiceId=null;optionsProviderDirty=false;await optionsRemoveUnusedPermissions(before,optionsState.settings);optionsRenderProvider();document.getElementById('api-editor').open=false;optionsSetResult(optionsEls.providerResult,'已保存；其他服务配置保持不变。');}
  catch(error){if(granted&&!optionsCredentialPatterns(optionsState.settings).has(pattern))await chrome.permissions.remove({origins:[pattern]}).catch(()=>{});optionsSetResult(optionsEls.providerResult,optionsErrorText(error),true);}
}
async function optionsSaveDetection(){const mode=document.querySelector('input[name="domain-detection-mode"]:checked')?.value||'local',before=structuredClone(optionsState.settings),current=optionsDetectionSettings(),useTranslationApi=optionsEls.detectionUseTranslationApi.checked;let api=current.api||{baseUrl:'https://api.openai.com/v1',apiKey:''},parsed=null,granted=false,jevGranted=false,parsedJev=null,jevOrigin='https://router.requesty.ai/*';try{if(mode==='api'&&!useTranslationApi){parsed=optionsParseProviderURL(optionsEls.detectionApiUrl.value);const entered=optionsEls.detectionApiKey.value.trim();if(entered.length>4096)throw new Error('识别 API Key 过长。');api={baseUrl:parsed.baseUrl,apiKey:entered||(optionsOriginPattern(api.baseUrl)===`${parsed.url.origin}/*`?api.apiKey||'':'')};if(!optionsEls.detectionApiModel.value.trim())throw new Error('请填写识别模型。');granted=await optionsEnsurePermission(`${parsed.url.origin}/*`,Boolean(api.apiKey));}if(mode==='jev'&&optionsEls.detectionJevUrl){parsedJev=optionsParseProviderURL(optionsEls.detectionJevUrl.value||'https://router.requesty.ai/v1');jevOrigin=`${parsedJev.url.origin}/*`;}const jevBaseUrl=parsedJev?parsedJev.baseUrl:(optionsEls.detectionJevUrl?.value?.trim()||current.jevBaseUrl||'https://router.requesty.ai/v1');const jevModel=(optionsEls.detectionJevModel?.value?.trim())||current.jevModel||'typesafe/jev-1.13.0';const enteredJevKey=optionsEls.detectionJevKey?.value?.trim()||'';if(enteredJevKey.length>4096)throw new Error('Jev API Key 过长。');const jevApiKey=enteredJevKey||current.jevApiKey||'';if(mode==='jev'){if(!jevApiKey)throw new Error('请填写 Jev API Key。');if(!jevModel)throw new Error('请填写 Jev 模型。');jevGranted=await optionsEnsurePermission(jevOrigin,true);}const saved=await optionsSavePatch({domainDetection:{mode,subscriptionModel:optionsEls.detectionSubscriptionModel.value,apiModel:optionsEls.detectionApiModel.value.trim(),useTranslationApi,api,jevModel,jevApiKey,jevBaseUrl}},'领域识别设置已保存');if(!saved){if(granted)await chrome.permissions.remove({origins:[`${parsed.url.origin}/*`]});if(jevGranted)await chrome.permissions.remove({origins:[jevOrigin]});return;}optionsDetectionDirty=false;await optionsRemoveUnusedPermissions(before,optionsState.settings);optionsRenderDetection();}catch(error){optionsShowError(error);}}
async function optionsTestProvider(element){optionsSetResult(element,'正在测试当前服务…');optionsEls.testProvider.disabled=true;optionsEls.testSubscription.disabled=true;try{const result=await request('PROVIDER_TEST');optionsSetResult(element,`测试提示：${result.hint}`);}catch(error){optionsSetResult(element,`测试失败：${optionsErrorText(error)}`,true);}finally{optionsRenderProvider();}}
async function optionsSyncState(){if(optionsCurrentSection==='diagnostics')return;[optionsState,optionsAutomation]=await Promise.all([request('STATE_GET'),request('AUTOMATION_GET')]);optionsState.settings.automation=optionsAutomation.automation;window.optionsState=optionsState;optionsRenderAll();}
async function optionsLoadModels(refresh=false){let loaded=true;try{const result=await request('MODELS_LIST',{refresh,kind:optionsSubscriptionKind()});optionsModels=Array.isArray(result.models)?result.models:[];}catch(error){loaded=false;optionsSetResult(optionsEls.subscriptionResult,'模型列表刷新失败：'+optionsErrorText(error),true);}if(optionsState){optionsRenderSubscription();optionsRenderDetection();}return loaded;}
async function optionsRefreshSubscription(refresh=false){if(optionsSubscriptionBusy||optionsProviderKind()==='api')return;optionsSubscriptionBusy=true;optionsRenderSubscription();try{const kind=optionsSubscriptionKind();const subscription=await request('SUBSCRIPTION_STATUS',{kind});optionsState.subscription=subscription;await optionsSyncState();if(!subscription.connected||subscription.error){optionsSetResult(optionsEls.subscriptionResult,'');return;}if(await optionsLoadModels(refresh))optionsSetResult(optionsEls.subscriptionResult,'账户与模型已更新。');}catch(error){optionsSetResult(optionsEls.subscriptionResult,optionsErrorText(error),true);}finally{optionsSubscriptionBusy=false;optionsRenderSubscription();}}
async function optionsSubscriptionAction(type){if(optionsSubscriptionBusy)return;optionsSubscriptionBusy=true;optionsRenderSubscription();try{const kind=optionsSubscriptionKind();optionsState.subscription=await request(type,{kind});await optionsSyncState();optionsSetResult(optionsEls.subscriptionResult,type==='SUBSCRIPTION_LOGOUT'?'已退出 '+ optionsSubscriptionLabel(kind) +' 登录。':'状态已更新。');}catch(error){optionsSetResult(optionsEls.subscriptionResult,optionsErrorText(error),true);}finally{optionsSubscriptionBusy=false;optionsRenderSubscription();}}
async function optionsExportData(){optionsSetResult(optionsEls.dataResult,'正在导出…');try{const payload=await request('READING_DATA_EXPORT');const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`roamcat-support-data-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);optionsSetResult(optionsEls.dataResult,'本机支持数据已导出。');}catch(error){optionsSetResult(optionsEls.dataResult,optionsErrorText(error),true);}}
function optionsDiagnosticNumber(value){return Number.isFinite(value)&&value>=0?String(value):'—';}
function optionsDiagnosticTime(value){if(!Number.isFinite(value))return '时间未知';const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('zh-CN',{hour12:false}):'时间未知';}
function optionsDiagnosticFingerprint(event){const ref=event.modelRef||event.providerRef;return typeof ref==='string'?ref.slice(0,12)+'…':'';}
function optionsDiagnosticLabel(code){return diagnosticCodeLabels[code]||'其他异常';}
function optionsRenderDiagnostics(payload){
  const summary=payload?.summary||{},native=payload?.native||{};
  optionsEls.diagnosticsEnabled.checked=payload?.enabled!==false;
  optionsEls.diagnosticsRecordingNote.textContent=payload?.enabled===false?'诊断记录已关闭；已有记录会按保留规则清理。':'已开启，仅记录去除正文与响应后的结构化信息。';
  optionsEls.diagnosticsStorageError.hidden=!payload?.storageError;
  optionsEls.diagnosticsNativeDot.classList.toggle('active',Boolean(native.connected));
  optionsEls.diagnosticsNativeState.textContent=native.connected?'连接器已连接':'连接器未连接';
  optionsEls.diagnosticsNativeNote.textContent=native.pendingClear?'连接器文件的清空请求待下次连接执行；不会为此启动连接器。':native.connected?(native.mirror?'本机诊断镜像通道已就绪。':'连接器可用；诊断设置尚未同步，请更新连接器后刷新连接。'):'可导出扩展诊断；连接器开关将在下次连接同步，查看诊断不会拉起连接器。';
  optionsEls.diagnosticsRequests.textContent=optionsDiagnosticNumber(summary.requests);
  optionsEls.diagnosticsFailures.textContent=optionsDiagnosticNumber(summary.failures);
  optionsEls.diagnosticsSlow.textContent=optionsDiagnosticNumber(summary.slow);
  optionsEls.diagnosticsPending.textContent=optionsDiagnosticNumber(summary.pending);
  const issues=Array.isArray(summary.issues)?summary.issues:[];
  optionsEls.diagnosticsIssues.replaceChildren();
  for(const issue of issues){const row=document.createElement('div');row.className='diagnostics-issue';const text=document.createElement('div');const title=document.createElement('b');title.textContent=optionsDiagnosticLabel(issue.code);const operation=document.createElement('span');operation.textContent=diagnosticOperationLabels[issue.operation]||'其他操作';text.append(title,operation);const count=document.createElement('strong');count.textContent=optionsDiagnosticNumber(issue.count);count.setAttribute('aria-label',`${count.textContent} 次`);row.append(text,count);optionsEls.diagnosticsIssues.append(row);}
  optionsEls.diagnosticsIssuesEmpty.hidden=issues.length>0;
  const events=(Array.isArray(payload?.events)?payload.events:[]).slice().sort((a,b)=>(Number(b?.at)||0)-(Number(a?.at)||0)).slice(0,50);
  optionsEls.diagnosticsEvents.replaceChildren();
  for(const event of events){const row=document.createElement('article');row.className=`diagnostics-event status-${event.status||'unknown'}`;const head=document.createElement('div');const operation=document.createElement('b');operation.textContent=diagnosticOperationLabels[event.operation]||'其他操作';const status=document.createElement('span');status.textContent=diagnosticStatusLabels[event.status]||'状态未知';head.append(operation,status);const details=document.createElement('dl');const values=[['失败条目',Number.isInteger(event.itemIndex)?'第 '+(event.itemIndex+1)+' 项':''],['字符数',Number.isInteger(event.translationLength)?String(event.translationLength):''],['批次 ID',event.inputIds?.join(', ')],['返回 ID',event.outputIds?.join(', ')],['字段',event.fields?.join(', ')],['HTTP 状态',event.httpStatus?String(event.httpStatus):''],['请求类型',({word:'单词',phrase:'短语',passage:'选段'})[event.kind]],['时间',optionsDiagnosticTime(event.at)],['追踪 ID',event.traceId],['阶段',diagnosticStageLabels[event.stage]||'其他阶段'],['耗时',Number.isFinite(event.durationMs)?`${event.durationMs} ms`:''],['模型指纹',optionsDiagnosticFingerprint(event)]];for(const [label,value] of values){if(!value)continue;const group=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;group.append(dt,dd);details.append(group);}row.append(head,details);optionsEls.diagnosticsEvents.append(row);}
  optionsEls.diagnosticsEventsEmpty.hidden=events.length>0;
  optionsEls.diagnosticsUpdated.textContent='刚刚更新';
}
function optionsDiagnosticsVisible(){return optionsCurrentSection==='diagnostics'&&!document.hidden;}
async function optionsRefreshDiagnostics(){if(!optionsDiagnosticsVisible()||optionsDiagnosticsBusy)return;const sequence=++optionsDiagnosticsSequence;optionsDiagnosticsBusy=true;try{const payload=await request('DIAGNOSTICS_GET');if(sequence===optionsDiagnosticsSequence)optionsRenderDiagnostics(payload);}catch(error){if(sequence===optionsDiagnosticsSequence)optionsSetResult(optionsEls.diagnosticsResult,optionsErrorText(error),true);}finally{if(sequence===optionsDiagnosticsSequence)optionsDiagnosticsBusy=false;}}
async function optionsSetDiagnosticsEnabled(){const enabled=optionsEls.diagnosticsEnabled.checked,sequence=++optionsDiagnosticsSequence;optionsDiagnosticsBusy=true;optionsEls.diagnosticsEnabled.disabled=true;optionsSetResult(optionsEls.diagnosticsResult,'正在保存…');try{const payload=await request('DIAGNOSTICS_SET',{enabled});if(sequence===optionsDiagnosticsSequence){optionsRenderDiagnostics(payload);optionsSetResult(optionsEls.diagnosticsResult,enabled?'诊断记录已开启。':'诊断记录已关闭。');}}catch(error){if(sequence===optionsDiagnosticsSequence){optionsEls.diagnosticsEnabled.checked=!enabled;optionsSetResult(optionsEls.diagnosticsResult,optionsErrorText(error),true);}}finally{if(sequence===optionsDiagnosticsSequence){optionsDiagnosticsBusy=false;optionsEls.diagnosticsEnabled.disabled=false;}}}
async function optionsExportDiagnostics(){optionsEls.exportDiagnostics.disabled=true;optionsSetResult(optionsEls.diagnosticsResult,'正在导出…');try{const payload=await request('DIAGNOSTICS_EXPORT');const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`roamcat-diagnostics-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);optionsSetResult(optionsEls.diagnosticsResult,'诊断 JSON 已导出。');}catch(error){optionsSetResult(optionsEls.diagnosticsResult,optionsErrorText(error),true);}finally{optionsEls.exportDiagnostics.disabled=false;}}
async function optionsClearDiagnostics(){if(!confirm('确定清空全部诊断记录吗？此操作不会清除阅读记忆或个人词档案。'))return;const sequence=++optionsDiagnosticsSequence;optionsDiagnosticsBusy=true;optionsEls.clearDiagnostics.disabled=true;try{const payload=await request('DIAGNOSTICS_CLEAR');if(sequence===optionsDiagnosticsSequence){optionsRenderDiagnostics(payload);optionsSetResult(optionsEls.diagnosticsResult,payload.native?.pendingClear?'扩展诊断已清空；连接器日志待下次连接清空。阅读记忆保持不变。':'诊断记录已清空；阅读记忆保持不变。');}}catch(error){if(sequence===optionsDiagnosticsSequence)optionsSetResult(optionsEls.diagnosticsResult,optionsErrorText(error),true);}finally{if(sequence===optionsDiagnosticsSequence){optionsDiagnosticsBusy=false;optionsEls.clearDiagnostics.disabled=false;}}}

optionsEls.readingStylePreview.addEventListener('load',optionsObserveStylePreview);
for(const layer of optionsReadingLayers){const controls=optionsReadingControls[layer];for(const input of [controls.style,controls.size])input.addEventListener('change',()=>{const readingStyle=optionsReadingStyleValue();optionsPreviewReadingStyle(readingStyle);void optionsSaveReadingStyle(readingStyle);});controls.palette.addEventListener('click',event=>{const button=event.target.closest('button[data-color]');if(!button)return;const color=button.dataset.color;controls.group.dataset.color=color;if(color!=='auto'){controls.color.value=color;if(controls.style.value==='plain'||(layer!=='original'&&controls.style.value==='default'))controls.style.value='color';}optionsUpdateReadingColorUI(layer);const readingStyle=optionsReadingStyleValue();optionsPreviewReadingStyle(readingStyle);void optionsSaveReadingStyle(readingStyle);});controls.color.addEventListener('input',()=>{controls.group.dataset.color=controls.color.value;if(controls.style.value==='plain'||(layer!=='original'&&controls.style.value==='default'))controls.style.value='color';optionsUpdateReadingColorUI(layer);optionsPreviewReadingStyle(optionsReadingStyleValue());});controls.color.addEventListener('change',()=>{const readingStyle=optionsReadingStyleValue();optionsPreviewReadingStyle(readingStyle);void optionsSaveReadingStyle(readingStyle);});}
optionsEls.resetReadingStyle.addEventListener('click',()=>void optionsSaveReadingStyle(structuredClone(globalThis.RoamCatReadingStyle.defaults),'已恢复默认样式'));
optionsEls.newApiService.addEventListener('click',async()=>{if(!optionsDiscardProviderDraft())return;await optionsCleanupDraftPermissions();optionsDraftServiceId=crypto.randomUUID();optionsProviderDirty=false;optionsProviderModels=[];optionsRenderProvider();optionsSetResult(optionsEls.providerResult,'正在新增服务；保存前不会改变当前服务。');document.getElementById('provider-trigger').focus();});
optionsEls.cancelApiService.addEventListener('click',async()=>{if(!optionsDiscardProviderDraft())return;await optionsCleanupDraftPermissions();optionsDraftServiceId=null;optionsProviderDirty=false;optionsProviderModels=[];optionsRenderProvider();optionsSetResult(optionsEls.providerResult,'');});
optionsEls.apiServiceSelect.addEventListener('change',async()=>{const id=optionsEls.apiServiceSelect.value;if(!optionsDiscardProviderDraft()){optionsEls.apiServiceSelect.value=optionsState.settings.activeApiServiceId||'';return;}const service=optionsState.settings.apiServices.find(item=>item.id===id);if(!service)return;try{await optionsCleanupDraftPermissions();await optionsEnsurePermission(optionsOriginPattern(service.baseUrl),true);optionsDraftServiceId=null;optionsProviderDirty=false;optionsProviderModels=[];await optionsSavePatch({providerKind:'api',activeApiServiceId:id},'已切换到 '+service.name);optionsRenderProvider();}catch(error){optionsShowError(error);optionsRenderProvider();}});
optionsEls.deleteApiService.addEventListener('click',async()=>{const current=activeApiProvider(optionsState.settings);if(!current)return;const before=structuredClone(optionsState.settings),apiServices=before.apiServices.filter(service=>service.id!==current.id),next=apiServices[0];if(!confirm('删除“'+current.name+'”及其密钥？'+(next?'当前服务将切换到“'+next.name+'”。':'将不再使用任何 API 服务。')+'其他服务配置不会删除。'))return;if(await optionsSavePatch({apiServices,activeApiServiceId:next?.id||''},'服务已删除')){optionsProviderDirty=false;await optionsRemoveUnusedPermissions(before,optionsState.settings);optionsRenderProvider();}});
optionsEls.providerName.addEventListener('input',()=>{optionsProviderDirty=true;});
optionsEls.providerId.addEventListener('change',async()=>{if(!optionsDiscardProviderDraft()){optionsProviderDirty=false;optionsRenderProvider();return;}await optionsCleanupDraftPermissions();const meta=getApiProvider(optionsEls.providerId.value);optionsRenderProviderFields(meta);optionsEls.providerName.value=meta.name;optionsEls.providerUrl.value=apiProviderBaseUrl(meta.id,optionsProviderOptions());optionsEls.providerModel.value=meta.defaultModel||'';optionsEls.providerKey.value='';optionsProviderModels=[];optionsProviderDirty=true;optionsRenderProvider();optionsSetResult(optionsEls.providerResult,'服务商已更改；密钥不会从原服务带入。');});


for(const tab of optionsAppearanceTabs){
  tab.addEventListener('click',()=>optionsSelectAppearance(tab.dataset.appearanceTab));
  tab.addEventListener('keydown',event=>{
    const index=optionsAppearanceTabs.indexOf(tab),last=optionsAppearanceTabs.length-1;
    const next=event.key==='ArrowRight'?(index+1)%(last+1):event.key==='ArrowLeft'?(index+last)%(last+1):event.key==='Home'?0:event.key==='End'?last:null;
    if(next===null)return;event.preventDefault();optionsSelectAppearance(optionsAppearanceTabs[next].dataset.appearanceTab);optionsAppearanceTabs[next].focus();
  });
}
optionsEls.readingDomain.addEventListener('change',()=>void optionsSavePatch({domain:optionsEls.readingDomain.value}));
optionsEls.lookupKey.addEventListener('change',()=>{const lookupKey=optionsEls.lookupKey.value;const keycap=document.querySelector('#keycap-badge');if(keycap)keycap.textContent=lookupKey;void optionsSavePatch({lookupKey},'查词按键已设为 '+lookupKey);});
optionsEls.helpLanguage.addEventListener('change',()=>void optionsSavePatch({helpLanguage:optionsEls.helpLanguage.value},'默认解释语言已保存'));
optionsSentenceDensityInputs.forEach(input=>input.addEventListener('change',()=>void optionsSetSentenceDensity(input.value)));
optionsSentenceLineInputs.forEach(input=>input.addEventListener('change',()=>void optionsSetSentenceLineStyle(input.value)));
optionsSentenceAllSites.addEventListener('change',async()=>{const enabled=optionsSentenceAllSites.checked;optionsSentenceAllSites.disabled=true;try{if(enabled&&!await chrome.permissions.request({origins:ALL_HOSTS}))throw new Error('未授予全部网站权限，原设置保持不变。');await optionsPatchAutomation({sentenceGroupsAllSites:enabled},enabled?'所有网站阅读解构已开启':'所有网站阅读解构已关闭');}catch(error){optionsShowError(error);optionsRenderSentenceAllSites();void optionsRefreshStructurePreview();}finally{optionsSentenceAllSites.disabled=false;}});
document.querySelectorAll('input[name="assistance-mode"]').forEach(input=>input.addEventListener('change',()=>void optionsSavePatch({assistanceMode:input.value},input.value==='on-demand'?'已切换为仅在需要时':'已恢复阅读时辅助')));
optionsLookupDisplayInputs.forEach(input=>input.addEventListener('change',()=>void optionsSavePatch({lookupDisplay:input.value},'查词显示方式已保存')));
optionsEls.rememberSupport.addEventListener('change',()=>void optionsSavePatch({rememberSupport:optionsEls.rememberSupport.checked},optionsEls.rememberSupport.checked?'已开启本机支持记忆':'已关闭本机支持记忆'));
optionsEls.automationAllSites.addEventListener('change',async()=>{const enabled=optionsEls.automationAllSites.checked;try{if(enabled&&!await chrome.permissions.request({origins:['http://*/*','https://*/*']}))throw new Error('未授予全部网站权限，原设置保持不变。');await optionsPatchAutomation({allSites:enabled},enabled?'全部网站自动辅助已开启':'全部网站自动辅助已关闭');}catch(error){optionsShowError(error);optionsRenderAutomation();}});
optionsEls.automationVideoSites.addEventListener('change',async()=>{const enabled=optionsEls.automationVideoSites.checked;try{if(enabled&&!await chrome.permissions.request({origins:['https://www.youtube.com/*','https://m.youtube.com/*']}))throw new Error('未授予视频网站权限，原设置保持不变。');await optionsPatchAutomation({videoSites:enabled},enabled?'视频入口已开启':'视频入口已关闭');}catch(error){optionsShowError(error);optionsRenderAutomation();}});
optionsEls.automationSiteForm.addEventListener('submit',async event=>{event.preventDefault();try{const origin=optionsParseOrigin(optionsEls.automationSiteOrigin.value);if(!await chrome.permissions.request({origins:[`${origin}/*`]}))throw new Error('未授予此网站权限，网站未添加。');const sites=optionsAutomation.automation.sites.filter(site=>site.origin!==origin);if(await optionsPatchAutomation({sites:[...sites,{origin,enabled:true}]},'网站自动辅助已开启')){event.target.reset();optionsSetResult(optionsEls.automationResult,'网站已添加并启用。');}}catch(error){optionsSetResult(optionsEls.automationResult,optionsErrorText(error),true);}});
[[optionsEls.videoFontSize,'fontSize',Number],[optionsEls.videoTheme,'theme',String]].forEach(([input,key,convert])=>input.addEventListener('change',async()=>{try{const result=await request('VIDEO_SETTINGS_PATCH',{patch:{[key]:convert(input.value)}});optionsState.settings.video=result.video;optionsRenderAll();optionsShowSaved('视频原文样式已保存');}catch(error){optionsShowError(error);optionsRenderAll();}}));
document.querySelectorAll('input[name="domain-detection-mode"]').forEach(input=>input.addEventListener('change',()=>{optionsDetectionDirty=true;optionsEls.detectionChatgpt.hidden=input.value!=='chatgpt'&&input.value!=='grok'&&input.value!=='antigravity';optionsEls.detectionApi.hidden=input.value!=='api';if(optionsEls.detectionJev)optionsEls.detectionJev.hidden=input.value!=='jev';}));
[optionsEls.detectionSubscriptionModel,optionsEls.detectionUseTranslationApi,optionsEls.detectionApiModel,optionsEls.detectionApiUrl,optionsEls.detectionApiKey,optionsEls.detectionJevModel,optionsEls.detectionJevUrl,optionsEls.detectionJevKey].filter(Boolean).forEach(input=>input.addEventListener('input',()=>{optionsDetectionDirty=true;optionsEls.detectionApiFields.hidden=optionsEls.detectionUseTranslationApi.checked;}));
optionsEls.detectionUseTranslationApi.addEventListener('change',()=>{optionsDetectionDirty=true;optionsEls.detectionApiFields.hidden=optionsEls.detectionUseTranslationApi.checked;});
optionsEls.saveRecognition.addEventListener('click',()=>void optionsSaveDetection());
optionsEls.clearDetectionKey.addEventListener('click',async()=>{const current=optionsDetectionSettings();if(!current.api?.apiKey||!confirm('确定清除单独保存的识别 API Key 吗？'))return;const before=structuredClone(optionsState.settings);if(await optionsSavePatch({domainDetection:{...current,api:{...current.api,apiKey:''}}},'识别密钥已清除'))await optionsRemoveUnusedPermissions(before,optionsState.settings);});
if(optionsEls.clearDetectionJevKey){optionsEls.clearDetectionJevKey.addEventListener('click',async()=>{const current=optionsDetectionSettings();if(!current.jevApiKey||!confirm('确定清除保存的 Jev API Key 吗？'))return;const before=structuredClone(optionsState.settings);if(await optionsSavePatch({domainDetection:{...current,jevApiKey:''}},'Jev 识别密钥已清除')){optionsDetectionDirty=false;await optionsRemoveUnusedPermissions(before,optionsState.settings);optionsRenderDetection();}});}
optionsEls.runDomainTest.addEventListener('click',async()=>{const text=optionsEls.domainTestText.value.trim();if(!text){optionsSetResult(optionsEls.domainTestResult,'请输入正文样本。',true);return;}optionsEls.runDomainTest.disabled=true;try{const result=await request('DOMAIN_TEST',{text});const details=[`领域：${optionsDomainName(result.domain)}`,`来源：${optionsSourceLabels[result.source]||result.source}`];if(typeof result.score==='number')details.push(`置信度：${(result.score*100).toFixed(1)}%`);if(result.warning)details.push(result.warning);optionsSetResult(optionsEls.domainTestResult,details.join(' · '));}catch(error){optionsSetResult(optionsEls.domainTestResult,optionsErrorText(error),true);}finally{optionsEls.runDomainTest.disabled=false;}});
optionsEls.domainRuleForm.addEventListener('submit',async event=>{event.preventDefault();const host=optionsEls.ruleHost.value.trim().toLowerCase(),pathPrefix=optionsEls.rulePath.value.trim();if(!host||!pathPrefix.startsWith('/')){optionsSetResult(optionsEls.domainRuleResult,'请填写主机名和以 / 开头的路径。',true);return;}const rules=optionsState.settings.domainRules||[];const rule={host,pathPrefix,domain:optionsEls.ruleDomain.value,includeSubdomains:optionsEls.ruleSubdomains.checked};if(await optionsSavePatch({domainRules:[...rules,rule]},'站点规则已添加'))event.target.reset();});
optionsEls.termForm.addEventListener('submit',async event=>{event.preventDefault();const term=optionsEls.termSource.value.trim(),translation=optionsEls.termTranslation.value.trim();if(!term||!translation)return;const terms=optionsState.settings.customTerms||[];if(await optionsSavePatch({customTerms:[...terms,{term,translation,domain:optionsEls.termDomain.value}]},'术语已添加'))event.target.reset();});
document.querySelectorAll('input[name="provider-kind"]').forEach(input=>input.addEventListener('change',()=>void optionsSavePatch({providerKind:input.value},input.value==='api'?'已切换至 API':input.value==='grok'?'已切换至 Grok 订阅':input.value==='antigravity'?'已切换至 Google 订阅':'已切换至 ChatGPT 订阅')));
optionsEls.subscriptionModel.addEventListener('change',()=>void optionsSavePatch({subscriptionModel:optionsEls.subscriptionModel.value},'辅助模型已保存'));
optionsEls.refreshSubscription.addEventListener('click',()=>void optionsRefreshSubscription(true));optionsEls.loginSubscription.addEventListener('click',()=>void optionsSubscriptionAction('SUBSCRIPTION_LOGIN'));optionsEls.cancelSubscription.addEventListener('click',()=>void optionsSubscriptionAction('SUBSCRIPTION_CANCEL'));optionsEls.logoutSubscription.addEventListener('click',()=>void optionsSubscriptionAction('SUBSCRIPTION_LOGOUT'));optionsEls.testSubscription.addEventListener('click',()=>void optionsTestProvider(optionsEls.subscriptionResult));
optionsEls.providerForm.addEventListener('submit',optionsSaveProvider);[optionsEls.providerUrl,optionsEls.providerConcurrency,optionsEls.providerModel,optionsEls.providerKey].forEach(input=>input.addEventListener('input',()=>{optionsProviderDirty=true;optionsInvalidateProviderModels();optionsEls.testProvider.disabled=true;optionsSetResult(optionsEls.providerResult,'表单有尚未保存的更改；测试只使用已保存配置。');}));optionsEls.providerModelList.addEventListener('change',()=>{if(!optionsEls.providerModelList.value)return;optionsEls.providerModel.value=optionsEls.providerModelList.value;optionsProviderDirty=true;optionsSetResult(optionsEls.providerResult,'已选择模型；保存后生效。');});optionsEls.listProviderModels.addEventListener('click',()=>void optionsListProviderModels());optionsEls.testProvider.addEventListener('click',()=>void optionsTestProvider(optionsEls.providerResult));
optionsEls.disconnectProvider.addEventListener('click',async()=>{const current=activeApiProvider(optionsState.settings);if(!current?.apiKey||!confirm('只清除“'+current.name+'”的密钥？其他服务不受影响。'))return;const before=structuredClone(optionsState.settings);if(await optionsSavePatch({apiServices:before.apiServices.map(service=>service.id===current.id?{...service,apiKey:''}:service)},'此服务密钥已清除')){optionsProviderDirty=false;await optionsRemoveUnusedPermissions(before,optionsState.settings);optionsRenderProvider();}});
optionsEls.copyInstallCommand.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(optionsEls.installCommand.textContent);optionsEls.copyInstallCommand.textContent='已复制';setTimeout(()=>{optionsEls.copyInstallCommand.textContent='复制';},1600);}catch(error){optionsSetResult(optionsEls.subscriptionResult,`复制失败：${optionsErrorText(error)}`,true);}});
optionsEls.exportData.addEventListener('click',()=>void optionsExportData());optionsEls.clearMemory.addEventListener('click',async()=>{if(!confirm('确定删除词档案、阅读记录、摘要、统计和全部个性化数据吗？此操作无法撤销；服务配置、网站权限和采集开关保持不变。'))return;try{await request('MEMORY_CLEAR');optionsSetResult(optionsEls.dataResult,'全部阅读数据已清空；服务配置、网站权限和采集开关保持不变。');}catch(error){optionsSetResult(optionsEls.dataResult,optionsErrorText(error),true);}});optionsEls.openExtensionManager.addEventListener('click',()=>{try{const extId=window.chrome?.runtime?.id||'';if(window.chrome?.tabs?.create){chrome.tabs.create({url:'chrome://extensions/'+(extId?'?id='+extId:'')}).catch(()=>{prompt('请在浏览器地址栏复制并打开扩展管理页：','chrome://extensions/'+(extId?'?id='+extId:''));});}else{prompt('请在浏览器地址栏复制并打开扩展管理页：','chrome://extensions/');}}catch{prompt('请在浏览器地址栏复制并打开扩展管理页：','chrome://extensions/');}});
optionsEls.diagnosticsEnabled.addEventListener('change',()=>void optionsSetDiagnosticsEnabled());
optionsEls.exportDiagnostics.addEventListener('click',()=>void optionsExportDiagnostics());
// 开发与更新友好：一键重载扩展，替代跑去 chrome://extensions 点「重新加载」；
// 设置改动均已即时保存，重载后本页与已打开标签页可由页面角落的刷新提示恢复。
optionsEls.reloadExtension?.addEventListener('click',()=>{try{chrome.runtime.reload();}catch(error){optionsSetResult(optionsEls.diagnosticsResult,'重载失败：'+(error?.message||'未知错误'),true);}});
document.querySelectorAll('.js-open-welcome').forEach(button=>button.addEventListener('click',()=>{void focusWelcomeGuide().catch(error=>optionsSetResult(optionsEls.globalError,error?.message||'无法打开新手引导',true));}));
optionsEls.clearDiagnostics.addEventListener('click',()=>void optionsClearDiagnostics());
document.addEventListener('visibilitychange',()=>{if(optionsDiagnosticsVisible())void optionsRefreshDiagnostics();if(!document.hidden)void optionsRefreshStructurePreview();});
window.addEventListener('focus',()=>void optionsRefreshStructurePreview());


function optionsHandleThemeChange(){
  optionsRenderStructurePreview();
  if(optionsReadingDraft||optionsState?.settings?.readingStyle)optionsRenderReadingStyle();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',optionsHandleThemeChange);
try{new MutationObserver(optionsHandleThemeChange).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});}catch{}
if(window.chrome?.storage?.onChanged){chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;if(changes.sentenceGroupsDensity){optionsSentenceDensity=['coarse','medium','fine'].includes(changes.sentenceGroupsDensity.newValue)?changes.sentenceGroupsDensity.newValue:'medium';optionsRenderSentenceDensity();}if(changes.sentenceGroupsLineStyle){optionsSentenceLineStyle=['solid','dashed','dotted','wavy'].includes(changes.sentenceGroupsLineStyle.newValue)?changes.sentenceGroupsLineStyle.newValue:'solid';optionsRenderSentenceLineStyle();}if(!changes.settings&&!changes.subscriptionLinked)return;clearTimeout(optionsSyncTimer);optionsSyncTimer=setTimeout(()=>void optionsSyncState().catch(optionsShowError),30);});chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(changes.sentenceGroupsDensity||changes.sentenceGroupsLineStyle))queueMicrotask(optionsRenderStructurePreview);});}if(window.chrome?.runtime?.onMessage){chrome.runtime.onMessage.addListener(message=>{if(message?.type==='SUBSCRIPTION_UPDATED'&&optionsState){if(message.kind&&message.kind!==optionsSubscriptionKind())return;optionsState.subscription=message.subscription||{};optionsRenderSubscription();}});}
window.addEventListener('pagehide',()=>{void optionsCleanupDraftPermissions();});

function syncChoiceCards() {
  const radioGroups = ['assistance-mode', 'lookup-display'];
  radioGroups.forEach(groupName => {
    const radios = document.querySelectorAll(`input[name="${groupName}"]`);
    radios.forEach(radio => {
      const card = radio.closest('.choice-card-item');
      if (card) {
        card.classList.toggle('is-selected', radio.checked);
      }
    });
  });
}

function optionsInitCyberHUD() {
  const matrixRange = document.querySelector('#matrix-index-range');
  optionsRenderDetailMeter();
  matrixRange?.addEventListener('input', () => optionsRenderDetailMeter(['coarse','medium','fine'][Number(matrixRange.value)-1]));
  matrixRange?.addEventListener('change', () => void optionsSetSentenceDensity(['coarse','medium','fine'][Number(matrixRange.value)-1]));

  // Radio button choice cards click binding
  document.addEventListener('change', event => {
    if (event.target.name === 'assistance-mode' || event.target.name === 'lookup-display') {
      syncChoiceCards();
    }
  });

  document.querySelector('#floating-pet-enabled')?.addEventListener('change', event => {
    const enabled = event.target.checked;
    void optionsSavePatch({
      floatingPet: {
        ...(optionsState.settings.floatingPet || {}),
        enabled
      }
    }, enabled ? '已开启网页悬浮伴读猫' : '已关闭网页悬浮伴读猫');
  });

  document.querySelector('#floating-pet-theme')?.addEventListener('change', event => {
    const themeMode = event.target.value;
    void optionsSavePatch({
      floatingPet: {
        ...(optionsState.settings.floatingPet || {}),
        themeMode
      }
    }, '伴读猫显示模式已更新');
  });

  document.querySelector('#floating-pet-reset-pos')?.addEventListener('click', () => {
    void optionsSavePatch({
      floatingPet: {
        ...(optionsState.settings.floatingPet || {}),
        position: { right: 24, bottom: 84 }
      }
    }, '伴读猫已恢复默认位置');
  });

  const previewBtn = document.querySelector('#preview-hud-btn');
  if (previewBtn) {
    previewBtn.addEventListener('click', () => {
      location.hash = '#appearance';
    });
  }

  const resetConfigBtn = document.querySelector('#footer-reset-config');
  if (resetConfigBtn) {
    resetConfigBtn.addEventListener('click', async () => {
      if (!confirm('确定将阅读偏好恢复为系统推荐配置？')) return;
      resetConfigBtn.disabled = true;
      try {
        if (await optionsSavePatch({assistanceMode:'ambient',lookupDisplay:'card',lookupKey:'D'},'阅读偏好已恢复')) {
          await optionsSetSentenceDensity('medium');
        }
      } finally {
        resetConfigBtn.disabled = false;
      }
    });
  }

  const exportRulesBtn = document.querySelector('#footer-export-rules');
  if (exportRulesBtn) {
    exportRulesBtn.addEventListener('click', () => {
      void optionsExportData();
    });
  }

  syncChoiceCards();
}

export async function optionsInit(initialSection='assistance'){optionsCurrentSection=initialSection;optionsFillDomains(optionsEls.readingDomain,true);optionsFillDomains(optionsEls.ruleDomain,false);optionsFillDomains(optionsEls.termDomain,false);if(optionsEls.installCommand)optionsEls.installCommand.textContent=optionsInstallCommand();optionsInitCyberHUD();try{const densityData=window.chrome?.storage?.local?await chrome.storage.local.get(['sentenceGroupsDensity','sentenceGroupsLineStyle']):{};optionsSentenceDensity=['coarse','medium','fine'].includes(densityData?.sentenceGroupsDensity)?densityData.sentenceGroupsDensity:'medium';optionsSentenceLineStyle=['solid','dashed','dotted','wavy'].includes(densityData?.sentenceGroupsLineStyle)?densityData.sentenceGroupsLineStyle:'solid';await optionsSyncState();if(optionsCurrentSection==='service'&&optionsProviderKind()!=='api')void optionsRefreshSubscription();}catch(error){if(window.chrome?.runtime?.id)optionsShowError(error);}}
function optionsRenderDetailMeter(density=optionsSentenceDensity) {
  const level=Math.max(1,['coarse','medium','fine'].indexOf(density)+1);
  const labels=['粗 · 突出主干','中 · 显示句子成分','细 · 最多两层'];
  const range=document.querySelector('#matrix-index-range');
  range.value=String(level);range.setAttribute('aria-valuetext',labels[level-1]);
  document.querySelector('#threshold-stat-num').textContent=String(level).padStart(2,'0');
  document.querySelector('#matrix-step-badge').textContent=labels[level-1];
  document.querySelectorAll('#matrix-step-gradient .matrix-step-cell').forEach((cell,i)=>{cell.classList.toggle('active',i<level*10);cell.classList.toggle('current',i===level*10-1);});
}
function optionsRenderReadingReadout() {
  const settings=optionsState?.settings||{};
  document.querySelector('#readout-mode').textContent=settings.assistanceMode==='on-demand'?'只在主动求助时':'自动少量提示';
  document.querySelector('#readout-display').textContent=settings.lookupDisplay==='annotation'?'顶部释义':'解释卡片';
}
