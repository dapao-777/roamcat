/**
 * @file EPUB 线程网关：传递文件缓冲区，完成、失败、取消时释放解析线程。
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
export function loadEpub(bytes,{signal}={}){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Aborted','AbortError'));return;}
    const worker=new Worker(new URL('./epub-worker.js',import.meta.url),{type:'module'});
    const finish=(error,book)=>{worker.terminate();signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(book);};
    const abort=()=>finish(new DOMException('Aborted','AbortError'));
    worker.onmessage=({data})=>finish(data.ok?null:new Error(data.error),data.book);
    worker.onerror=event=>finish(new Error(event.message));
    worker.onmessageerror=()=>finish(new Error('EPUB worker message error'));
    signal?.addEventListener('abort',abort,{once:true});
    const data=bytes.byteOffset===0&&bytes.byteLength===bytes.buffer.byteLength?bytes:bytes.slice();
    try{worker.postMessage(data,[data.buffer]);}catch(error){finish(error);}
  });
}
