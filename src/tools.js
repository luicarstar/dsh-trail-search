const text={type:'string'},strings={type:'array',items:text};
const output={schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]};
function tool(name,description,properties,required,execute,array=false){
  return {name,description,parameters:{type:'object',properties,required,additionalProperties:false},output:array?{...output,schema:{type:'array',items:{type:'object',additionalProperties:true}}}:output,isConcurrencySafe:()=>true,execute};
}
export function registerTools(ctx,control){
  const changed=(args,fn)=>async()=>{const result=await fn();control.changed(args.trailId);return result;};
  const tools=[
    tool('trail_start','新建独立搜索。已有活动搜索需 force:true；不创建子 Agent。',{goal:text,seeds:strings,force:{type:'boolean'}},['goal','seeds'],(a,e)=>control.start(a,e.agent)),
    tool('trail_add','追加网址或 search:词。同 key 合并并保留每条发现关系。',{trailId:text,items:{type:'array',items:{type:'object',properties:{url:text,priority:{type:'number',minimum:1,maximum:5},reason:text,foundBy:text},required:['url'],additionalProperties:false}}},['trailId','items'],(a)=>changed(a,()=>control.store.add(a.trailId,a.items))(),true),
    tool('trail_next','串行领取优先级最高的待看线索，返回访问顺序和 Skill 建议。',{trailId:text,n:{type:'integer',minimum:1,maximum:10}},['trailId','n'],(a,e)=>control.next(a,e.agent),true),
    tool('trail_report','保存 STATUS/SUMMARY/FOUND/NEW 回报并追加新线索；只返回解析摘要。',{trailId:text,nodeId:text,report:text},['trailId','nodeId','report'],(a,e)=>control.report(a,e.agent)),
    tool('trail_skip','跳过指定线索。',{trailId:text,nodeIds:strings,reason:text},['trailId','nodeIds','reason'],a=>changed(a,()=>control.store.skip(a.trailId,a.nodeIds,a.reason))()),
    tool('trail_map','返回树或表格地图，不包含结果全文。',{trailId:text,format:{type:'string',enum:['tree','table']}},['trailId'],async a=>({text:await control.store.map(a.trailId,a.format)})),
    tool('trail_status','查看搜索统计、预算归属及被挡清单；不传 trailId 时读取当前搜索。',{trailId:text},[],async(a,e)=>{const id=a.trailId??(await control.activeFor(e.agent))?.id;if(!id)return {active:false};return control.store.status(id);}),
    tool('trail_browser_lease','browser_* 前领取进程全局互斥租约，完成后释放；默认五分钟过期，Agent 结束自动释放。',{trailId:text,nodeId:text,action:{type:'string',enum:['acquire','release']}},['trailId','nodeId','action'],(a,e)=>control.browserLease(a,e.agent)),
  ];
  return tools.map(definition=>ctx.tools.register(definition));
}
