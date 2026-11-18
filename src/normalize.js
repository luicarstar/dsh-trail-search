import { siteRules } from './sites/index.js';
import { canonicalHost, compileUserRules, matchUserRule } from './sites-user.js';
import { classifyDirectory } from './classify.js';

const shortHosts = new Set(['t.co','bit.ly','goo.gl','url.cn','t.cn','b23.tv']);
const tracking = /^(?:utm_.+|fbclid|gclid|spm|from|share_.+|si|ref|_t|timestamp)$/i;
const credential = /^(?:access_?token|refresh_?token|token|authorization|cookie|api[_-]?key|secret|password)$/i;
function extract(text) {
  if (typeof text !== 'string') return null;
  let value = text.trim();
  if (value.length > 2048) return null;
  const markdown = /^\[[^\]]*\]\((https?:\/\/[^\s]+)\)$/.exec(value);
  if (markdown) value = markdown[1];
  return value.replace(/^<(.+)>$/, '$1');
}
function parse(input) {
  try {
    let url = new URL(input);
    if (url.protocol === 'tg:' && url.hostname === 'resolve' && url.searchParams.get('domain')) url = new URL('https://t.me/' + encodeURIComponent(url.searchParams.get('domain')));
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password) return null;
    for (let i=0; i<5; i++) {
      const host = canonicalHost(url.hostname);
      const parameter = host === 'link.zhihu.com' ? 'target' : host === 'google.com' && url.pathname === '/url' ? (url.searchParams.has('q') ? 'q' : 'url') : host === 'l.facebook.com' && url.pathname === '/l.php' ? 'u' : host === 'vk.com' && url.pathname === '/away.php' ? 'to' : null;
      const target = parameter && url.searchParams.get(parameter);
      if (!target) break;
      const next = new URL(target);
      if (!['https:','http:'].includes(next.protocol) || next.username || next.password || next.href.length > 2048) return null;
      url = next;
    }
    url.hostname = canonicalHost(url.hostname);
    url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
    return url;
  } catch { return null; }
}
function blocked(value, host, blacklist = []) {
  return blacklist.some(entry => {
    if (typeof entry !== 'string' || !entry.trim()) return false;
    const pattern = entry.trim();
    if (pattern.includes(':') || pattern.includes('/')) return value.key.startsWith(pattern);
    const name = canonicalHost(pattern.replace(/^\*\./,''));
    return host === name || host.endsWith('.' + name);
  });
}
export function normalizeSync(text, options = {}) {
  const rules = compileUserRules(options.rules ?? []);
  const input = extract(text);
  if (!input) return null;
  if (/^search:/i.test(input)) {
    const query = input.slice(7).trim().replace(/\s+/g,' ');
    if (!query) return null;
    const result = { key: 'search:' + query.toLowerCase(), label: query, kind:'search', url:'search:' + query };
    return blocked(result,'',options.blacklist) ? null : result;
  }
  const url = parse(input);
  if (!url) return null;
  let result = matchUserRule(url,rules);
  if (!result) for (const rule of siteRules) { result = rule(url); if (result) break; }
  if (!result && (/\.(?:png|jpe?g|gif|svg|webp|css|m?js|woff2?|ico)(?:$|\/)/i.test(url.pathname) || /(?:^|[\/._-])(?:login|signin|register|signup|share|print)(?:$|[\/._-])/i.test(url.pathname))) return null;
  for (const name of [...url.searchParams.keys()]) if (credential.test(name) || tracking.test(name) && !result?.keepParams?.includes(name)) url.searchParams.delete(name);
  url.searchParams.sort();
  if (!result?.preserveFragment) url.hash = '';
  const path = url.pathname === '/' ? '' : url.pathname;
  const key = result?.key || `${url.host}${path}${url.search}`;
  const kind = result?.kind || (/\.(?:pdf|zip|rar|7z|apk|exe)$/i.test(path) ? 'file' : classifyDirectory({url:path}) ? 'directory' : 'web');
  const value = { key, label: result?.label || `${url.hostname}${path}`, kind, url:url.href };
  return blocked(value,url.hostname,options.blacklist) ? null : value;
}
export async function normalize(text, options = {}) {
  const value = normalizeSync(text,options);
  if (!value || options.resolveShortLinks === false || value.kind === 'search' || !shortHosts.has(new URL(value.url).hostname)) return value;
  try {
    const response = await (options.fetch ?? globalThis.fetch)(value.url, { method:'HEAD', redirect:'follow', signal:AbortSignal.timeout(5000) });
    const target = response.url || response.headers?.get?.('location');
    if (target) return normalizeSync(new URL(target,value.url).href,options) ?? value;
  } catch { /* An unresolved short link remains a usable lead. */ }
  return value;
}
