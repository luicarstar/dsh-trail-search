// Well-known credential shapes. These are matched by their own prefix rather than
// by a `name=value` keyword, because a leaked key pasted into a forum post has no
// surrounding field name. Order matters: longest prefixes first.
const TOKEN_PATTERNS = [
  // JSON Web Token: three base64url segments, first one is `{"` in base64url.
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  // OpenAI / Anthropic style keys.
  /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}/g,
  // GitHub tokens (classic + fine-grained + refresh).
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  // Slack.
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  // AWS access key id.
  /\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[A-Z0-9]{16}\b/g,
  // Google API key.
  /\bAIza[A-Za-z0-9_-]{35}\b/g,
  // Stripe.
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g,
  // GitLab personal access token.
  /\bglpat-[A-Za-z0-9_-]{20,}/g,
  // Telegram bot token: <bot id>:<secret>. Real secrets are 35 chars, accept 30+ so
  // truncated or variant lengths are still caught.
  /\b\d{8,10}:[A-Za-z0-9_-]{30,}/g,
  // npm token.
  /\bnpm_[A-Za-z0-9]{36}\b/g,
  // Hugging Face.
  /\bhf_[A-Za-z0-9]{30,}/g,
];
// Chinese field names carry no ASCII keyword, so the generic keyword rule misses them.
const CN_KEYWORDS = '密码|口令|密钥|令牌|凭据|私钥';
export function redactText(value) {
  let text = String(value ?? '')
    .replace(/^(\s*(?:[-*]\s*)?(?:cookie|set-cookie|authorization|proxy-authorization)\s*[:：]).*$/gim, '$1 [redacted]')
    .replace(/([?&](?:access_?token|refresh_?token|token|api[_-]?key|secret|password|cookie)=)[^\s&#)]+/gi, '$1[redacted]')
    .replace(/\b((?:access_?token|refresh_?token|api[_-]?key|password|secret)\s*[=:：]\s*)["']?[^\s"',;]+/gi, '$1[redacted]')
    // Same rule for Chinese field names: 密码是 xxx / 密码：xxx / 密钥为 xxx.
    .replace(new RegExp(`((?:${CN_KEYWORDS})\\s*(?:是|为|[:：=])\\s*)["'\`]?[^\\s"'\`,;，。；]+`,'g'), '$1[redacted]');
  for (const pattern of TOKEN_PATTERNS) text = text.replace(pattern, '[redacted]');
  return text;
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
