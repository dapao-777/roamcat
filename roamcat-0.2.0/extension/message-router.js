/**
 * @file extension/message-router.js
 * 文件职责：提供与业务无关的类型化后台消息路由器，把 background.js 的巨型 switch 收敛为
 *   可静态检查的注册表：构造期拒绝重复类型与缺失 handle，派发期对未知类型给出确定性错误。
 * 主要内容：createMessageRouter(handlers) 建立 type→handler 索引；dispatch 先执行可选 parse
 *   （纯载荷校验，其返回值替换原始 message 再交给 handle），再 await handle 的结果；
 *   has/types 供启动时完整性自检与测试断言。
 * 模块边界：本模块不认识任何具体消息、不访问 chrome 与配置，也不解释业务错误语义；
 *   协议清单与具体处理器分别在 message-protocol.js 与 background.js 注册表中登记。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */

/**
 * 创建后台消息路由器。
 * @param {ReadonlyArray<{type:string,parse?:(message:object,context:object)=>object,handle:(message:object,context:object)=>unknown}>} handlers
 * @returns {{types:ReadonlyArray<string>,has:(type:string)=>boolean,dispatch:(message:object,context:object)=>Promise<unknown>}}
 */
export function createMessageRouter(handlers) {
  if (!Array.isArray(handlers) || !handlers.length) throw new Error('后台消息处理器注册表为空。');
  const byType = new Map();
  for (const handler of handlers) {
    if (!handler || typeof handler.type !== 'string' || !handler.type) throw new Error('消息处理器缺少类型。');
    if (typeof handler.handle !== 'function') throw new Error(`消息处理器 ${handler.type} 缺少 handle。`);
    if (handler.parse !== undefined && typeof handler.parse !== 'function') throw new Error(`消息处理器 ${handler.type} 的 parse 不是函数。`);
    // 重复注册会静默覆盖前一个 handler，属于必须立即失败的程序设计错误。
    if (byType.has(handler.type)) throw new Error(`后台消息处理器重复注册: ${handler.type}`);
    byType.set(handler.type, handler);
  }
  return {
    types: Object.freeze([...byType.keys()]),
    has: type => byType.has(type),
    async dispatch(message, context) {
      const handler = byType.get(message?.type);
      if (!handler) throw new Error('未知请求。');
      const parsed = handler.parse ? handler.parse(message, context) : message;
      return handler.handle(parsed, context);
    },
  };
}
