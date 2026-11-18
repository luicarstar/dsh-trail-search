import { mkdir, open, readFile, appendFile, readdir, rename, rm, truncate, stat } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalize } from './normalize.js';
import { compileUserRules } from './sites-user.js';
import { parseReport, redactText } from './report.js';
import { classifyDirectory } from './classify.js';
import { renderMap } from './map.js';

export const DEFAULT_BUDGET = Object.freeze({maxNodes:60,maxDepth:5,maxMinutes:90,maxPerHost:15});
// Compact a trail journal only when it is clearly bloated: below this floor the extra
// I/O of rewriting the file is not worth it. The ratio is measured against the real
// snapshot size; a fresh journal already runs ~1.97x its snapshot because every record
// repeats the whole meta object, so the trigger sits below that at 1.5x.
const COMPACT_MIN_BYTES = 512 * 1024;
const COMPACT_RATIO = 1.5;
const copy = value => structuredClone(value);
export function budgetConfig(value = {}) {
  const config = {...DEFAULT_BUDGET,...value};
  for (const key of Object.keys(DEFAULT_BUDGET)) {
    if (!Number.isFinite(config[key]) || config[key] < (key === 'maxDepth' ? 0 : key === 'maxMinutes' ? Number.EPSILON : 1) || key !== 'maxMinutes' && !Number.isInteger(config[key])) throw new Error(`预算 ${key} 不正确`);
  }
  return config;
}
function required(value,label,max=2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} 必须是非空字符串（最多 ${max} 字符）`);
  return value.trim();
}
const ID_PATTERN = /^[\p{L}\p{N}_-]{1,160}$/u;
function validId(value) { return typeof value === 'string' && ID_PATTERN.test(value); }
function safeId(value) {
  if (!validId(value)) throw new Error('trailId 格式不正确');
  return value;
}
function hostOf(url) { try { return new URL(url).hostname; } catch { return ''; } }
function usesLocalBudget(state) { return state.meta.mode !== 'queue'; }
function priority(value = 3) {
  if (!Number.isFinite(value) || value < 1 || value > 5) throw new Error('priority 必须在 1 到 5 之间');
  return value;
}
async function optionalRead(path) { try { return await readFile(path,'utf8'); } catch (e) { if (e.code === 'ENOENT') return ''; throw e; } }
async function atomicWrite(path,text) {
  const temporary = path + '.tmp-' + randomUUID();
  try { const file = await open(temporary,'wx'); try { await file.writeFile(text,'utf8'); await file.sync(); } finally { await file.close(); } await rename(temporary,path); }
  finally { await rm(temporary,{force:true}); }
}
async function appendJson(path,records,durable=false) {
  if (!records.length) return;
  const file = await open(path,'a');
  try { await file.writeFile(records.map(x => JSON.stringify(x)+'\n').join(''),'utf8'); if (durable) await file.sync(); }
  finally { await file.close(); }
}
async function readJsonLines(path) {
  const content = await optionalRead(path), rows = content.split('\n'), result = [];
  let consumed = 0;
  for (let i=0;i<rows.length;i++) {
    const line = rows[i], last = i === rows.length-1;
    if (line.trim()) {
      try { result.push(JSON.parse(line)); }
      catch (error) {
        if (!last) throw new Error(`${path}: 第 ${i+1} 行损坏 (${error.message})`);
        await truncate(path,consumed); // Only an incomplete final append is discarded.
        return result;
      }
    }
    consumed += Buffer.byteLength(line + (last ? '' : '\n'),'utf8');
  }
  if (content && !content.endsWith('\n')) await appendFile(path,'\n','utf8');
  return result;
}
function newState(meta) { return {meta,nodes:new Map(),keys:new Map(),edges:[],results:new Map(),seq:0}; }
function draftOf(state) { return {...state,meta:copy(state.meta),nodes:new Map(state.nodes),keys:new Map(state.keys),edges:[...state.edges],results:new Map(state.results)}; }
function timestamp(value) { return new Date(value).toISOString(); }
function dateId(value) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(x => [x.type,x.value]));
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
}

export class TrailStore {
  static async open(options) {
    const store = new TrailStore(options);
    try { await store._open(); return store; } catch (error) { await store.close(); throw error; }
  }
  constructor({dataDir,now=Date.now,normalize:normalizer=normalize,rules=[],blacklist=[],resolveShortLinks=true,fetch,budget,compactMinBytes,compactRatio} = {}) {
    if (!dataDir) throw new Error('需要 dataDir');
    compileUserRules(rules);
    if (!Array.isArray(blacklist) || blacklist.some(x => typeof x !== 'string')) throw new Error('黑名单必须是字符串数组');
    this.dataDir = resolve(dataDir); this.now = now; this.normalizer = normalizer;
    this.options = {rules:copy(rules),blacklist:[...blacklist],resolveShortLinks,fetch};
    this.defaults = budgetConfig(budget); this.trails = new Map(); this.tail = Promise.resolve(); this.closed = false; this.closing = false;
    this.skippedDirs = [];
    // Compaction thresholds are overridable so tests can exercise the path without
    // writing megabytes of journal.
    this.compactMinBytes = Number.isFinite(compactMinBytes) ? compactMinBytes : COMPACT_MIN_BYTES;
    this.compactRatio = Number.isFinite(compactRatio) ? compactRatio : COMPACT_RATIO;
  }
  _dir(id) { return join(this.dataDir,'trails',safeId(id)); }
  async _open() {
    await mkdir(join(this.dataDir,'trails'),{recursive:true});
    const path = join(this.dataDir,'.writer-lock');
    for (let attempt=0;attempt<2;attempt++) {
      try {
        const file = await open(path,'wx');
        this.lockToken = randomUUID();
        try { await file.writeFile(JSON.stringify({pid:process.pid,token:this.lockToken}),'utf8'); } finally { await file.close(); }
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        let lock;
        try { lock = JSON.parse(await readFile(path,'utf8')); } catch { throw new Error('线索目录存在未知写入锁，未打开'); }
        let alive = true;
        if (Number.isInteger(lock.pid) && lock.pid > 0) try { process.kill(lock.pid,0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
        if (alive || attempt) throw new Error('线索目录已由另一个存储实例打开');
        await rm(path);
      }
    }
    for (const dir of await readdir(join(this.dataDir,'trails'),{withFileTypes:true})) {
      if (!dir.isDirectory()) continue;
      // Foreign directories (backup folders, sync clients, manual copies) must not
      // block the whole store: skip anything that is not a valid trail id instead
      // of letting safeId() abort _open() and hide every existing trail.
      if (!validId(dir.name)) { this.skippedDirs.push(dir.name); continue; }
      await this._load(dir.name);
    }
    const active = new Map();
    for (const state of [...this.trails.values()].sort((a,b) => b.meta.createdAt.localeCompare(a.meta.createdAt))) {
      const draft = draftOf(state);
      let changed = false;
      for (const [id,node] of draft.nodes) if (node.status === 'running') { draft.nodes.set(id,{...node,status:'pending',recoveryReason:'interrupted',updatedAt:timestamp(this.now())}); changed=true; }
      if (draft.meta.status === 'active') {
        if (active.has(draft.meta.sessionId)) { draft.meta.status='paused'; draft.meta.pauseReason='superseded'; changed=true; }
        else active.set(draft.meta.sessionId,draft.meta.id);
      }
      if (changed) await this._commit(state,draft);
    }
  }
  async close() {
    if (this.closed) return;
    this.closing = true;
    await this.tail;
    if (this.lockToken) {
      const path = join(this.dataDir,'.writer-lock');
      const content = await optionalRead(path);
      if (content && JSON.parse(content).token === this.lockToken) await rm(path,{force:true});
      this.lockToken = null;
    }
    this.closed = true;
  }
  _serial(action) {
    if (this.closed || this.closing) return Promise.reject(new Error('线索存储已关闭'));
    const promise = this.tail.then(action);
    this.tail = promise.catch(() => {});
    return promise;
  }
  _find(id) { const state=this.trails.get(safeId(id)); if (!state) throw new Error('未找到 trail'); return state; }
  _public(state) { return copy({...state.meta,nodes:[...state.nodes.values()],edges:state.edges}); }
  _apply(state,transaction) {
    state.meta = transaction.meta;
    state.seq = transaction.seq;
    for (const node of transaction.nodes) { state.nodes.set(node.id,node); state.keys.set(node.key,node.id); }
    for (const edge of transaction.edges) state.edges.push(edge);
    for (const result of transaction.results??[]) state.results.set(result.nodeId,result.text);
  }
  async _load(id) {
    const dir=this._dir(id), transactions=await readJsonLines(join(dir,'transactions.jsonl'));
    const nodeRows=await readJsonLines(join(dir,'nodes.jsonl')), edgeRows=await readJsonLines(join(dir,'edges.jsonl'));
    const nodeRevisions=new Map(nodeRows.map(node => [node.id,node.revision ?? 0]));
    const edgeIds=new Set(edgeRows.map(edge => edge.id));
    let state;
    if (!transactions.length) {
      const raw=await optionalRead(join(dir,'trail.json'));
      if (!raw) return; // A directory created before the first committed transaction is empty work.
      const meta=JSON.parse(raw);
      if (meta.id !== id) throw new Error('trail 元数据目录不匹配');
      state=newState(meta);
      for (const {revision,...node} of nodeRows) { state.nodes.set(node.id,node); state.keys.set(node.key,node.id); }
      for (const edge of edgeRows) if (!state.edges.some(x => x.id === edge.id)) state.edges.push(edge);
      const transaction={seq:1,meta,nodes:[...state.nodes.values()],edges:state.edges};
      await appendJson(join(dir,'transactions.jsonl'),[transaction],true);state.seq=1;
    } else {
      state=newState(transactions[0].meta);
      for (const transaction of transactions) {
        // A compacted journal begins with a full-state snapshot whose seq is NOT 1, because
        // the number must keep running so later records stay contiguous. Treat that record
        // as the new baseline instead of demanding seq === 1.
        if (transaction.base === true) {
          if (transaction.meta?.id !== id || !Array.isArray(transaction.nodes) || !Array.isArray(transaction.edges)) throw new Error('trail 事务序列损坏');
          state=newState(transaction.meta);state.seq=transaction.seq-1;
        }
        if (transaction.seq !== state.seq+1 || transaction.meta?.id !== id || !Array.isArray(transaction.nodes) || !Array.isArray(transaction.edges)) throw new Error('trail 事务序列损坏');
        this._apply(state,transaction);
        const missing=transaction.nodes.filter(node => (nodeRevisions.get(node.id) ?? 0) < transaction.seq);
        await appendJson(join(dir,'nodes.jsonl'),missing.map(node => ({...node,revision:transaction.seq})));
        for (const node of missing) nodeRevisions.set(node.id,transaction.seq);
        const edges=transaction.edges.filter(edge => !edgeIds.has(edge.id));
        await appendJson(join(dir,'edges.jsonl'),edges);
        for (const edge of edges) edgeIds.add(edge.id);
      }
    }
    state.meta.nextNodeId=Math.max(state.meta.nextNodeId ?? 1,...[...state.nodes.keys()].map(id => Number(id.slice(1))+1));
    state.meta.nextEdgeId=Math.max(state.meta.nextEdgeId ?? 1,...state.edges.map(edge => Number(edge.id?.slice(1) ?? 0)+1));
    this.trails.set(id,state);
    await this._writeResults(state,[...state.results].map(([nodeId,text])=>({nodeId,text})));
    await this._writeViews(state);
  }
  async _writeResults(state,results) {
    for(const {nodeId,text} of results){
      const node=state.nodes.get(nodeId);
      if(node?.resultFile===`results/${nodeId}.md`)await atomicWrite(join(this._dir(state.meta.id),'results',nodeId+'.md'),text+'\n');
    }
  }
  async _writeViews(state) {
    const dir=this._dir(state.meta.id);
    await atomicWrite(join(dir,'trail.json'),JSON.stringify(state.meta,null,2)+'\n');
    await atomicWrite(join(dir,'map.md'),renderMap(state));
  }
  async _commit(previous,draft) {
    draft.seq=previous.seq+1;
    draft.meta.updatedAt=timestamp(this.now());
    const nodes=[...draft.nodes.values()].filter(node => previous.nodes.get(node.id) !== node);
    const edges=draft.edges.slice(previous.edges.length);
    const results=[...draft.results].filter(([id,text])=>previous.results.get(id)!==text).map(([nodeId,text])=>({nodeId,text}));
    const transaction={seq:draft.seq,meta:draft.meta,nodes,edges,...(results.length?{results}:{})};
    const dir=this._dir(draft.meta.id);
    await appendJson(join(dir,'transactions.jsonl'),[transaction],true);
    this.trails.set(draft.meta.id,draft);
    await appendJson(join(dir,'nodes.jsonl'),nodes.map(node => ({...node,revision:draft.seq})));
    await appendJson(join(dir,'edges.jsonl'),edges);
    await this._writeResults(draft,results);
    await this._writeViews(draft);
    await this._maybeCompact(draft);
  }
  // The journal is append-only and every record repeats the whole meta object, so a
  // long-running queue trail grows without bound. Once the journal is both larger than
  // the live state and past a floor, rewrite it as a single snapshot transaction that
  // still carries the next seq number, so replay stays strictly contiguous.
  async _maybeCompact(draft) {
    const dir=this._dir(draft.meta.id),path=join(dir,'transactions.jsonl');
    let size;try{size=(await stat(path)).size;}catch{return;}
    // Cheap gate first: below the floor the rewrite is never worth it, and this avoids
    // serialising the whole state on every commit.
    if (size < this.compactMinBytes) return;
    const snapshot={base:true,seq:draft.seq+1,meta:draft.meta,nodes:[...draft.nodes.values()],edges:draft.edges,results:[...draft.results].map(([nodeId,text])=>({nodeId,text}))};
    const serialized=JSON.stringify(snapshot)+'\n';
    // Compare against the real snapshot size, not an estimate: an estimate that drifts
    // above the truth makes the ratio test impossible to satisfy.
    if (size < Buffer.byteLength(serialized)*this.compactRatio) return;
    // Write the snapshot beside the journal and rename over it: a crash leaves either the
    // old journal or the new one, never a half-written file.
    await atomicWrite(path,serialized);
    draft.seq=snapshot.seq;
    this.trails.set(draft.meta.id,draft);
    await this._writeViews(draft);
  }
  _checkActivation(draft) {
    for (const state of this.trails.values()) if (state.meta.id !== draft.meta.id && state.meta.sessionId === draft.meta.sessionId && state.meta.status === 'active') throw new Error('会话已有其他活动 trail');
  }
  _settle(draft) {
    if (draft.meta.status === 'active' && ![...draft.nodes.values()].some(node => ['pending','running'].includes(node.status))) draft.meta.status='done';
  }
  _activatePending(draft) {
    if (draft.meta.status !== 'done' || ![...draft.nodes.values()].some(node => node.status === 'pending')) return;
    this._checkActivation(draft);
    draft.meta.status='active';draft.meta.startedAt=timestamp(this.now());
  }
  async _addItems(draft,items,parentId) {
    if (!Array.isArray(items)) throw new Error('items 必须是数组');
    const replies=[],config=draft.meta.config,budget=config.budget,enforceBudget=usesLocalBudget(draft);
    for (const item of items) {
      if (!item || typeof item.url !== 'string') throw new Error('每条线索需要 url');
      const rank=priority(item.priority);
      const foundBy=item.foundBy ?? parentId ?? null;
      const parent=foundBy === null ? null : draft.nodes.get(foundBy);
      if (foundBy !== null && !parent) throw new Error('foundBy 指向不存在的节点');
      const normalized=await this.normalizer(item.url,{...this.options,rules:config.rules,blacklist:config.blacklist});
      if (!normalized) { replies.push({url:redactText(item.url).slice(0,2048),status:'dropped',reason:'filtered'});continue; }
      let id=draft.keys.get(normalized.key),node=id && draft.nodes.get(id);
      const reason=redactText(item.reason ?? '').slice(0,1000);
      if (node) {
        if (rank > node.priority) { node={...node,priority:rank,updatedAt:timestamp(this.now())};draft.nodes.set(id,node); }
        replies.push({url:normalized.url,id,status:'merged'});
      } else {
        if (enforceBudget && draft.nodes.size >= budget.maxNodes) { replies.push({url:normalized.url,status:'dropped',reason:'max-nodes'});continue; }
        id='n'+draft.meta.nextNodeId++;
        const depth=parent ? parent.depth+1 : 0,host=hostOf(normalized.url);
        const sameHost=host ? [...draft.nodes.values()].filter(n => hostOf(n.url) === host).length : 0;
        let skipReason;
        if (enforceBudget && host && sameHost >= budget.maxPerHost) skipReason='host-cap';
        else if (enforceBudget && depth > budget.maxDepth) skipReason='max-depth';
        const invite=['telegram-invite','chat-invite'].includes(normalized.kind);
        node={id,...normalized,depth,priority:rank,status:skipReason ? 'skipped' : invite ? 'blocked' : 'pending',foundBy,reason,createdAt:timestamp(this.now()),updatedAt:timestamp(this.now()),...(skipReason ? {skipReason} : invite ? {blockedReason:'login'} : {})};
        draft.nodes.set(id,node);draft.keys.set(normalized.key,id);
        replies.push({url:normalized.url,id,status:'new',...(skipReason ? {reason:skipReason} : {})});
      }
      if (parent) {
        draft.edges.push({id:'e'+draft.meta.nextEdgeId++,from:parent.id,to:id,url:redactText(item.url.trim()),reason,at:timestamp(this.now())});
      }
    }
    return replies;
  }
  start({sessionId,goal,seeds=[],force=false,budget={},mode='standalone',runId}={}) {
    return this._serial(async () => {
      sessionId=required(sessionId,'sessionId',256);goal=redactText(required(goal,'goal'));
      if (!Array.isArray(seeds) || seeds.some(x => typeof x !== 'string')) throw new Error('seeds 必须是字符串数组');
      if (!['standalone','queue'].includes(mode)) throw new Error('mode 不正确');
      if (mode === 'queue') runId=required(runId,'runId',256);
      const config={budget:budgetConfig({...this.defaults,...budget}),rules:copy(this.options.rules),blacklist:[...this.options.blacklist]};
      const active=[...this.trails.values()].filter(t => t.meta.sessionId === sessionId && t.meta.status === 'active');
      if (active.length && !force) throw new Error('会话已有活动 trail；可使用 force');
      const now=this.now(),slug=Array.from(goal).slice(0,20).join('').toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'') || 'trail';
      const base=dateId(now)+'-'+slug;let id=base,suffix=1;
      while(this.trails.has(id) || await optionalRead(join(this._dir(id),'transactions.jsonl'))) id=base+'-'+(++suffix);
      const state=newState({id,goal,sessionId,status:'active',mode,...(runId ? {runId} : {}),createdAt:timestamp(now),updatedAt:timestamp(now),startedAt:timestamp(now),config,nextNodeId:1,nextEdgeId:1});
      const draft=draftOf(state);const added=await this._addItems(draft,seeds.map(url => ({url})));
      await mkdir(join(this._dir(id),'results'),{recursive:true});
      for (const previous of active) { const paused=draftOf(previous);paused.meta.status='paused';paused.meta.pauseReason='superseded';await this._commit(previous,paused); }
      await this._commit(state,draft);
      return {...copy(draft.meta),seeds:added};
    });
  }
  add(id,items) {
    return this._serial(async () => {
      const state=this._find(id),draft=draftOf(state),replies=await this._addItems(draft,items);
      this._activatePending(draft);
      await this._commit(state,draft);return replies;
    });
  }
  // Returns {nodes, reason}. `reason` explains an empty batch so callers never have to
  // guess between "finished", "paused" and "budget exhausted":
  //   claimed   - nodes were handed out
  //   empty     - trail is active but has no pending node left
  //   done      - trail finished by this call (last pending node settled)
  //   paused    - trail was not active; see meta.pauseReason
  //   max-minutes - time budget exhausted by this call
  claim(id,n=1) {
    return this._serial(async () => {
      if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error('n 必须是 1 到 10 的整数');
      const state=this._find(id),draft=draftOf(state);
      // Check `done` before the generic not-active branch: a finished trail is also
      // not active, but reporting it as "paused" would tell the caller to resume work
      // that is actually complete.
      if (state.meta.status === 'done') return {nodes:[],reason:'done'};
      if (state.meta.status !== 'active') return {nodes:[],reason:'paused',pauseReason:state.meta.pauseReason ?? null};
      if (usesLocalBudget(state) && this.now()-Date.parse(state.meta.startedAt) >= state.meta.config.budget.maxMinutes*60000) {
        draft.meta.status='paused';draft.meta.pauseReason='max-minutes';await this._commit(state,draft);
        return {nodes:[],reason:'max-minutes',pauseReason:'max-minutes'};
      }
      const chosen=[...draft.nodes.values()].filter(node => node.status === 'pending').sort((a,b) => b.priority-a.priority || Number(a.id.slice(1))-Number(b.id.slice(1))).slice(0,n);
      for(const node of chosen) draft.nodes.set(node.id,{...node,status:'running',updatedAt:timestamp(this.now())});
      const finished=!chosen.length;
      if (finished) this._settle(draft);
      await this._commit(state,draft);
      if (chosen.length) return {nodes:copy(chosen.map(node => draft.nodes.get(node.id))),reason:'claimed'};
      return {nodes:[],reason:draft.meta.status === 'done' ? 'done' : 'empty'};
    });
  }
  next(id,n=1) {
    return this.claim(id,n).then(result => result.nodes);
  }
  report(id,nodeId,text,{resultPath}={}) {
    return this._serial(async () => {
      if (typeof text !== 'string') throw new Error('report 必须是字符串');
      const state=this._find(id),draft=draftOf(state),node=draft.nodes.get(nodeId);
      if (!node) throw new Error('未找到 nodeId');
      const report=parseReport(text,{kind:node.kind});
      const kind=report.kind ?? (node.kind === 'web' && classifyDirectory({url:node.url,title:report.summary,links:[...report.raw.matchAll(/https?:\/\/[^\s<>|]+/g)].map(x => x[0])}) ? 'directory' : node.kind);
      const parsed=kind === 'directory' && node.kind !== 'directory' && !report.kind ? parseReport(text,{kind}) : report;
      // Keep the stored path portable. A result file inside this trail's own directory
      // is stored relative to it, so the trail survives a drive change or a copy to
      // another machine. Anything outside is stored as-is and flagged, because it
      // genuinely cannot be relocated and silently pretending otherwise would make a
      // broken reference look valid.
      const trailDir=this._dir(id);
      let resultFile,externalResult;
      if (!resultPath) {
        resultFile=`results/${node.id}.md`;
      } else {
        const absolute=resolve(resultPath),insidePath=relative(trailDir,absolute);
        if (insidePath && !insidePath.startsWith('..') && !isAbsolute(insidePath)) resultFile=insidePath.split(sep).join('/');
        else { resultFile=absolute; externalResult=true; }
      }
      const updated={...node,kind,status:parsed.status === 'blocked' ? 'blocked' : 'done',summary:parsed.summary,resultFile,updatedAt:timestamp(this.now())};
      if (externalResult) updated.resultExternal=true; else delete updated.resultExternal;
      delete updated.verdict;delete updated.blockedReason;delete updated.skipReason;delete updated.recoveryReason;
      if (['useful','useless'].includes(parsed.status)) updated.verdict=parsed.status;
      if (parsed.status === 'blocked') updated.blockedReason=parsed.blockedReason;
      draft.nodes.set(nodeId,updated);
      const replies=parsed.status ? await this._addItems(draft,parsed.items,nodeId) : [];
      this._activatePending(draft);
      if(resultPath){
        const absolute=resolve(resultPath),relativeDir=relative(trailDir,resolve(absolute,'..'));
        draft.meta.resultsDir=(relativeDir && !relativeDir.startsWith('..') && !isAbsolute(relativeDir))
          ? relativeDir.split(sep).join('/') : resolve(absolute,'..');
      }
      // Body and derived state become durable in the same journal record.
      draft.results.set(node.id,parsed.raw);
      this._settle(draft);await this._commit(state,draft);
      return {nodeId,status:updated.status,added:replies.filter(x => x.status === 'new').length,merged:replies.filter(x => x.status === 'merged').length,dropped:replies.filter(x => x.status === 'dropped').length,omitted:parsed.omitted,...(parsed.warning ? {warning:parsed.warning} : {}),...(parsed.omitted ? {notice:`超出上限的 ${parsed.omitted} 条线索保留在结果文件中。`} : {})};
    });
  }
  skip(id,nodeIds,reason='user') {
    return this._serial(async () => {
      if (!Array.isArray(nodeIds)) throw new Error('nodeIds 必须是数组');
      const state=this._find(id),draft=draftOf(state);
      for(const nodeId of nodeIds) { const node=draft.nodes.get(nodeId);if(!node)throw new Error('未找到 nodeId');draft.nodes.set(nodeId,{...node,status:'skipped',skipReason:redactText(reason).slice(0,1000),updatedAt:timestamp(this.now())}); }
      this._settle(draft);await this._commit(state,draft);return {skipped:nodeIds.length};
    });
  }
  setPriority(id,nodeId,value) {
    return this._serial(async () => {
      priority(value);const state=this._find(id),draft=draftOf(state),node=draft.nodes.get(nodeId);if(!node)throw new Error('未找到 nodeId');
      draft.nodes.set(nodeId,{...node,priority:value,updatedAt:timestamp(this.now())});await this._commit(state,draft);return copy(draft.nodes.get(nodeId));
    });
  }
  configure({rules,blacklist,budget}) {
    return this._serial(async()=>{
      compileUserRules(rules);const defaults=budgetConfig(budget);
      this.options.rules=copy(rules);this.options.blacklist=[...blacklist];this.defaults=defaults;
      for(const state of this.trails.values())if(state.meta.status==='active'){
        const draft=draftOf(state);draft.meta.config.rules=copy(rules);draft.meta.config.blacklist=[...blacklist];await this._commit(state,draft);
      }
    });
  }
  bindRun(id,runId,sessionId) {
    return this._serial(async()=>{
      const state=this._find(id),draft=draftOf(state);
      if(draft.meta.runId&&draft.meta.runId!==runId)throw new Error('trail 已关联另一个 run');
      if(sessionId!==undefined&&sessionId!==draft.meta.sessionId){
        if([...draft.nodes.values()].some(node=>node.status==='running'))throw new Error('仍有运行中的线索，不能转移到另一会话');
        draft.meta.sessionId=required(sessionId,'sessionId',256);this._checkActivation(draft);
      }
      draft.meta.mode='queue';draft.meta.runId=required(runId,'runId',256);
      await this._commit(state,draft);return copy(draft.meta);
    });
  }
  trackQueueItem(id,item) {
    return this._serial(async()=>{
      const state=this._find(id),draft=draftOf(state);
      if(draft.meta.mode!=='queue')throw new Error('需要关联 queue 模式的 trail');
      const queueId=required(String(item.id??''),'queue item id',256),key='q:'+queueId;
      draft.meta.queueItems??={};draft.meta.queueParents??=[];
      if(Object.hasOwn(draft.meta.queueItems,key))return copy(draft.nodes.get(draft.meta.queueItems[key]));
      const parentId=typeof item.parent==='string'||typeof item.parent==='number'?String(item.parent):item.parentId??item.parent?.id;
      const foundBy=item.parentNodeId??(parentId!==undefined?draft.meta.queueItems['q:'+parentId]:null)??null;
      const [added]=await this._addItems(draft,[{url:item.url??item.text,priority:item.priority,reason:item.reason,foundBy}]);
      if(added.status==='dropped')throw new Error('队列条目已被过滤：'+added.reason);
      if(Number.isInteger(item.depth)&&item.depth>=0){const node=draft.nodes.get(added.id);draft.nodes.set(added.id,{...node,depth:item.depth});}
      draft.meta.queueItems[key]=added.id;
      if(parentId!==undefined&&!foundBy)draft.meta.queueParents.push({parent:'q:'+parentId,child:key,url:redactText(item.url??item.text),reason:redactText(item.reason??'')});
      draft.meta.queueParents=draft.meta.queueParents.filter(link=>{
        const from=draft.meta.queueItems[link.parent],to=draft.meta.queueItems[link.child];if(!from||!to)return true;
        const child=draft.nodes.get(to),parent=draft.nodes.get(from);
        if(!child.foundBy)draft.nodes.set(to,{...child,foundBy:from,depth:parent.depth+1});
        draft.edges.push({id:'e'+draft.meta.nextEdgeId++,from,to,url:link.url,reason:link.reason,at:timestamp(this.now())});return false;
      });
      await this._commit(state,draft);return copy(draft.nodes.get(added.id));
    });
  }
  setAccess(id,nodeId,access) {
    return this._serial(async()=>{
      if(!['fetch','browser','harvest'].includes(access))throw new Error('access 不正确');
      const state=this._find(id),node=state.nodes.get(nodeId);if(!node||node.access===access)return;
      const draft=draftOf(state);draft.nodes.set(nodeId,{...node,access,updatedAt:timestamp(this.now())});await this._commit(state,draft);
    });
  }
  resume(id,sessionId) {
    return this._serial(async () => {
      const state=this._find(id),draft=draftOf(state);
      if (sessionId !== undefined) draft.meta.sessionId=required(sessionId,'sessionId',256);
      this._checkActivation(draft);draft.meta.status='active';draft.meta.startedAt=timestamp(this.now());draft.meta.resumeCount=(draft.meta.resumeCount ?? 0)+1;delete draft.meta.pauseReason;
      // Live workers retain their claims. Only _open() recovers interrupted process work.
      await this._commit(state,draft);return copy(draft.meta);
    });
  }
  get(id) { return this._serial(() => this._public(this._find(id))); }
  readResult(id,nodeId) {
    return this._serial(async()=>{
      const state=this._find(id),node=state.nodes.get(nodeId);if(!node?.resultFile)throw Object.assign(new Error('节点尚无结果文件'),{status:404});
      // Relative resultFile resolves inside the trail directory; an absolute one is a
      // deliberately external reference and is used as-is.
      const path=isAbsolute(node.resultFile)?node.resultFile:resolve(this._dir(id),node.resultFile);
      return {nodeId,text:state.results.get(nodeId)??redactText(await readFile(path,'utf8')),path,...(node.resultExternal?{external:true}:{})};
    });
  }
  list(sessionId) { return this._serial(() => copy([...this.trails.values()].filter(t => sessionId === undefined || t.meta.sessionId === sessionId).map(t => t.meta).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)))); }
  // Directories under trails/ that were not loaded because their name is not a
  // valid trail id. Surfaced so a skipped trail is never silently invisible.
  skipped() { return this._serial(() => [...this.skippedDirs]); }
  active(sessionId) { return this._serial(() => { const state=[...this.trails.values()].find(t => t.meta.sessionId === sessionId && t.meta.status === 'active');return state ? this._public(state) : null; }); }
  map(id,format='tree') { return this._serial(() => renderMap(this._find(id),format)); }
  status(id) {
    return this._serial(() => {
      const state=this._find(id),counts={pending:0,running:0,done:0,skipped:0,blocked:0,useful:0,useless:0},kinds={};let maxDepth=0;
      for(const node of state.nodes.values()) { counts[node.status]=(counts[node.status] ?? 0)+1;if(node.verdict)counts[node.verdict]++;kinds[node.kind]=(kinds[node.kind] ?? 0)+1;maxDepth=Math.max(maxDepth,node.depth); }
      return copy({id:state.meta.id,status:state.meta.status,counts,maxDepth,kinds,total:state.nodes.size,blocked:[...state.nodes.values()].filter(n => n.status === 'blocked').map(({id,url,label,blockedReason}) => ({id,url,label,blockedReason})),budget:state.meta.config.budget,budgetOwner:state.meta.mode === 'queue' ? 'queue' : 'trail',...(state.meta.pauseReason ? {pauseReason:state.meta.pauseReason} : {})});
    });
  }
}
