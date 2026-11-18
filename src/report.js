export function redactText(value) {
  return String(value ?? '')
    .replace(/^(\s*(?:[-*]\s*)?(?:cookie|set-cookie|authorization|proxy-authorization)\s*[:：]).*$/gim, '$1 [redacted]')
    .replace(/([?&](?:access_?token|refresh_?token|token|api[_-]?key|secret|password|cookie)=)[^\s&#)]+/gi, '$1[redacted]')
    .replace(/\b((?:access_?token|refresh_?token|api[_-]?key|password|secret)\s*[=:：]\s*)["']?[^\s"',;]+/gi, '$1[redacted]');
}
export function conciseSummary(text) {
  const clean = String(text ?? '').trim().replace(/\s+/g, ' ');
  return (clean.match(/[^。！？.!?]+[。！？.!?]*/g) ?? []).slice(0,3).join('').slice(0,600).trim();
}
export function parseReport(text, { kind } = {}) {
  const raw = redactText(text);
  const output = { status:null, summary:'', items:[], omitted:0, raw };
  let section = '', summaries = [], items = [];
  for (const line of raw.split(/\r?\n/)) {
    const clean = line.trim().replace(/^(?:[-*+]\s+)+/, '');
    const match = /^(STATUS|BLOCKED|KIND|SUMMARY|FOUND|NEW)\s*[:：]\s*(.*)$/i.exec(clean);
    if (!match) {
      if (section === 'SUMMARY' && clean) summaries.push(clean);
      continue;
    }
    const field = match[1].toUpperCase(), value = match[2].trim();
    section = field;
    if (field === 'STATUS') {
      const status = value.toLowerCase().split(/\s+/)[0];
      if (['useful','useless','blocked'].includes(status)) output.status = status;
    } else if (field === 'BLOCKED') {
      const reason = value.toLowerCase().split(/\s+/)[0];
      if (['login','captcha','geo','dead','other'].includes(reason)) output.blockedReason = reason;
    } else if (field === 'KIND') {
      if (/^[a-z][a-z0-9-]{0,63}$/i.test(value)) output.kind = value.toLowerCase();
    } else if (field === 'SUMMARY') summaries = value ? [value] : [];
    else if (field === 'NEW') {
      const [url,second,...rest] = value.split(/\s*[|｜]\s*/);
      if (!url) continue;
      const explicit = /^[1-5](?:\.0)?$/.test(second ?? '');
      items.push({ url:url.replace(/^<(.+)>$/,'$1'), priority:explicit ? Number(second) : 3, reason:(explicit ? rest.join(' | ') : [second,...rest].filter(Boolean).join(' | ')).slice(0,1000), order:items.length });
    }
  }
  output.summary = conciseSummary(summaries.join(' '));
  if (output.status === 'blocked' && !output.blockedReason) output.blockedReason = 'other';
  const cap = (output.kind ?? kind) === 'directory' ? 200 : 50;
  if (items.length > cap) {
    output.omitted = items.length - cap;
    items = items.sort((a,b) => b.priority-a.priority || a.order-b.order).slice(0,cap);
  }
  output.items = items.map(({order,...item}) => item);
  if (!output.status) output.warning = '回报格式不符：未找到有效 STATUS；已保存原文，节点标为 done。';
  return output;
}
