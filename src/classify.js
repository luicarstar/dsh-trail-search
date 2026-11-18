export function classifyDirectory({ url = '', title = '', links = [] } = {}) {
  if (/(?:\bnav\b|导航|awesome|\blinks\b|\bresources\b|目录|大全)/i.test(title + ' ' + url)) return true;
  let ownHost = '';
  try { ownHost = new URL(url).hostname; } catch {}
  const external = [];
  for (const link of links) {
    try { const value = new URL(link); if (['http:','https:'].includes(value.protocol) && value.hostname !== ownHost) external.push(value); } catch {}
  }
  return external.length >= 20 && new Set(external.map(x => x.hostname)).size >= 8;
}
