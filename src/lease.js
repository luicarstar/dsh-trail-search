export class BrowserLease {
  constructor({now=Date.now,ttlMs=300000}={}){this.now=now;this.ttlMs=ttlMs;this.holder=null;this.tail=Promise.resolve();this.inFlight=0;this.pendingRelease=false;}
  current(){
    if(this.holder&&this.now()>=this.holder.expiresAt&&!this.inFlight)this.holder=null;
    return this.holder?{...this.holder}:null;
  }
  acquire({trailId,nodeId,agentId}){
    if(!trailId||!nodeId||!agentId)throw new Error('浏览器租约需要 trailId、nodeId 和 Agent');
    const held=this.current();
    if(held&&(held.agentId!==agentId||held.trailId!==trailId||held.nodeId!==nodeId||this.pendingRelease))return {acquired:false,holder:held};
    this.holder={trailId,nodeId,agentId,expiresAt:this.now()+this.ttlMs};this.pendingRelease=false;
    return {acquired:true,holder:this.current()};
  }
  release({trailId,nodeId,agentId}){
    const held=this.current();
    if(!held||held.agentId!==agentId||held.trailId!==trailId||held.nodeId!==nodeId)return {released:false,holder:held};
    if(this.inFlight)this.pendingRelease=true;else this.holder=null;
    return {released:true,holder:this.current()};
  }
  releaseAgent(agentId){const held=this.current();if(held?.agentId===agentId)this.release(held);}
  run(agentId,action,signal){
    const call=this.tail.then(async()=>{
      signal?.throwIfAborted();const held=this.current();
      if(!held||held.agentId!==agentId||this.pendingRelease)throw new Error('浏览器租约未持有；先调用 trail_browser_lease acquire');
      this.inFlight++;
      try{return await action();}finally{
        this.inFlight--;
        if(this.pendingRelease){this.holder=null;this.pendingRelease=false;}else this.current();
      }
    });
    this.tail=call.catch(()=>{});return call;
  }
}
const shared=Symbol.for('dsh-trail-search.browser-lease');
export function globalBrowserLease(){return globalThis[shared]??=(new BrowserLease());}
