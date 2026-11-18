import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const root=tmpdir();
const storeModule=await import('../src/trail.js').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const reportModule=await import('../src/report.js').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
async function fixture(t,options={}) {
  assert.equal(typeof storeModule.TrailStore,'function','trail storage implementation is missing');
  const dataDir=await mkdtemp(join(root,'trail-test-'));
  const store=await storeModule.TrailStore.open({dataDir,resolveShortLinks:false,...options});
  t.after(async()=>{await store.close();await rm(dataDir,{recursive:true,force:true});});
  return {store,dataDir};
}
test('report accepts full-width colons, list markers, omitted fields and multiline summary',()=>{
  assert.equal(typeof reportModule.parseReport,'function','report parser implementation is missing');
  const r=reportModule.parseReport(' * status： Useful\n summary：One.\nTwo.\n - KIND: directory\nFOUND:\n- Finding https://example.com\n * NEW：https://example.com/a | 5 | reason\n- new: https://example.com/b | reason\nNEW: https://example.com/c');
  assert.equal(r.status,'useful');assert.equal(r.kind,'directory');assert.match(r.summary,/Two/);
  assert.deepEqual(r.items.map(x=>x.priority),[5,3,3]);assert.equal(r.items[1].reason,'reason');
});
test('report cap keeps highest priorities and reports excess',()=>{
  const text='STATUS: useful\nFOUND:\n'+Array.from({length:220},(_,i)=>`NEW: https://e${i}.com | ${i%5+1} | ${i}`).join('\n');
  const r=reportModule.parseReport(text,{kind:'directory'});assert.equal(r.items.length,200);assert.equal(r.omitted,20);assert.equal(r.items[0].priority,5);
  assert.equal(reportModule.parseReport(text).items.length,50);
});
test('same key merges, raises priority and preserves multiple discoveries',async t=>{
  const {store}=await fixture(t);const trail=await store.start({sessionId:'s',goal:'Find code',seeds:['https://example.com/a','https://example.org/b']});
  await store.add(trail.id,[{url:'https://github.com/A/B/issues/1',foundBy:'n1',priority:2},{url:'https://github.com/a/b',foundBy:'n2',priority:5}]);
  const state=await store.get(trail.id);assert.equal(state.nodes.length,3);assert.equal(state.edges.length,2);assert.equal(state.nodes[2].priority,5);assert.equal(state.nodes[2].foundBy,'n1');
});
test('repeated discoveries append distinct edges and retain the discovered URL across reload',async t=>{
  const {store,dataDir}=await fixture(t);
  const trail=await store.start({sessionId:'s',goal:'Discovery edges',seeds:['https://example.com/source']});
  const url='https://github.com/A/B/issues/7?utm_source=forum#thread';
  await store.add(trail.id,[{url,foundBy:'n1',reason:'same discovery'}]);
  await store.add(trail.id,[{url,foundBy:'n1',reason:'same discovery',priority:5}]);
  await store.close();
  const reopened=await storeModule.TrailStore.open({dataDir,resolveShortLinks:false});t.after(()=>reopened.close());
  const state=await reopened.get(trail.id);
  assert.equal(state.nodes.length,2);assert.equal(state.nodes[1].priority,5);
  assert.equal(state.edges.length,2);assert.notEqual(state.edges[0].id,state.edges[1].id);
  assert.deepEqual(state.edges.map(edge=>edge.url),[url,url]);
});
test('a supplementary report reactivates completed trails when it discovers pending work',async t=>{
  const {store}=await fixture(t);
  const trail=await store.start({sessionId:'s',goal:'Continue report',seeds:['https://example.com/source']});
  await store.report(trail.id,'n1','STATUS: useless\nSUMMARY: Nothing yet.');
  assert.equal((await store.get(trail.id)).status,'done');
  await store.report(trail.id,'n1','STATUS: useful\nSUMMARY: Found an update.\nNEW: https://other.com/new | 4 | update');
  assert.equal((await store.get(trail.id)).status,'active');
  assert.deepEqual((await store.next(trail.id,1)).map(node=>node.id),['n2']);
});
test('concurrent claims never return the same node and persist running state',async t=>{
  const {store}=await fixture(t);const trail=await store.start({sessionId:'s',goal:'Concurrent',seeds:Array.from({length:12},(_,i)=>'https://example.com/'+i)});
  const batches=await Promise.all([store.next(trail.id,5),store.next(trail.id,5),store.next(trail.id,5)]);const ids=batches.flat().map(x=>x.id);
  assert.equal(ids.length,12);assert.equal(new Set(ids).size,12);assert.equal((await store.status(trail.id)).counts.running,12);
});
test('one active trail per session, forced replacement pauses previous trail',async t=>{
  const {store}=await fixture(t);const first=await store.start({sessionId:'s',goal:'First',seeds:[]});
  await assert.rejects(()=>store.start({sessionId:'s',goal:'Second',seeds:[]}),/active|活动/);
  const second=await store.start({sessionId:'s',goal:'Second',seeds:[],force:true});assert.notEqual(first.id,second.id);assert.equal((await store.get(first.id)).status,'paused');
});
test('host cap and depth limit retain skipped nodes; node limit stops additions',async t=>{
  const {store}=await fixture(t);const trail=await store.start({sessionId:'s',goal:'Budget',seeds:['https://example.com/a'],budget:{maxNodes:4,maxDepth:0,maxPerHost:1}});
  const added=await store.add(trail.id,[{url:'https://example.com/b'},{url:'https://other.com/a',foundBy:'n1'},{url:'https://third.com/a'},{url:'https://fourth.com/a'}]);
  const state=await store.get(trail.id);assert.equal(state.nodes[1].skipReason,'host-cap');assert.equal(state.nodes[2].skipReason,'max-depth');assert.equal(added[3].status,'dropped');assert.equal(state.nodes.length,4);
});
test('time budget pauses claims and resume resets the new search interval',async t=>{
  let clock=1000;const {store}=await fixture(t,{now:()=>clock});const trail=await store.start({sessionId:'s',goal:'Time',seeds:['https://example.com/a'],budget:{maxMinutes:1}});
  clock+=60001;assert.deepEqual(await store.next(trail.id,1),[]);assert.equal((await store.get(trail.id)).pauseReason,'max-minutes');
  await store.resume(trail.id,'s');assert.equal((await store.next(trail.id,1)).length,1);
});
test('live resume retains running ownership while process restart alone requeues interrupted work',async t=>{
  let clock=1000;const {store,dataDir}=await fixture(t,{now:()=>clock});
  const trail=await store.start({sessionId:'s',goal:'Live resume',seeds:['https://example.com/first','https://other.com/second'],budget:{maxMinutes:1}});
  assert.deepEqual((await store.next(trail.id,1)).map(n=>n.id),['n1']);
  clock+=60001;assert.deepEqual(await store.next(trail.id,1),[]);
  await store.resume(trail.id,'s');
  assert.equal((await store.get(trail.id)).nodes[0].status,'running');
  assert.deepEqual((await store.next(trail.id,1)).map(n=>n.id),['n2']);
  await store.report(trail.id,'n1','STATUS: useful\nSUMMARY: Original worker finished.');
  assert.equal((await store.get(trail.id)).nodes[0].verdict,'useful');
  await store.close();
  const reopened=await storeModule.TrailStore.open({dataDir,resolveShortLinks:false,now:()=>clock});t.after(()=>reopened.close());
  assert.equal((await reopened.get(trail.id)).nodes[1].status,'pending');
});
test('queue mode ignores every local budget including host cap while standalone retains the cap',async t=>{
  let clock=1000;const {store}=await fixture(t,{now:()=>clock});
  const budget={maxNodes:1,maxDepth:0,maxMinutes:1,maxPerHost:1};
  const trail=await store.start({sessionId:'queue',goal:'Queue host cap',seeds:['https://example.com/0'],mode:'queue',runId:'run-host',budget});
  clock+=60001;
  await store.add(trail.id,Array.from({length:15},(_,i)=>({url:'https://example.com/'+(i+1),foundBy:'n1'})));
  const state=await store.get(trail.id);assert.equal(state.nodes.length,16);
  assert.equal(state.nodes.filter(n=>n.status==='pending').length,16);
  assert.equal((await store.next(trail.id,10)).length,10);
  const standalone=await store.start({sessionId:'single',goal:'Standalone host cap',seeds:['https://example.com/0'],budget:{maxPerHost:1}});
  await store.add(standalone.id,[{url:'https://example.com/1'}]);
  assert.equal((await store.get(standalone.id)).nodes[1].skipReason,'host-cap');
});
test('queue mode leaves node, depth and time budgets to queue owner',async t=>{
  let clock=1000;const {store}=await fixture(t,{now:()=>clock});const trail=await store.start({sessionId:'s',goal:'Queue',seeds:['https://example.com/a'],mode:'queue',runId:'run-1',budget:{maxNodes:1,maxDepth:0,maxMinutes:1}});
  clock+=60001;await store.add(trail.id,[{url:'https://other.com/b',foundBy:'n1'}]);assert.equal((await store.next(trail.id,10)).length,2);
});
test('report stores full result, advances nodes, adds children and returns only a summary',async t=>{
  const {store,dataDir}=await fixture(t);const trail=await store.start({sessionId:'s',goal:'Report',seeds:['https://example.com/a']});await store.next(trail.id,1);
  const reply=await store.report(trail.id,'n1','STATUS: useful\nSUMMARY: Helpful.\nFOUND:\n- Large discovery text\nNEW: https://other.com/a | 4 | follow');
  assert.equal(reply.added,1);assert.ok(!JSON.stringify(reply).includes('Large discovery'));const state=await store.get(trail.id);assert.equal(state.nodes[0].verdict,'useful');assert.equal(state.nodes[1].depth,1);
  assert.match(await readFile(join(dataDir,'trails',trail.id,'results','n1.md'),'utf8'),/Large discovery/);assert.match(await store.map(trail.id,'tree'),/n2/);assert.match(await store.map(trail.id,'table'),/Helpful/);
});
test('blocked result is listed and malformed result is still persisted',async t=>{
  const {store}=await fixture(t);const trail=await store.start({sessionId:'s',goal:'Blocked',seeds:['https://example.com/a','https://other.com/a']});
  await store.report(trail.id,'n1','STATUS: blocked\nBLOCKED: captcha\nSUMMARY: Captcha.');const reply=await store.report(trail.id,'n2','free text without a header');
  const state=await store.get(trail.id);assert.equal(state.nodes[1].status,'done');assert.equal(state.nodes[1].verdict,undefined);assert.match(reply.warning,/格式/);assert.equal((await store.status(trail.id)).blocked[0].blockedReason,'captcha');
});
test('invites are blocked without claiming them for browsing',async t=>{
  const {store}=await fixture(t);const trail=await store.start({sessionId:'s',goal:'Invites',seeds:['https://t.me/+abcd','https://discord.gg/abcd']});
  assert.deepEqual(await store.next(trail.id,10),[]);assert.equal((await store.status(trail.id)).counts.blocked,2);
});
test('restart rebuilds indexes, recovers running nodes and truncates torn append tails',async t=>{
  const {store,dataDir}=await fixture(t);const trail=await store.start({sessionId:'s',goal:'Recover',seeds:['https://example.com/a']});await store.next(trail.id,1);await store.close();
  const dir=join(dataDir,'trails',trail.id);await appendFile(join(dir,'transactions.jsonl'),'{"seq":999');
  const reopened=await storeModule.TrailStore.open({dataDir,resolveShortLinks:false});t.after(()=>reopened.close());assert.equal((await reopened.status(trail.id)).counts.pending,1);
  const added=await reopened.add(trail.id,[{url:'https://example.com/a?utm_source=x',priority:5}]);assert.equal(added[0].status,'merged');assert.equal((await reopened.get(trail.id)).nodes.length,1);
});
test('committed journal rebuilds missing metadata and materialized node/edge files',async t=>{
  const {store,dataDir}=await fixture(t);const trail=await store.start({sessionId:'s',goal:'Replay',seeds:['https://example.com/a']});await store.add(trail.id,[{url:'https://other.com/a',foundBy:'n1'}]);await store.close();
  const dir=join(dataDir,'trails',trail.id);for(const name of ['trail.json','nodes.jsonl','edges.jsonl'])await rm(join(dir,name),{force:true});
  const reopened=await storeModule.TrailStore.open({dataDir,resolveShortLinks:false});t.after(()=>reopened.close());const state=await reopened.get(trail.id);assert.equal(state.nodes.length,2);assert.equal(state.edges.length,1);assert.match(await readFile(join(dir,'map.md'),'utf8'),/n2/);
});
test('parallel additions use one identity and skip/priority changes survive reload',async t=>{
  const {store,dataDir}=await fixture(t);const trail=await store.start({sessionId:'s',goal:'Mutations',seeds:[]});
  await Promise.all(Array.from({length:10},(_,i)=>store.add(trail.id,[{url:'https://github.com/a/b/issues/'+i,priority:i%5+1}])));
  await store.setPriority(trail.id,'n1',4);await store.skip(trail.id,['n1'],'user');await store.close();
  const reopened=await storeModule.TrailStore.open({dataDir,resolveShortLinks:false});t.after(()=>reopened.close());const state=await reopened.get(trail.id);assert.equal(state.nodes.length,1);assert.equal(state.nodes[0].priority,4);assert.equal(state.nodes[0].status,'skipped');
});
test('result body and node updates recover from the same committed transaction',async t=>{
  const {store,dataDir}=await fixture(t);
  const trail=await store.start({sessionId:'s',goal:'Report transaction',seeds:['https://example.com']});
  await store.report(trail.id,'n1','STATUS: useful\nSUMMARY: Original.\nFOUND:\n- Original body');
  const commit=store._commit;store._commit=async()=>{throw Error('simulated interrupted commit');};
  await assert.rejects(()=>store.report(trail.id,'n1','STATUS: useless\nSUMMARY: Replacement.\nFOUND:\n- Replacement body\nNEW: https://other.com | 5 | replacement'),/interrupted/);
  store._commit=commit;await store.close();
  const reopened=await storeModule.TrailStore.open({dataDir,resolveShortLinks:false});
  const resultPath=join(dataDir,'trails',trail.id,'results','n1.md');
  assert.equal((await reopened.get(trail.id)).nodes[0].summary,'Original.');
  assert.match(await readFile(resultPath,'utf8'),/Original body/);
  assert.equal((await reopened.get(trail.id)).nodes.length,1);
  await reopened.report(trail.id,'n1','STATUS: useful\nSUMMARY: Committed.\nFOUND:\n- Committed body');
  await reopened.close();await rm(resultPath);
  const recovered=await storeModule.TrailStore.open({dataDir,resolveShortLinks:false});t.after(()=>recovered.close());
  assert.equal((await recovered.get(trail.id)).nodes[0].summary,'Committed.');
  assert.match(await readFile(resultPath,'utf8'),/Committed body/);
});

test('foreign directories under trails/ are skipped instead of blocking the whole store',async t=>{
  const {store,dataDir}=await fixture(t);
  const trail=await store.start({sessionId:'s',goal:'Survives stray directories',seeds:['https://example.com']});
  await store.close();
  const {mkdir}=await import('node:fs/promises');
  for(const name of ['临时文件夹 带空格','.sync-backup','备份 2026']) await mkdir(join(dataDir,'trails',name),{recursive:true});
  const reopened=await storeModule.TrailStore.open({dataDir,resolveShortLinks:false});t.after(()=>reopened.close());
  assert.equal((await reopened.list()).length,1,'existing trail must still load');
  assert.equal((await reopened.list())[0].id,trail.id);
  assert.deepEqual(await reopened.skipped(),['.sync-backup','临时文件夹 带空格','备份 2026']);
});

test('redactText catches bare credential shapes and Chinese field names without false positives',()=>{
  const {redactText}=reportModule;
  // Assemble the samples at runtime: writing a literal `AKIA...` / `ghp_...` into the
  // repository trips GitHub push protection, which cannot tell a fixture from a real key.
  const sample=(...parts)=>parts.join('');
  const secrets=[
    sample('sk','-proj-','AbCdEf1234567890abcdefghij'),
    sample('gh','p_','1234567890abcdefghijABCDEFGHIJ1234'),
    sample('github','_pat_','11ABCDEFG0abcdefghij_KlMnOpQrStUv'),
    sample('xox','b-','123456789012-abcdefghijkl'),
    sample('AK','IA','IOSFODNN7EXAMPLE'),
    sample('AIz','a','SyA1234567890abcdefghijklmnopqrstuv'),
    sample('gl','pat-','AbCdEf1234567890abcd'),
    sample('np','m_','1234567890abcdefghijABCDEFGHIJ123456'),
    sample('h','f_','AbCdEf1234567890abcdefghijABCDEF'),
    sample('eyJhbGciOiJIUzI1NiJ9','.eyJzdWIiOiIxMjM0NTY3ODkwIn0','.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'),
  ];
  for(const secret of secrets) assert.ok(redactText('看这个 '+secret+' 结束').includes('[redacted]'),'not redacted: '+secret.slice(0,6)+'...');
  assert.ok(redactText('密码是 hunter2').includes('[redacted]'));
  assert.ok(redactText('密码：hunter2').includes('[redacted]'));
  assert.ok(redactText('密钥为 abcdef').includes('[redacted]'));
  // Ordinary prose must survive untouched.
  for(const text of ['这是一个正常句子。','https://github.com/dsh-cc/dsh-cc','密码学很有趣','token 化处理','时间为 12:34:56'])
    assert.equal(redactText(text),text,'false positive: '+text);
});

test('claim reports why a batch is empty instead of a bare array',async t=>{
  // Finished: every node skipped.
  const {store}=await fixture(t);
  const trail=await store.start({sessionId:'s',goal:'Claim reasons',seeds:['https://example.com']});
  await store.skip(trail.id,['n1'],'done');
  const finished=await store.claim(trail.id,1);
  assert.deepEqual(finished.nodes,[]);assert.equal(finished.reason,'done');
  // Claimed: a normal batch still returns nodes.
  const trail2=await store.start({sessionId:'s',goal:'Claim normal',seeds:['https://example.com/x'],force:true});
  const claimed=await store.claim(trail2.id,1);
  assert.equal(claimed.reason,'claimed');assert.equal(claimed.nodes.length,1);
  // next() keeps its array contract for existing callers.
  assert.ok(Array.isArray(await store.next(trail2.id,1)));
});
test('claim distinguishes an exhausted time budget from a finished trail',async t=>{
  let clock=Date.parse('2026-01-01T00:00:00Z');
  const {store}=await fixture(t,{now:()=>clock});
  const trail=await store.start({sessionId:'s',goal:'Budget',seeds:['https://example.com'],budget:{maxMinutes:1}});
  clock+=120000;
  const result=await store.claim(trail.id,1);
  assert.deepEqual(result.nodes,[]);assert.equal(result.reason,'max-minutes');assert.equal(result.pauseReason,'max-minutes');
});

test('result paths inside the trail stay relative so the trail survives relocation',async t=>{
  const {store,dataDir}=await fixture(t);
  const trail=await store.start({sessionId:'s',goal:'Portable paths',seeds:['https://example.com']});
  const trailDir=join(dataDir,'trails',trail.id);
  const inside=join(trailDir,'results','n1.md');
  await store.report(trail.id,'n1','STATUS: useful\nSUMMARY: Inside.\nFOUND:\nNEW:',{resultPath:inside});
  const node=(await store.get(trail.id)).nodes.find(n=>n.id==='n1');
  assert.equal(node.resultFile,'results/n1.md','must be stored relative to the trail directory');
  assert.ok(!node.resultExternal);
  // An absolute path outside the trail is kept verbatim but flagged, never disguised
  // as a portable reference.
  const outside=join(dataDir,'elsewhere.md');
  await store.report(trail.id,'n1','STATUS: useful\nSUMMARY: Outside.\nFOUND:\nNEW:',{resultPath:outside});
  const flagged=(await store.get(trail.id)).nodes.find(n=>n.id==='n1');
  assert.equal(flagged.resultExternal,true);
  assert.equal(flagged.resultFile,outside);
  assert.equal((await store.readResult(trail.id,'n1')).external,true);
});

test('a bloated journal is compacted and still replays completely',async t=>{
  // Small thresholds keep the test fast while exercising the same code path.
  const {store,dataDir}=await fixture(t,{compactMinBytes:4096,compactRatio:1.5});
  const trail=await store.start({sessionId:'s',goal:'Compaction',seeds:[],budget:{maxNodes:5000,maxPerHost:5000}});
  const journal=join(dataDir,'trails',trail.id,'transactions.jsonl');
  let previous=0,shrunk=false;
  for(let i=0;i<60;i++){
    await store.add(trail.id,[{url:`https://c${i%7}.example.com/p${i}`,reason:'r'.repeat(150)}]);
    const size=(await readFile(journal)).length;
    if(previous>0&&size<previous*0.8) shrunk=true;
    previous=size;
  }
  assert.ok(shrunk,'journal must shrink once it passes the compaction floor');
  const nodes=(await store.get(trail.id)).nodes.length;
  assert.equal(nodes,60);
  // The compacted journal starts from a snapshot whose seq is not 1; replay must still work.
  await store.close();
  const reopened=await storeModule.TrailStore.open({dataDir,resolveShortLinks:false});t.after(()=>reopened.close());
  assert.equal((await reopened.get(trail.id)).nodes.length,60);
  assert.equal((await reopened.claim(trail.id,5)).reason,'claimed');
});

// 回归：模型常在枚举后紧贴括号或竖线写注释。旧实现按空格切分，会把
// "useful（结论=…）" 整串当枚举，判为格式不符，节点仍标 done 但统计丢状态。
test('report keeps STATUS/BLOCKED when a note is glued to the enum',()=>{
  const cases=[
    ['STATUS: useful（结论=时间未到）','useful'],
    ['STATUS: useful 时间未到','useful'],
    ['STATUS: useful|备注','useful'],
    ['STATUS: useful, 备注','useful'],
    ['STATUS: USELESS','useless'],
    ['STATUS: blocked','blocked'],
  ];
  for(const [line,expected] of cases){
    const r=reportModule.parseReport(line+'\nSUMMARY: x');
    assert.equal(r.status,expected,`failed on: ${line}`);
    assert.equal(r.warning,undefined,`unexpected warning on: ${line}`);
  }
  assert.equal(reportModule.parseReport('STATUS: blocked\nBLOCKED: captcha（验证码）').blockedReason,'captcha');
  // 非法枚举仍须被拒，不能因为宽松匹配而放行。
  assert.equal(reportModule.parseReport('STATUS: 有用\nSUMMARY: x').status,null);
  assert.equal(reportModule.parseReport('STATUS: maybe\nSUMMARY: x').status,null);
});
