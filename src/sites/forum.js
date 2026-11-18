import { identity } from './helpers.js';
export default function forum(url) {
  let id, match;
  if ((match = /^\/thread-(\d+)-\d+-\d+\.html$/i.exec(url.pathname))) id = match[1];
  else if (url.pathname.endsWith('/forum.php') && url.searchParams.get('mod') === 'viewthread') id = url.searchParams.get('tid');
  else if (url.pathname.endsWith('/viewtopic.php')) id = url.searchParams.get('t');
  else if ((url.hostname === 'nga.cn' || url.hostname.endsWith('.nga.cn') || ['ngabbs.com','nga.178.com'].includes(url.hostname)) && url.pathname.endsWith('/read.php')) id = url.searchParams.get('tid');
  else if (url.hostname === 'v2ex.com' && (match = /^\/t\/(\d+)(?:\/|$)/.exec(url.pathname))) id = match[1];
  else if ((match = /^\/t\/[^/]+\/(\d+)(?:\/|$)/.exec(url.pathname))) id = match[1];
  return /^\d+$/.test(id ?? '') ? identity(`${url.hostname}:t${id}`, 'forum-thread', `${url.hostname} / ${id}`) : null;
}
