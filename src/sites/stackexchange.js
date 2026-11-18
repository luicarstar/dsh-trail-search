import { identity } from './helpers.js';
export default function stackexchange(url) {
  if (!['stackoverflow.com','superuser.com','serverfault.com','askubuntu.com','mathoverflow.net','stackapps.com'].includes(url.hostname) && !url.hostname.endsWith('.stackexchange.com')) return null;
  const match = /^\/(questions|a)\/(\d+)(?:\/|$)/.exec(url.pathname);
  return match ? identity(`se:${url.hostname}:${match[1] === 'a' ? 'a' : 'q'}${match[2]}`, match[1] === 'a' ? 'qa-answer' : 'qa-question', `${url.hostname} / ${match[2]}`) : null;
}
