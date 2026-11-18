import { identity } from './helpers.js';
export default function aliyunDrive(url) {
  const match = /^\/s\/([a-z0-9_-]+)(?:\/|$)/i.exec(url.pathname);
  return ['aliyundrive.com','alipan.com'].includes(url.hostname) && match ? identity(`aliyun:${match[1]}`, 'file-share', `阿里云盘 ${match[1]}`) : null;
}
