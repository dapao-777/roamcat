/**
 * @file src/pages/options/options-mt.js
 * 文件职责：设置页「机器翻译」面板——按 mt-providers.mjs 的字段声明渲染凭据表单，保存/删除凭据、检查连接、
 *   准备 Chrome 本机语言包，以及五个场景的翻译引擎与「机翻失败时改用大模型」开关。
 * 主要内容：createMtPanel({request,savePatch,getState}) → {select, render}；密钥字段不回显，留空表示沿用已保存的值
 *   （mergeMtCredentials）；保存经 STATE_PATCH，失败时由 savePatch 统一报错并按已保存设置重绘。
 * 模块边界：扩展页受信上下文；MT_TEST 只有本页能发；Chrome 语言包必须在用户点击里同步发起 Translator.create。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {MT_PROVIDERS, MT_SCENES, getMtProvider, mtKeyless, mtEngineAvailable, normalizeMtService, mergeMtCredentials} from '@ext/mt-providers.mjs';

const T = (k, v) => globalThis.RoamCatI18n?.t(k, v) ?? k;
const CHROME_OPTIONS = {sourceLanguage: 'en', targetLanguage: 'zh'};
const KIND_NOTES = {official: 'ctl.mt.noteOfficial', free: 'ctl.mt.noteFree', unofficial: 'ctl.mt.noteUnofficial', local: 'ctl.mt.noteLocal', selfHosted: 'ctl.mt.noteSelfHosted'};

function setResult(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.hidden = !message;
  element.classList.toggle('error', isError);
}

export function createMtPanel({request, savePatch, getState}) {
  const $ = id => document.getElementById(id);
  const els = {panel: $('mt-panel'), note: $('mt-kind-note'), form: $('mt-form'), fields: $('mt-fields'), keyState: $('mt-key-state'), save: $('mt-save'), test: $('mt-test'), prepare: $('mt-prepare'), remove: $('mt-delete'), result: $('mt-result'), fallback: $('mt-fallback')};
  const sceneSelects = Object.fromEntries(MT_SCENES.map(scene => [scene, $('engine-' + scene)]));
  let current = MT_PROVIDERS[0].id, dirty = false, busy = false;

  const settings = () => getState()?.settings || {};
  const saved = id => (settings().mtServices || []).find(row => row.providerId === id) || null;
  const draft = () => ({providerId: current, credentials: Object.fromEntries([...els.fields.querySelectorAll('[data-mt-field]')].map(input => [input.dataset.mtField, input.value.trim()]))});

  function renderFields() {
    const provider = getMtProvider(current), row = saved(current);
    els.fields.replaceChildren(...provider.fields.map(field => {
      const label = document.createElement('label');
      label.className = 'field';
      const caption = document.createElement('span');
      caption.textContent = field.label;
      let input;
      if (field.type === 'select') {
        input = document.createElement('select');
        input.append(...field.options.map(option => new Option(option.label, option.value)));
        input.value = row?.credentials?.[field.key] || field.defaultValue || field.options[0].value;
      } else {
        input = document.createElement('input');
        input.type = field.type === 'secret' ? 'password' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text';
        input.autocomplete = 'off';
        input.spellcheck = false;
        const stored = row?.credentials?.[field.key] || '';
        if (field.type === 'secret') input.placeholder = stored ? T('ctl.mt.secretKeep') : (field.required ? T('ctl.mt.secretInput') : T('ctl.mt.optional'));
        else { input.value = stored; input.placeholder = field.placeholder || (field.required ? '' : T('ctl.mt.optional')); }
      }
      input.dataset.mtField = field.key;
      input.addEventListener('input', () => { dirty = true; });
      input.addEventListener('change', () => { dirty = true; });
      label.append(caption, input);
      return label;
    }));
  }

  function renderEngines() {
    const value = settings(), services = value.mtServices || [], engines = value.translationEngines || {};
    const available = MT_PROVIDERS.filter(provider => mtEngineAvailable(services, provider.id));
    for (const scene of MT_SCENES) {
      const select = sceneSelects[scene];
      if (!select) continue;
      select.replaceChildren(new Option(T('ctl.mt.followModel'), ''), ...available.map(provider => new Option(provider.name, provider.id)));
      select.value = available.some(provider => provider.id === engines[scene]) ? engines[scene] : '';
      select.disabled = busy;
    }
    if (els.fallback) { els.fallback.checked = value.mtFallback !== false; els.fallback.disabled = busy; }
  }

  function render() {
    if (!els.panel) return;
    const provider = getMtProvider(current), row = saved(current), keyless = mtKeyless(provider);
    els.note.textContent = T(KIND_NOTES[provider.kind], {name: provider.name});
    if (!dirty) renderFields();
    els.keyState.textContent = provider.kind === 'local' ? T('ctl.mt.localState') : keyless ? T('ctl.mt.keyless') : row ? T('ctl.mt.saved') : T('ctl.mt.notSaved');
    els.save.hidden = !provider.fields.length;
    els.remove.hidden = !row;
    els.prepare.hidden = provider.kind !== 'local';
    for (const button of [els.save, els.test, els.prepare, els.remove]) button.disabled = busy;
    for (const input of els.fields.querySelectorAll('input,select')) input.disabled = busy;
    renderEngines();
  }

  async function run(action) {
    if (busy) return;
    const id = current;
    busy = true; render();
    try { await action(id); }
    catch (error) { if (current === id) setResult(els.result, error.message, true); }
    finally { busy = false; render(); }
  }

  els.form?.addEventListener('submit', event => {
    event.preventDefault();
    void run(async id => {
      setResult(els.result, '');
      let service;
      try { service = normalizeMtService(mergeMtCredentials(draft(), settings().mtServices)); }
      catch (error) { setResult(els.result, error.message, true); return; }
      const others = (settings().mtServices || []).filter(row => row.providerId !== current);
      if (await savePatch({mtServices: [...others, service]}, T('ctl.mt.savedMsg')) && current === id) { dirty = false; setResult(els.result, T('ctl.mt.savedMsg')); }
    });
  });

  els.test?.addEventListener('click', () => void run(async id => {
    setResult(els.result, T('ctl.mt.testing'));
    try {
      const result = await request('MT_TEST', {service: draft()});
      if (current === id) setResult(els.result, T('ctl.mt.testOk', {text: result.translation, ms: result.ms}));
    } catch (error) { if (current === id) setResult(els.result, error instanceof Error ? error.message : String(error), true); }
  }));

  els.remove?.addEventListener('click', () => {
    if (!saved(current) || !confirm(T('ctl.mt.deleteConfirm', {name: getMtProvider(current).name}))) return;
    void run(async id => {
      const rest = (settings().mtServices || []).filter(row => row.providerId !== current);
      if (await savePatch({mtServices: rest}, T('ctl.mt.deletedMsg')) && current === id) { dirty = false; setResult(els.result, T('ctl.mt.deletedMsg')); }
    });
  });

  // Translator.create 必须在点击的同一调用栈里发起，否则下载语言包会因缺少用户激活被拒绝。
  els.prepare?.addEventListener('click', () => {
    if (busy) return;
    const id = current;
    const api = globalThis.Translator;
    if (typeof api?.create !== 'function') { setResult(els.result, T('ctl.mt.chromeUnsupported'), true); return; }
    let creating;
    try {
      creating = api.create({...CHROME_OPTIONS, monitor(monitor) { monitor.addEventListener('downloadprogress', event => {if (current === id) setResult(els.result, T('ctl.mt.chromeDownloading', {pct: Math.round((event.loaded || 0) * 100)}));}); }});
    } catch { setResult(els.result, T('ctl.mt.chromeUnsupported'), true); return; }
    setResult(els.result, T('ctl.mt.chromePreparing'));
    void run(async () => {
      try { const translator = await creating; translator?.destroy?.(); if (current === id) setResult(els.result, T('ctl.mt.chromeReady')); }
      catch { if (current === id) setResult(els.result, T('ctl.mt.chromeUnsupported'), true); }
    });
  });

  for (const [scene, select] of Object.entries(sceneSelects)) select?.addEventListener('change', () => { const value=select.value; void run(() => savePatch({translationEngines: {[scene]: value}}, T('ctl.mt.engineSaved'))); });
  els.fallback?.addEventListener('change', () => { const value=els.fallback.checked; void run(() => savePatch({mtFallback: value}, T('ctl.mt.engineSaved'))); });

  async function showChromeStatus() {
    const api = globalThis.Translator;
    if (typeof api?.availability !== 'function') { setResult(els.result, T('ctl.mt.chromeUnsupported'), true); return; }
    try {
      const status = await api.availability(CHROME_OPTIONS);
      if (current !== 'chrome') return;
      setResult(els.result, status === 'available' ? T('ctl.mt.chromeReady') : status === 'unavailable' ? T('ctl.mt.chromeUnsupported') : T('ctl.mt.chromeNeedsPrepare'), status === 'unavailable');
    } catch { setResult(els.result, T('ctl.mt.chromeUnsupported'), true); }
  }

  function select(id) {
    if (!getMtProvider(id)) return;
    if (id !== current) { current = id; dirty = false; setResult(els.result, ''); }
    render();
    if (id === 'chrome') void showChromeStatus();
  }

  return {select, render, get current() { return current; }};
}
