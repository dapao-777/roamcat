/**
 * @file extension/ui/provider-picker.js
 * 文件职责：服务商选择器——原生select+Popover自定义列表（Chrome116+）。
 * 主要内容：createProviderPicker；图标+名称无第三方背书含义。
 * 模块边界：扩展页UI组件，被options引用。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
// Keep the native select as the form value; Popover supports icons on Chrome 116+.
export function createProviderPicker(select,providers) {
  const root=select.parentElement,button=root.querySelector('[role="combobox"]'),list=root.querySelector('[role="listbox"]');
  const currentLogo=button.querySelector('img'),currentName=button.querySelector('span');
  let active=0,search='',typedAt=0;
  const iconPath=id=>'../icons/providers/'+(['openai-compatible','open-responses','requesty','stepfun'].includes(id)?'custom-api':id)+'.svg';
  const choices=providers.map(provider=>{
    select.append(new Option(provider.name,provider.id));
    const row=document.createElement('div');row.id='provider-option-'+provider.id;row.className='provider-option';row.setAttribute('role','option');row.dataset.value=provider.id;
    const logo=document.createElement('img');logo.className='provider-logo';logo.src=iconPath(provider.id);logo.alt='';logo.width=24;logo.height=24;
    const name=document.createElement('span');name.textContent=provider.name;row.append(logo,name);list.append(row);return row;
  });
  const isOpen=()=>list.matches(':popover-open');
  function sync() {
    const index=select.selectedIndex,provider=providers[index];if(!provider)return;
    currentLogo.src=iconPath(provider.id);currentName.textContent=provider.name;button.disabled=select.disabled;
    for(let i=0;i<choices.length;i++)choices[i].setAttribute('aria-selected',String(i===index));
    if(!isOpen())active=index;
  }
  function highlight(index) {
    choices[active]?.classList.remove('active');active=index;choices[active].classList.add('active');
    button.setAttribute('aria-activedescendant',choices[active].id);choices[active].scrollIntoView({block:'nearest'});
  }
  function position() {
    const rect=button.getBoundingClientRect(),below=innerHeight-rect.bottom-12,above=rect.top-12,up=below<160&&above>below;
    list.style.width=rect.width+'px';list.style.left=Math.max(12,Math.min(rect.left,innerWidth-rect.width-12))+'px';
    list.style.maxHeight=Math.max(80,Math.min(328,up?above:below))+'px';
    list.style.top=up?'auto':rect.bottom+4+'px';list.style.bottom=up?innerHeight-rect.top+4+'px':'auto';
  }
  function open() {
    if(isOpen()||button.disabled)return;
    position();list.showPopover();highlight(select.selectedIndex);
  }
  function close() {if(isOpen())list.hidePopover();}
  function commit(index) {
    const changed=select.value!==providers[index].id;select.value=providers[index].id;close();sync();button.focus();
    if(changed){select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  button.addEventListener('click',()=>isOpen()?close():open());
  button.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.metaKey||event.isComposing)return;
    if(event.key==='Tab'){close();return;}
    if(event.key==='Escape'){if(isOpen()){event.preventDefault();close();}return;}
    if(event.key==='Enter'||event.key===' '&&(!search||performance.now()-typedAt>=700)){event.preventDefault();if(isOpen())commit(active);else open();return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();const opened=isOpen();open();
      if(event.key==='Home')highlight(0);else if(event.key==='End')highlight(choices.length-1);
      else if(opened)highlight(Math.max(0,Math.min(choices.length-1,active+(event.key==='ArrowDown'?1:-1))));
      return;
    }
    if(event.key.length!==1||event.altKey)return;
    event.preventDefault();open();const now=performance.now();search=(now-typedAt<700?search:'')+event.key.toLocaleLowerCase();typedAt=now;
    const repeated=[...search].every(char=>char===search[0]),query=repeated?search[0]:search;
    for(let offset=repeated?1:0;offset<choices.length+(repeated?1:0);offset++){
      const index=(active+offset)%choices.length;
      if(providers[index].name.toLocaleLowerCase().startsWith(query)){highlight(index);break;}
    }
  });
  list.addEventListener('click',event=>{const row=event.target.closest('[role="option"]');if(row&&list.contains(row))commit(choices.indexOf(row));});
  list.addEventListener('pointermove',event=>{const row=event.target.closest('[role="option"]');if(row&&list.contains(row)&&choices[active]!==row)highlight(choices.indexOf(row));});
  list.addEventListener('beforetoggle',event=>{
    button.setAttribute('aria-expanded',String(event.newState==='open'));
    if(event.newState==='closed'){button.removeAttribute('aria-activedescendant');choices[active]?.classList.remove('active');search='';}
  });
  select.addEventListener('change',sync);
  window.addEventListener('resize',()=>{if(isOpen())position();});
  window.addEventListener('scroll',event=>{if(event.target!==list)close();},true);
  sync();return {sync};
}
