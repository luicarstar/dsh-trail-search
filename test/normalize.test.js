import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('../src/normalize.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
async function norm(url, options = {}) {
  assert.equal(typeof module.normalize, 'function', 'normalization implementation is missing');
  return module.normalize(url, { resolveShortLinks: false, ...options });
}
// Each row has three real shapes and two nearby URLs that must not get this identity.
const groups = [
  ['github-repo', [['https://github.com/OpenAI/Codex','github:openai/codex'],['https://github.com/openai/codex/issues/12','github:openai/codex'],['https://github.com/openai/codex/tree/main','github:openai/codex']], ['https://github.com/topics/python','https://github.com/search?q=codex']],
  ['github-user', [['https://github.com/OpenAI','github-user:openai'],['https://github.com/octocat/','github-user:octocat'],['https://github.com/torvalds?tab=repositories','github-user:torvalds']], ['https://github.com/settings','https://github.com/orgs']],
  ['github-gist', [['https://gist.github.com/user/abc123','gist:abc123'],['https://gist.github.com/alice/123456/revisions','gist:123456'],['https://gist.github.com/bob/abcdef#file-x','gist:abcdef']], ['https://gist.github.com/discover','https://github.com/user/abc123']],
  ['code-repo', [['https://gitlab.com/a/b/-/issues/1','gitlab:a/b'],['https://gitee.com/a/B','gitee:a/b'],['https://codeberg.org/A/b/src/branch/main','codeberg:a/b']], ['https://gitlab.com/explore/projects','https://gitee.com/search?q=x']],
  ['telegram-channel', [['https://t.me/s/ExampleChannel','tg:examplechannel'],['https://telegram.me/ExampleChannel/123','tg:examplechannel'],['tg://resolve?domain=ExampleChannel','tg:examplechannel']], ['https://t.me/+AbCd','https://t.me/joinchat/AbCd']],
  ['telegram-invite', [['https://t.me/+AbCd','tg-invite:AbCd'],['https://t.me/joinchat/aBcD','tg-invite:aBcD'],['https://telegram.me/+xYz','tg-invite:xYz']], ['https://t.me/channel','https://t.me/s/channel']],
  ['x-user', [['https://twitter.com/OpenAI','x:openai'],['https://x.com/Example_1/','x:example_1'],['https://mobile.twitter.com/USER','x:user']], ['https://x.com/home','https://x.com/hashtag/test']],
  ['x-post', [['https://x.com/user/status/123','x-post:123'],['https://twitter.com/user/status/456/photo/1','x-post:456'],['https://mobile.twitter.com/a/status/789?ref=home','x-post:789']], ['https://x.com/i/flow','https://x.com/user']],
  ['vk', [['https://vk.com/Example','vk:example'],['https://vk.com/wall-123_456','vk-post:-123_456'],['https://m.vk.com/wall123_789','vk-post:123_789']], ['https://vk.com/feed','https://vk.com/away.php?to=https%3A%2F%2Fexample.org']],
  ['zhihu', [['https://www.zhihu.com/question/123','zhihu-q:123'],['https://zhihu.com/question/123/answer/456','zhihu-a:456'],['https://zhuanlan.zhihu.com/p/789','zhihu-p:789']], ['https://zhihu.com/people/alice','https://zhuanlan.zhihu.com/alice']],
  ['stack-exchange', [['https://stackoverflow.com/questions/123/title','se:stackoverflow.com:q123'],['https://superuser.com/a/456','se:superuser.com:a456'],['https://unix.stackexchange.com/questions/789/title','se:unix.stackexchange.com:q789']], ['https://stackoverflow.com/users/1','https://example.com/questions/123']],
  ['reddit-thread', [['https://reddit.com/r/test/comments/abc/title','reddit:abc'],['https://old.reddit.com/r/test/comments/def/title/ghi','reddit:def'],['https://redd.it/xyz','reddit:xyz']], ['https://reddit.com/r/test','https://reddit.com/user/test']],
  ['reddit-board', [['https://reddit.com/r/Test','reddit-sub:test'],['https://www.reddit.com/r/Programming/','reddit-sub:programming'],['https://old.reddit.com/r/Python?sort=new','reddit-sub:python']], ['https://reddit.com/r/test/comments/abc','https://reddit.com/user/test']],
  ['tieba', [['https://tieba.baidu.com/p/123','tieba:123'],['https://tieba.baidu.com/p/456?pn=2','tieba:456'],['https://tieba.baidu.com/p/789#123','tieba:789']], ['https://tieba.baidu.com/f?kw=x','https://example.com/p/123']],
  ['bilibili', [['https://www.bilibili.com/video/BV17x411w7KC','bili:BV17x411w7KC'],['https://bilibili.com/video/av170001','bili:BV17x411w7KC'],['https://m.bilibili.com/video/BV1xx411c7mD?p=2','bili:BV1xx411c7mD']], ['https://bilibili.com/read/cv123','https://bilibili.com/video/not-a-video']],
  ['youtube', [['https://youtube.com/watch?v=abcdefghi12','yt:abcdefghi12'],['https://youtu.be/abcdefghijk?t=12','yt:abcdefghijk'],['https://youtube.com/shorts/123456789ab','yt:123456789ab']], ['https://youtube.com/@user','https://example.com/watch?v=abcdefghi12']],
  ['discord', [['https://discord.gg/AbCd','discord-invite:AbCd'],['https://discord.com/invite/aBcD','discord-invite:aBcD'],['https://www.discord.gg/xYz','discord-invite:xYz']], ['https://discord.com/channels/@me','https://discord.com/developers']],
  ['file-share', [['https://pan.baidu.com/s/1AbCd','baidu:1AbCd'],['https://mega.nz/file/ABC#decryption-key','mega:ABC'],['https://drive.google.com/file/d/XYZ/view','gdrive:XYZ']], ['https://drive.google.com/','https://pan.baidu.com/disk/home']],
  ['forum-thread', [['https://bbs.example.com/thread-123-2-1.html','bbs.example.com:t123'],['https://bbs.example.com/forum.php?mod=viewthread&tid=456&page=3','bbs.example.com:t456'],['https://forum.example.com/viewtopic.php?t=789&start=10','forum.example.com:t789']], ['https://example.com/thread-not-a-number','https://example.com/forum.php?mod=forumdisplay&fid=1']],
  ['forum-thread-more', [['https://linux.do/t/title/123/4','linux.do:t123'],['https://bbs.nga.cn/read.php?tid=456&page=2','bbs.nga.cn:t456'],['https://www.v2ex.com/t/789?p=2','v2ex.com:t789']], ['https://v2ex.com/go/python','https://linux.do/c/develop/1']],
];
for (const [group, positives, negatives] of groups) {
  const keys = new Set(positives.map(([, key]) => key));
  for (const [url, key] of positives) test(`${group}: ${url}`, async () => assert.equal((await norm(url))?.key, key));
  for (const url of negatives) test(`${group} excludes ${url}`, async () => assert.ok(!keys.has((await norm(url))?.key)));
}
for (const url of ['mailto:a@example.com','javascript:void(0)','tel:123','#section','https://example.com/a.png','https://example.com/app.js','https://example.com/signin','https://example.com/share']) {
  test(`discard ${url}`, async () => assert.equal(await norm(url), null));
}
test('generic canonicalization removes tracking and sorts remaining parameters', async () => {
  const value = await norm('https://WWW.Example.COM/a//b/?z=2&utm_source=x&b=3&ref=x#top');
  assert.equal(value.key, 'example.com/a/b?b=3&z=2');
});
test('search seeds retain search text', async () => assert.equal((await norm('search:  Open source  tools ')).key, 'search:open source tools'));
test('embedded redirect target is unwrapped', async () => assert.equal((await norm('https://link.zhihu.com/?target=https%3A%2F%2Fgithub.com%2FA%2FB')).key, 'github:a/b'));
test('Google and Facebook and VK redirect targets are unwrapped', async () => {
  for (const url of ['https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fa','https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2Fa','https://vk.com/away.php?to=https%3A%2F%2Fexample.com%2Fa']) assert.equal((await norm(url)).key, 'example.com/a');
});
test('shortlink HEAD follows redirect and only runs once', async () => {
  let calls = 0;
  const value = await norm('https://b23.tv/abcd', { resolveShortLinks:true, fetch:async (url, options) => { calls++; assert.equal(options.method,'HEAD'); return {url:'https://www.bilibili.com/video/BV17x411w7KC'}; } });
  assert.equal(value.key,'bili:BV17x411w7KC'); assert.equal(calls,1);
});
test('failed shortlink resolution preserves link identity', async () => assert.equal((await norm('https://t.co/abcd',{resolveShortLinks:true,fetch:async()=>{throw Error('offline');}})).key,'t.co/abcd'));
test('user rules precede site rules and can override a discarded page', async () => {
  const rules=[{name:'custom',host:'github.com',pattern:'^/([^/]+)/([^/?]+)',key:'custom:$1/$2',kind:'directory'},{name:'login directory',host:'nav.example.com',kind:'directory'}];
  assert.equal((await norm('https://github.com/A/B',{rules})).key,'custom:A/B');
  assert.equal((await norm('https://nav.example.com/login',{rules})).kind,'directory');
});
test('invalid user pattern produces an actionable error', async () => assert.rejects(()=>norm('https://example.com',{rules:[{name:'bad',host:'example.com',pattern:'['}]}),/bad|pattern|正则/));
test('blacklists use host and key prefix', async () => {
  assert.equal(await norm('https://github.com/A/B',{blacklist:['github:a/']}),null);
  assert.equal(await norm('https://sub.example.com/a',{blacklist:['example.com']}),null);
});
test('download files retained and Mega link fragment preserved', async () => {
  for (const extension of ['pdf','zip','rar','7z','apk','exe']) assert.equal((await norm('https://example.com/file.'+extension)).kind,'file');
  assert.match((await norm('https://mega.nz/file/ABC#decryption-key')).url,/#decryption-key$/);
});
test('Aliyun and Google folder variants retain share identity', async () => {
  for (const url of ['https://alipan.com/s/ABC','https://www.aliyundrive.com/s/ABC']) assert.equal((await norm(url)).key,'aliyun:ABC');
  assert.equal((await norm('https://drive.google.com/drive/folders/ABC')).key,'gdrive:ABC');
});
