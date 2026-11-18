import {setTimeout as delay} from 'node:timers/promises';

// Shared by every trail and every hooked retrieval tool, at dispatch time.
export class HostLimiter {
  constructor({now=Date.now,sleep=(ms,signal)=>delay(ms,undefined,{signal}),limit=10,windowMs=60000}={}) {
    this.now=now;this.sleep=sleep;this.limit=limit;this.windowMs=windowMs;this.hosts=new Map();
  }
  wait(url,signal) {
    let host;try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))throw Error();host=parsed.hostname.toLowerCase();}catch{throw new Error('抓取需要 http(s) URL');}
    let state=this.hosts.get(host);if(!state){state={times:[],tail:Promise.resolve()};this.hosts.set(host,state);}
    const pending=state.tail.then(async()=>{
      for(;;){
        signal?.throwIfAborted();const now=this.now();state.times=state.times.filter(at=>at>now-this.windowMs);
        if(state.times.length<this.limit){state.times.push(now);return;}
        await this.sleep(Math.max(1,state.times[0]+this.windowMs-now),signal);
      }
    });
    state.tail=pending.catch(()=>{});return pending;
  }
  async run(url,action,signal){await this.wait(url,signal);signal?.throwIfAborted();return action();}
  async fetch(input,options={},transport=globalThis.fetch){
    let url=new URL(input);const redirect=options.redirect??'follow';
    for(let hop=0;hop<=5;hop++){
      const response=await this.run(url.href,()=>transport(url.href,{...options,redirect:'manual'}),options.signal);
      if(redirect!=='follow'||![301,302,303,307,308].includes(response.status))return response;
      const target=response.headers?.get?.('location');if(!target)return response;
      await response.body?.cancel();url=new URL(target,url);
      if(!['http:','https:'].includes(url.protocol))throw new Error('不支持的跳转协议');
    }
    throw new Error('短链跳转超过 5 次');
  }
}
const shared=Symbol.for('dsh-trail-search.host-limiter');
export function sharedLimiter(){return globalThis[shared]??=(new HostLimiter());}
