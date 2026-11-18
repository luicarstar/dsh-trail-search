export function canonicalHost(host) { return host.toLowerCase().replace(/^(?:www|m|mobile)\./, ''); }
export function compileUserRules(rules = []) {
  if (!Array.isArray(rules)) throw new TypeError('用户站点规则必须是数组');
  return rules.map((rule,index) => {
    const name = rule?.name || `规则 ${index+1}`;
    if (!rule || typeof rule.host !== 'string' || !rule.host || /[\s/:?#]/.test(rule.host)) throw new Error(`${name}: host 格式不正确`);
    if (rule.kind !== undefined && !/^[a-z][a-z0-9-]{0,63}$/.test(rule.kind)) throw new Error(`${name}: kind 格式不正确`);
    if (rule.key !== undefined && typeof rule.key !== 'string') throw new Error(`${name}: key 必须是字符串`);
    if (rule.pattern !== undefined && typeof rule.pattern !== 'string') throw new Error(`${name}: pattern 必须是正则字符串`);
    let regex;
    try { if (rule.pattern) regex = new RegExp(rule.pattern); } catch (error) { throw new Error(`${name}: 正则 pattern 无效 (${error.message})`); }
    return { ...rule, host: canonicalHost(rule.host), regex };
  });
}
export function matchUserRule(url, rules) {
  const input = url.pathname + url.search;
  if (input.length > 2048) return null;
  for (const rule of rules) {
    if (url.hostname !== rule.host) continue;
    const match = rule.regex ? rule.regex.exec(input) : [''];
    if (!match) continue;
    const key = rule.key?.replace(/\$(\d+)/g, (_,i) => match[Number(i)] ?? '');
    return { ...(key ? { key } : {}), label: rule.name || url.hostname, kind: rule.kind || 'web' };
  }
  return null;
}
