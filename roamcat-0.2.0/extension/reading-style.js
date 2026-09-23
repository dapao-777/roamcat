/**
 * @file extension/reading-style.js
 * 文件职责：三层阅读样式（classic script）——原文/词注/译文CSS生成与规范化。
 * 主要内容：RoamCatReadingStyle.validate；选择器静态，!important全覆盖抗站点样式。
 * 模块边界：页面层无ESM；被shared/content/options消费；领域层白名单资源。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
(() => {

  const STYLES = new Set(['default','plain','color','dashed','background','border','quote']);
  const SIZES = new Set([80,100,115,130,150]);
  const LAYERS = ['original','annotation','translation'];
  const FIELDS = ['style','color','size'];

  const frozenLayer = (style,color='auto',size=100) => Object.freeze({style,color,size});
  const defaults = Object.freeze({
    original:frozenLayer('background'),
    annotation:frozenLayer('plain'),
    translation:frozenLayer('default'),
  });
  const palettes = Object.freeze([
    Object.freeze({id:'amber',label:'琥珀金',color:'#d97706'}),
    Object.freeze({id:'teal',label:'翡翠绿',color:'#059669'}),
    Object.freeze({id:'blue',label:'晴空蓝',color:'#2563eb'}),
    Object.freeze({id:'violet',label:'丁香紫',color:'#7c3aed'}),
    Object.freeze({id:'rose',label:'珊瑚红',color:'#e11d48'}),
  ]);

  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const validColor = value => value === 'auto' || (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value));
  const normalizeLayer = (value,fallback) => {
    const source = object(value) ? value : {};
    return {
      style:STYLES.has(source.style) ? source.style : fallback.style,
      color:validColor(source.color) ? source.color.toLowerCase() : fallback.color,
      size:SIZES.has(source.size) ? source.size : fallback.size,
    };
  };

  function normalize(value) {
    const source = object(value) ? value : {};
    const legacy = !Object.hasOwn(source,'original') && !Object.hasOwn(source,'annotation')
          && !object(source.translation) && ['translation','color','size'].some(key => Object.hasOwn(source,key));
    if (legacy) {
      const style = STYLES.has(source.translation) ? source.translation : 'default';
      const color = validColor(source.color) ? source.color.toLowerCase() : 'auto';
      const size = SIZES.has(source.size) ? source.size : 100;
      return {
        original:{style:'background',color,size:100},
        annotation:{style,color:style==='quote'?'auto':color,size},
        translation:{style,color,size},
      };
    }
    return Object.fromEntries(LAYERS.map(layer => [layer,normalizeLayer(source[layer],defaults[layer])]));
  }

  function validate(value) {
    if (!object(value)) throw new Error('无效的阅读样式。');
    const keys = Object.keys(value);
    if (keys.length !== LAYERS.length || keys.some(key => !LAYERS.includes(key)) || LAYERS.some(key => !Object.hasOwn(value,key))) {
      throw new Error('阅读样式必须包含且只能包含三层设置。');
    }
    for (const layer of LAYERS) {
      const setting = value[layer];
      if (!object(setting)) throw new Error('无效的分层阅读样式。');
      const fields = Object.keys(setting);
      if (fields.length !== FIELDS.length || fields.some(field => !FIELDS.includes(field)) || FIELDS.some(field => !Object.hasOwn(setting,field))) {
        throw new Error('分层阅读样式必须包含且只能包含已知设置。');
      }
      if (!STYLES.has(setting.style)) throw new Error('无效的阅读装饰。');
      if (!validColor(setting.color)) throw new Error('阅读样式颜色必须是 auto 或六位十六进制颜色。');
      if (!SIZES.has(setting.size)) throw new Error('无效的阅读字号。');
    }
    return normalize(value);
  }

  function staticSelector(value,name) {
    if (typeof value !== 'string' || !value.trim() || value.length > 240 || /[{},;@\\]/.test(value)) {
      throw new Error(`${name} 必须是静态 CSS 选择器。`);
    }
    return value.trim();
  }

  function customForeground(color) {
    const channels = [1,3,5].map(offset => {
      const component = Number.parseInt(color.slice(offset,offset+2),16) / 255;
      return component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2] > 0.179 ? '#000000' : '#ffffff';
  }

  function decorate(rules,setting,layer) {
    const resolved = setting.style === 'default'
      ? (layer === 'original' ? 'background' : layer === 'translation' ? 'default' : 'plain')
      : setting.style;
    const accent = setting.color === 'auto' ? 'var(--ss-source-color,inherit)' : setting.color;
    const line = setting.color === 'auto' ? 'currentColor' : setting.color;

    if (resolved === 'color') {
      rules.push(`color:${accent}`);
      if (layer === 'original') rules.push('font-weight:var(--weight-medium,500)');
    } else if (resolved === 'dashed') {
      rules.push(layer === 'translation' ? `border-left:2px dashed ${line}` : `border-bottom:1.5px dashed ${line}`);
      if (layer === 'original') rules.push('padding-bottom:1px');
    } else if (resolved === 'background') {
      if (layer === 'original') {
        const bgTint = setting.color === 'auto'
          ? 'color-mix(in srgb,currentColor 14%,transparent)'
          : `color-mix(in srgb,${setting.color} 18%,transparent)`;
        const shadowTint = setting.color === 'auto'
          ? 'color-mix(in srgb,currentColor 40%,transparent)'
          : `color-mix(in srgb,${setting.color} 50%,transparent)`;
        rules.push(
          `background:${bgTint}`,
          'color:inherit',
          `-webkit-text-fill-color:currentColor`,
          `box-shadow:inset 0 -2px 0 ${shadowTint}`,
          'border-radius:4px',
          'padding:1px 3px'
        );
      } else if (layer === 'translation') {
        const bgTint = setting.color === 'auto'
          ? 'color-mix(in srgb,currentColor 6%,transparent)'
          : `color-mix(in srgb,${setting.color} 10%,transparent)`;
        rules.push(
          `background:${bgTint}`,
          `border-left:3px solid ${line}`,
          'border-radius:4px'
        );
      } else {
        const bgTint = setting.color === 'auto'
          ? 'color-mix(in srgb,currentColor 14%,transparent)'
          : `color-mix(in srgb,${setting.color} 18%,transparent)`;
        rules.push(`background:${bgTint}`, 'border-radius:3px', 'padding:0 3px');
      }
    } else if (resolved === 'border') {
      rules.push(`border:1px solid ${line}`, 'border-radius:4px');
      if (layer === 'original') rules.push('padding:0 3px');
    } else if (resolved === 'quote') {
      rules.push('font-style:italic', layer === 'translation' ? `border-left:2px solid ${line}` : `color:${accent}`);
    }
    return resolved;
  }

  function css(style,selectors) {
    const current = validate(style);
    if (!object(selectors)) throw new Error('缺少阅读样式选择器。');
    if (Object.keys(selectors).some(key => !['mark','hint','block','annotation'].includes(key))) throw new Error('未知的阅读样式选择器。');
    const mark = staticSelector(selectors.mark,'原文标记');
    const hint = staticSelector(selectors.hint,'短提示');
    const annotation = staticSelector(selectors.annotation,'词注容器');
    const block = staticSelector(selectors.block,'双语译文');
    const rules = [];
    const hintScale = current.annotation.size / 100;

    rules.push(`${annotation}{font:inherit!important;letter-spacing:inherit!important;color:inherit!important;display:inline-block!important;position:relative!important;vertical-align:baseline!important;line-height:1.1!important;margin:0 .12em!important;text-align:center!important;max-width:100%!important;border:0!important;background:none!important;padding:calc(max(13px,calc(var(--type-support) * ${hintScale})) * 1.45 + 4px) 0 0!important}`);
    // Reserve label width in CSS without measuring every annotated word.
    rules.push(`${annotation}::before{content:attr(data-roamcat-annotation)!important;display:block!important;visibility:hidden!important;height:0!important;overflow:hidden!important;max-width:16em!important;font-family:var(--ss-source-font,inherit)!important;font-size:max(13px,calc(var(--type-support) * ${hintScale}))!important;font-weight:var(--weight-regular)!important;letter-spacing:.035em!important;white-space:nowrap!important;padding:0!important;border:0!important;margin:0!important}`);

    const markRules = ['font-family:inherit',`font-size:${current.original.size}%`,'line-height:inherit','letter-spacing:inherit','background:none','color:inherit','border:0','border-bottom:0','border-radius:0','box-shadow:none','display:inline','filter:none','font-style:inherit','font-weight:inherit','opacity:1','padding:0','text-decoration:none','text-decoration-color:currentColor','text-decoration-line:none','text-decoration-style:solid','text-decoration-thickness:auto','text-underline-offset:auto'];
    const hintRules = ['background:none','border:0','border-bottom:0','border-radius:0','box-shadow:none','box-sizing:border-box','color:inherit','display:block','position:absolute','left:0','top:0','width:100%','filter:none','font-family:var(--ss-source-font,inherit)','font-style:normal',`font-size:max(13px,calc(var(--type-support) * ${hintScale}))`,'font-weight:var(--weight-regular)','line-height:1.45','letter-spacing:.035em','word-spacing:normal','margin:0','opacity:1','padding:0','text-align:center','text-decoration:none','white-space:nowrap','overflow:hidden','text-overflow:ellipsis'];
    const blockRules = ['background:none','border:0','border-left:0','border-radius:0','box-shadow:none','box-sizing:border-box','color:var(--ss-source-color,inherit)','display:block','filter:none','font-family:var(--ss-source-font,inherit)','font-style:normal',`font-size:max(13px,calc(var(--ss-source-size,1em) * ${current.translation.size / 100}))`,'font-weight:var(--weight-regular)','line-height:var(--ss-source-leading,inherit)','margin:.4em 0','opacity:1','padding:0','min-width:0','max-width:100%','text-decoration:none','white-space:pre-wrap','overflow-wrap:anywhere','word-break:normal'];

    const markStyle = decorate(markRules,current.original,'original');
    const hintStyle = decorate(hintRules,current.annotation,'annotation');
    const blockStyle = decorate(blockRules,current.translation,'translation');
    if(['quote','border','background','dashed'].includes(blockStyle))blockRules.push('padding:.55em .75em');
    rules.push(`${mark}{${markRules.map(rule=>rule+'!important').join(';')}}`,`${hint}{${hintRules.map(rule=>rule+'!important').join(';')}}`,`${block}{${blockRules.map(rule=>rule+'!important').join(';')}}`);
    // Host gradient selectors can also match our spans; their transparent fill must not hide owned text.
    rules.push(`${mark},${hint},${block}{-webkit-text-fill-color:currentColor!important}`);
    rules.push(`${mark}::before,${mark}::after{content:none!important}`,`${hint}::before,${hint}::after{content:none!important}`,`${block}::before,${block}::after{content:none!important}`);
    for (const [selector,resolved] of [[mark,markStyle],[hint,hintStyle],[block,blockStyle]]) {
      if (resolved === 'quote' && selector !== block) rules.push(`${selector}::before{content:"“"!important}`,`${selector}::after{content:"”"!important}`);
    }
    rules.push(block+' > span,'+block+' > p,'+block+' > div > p{font:inherit!important;color:inherit!important;background:none!important;-webkit-text-fill-color:currentColor!important;letter-spacing:inherit!important;margin:0 0 .35em!important;padding:0!important;white-space:inherit!important;overflow-wrap:inherit!important;word-break:inherit!important;max-width:100%!important;min-width:0!important}');
    return rules.join('\n');
  }

  globalThis.RoamCatReadingStyle = Object.freeze({defaults,palettes,normalize,validate,css});
})();