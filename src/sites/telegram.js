import { identity, segments } from './helpers.js';
export default function telegram(url) {
  if (!['t.me','telegram.me'].includes(url.hostname)) return null;
  const parts = segments(url), [first,second] = parts;
  if (first?.startsWith('+') && first.length > 1) return identity(`tg-invite:${first.slice(1)}`, 'telegram-invite', first);
  if (first === 'joinchat' && second) return identity(`tg-invite:${second}`, 'telegram-invite', second);
  const name = first === 's' ? second : first;
  if (!name || ['share','addstickers','proxy','socks','login','iv','c','s'].includes(name.toLowerCase()) || !/^[a-z0-9_]+$/i.test(name)) return null;
  return identity(`tg:${name.toLowerCase()}`, 'telegram-channel', `@${name}`);
}
