/**
 * @file src/pages/options/options-controller.js
 * 文件职责：设置页表单控制器——12分区表单、服务目录、权限回收与诊断入口。
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

const optionsSections = ['assistance','appearance','sites','advanced','terms','personalization','history','privacy','service','diagnostics','shortcuts','guide'];
const T=(k,v)=>globalThis.RoamCatI18n?.t(k,v)??k;
const optionsLabels = {assistance:'opt.nav.assist',appearance:'opt.nav.appearance',sites:'opt.nav.sites',advanced:'opt.nav.advanced',terms:'opt.nav.terms',personalization:'opt.nav.personalization',history:'opt.nav.history',privacy:'opt.nav.privacy',service:'opt.nav.model',diagnostics:'opt.nav.diagnostics',shortcuts:'opt.nav.shortcuts',guide:'opt.nav.guide'};
const optionsSourceLabels = {personalized:'src.personalized',manual:'src.manual','site-user':'src.site-user',global:'src.global','site-built-in':'src.site-built-in','local-model':'src.local-model',chatgpt:'src.chatgpt',grok:'src.grok',antigravity:'src.antigravity',api:'src.api',jev:'src.jev',general:'src.general'};
const diagnosticOperationLabels = {PAGE_SUMMARY:'diag.op.PAGE_SUMMARY',SENTENCE_GROUPS_BATCH:'diag.op.SENTENCE_GROUPS_BATCH',HISTORY_SUMMARY:'diag.op.HISTORY_SUMMARY',PERSONALIZATION_ANALYZE:'diag.op.PERSONALIZATION_ANALYZE',ASSIST_COMMIT:'diag.op.ASSIST_COMMIT',ASSIST:'diag.op.ASSIST',SUPPORT_BATCH:'diag.op.SUPPORT_BATCH',PASSAGE_TRANSLATE:'diag.op.PASSAGE_TRANSLATE',EMERGENCY_TRANSLATE:'diag.op.EMERGENCY_TRANSLATE',RESOLVE_DOMAIN:'diag.op.RESOLVE_DOMAIN',PROVIDER_TEST:'diag.op.PROVIDER_TEST',CONNECTION:'diag.op.CONNECTION',ANALYZE:'diag.op.ANALYZE',PREPARED_ASSIST:'diag.op.PREPARED_ASSIST',PREPARED_SUPPORT:'diag.op.PREPARED_SUPPORT'};
const diagnosticStageLabels = {request:'diag.stage.request',provider:'diag.stage.provider',first_content:'diag.stage.first_content',validation:'diag.stage.validation',render:'diag.stage.render',connection:'diag.stage.connection',rpc:'diag.stage.rpc',stderr:'diag.stage.stderr'};
const diagnosticStatusLabels = {start:'diag.status.start',ok:'diag.status.ok',error:'diag.status.error',cancelled:'diag.status.cancelled'};
const diagnosticCodeLabels = {STARTUP_FAILED:'diag.code.STARTUP_FAILED',CODEX_EXIT:'diag.code.CODEX_EXIT',RPC_TIMEOUT:'diag.code.RPC_TIMEOUT',TURN_FAILED:'diag.code.TURN_FAILED',UNKNOWN:'diag.code.UNKNOWN',OK:'diag.code.OK',LOCAL_RESULT:'diag.code.LOCAL_RESULT',CACHE_HIT:'diag.code.CACHE_HIT',TIMEOUT:'diag.code.TIMEOUT',NETWORK:'diag.code.NETWORK',AUTH:'diag.code.AUTH',RATE_LIMIT:'diag.code.RATE_LIMIT',HTTP:'diag.code.HTTP',JSON_INVALID:'diag.code.JSON_INVALID',OUTPUT_INVALID:'diag.code.OUTPUT_INVALID',BATCH_SHAPE:'diag.code.BATCH_SHAPE',BATCH_COUNT:'diag.code.BATCH_COUNT',ITEM_FIELDS:'diag.code.ITEM_FIELDS',ITEM_ID:'diag.code.ITEM_ID',ITEM_DUPLICATE:'diag.code.ITEM_DUPLICATE',TRANSLATION_TYPE:'diag.code.TRANSLATION_TYPE',TRANSLATION_EMPTY:'diag.code.TRANSLATION_EMPTY',TRANSLATION_WHITESPACE:'diag.code.TRANSLATION_WHITESPACE',TRANSLATION_LENGTH:'diag.code.TRANSLATION_LENGTH',TRANSLATION_NO_HAN:'diag.code.TRANSLATION_NO_HAN',STALE:'diag.code.STALE',CANCELLED:'diag.code.CANCELLED',NOT_READY:'diag.code.NOT_READY',DISCONNECTED:'diag.code.DISCONNECTED',NATIVE_START:'diag.code.NATIVE_START',NATIVE_EXIT:'diag.code.NATIVE_EXIT',NATIVE_RPC:'diag.code.NATIVE_RPC',NATIVE_STDERR:'diag.code.NATIVE_STDERR',STDERR_AUTH:'diag.code.STDERR_AUTH',STDERR_RATE_LIMIT:'diag.code.STDERR_RATE_LIMIT',STDERR_TIMEOUT:'diag.code.STDERR_TIMEOUT',STDERR_UNKNOWN:'diag.code.STDERR_UNKNOWN',STORAGE_ERROR:'diag.code.STORAGE_ERROR',RENDER_INVALID:'diag.code.RENDER_INVALID',NOT_DISPLAYED:'diag.code.NOT_DISPLAYED',INTERRUPTED:'diag.code.INTERRUPTED',SLOW_REQUEST:'diag.code.SLOW_REQUEST',REPEATED_FAILURE:'diag.code.REPEATED_FAILURE'};
const optionsIds = ['section-title','save-state','global-error','reading-domain','lookup-key','automation-all-sites','automation-video-sites','automation-site-form','automation-site-origin','automation-result','automation-site-list','automation-site-empty','video-font-size','video-theme','detection-chatgpt','detection-api','detection-jev','detection-jev-model','detection-jev-url','detection-jev-key','detection-jev-key-state','clear-detection-jev-key','detection-subscription-model','detection-use-translation-api','detection-api-model','detection-api-fields','detection-api-url','detection-api-key','detection-key-state','clear-detection-key','save-recognition','domain-test-text','run-domain-test','domain-test-result','domain-rule-form','rule-host','rule-path','rule-domain','rule-subdomains','domain-rule-result','domain-rule-list','domain-rule-empty','term-form','term-source','term-translation','term-domain','term-list','term-empty','subscription-panel','api-panel','subscription-dot','subscription-state','subscription-detail','refresh-subscription','subscription-account','subscription-email','subscription-plan','subscription-model','subscription-model-note','login-subscription','cancel-subscription','logout-subscription','test-subscription','subscription-result','subscription-user-code','install-command','install-prereq','install-note','copy-install-command','provider-form','provider-url','provider-concurrency','provider-model','provider-key','key-state','test-provider','disconnect-provider','provider-result','remember-support','export-data','clear-memory','data-result','open-extension-manager','help-language','api-service-select','new-api-service','provider-name','delete-api-service','cancel-api-service','api-routing','route-assist','route-support','route-groups','route-translate','route-summary','usage-stats-refresh','usage-stats-clear','usage-stats-totals','usage-stats-empty','usage-stats-wrap','usage-stats-body','usage-stats-result', 'reading-style-preview', 'reset-reading-style', 'diagnostics-storage-error','diagnostics-enabled','diagnostics-recording-note','diagnostics-native-dot','diagnostics-native-state','diagnostics-native-note','diagnostics-requests','diagnostics-failures','diagnostics-slow','diagnostics-pending','diagnostics-updated','diagnostics-issues','diagnostics-issues-empty','diagnostics-events','diagnostics-events-empty','export-diagnostics','clear-diagnostics','diagnostics-result','reload-extension'];
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
function optionsShowSaved(message=T('ctl.saved')) { clearTimeout(optionsSaveTimer);optionsEls.saveState.textContent=message;optionsSaveTimer=setTimeout(()=>{optionsEls.saveState.textContent='';},1800); }
function optionsDomainName(domain) { const k='domain.'+domain,v=T(k); return v!==k?v:(domain||T('domain.general')); }
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
function optionsFillDomains(select,includeAuto) { select.replaceChildren();for(const [value,label] of Object.entries(DOMAINS)){if(!includeAuto&&value==='auto')continue;select.append(new Option(value==='auto'?T('ctl.autoDetect'):optionsDomainName(value),value));} }
export function optionsSectionEnter(section,previous){
  if(previous==='diagnostics'&&section!=='diagnostics')void optionsSyncState().catch(optionsShowError);
  clearInterval(optionsDiagnosticsTimer);optionsDiagnosticsTimer=0;
  if(section==='diagnostics'){
    if(previous!==section)void optionsRefreshDiagnostics();
    optionsDiagnosticsTimer=setInterval(()=>void optionsRefreshDiagnostics(),5000);
  }
  // 仅在真正进入「模型服务」区时才刷新连接器：查看其他设置不应拉起本机 CLI 进程。
  if(section==='service'&&optionsState){if(optionsProviderKind()!=='api')void optionsRefreshSubscription();void optionsLoadUsageStats();}
  if(section==='appearance')optionsRenderAppearance();
  optionsCurrentSection=section;
}
function optionsRenderModels(select,selected,note) { select.replaceChildren(new Option(T('ctl.connectorModel'),''));for(const model of optionsModels)select.append(new Option(model.name||model.id,model.id));select.value=[...select.options].some(option=>option.value===selected)?selected:'';note.textContent=optionsModels.length?T('ctl.modelsAvailable'):T('ctl.modelsConnect'); }
function optionsParseOrigin(value) { const entered=value.trim();let parsed;try{parsed=new URL(entered);}catch{throw new Error(T('ctl.originInvalid'));}if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error(T('ctl.originShape'));return parsed.origin; }
function optionsRenderAutomation() { const automation=optionsAutomation?.automation||optionsState.settings.automation||{allSites:false,sites:[],videoSites:false};optionsEls.automationAllSites.checked=Boolean(automation.allSites);optionsEls.automationVideoSites.checked=Boolean(automation.videoSites);optionsEls.automationSiteList.replaceChildren();for(const site of automation.sites||[]){const row=document.createElement('div');row.className='automation-site-item';const code=document.createElement('code');code.textContent=site.origin;const toggle=document.createElement('button');toggle.className='secondary-button';toggle.type='button';toggle.textContent=site.enabled?T('ctl.enabled'):T('ctl.disabled');toggle.addEventListener('click',()=>void optionsToggleSite(site,!site.enabled));const remove=document.createElement('button');remove.className='delete-button';remove.type='button';remove.textContent=T('ctl.remove');remove.addEventListener('click',()=>void optionsToggleSite(site,null));row.append(code,toggle,remove);optionsEls.automationSiteList.append(row);}optionsEls.automationSiteEmpty.hidden=Boolean(automation.sites?.length); }
function optionsDetectionSettings(){return optionsState.settings.domainDetection||{mode:'local',subscriptionModel:'',apiModel:'',useTranslationApi:true,api:{baseUrl:'https://api.openai.com/v1',apiKey:''},jevModel:'typesafe/jev-1.13.0',jevApiKey:'',jevBaseUrl:'https://router.requesty.ai/v1'};}
function optionsRenderDetection(){const value=optionsDetectionSettings();const radio=document.querySelector(`input[name="domain-detection-mode"][value="${value.mode}"]`);if(radio)radio.checked=true;optionsEls.detectionChatgpt.hidden=value.mode!=='chatgpt'&&value.mode!=='grok'&&value.mode!=='antigravity';optionsEls.detectionApi.hidden=value.mode!=='api';if(optionsEls.detectionJev)optionsEls.detectionJev.hidden=value.mode!=='jev';optionsEls.detectionUseTranslationApi.checked=value.useTranslationApi!==false;optionsEls.detectionApiFields.hidden=optionsEls.detectionUseTranslationApi.checked;optionsRenderModels(optionsEls.detectionSubscriptionModel,value.subscriptionModel||'',document.createElement('span'));if(!optionsDetectionDirty){optionsEls.detectionApiModel.value=value.apiModel||'';optionsEls.detectionApiUrl.value=value.api?.baseUrl||'https://api.openai.com/v1';optionsEls.detectionApiKey.value='';if(optionsEls.detectionJevModel)optionsEls.detectionJevModel.value=value.jevModel||'typesafe/jev-1.13.0';if(optionsEls.detectionJevUrl)optionsEls.detectionJevUrl.value=value.jevBaseUrl||'https://router.requesty.ai/v1';if(optionsEls.detectionJevKey)optionsEls.detectionJevKey.value='';}const hasKey=Boolean(value.api?.apiKey);optionsEls.detectionApiKey.placeholder=hasKey?T('ctl.detKeyKeep'):T('ctl.detKeyInput');optionsEls.detectionKeyState.textContent=hasKey?T('ctl.detKeySaved'):T('ctl.detKeyNone');optionsEls.clearDetectionKey.disabled=!hasKey;if(optionsEls.detectionJevKey){const hasJevKey=Boolean(value.jevApiKey);optionsEls.detectionJevKey.placeholder=hasJevKey?T('ctl.jevKeyKeep'):T('ctl.jevKeyInput');if(optionsEls.detectionJevKeyState)optionsEls.detectionJevKeyState.textContent=hasJevKey?T('ctl.jevKeySaved'):T('ctl.jevKeyNote');if(optionsEls.clearDetectionJevKey)optionsEls.clearDetectionJevKey.disabled=!hasJevKey;}}
function optionsDeleteButton(label,handler){const button=document.createElement('button');button.type='button';button.className='delete-button';button.textContent=label;button.addEventListener('click',handler);return button;}
function optionsRenderRules(){
  const rules=optionsState.settings.domainRules||[];
  optionsEls.domainRuleList.replaceChildren();
  rules.forEach((rule,index)=>{const row=document.createElement('div');row.className='rule-item';const info=document.createElement('div');const strong=document.createElement('b');strong.textContent=`${rule.includeSubdomains?'*.':''}${rule.host}${rule.pathPrefix}`;const domain=document.createElement('span');domain.textContent=optionsDomainName(rule.domain);info.append(strong,domain);row.append(info,optionsDeleteButton(T('ctl.delete'),()=>void optionsSavePatch({domainRules:rules.filter((_item,itemIndex)=>itemIndex!==index)},T('ctl.ruleDeleted'))));optionsEls.domainRuleList.append(row);});
  optionsEls.domainRuleEmpty.hidden=Boolean(rules.length);
}
function optionsRenderTerms(){
  const terms=optionsState.settings.customTerms||[];
  optionsEls.termList.replaceChildren();
  terms.forEach((term,index)=>{const row=document.createElement('div');row.className='term-item';const source=document.createElement('h3');source.textContent=term.term;const translation=document.createElement('p');translation.textContent=term.translation;const domain=document.createElement('small');domain.textContent=optionsDomainName(term.domain);row.append(source,translation,domain,optionsDeleteButton(T('ctl.delete'),()=>void optionsSavePatch({customTerms:terms.filter((_item,itemIndex)=>itemIndex!==index)},T('ctl.termDeleted'))));optionsEls.termList.append(row);});
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
  optionsEls.subscriptionEmail.textContent=subscription.email||T('ctl.notProvided');
  optionsEls.subscriptionPlan.textContent=subscription.plan||T('ctl.notProvided');
  if(!connected){optionsEls.subscriptionState.textContent=T('ctl.subOff');optionsEls.subscriptionDetail.textContent=subscription.error||T('ctl.subInstall');}
  else if(authenticated){optionsEls.subscriptionState.textContent=label+T('ctl.subIn');optionsEls.subscriptionDetail.textContent=subscription.error||T('ctl.subInDetail');}
  else if(pending){optionsEls.subscriptionState.textContent=T('ctl.subPending',{label});optionsEls.subscriptionDetail.textContent=subscription.error||T('ctl.subPendingDetail');}
  else{optionsEls.subscriptionState.textContent=T('ctl.subReady');optionsEls.subscriptionDetail.textContent=subscription.error||T('ctl.subReadyDetail');}
  optionsRenderModels(optionsEls.subscriptionModel,optionsState?.settings?.subscriptionModel||'',optionsEls.subscriptionModelNote);
  optionsEls.loginSubscription.textContent=T('ctl.loginWith',{label});
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
    optionsEls.subscriptionUserCode.textContent=code?T('ctl.userCode',{code}):'';
  }
  if(optionsEls.installCommand)optionsEls.installCommand.textContent=optionsInstallCommand();
  if(optionsEls.installPrereq)optionsEls.installPrereq.textContent=kind==='grok'
    ?T('ctl.installGrok')
    :kind==='antigravity'
    ?T('ctl.installAgy')
    :T('ctl.installCodex');
  if(optionsEls.installNote)optionsEls.installNote.textContent=kind==='grok'
    ?T('ctl.noteGrok')
    :kind==='antigravity'
    ?T('ctl.noteAgy')
    :T('ctl.noteCodex');
  const install=document.getElementById('connector-install');
  if(install.dataset.connected!==String(connected)){install.open=!connected;install.dataset.connected=String(connected);}
}
function optionsReadingStyleValue(){return globalThis.RoamCatReadingStyle.validate(Object.fromEntries(optionsReadingLayers.map(layer=>{const controls=optionsReadingControls[layer];return[layer,{style:controls.style.value,color:controls.group.dataset.color||'auto',size:Number(controls.size.value)}];})));}
let optionsReadingDraft=null,optionsReadingWrites=Promise.resolve();
function optionsSaveReadingStyle(readingStyle,message=T('ctl.styleSaved')){optionsReadingDraft=readingStyle;optionsRenderReadingStyle();const save=async()=>{await optionsSavePatch({readingStyle},message);if(optionsReadingDraft===readingStyle){optionsReadingDraft=null;optionsRenderReadingStyle();}};optionsReadingWrites=optionsReadingWrites.then(save,save);return optionsReadingWrites;}
let optionsReadingPreviewObserver=null;
function optionsSizeStylePreview(){const doc=optionsEls.readingStylePreview.contentDocument;if(!doc?.body)return;const height=Math.ceil(doc.body.getBoundingClientRect().height),current=parseFloat(optionsEls.readingStylePreview.style.height)||0;if(current!==height)optionsEls.readingStylePreview.style.height=height+'px';}
function optionsObserveStylePreview(){optionsReadingPreviewObserver?.disconnect();const body=optionsEls.readingStylePreview.contentDocument?.body;if(!body)return;optionsReadingPreviewObserver=new ResizeObserver(optionsSizeStylePreview);optionsReadingPreviewObserver.observe(body);optionsSizeStylePreview();}
function optionsBuildReadingPalettes(){
  for(const layer of optionsReadingLayers){const container=optionsReadingControls[layer].palette;if(container.childElementCount)continue;const choices=[{id:'auto',label:T('ctl.followPage'),color:''},...globalThis.RoamCatReadingStyle.palettes];for(const choice of choices){const button=document.createElement('button');button.type='button';button.className='reading-color-option';button.dataset.color=choice.id==='auto'?'auto':choice.color;button.setAttribute('aria-label',T('ctl.colorAria',{label:choice.label}));button.setAttribute('aria-pressed','false');const swatch=document.createElement('span');swatch.className='reading-color-swatch';swatch.setAttribute('aria-hidden','true');if(choice.id==='auto')swatch.dataset.auto='true';else swatch.style.setProperty('--swatch-color',choice.color);const label=document.createElement('span');label.textContent=choice.label;button.append(swatch,label);container.append(button);}}
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
  optionsEls.readingStylePreview.srcdoc='<!doctype html><html lang="en" data-theme="'+theme+'"><meta charset="utf-8"><style id="preview-style">'+css+'</style><body><p>The model uses <span id="preview-annotation" data-roamcat-annotation="'+T('ctl.prevHint')+'"><span id="preview-word">reasoning</span><span id="preview-hint" lang="zh-CN">'+T('ctl.prevHint')+'</span></span> to compare possible answers.</p><div id="preview-translation" lang="zh-CN"><p>'+T('ctl.prevTrans')+'</p></div></body></html>';
}
function optionsRenderReadingStyle(){optionsBuildReadingPalettes();const value=globalThis.RoamCatReadingStyle.normalize(optionsReadingDraft||optionsState.settings.readingStyle);for(const layer of optionsReadingLayers){const controls=optionsReadingControls[layer],layerValue=value[layer];controls.style.value=layerValue.style;controls.size.value=String(layerValue.size);controls.group.dataset.color=layerValue.color;controls.color.value=layerValue.color==='auto'?globalThis.RoamCatReadingStyle.palettes[0].color:layerValue.color;optionsUpdateReadingColorUI(layer);}optionsPreviewReadingStyle(value);}
function optionsDiscardProviderDraft(){return !optionsProviderDirty||confirm(T('ctl.discardDraft'));}
function optionsProviderOptions(){return Object.fromEntries([...optionsEls.providerFields.querySelectorAll('[data-provider-option]')].map(input=>[input.dataset.providerOption,input.value.trim()]));}
function optionsRenderProviderFields(meta,values={}){
  optionsEls.providerFields.replaceChildren();
  for(const field of meta.fields||[]){const label=document.createElement('label');label.className='field';const title=document.createElement('span');title.textContent=field.label;let input;if(field.type==='select'){input=document.createElement('select');for(const choice of field.options||[])input.append(new Option(choice.label,choice.value));}else{input=document.createElement('input');input.type='text';input.autocomplete='off';input.spellcheck=false;if(field.placeholder)input.placeholder=field.placeholder;}input.dataset.providerOption=field.key;input.value=values[field.key]??field.defaultValue??'';input.required=true;input.addEventListener('input',()=>{optionsProviderDirty=true;optionsInvalidateProviderModels();if(meta.id==='azure'&&(field.key==='resourceName'||field.key==='apiMode'))optionsEls.providerUrl.value=apiProviderBaseUrl(meta.id,optionsProviderOptions());});input.addEventListener('change',()=>{optionsProviderDirty=true;optionsInvalidateProviderModels();if(meta.id==='azure'||meta.id==='bedrock'||meta.id==='stepfun'||meta.id==='opencode')optionsEls.providerUrl.value=apiProviderBaseUrl(meta.id,optionsProviderOptions());});label.append(title,input);optionsEls.providerFields.append(label);}
}
function optionsModelScope(service){return JSON.stringify([service.providerId,service.baseUrl,service.apiKeys||service.apiKey,service.options]);}
const optionsRouteTasks=[['assist','routeAssist'],['support','routeSupport'],['groups','routeGroups'],['translate','routeTranslate'],['summary','routeSummary']];
function optionsRenderRouting(){const services=optionsState.settings.apiServices||[],routing=optionsState.settings.apiRouting||{};if(optionsEls.apiRouting)optionsEls.apiRouting.hidden=!services.length;for(const [task,id]of optionsRouteTasks){const el=optionsEls[id];if(!el)continue;el.replaceChildren(new Option(T('ctl.routeDefault'),''),...services.map(service=>new Option(service.name+' · '+(service.model||'—'),service.id)));el.value=services.some(service=>service.id===routing[task])?routing[task]:'';el.disabled=!services.length;}}
function optionsParseKeyLines(value){return String(value||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);}
// 模型用量统计：数据来自 USAGE_STATS_GET 汇总载荷，token 为服务商回报值（缺省则界面上为 0，
// 由 usageNote 说明退回字符量级估算）。渲染不保存任何原始载荷。
function optionsUsageNum(value){return Math.max(0,Math.floor(value||0)).toLocaleString(globalThis.RoamCatI18n?.lang?.()==='en'?'en-US':'zh-CN');}
function optionsRenderUsageStats(usage){const totals=optionsEls.usageStatsTotals;if(!totals)return;totals.replaceChildren(...[['sec.svc.usageToday',usage?.today],['sec.svc.usageWeek',usage?.week],['sec.svc.usageTotal',usage?.total]].map(([key,row])=>{const chip=document.createElement('div');chip.className='usage-chip';const label=document.createElement('span');label.className='usage-chip-label';label.textContent=T(key);const requests=document.createElement('strong');requests.textContent=T('sec.svc.usageRequests',{n:optionsUsageNum(row?.requests)});const tokens=document.createElement('small');tokens.textContent=(row?.inputTokens||row?.outputTokens)?T('sec.svc.usageTokens',{input:optionsUsageNum(row.inputTokens),output:optionsUsageNum(row.outputTokens)}):T('sec.svc.usageTokensNone');chip.append(label,requests,tokens);return chip;}));const models=Array.isArray(usage?.models)?usage.models:[];optionsEls.usageStatsEmpty.hidden=models.length>0;optionsEls.usageStatsWrap.hidden=!models.length;optionsEls.usageStatsBody.replaceChildren(...models.slice(0,20).map(row=>{const tr=document.createElement('tr');const service=document.createElement('td');service.textContent=row.provider||row.source||'—';if(row.service&&row.service!==row.provider){service.append(document.createElement('br'));const note=document.createElement('small');note.textContent=row.service;service.append(note);}const cells=[row.model||'—',optionsUsageNum(row.requests),optionsUsageNum(row.inputTokens),optionsUsageNum(row.outputTokens),optionsUsageNum(row.failures)];for(const text of cells){const td=document.createElement('td');td.textContent=text;tr.append(td);}tr.prepend(service);return tr;}));}
async function optionsLoadUsageStats(){if(!optionsEls.usageStatsTotals)return;try{const payload=await request('USAGE_STATS_GET');optionsRenderUsageStats(payload?.usage);}catch(error){optionsSetResult(optionsEls.usageStatsResult,optionsErrorText(error),true);}}
function optionsCurrentModelScope(){try{return optionsModelScope(optionsCurrentProviderService({allowEmptyModel:true}));}catch{return '';}}
function optionsRenderProviderModels(){
  optionsEls.providerModelList.replaceChildren(new Option(optionsProviderModels.length?T('ctl.pickFetched'):T('ctl.fetchThenPick'),''),...optionsProviderModels.map(model=>new Option(model.name||model.id,model.id)));
  optionsEls.providerModelList.value=optionsProviderModels.some(model=>model.id===optionsEls.providerModel.value)?optionsEls.providerModel.value:'';
  optionsEls.providerModelNote.textContent=optionsProviderModels.length?T('ctl.fetchedN',{n:optionsProviderModels.length}):T('ctl.modelIdNote');
}
function optionsInvalidateProviderModels(){optionsProviderModels=[];optionsProviderModelsScope='';optionsRenderProviderModels();}
function optionsRenderProvider(){const kind=optionsProviderKind(),radio=document.querySelector('input[name="provider-kind"][value="'+kind+'"]');if(radio)radio.checked=true;
  const isApi = Boolean(optionsDraftServiceId) || (typeof serviceCatalog !== 'undefined' && serviceCatalog?.userSelected ? !['chatgpt', 'grok', 'antigravity'].includes(serviceCatalog.selectedKey) : kind === 'api');
  optionsEls.subscriptionPanel.hidden=isApi;optionsEls.apiPanel.hidden=!isApi;optionsRenderSubscription();
  const services=optionsState.settings.apiServices||[],active=activeApiProvider(optionsState.settings),provider=optionsDraftServiceId?{id:optionsDraftServiceId,name:'',providerId:'openai',baseUrl:'',model:'',apiKey:'',options:{}}:active;
  optionsEls.apiServiceSelect.replaceChildren(...services.map(service=>new Option(service.name+' · '+service.model,service.id)));if(!services.length)optionsEls.apiServiceSelect.append(new Option(T('ctl.noApiServices'),''));optionsEls.apiServiceSelect.value=optionsState.settings.activeApiServiceId||'';optionsEls.apiServiceSelect.disabled=!services.length;
  if(!optionsProviderDirty){const providerId=provider?(provider.providerId||'openai-compatible'):'openai',meta=getApiProvider(providerId)||getApiProvider('openai-compatible');optionsEls.providerId.value=meta.id;optionsRenderProviderFields(meta,provider?.options||{});optionsEls.providerName.value=provider?.name||meta.name;optionsEls.providerUrl.value=provider?.baseUrl||apiProviderBaseUrl(meta.id,provider?.options||{});optionsEls.providerConcurrency.value=provider?.maxConcurrency??API_SERVICE_CONCURRENCY.default;optionsEls.providerModel.value=provider?.model||meta.defaultModel||'';optionsEls.providerKey.value='';}
  if(optionsProviderModelsScope!==optionsCurrentModelScope()){optionsProviderModels=[];optionsProviderModelsScope='';}
  optionsProviderPicker.sync();
  const meta=getApiProvider(optionsEls.providerId.value),hasKey=Boolean(provider?.apiKey),keyCount=provider?.apiKeys?.length||0;optionsEls.providerKeyLink.hidden=!meta?.apiKeyUrl;optionsEls.providerKeyLink.href=meta?.apiKeyUrl||'#';optionsEls.providerKey.required=!meta?.keyOptional&&!hasKey;optionsEls.providerKey.placeholder=keyCount>1?T('ctl.keysKeep',{n:keyCount}):hasKey?T('ctl.keyKeep'):meta?.keyOptional?T('ctl.keyOptional'):T('ctl.keysInput');optionsEls.keyState.textContent=meta?.keyOptional?T('ctl.keyLocalOk'):keyCount>1?T('ctl.keysLocal',{n:keyCount}):hasKey?T('ctl.keyLocal'):T('ctl.keyPerService');
  optionsRenderProviderModels();
  optionsRenderRouting();
  optionsEls.testProvider.disabled=kind!=='api'||!active||Boolean(optionsDraftServiceId)||optionsProviderDirty;optionsEls.disconnectProvider.disabled=!active?.apiKey||Boolean(optionsDraftServiceId);optionsEls.deleteApiService.disabled=!active||Boolean(optionsDraftServiceId);optionsEls.cancelApiService.hidden=!optionsDraftServiceId;optionsEls.newApiService.disabled=services.length>=20;
  const editor=document.getElementById('api-editor');
  if(!active||optionsDraftServiceId)editor.open=true;
  editor.querySelector('summary').textContent=optionsDraftServiceId||!active?T('ctl.editConfig'):T('ctl.editCurrent');
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
    petStatus.querySelector('.stamp-status-text').textContent = petEnabled ? T('ctl.petOnline') : T('ctl.petOff');
  }
  const petThemeSelect = document.querySelector('#floating-pet-theme');
  if (petThemeSelect) petThemeSelect.value = optionsState.settings.floatingPet?.themeMode || 'auto';
  const petQuotesCfg = optionsState.settings.floatingPet?.quotes || {enabled: true, intervalMin: 15};
  const petQuotesEnabled = document.querySelector('#floating-pet-quotes-enabled');
  const petQuotesInterval = document.querySelector('#floating-pet-quotes-interval');
  if (petQuotesEnabled) petQuotesEnabled.checked = petQuotesCfg.enabled !== false;
  const complexToggle = document.querySelector('#complex-assist-enabled');
  if (complexToggle) complexToggle.checked = optionsState.settings.complexSentenceAssist !== false;
  const formulaToggle = document.querySelector('#formula-assist-enabled');
  if (formulaToggle) formulaToggle.checked = optionsState.settings.formulaAssist !== false;
  const pdfToggle = document.querySelector('#pdf-reader-enabled');
  if (pdfToggle) pdfToggle.checked = optionsState.settings.pdfReader !== false;
  if (petQuotesInterval) {
    petQuotesInterval.value = String([15, 30, 60].includes(petQuotesCfg.intervalMin) ? petQuotesCfg.intervalMin : 15);
    petQuotesInterval.disabled = petQuotesCfg.enabled === false;
  }
  optionsSetResult(optionsEls.dataProblem,optionsState.dataProblem||'',Boolean(optionsState.dataProblem));
  const video=optionsState.settings.video||{fontSize:20,theme:'auto'};
  optionsEls.videoFontSize.value=String(video.fontSize||20);optionsEls.videoTheme.value=video.theme||'auto';
  optionsRenderAutomation();optionsRenderSentenceAllSites();optionsRenderDetection();optionsRenderReadingStyle();optionsRenderSentenceDensity();optionsRenderSentenceLineStyle();optionsRenderRules();optionsRenderTerms();optionsRenderProvider();void optionsRefreshStructurePreview();syncChoiceCards();
}
async function optionsSavePatch(patch,message=T('ctl.saved')){optionsClearError();try{optionsState=await request('STATE_PATCH',{patch});window.optionsState=optionsState;optionsRenderAll();optionsShowSaved(message);return true;}catch(error){optionsShowError(error);optionsRenderAll();return false;}}
async function optionsPatchAutomation(patch,message){optionsClearError();try{optionsAutomation=await request('AUTOMATION_PATCH',{patch});optionsState.settings.automation=optionsAutomation.automation;optionsRenderAutomation();optionsRenderSentenceAllSites();void optionsRefreshStructurePreview();optionsShowSaved(message);return true;}catch(error){optionsShowError(error);optionsRenderAutomation();optionsRenderSentenceAllSites();void optionsRefreshStructurePreview();return false;}}
async function optionsSetSentenceLineStyle(lineStyle){
  if(!['solid','dashed','dotted','wavy'].includes(lineStyle))return;
  const previous=optionsSentenceLineStyle;optionsSentenceLineStyle=lineStyle;optionsRenderSentenceLineStyle();optionsRenderStructurePreview();
  optionsSentenceLineInputs.forEach(input=>{input.disabled=true;});optionsSetResult(optionsSentenceDensityResult,T('ctl.saving'));
  try{const saved=await request('SENTENCE_GROUPS_LINE_STYLE_SET',{lineStyle});optionsSentenceLineStyle=saved.lineStyle;optionsRenderSentenceLineStyle();optionsRenderStructurePreview();optionsSetResult(optionsSentenceDensityResult,T('ctl.lineSaved'));optionsShowSaved(T('ctl.lineSavedShort'));}
  catch(error){optionsSentenceLineStyle=previous;optionsRenderSentenceLineStyle();optionsRenderStructurePreview();optionsSetResult(optionsSentenceDensityResult,optionsErrorText(error),true);}
  finally{optionsSentenceLineInputs.forEach(input=>{input.disabled=false;});}
}
async function optionsSetSentenceDensity(density){
  if(!['coarse','medium','fine'].includes(density))return;
  const showResult=(message,isError=false)=>{optionsSetResult(optionsSentenceDensityResult,message,isError);optionsSetResult(document.querySelector('#detail-meter-result'),message,isError);};
  const previous=optionsSentenceDensity;optionsSentenceDensity=density;optionsRenderSentenceDensity();optionsRenderStructurePreview();
  optionsSentenceDensityInputs.forEach(input=>{input.disabled=true;});document.querySelector('#matrix-index-range').disabled=true;showResult(T('ctl.saving'));
  try{const saved=await request('SENTENCE_GROUPS_DENSITY_SET',{density});optionsSentenceDensity=['coarse','medium','fine'].includes(saved?.density)?saved.density:density;optionsRenderSentenceDensity();optionsRenderStructurePreview();showResult(T('ctl.densitySaved'));optionsShowSaved(T('ctl.densitySavedShort'));}
  catch(error){optionsSentenceDensity=previous;optionsRenderSentenceDensity();optionsRenderStructurePreview();showResult(optionsErrorText(error),true);}
  finally{optionsSentenceDensityInputs.forEach(input=>{input.disabled=false;});document.querySelector('#matrix-index-range').disabled=false;}
}
async function optionsToggleSite(site,enabled){const sites=optionsAutomation.automation.sites.filter(item=>item.origin!==site.origin);if(enabled!==null)sites.push({...site,enabled});await optionsPatchAutomation({sites},enabled===null?T('ctl.siteRemoved'):T('ctl.siteSaved'));}
function optionsParseProviderURL(value){const baseUrl=value.trim();if(!baseUrl||baseUrl.length>2048)throw new Error(T('ctl.apiUrlInvalid'));let url;try{url=new URL(baseUrl);}catch{throw new Error(T('ctl.apiUrlInvalid'));}const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);if(!url.hostname||(url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback)))throw new Error(T('ctl.apiUrlHttps'));if(url.username||url.password||url.search||url.hash)throw new Error(T('ctl.apiUrlClean'));return{baseUrl:baseUrl.replace(/\/+$/,''),url};}
function optionsOriginPattern(baseUrl){try{return baseUrl?`${new URL(baseUrl).origin}/*`:'';}catch{return'';}}
function optionsCredentialPatterns(settings){const patterns=new Set();for(const service of settings.apiServices||[])if(service.baseUrl)patterns.add(optionsOriginPattern(service.baseUrl));if(settings.domainDetection?.api?.apiKey&&settings.domainDetection?.api?.baseUrl)patterns.add(optionsOriginPattern(settings.domainDetection.api.baseUrl));if(settings.domainDetection?.jevApiKey)patterns.add(optionsOriginPattern(settings.domainDetection.jevBaseUrl||'https://router.requesty.ai/v1'));for(const site of settings.automation?.sites||[])if(site.enabled)patterns.add(site.origin+'/*');patterns.delete('');return patterns;}
async function optionsRemoveUnusedPermissions(before,after){if(after.automation?.allSites||after.automation?.sentenceGroupsAllSites)return;const needed=optionsCredentialPatterns(after);for(const pattern of optionsCredentialPatterns(before))if(!needed.has(pattern))await chrome.permissions.remove({origins:[pattern]});}
async function optionsEnsurePermission(pattern,needed){if(!needed)return false;const had=await chrome.permissions.contains({origins:[pattern]});const granted=had||await chrome.permissions.request({origins:[pattern]});if(!granted)throw new Error(T('ctl.permDenied'));return !had;}
function optionsParseConcurrency(value){const n=Math.trunc(Number(value));if(!Number.isInteger(n)||n<API_SERVICE_CONCURRENCY.min||n>API_SERVICE_CONCURRENCY.max)throw new Error(T('ctl.concurrency',{min:API_SERVICE_CONCURRENCY.min,max:API_SERVICE_CONCURRENCY.max}));return n;}
function optionsCurrentProviderService({allowEmptyModel=false}={}){
  const before=optionsState.settings,current=optionsDraftServiceId?null:activeApiProvider(before),providerId=optionsEls.providerId.value,options=optionsProviderOptions(),baseUrl=optionsEls.providerUrl.value.trim()||apiProviderBaseUrl(providerId,options),pattern=optionsOriginPattern(baseUrl),sameCredentialScope=(current?.providerId||'openai-compatible')===providerId&&optionsOriginPattern(current?.baseUrl)===pattern,enteredKeys=optionsParseKeyLines(optionsEls.providerKey.value);
  const service=normalizeApiService({id:optionsDraftServiceId||current?.id||crypto.randomUUID(),name:optionsEls.providerName.value.trim()||getApiProvider(providerId)?.name||'',providerId,baseUrl,model:optionsEls.providerModel.value.trim(),apiKey:enteredKeys[0]||(sameCredentialScope?current?.apiKey||'':''),apiKeys:enteredKeys.length?enteredKeys:(sameCredentialScope?current?.apiKeys||[]:[]),options,maxConcurrency:optionsParseConcurrency(optionsEls.providerConcurrency.value)});
  if(!allowEmptyModel&&!service.model)throw new Error(T('ctl.modelRequired'));if(service.name.length>60||service.model.length>150||service.apiKey.length>4096)throw new Error(T('ctl.fieldLengths'));if(!getApiProvider(providerId)?.keyOptional&&!service.apiKey)throw new Error(T('ctl.keyRequired'));return service;
}
async function optionsCleanupDraftPermissions(){for(const pattern of optionsDraftPermissionPatterns){if(!optionsCredentialPatterns(optionsState.settings).has(pattern))await chrome.permissions.remove({origins:[pattern]}).catch(()=>{});}optionsDraftPermissionPatterns.clear();}
async function optionsListProviderModels(){optionsSetResult(optionsEls.providerResult,T('ctl.fetching'));optionsEls.listProviderModels.disabled=true;let service,pattern,granted=false;try{service=optionsCurrentProviderService({allowEmptyModel:true});pattern=apiServiceOrigins(service)[0]+'/*';granted=await optionsEnsurePermission(pattern,true);if(granted)optionsDraftPermissionPatterns.add(pattern);const scope=optionsModelScope(service),result=await request('API_MODELS_LIST',{service});if(scope!==optionsCurrentModelScope()){optionsSetResult(optionsEls.providerResult,T('ctl.fetchChanged'));return;}optionsProviderModelsScope=scope;optionsProviderModels=Array.isArray(result.models)?result.models.filter(model=>model&&typeof model.id==='string'):[];optionsRenderProvider();optionsSetResult(optionsEls.providerResult,optionsProviderModels.length?T('ctl.fetched'):T('ctl.fetchEmpty'));}catch(error){if(granted){optionsDraftPermissionPatterns.delete(pattern);await chrome.permissions.remove({origins:[pattern]}).catch(()=>{});}optionsSetResult(optionsEls.providerResult,T('ctl.fetchFail',{err:optionsErrorText(error)}),true);}finally{optionsEls.listProviderModels.disabled=false;}}
async function optionsSaveProvider(event){
  event.preventDefault();optionsSetResult(optionsEls.providerResult,'');let service,pattern,granted=false;const before=structuredClone(optionsState.settings),current=optionsDraftServiceId?null:activeApiProvider(before);
  try{service=optionsCurrentProviderService();pattern=apiServiceOrigins(service)[0]+'/*';granted=await optionsEnsurePermission(pattern,true);const services=before.apiServices||[],apiServices=services.some(item=>item.id===service.id)?services.map(item=>item.id===service.id?service:item):[...services,service];if(!await optionsSavePatch({providerKind:'api',apiServices,activeApiServiceId:service.id},T('ctl.svcSwitched'))){if(granted&&!optionsCredentialPatterns(before).has(pattern))await chrome.permissions.remove({origins:[pattern]});return;}optionsDraftPermissionPatterns.delete(pattern);optionsDraftServiceId=null;optionsProviderDirty=false;await optionsRemoveUnusedPermissions(before,optionsState.settings);optionsRenderProvider();document.getElementById('api-editor').open=false;optionsSetResult(optionsEls.providerResult,T('ctl.svcSaved'));}
  catch(error){if(granted&&!optionsCredentialPatterns(optionsState.settings).has(pattern))await chrome.permissions.remove({origins:[pattern]}).catch(()=>{});optionsSetResult(optionsEls.providerResult,optionsErrorText(error),true);}
}
async function optionsSaveDetection(){const mode=document.querySelector('input[name="domain-detection-mode"]:checked')?.value||'local',before=structuredClone(optionsState.settings),current=optionsDetectionSettings(),useTranslationApi=optionsEls.detectionUseTranslationApi.checked;let api=current.api||{baseUrl:'https://api.openai.com/v1',apiKey:''},parsed=null,granted=false,jevGranted=false,parsedJev=null,jevOrigin='https://router.requesty.ai/*';try{if(mode==='api'&&!useTranslationApi){parsed=optionsParseProviderURL(optionsEls.detectionApiUrl.value);const entered=optionsEls.detectionApiKey.value.trim();if(entered.length>4096)throw new Error(T('ctl.detKeyLong'));api={baseUrl:parsed.baseUrl,apiKey:entered||(optionsOriginPattern(api.baseUrl)===`${parsed.url.origin}/*`?api.apiKey||'':'')};if(!optionsEls.detectionApiModel.value.trim())throw new Error(T('ctl.detModelRequired'));granted=await optionsEnsurePermission(`${parsed.url.origin}/*`,Boolean(api.apiKey));}if(mode==='jev'&&optionsEls.detectionJevUrl){parsedJev=optionsParseProviderURL(optionsEls.detectionJevUrl.value||'https://router.requesty.ai/v1');jevOrigin=`${parsedJev.url.origin}/*`;}const jevBaseUrl=parsedJev?parsedJev.baseUrl:(optionsEls.detectionJevUrl?.value?.trim()||current.jevBaseUrl||'https://router.requesty.ai/v1');const jevModel=(optionsEls.detectionJevModel?.value?.trim())||current.jevModel||'typesafe/jev-1.13.0';const enteredJevKey=optionsEls.detectionJevKey?.value?.trim()||'';if(enteredJevKey.length>4096)throw new Error(T('ctl.jevKeyLong'));const jevApiKey=enteredJevKey||current.jevApiKey||'';if(mode==='jev'){if(!jevApiKey)throw new Error(T('ctl.jevKeyRequired'));if(!jevModel)throw new Error(T('ctl.jevModelRequired'));jevGranted=await optionsEnsurePermission(jevOrigin,true);}const saved=await optionsSavePatch({domainDetection:{mode,subscriptionModel:optionsEls.detectionSubscriptionModel.value,apiModel:optionsEls.detectionApiModel.value.trim(),useTranslationApi,api,jevModel,jevApiKey,jevBaseUrl}},T('ctl.detSaved'));if(!saved){if(granted)await chrome.permissions.remove({origins:[`${parsed.url.origin}/*`]});if(jevGranted)await chrome.permissions.remove({origins:[jevOrigin]});return;}optionsDetectionDirty=false;await optionsRemoveUnusedPermissions(before,optionsState.settings);optionsRenderDetection();}catch(error){optionsShowError(error);}}
async function optionsTestProvider(element){optionsSetResult(element,T('ctl.testing'));optionsEls.testProvider.disabled=true;optionsEls.testSubscription.disabled=true;try{const result=await request('PROVIDER_TEST');optionsSetResult(element,T('ctl.testHint',{hint:result.hint}));}catch(error){optionsSetResult(element,T('ctl.testFail',{err:optionsErrorText(error)}),true);}finally{optionsRenderProvider();}}
async function optionsSyncState(){if(optionsCurrentSection==='diagnostics')return;[optionsState,optionsAutomation]=await Promise.all([request('STATE_GET'),request('AUTOMATION_GET')]);optionsState.settings.automation=optionsAutomation.automation;window.optionsState=optionsState;optionsRenderAll();}
async function optionsLoadModels(refresh=false){let loaded=true;try{const result=await request('MODELS_LIST',{refresh,kind:optionsSubscriptionKind()});optionsModels=Array.isArray(result.models)?result.models:[];}catch(error){loaded=false;optionsSetResult(optionsEls.subscriptionResult,T('ctl.modelsFail',{err:optionsErrorText(error)}),true);}if(optionsState){optionsRenderSubscription();optionsRenderDetection();}return loaded;}
async function optionsRefreshSubscription(refresh=false){if(optionsSubscriptionBusy||optionsProviderKind()==='api')return;optionsSubscriptionBusy=true;optionsRenderSubscription();try{const kind=optionsSubscriptionKind();const subscription=await request('SUBSCRIPTION_STATUS',{kind});optionsState.subscription=subscription;await optionsSyncState();if(!subscription.connected||subscription.error){optionsSetResult(optionsEls.subscriptionResult,'');return;}if(await optionsLoadModels(refresh))optionsSetResult(optionsEls.subscriptionResult,T('ctl.accountUpdated'));}catch(error){optionsSetResult(optionsEls.subscriptionResult,optionsErrorText(error),true);}finally{optionsSubscriptionBusy=false;optionsRenderSubscription();}}
async function optionsSubscriptionAction(type){if(optionsSubscriptionBusy)return;optionsSubscriptionBusy=true;optionsRenderSubscription();try{const kind=optionsSubscriptionKind();optionsState.subscription=await request(type,{kind});await optionsSyncState();optionsSetResult(optionsEls.subscriptionResult,type==='SUBSCRIPTION_LOGOUT'?T('ctl.loggedOut',{label:optionsSubscriptionLabel(kind)}):T('ctl.stateUpdated'));}catch(error){optionsSetResult(optionsEls.subscriptionResult,optionsErrorText(error),true);}finally{optionsSubscriptionBusy=false;optionsRenderSubscription();}}
async function optionsExportData(){optionsSetResult(optionsEls.dataResult,T('ctl.exporting'));try{const payload=await request('READING_DATA_EXPORT');const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`roamcat-support-data-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);optionsSetResult(optionsEls.dataResult,T('ctl.exported'));}catch(error){optionsSetResult(optionsEls.dataResult,optionsErrorText(error),true);}}
function optionsDiagnosticNumber(value){return Number.isFinite(value)&&value>=0?String(value):'—';}
function optionsDiagnosticTime(value){if(!Number.isFinite(value))return T('ctl.timeUnknown');const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString(globalThis.RoamCatI18n?.lang?.()==='en'?'en-US':'zh-CN',{hour12:false}):'时间未知';}
function optionsDiagnosticFingerprint(event){const ref=event.modelRef||event.providerRef;return typeof ref==='string'?ref.slice(0,12)+'…':'';}
function optionsDiagnosticLabel(code){const k=diagnosticCodeLabels[code];return k?T(k):T('diag.code.UNKNOWN');}
function optionsRenderDiagnostics(payload){
  const summary=payload?.summary||{},native=payload?.native||{};
  optionsEls.diagnosticsEnabled.checked=payload?.enabled!==false;
  optionsEls.diagnosticsRecordingNote.textContent=payload?.enabled===false?T('ctl.diagOff'):T('ctl.diagOn');
  optionsEls.diagnosticsStorageError.hidden=!payload?.storageError;
  optionsEls.diagnosticsNativeDot.classList.toggle('active',Boolean(native.connected));
  optionsEls.diagnosticsNativeState.textContent=native.connected?T('ctl.connOn'):T('ctl.connOff');
  optionsEls.diagnosticsNativeNote.textContent=native.pendingClear?T('ctl.connPending'):native.connected?(native.mirror?T('ctl.connMirror'):T('ctl.connUnsynced')):T('ctl.connIdle');
  optionsEls.diagnosticsRequests.textContent=optionsDiagnosticNumber(summary.requests);
  optionsEls.diagnosticsFailures.textContent=optionsDiagnosticNumber(summary.failures);
  optionsEls.diagnosticsSlow.textContent=optionsDiagnosticNumber(summary.slow);
  optionsEls.diagnosticsPending.textContent=optionsDiagnosticNumber(summary.pending);
  const issues=Array.isArray(summary.issues)?summary.issues:[];
  optionsEls.diagnosticsIssues.replaceChildren();
  for(const issue of issues){const row=document.createElement('div');row.className='diagnostics-issue';const text=document.createElement('div');const title=document.createElement('b');title.textContent=optionsDiagnosticLabel(issue.code);const operation=document.createElement('span');operation.textContent=T(diagnosticOperationLabels[issue.operation]||'diag.op.other');text.append(title,operation);const count=document.createElement('strong');count.textContent=optionsDiagnosticNumber(issue.count);count.setAttribute('aria-label',T('ctl.times',{n:count.textContent}));row.append(text,count);optionsEls.diagnosticsIssues.append(row);}
  optionsEls.diagnosticsIssuesEmpty.hidden=issues.length>0;
  const events=(Array.isArray(payload?.events)?payload.events:[]).slice().sort((a,b)=>(Number(b?.at)||0)-(Number(a?.at)||0)).slice(0,50);
  optionsEls.diagnosticsEvents.replaceChildren();
  for(const event of events){const row=document.createElement('article');row.className=`diagnostics-event status-${event.status||'unknown'}`;const head=document.createElement('div');const operation=document.createElement('b');operation.textContent=T(diagnosticOperationLabels[event.operation]||'diag.op.other');const status=document.createElement('span');status.textContent=T(diagnosticStatusLabels[event.status]||'diag.status.unknown');head.append(operation,status);const details=document.createElement('dl');const values=[[T('diag.f.item'),Number.isInteger(event.itemIndex)?T('diag.f.itemN',{n:event.itemIndex+1}):''],[T('diag.f.chars'),Number.isInteger(event.translationLength)?String(event.translationLength):''],[T('diag.f.batch'),event.inputIds?.join(', ')],[T('diag.f.out'),event.outputIds?.join(', ')],[T('diag.f.fields'),event.fields?.join(', ')],[T('diag.f.http'),event.httpStatus?String(event.httpStatus):''],[T('diag.f.kind'),({word:T('diag.f.kind.word'),phrase:T('diag.f.kind.phrase'),passage:T('diag.f.kind.passage')})[event.kind]],[T('diag.f.time'),optionsDiagnosticTime(event.at)],[T('diag.f.trace'),event.traceId],[T('diag.f.stage'),T(diagnosticStageLabels[event.stage]||'diag.stage.other')],[T('diag.f.dur'),Number.isFinite(event.durationMs)?`${event.durationMs} ms`:''],[T('diag.f.fp'),optionsDiagnosticFingerprint(event)]];for(const [label,value] of values){if(!value)continue;const group=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;group.append(dt,dd);details.append(group);}row.append(head,details);optionsEls.diagnosticsEvents.append(row);}
  optionsEls.diagnosticsEventsEmpty.hidden=events.length>0;
  optionsEls.diagnosticsUpdated.textContent=T('ctl.diagUpdated');
}
function optionsDiagnosticsVisible(){return optionsCurrentSection==='diagnostics'&&!document.hidden;}
async function optionsRefreshDiagnostics(){if(!optionsDiagnosticsVisible()||optionsDiagnosticsBusy)return;const sequence=++optionsDiagnosticsSequence;optionsDiagnosticsBusy=true;try{const payload=await request('DIAGNOSTICS_GET');if(sequence===optionsDiagnosticsSequence)optionsRenderDiagnostics(payload);}catch(error){if(sequence===optionsDiagnosticsSequence)optionsSetResult(optionsEls.diagnosticsResult,optionsErrorText(error),true);}finally{if(sequence===optionsDiagnosticsSequence)optionsDiagnosticsBusy=false;}}
async function optionsSetDiagnosticsEnabled(){const enabled=optionsEls.diagnosticsEnabled.checked,sequence=++optionsDiagnosticsSequence;optionsDiagnosticsBusy=true;optionsEls.diagnosticsEnabled.disabled=true;optionsSetResult(optionsEls.diagnosticsResult,T('ctl.saving'));try{const payload=await request('DIAGNOSTICS_SET',{enabled});if(sequence===optionsDiagnosticsSequence){optionsRenderDiagnostics(payload);optionsSetResult(optionsEls.diagnosticsResult,enabled?T('ctl.diagOnMsg'):T('ctl.diagOffMsg'));}}catch(error){if(sequence===optionsDiagnosticsSequence){optionsEls.diagnosticsEnabled.checked=!enabled;optionsSetResult(optionsEls.diagnosticsResult,optionsErrorText(error),true);}}finally{if(sequence===optionsDiagnosticsSequence){optionsDiagnosticsBusy=false;optionsEls.diagnosticsEnabled.disabled=false;}}}
async function optionsExportDiagnostics(){optionsEls.exportDiagnostics.disabled=true;optionsSetResult(optionsEls.diagnosticsResult,T('ctl.exporting'));try{const payload=await request('DIAGNOSTICS_EXPORT');const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`roamcat-diagnostics-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);optionsSetResult(optionsEls.diagnosticsResult,T('ctl.diagExported'));}catch(error){optionsSetResult(optionsEls.diagnosticsResult,optionsErrorText(error),true);}finally{optionsEls.exportDiagnostics.disabled=false;}}
async function optionsClearDiagnostics(){if(!confirm(T('ctl.diagClearConfirm')))return;const sequence=++optionsDiagnosticsSequence;optionsDiagnosticsBusy=true;optionsEls.clearDiagnostics.disabled=true;try{const payload=await request('DIAGNOSTICS_CLEAR');if(sequence===optionsDiagnosticsSequence){optionsRenderDiagnostics(payload);optionsSetResult(optionsEls.diagnosticsResult,payload.native?.pendingClear?T('ctl.diagClearedPending'):T('ctl.diagCleared'));}}catch(error){if(sequence===optionsDiagnosticsSequence)optionsSetResult(optionsEls.diagnosticsResult,optionsErrorText(error),true);}finally{if(sequence===optionsDiagnosticsSequence){optionsDiagnosticsBusy=false;optionsEls.clearDiagnostics.disabled=false;}}}

optionsEls.readingStylePreview.addEventListener('load',optionsObserveStylePreview);
for(const layer of optionsReadingLayers){const controls=optionsReadingControls[layer];for(const input of [controls.style,controls.size])input.addEventListener('change',()=>{const readingStyle=optionsReadingStyleValue();optionsPreviewReadingStyle(readingStyle);void optionsSaveReadingStyle(readingStyle);});controls.palette.addEventListener('click',event=>{const button=event.target.closest('button[data-color]');if(!button)return;const color=button.dataset.color;controls.group.dataset.color=color;if(color!=='auto'){controls.color.value=color;if(controls.style.value==='plain'||(layer!=='original'&&controls.style.value==='default'))controls.style.value='color';}optionsUpdateReadingColorUI(layer);const readingStyle=optionsReadingStyleValue();optionsPreviewReadingStyle(readingStyle);void optionsSaveReadingStyle(readingStyle);});controls.color.addEventListener('input',()=>{controls.group.dataset.color=controls.color.value;if(controls.style.value==='plain'||(layer!=='original'&&controls.style.value==='default'))controls.style.value='color';optionsUpdateReadingColorUI(layer);optionsPreviewReadingStyle(optionsReadingStyleValue());});controls.color.addEventListener('change',()=>{const readingStyle=optionsReadingStyleValue();optionsPreviewReadingStyle(readingStyle);void optionsSaveReadingStyle(readingStyle);});}
optionsEls.resetReadingStyle.addEventListener('click',()=>void optionsSaveReadingStyle(structuredClone(globalThis.RoamCatReadingStyle.defaults),T('ctl.styleReset')));
optionsEls.newApiService.addEventListener('click',async()=>{if(!optionsDiscardProviderDraft())return;await optionsCleanupDraftPermissions();optionsDraftServiceId=crypto.randomUUID();optionsProviderDirty=false;optionsProviderModels=[];optionsRenderProvider();optionsSetResult(optionsEls.providerResult,T('ctl.newService'));document.getElementById('provider-trigger').focus();});
optionsEls.cancelApiService.addEventListener('click',async()=>{if(!optionsDiscardProviderDraft())return;await optionsCleanupDraftPermissions();optionsDraftServiceId=null;optionsProviderDirty=false;optionsProviderModels=[];optionsRenderProvider();optionsSetResult(optionsEls.providerResult,'');});
optionsEls.apiServiceSelect.addEventListener('change',async()=>{const id=optionsEls.apiServiceSelect.value;if(!optionsDiscardProviderDraft()){optionsEls.apiServiceSelect.value=optionsState.settings.activeApiServiceId||'';return;}const service=optionsState.settings.apiServices.find(item=>item.id===id);if(!service)return;try{await optionsCleanupDraftPermissions();await optionsEnsurePermission(optionsOriginPattern(service.baseUrl),true);optionsDraftServiceId=null;optionsProviderDirty=false;optionsProviderModels=[];await optionsSavePatch({providerKind:'api',activeApiServiceId:id},T('ctl.switchedTo',{name:service.name}));optionsRenderProvider();}catch(error){optionsShowError(error);optionsRenderProvider();}});
optionsEls.deleteApiService.addEventListener('click',async()=>{const current=activeApiProvider(optionsState.settings);if(!current)return;const before=structuredClone(optionsState.settings),apiServices=before.apiServices.filter(service=>service.id!==current.id),next=apiServices[0];if(!confirm(T('ctl.delServiceA',{name:current.name})+(next?T('ctl.delServiceSwitch',{name:next.name}):T('ctl.delServiceNone'))+T('ctl.delServiceTail')))return;if(await optionsSavePatch({apiServices,activeApiServiceId:next?.id||''},T('ctl.svcDeleted'))){optionsProviderDirty=false;await optionsRemoveUnusedPermissions(before,optionsState.settings);optionsRenderProvider();}});
optionsEls.providerName.addEventListener('input',()=>{optionsProviderDirty=true;});
optionsEls.providerId.addEventListener('change',async()=>{if(!optionsDiscardProviderDraft()){optionsProviderDirty=false;optionsRenderProvider();return;}await optionsCleanupDraftPermissions();const meta=getApiProvider(optionsEls.providerId.value);optionsRenderProviderFields(meta);optionsEls.providerName.value=meta.name;optionsEls.providerUrl.value=apiProviderBaseUrl(meta.id,optionsProviderOptions());optionsEls.providerModel.value=meta.defaultModel||'';optionsEls.providerKey.value='';optionsProviderModels=[];optionsProviderDirty=true;optionsRenderProvider();optionsSetResult(optionsEls.providerResult,T('ctl.providerChanged'));});


for(const tab of optionsAppearanceTabs){
  tab.addEventListener('click',()=>optionsSelectAppearance(tab.dataset.appearanceTab));
  tab.addEventListener('keydown',event=>{
    const index=optionsAppearanceTabs.indexOf(tab),last=optionsAppearanceTabs.length-1;
    const next=event.key==='ArrowRight'?(index+1)%(last+1):event.key==='ArrowLeft'?(index+last)%(last+1):event.key==='Home'?0:event.key==='End'?last:null;
    if(next===null)return;event.preventDefault();optionsSelectAppearance(optionsAppearanceTabs[next].dataset.appearanceTab);optionsAppearanceTabs[next].focus();
  });
}
optionsEls.readingDomain.addEventListener('change',()=>void optionsSavePatch({domain:optionsEls.readingDomain.value}));
optionsEls.lookupKey.addEventListener('change',()=>{const lookupKey=optionsEls.lookupKey.value;const keycap=document.querySelector('#keycap-badge');if(keycap)keycap.textContent=lookupKey;void optionsSavePatch({lookupKey},T('ctl.lookupSaved',{key:lookupKey}));});
optionsEls.helpLanguage.addEventListener('change',()=>void optionsSavePatch({helpLanguage:optionsEls.helpLanguage.value},T('ctl.helpLangSaved')));
optionsSentenceDensityInputs.forEach(input=>input.addEventListener('change',()=>void optionsSetSentenceDensity(input.value)));
optionsSentenceLineInputs.forEach(input=>input.addEventListener('change',()=>void optionsSetSentenceLineStyle(input.value)));
optionsSentenceAllSites.addEventListener('change',async()=>{const enabled=optionsSentenceAllSites.checked;optionsSentenceAllSites.disabled=true;try{if(enabled&&!await chrome.permissions.request({origins:ALL_HOSTS}))throw new Error(T('ctl.permAllDenied'));await optionsPatchAutomation({sentenceGroupsAllSites:enabled},enabled?T('ctl.structAllOn'):T('ctl.structAllOff'));}catch(error){optionsShowError(error);optionsRenderSentenceAllSites();void optionsRefreshStructurePreview();}finally{optionsSentenceAllSites.disabled=false;}});
document.querySelectorAll('input[name="assistance-mode"]').forEach(input=>input.addEventListener('change',()=>void optionsSavePatch({assistanceMode:input.value},input.value==='on-demand'?T('ctl.modeManual'):T('ctl.modeAuto'))));
optionsLookupDisplayInputs.forEach(input=>input.addEventListener('change',()=>void optionsSavePatch({lookupDisplay:input.value},T('ctl.displaySaved'))));
optionsEls.rememberSupport.addEventListener('change',()=>void optionsSavePatch({rememberSupport:optionsEls.rememberSupport.checked},optionsEls.rememberSupport.checked?T('ctl.memOn'):T('ctl.memOff')));
optionsEls.automationAllSites.addEventListener('change',async()=>{const enabled=optionsEls.automationAllSites.checked;try{if(enabled&&!await chrome.permissions.request({origins:['http://*/*','https://*/*']}))throw new Error(T('ctl.permAllDenied'));await optionsPatchAutomation({allSites:enabled},enabled?T('ctl.assistAllOn'):T('ctl.assistAllOff'));}catch(error){optionsShowError(error);optionsRenderAutomation();}});
optionsEls.automationVideoSites.addEventListener('change',async()=>{const enabled=optionsEls.automationVideoSites.checked;try{if(enabled&&!await chrome.permissions.request({origins:['https://www.youtube.com/*','https://m.youtube.com/*']}))throw new Error(T('ctl.permVideoDenied'));await optionsPatchAutomation({videoSites:enabled},enabled?T('ctl.videoOn'):T('ctl.videoOff'));}catch(error){optionsShowError(error);optionsRenderAutomation();}});
optionsEls.automationSiteForm.addEventListener('submit',async event=>{event.preventDefault();try{const origin=optionsParseOrigin(optionsEls.automationSiteOrigin.value);if(!await chrome.permissions.request({origins:[`${origin}/*`]}))throw new Error(T('ctl.permSiteDenied'));const sites=optionsAutomation.automation.sites.filter(site=>site.origin!==origin);if(await optionsPatchAutomation({sites:[...sites,{origin,enabled:true}]},T('ctl.siteAutoOn'))){event.target.reset();optionsSetResult(optionsEls.automationResult,T('ctl.siteAdded'));}}catch(error){optionsSetResult(optionsEls.automationResult,optionsErrorText(error),true);}});
[[optionsEls.videoFontSize,'fontSize',Number],[optionsEls.videoTheme,'theme',String]].forEach(([input,key,convert])=>input.addEventListener('change',async()=>{try{const result=await request('VIDEO_SETTINGS_PATCH',{patch:{[key]:convert(input.value)}});optionsState.settings.video=result.video;optionsRenderAll();optionsShowSaved(T('ctl.videoSaved'));}catch(error){optionsShowError(error);optionsRenderAll();}}));
document.querySelectorAll('input[name="domain-detection-mode"]').forEach(input=>input.addEventListener('change',()=>{optionsDetectionDirty=true;optionsEls.detectionChatgpt.hidden=input.value!=='chatgpt'&&input.value!=='grok'&&input.value!=='antigravity';optionsEls.detectionApi.hidden=input.value!=='api';if(optionsEls.detectionJev)optionsEls.detectionJev.hidden=input.value!=='jev';}));
[optionsEls.detectionSubscriptionModel,optionsEls.detectionUseTranslationApi,optionsEls.detectionApiModel,optionsEls.detectionApiUrl,optionsEls.detectionApiKey,optionsEls.detectionJevModel,optionsEls.detectionJevUrl,optionsEls.detectionJevKey].filter(Boolean).forEach(input=>input.addEventListener('input',()=>{optionsDetectionDirty=true;optionsEls.detectionApiFields.hidden=optionsEls.detectionUseTranslationApi.checked;}));
optionsEls.detectionUseTranslationApi.addEventListener('change',()=>{optionsDetectionDirty=true;optionsEls.detectionApiFields.hidden=optionsEls.detectionUseTranslationApi.checked;});
optionsEls.saveRecognition.addEventListener('click',()=>void optionsSaveDetection());
optionsEls.clearDetectionKey.addEventListener('click',async()=>{const current=optionsDetectionSettings();if(!current.api?.apiKey||!confirm(T('ctl.clearKeyConfirm')))return;const before=structuredClone(optionsState.settings);if(await optionsSavePatch({domainDetection:{...current,api:{...current.api,apiKey:''}}},T('ctl.detKeyCleared')))await optionsRemoveUnusedPermissions(before,optionsState.settings);});
if(optionsEls.clearDetectionJevKey){optionsEls.clearDetectionJevKey.addEventListener('click',async()=>{const current=optionsDetectionSettings();if(!current.jevApiKey||!confirm(T('ctl.clearJevConfirm')))return;const before=structuredClone(optionsState.settings);if(await optionsSavePatch({domainDetection:{...current,jevApiKey:''}},T('ctl.jevCleared'))){optionsDetectionDirty=false;await optionsRemoveUnusedPermissions(before,optionsState.settings);optionsRenderDetection();}});}
optionsEls.runDomainTest.addEventListener('click',async()=>{const text=optionsEls.domainTestText.value.trim();if(!text){optionsSetResult(optionsEls.domainTestResult,T('ctl.testEmpty'),true);return;}optionsEls.runDomainTest.disabled=true;try{const result=await request('DOMAIN_TEST',{text});const details=[T('ctl.fieldDomain',{v:optionsDomainName(result.domain)}),T('ctl.fieldSource',{v:T(optionsSourceLabels[result.source]||'')||result.source})];if(typeof result.score==='number')details.push(T('ctl.fieldScore',{v:(result.score*100).toFixed(1)}));if(result.warning)details.push(result.warning);optionsSetResult(optionsEls.domainTestResult,details.join(' · '));}catch(error){optionsSetResult(optionsEls.domainTestResult,optionsErrorText(error),true);}finally{optionsEls.runDomainTest.disabled=false;}});
optionsEls.domainRuleForm.addEventListener('submit',async event=>{event.preventDefault();const host=optionsEls.ruleHost.value.trim().toLowerCase(),pathPrefix=optionsEls.rulePath.value.trim();if(!host||!pathPrefix.startsWith('/')){optionsSetResult(optionsEls.domainRuleResult,T('ctl.ruleInvalid'),true);return;}const rules=optionsState.settings.domainRules||[];const rule={host,pathPrefix,domain:optionsEls.ruleDomain.value,includeSubdomains:optionsEls.ruleSubdomains.checked};if(await optionsSavePatch({domainRules:[...rules,rule]},T('ctl.ruleAdded')))event.target.reset();});
optionsEls.termForm.addEventListener('submit',async event=>{event.preventDefault();const term=optionsEls.termSource.value.trim(),translation=optionsEls.termTranslation.value.trim();if(!term||!translation)return;const terms=optionsState.settings.customTerms||[];if(await optionsSavePatch({customTerms:[...terms,{term,translation,domain:optionsEls.termDomain.value}]},T('ctl.termAdded')))event.target.reset();});
document.querySelectorAll('input[name="provider-kind"]').forEach(input=>input.addEventListener('change',()=>void optionsSavePatch({providerKind:input.value},input.value==='api'?T('ctl.toApi'):input.value==='grok'?T('ctl.toGrok'):input.value==='antigravity'?T('ctl.toAgy'):T('ctl.toChatgpt'))));
optionsEls.subscriptionModel.addEventListener('change',()=>void optionsSavePatch({subscriptionModel:optionsEls.subscriptionModel.value},T('ctl.assistModelSaved')));
optionsEls.refreshSubscription.addEventListener('click',()=>void optionsRefreshSubscription(true));optionsEls.loginSubscription.addEventListener('click',()=>void optionsSubscriptionAction('SUBSCRIPTION_LOGIN'));optionsEls.cancelSubscription.addEventListener('click',()=>void optionsSubscriptionAction('SUBSCRIPTION_CANCEL'));optionsEls.logoutSubscription.addEventListener('click',()=>void optionsSubscriptionAction('SUBSCRIPTION_LOGOUT'));optionsEls.testSubscription.addEventListener('click',()=>void optionsTestProvider(optionsEls.subscriptionResult));
for(const [,elementKey]of optionsRouteTasks){const el=optionsEls[elementKey];el?.addEventListener('change',()=>{const apiRouting={};for(const [task,key]of optionsRouteTasks)apiRouting[task]=optionsEls[key]?.value||'';void optionsSavePatch({apiRouting},T('ctl.routeSaved'));});}
optionsEls.usageStatsRefresh?.addEventListener('click',()=>void optionsLoadUsageStats());optionsEls.usageStatsClear?.addEventListener('click',async()=>{if(!confirm(T('ctl.usageClearConfirm')))return;try{const payload=await request('USAGE_STATS_CLEAR');optionsRenderUsageStats(payload?.usage);optionsSetResult(optionsEls.usageStatsResult,T('ctl.usageCleared'));}catch(error){optionsSetResult(optionsEls.usageStatsResult,optionsErrorText(error),true);}});
optionsEls.providerForm.addEventListener('submit',optionsSaveProvider);[optionsEls.providerUrl,optionsEls.providerConcurrency,optionsEls.providerModel,optionsEls.providerKey].forEach(input=>input.addEventListener('input',()=>{optionsProviderDirty=true;optionsInvalidateProviderModels();optionsEls.testProvider.disabled=true;optionsSetResult(optionsEls.providerResult,T('ctl.unsavedNote'));}));optionsEls.providerModelList.addEventListener('change',()=>{if(!optionsEls.providerModelList.value)return;optionsEls.providerModel.value=optionsEls.providerModelList.value;optionsProviderDirty=true;optionsSetResult(optionsEls.providerResult,T('ctl.modelChosen'));});optionsEls.listProviderModels.addEventListener('click',()=>void optionsListProviderModels());optionsEls.testProvider.addEventListener('click',()=>void optionsTestProvider(optionsEls.providerResult));
optionsEls.disconnectProvider.addEventListener('click',async()=>{const current=activeApiProvider(optionsState.settings);if(!current?.apiKey||!confirm(T('ctl.clearKeyConfirm2',{name:current.name})))return;const before=structuredClone(optionsState.settings);if(await optionsSavePatch({apiServices:before.apiServices.map(service=>service.id===current.id?{...service,apiKey:'',apiKeys:[]}:service)},T('ctl.keyCleared'))){optionsProviderDirty=false;await optionsRemoveUnusedPermissions(before,optionsState.settings);optionsRenderProvider();}});
optionsEls.copyInstallCommand.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(optionsEls.installCommand.textContent);optionsEls.copyInstallCommand.textContent=T('ctl.copied');setTimeout(()=>{optionsEls.copyInstallCommand.textContent=T('ctl.copy');},1600);}catch(error){optionsSetResult(optionsEls.subscriptionResult,T('ctl.copyFail',{err:optionsErrorText(error)}),true);}});
optionsEls.exportData.addEventListener('click',()=>void optionsExportData());optionsEls.clearMemory.addEventListener('click',async()=>{if(!confirm(T('ctl.clearAllConfirm')))return;try{await request('MEMORY_CLEAR');optionsSetResult(optionsEls.dataResult,T('ctl.allCleared'));}catch(error){optionsSetResult(optionsEls.dataResult,optionsErrorText(error),true);}});optionsEls.openExtensionManager.addEventListener('click',()=>{try{const extId=window.chrome?.runtime?.id||'';if(window.chrome?.tabs?.create){chrome.tabs.create({url:'chrome://extensions/'+(extId?'?id='+extId:'')}).catch(()=>{prompt(T('ctl.extMgrPrompt'),'chrome://extensions/'+(extId?'?id='+extId:''));});}else{prompt(T('ctl.extMgrPrompt'),'chrome://extensions/');}}catch{prompt(T('ctl.extMgrPrompt'),'chrome://extensions/');}});
optionsEls.diagnosticsEnabled.addEventListener('change',()=>void optionsSetDiagnosticsEnabled());
optionsEls.exportDiagnostics.addEventListener('click',()=>void optionsExportDiagnostics());
// 开发与更新友好：一键重载扩展，替代跑去 chrome://extensions 点「重新加载」；
// 设置改动均已即时保存，重载后本页与已打开标签页可由页面角落的刷新提示恢复。
optionsEls.reloadExtension?.addEventListener('click',()=>{try{chrome.runtime.reload();}catch(error){optionsSetResult(optionsEls.diagnosticsResult,T('ctl.reloadFail',{err:error?.message||'unknown'}),true);}});
document.querySelectorAll('.js-open-welcome').forEach(button=>button.addEventListener('click',()=>{void focusWelcomeGuide().catch(error=>optionsSetResult(optionsEls.globalError,error?.message||T('ctl.welcomeFail'),true));}));
document.querySelectorAll('.js-open-shortcuts').forEach(button=>button.addEventListener('click',()=>{try{if(window.chrome?.tabs?.create){chrome.tabs.create({url:'chrome://extensions/shortcuts'}).catch(()=>{prompt(T('ctl.shortcutPrompt'),'chrome://extensions/shortcuts');});}else{prompt(T('ctl.shortcutPrompt'),'chrome://extensions/shortcuts');}}catch{prompt(T('ctl.shortcutPrompt'),'chrome://extensions/shortcuts');}}));
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
    }, enabled ? T('ctl.petOn') : T('ctl.petOffMsg'));
  });

  document.querySelector('#floating-pet-theme')?.addEventListener('change', event => {
    const themeMode = event.target.value;
    void optionsSavePatch({
      floatingPet: {
        ...(optionsState.settings.floatingPet || {}),
        themeMode
      }
    }, T('ctl.petThemeSaved'));
  });

  document.querySelector('#floating-pet-quotes-enabled')?.addEventListener('change', event => {
    const enabled = event.target.checked;
    const intervalSelect = document.querySelector('#floating-pet-quotes-interval');
    if (intervalSelect) intervalSelect.disabled = !enabled;
    void optionsSavePatch({
      floatingPet: {
        ...(optionsState.settings.floatingPet || {}),
        quotes: {
          ...(optionsState.settings.floatingPet?.quotes || {}),
          enabled
        }
      }
    }, enabled ? T('ctl.quotesOn') : T('ctl.quotesOff'));
  });

  document.querySelector('#floating-pet-quotes-interval')?.addEventListener('change', event => {
    const intervalMin = Number(event.target.value);
    void optionsSavePatch({
      floatingPet: {
        ...(optionsState.settings.floatingPet || {}),
        quotes: {
          ...(optionsState.settings.floatingPet?.quotes || {}),
          intervalMin
        }
      }
    }, T('ctl.quoteIntervalSaved'));
  });

  document.querySelector('#floating-pet-reset-pos')?.addEventListener('click', () => {
    void optionsSavePatch({
      floatingPet: {
        ...(optionsState.settings.floatingPet || {}),
        position: { right: 24, bottom: 84 }
      }
    }, T('ctl.petPosReset'));
  });

  document.querySelector('#complex-assist-enabled')?.addEventListener('change', event => {
    const enabled = event.target.checked;
    void optionsSavePatch({complexSentenceAssist: enabled}, enabled ? T('ctl.hardOn') : T('ctl.hardOff'));
  });

  document.querySelector('#formula-assist-enabled')?.addEventListener('change', event => {
    const enabled = event.target.checked;
    void optionsSavePatch({formulaAssist: enabled}, enabled ? T('ctl.formulaOn') : T('ctl.formulaOff'));
  });

  document.querySelector('#pdf-reader-enabled')?.addEventListener('change', event => {
    const enabled = event.target.checked;
    void optionsSavePatch({pdfReader: enabled}, enabled ? T('ctl.pdfOn') : T('ctl.pdfOff'));
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
      if (!confirm(T('ctl.resetPrefs'))) return;
      resetConfigBtn.disabled = true;
      try {
        if (await optionsSavePatch({assistanceMode:'ambient',lookupDisplay:'card',lookupKey:'D'},T('ctl.prefsRestored'))) {
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
  const labels=[T('ctl.d1'),T('ctl.d2'),T('ctl.d3')];
  const range=document.querySelector('#matrix-index-range');
  range.value=String(level);range.setAttribute('aria-valuetext',labels[level-1]);
  document.querySelector('#threshold-stat-num').textContent=String(level).padStart(2,'0');
  document.querySelector('#matrix-step-badge').textContent=labels[level-1];
  document.querySelectorAll('#matrix-step-gradient .matrix-step-cell').forEach((cell,i)=>{cell.classList.toggle('active',i<level*10);cell.classList.toggle('current',i===level*10-1);});
}
function optionsRenderReadingReadout() {
  const settings=optionsState?.settings||{};
  document.querySelector('#readout-mode').textContent=settings.assistanceMode==='on-demand'?T('ctl.modeOnDemand'):T('ctl.modeAmbient');
  document.querySelector('#readout-display').textContent=settings.lookupDisplay==='annotation'?T('ctl.displayAnno'):T('ctl.displayCard');
}
