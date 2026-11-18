---
name: trail-social
description: 当 trail-search 线索是 X/Twitter、VK 或微博账号与帖子，需要从个人简介、置顶、近期帖子、外链和提及账号继续追踪时使用。
---

## 统一回报格式

最终回报使用以下纯文本结构；STATUS 只选一个值，BLOCKED 仅在 blocked 时出现，KIND 可省略，SUMMARY 不超过三句。FOUND 每条带实际出处网址。

```text
STATUS: useful | useless | blocked
BLOCKED: login | captcha | geo | dead | other
KIND: <实际站点类型，可省略>
SUMMARY: 已读范围、与目标的关系、遗漏或阻碍。
FOUND:
- 具体发现及其出处网址
NEW: <url> | <优先级 1-5> | <一句理由>
```

替换模板说明文字；X/VK 使用 x-user、x-post、vk-page、vk-post，微博沿用实际分类（通常 web）或省略 KIND，不新增 weibo-* 类型。相关事实或可继续的线索用 useful，读完确认无关用 useless，未能读取用 blocked。

## 输入与访问顺序

- 使用任务提供的目标、trailId、nodeId、url、预算；已分配节点时不新建 trail、不派发下级任务。独立起步用 `trail_start({goal, seeds: [url]})`，再 `trail_next({trailId, n: 1})` 取真实节点；已有活动 trail 时沿用其 ID，不用 force 覆盖。
- x-*：优先当前会话实际提供的 `x_*` harvest，其次 `x_search`，最后已授权可用的 `browser_*`。工具缺失、空结果、403 或需登录时才往后降级；按真实 schema 调用，不猜 MCP 工具的完整名称或参数。
- x_search 以当前账号、原帖信息和目标关键词限定检索；结果片段只能作为已见片段的证据，引用真实结果网址，不冒称读完账号时间线。搜索无结果但页面未读到时不能据此判 useless。
- vk-*：`web_fetch` → `browser_*`。微博等其他社交页：独立抓取 CLI（加载 `web-fetch-cli` Skill，按其命令执行） → `read_page` → `browser_*`。浏览器必须先取租约；没有当前可用的登录态就标 login，不索取或导出凭据。

## 简介、置顶、最近帖子与账号

1. 账号入口先读个人简介里的官网、链接聚合页、频道、仓库、其他平台账号；记录账号自述及可见用户名，区分自我声明和已核验身份。
2. 读实际可见的置顶帖，优先记录资源索引、联系方式变化、备用号和迁移公告。未展示置顶不等于没有置顶，在 SUMMARY 写“置顶未读取”。
3. 在剩余预算内先看最近一批可见帖子，通常 10–20 条即可；记录实际数量、日期范围和是否截断。不要无限翻历史，也不为凑数量反复加载同批帖子；转帖与原帖分别标明来源。
4. 帖子入口先读该帖及直接相关的可见上下文，再看作者简介与置顶；不把整棵回复树、全部转发或每位提及账号都在当前节点打开。
5. 提取目标相关的外链、项目名、资源页及明确提及的账号。页面已有账号链接时直接用该链接；明确可见的 X @用户名可列为待核验的 `https://x.com/<handle>`，理由注明“原帖提及，尚未访问”。其他平台只有昵称而无可核验链接时写 FOUND，必要时用 `search:<账号名与平台及目标词>` 继续，不猜账号 ID。
6. 留意“新地址”“backup”“moved”“旧号停用”“链接失效”等内容与时间，将替代地址列 NEW，并把原帖证据放 FOUND。推广或转述不等于实测有效，不替作者担保资源可用性。

普通回报最多 50 条 NEW，使用 1–5 整数优先级：直接目标入口取 5、强相关作者/备用账号或项目取 4、间接线索取 1–3。保留原始外链，t.co 等短链解析与去重交插件；不要为了展开短链额外消耗浏览器。发现链接聚合/导航页时先列为 NEW，不在当前节点点入继续深挖。

若当前页面本身就是资源导航，回填 `KIND: directory`，按分类逐条列外链并把分类写在 NEW 理由中，不打开各目标；directory 可超过 50 条，插件按优先级最多入队 200 条，其余保留到结果文件。

## 浏览器租约与预算

- 所有 `browser_*` 之前先 `trail_browser_lease({trailId, action: "acquire", nodeId})`；明确成功才操作，全局同时只有一名浏览器侦察。
- acquire 失败时改用非浏览器方式或交回等待安排，不忙轮询、不抢占用户或持有者标签页。本轮无法完成则 blocked/other 说明租约忙，不伪报页面无用。
- 默认租期 5 分钟；过期停止操作，继续前重新 acquire。正常、异常和中止都调用 `trail_browser_lease({trailId, action: "release", nodeId})`，不依赖自动释放。
- 独立模式默认 maxNodes=60、maxDepth=5、maxMinutes=90、同 host 最多 15 个节点、每 host 每分钟最多 10 次 fetch；服从实际配置和排队。队列模式仅使用委派队列 budget，本插件独立预算不叠加生效。
- 到限停止新读取，交回真实已读范围；不另开 trail 绕过预算，不重做调度、规范化、去重、限流或持久化。

## 交回结果

单 Agent 自行处理时调用 `trail_report({trailId, nodeId, report})`，report 为统一格式完整文本；检查解析摘要，格式错误则修正当前节点回报。NEW 不再用 trail_add 重复加入。委派队列接管时按任务书交同格式最终文本，由 onResult 接收，没有明确要求时不重复调用 trail_report。

登录、验证码、地域限制、确认删除/不存在、其他阻碍分别记 login、captcha、geo、dead、other；说明哪些内容实际看过。仅阅读，不发帖、点赞、关注、私信或加入社群，不绕过权限；回报不带 Cookie、Token、私人凭据，不手写插件数据文件或修改用户 Skill。


## CLI 接入补充
普通公开页面优先加载 `web-fetch-cli` Skill，通过现有命令执行工具调用 `E:/DSH/home/tools/dsh-web-fetch/cli.js`。CLI 不注册独立模型工具；继承跨进程每 host 限速。无正文再用 read_page，最后已授权浏览器。不关闭限速、不换状态目录绕限；CLI 不可用时如实说明，可用宿主 web_fetch 兜底。
