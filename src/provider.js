import {readFile} from 'node:fs/promises';
import {normalizeSync} from './normalize.js';
import {describeAccess} from './access.js';
function urlOf(item){return item?.url??item?.text??item?.label??'';}
function hostOf(item){try{return new URL(urlOf(item)).hostname;}catch{return '';}}
export function createProvider(control,boundTrailId,boundAgentId){
  const options=()=>({rules:control.settings.rules,blacklist:control.settings.config.blacklist});
  return {
    ...(boundTrailId?{trailId:boundTrailId}:{}),
    normalize(text){return normalizeSync(text,options());},
    priority(item,parent){
      const normalized=normalizeSync(urlOf(item),options());const kind=item.kind??normalized?.kind;
      const rank=Number.isFinite(item.priority)?item.priority:3;
      const same=kind==='web'&&hostOf(item)&&hostOf(item)===hostOf(parent);
      return Math.min(5,Math.max(1,rank+(kind==='directory'?1:0)-(same?1:0)-(Number.isFinite(item.depth)?Math.max(0,item.depth)*0.5:0)));
    },
    describe(item,context={}){
      const value=normalizeSync(urlOf(item),options());if(!value)return null;
      const agent=context.agent??(boundAgentId?control.ctx.agents.get(boundAgentId):undefined);
      if(!agent)throw new Error('describe 需要当前 Agent 上下文；先 bindRun({sessionId,agentId?}) 或传入 {agent,toolSet?}');
      return describeAccess({...value,...item},{capabilities:control.capabilities(agent,context.toolSet),skills:control.skills});
    },
    async bindRun({trailId,runId,sessionId,agentId=sessionId,goal='队列线索搜索'}={}){
      if(!runId)throw new Error('bindRun 需要 runId');
      control.requireSession(sessionId);
      if(!control.ctx.agents.get(agentId))throw new Error('bindRun 需要已载入的实际 Agent');
      if(!trailId)trailId=(await control.store.list()).find(t=>t.runId===runId)?.id;
      if(trailId)await control.store.bindRun(trailId,runId,sessionId);
      else trailId=(await control.store.start({sessionId,goal,seeds:[],mode:'queue',runId})).id;
      return createProvider(control,trailId,agentId);
    },
    async onResult(item,resultPath){
      let trailId=boundTrailId??item.trailId;
      if(!trailId&&item.runId)trailId=(await control.store.list()).find(t=>t.runId===item.runId)?.id;
      if(!trailId)throw new Error('trailSearch.onResult 需要 item.trailId/runId，或先 bindRun 获得该 run 的 provider');
      if(typeof resultPath!=='string'||!resultPath)throw new Error('onResult 需要结果文件路径');
      const text=await readFile(resultPath,'utf8');
      const node=await control.store.trackQueueItem(trailId,item);
      const result=await control.store.report(trailId,node.id,text,{resultPath});control.changed(trailId);
      return result;
    },
  };
}
