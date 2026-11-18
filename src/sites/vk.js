import { identity, segments } from './helpers.js';
export default function vk(url) {
  if (url.hostname !== 'vk.com') return null;
  const [name] = segments(url), post = /^wall(-?\d+_\d+)$/.exec(name ?? '');
  if (post) return identity(`vk-post:${post[1]}`, 'vk-post', name);
  return name && !['feed','im','search','away.php','login','join','settings','video','clips','audio','share.php'].includes(name.toLowerCase())
    ? identity(`vk:${name.toLowerCase()}`, 'vk-page', name) : null;
}
