import { identity } from './helpers.js';
// Same published AV/BV mapping used by the local bilibili-comments implementation.
const alphabet = 'FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf';
const positions = [8,7,0,5,1,3,2,4,6];
function avToBv(aid) {
  if (aid <= 0n || aid >= (1n << 51n)) return null;
  let value = ((1n << 51n) | aid) ^ 23442827791579n;
  const result = Array(9);
  for (let i = 0; i < 9; i++) { result[positions[i]] = alphabet[Number(value % 58n)]; value /= 58n; }
  return 'BV1' + result.join('');
}
export default function bilibili(url) {
  if (url.hostname !== 'bilibili.com') return null;
  const match = /^\/video\/(BV[1-9A-HJ-NP-Za-km-z]{10}|av\d+)(?:\/|$)/i.exec(url.pathname);
  if (!match) return null;
  const id = /^av/i.test(match[1]) ? avToBv(BigInt(match[1].slice(2))) : 'BV' + match[1].slice(2);
  return id ? identity(`bili:${id}`, 'video', id) : null;
}
