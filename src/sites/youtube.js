import { identity, segments } from './helpers.js';
export default function youtube(url) {
  let id;
  const [first,second] = segments(url);
  if (url.hostname === 'youtu.be') id = first;
  else if (url.hostname === 'youtube.com') id = first === 'watch' ? url.searchParams.get('v') : ['shorts','embed','live'].includes(first) ? second : null;
  return /^[a-z0-9_-]{11}$/i.test(id ?? '') ? identity(`yt:${id}`, 'video', `YouTube ${id}`) : null;
}
