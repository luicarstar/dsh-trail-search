import {readdir,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {TrailStore} from './trail.js';
import {TrailSettings} from './settings.js';
import {normalizeSync} from './normalize.js';
import {sharedLimiter} from './budget.js';
import {globalBrowserLease} from './lease.js';
import {describeAccess} from './access.js';
import {createProvider} from './provider.js';

const idOf=agent=>agent?.id??agent?.session?.id;
function harvestSite(name){const match=/(?:^|__)(zhihu|tieba|bili|xhs|x)_(.+)$/.exec(name);return match&&!/^search(?:_|$)/.test(match[2])?match[1]:null;}
const isHarvest=name=>Boolean(harvestSite(name));
export async function createController(ctx,options={}){
  const control=new TrailController(ctx,options);await control.open();return control;
}
class TrailController {
  constructor(ctx,options){
    this.ctx=ctx;this.options=options;this.home=process.env.DSH_HOME??join(homedir(),'.dsh');
    this.dataDir=resolve(options.dataDir??join(this.home,'data','trail-search'));
    this.limiter=sharedLimiter();this.lease=globalBrowserLease();this.leaseAgents=new Set();this.skills=[];this.closed=false;this.lifetime=new AbortController();
  }
  async open(){
    this.settings=await TrailSettings.open(this.dataDir);const {config,rules}=this.settings.current();
    this.store=await TrailStore.open({dataDir:this.dataDir,budget:config.budget,rules,blacklist:config.blacklist,resolveShortLinks:this.options.resolveShortLinks,fetch:(url,init)=>this.limiter.fetch(url,init,this.options.fetch??globalThis.fetch)});
    try{const cli=join(this.home,'tools','dsh-web-fetch','cli.js');await access(cli);this.cliPath=cli;
      const {PersistentLimiter}=await import(pathToFileURL(join(this.home,'tools','dsh-web-fetch','src','limiter.js')).href);
      const shared=new PersistentLimiter({stateDir:join(this.home,'data','web-fetch','rate-limit')});
      this.limiter.wait=(url,signal)=>shared.acquire(new URL(url).hostname,{signal});
    }catch(error){if(error.code!=='ENOENT')throw error;}
    this.provider=createProvider(this);await this.refreshSkills();
  }
  async refreshSkills(){
    const directory=join(this.home,'skills');let entries=[];
    try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;}
    const found=await Promise.all(entries.filter(e=>e.isDirectory()&&e.name.startsWith('trail-')).map(async e=>{try{await access(join(directory,e.name,'SKILL.md'));return e.name;}catch{return null;}}));
    this.skills=found.filter(Boolean).sort();
  }
  capabilities(agent,toolSet){
    let names=[],available=false;
    try{names=[...this.ctx.tools.view(agent).visible.keys()].filter(name=>!toolSet||Boolean(this.ctx.tools.get(name,agent,toolSet)));available=true;}catch{}
    const config=this.settings.config;
    const cliAvailable=Boolean(this.cliPath)&&names.some(n=>['ops_bash','terminal_send','mcp__vault__vault_exec'].includes(n));
    const harvestSites=Object.fromEntries(['zhihu','tieba','bili','xhs','x'].map(site=>[site,config.harvestAvailable!==false&&(available?names.some(name=>harvestSite(name)===site):config.harvestAvailable===true)]));
    return {browser:config.browserAvailable!==false&&(available?names.some(n=>n.startsWith('browser_')):config.browserAvailable===true),harvest:Object.values(harvestSites).some(Boolean),harvestSites,webSearch:names.includes('web_search'),fetch:cliAvailable||names.includes('web_fetch'),cliFetch:cliAvailable,cliPath:cliAvailable?this.cliPath:undefined,readPage:names.includes('read_page'),xSearch:names.includes('x_search'),tools:names.filter(n=>/^(?:web_|read_page|x_search|browser_)/.test(n)||isHarvest(n)),source:available?'registry':'manual'};
  }
  requireSession(id){
    if(typeof id!=='string'||!id||id.length>256)throw new Error('需要有效 sessionId');
    const agent=this.ctx.agents.get(id),session=agent?.session??this.ctx.sessions.get(id);
    if(!session)throw Object.assign(new Error('会话尚未载入'),{status:404});return agent??{id,session};
  }
  async activeFor(agent){
    const seen=new Set();let current=agent;
    while(current&&!seen.has(idOf(current))){
      const id=idOf(current);if(!id)break;seen.add(id);
      const active=await this.store.active(id);if(active)return active;
      const parent=current.session?.header?.parentSession;if(!parent)break;
      current=this.ctx.agents.get(parent)??{id:parent,session:this.ctx.sessions.get(parent)};
    }
    return null;
  }
  changed(trailId){this.ctx.emit?.('trail-search/change',{trailId});}
  async start(args,agent){
    const result=await this.store.start({sessionId:idOf(agent),goal:args.goal,seeds:args.seeds,force:args.force,budget:args.budget});this.changed(result.id);return result;
  }
  async next(args,agent){
    const nodes=await this.store.next(args.trailId,args.n);this.changed(args.trailId);
    const capabilities=this.capabilities(agent);return nodes.map(node=>({...node,...describeAccess(node,{capabilities,skills:this.skills})}));
  }
  async report(args,agent){
    const result=await this.store.report(args.trailId,args.nodeId,args.report);
    this.lease.release({trailId:args.trailId,nodeId:args.nodeId,agentId:idOf(agent)});this.changed(args.trailId);return result;
  }
  async browserLease(args,agent){
    const trail=await this.store.get(args.trailId);if(!trail.nodes.some(n=>n.id===args.nodeId))throw new Error('未找到 nodeId');
    const request={trailId:args.trailId,nodeId:args.nodeId,agentId:idOf(agent)};
    if(args.action==='acquire'){const result=this.lease.acquire(request);if(result.acquired)this.leaseAgents.add(request.agentId);return result;}
    if(args.action==='release')return this.lease.release(request);
    throw new Error('租约 action 需要 acquire 或 release');
  }
  agentDisposed({agent}){this.lease.releaseAgent(idOf(agent));this.leaseAgents.delete(idOf(agent));}
  async execute(exec,next){
    if(this.closed)return next();
    const browser=exec.name.startsWith('browser_'),fetching=['web_fetch','read_page'].includes(exec.name),harvest=isHarvest(exec.name);
    if(!browser&&!fetching&&!harvest)return next();
    const trail=await this.activeFor(exec.agent),held=this.lease.current();
    const signal=AbortSignal.any([this.lifetime.signal,...(exec.signal?[exec.signal]:[])]);
    let result;
    if(browser&&(trail||held))result=await this.lease.run(idOf(exec.agent),next,signal);
    else if(fetching){
      result=await this.limiter.run(exec.arguments?.url,next,signal);
    }
    else result=await next();
    if(trail&&!result?.isError&&!this.closed){
      const method=browser?'browser':harvest?'harvest':'fetch';
      const value=typeof exec.arguments?.url==='string'?normalizeSync(exec.arguments.url,{rules:this.settings.rules}):null;
      const node=browser&&held?.trailId===trail.id?trail.nodes.find(n=>n.id===held.nodeId):trail.nodes.find(n=>n.key===value?.key);
      if(node){await this.store.setAccess(trail.id,node.id,method);this.changed(trail.id);}
    }
    return result;
  }
  async state(sessionId,trailId){
    const agent=sessionId?this.requireSession(sessionId):undefined;
    const active=sessionId?await this.store.active(sessionId):null;
    const history=await this.store.list();
    const selected=trailId??active?.id??history.find(t=>t.sessionId===sessionId)?.id;
    const trail=selected?await this.store.get(selected):null;
    return {activeTrailId:active?.id??null,trail,status:trail?await this.store.status(trail.id):null,history:history.map(({id,goal,status,sessionId,createdAt,updatedAt,mode,runId})=>({id,goal,status,sessionId,createdAt,updatedAt,mode,...(runId?{runId}:{})})),capabilities:this.capabilities(agent),skills:[...this.skills],lease:this.lease.current(),queueAvailable:Boolean(this.ctx.get?.('delegationNext'))};
  }
  async result(trailId,nodeId){
    return this.store.readResult(trailId,nodeId);
  }
  async action(body){
    if(body?.action==='settings'){
      const result=await this.settings.save(body);
      await this.store.configure({rules:result.rules,blacklist:result.config.blacklist,budget:result.config.budget});this.changed();return result;
    }
    if(body?.action==='normalize')return {value:normalizeSync(body.url,{rules:body.rules??this.settings.rules,blacklist:this.settings.config.blacklist})};
    const agent=this.requireSession(body?.sessionId);let result;
    switch(body.action){
      case 'start':result=await this.start(body,agent);break;
      case 'add':result=await this.store.add(body.trailId,body.items);break;
      case 'report':result=await this.report(body,agent);break;
      case 'skip':result=await this.store.skip(body.trailId,body.nodeIds,body.reason);break;
      case 'priority':result=await this.store.setPriority(body.trailId,body.nodeId,body.priority);break;
      case 'resume':result=await this.store.resume(body.trailId,body.sessionId);break;
      default:throw new Error('未知线索操作');
    }
    const trailId=body.action==='start'?result.id:body.trailId;this.changed(trailId);
    return {result,state:await this.state(body.sessionId,trailId)};
  }
  async close(){
    if(this.closed)return;this.closed=true;this.lifetime.abort(new Error('线索插件已卸载'));
    for(const id of this.leaseAgents)this.lease.releaseAgent(id);this.leaseAgents.clear();
    await this.settings?.tail;await this.store?.close();
  }
}
