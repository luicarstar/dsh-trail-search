export const identity = (key, kind, label, extra = {}) => ({ key, kind, label, ...extra });
export const segments = url => url.pathname.split('/').filter(Boolean);
export function codeRepo(url, host, site) {
  if (url.hostname !== host) return null;
  const [owner, repo] = segments(url);
  if (!owner || !repo || ['explore','search','help','users','dashboard','admin','projects','groups','org'].includes(owner.toLowerCase())) return null;
  const name = `${owner}/${repo.replace(/\.git$/i, '')}`;
  return identity(`${site}:${name.toLowerCase()}`, 'code-repo', name);
}
