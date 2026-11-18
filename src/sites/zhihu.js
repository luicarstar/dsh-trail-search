import { identity } from './helpers.js';
export default function zhihu(url) {
  let match;
  if (url.hostname === 'zhihu.com' && (match = /^\/question\/(\d+)(?:\/answer\/(\d+))?(?:\/|$)/.exec(url.pathname))) {
    return match[2] ? identity(`zhihu-a:${match[2]}`, 'zhihu-answer', `知乎回答 ${match[2]}`) : identity(`zhihu-q:${match[1]}`, 'zhihu-question', `知乎问题 ${match[1]}`);
  }
  if (url.hostname === 'zhuanlan.zhihu.com' && (match = /^\/p\/(\d+)(?:\/|$)/.exec(url.pathname))) return identity(`zhihu-p:${match[1]}`, 'zhihu-article', `知乎文章 ${match[1]}`);
  return null;
}
