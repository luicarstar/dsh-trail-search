export function describeAccess(node,{capabilities={},skills=[]}={}){
  let access=['fetch','read_page','browser'],skill='trail-general',previewUrl;
  if(node.kind==='directory')skill='trail-directory';
  else if(node.kind==='forum-thread'){skill='trail-forum-thread';if(node.key?.startsWith('tieba:'))access=['harvest','fetch'];}
  else if(node.kind?.startsWith('github-')||node.kind==='code-repo')skill='trail-github';
  else if(node.kind?.startsWith('qa-'))skill='trail-qa';
  else if(node.kind?.startsWith('zhihu-')){skill='trail-qa';access=['harvest','fetch','browser'];}
  else if(node.kind?.startsWith('x-')){skill='trail-social';access=['harvest','x_search','browser'];}
  else if(node.kind?.startsWith('vk-')){skill='trail-social';access=['fetch','browser'];}
  else if(node.kind==='telegram-channel'){skill='trail-telegram';access=['fetch','browser'];previewUrl='https://t.me/s/'+node.key?.slice(3);}
  else if(['telegram-invite','chat-invite'].includes(node.kind))access=[];
  else if(node.kind==='search')access=['web_search'];
  const custom='trail-'+node.kind;if(skills.includes(custom))skill=custom;
  const fields={fetch:'fetch',read_page:'readPage',browser:'browser',harvest:'harvest',x_search:'xSearch',web_search:'webSearch'};
  const site=node.key?.startsWith('tieba:')?'tieba':node.kind?.startsWith('zhihu-')?'zhihu':node.kind?.startsWith('x-')?'x':node.key?.startsWith('bili:')?'bili':null;
  const available=access.filter(method=>capabilities[fields[method]]!==false&&(method!=='harvest'||!capabilities.harvestSites||Boolean(site&&capabilities.harvestSites[site])));
  const missing=access.filter(method=>!available.includes(method));
  const cliHint=capabilities.cliFetch?'普通 fetch 优先加载 web-fetch-cli Skill，通过执行工具调用 '+capabilities.cliPath+'；CLI不是模型工具。':'';
  const hint=cliHint+`类型 ${node.kind}；若存在 ${skill} Skill，先加载它。建议顺序：${available.join(' → ')||'无可用访问工具'}。${previewUrl?'公开频道预览 '+previewUrl+'。':''}${missing.length?'缺少/停用：'+missing.join('、')+'。':''}${node.kind?.startsWith('github-')?'可先用无凭据 GitHub API；达到匿名配额后降级到页面。':''}遇到登录、验证码或地域限制请回报 blocked。使用 browser_* 前先领取 trail_browser_lease，完成后释放。只交回 STATUS/SUMMARY/FOUND/NEW 格式回报。`;
  return {access:available,skill,hint,...(previewUrl?{previewUrl}:{}),...(missing.length?{missing}: {})};
}
