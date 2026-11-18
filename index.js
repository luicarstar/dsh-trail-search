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
    text:({scope,toolSet}={})=>ctx.tools.get('trail_start',scope,toolSet)?'线索搜索：trail_start → trail_next → 使用 web_search 搜索、加载 web-fetch-cli Skill 执行独立抓取 CLI，或 read_page/结构化采集工具查看 → trail_report。依次处理，也可由当前授权的委派流程处理；本插件不创建 Agent。先加载建议的 trail-* Skill。browser_* 前必须领取 trail_browser_lease，全局只允许一个持有者。遇到登录/验证码/地域限制回报 blocked，不绕过。回报用 STATUS、BLOCKED、KIND、SUMMARY、FOUND、NEW 格式。独立模式预算由 trail 管理；queue 模式预算和调度由委派插件管理。需要进度使用 trail_status/trail_map，结果全文保存在文件中。':'',
  });
}
