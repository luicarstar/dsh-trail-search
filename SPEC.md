# dsh-trail-search 实现规格 v1.0

> 交给实现方（Codex）的权威文档。UI 只规定功能与位置，视觉样式后续另行优化。
> MUST / SHOULD / MAY 区分强制、建议、可选。"待确认"项实现前先查证，查不到按"降级方案"做，并写进交付说明。
> 相关文档：委派插件规格 `E:/DSH/home/plugins/local/dsh-delegation-next/SPEC.md`（下称"委派规格"），尤其是 §3.3.2 队列循环阶段。

---

## 0. 目标

让 AI 在网上找东西时"顺藤摸瓜"，而不是只去百科：

> 在一个论坛找到线索 → 发现一个链接 → 跳过去，看到 Telegram 频道 / GitHub 仓库 / 知乎回答 / Stack Overflow / Twitter / VK → 继续挖 → 遇到导航站，把站上的链接全部列出，派子 Agent 一个个看、回报 → 再继续。

本插件**只负责和网站有关的事**：
1. 链接规范化与去重（同一个 GitHub 仓库的不同页面算一个，同一个 Telegram 频道算一个）。
2. 站点类型识别（论坛帖子、导航站、GitHub 仓库、Telegram 频道……）。
3. 线索地图：记录从哪跳到哪、每个站找到了什么，存盘、可续搜。
4. 给 Agent 用的工具：加线索、取下一批、交回报、看地图。
5. 站点打法：每种站点类型怎么看，用 Skill（Markdown）描述，用户可以自己加。

本插件**不负责**调度子 Agent、并行、预算、阶段流程——那些由委派插件的队列阶段负责。二者的接口是委派规格 §3.3.2 定义的 `QueueItemProvider`，本插件以服务名 `trailSearch` 提供它。

本插件也 MUST 能**单独使用**（不装委派插件）：单个 Agent 用本插件的工具自己循环搜。

---

## 1. 运行环境

| 项 | 值 |
|---|---|
| DSH_HOME | `E:/DSH/home`（CLI 前 `export DSH_HOME=E:/DSH/home`） |
| profile | `E:/DSH/home/profiles/desktop`，配置入口 `cordis.patch.yml` |
| 源码目录 | `E:/DSH/home/plugins/local/dsh-trail-search/` |
| 注册方式 | `profiles/desktop/package.json` 的 `dependencies` 加 `"dsh-trail-search": "link:E:/DSH/home/plugins/local/dsh-trail-search"`，`dsh.profile.bundles` 加 `"dsh-trail-search"` |
| 数据目录 | `$DSH_HOME/data/trail-search/` |
| 模块格式 | ESM；宿主 helper 包不可从链接目录解析，所需小工具自带（参照 `dsh-delegation-policy/index.js` 顶部写法） |

`package.json`：
```json
{
  "name": "dsh-trail-search",
  "type": "module",
  "exports": { ".": "./index.js", "./client": "./client.js" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "immediately": true }
  }
}
```
`cordis.patch.yml`：
```yaml
- insert:
    - id: trail-search
      name: dsh-trail-search
      disabled: true
```

---

## 2. 本机已有的、可以依赖的能力

| 能力 | 来源 | 本插件怎么用 |
|---|---|---|
| `web_search` / `web_fetch` / `read_page` | 宿主 + `@liustack/modsearch` | 侦察看公开页面的首选 |
| `browser_*`（真实已登录浏览器） | `@caob23/dsh-browser-control` | 需要登录的站（Telegram 网页版、VK、X、部分论坛）。**这个浏览器是用户日常使用的那个，同一时间只能安全地操作少量标签页** |
| `x_search` | modsearch | X/Twitter 搜索的备选 |
| site-harvest MCP（`bili_*` `xhs_*` `tieba_*` `x_*` `zhihu_*`） | `skills/site-harvest` | 这些站点有结构化接口时优先用它，比浏览器稳 |
| 子 Agent | 宿主 `subagent` | 单独使用模式下由 Agent 自己派；配合委派插件时由队列阶段派 |
| 跨插件服务 | `ctx.provide(name, impl)` / `ctx.get(name)` | 向委派插件提供 `trailSearch` |
| Skill 加载 | 宿主 skill 机制，Skill 目录 `$DSH_HOME/skills/` | 站点打法 |

**待确认**：插件能否在运行时读取当前会话可用的工具列表（用于判断 `browser_*`、site-harvest 是否可用）。查法：搜已安装插件中 `tools.list`、`tools/change` 事件（本机有插件监听 `tools/change`）。降级方案：在设置里让用户手动勾选"浏览器可用 / site-harvest 可用"。

---

## 3. 核心数据

### 3.1 Trail（一次搜索）

```
$DSH_HOME/data/trail-search/trails/<trailId>/
  trail.json      元数据：目标描述、创建时间、状态、所属会话、配置快照
  nodes.jsonl     线索节点，追加写
  edges.jsonl     发现关系，追加写
  results/<nodeId>.md   每个节点的查看结果
  map.md          可读的线索地图（由插件生成，不调模型）
```
`trailId = <yyyyMMdd-HHmmss>-<目标前 20 字的 slug>`。

配合委派插件运行时，委派插件的 run 目录里另有 `queue.json` 与 `items/`；本插件 MUST 把同一个 trail 关联到 run（`trail.json` 记录 `runId`），结果文件不重复存：`results/<nodeId>.md` 可以是指向 run 目录 `items/<id>.md` 的引用（在 `trail.json` 里记 `resultsDir`），二选一，实现方决定并写进交付说明。

### 3.2 Node（线索）

```jsonc
{
  "id": "n42",
  "key": "github:owner/repo",       // 规范化后的去重键，见 §4
  "url": "https://github.com/owner/repo/issues/12",   // 首次发现时的原始网址
  "label": "owner/repo",
  "kind": "github-repo",            // 站点类型，见 §5
  "depth": 2,
  "priority": 4,                    // 1-5，越大越先
  "status": "pending" | "running" | "done" | "skipped" | "blocked",
  "verdict"?: "useful" | "useless",
  "blockedReason"?: "login" | "captcha" | "geo" | "dead" | "other",
  "foundBy": "n17",                 // 发现它的节点；种子为 null
  "reason": "回帖里给出的项目主页",  // 为什么值得看
  "summary"?: "……",                // 查看后的三句话摘要
  "access"?: "fetch" | "browser" | "harvest",          // 实际用什么方式看的
  "createdAt": "...", "updatedAt": "..."
}
```

同一个 `key` 再次被发现时：不新建节点，只追加一条 edge，并且（若新 `priority` 更高）提升优先级。

### 3.3 Edge

```jsonc
{ "from": "n17", "to": "n42", "url": "<发现时的原始网址>", "reason": "……", "at": "..." }
```

---

## 4. 链接规范化（本插件的核心价值，MUST 有充分测试）

输入一个网址或文本，输出 `{ key, label, kind, url }` 或 `null`（丢弃）。

### 4.1 通用规则

1. 非 http(s) 链接：`mailto:`、`javascript:`、`tel:` → 丢弃；`tg://resolve?domain=x` → 转为 `https://t.me/x`。
2. 去掉 fragment（`#...`），除非站点规则另有说明。
3. 去掉跟踪参数：`utm_*`、`fbclid`、`gclid`、`spm`、`from`、`share_*`、`si`、`ref`（`ref` 仅在站点规则未声明需要时去掉）、`_t`、`timestamp`。
4. 主机名小写，去掉 `www.`、`m.`、`mobile.`（站点规则可覆盖）。
5. 去掉结尾 `/`；路径中连续 `/` 合并。
6. 跳转/短链：`t.co`、`bit.ly`、`goo.gl`、`url.cn`、`t.cn`、`link.zhihu.com/?target=`、`www.google.com/url?q=`、`l.facebook.com/l.php?u=`、`vk.com/away.php?to=` 等——能从参数直接取出目标的 MUST 直接取出；纯短链 SHOULD 发一次 `HEAD`（跟随重定向，超时 5 秒）解析，失败则保留短链本身。
7. 剩余参数按名字排序。
8. 默认 `key = <host><path>?<sorted query>`。

### 4.2 站点规则（内置，MUST 实现以下全部）

| 站点 | 识别 | key | kind |
|---|---|---|---|
| GitHub | `github.com/<owner>/<repo>[/...]` | `github:<owner>/<repo>`（全小写） | `github-repo` |
| GitHub 用户 | `github.com/<user>`（无第二段，排除保留路径 `topics` `orgs` `search` `settings` 等） | `github-user:<user>` | `github-user` |
| GitHub Gist | `gist.github.com/<user>/<id>` | `gist:<id>` | `github-gist` |
| GitLab / Gitee / Codeberg | 同 GitHub 形态 | `<site>:<owner>/<repo>` | `code-repo` |
| Telegram 频道/群 | `t.me/<name>`、`t.me/s/<name>`、`telegram.me/<name>`、`t.me/<name>/<msgId>` | `tg:<name>`（小写）；带 msgId 时 key 仍为频道，`url` 保留消息链接 | `telegram-channel` |
| Telegram 邀请 | `t.me/+xxxx`、`t.me/joinchat/xxxx` | `tg-invite:<xxxx>` | `telegram-invite` |
| X / Twitter 用户 | `x.com/<user>`、`twitter.com/<user>`（排除 `home` `search` `i` `hashtag` 等） | `x:<user>` | `x-user` |
| X 帖子 | `.../<user>/status/<id>` | `x-post:<id>` | `x-post` |
| VK | `vk.com/<name>`、`vk.com/wall-<gid>_<pid>` | `vk:<name>` / `vk-post:<gid>_<pid>` | `vk-page` / `vk-post` |
| 知乎问题 | `zhihu.com/question/<qid>[/answer/<aid>]` | 有 aid：`zhihu-a:<aid>`；否则 `zhihu-q:<qid>` | `zhihu-answer` / `zhihu-question` |
| 知乎专栏 | `zhuanlan.zhihu.com/p/<id>` | `zhihu-p:<id>` | `zhihu-article` |
| Stack Exchange 系 | `stackoverflow.com`、`*.stackexchange.com`、`superuser.com` 等，`/questions/<id>[/slug]`、`/a/<id>` | `se:<site>:q<id>`（`/a/<id>` 解析为答案 `se:<site>:a<id>`） | `qa-question` / `qa-answer` |
| Reddit | `reddit.com/r/<sub>/comments/<id>[/...]`、`redd.it/<id>` | `reddit:<id>` | `forum-thread` |
| Reddit 版块 | `reddit.com/r/<sub>` | `reddit-sub:<sub>` | `forum-board` |
| 贴吧 | `tieba.baidu.com/p/<tid>` | `tieba:<tid>` | `forum-thread` |
| B 站视频 | `bilibili.com/video/<BV|av>`、`b23.tv/*`（需解析短链） | `bili:<BV>` | `video` |
| YouTube | `youtube.com/watch?v=<id>`、`youtu.be/<id>`、`/shorts/<id>` | `yt:<id>` | `video` |
| Discord 邀请 | `discord.gg/<code>`、`discord.com/invite/<code>` | `discord-invite:<code>` | `chat-invite` |
| 网盘 | `pan.baidu.com/s/<id>`、`mega.nz/...`、`drive.google.com/...`、`aliyundrive`/`alipan` | `<site>:<id>` | `file-share` |
| 通用论坛帖子 | Discuz（`thread-<tid>-<page>-<x>.html`、`forum.php?mod=viewthread&tid=`）、phpBB（`viewtopic.php?t=`）、Discourse（`/t/<slug>/<id>`）、NGA（`read.php?tid=`）、V2EX（`/t/<id>`） | `<host>:t<tid>`（去掉页码） | `forum-thread` |

站点规则 MUST 以数据表 + 小函数的形式写在一个模块里（`src/sites/*.js`，每站一个文件），方便后续新增。

### 4.3 用户自定义规则

`$DSH_HOME/data/trail-search/sites.user.json`：
```jsonc
[
  { "name": "某论坛", "host": "bbs.example.com", "pattern": "^/thread/(\\d+)", "key": "example:t$1", "kind": "forum-thread" },
  { "name": "某导航站", "host": "nav.example.com", "kind": "directory" }
]
```
- `pattern` 是正则字符串，作用于 `path + ?query`。MUST 用 `new RegExp` 编译并对编译失败报错；匹配执行设超时防护（限制输入长度 ≤ 2048 字符即可）。
- 用户规则优先于内置规则。

### 4.4 丢弃规则

以下 MUST 返回 `null`：静态资源（`.png .jpg .gif .svg .css .js .woff .ico`，但 `.pdf .zip .rar .7z .apk .exe` 保留为 `kind: "file"`）；登录/注册/分享/打印页（路径含 `login` `signin` `register` `share` `print`，站点规则可覆盖）；同一页面的锚点；用户黑名单（设置项，按 host 或 key 前缀）。

---

## 5. 站点类型与打法

### 5.1 类型

`directory`（导航站 / 资源列表 / awesome 列表 / 友情链接页）、`forum-board`、`forum-thread`、`qa-question`、`qa-answer`、`github-repo`、`github-user`、`github-gist`、`code-repo`、`telegram-channel`、`telegram-invite`、`chat-invite`、`x-user`、`x-post`、`vk-page`、`vk-post`、`zhihu-question`、`zhihu-answer`、`zhihu-article`、`video`、`file-share`、`file`、`search`（以 `search:` 开头的搜索词线索）、`web`（其他）。

**导航站识别**（`kind` 无法从网址确定时，由查看结果回填）：页面外链数 ≥ 20 且外链分布在 ≥ 8 个不同 host，或页面标题/路径含 `nav` `导航` `awesome` `links` `resources` `目录` `大全`。侦察可以在回报里用 `KIND: directory` 改写类型。

### 5.2 访问方式

每个类型有默认访问方式，按顺序尝试，前一个失败（空内容、403、需要登录）再试下一个：

| 类型 | 顺序 |
|---|---|
| `zhihu-*` | harvest（`zhihu_*`）→ fetch → browser |
| `x-*` | harvest（`x_*`）→ `x_search` → browser |
| `forum-thread`（tieba） | harvest（`tieba_*`）→ fetch |
| `telegram-channel` | fetch `https://t.me/s/<name>`（公开频道的网页预览）→ browser |
| `telegram-invite`、`chat-invite` | 不访问，直接 `blocked: login`，列给用户 |
| `vk-*` | fetch → browser |
| `github-*` | fetch（README、issues 列表页）；SHOULD 用 GitHub API `https://api.github.com/repos/<o>/<r>`（无 token，注意 60 次/小时限额，用完就降级到 fetch） |
| `search` | `web_search` |
| 其他 | fetch → `read_page` → browser |

浏览器访问 MUST 串行（全局同时只有 1 个侦察在用 `browser_*`），由本插件提供的工具 `trail_browser_lease` 做互斥（§6.1）。

### 5.3 站点打法 Skill

每个类型的"怎么看、看什么、哪些链接值得报"写成 Skill，随插件分发到 `skills/` 子目录，安装时复制到 `$DSH_HOME/skills/trail-<kind>/SKILL.md`（已存在则不覆盖）。

MUST 提供以下 Skill（内容由实现方起草，交付后用户会审改）：
- `trail-directory`：**只列链接，不深入**。把页面上所有外链按分组（页面上的分类标题）列出，每条一行 NEW；不要逐个点开。
- `trail-forum-thread`：重点看楼主和回帖里的外链、网盘、群号、频道名；翻页（最多 5 页）；注意"已失效""换地址了"这类回帖。
- `trail-github`：README、最近 issues 标题、Releases、作者主页的其他仓库、README 里的外链。
- `trail-telegram`：频道简介、置顶、最近 30 条消息中的链接与被转发来源频道。
- `trail-qa`：最高票与被采纳答案中的链接；问题下"重复问题"链接。
- `trail-social`（X / VK / 微博）：个人简介里的链接、置顶帖、最近帖子中的外链和提到的账号。
- `trail-general`：兜底。

Skill 文件开头 MUST 有统一的回报格式说明（§6.2），这样侦察不管看什么站，交回来的东西格式一致。

用户新增站点类型：写一个 `trail-<kind>/SKILL.md`，并在 `sites.user.json` 里让某些网址归到这个 kind。插件读取 Skill 目录列出可用打法；侦察提示词里写"若存在 `trail-<kind>` Skill，先加载它"。

---

## 6. 工具（给 Agent 用）

工具在插件启用时注册，之后不增删（缓存保护）。

| 工具 | 参数 | 作用 |
|---|---|---|
| `trail_start` | `goal: string`, `seeds: string[]` | 新建 trail，种子网址或 `search:<词>`；返回 trailId。会话内已有活动 trail 时报错，除非 `force: true` |
| `trail_add` | `trailId`, `items: {url, priority?, reason?, foundBy?}[]` | 加线索；返回每条的处理结果：new / merged（已存在）/ dropped（及原因） |
| `trail_next` | `trailId`, `n: number` (≤10) | 取优先级最高的 n 条 pending 线索，标为 running；返回每条的 id、url、kind、建议访问方式、建议 Skill 名 |
| `trail_report` | `trailId`, `nodeId`, `report: string` | 交回报（§6.2 格式的文本）；插件解析、写结果文件、加新线索、更新状态；返回解析摘要（新增几条、合并几条、丢弃几条） |
| `trail_skip` | `trailId`, `nodeIds[]`, `reason` | 跳过 |
| `trail_map` | `trailId`, `format?: "tree" \| "table"` | 返回线索地图文本（不含结果全文） |
| `trail_status` | `trailId?` | 统计：各状态数量、最大深度、按 kind 分布、blocked 清单 |
| `trail_browser_lease` | `trailId`, `action: "acquire" \| "release"`, `nodeId` | 浏览器互斥；acquire 失败时返回当前持有者，侦察应改用其他访问方式或稍后重试 |

单独使用模式下，一个 Agent 的循环就是：`trail_start` → 反复（`trail_next` → 派子 Agent 或自己看 → `trail_report`）→ `trail_map`。

### 6.1 浏览器互斥

- 租约默认 5 分钟自动过期；持有者 `release` 或子 Agent 结束时释放。
- 插件监听子 Agent 结束（`agent/disposed`），自动释放其持有的租约。

### 6.2 回报格式（侦察的最后输出）

```
STATUS: useful | useless | blocked
BLOCKED: login | captcha | geo | dead | other    (仅 blocked 时)
KIND: <kind>                                      (可选，改写类型)
SUMMARY: 不超过三句
FOUND:
- 与目标相关的具体发现，每条一行，带出处网址
NEW: <url> | <优先级 1-5> | <一句理由>
NEW: <url> | <优先级 1-5> | <一句理由>
```
- 解析器 MUST 容错：大小写、全角冒号、行首多余空格、`-`/`*` 列表符号、NEW 行缺优先级（默认 3）或缺理由。
- 解析失败（找不到 STATUS）：节点标为 done、verdict 留空，原文存入结果文件，在 `trail_report` 返回里提示"回报格式不符"。
- `FOUND` 以下的全文写入 `results/<nodeId>.md`；**返回给调用方的只有解析摘要**，不回显全文（防止调度员上下文膨胀）。
- 单次回报的 NEW 行上限 50；导航站可以超过，但超出部分按优先级只保留前 200 条，其余写进结果文件备查，并在摘要里说明。

---

## 7. 与委派插件的对接

本插件 MUST 通过 `ctx.provide('trailSearch', impl)` 提供委派规格 §3.3.2 的 `QueueItemProvider`：

```ts
{
  normalize(text) {            // 委派插件对每个新条目调用
    // text 可能是网址、"search:词"、或 NEW 行的网址部分
    // 返回 { key, label, kind } 或 null
  },
  priority(item, parent) {     // 可选
    // 在条目自带优先级基础上调整：
    // directory +1；与父节点同 host 的普通页面 -1；depth 每 +1 则 -0.5（不低于 1）
  },
  onResult(item, resultPath) { // 委派插件在条目完成时调用
    // 读 resultPath 文件，按 §6.2 解析，更新 trail 节点与 edges，重写 map.md
  }
}
```

并且 SHOULD 提供 `describe(item)`：返回该条目建议的访问方式与 Skill 名，委派插件在派发子 Agent 时把它拼进子 Agent 的任务书（委派规格需要相应增加一个可选调用；若委派插件未实现，侦察提示词里的"先判断站点类型并加载对应 Skill"仍然兜底）。

对接时的数据归属：
- 队列状态（pending / running / done、轮次、预算）以委派插件为准。
- 线索地图、edges、站点识别结果以本插件为准。
- 委派插件的 `iterative-search` 方案（已写好，在 `dsh-delegation-next/library/builtin/iterative-search.json`）就是二者组合的标准用法。

---

## 8. 预算与礼貌

本插件独立使用时自带预算（配合委派插件时以队列阶段的 budget 为准，本插件的预算不生效）：
- `maxNodes` 默认 60，`maxDepth` 默认 5，`maxMinutes` 默认 90。
- 同一 host 每分钟最多 10 次 fetch，超出排队。
- 每个 trail 对同一 host 的节点数上限默认 15（防止在一个大站里转圈），超出的新线索标为 skipped，原因 `host-cap`。
- 用户黑名单（设置）：按 host 或 key 前缀，命中即丢弃。

---

## 9. UI（功能与位置；样式后续另行优化）

- **右侧面板标签页**（`sidebar.right.pane.tab`）"线索"：
  - 当前会话的活动 trail：目标、统计（待看 / 在看 / 有用 / 无用 / 被挡）、最大深度。
  - 线索树：按 `foundBy` 父子关系缩进显示；每个节点显示 kind 图标位（先用文字标签）、label、状态、一句摘要；点开显示发现原因、访问方式、结果文件链接。
  - 被挡清单：需要登录 / 验证码的线索单独列出，附原始网址，用户可以自己去看，看完可以把内容粘贴回来作为该节点的回报（调用 `trail_report`）。
  - 手动操作：加线索、跳过、提升优先级。
- **设置页**（`settings.section`）：黑名单、同 host 上限、默认预算、浏览器/site-harvest 可用性开关（§2 降级方案）、用户站点规则编辑（表格：名字、host、pattern、key 模板、kind，带"用一个网址试一下"按钮显示规范化结果）。
- 历史 trail 列表：可打开、可"从这里继续"（重新激活 pending 节点）。

---

## 10. 文件结构（建议）

```
dsh-trail-search/
  package.json  cordis.patch.yml  index.js  client.js  README.md
  src/
    normalize.js        §4.1 通用规则 + 调度站点规则
    sites/              每站一个文件，导出 { match(url), key(url), kind, label }
    sites-user.js       §4.3
    classify.js         §5.1 类型识别（含导航站启发式）
    access.js           §5.2 访问方式表
    trail.js            trail/节点/边 存储（jsonl 追加写、启动时重建内存索引）
    report.js           §6.2 回报解析
    map.js              map.md 与 trail_map 生成
    tools.js            §6 工具
    lease.js            浏览器租约
    provider.js         §7 trailSearch 服务
    budget.js           §8
    http.js             HTTP 接口（照抄 dsh-delegation-policy/http.js 的鉴权）
  skills/trail-*/SKILL.md
  test/
    normalize.test.js   每条站点规则 ≥ 3 个正例 + ≥ 2 个反例；通用规则逐条覆盖
    report.test.js      容错解析
    trail.test.js       去重合并、优先级提升、host 上限、深度上限、续搜
    provider.test.js    与委派插件接口
    lease.test.js
```
测试用 `node --test`，不访问网络（短链解析用注入的假 fetch）。

---

## 11. 实现顺序与验收

**顺序**
1. `normalize` + 站点规则 + 测试（纯函数，最重要，先做扎实）。
2. trail 存储、回报解析、地图 + 测试。
3. 工具注册、浏览器租约、预算。
4. `trailSearch` 服务（对接委派插件）。
5. 站点打法 Skill 初稿。
6. HTTP 接口与 UI。

**验收（交付时逐条给证据）**
- `node --test` 全部通过，列出测试数量；normalize 测试至少 80 个用例。
- 给出一张对照表：30 个真实网址（覆盖 §4.2 每一行）→ 规范化结果。
- `conflict_doctor` 无新增冲突（`trail_*` 工具名不与已有工具重名）。
- §2 待确认项的查证结果与采用方案。
- 交付说明列出：已实现 / 降级实现 / 未实现。

---

## 12. 不要做的事

- 不要在插件里直接调模型做判断（判断交给 Agent）；规范化、识别、解析全部是确定性代码。
- 不要绕过登录、验证码、付费墙；被挡就标 blocked 列给用户。
- 不要把 Cookie、Token 写进 trail 文件、日志或回报。
- 不要并行操作用户的真实浏览器（§6.1）。
- 不要修改其他插件、宿主 `app.asar`、site-harvest 的源码。
- 不要在测试里访问网络。
