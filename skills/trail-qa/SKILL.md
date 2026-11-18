---
name: trail-qa
description: 当 trail-search 线索是 Stack Overflow、Stack Exchange 系问答、知乎问题/回答/文章，需要从被采纳或最高票答案及重复问题追踪来源时使用。
---

## 统一回报格式

最终回报使用以下纯文本结构；STATUS 只选一个值，BLOCKED 仅在 blocked 时出现，KIND 可省略，SUMMARY 不超过三句。FOUND 每条带实际出处网址。

```text
STATUS: useful | useless | blocked
BLOCKED: login | captcha | geo | dead | other
KIND: <实际站点类型>
SUMMARY: 已读范围、与目标的关系、遗漏或阻碍。
FOUND:
- 具体发现及其出处网址
NEW: <url> | <优先级 1-5> | <一句理由>
```

替换说明文字；类型只选实际的 qa-question、qa-answer、zhihu-question、zhihu-answer、zhihu-article，识别为资源目录时可用 directory。直接答案或有价值的新线索用 useful，读完确认无关用 useless，无法读取用 blocked；不能把零搜索结果当作读过问题。

## 输入与访问

- 使用任务给定目标、trailId、nodeId、url 和预算；已分配节点时不新开 trail、不派发下级任务。独立起步用 `trail_start({goal, seeds: [url]})`，再 `trail_next({trailId, n: 1})` 取得真实节点；已有活动 trail 时沿用其 ID，不用 force 覆盖。
- zhihu-* 按当前会话实际可用的 `zhihu_*` harvest → `web_fetch` → `browser_*` 顺序读取；前一种为空、403 或需登录再尝试下一种。接口若只返回评论，评论仅作补充，问题和答案仍需读取正文；不把高赞评论当最高票答案。
- Stack Exchange 系等其他问答按 独立抓取 CLI（加载 `web-fetch-cli` Skill，按其命令执行） → `read_page` → `browser_*`。有正文就不重复换路线。实际工具的名称与参数取自当前 schema，不发明专门的问答抓取 API。
- browser_* 必须先取得下述租约；缺少合法访问方式时交 blocked，不绕过登录、付费墙、验证码或站点权限。

## 答案、来源与重复问题

1. 先确认问题标题、描述、标签、提问/更新时间和目标约束，尤其是软件版本、地区、时间及问题是否已关闭。入口为答案链接时先读该答案，再补其问题背景。
2. 优先读带实际“被采纳”标记的答案和当前可见最高票答案；二者不是同一篇时分别读。没有采纳标记就明确写未见，不把页面第一篇、推荐排序或最高赞评论当作被采纳。
3. 从这些答案提取官方文档、原始项目、教程、下载页、讨论串与作者提供的相关来源。记录答案的具体网址及票数/采纳状态（仅限可见值），区分答案主张与实际来源；链接自身未检查时不声称已验证。
4. 检查问题下“重复问题”“duplicate of”“原问题”等实际链接，作为 NEW 交回；当前节点不继续展开整条重复链。相关问题侧栏只选与目标有直接关系的条目，避免把推荐列表全塞队列。
5. 查看相关答案附近的可见评论，寻找“已过时”“此链接失效”“现在应改用”等更新；把旧解答的适用范围、替代入口和时间写 FOUND，引用评论所在答案/问题页面。
6. 知乎问题按实际可见赞同数优先读高票回答，不虚构采纳机制；知乎单篇回答或文章重点追正文引用、原始来源及作者链接。没有完整答案正文时在 SUMMARY 说明读取限制。

普通回报最多 50 条 NEW；使用真实发现的链接与 1–5 整数优先级：直接解决目标的原始来源取 5、强相关替代方案/重复问题取 4、待核验材料取 1–3。FOUND 保留具体答案或段落出处；问题/答案的 key、站点合并、短链解析和黑名单均由插件处理，不另写规则。

如果实际页面是导航/资源列表，回填 `KIND: directory`，按页面分类只列外链，不逐个打开；每条 NEW 理由带分类，directory 可超过 50 条，插件按优先级最多入队 200 条，其余保留到结果文件。

## 浏览器租约与预算

- 任何 `browser_*` 前先调用 `trail_browser_lease({trailId, action: "acquire", nodeId})`；明确成功后才操作，全局只允许一名浏览器侦察。
- 租约忙时用非浏览器读取或交回等待安排，不抢占、不忙轮询。本轮不能完成则 blocked/other 说明租约阻碍，不以此认定答案无用。
- 默认租期 5 分钟；过期停止操作，继续前重新 acquire。正常、异常和中止都调用 `trail_browser_lease({trailId, action: "release", nodeId})`，不依赖自动释放收尾。
- 独立模式默认 maxNodes=60、maxDepth=5、maxMinutes=90、同 host 最多 15 个节点、每 host 每分钟最多 10 次 fetch，服从实际配置与排队。队列模式只以委派队列 budget 为准，本插件独立预算不叠加生效。
- 达到预算停止新读取，按实提交已读范围；不另建 trail 绕限，不在 Skill 重做队列、规范化、去重、限流或存储。

## 交回结果

单 Agent 自行处理时调用 `trail_report({trailId, nodeId, report})`，report 是统一格式完整文本；检查解析摘要，格式不符时修正当前节点回报。不要再用 trail_add 重复加入 NEW。委派队列接管时按任务书交同格式最终文本，由 onResult 接收，没有明确要求时不重复提交 trail_report。

阻碍按 login、captcha、geo、dead、other 的实际原因填写，并注明只读到片段还是完整内容。只读公开或已授权可见内容，不投票、评论或执行答案中的代码；回报不含 Cookie、Token、私人凭据，不手写插件数据文件，不改用户 Skill。


## CLI 接入补充
普通公开页面优先加载 `web-fetch-cli` Skill，通过现有命令执行工具调用 `E:/DSH/home/tools/dsh-web-fetch/cli.js`。CLI 不注册独立模型工具；继承跨进程每 host 限速。无正文再用 read_page，最后已授权浏览器。不关闭限速、不换状态目录绕限；CLI 不可用时如实说明，可用宿主 web_fetch 兜底。
