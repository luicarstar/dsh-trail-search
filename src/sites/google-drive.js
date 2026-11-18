import { identity } from './helpers.js';
export default function googleDrive(url) {
  if (url.hostname !== 'drive.google.com') return null;
  const match = /^\/(?:file\/d|drive\/(?:u\/\d+\/)?folders)\/([a-z0-9_-]+)/i.exec(url.pathname);
  const id = match?.[1] ?? (['/open','/uc'].includes(url.pathname) ? url.searchParams.get('id') : null);
  return id ? identity(`gdrive:${id}`, 'file-share', `Google Drive ${id}`) : null;
}
