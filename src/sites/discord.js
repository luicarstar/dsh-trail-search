import { identity, segments } from './helpers.js';
export default function discord(url) {
  const parts = segments(url), code = url.hostname === 'discord.gg' ? parts[0] : url.hostname === 'discord.com' && parts[0] === 'invite' ? parts[1] : null;
  return code && /^[a-z0-9_-]+$/i.test(code) ? identity(`discord-invite:${code}`, 'chat-invite', `Discord ${code}`) : null;
}
