import { identity } from './helpers.js';
export default function tieba(url) {
  const match = /^\/p\/(\d+)(?:\/|$)/.exec(url.pathname);
  return url.hostname === 'tieba.baidu.com' && match ? identity(`tieba:${match[1]}`, 'forum-thread', `贴吧 ${match[1]}`) : null;
}
