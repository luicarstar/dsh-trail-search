import { identity, segments } from './helpers.js';
const reserved = new Set(['topics','orgs','search','settings','login','logout','signup','join','features','marketplace','explore','collections','sponsors','about','pricing','enterprise','organizations','notifications','pulls','issues','codespaces','discussions','apps','new','contact','security','site','sessions','share']);
export default function github(url) {
  if (url.hostname !== 'github.com') return null;
  const [owner, repo] = segments(url);
  if (!owner || reserved.has(owner.toLowerCase())) return null;
  return repo
    ? identity(`github:${owner.toLowerCase()}/${repo.replace(/\.git$/i,'').toLowerCase()}`, 'github-repo', `${owner}/${repo.replace(/\.git$/i,'')}`)
    : identity(`github-user:${owner.toLowerCase()}`, 'github-user', owner);
}
