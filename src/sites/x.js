import { identity, segments } from './helpers.js';
const reserved = new Set(['home','search','i','hashtag','explore','notifications','messages','settings','intent','share','login','signup','compose','tos','privacy','about','jobs']);
export default function x(url) {
  if (!['x.com','twitter.com'].includes(url.hostname)) return null;
  const [user,status,id] = segments(url);
  if (!user || reserved.has(user.toLowerCase()) || !/^[a-z0-9_]{1,15}$/i.test(user)) return null;
  if (status === 'status' && /^\d+$/.test(id ?? '')) return identity(`x-post:${id}`, 'x-post', `@${user} / ${id}`);
  return status === undefined ? identity(`x:${user.toLowerCase()}`, 'x-user', `@${user}`) : null;
}
