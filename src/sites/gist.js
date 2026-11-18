import { identity, segments } from './helpers.js';
export default function gist(url) {
  const [owner,id] = segments(url);
  return url.hostname === 'gist.github.com' && owner && /^[a-f0-9]+$/i.test(id ?? '')
    ? identity(`gist:${id.toLowerCase()}`, 'github-gist', `${owner}/${id}`) : null;
}
