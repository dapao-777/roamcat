/**
 * @file EPUB 解析线程：只展开阅读所需的 ZIP 文本，避免在阅读器主线程同步解压。
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {parseEpub} from './epub-package.mjs';
self.onmessage=({data})=>{
  try{self.postMessage({ok:true,book:parseEpub(data)});}
  catch(error){self.postMessage({ok:false,error:error?.message||String(error)});}
};
