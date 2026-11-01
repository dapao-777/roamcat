/** @file EPUB 解包：ZIP → container/OPF → spine XHTML → 阅读块；纯函数供阅读器与单测共用。 */

import {unzipSync} from 'fflate';

const TEXT_DECODER = new TextDecoder();
const OPF_NS = 'http://www.idpf.org/2007/opf';
const CONTAINER_NS = 'urn:oasis:names:tc:opendocument:xmlns:container';
const DC_NS = 'http://purl.org/dc/elements/1.1/';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

// 极小的 XML 标签扫描器：EPUB 的 OPF/NCX/XHTML 只需取属性与文本，不用完整 DOM。
function* tags(xml) {
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<([a-zA-Z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<\/([a-zA-Z][\w:.-]*)\s*>/gu;
  const scopes = [new Map()];
  let match;
  while ((match = re.exec(xml))) {
    const qualifiedName = match[1] || match[4];
    if (!qualifiedName) continue; // 注释与 CDATA 中的伪标签不参与结构识别。
    const closing = Boolean(match[4]);
    const namespaces = new Map(scopes.at(-1));
    const attrs = {};
    const attrRe = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;
    let attr;
    while ((attr = attrRe.exec(match[2] || ''))) {
      const key = attr[1], value = decodeEntities(attr[2] ?? attr[3] ?? '');
      attrs[key.toLowerCase()] = value;
      if (key === 'xmlns') namespaces.set('', value);
      else if (key.startsWith('xmlns:')) namespaces.set(key.slice(6), value);
    }
    const colon = qualifiedName.indexOf(':'), prefix = colon < 0 ? '' : qualifiedName.slice(0, colon);
    const name = qualifiedName.slice(colon + 1).toLowerCase(), selfClose = match[3] === '/';
    yield {name, prefix, namespace: namespaces.get(prefix) || '', qualifiedName, attrs, closing, selfClose, start: match.index, end: re.lastIndex};
    if (closing) { if (scopes.length > 1) scopes.pop(); }
    else if (!selfClose) scopes.push(namespaces);
  }
}

function tagIs(tag, name, namespace) {
  // 无命名空间的旧书仍兼容；有显式前缀时按 URI 判断，不能把其他词汇表的 item 当作 OPF。
  return tag.name === name && (tag.namespace === namespace || (!tag.namespace && !tag.prefix)
    || (namespace === DC_NS && tag.prefix === 'dc' && !tag.namespace));
}

function* elements(xml, name, namespace) {
  let current = null, depth = 0;
  for (const tag of tags(xml)) {
    if (!current) {
      if (tag.closing || !tagIs(tag, name, namespace)) continue;
      if (tag.selfClose) yield {...tag, text: ''};
      else { current = tag; depth = 1; }
    } else {
      if (tag.closing) depth--;
      else if (!tag.selfClose) depth++;
      if (depth === 0) { yield {...current, text: xml.slice(current.end, tag.start)}; current = null; }
    }
  }
}

function textBetween(xml, name, namespace) {
  for (const element of elements(xml, name, namespace)) return decodeEntities(element.text.replace(/<[^>]+>/gu, '')).trim();
  return '';
}

function unprefixXhtml(xml) {
  const parts = []; let offset = 0;
  for (const tag of tags(xml)) {
    if (!tag.prefix || tag.namespace !== XHTML_NS) continue;
    parts.push(xml.slice(offset, tag.start), xml.slice(tag.start, tag.end).replace(tag.qualifiedName, tag.name));
    offset = tag.end;
  }
  return offset ? parts.join('') + xml.slice(offset) : xml;
}

const ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#x27': "'", '#39': "'", '#x22': '"', '#34': '"'};
export function decodeEntities(text) {
  return (text || '').replace(/&(#(?:[xX][0-9a-fA-F]+|[0-9]+)|\w+);/gu, (raw, key) => {
    if (key.startsWith('#')) {
      const hex = /^#x/iu.test(key), point = parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '\ufffd';
    }
    return Object.hasOwn(ENTITIES, key) ? ENTITIES[key] : raw;
  });
}

const BLOCK_RE = /<\/?(?:p|li|h[1-6]|blockquote|dd|dt|figcaption|td|th|div|section|article|pre|address)[^>]*>|<br\s*\/?\s*>/giu;

// XHTML body → 阅读块：块级标签切边界，其余标签剥掉；role 取自切分它的标题标签。
export function blocksFromXhtml(xhtml) {
  xhtml = unprefixXhtml(xhtml);
  const body = (xhtml.match(/<body[^>]*>([\s\S]*?)<\/body>/iu) || [, xhtml])[1]
    .replace(/<(script|style|svg|math|nav)[\s\S]*?<\/\1>/giu, '');
  const chunks = [];
  let role = 'p';
  const marks = [];
  let m;
  BLOCK_RE.lastIndex = 0;
  while ((m = BLOCK_RE.exec(body))) {
    marks.push({index: m.index, end: m.index + m[0].length, tag: m[0]});
  }
  const pieces = [];
  for (let i = 0; i <= marks.length; i++) {
    const from = i === 0 ? 0 : marks[i - 1].end;
    const to = i === marks.length ? body.length : marks[i].index;
    const tag = i === marks.length ? '' : marks[i].tag;
    pieces.push({text: body.slice(from, to), tag});
  }
  let buffer = '';
  const flush = () => {
    const text = decodeEntities(buffer.replace(/<[^>]+>/gu, '')).replace(/\s+/gu, ' ').trim();
    buffer = '';
    if (text.length >= 2) chunks.push({role, text});
    role = 'p';
  };
  for (const piece of pieces) {
    buffer += piece.text;
    const tagName = (piece.tag.match(/<\/?\s*([a-z0-9]+)/iu) || [])[1]?.toLowerCase() || '';
    if (piece.tag.startsWith('</') && BLOCK_CLOSE.has(tagName)) {
      if (/^h[1-6]$/.test(role)) flush();
      flush();
    } else if (/^<(?:p|li|h[1-6]|blockquote|dd|dt|figcaption|td|th|div|section|article|pre|address)/iu.test(piece.tag)) {
      flush();
      if (/^h[1-6]$/.test(tagName)) role = tagName;
      else if (tagName === 'blockquote') role = 'blockquote';
      else if (tagName === 'li') role = 'li';
    } else if (/^<br/iu.test(piece.tag)) {
      buffer += '\n';
    }
  }
  flush();
  return chunks.map(chunk => ({...chunk, text: chunk.text.replace(/\n/gu, ' ').trim()})).filter(chunk => chunk.text.length >= 2);
}

const BLOCK_CLOSE = new Set(['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'dd', 'dt', 'figcaption', 'td', 'th', 'pre', 'address']);

function resolvePath(base, href) {
  const path = href.split(/[?#]/u)[0];
  // base 已经是 ZIP 内的真实路径；只解码新引用，避免把目录中的 %25 再解码一次。
  const out = path.startsWith('/') || !base.includes('/') ? [] : base.slice(0, base.lastIndexOf('/')).split('/');
  const parts = path.split('/');
  for (const part of parts) {
    let decoded = part;
    try { decoded = decodeURIComponent(part); } catch { /* 兼容文件名中未转义的百分号。 */ }
    if (decoded === '..') out.pop();
    else if (decoded && decoded !== '.') out.push(decoded);
  }
  return out.join('/');
}

// bytes → {title, creator, chapters:[{label, href, blocks}]}；只取 spine 的 XHTML 内容文档。
export function parseEpub(bytes, {maxEntryBytes=8*1024*1024,maxTextBytes=32*1024*1024} = {}) {
  const source=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),files={};let expanded=0;
  // 只展开 container / OPF / nav / spine 文本；图片字体既不解压也不占正文预算。
  const extract=names=>Object.assign(files,unzipSync(source,{filter:file=>{
    if(!names.has(file.name)||Object.hasOwn(files,file.name))return false;
    if(file.originalSize>maxEntryBytes||expanded+file.originalSize>maxTextBytes)throw new Error('EPUB 正文解压后过大。');
    expanded+=file.originalSize;return true;
  }}));
  const read = path => {
    const file = files[path];
    return file ? TEXT_DECODER.decode(file) : null;
  };
  extract(new Set(['META-INF/container.xml']));
  const container = read('META-INF/container.xml');
  if (!container) throw new Error('不是有效的 EPUB：缺少 META-INF/container.xml。');
  let rootPath = '';
  for (const tag of tags(container)) if (!tag.closing && tagIs(tag, 'rootfile', CONTAINER_NS) && tag.attrs['full-path']) { rootPath = tag.attrs['full-path']; break; }
  if (!rootPath) throw new Error('不是有效的 EPUB：container.xml 中没有根文件。');
  const opfPath = resolvePath('', rootPath);
  extract(new Set([opfPath]));
  const opf = read(opfPath);
  if (!opf) throw new Error('EPUB 根文件缺失：' + opfPath);

  const title = textBetween(opf, 'title', DC_NS) || textBetween(opf, 'title', OPF_NS) || '未命名电子书';
  const creator = textBetween(opf, 'creator', DC_NS);

  const manifest = new Map();
  for (const tag of tags(opf)) {
    if (!tagIs(tag, 'item', OPF_NS) || tag.closing) continue;
    const {id, href, 'media-type': mediaType, properties} = tag.attrs;
    if (id && href) manifest.set(id, {href: resolvePath(opfPath, href), mediaType: mediaType || '', properties: properties || ''});
  }
  const spine = [];
  for (const tag of tags(opf)) {
    if (!tagIs(tag, 'itemref', OPF_NS) || tag.closing) continue;
    const idref = tag.attrs.idref;
    if (idref && tag.attrs.linear !== 'no' && manifest.has(idref)) spine.push(manifest.get(idref));
  }
  if (!spine.length) throw new Error('EPUB spine 为空或全部不可用。');

  const tocLabels = new Map();
  const navItem = [...manifest.values()].find(item => item.properties.split(/\s+/u).includes('nav'));
  const textItems=spine.filter(item=>/xhtml|html|xml/iu.test(item.mediaType)||/\.x?html?$/iu.test(item.href));
  extract(new Set([...textItems.map(item=>item.href),...(navItem?[navItem.href]:[])]));
  if (navItem) {
    const nav = read(navItem.href);
    if (nav) {
      for (const link of elements(nav, 'a', XHTML_NS)) {
        if (!link.attrs.href) continue;
        const target = resolvePath(navItem.href, link.attrs.href);
        const label = decodeEntities(link.text.replace(/<[^>]+>/gu, '')).replace(/\s+/gu, ' ').trim();
        if (label && !tocLabels.get(target)) tocLabels.set(target, label);
      }
    }
  }

  const chapters = [];
  for (const item of spine) {
    if (!/xhtml|html|xml/iu.test(item.mediaType) && !/\.x?html?$/iu.test(item.href)) continue;
    const xhtml = read(item.href);
    if (!xhtml) continue;
    const blocks = blocksFromXhtml(xhtml);
    if (!blocks.length) continue;
    const firstHeading = blocks.find(block => /^h[1-6]$/.test(block.role));
    chapters.push({
      href: item.href,
      label: tocLabels.get(item.href) || firstHeading?.text.slice(0, 60) || `第 ${chapters.length + 1} 节`,
      blocks
    });
  }
  if (!chapters.length) throw new Error('EPUB 中没有可读取的正文内容。');
  return {title, creator, chapters};
}
