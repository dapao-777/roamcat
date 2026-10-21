/** @file PDF 载入器：pdfjs 取每页 textContent → 阅读块；仅在阅读器页使用（worker 走打包资源）。 */

import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {blocksFromTextItems} from './pdf-blocks.mjs';
import {t} from '../../i18n-runtime.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// source: {url} 远程地址或 {data:Uint8Array} 本地文件；返回 {title, pages:[{number, blocks}]}
export async function loadPdf(source, onProgress) {
  // pdfjs 6 起文档对象不再有 destroy()，释放 worker 走加载任务；放进 finally，解析中途出错也不泄漏。
  const task = pdfjs.getDocument({
    ...(source.url ? {url: source.url} : {data: source.data}),
    isEvalSupported: false,
    cMapPacked: true
  });
  try {
    const doc = await task.promise;
    const pages = [];
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      const content = await page.getTextContent();
      pages.push({number, blocks: blocksFromTextItems(content.items, number)});
      onProgress?.(number, doc.numPages);
    }
    const info = await doc.getMetadata().catch(() => null);
    const title = info?.info?.Title || source.name || t('rd.pdfDoc');
    return {title, pages};
  } finally {
    void task.destroy();
  }
}
