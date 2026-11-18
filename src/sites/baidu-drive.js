import { identity } from './helpers.js';
export default function baiduDrive(url) {
  const match = /^\/s\/([a-z0-9_-]+)(?:\/|$)/i.exec(url.pathname);
  return url.hostname === 'pan.baidu.com' && match ? identity(`baidu:${match[1]}`, 'file-share', `百度网盘 ${match[1]}`) : null;
}
