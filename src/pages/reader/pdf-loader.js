/** @file PDF 载入器：pdfjs 取每页 textContent → 阅读块；仅在阅读器页使用（worker 走打包资源）。 */

import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {blocksFromTextItems} from './pdf-blocks.mjs';
import {t} from '../../i18n-runtime.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// source: {url} 远程地址或 {data:Uint8Array} 本地文件；返回 {title, pages:[{number, blocks}]}
export async function loadPdf(source, onProgress, {signal,onPage} = {}) {
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  // pdfjs 6 起文档对象不再有 destroy()，释放 worker 走加载任务；放进 finally，解析中途出错也不泄漏。
  const task = pdfjs.getDocument({
    ...(source.url ? {url: source.url} : {data: source.data}),
    isEvalSupported: false,
    cMapPacked: true
  });
  const abort=()=>{void task.destroy();};signal?.addEventListener('abort',abort,{once:true});
  try {
    const doc = await task.promise;
    const pages = [];
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      const content = await page.getTextContent();
      if(signal?.aborted)throw new DOMException('Aborted','AbortError');
      const parsed={number, blocks: blocksFromTextItems(content.items, number)};
      pages.push(parsed);onPage?.(parsed,doc.numPages);
      onProgress?.(number, doc.numPages);
    }
    const info = await doc.getMetadata().catch(() => null);
    const title = info?.info?.Title || source.name || t('rd.pdfDoc');
    return {title, pages};
  } catch(error){if(signal?.aborted)throw new DOMException('Aborted','AbortError');throw error;} finally {
    signal?.removeEventListener('abort',abort);
    void task.destroy();
  }
}
