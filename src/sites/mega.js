import { identity } from './helpers.js';
export default function mega(url) {
  if (!['mega.nz','mega.co.nz'].includes(url.hostname)) return null;
  const match = /^\/(?:file|folder)\/([a-z0-9_-]+)/i.exec(url.pathname) ?? /^#(?:F)?!([a-z0-9_-]+)/.exec(url.hash);
  return match ? identity(`mega:${match[1]}`, 'file-share', `MEGA ${match[1]}`, { preserveFragment: true }) : null;
}
