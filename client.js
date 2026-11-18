window.__ModuleLoader__.load({
  id: 'dsh-trail-search',
  factory(require) {
    const React = require('react');
    const UI = require('@deepseek-ai/dsh-client-ui-primitives');
    const h = React.createElement;
    const ENDPOINT = '/api/trail-search';
    const NODE_STATUS = {pending:'待看',running:'在看',done:'已看',skipped:'已跳过',blocked:'被挡'};
    const TRAIL_STATUS = {active:'进行中',paused:'已暂停',done:'已完成'};
    const BLOCKED = {login:'需要登录',captcha:'验证码',geo:'地域限制',dead:'链接失效',other:'其他阻碍'};
    const KIND = {directory:'资源目录','forum-board':'论坛版块','forum-thread':'论坛帖子','qa-question':'问题','qa-answer':'答案','github-repo':'GitHub 仓库','github-user':'GitHub 作者','github-gist':'Gist','code-repo':'代码仓库','telegram-channel':'Telegram 频道','telegram-invite':'Telegram 邀请','chat-invite':'社群邀请','x-user':'X 账号','x-post':'X 帖子','vk-page':'VK 主页','vk-post':'VK 帖子','zhihu-question':'知乎问题','zhihu-answer':'知乎回答','zhihu-article':'知乎文章',video:'视频','file-share':'文件分享',file:'文件',search:'搜索词',web:'网页'};
    const CSS = `
.ts-root{box-sizing:border-box;min-width:0;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.6}
.ts-panel{height:100%;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:14px}
.ts-settings{max-width:900px;display:grid;gap:18px;padding:4px 0 24px}
.ts-root *{box-sizing:border-box}.ts-root h2,.ts-root h3,.ts-root h4,.ts-root p{margin:0}.ts-root h2{font-size:16px}.ts-root h3{font-size:14px}.ts-root h4{font-size:13px}
.ts-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.ts-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ts-card{min-width:0;border:1px solid var(--dsw-alias-border-l2,#7775);border-radius:10px;padding:12px;display:grid;gap:10px}.ts-stack{display:grid;gap:10px}
.ts-note{color:var(--dsw-alias-label-tertiary,#999);font-size:12px;overflow-wrap:anywhere}.ts-error{color:var(--dsw-color-danger-600,#e56c6c);overflow-wrap:anywhere}.ts-notice{padding:10px 12px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover,#7771);overflow-wrap:anywhere}
.ts-root .ts-button{font:inherit;white-space:normal}.ts-root button:disabled{opacity:.5;cursor:default}.ts-root .ts-primary{background:var(--dsw-alias-state-business-primary,#4d6bfe);color:#fff}
.ts-root input:not([type=checkbox]),.ts-root textarea,.ts-root select{width:100%;min-width:0;border:1px solid var(--dsw-alias-border-l2,#7777);border-radius:6px;padding:7px 9px;background:var(--dsw-alias-bg-base,transparent);color:inherit;font:inherit}
.ts-root textarea{resize:vertical;min-height:78px}.ts-root input:focus-visible,.ts-root textarea:focus-visible,.ts-root select:focus-visible,.ts-root button:focus-visible,.ts-root a:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#4d6bfe);outline-offset:2px}
.ts-field{display:grid;gap:4px;min-width:0}.ts-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px}.ts-root a{color:var(--dsw-alias-label-link,#709eff);overflow-wrap:anywhere}
.ts-tabs{display:flex;gap:6px;border-bottom:1px solid var(--dsw-alias-border-l2,#7774);padding-bottom:8px}.ts-tabs button[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover,#7773)}
.ts-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(68px,1fr));gap:6px}.ts-stat{padding:7px;border-radius:7px;background:var(--dsw-alias-interactive-bg-hover,#7771);display:grid;text-align:center}.ts-stat strong{font-variant-numeric:tabular-nums;font-size:17px}.ts-stat span{font-size:11px;color:var(--dsw-alias-label-tertiary,#999)}
.ts-chips{display:flex;gap:5px;flex-wrap:wrap}.ts-chip{font-size:11px;border:1px solid var(--dsw-alias-border-l2,#7774);border-radius:5px;padding:0 5px;overflow-wrap:anywhere}.ts-chip[data-status=blocked]{color:var(--dsw-color-danger-600,#e56c6c)}
.ts-tree{display:grid;gap:5px}.ts-node{min-width:0;border-left:2px solid var(--dsw-alias-border-l2,#7774);padding-left:7px}.ts-node-button{width:100%;border:0;border-radius:6px;text-align:left;display:grid;gap:3px;padding:6px;background:transparent;color:inherit;font:inherit;cursor:pointer}.ts-node-button:hover,.ts-node-button[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover,#7772)}
.ts-node-label{font-weight:500;overflow-wrap:anywhere}.ts-summary{color:var(--dsw-alias-label-secondary);font-size:12px;overflow-wrap:anywhere}.ts-detail{margin:6px 0 8px;padding:10px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover,#7771);display:grid;gap:9px}.ts-detail dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 8px;margin:0}.ts-detail dt{color:var(--dsw-alias-label-tertiary,#999)}.ts-detail dd{margin:0;overflow-wrap:anywhere}
.ts-pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto;font:inherit;font-size:12px}.ts-history{display:grid;gap:8px}.ts-history article{display:grid;gap:7px;border-bottom:1px solid var(--dsw-alias-border-l2,#7773);padding:10px 0}.ts-history-title{font-weight:500;overflow-wrap:anywhere}
.ts-table-wrap{overflow:auto}.ts-table{width:100%;border-collapse:collapse;font-size:12px}.ts-table th,.ts-table td{padding:5px;text-align:left;vertical-align:top;border-bottom:1px solid var(--dsw-alias-border-l2,#7774)}.ts-table input{min-width:105px}.ts-table .ts-rule-pattern{min-width:170px}.ts-table th{white-space:nowrap}.ts-inline{display:flex;gap:7px;align-items:center}.ts-inline>input,.ts-inline>select{flex:1;min-width:0}
`;

    const lines = text => String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const nodeLabel = node => node.verdict === 'useful' ? '有用' : node.verdict === 'useless' ? '无用' : NODE_STATUS[node.status] || node.status;
    const dateText = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Tokyo',hour12:false}) : '时间未知';
    function urlFor(query) { return ENDPOINT + '?' + new URLSearchParams(Object.entries(query).filter(([,v]) => v !== undefined && v !== null && v !== '')).toString(); }
    function externalURL(value) { try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) ? url.href : null; } catch { return null; } }
    function Link({url,children}) { const href = externalURL(url); return href ? h('a',{href,target:'_blank',rel:'noreferrer noopener'},children || url) : h('span',null,children || url); }
    function Button({children,primary=false,...props}) { return h(UI.Button,{type:'button',variant:primary?'primary':'outline',...props,className:['ts-button',primary?'ts-primary':'',props.className || ''].join(' ')},children); }
    function Field({label,hint,children}) { return h('label',{className:'ts-field'},h('span',null,label),children,hint?h('span',{className:'ts-note'},hint):null); }
    function Notice({error=false,children}) { return h('div',{className:'ts-notice'+(error?' ts-error':''),role:error?'alert':'status'},children); }
    function treeRows(nodes) {
      const known = new Set(nodes.map(n => n.id)), children = new Map(), visited = new Set(), rows = [];
      for (const node of nodes) { const parent = known.has(node.foundBy) && node.foundBy !== node.id ? node.foundBy : null; if (!children.has(parent)) children.set(parent,[]); children.get(parent).push(node); }
      function walk(node,depth) { if (visited.has(node.id)) return; visited.add(node.id); rows.push({node,depth}); for (const child of children.get(node.id) || []) walk(child,depth+1); }
      for (const root of children.get(null) || []) walk(root,0);
      for (const node of nodes) if (!visited.has(node.id)) walk(node,0);
      return rows;
    }
    function useResource(load) {
      const [state,setState] = React.useState({data:null,loading:true,error:''});
      const version = React.useRef(0), controller = React.useRef(null), mounted = React.useRef(false);
      const refresh = React.useCallback(async () => {
        const token = ++version.current; controller.current?.abort(); const next = new AbortController(); controller.current = next;
        setState(old => ({...old,loading:true,error:''}));
        try { const data = await load(next.signal); if (mounted.current && token === version.current) setState({data,loading:false,error:''}); }
        catch (error) { if (mounted.current && token === version.current && error.name !== 'AbortError') setState(old => ({...old,loading:false,error:error.message})); }
      },[load]);
      React.useEffect(() => { mounted.current=true; void refresh(); return () => {mounted.current=false;version.current++;controller.current?.abort();}; },[refresh]);
      const replace = data => { version.current++;controller.current?.abort();setState({data,loading:false,error:''}); };
      return {...state,refresh,replace};
    }
    function useAction() {
      const [busy,setBusy] = React.useState(false), [error,setError] = React.useState(''), [notice,setNotice] = React.useState('');
      const running = React.useRef(false), mounted = React.useRef(false), controller = React.useRef(null);
      React.useEffect(() => {mounted.current=true;return () => {mounted.current=false;controller.current?.abort();};},[]);
      const run = async (job,onSuccess) => {
        if (running.current) return; running.current=true;setBusy(true);setError('');setNotice('');controller.current=new AbortController();
        try { const value=await job(controller.current.signal);if(mounted.current)onSuccess?.(value); }
        catch (err) {if(mounted.current && err.name!=='AbortError')setError(err.message);}
        finally {running.current=false;if(mounted.current)setBusy(false);}
      };
      return {busy,error,notice,run,setNotice};
    }

    function apply(ctx) {
      let disposed = false;
      const pending = new Set();
      ctx.effect(() => () => {disposed=true;for(const controller of pending)controller.abort();pending.clear();},'trail-search: requests');
      async function request(query,body,signal) {
        if (disposed || signal?.aborted) throw new DOMException('请求已取消','AbortError');
        const controller = new AbortController(), abort = () => controller.abort();let timedOut=false;
        const timeout=setTimeout(()=>{timedOut=true;controller.abort();},30000);pending.add(controller);signal?.addEventListener('abort',abort,{once:true});
        try {
          const response = await fetch(query ? urlFor(query) : ENDPOINT,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
          let data;try {data=await response.json();} catch {throw new Error('暂时无法读取线索搜索。请确认插件已启用，再刷新。');}
          if (!response.ok || data?.error) throw new Error(typeof data?.error==='string'?data.error:response.status===404?'线索搜索尚未启用。请在宿主插件管理中启用后刷新。':`读取失败（${response.status}），请稍后重试。`);
          if (!data || typeof data!=='object') throw new Error('返回内容不完整，请刷新后重试。');
          return data;
        } catch (error) {if(timedOut)throw new Error('请求超时，请刷新后重试。');throw error;}
        finally {clearTimeout(timeout);pending.delete(controller);signal?.removeEventListener('abort',abort);}
      }

      function ResultView({trailId,nodeId}) {
        const load=React.useCallback(signal=>request({action:'result',trailId,nodeId},undefined,signal),[trailId,nodeId]);
        const result=useResource(load);
        return h('div',{className:'ts-stack'},result.loading?h(Notice,null,'正在读取结果…'):null,result.error?h(Notice,{error:true},result.error,h(Button,{onClick:result.refresh},'重试')):null,result.data?h('pre',{className:'ts-pre','aria-label':'查看结果'},result.data.text):null);
      }
      function ReportForm({node,busy,onSubmit}) {
        const [verdict,setVerdict]=React.useState('useful'),[reason,setReason]=React.useState(node.blockedReason || 'login');
        const [summary,setSummary]=React.useState(''),[findings,setFindings]=React.useState(''),[links,setLinks]=React.useState(''),[error,setError]=React.useState('');
        const submit=event=>{
          event.preventDefault();setError('');
          const next=lines(links);if(node.kind!=='directory'&&next.length>50){setError('一次最多补充 50 条新线索。');return;}
          const text=summary.trim().replace(/\s+/g,' ');if(!text){setError('请填写查看摘要。');return;}
          const report=[`STATUS: ${verdict}`,...(verdict==='blocked'?[`BLOCKED: ${reason}`]:[]),`SUMMARY: ${text}`,'FOUND:',...(lines(findings).length?lines(findings):[text]).map(line=>`- ${line}（出处：${node.url}）`),...next.map(url=>`NEW: ${url} | 3 | 用户补充的相关线索`)].join('\n');
          onSubmit(report,()=>{setSummary('');setFindings('');setLinks('');});
        };
        return h('form',{className:'ts-stack',onSubmit:submit},h('h4',null,'补充查看结果'),
          h(Field,{label:'查看结论'},h('select',{value:verdict,onChange:e=>setVerdict(e.target.value),disabled:busy},h('option',{value:'useful'},'有用'),h('option',{value:'useless'},'无用'),h('option',{value:'blocked'},'被挡'))),
          verdict==='blocked'?h(Field,{label:'被挡原因'},h('select',{value:reason,onChange:e=>setReason(e.target.value),disabled:busy},...Object.entries(BLOCKED).map(([value,label])=>h('option',{key:value,value},label)))):null,
          h(Field,{label:'查看摘要（最多三句）'},h('textarea',{required:true,value:summary,maxLength:1000,onChange:e=>setSummary(e.target.value),disabled:busy,rows:2})),
          h(Field,{label:'详细发现与出处',hint:'可以粘贴你看到的内容，每行一条；会保留当前页面作为出处。'},h('textarea',{value:findings,onChange:e=>setFindings(e.target.value),disabled:busy,rows:3})),
          h(Field,{label:'新线索（可选，每行一个网址或搜索词）',hint:'搜索词写成 search:关键词。'},h('textarea',{value:links,onChange:e=>setLinks(e.target.value),disabled:busy,rows:2})),
          error?h(Notice,{error:true},error):null,h('div',null,h(Button,{type:'submit',primary:true,disabled:busy},busy?'正在提交…':'提交查看结果')));
      }
      function NodeDetail({node,trail,editable,busy,mutate,onSelect}) {
        const [showResult,setShowResult]=React.useState(false),[skipReason,setSkipReason]=React.useState('手动跳过');
        const parent=trail.nodes.find(item=>item.id===node.foundBy),related=(trail.edges || []).filter(edge=>edge.from===node.id||edge.to===node.id);
        const access={fetch:'网页读取',browser:'浏览器',harvest:'结构化接口'};
        return h('div',{className:'ts-detail'},
          h(Link,{url:node.url}),
          h('dl',null,h('dt',null,'发现原因'),h('dd',null,node.reason || '种子线索'),h('dt',null,'来自'),h('dd',null,parent?h(Button,{onClick:()=>onSelect(parent.id),disabled:busy},parent.label):node.foundBy?'较早的线索':'搜索起点'),h('dt',null,'访问方式'),h('dd',null,access[node.access] || '尚未记录'),h('dt',null,'优先级'),h('dd',null,`${node.priority} / 5`)),
          node.blockedReason?h(Notice,null,BLOCKED[node.blockedReason] || node.blockedReason):null,
          node.skipReason?h('p',{className:'ts-note'},'跳过原因：'+node.skipReason):null,
          node.summary?h('p',{className:'ts-summary'},node.summary):null,
          related.length?h('details',null,h('summary',null,`发现关系（${related.length}）`),h('div',{className:'ts-stack'},...related.map((edge,index)=>{
            const incoming=edge.to===node.id,other=trail.nodes.find(item=>item.id===(incoming?edge.from:edge.to));
            return h('div',{key:edge.id || index},h('span',null,incoming?'来自 ':'发现了 '),other?h(Button,{onClick:()=>onSelect(other.id),disabled:busy},other.label):h('span',null,'其他线索'),edge.reason?h('p',{className:'ts-note'},edge.reason):null,h(Link,{url:edge.url,children:'发现时的网址'}));
          }))):null,
          node.resultFile?h('div',null,h('a',{href:urlFor({action:'result',trailId:trail.id,nodeId:node.id}),onClick:event=>{event.preventDefault();setShowResult(!showResult);},'aria-expanded':showResult},showResult?'收起结果文件':'查看结果文件'),showResult?h(ResultView,{trailId:trail.id,nodeId:node.id}):null):h('p',{className:'ts-note'},'尚无查看结果。'),
          editable?h('div',{className:'ts-stack'},
            h(Field,{label:'调整优先级'},h('select',{value:String(node.priority),disabled:busy,onChange:e=>mutate('priority',{nodeId:node.id,priority:Number(e.target.value)},()=>{},'优先级已更新。')},...[1,2,3,4,5].map(value=>h('option',{key:value,value},`${value}${value===5?'（最优先）':''}`)))),
            node.status!=='skipped'?h('div',{className:'ts-inline'},h('input',{value:skipReason,onChange:e=>setSkipReason(e.target.value),'aria-label':'跳过原因',maxLength:1000,disabled:busy}),h(Button,{disabled:busy||!skipReason.trim(),onClick:()=>mutate('skip',{nodeIds:[node.id],reason:skipReason.trim()},()=>{},'已跳过这条线索。')},'跳过')):null,
            h(ReportForm,{node,busy,onSubmit:(report,done)=>mutate('report',{nodeId:node.id,report},done)})):null);
      }
      function StartForm({busy,onStart}) {
        const [goal,setGoal]=React.useState(''),[seeds,setSeeds]=React.useState('');
        return h('form',{className:'ts-card',onSubmit:e=>{e.preventDefault();onStart(goal.trim(),lines(seeds));}},h('h3',null,'新建搜索'),
          h(Field,{label:'要找什么'},h('textarea',{required:true,maxLength:2000,value:goal,onChange:e=>setGoal(e.target.value),disabled:busy,rows:2})),
          h(Field,{label:'起始线索',hint:'每行一个网址，或 search:关键词。'},h('textarea',{required:true,value:seeds,onChange:e=>setSeeds(e.target.value),disabled:busy,rows:3})),
          h('div',null,h(Button,{type:'submit',primary:true,disabled:busy||!goal.trim()||!lines(seeds).length},busy?'正在新建…':'新建搜索')));
      }
      function AddForm({nodes,busy,onAdd}) {
        const [urls,setUrls]=React.useState(''),[priority,setPriority]=React.useState('3'),[reason,setReason]=React.useState('手动补充'),[foundBy,setFoundBy]=React.useState('');
        return h('details',null,h('summary',null,'添加线索'),h('form',{className:'ts-stack',onSubmit:e=>{e.preventDefault();onAdd(lines(urls).map(url=>({url,priority:Number(priority),reason:reason.trim(),...(foundBy?{foundBy}:{})})),()=>setUrls(''));}},
          h(Field,{label:'网址或 search:关键词（每行一条）'},h('textarea',{required:true,value:urls,onChange:e=>setUrls(e.target.value),disabled:busy})),
          h('div',{className:'ts-grid'},h(Field,{label:'优先级'},h('select',{value:priority,onChange:e=>setPriority(e.target.value),disabled:busy},...[1,2,3,4,5].map(value=>h('option',{key:value,value},`${value}${value===5?'（最优先）':''}`)))),h(Field,{label:'发现自（可选）'},h('select',{value:foundBy,onChange:e=>setFoundBy(e.target.value),disabled:busy},h('option',{value:''},'新的搜索起点'),...nodes.map(node=>h('option',{key:node.id,value:node.id},node.label))))),
          h(Field,{label:'为什么值得看'},h('input',{required:true,value:reason,onChange:e=>setReason(e.target.value),disabled:busy,maxLength:1000})),h('div',null,h(Button,{type:'submit',disabled:busy||!lines(urls).length||!reason.trim()},'添加'))));
      }
      function Statistics({status}) {
        if(!status)return null;
        const metrics=[['pending','待看'],['running','在看'],['useful','有用'],['useless','无用'],['blocked','被挡'],['skipped','跳过']];
        return h('div',{className:'ts-stack'},h('div',{className:'ts-stats'},...metrics.map(([key,label])=>h('div',{className:'ts-stat',key},h('strong',null,status.counts?.[key] ?? 0),h('span',null,label)))),h('p',{className:'ts-note'},`共 ${status.total} 条 · 最大深度 ${status.maxDepth}`),h('div',{className:'ts-chips'},...Object.entries(status.kinds || {}).map(([kind,count])=>h('span',{className:'ts-chip',key:kind},`${KIND[kind] || kind} ${count}`))));
      }
      function TrailPanel({sessionId}) {return h(PanelBody,{key:sessionId || 'no-session',sessionId});}
      function PanelBody({sessionId}) {
        const [selectedId,setSelectedId]=React.useState(null),[tab,setTab]=React.useState('map'),[openNode,setOpenNode]=React.useState(null),root=React.useRef(null);
        React.useEffect(()=>{if(openNode){const node=Array.from(root.current?.querySelectorAll('[data-ts-node]') || []).find(item=>item.dataset.tsNode===openNode);node?.scrollIntoView?.({block:'nearest'});}},[openNode]);
        const load=React.useCallback(signal=>sessionId?request({action:'state',sessionId,trailId:selectedId},undefined,signal):Promise.resolve(null),[sessionId,selectedId]);
        const resource=useResource(load),action=useAction(),data=resource.data,trail=data?.trail;
        const busy=action.busy||resource.loading,editable=!!(trail&&trail.id===data.activeTrailId&&trail.sessionId===sessionId&&trail.mode!=='queue');
        const mutate=(kind,fields,done,notice)=>action.run(signal=>request(null,{action:kind,sessionId,trailId:trail?.id,...fields},signal),value=>{
          if(!value.state)throw new Error('操作结果缺少搜索状态，请刷新确认。');resource.replace(value.state);done?.(value.result);
          const result=value.result;action.setNotice(notice || (kind==='report'?`查看结果已提交；新增 ${result.added || 0} 条，合并 ${result.merged || 0} 条，丢弃 ${result.dropped || 0} 条。${result.warning || ''}${result.notice || ''}`:kind==='add'?`新增 ${result.filter(item=>item.status==='new').length} 条，合并 ${result.filter(item=>item.status==='merged').length} 条，丢弃 ${result.filter(item=>item.status==='dropped').length} 条。`:'操作已完成。'));
        });
        const view=id=>{setSelectedId(id);setOpenNode(null);setTab('map');};
        const resume=entry=>mutate('resume',{trailId:entry.id},()=>{setSelectedId(entry.id);setOpenNode(null);setTab('map');},'已恢复搜索，可继续处理待看线索。');
        if(!sessionId)return h('div',{className:'ts-root ts-panel'},h('h2',null,'线索'),h(Notice,null,'先选择一个会话，再查看或新建搜索。'));
        return h('div',{className:'ts-root ts-panel','aria-busy':busy,ref:root},
          h('div',{className:'ts-bar'},h('h2',null,'线索'),h(Button,{onClick:resource.refresh,disabled:busy},resource.loading?'正在刷新…':'刷新')),
          h('div',{className:'ts-tabs','aria-label':'线索视图'},h(Button,{'aria-pressed':tab==='map',onClick:()=>setTab('map'),disabled:action.busy},'线索地图'),h(Button,{'aria-pressed':tab==='history',onClick:()=>setTab('history'),disabled:action.busy},'历史搜索')),
          resource.loading?h(Notice,null,'正在读取搜索…'):null,resource.error?h(Notice,{error:true},resource.error):null,action.error?h(Notice,{error:true},action.error):null,action.notice?h(Notice,null,action.notice):null,
          data?.queueAvailable===false?h('p',{className:'ts-note'},'委派模块尚未连接，当前可使用独立搜索。'):null,
          data&&tab==='history'?h('section',{className:'ts-history','aria-label':'历史搜索'},h('p',{className:'ts-note'},'可打开其他会话的搜索；继续后会关联到当前会话。时间按东京时间显示。'),...(data.history?.length?data.history.map(entry=>h('article',{key:entry.id},h('p',{className:'ts-history-title'},entry.goal),h('p',{className:'ts-note'},`${TRAIL_STATUS[entry.status] || entry.status}${entry.id===data.activeTrailId?' · 当前搜索':''} · ${dateText(entry.updatedAt || entry.createdAt)}`),h('div',{className:'ts-actions'},h(Button,{onClick:()=>view(entry.id),disabled:busy},'打开'),h(Button,{onClick:()=>resume(entry),disabled:busy||entry.mode==='queue'||entry.id===data.activeTrailId||!!data.activeTrailId,title:data.activeTrailId?'当前已有活动搜索，完成后可继续历史搜索。':undefined},'从这里继续')))):[h(Notice,{key:'empty'},'还没有历史搜索。')])):null,
          data&&tab==='map'?h(React.Fragment,null,
            selectedId?h('div',{className:'ts-actions'},h(Button,{onClick:()=>view(null),disabled:busy},'返回当前搜索')):null,
            !data.activeTrailId?h(StartForm,{busy,onStart:(goal,seeds)=>mutate('start',{goal,seeds},()=>{setSelectedId(null);setOpenNode(null);},'搜索已新建，可继续处理线索。')}):null,
            trail?h('section',{className:'ts-card'},h('div',{className:'ts-bar'},h('h3',null,trail.goal),h('span',{className:'ts-chip'},TRAIL_STATUS[trail.status] || trail.status)),
              !editable?h(Notice,null,trail.mode==='queue'?'这条搜索由委派队列管理，当前仅供查看。':data.activeTrailId?'正在查看历史搜索。当前会话已有活动搜索，请先处理当前搜索。':h(React.Fragment,null,'正在查看历史搜索。',h(Button,{onClick:()=>resume(trail),disabled:busy},'从这里继续'))):null,
              h(Statistics,{status:data.status}),editable?h(AddForm,{nodes:trail.nodes || [],busy,onAdd:(items,done)=>mutate('add',{items},done)}):null,
              trail.nodes?.length?h('div',{className:'ts-tree','aria-label':'线索关系树'},...treeRows(trail.nodes).map(({node,depth})=>h('div',{className:'ts-node',key:node.id,'data-ts-node':node.id,style:{marginInlineStart:`${Math.min(depth,12)*12}px`}},h('button',{type:'button',className:'ts-node-button','aria-expanded':openNode===node.id,onClick:()=>setOpenNode(openNode===node.id?null:node.id),disabled:action.busy},h('span',{className:'ts-node-label'},node.label),h('span',{className:'ts-chips'},h('span',{className:'ts-chip'},KIND[node.kind] || node.kind),h('span',{className:'ts-chip','data-status':node.status},nodeLabel(node))),node.summary?h('span',{className:'ts-summary'},node.summary):null),openNode===node.id?h(NodeDetail,{node,trail,editable:editable&&!resource.loading,busy,mutate,onSelect:setOpenNode}):null))):h(Notice,null,'暂无线索，可以添加网址或搜索词。')):h(Notice,null,'当前会话还没有搜索。'),
            data.status?.blocked?.length?h('section',{className:'ts-card'},h('h3',null,'被挡线索'),...data.status.blocked.map(node=>h('div',{key:node.id,className:'ts-stack'},h(Button,{onClick:()=>setOpenNode(node.id),disabled:action.busy},`${node.label} · ${BLOCKED[node.blockedReason] || '其他阻碍'}`),h(Link,{url:node.url}),h('p',{className:'ts-note'},'可自行查看后，在节点中补充查看结果。')))):null):null);
      }
      function SettingsView() {
        const load=React.useCallback(signal=>request({action:'config'},undefined,signal),[]);
        const resource=useResource(load),action=useAction(),[draft,setDraft]=React.useState(null),[blacklist,setBlacklist]=React.useState('');
        const [rows,setRows]=React.useState([]),nextRow=React.useRef(0),[testURL,setTestURL]=React.useState(''),[testResult,setTestResult]=React.useState(undefined);
        React.useEffect(()=>{
          if(!resource.data)return;
          setDraft(JSON.parse(JSON.stringify(resource.data.config)));setBlacklist((resource.data.config.blacklist || []).join('\n'));
          setRows(resource.data.rules.map(rule=>({id:nextRow.current++,rule:{...rule}})));setTestResult(undefined);
        },[resource.data]);
        const edit=patch=>{setDraft(old=>({...old,...patch}));action.setNotice('');};
        const changeRule=(id,key,value)=>{setRows(old=>old.map(row=>row.id===id?{...row,rule:{...row.rule,[key]:value}}:row));setTestResult(undefined);action.setNotice('');};
        const rulesValue=()=>rows.map(({rule})=>{
          const value={...rule,host:String(rule.host || '').trim()};
          for(const key of ['name','kind'])if(typeof value[key]==='string')value[key]=value[key].trim();
          for(const key of ['name','pattern','key','kind'])if(value[key]==='')delete value[key];
          return value;
        });
        const save=event=>{
          event.preventDefault();
          action.run(async signal=>{
            const config={...draft,blacklist:lines(blacklist),budget:Object.fromEntries(Object.entries(draft.budget).map(([key,value])=>[key,Number(value)]))};
            return request(null,{action:'settings',config,rules:rulesValue()},signal);
          },value=>{resource.replace(value);action.setNotice('设置已保存。');});
        };
        const dirty=!!draft&&!!resource.data&&(JSON.stringify({...draft,blacklist:lines(blacklist)})!==JSON.stringify(resource.data.config)||JSON.stringify(rulesValue())!==JSON.stringify(resource.data.rules));
        const busy=action.busy||resource.loading;
        return h('div',{className:'ts-root ts-settings','aria-busy':busy},
          h('div',{className:'ts-bar'},h('h2',null,'线索搜索'),h(Button,{onClick:resource.refresh,disabled:busy},dirty?'放弃修改并重载':'重新加载')),
          h(Notice,null,'插件默认关闭；启用或停用请到宿主插件管理。下方设置用于调整检索偏好。'),
          resource.loading?h(Notice,null,'正在读取设置…'):null,resource.error?h(Notice,{error:true},resource.error):null,action.error?h(Notice,{error:true},action.error):null,action.notice?h(Notice,null,action.notice):null,
          draft?h('form',{className:'ts-stack',onSubmit:save},
            h('section',{className:'ts-card'},h('h3',null,'独立搜索预算'),h('p',{className:'ts-note'},'用于单 Agent 搜索；委派搜索使用任务队列的预算。'),
              h('div',{className:'ts-grid'},...[['maxNodes','最多线索数',1,1],['maxDepth','最大深度',0,1],['maxMinutes','最长时间（分钟）',0.01,'any'],['maxPerHost','同一站点最多线索数',1,1]].map(([key,label,min,step])=>h(Field,{key,label},h('input',{type:'number',required:true,min,step,value:draft.budget[key],disabled:busy,onChange:e=>edit({budget:{...draft.budget,[key]:e.target.value}})})))),h('p',{className:'ts-note'},'同一站点每分钟最多读取 10 次，达到限额会排队。')),
            h('section',{className:'ts-card'},h('h3',null,'访问能力'),h('p',{className:'ts-note'},'自动判断使用当前会话可用的能力；手动选择不会安装工具或改变登录状态。'),h('div',{className:'ts-grid'},...[["browserAvailable","浏览器"],["harvestAvailable","站点结构化采集"]].map(([key,label])=>h(Field,{key,label},h('select',{value:draft[key]===null?'auto':String(draft[key]),disabled:busy,onChange:e=>edit({[key]:e.target.value==='auto'?null:e.target.value==='true'})},h('option',{value:'auto'},'自动判断'),h('option',{value:'true'},'允许使用'),h('option',{value:'false'},'不使用')))))),
            h('section',{className:'ts-card'},h('h3',null,'黑名单'),h(Field,{label:'站点或归并标识前缀',hint:'每行一条，例如 example.com 或 github:owner/。命中的新线索不会加入。'},h('textarea',{value:blacklist,disabled:busy,rows:4,onChange:e=>{setBlacklist(e.target.value);action.setNotice('');setTestResult(undefined);}}))),
            h('section',{className:'ts-card'},h('div',{className:'ts-bar'},h('h3',null,'站点规则'),h(Button,{disabled:busy,onClick:()=>{setRows(old=>[...old,{id:nextRow.current++,rule:{name:'',host:'',pattern:'',key:'',kind:'web'}}]);setTestResult(undefined);action.setNotice('');}},'添加规则')),
              h('p',{className:'ts-note'},'用户规则优先。域名不带协议；路径匹配可填正则，归并标识可用 $1、$2 引用捕获组。自定义类型需有对应 Skill。'),
              rows.length?h('div',{className:'ts-table-wrap'},h('table',{className:'ts-table'},h('thead',null,h('tr',null,...['名字','域名','路径匹配','归并标识','类型','操作'].map(label=>h('th',{key:label,scope:'col'},label)))),h('tbody',null,...rows.map((row,index)=>h('tr',{key:row.id},...['name','host','pattern','key','kind'].map((key,column)=>h('td',{key},h('input',{value:row.rule[key] ?? '',required:key==='host',className:key==='pattern'?'ts-rule-pattern':undefined,'aria-label':`规则 ${index+1} ${['名字','域名','路径匹配','归并标识','类型'][column]}`,disabled:busy,onChange:e=>changeRule(row.id,key,e.target.value)}))),h('td',null,h(Button,{disabled:busy,'aria-label':`删除规则 ${index+1}`,onClick:()=>{setRows(old=>old.filter(item=>item.id!==row.id));setTestResult(undefined);action.setNotice('');}},'删除'))))))):h('p',{className:'ts-note'},'暂无自定义规则，将使用内置站点识别。'),
              h(Field,{label:'用一个网址试一下',hint:'使用当前编辑的规则和已保存的黑名单；规则保存前即可试用。'},h('div',{className:'ts-inline'},h('input',{value:testURL,disabled:busy,onChange:e=>{setTestURL(e.target.value);setTestResult(undefined);},placeholder:'https://example.com/thread/123'}),h(Button,{disabled:busy||!testURL.trim(),onClick:()=>action.run(signal=>request(null,{action:'normalize',url:testURL.trim(),rules:rulesValue()},signal),value=>setTestResult(value.value))},'试一下'))),
              testResult===null?h(Notice,null,'这个网址会被过滤，不会加入线索。'):testResult?h('dl',{className:'ts-detail'},...[["label","名称"],["kind","类型"],["key","归并标识"],["url","网址"]].flatMap(([key,label])=>[h('dt',{key:key+'-label'},label),h('dd',{key},testResult[key] || '—')])):null),
            h('div',{className:'ts-bar'},h('span',{className:'ts-note'},dirty?'有未保存的修改。':'设置与已保存内容一致。'),h(Button,{type:'submit',primary:true,disabled:busy||!dirty},action.busy?'正在处理…':'保存设置'))):null);
      }

      ctx.effect(()=>{
        const style=document.createElement('style');style.dataset.dshTrailSearch='';style.textContent=CSS;document.head.appendChild(style);
        return ()=>style.remove();
      },'trail-search: styles');
      ctx.effect(()=>ctx.sidebarRightTabs.register({id:'dsh-trail-search',kind:'trail-search',title:()=> '线索',guide:[{id:'trail-search',commandId:'trail-search.open',order:60,title:()=> '线索',description:()=> '查看与继续搜索'}]}),'trail-search: sidebar tab');
      ctx.effect(()=>ctx.slots.inject('sidebar.right.pane.tab',()=>ctx.slots.register({name:'sidebar.right.pane.tab',key:'dsh-trail-search',inject:sessionId=>({sessionId})},TrailPanel)),'trail-search: panel');
      ctx.effect(()=>ctx.slots.inject('sidebar.right.pane.tab.title',()=>ctx.slots.register({name:'sidebar.right.pane.tab.title',key:'dsh-trail-search'},()=>h('span',null,'线索'))),'trail-search: title');
      ctx.effect(()=>ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'trail-search',order:80,label:()=> '线索搜索'},SettingsView)),'trail-search: settings');
    }
    return {inject:['slots','sidebarRightTabs','sidebarRight'],apply};
  }
});
