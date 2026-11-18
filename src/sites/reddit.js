import { identity } from './helpers.js';
export default function reddit(url) {
  let match;
  if (url.hostname === 'redd.it' && (match = /^\/([a-z0-9]+)\/?$/i.exec(url.pathname))) return identity(`reddit:${match[1].toLowerCase()}`, 'forum-thread', `Reddit ${match[1]}`);
  if (!['reddit.com','old.reddit.com','np.reddit.com'].includes(url.hostname)) return null;
  if ((match = /^\/r\/([^/]+)\/comments\/([a-z0-9]+)(?:\/|$)/i.exec(url.pathname))) return identity(`reddit:${match[2].toLowerCase()}`, 'forum-thread', `r/${match[1]} / ${match[2]}`);
  if ((match = /^\/r\/([^/]+)\/?$/i.exec(url.pathname))) return identity(`reddit-sub:${match[1].toLowerCase()}`, 'forum-board', `r/${match[1]}`);
  return null;
}
