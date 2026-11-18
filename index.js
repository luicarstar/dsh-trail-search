import {createController} from './src/controller.js';
import {registerTools} from './src/tools.js';
import {API,createHttpTransport} from './src/http.js';

export const name='trail-search';
export const inject=['webServer','connection','tools','agents','sessions','systemPrompt'];
export async function apply(ctx,config={}){
  const control=await createController(ctx,config);
  ctx.effect(()=>()=>control.close(),'trail-search: storage and browser lifecycle');
  ctx.provide('trailSearch',control.provider);
  registerTools(ctx,control);
  ctx.effect(()=>ctx.webServer.register({kind:'exact',path:API,handler:createHttpTransport(ctx,control)}),'trail-search: authenticated API');
  // Queue before the host's per-call timeout starts, so waiting is not a fetch timeout.
  ctx.on('tools/execute',(exec,next)=>control.execute(exec,next),{global:true,prepend:true});
  ctx.on('agent/disposed',event=>control.agentDisposed(event),{global:true});
  ctx.on('tools/change',()=>control.changed(),{global:true});
  ctx.systemPrompt.section({
    name:'trail-search:usage',order:115,
    text:({scope,toolSet}={})=>ctx.tools.get('trail_start',scope,toolSet)?[
      '线索搜索（强制流程，不得跳步）：',
      '① 调用 trail_start / trail_next 后，**必须先加载 Skill 再动手**：默认读 trail-general，其余按节点 kind 读对应的 trail-*（trail-directory / trail-forum-thread / trail-github / trail-telegram / trail-qa / trail-social）。这些 SKILL.md 里有回报格式、通道优先级和站点打法的完整规则，不读就会写出被判格式不符的回报。',
      '② 普通页面抓取顺序：dsh-web-fetch CLI（先加载 web-fetch-cli Skill）→ read_page → browser_*。browser_* 前必须 trail_browser_lease 领取，全局只允许一个持有者，用完 release。搜索用 web_search。',
      '③ 回报固定五段 STATUS / SUMMARY / FOUND / NEW，必要时加 BLOCKED、KIND。STATUS 只写 useful、useless、blocked 三个英文词之一，紧跟冒号，注释放到 SUMMARY，不要写进 STATUS 行。',
      '④ 遇到登录、验证码、地域或付费限制回报 blocked 并写实际原因，不绕过。',
      '⑤ 独立模式预算由 trail 管理；queue 模式预算和调度由委派插件管理。本插件不创建 Agent。进度用 trail_status / trail_map 查看，结果全文保存在文件中。',
    ].join(''):'',
  });
}
