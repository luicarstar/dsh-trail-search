---
name: trail-telegram
description: 当 trail-search 线索是 Telegram 公开频道、频道消息或 Telegram/Discord 邀请，需要追踪简介、置顶、最近消息中的链接与转发来源时使用。
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

替换模板说明文字；类型使用 telegram-channel、telegram-invite 或 chat-invite。有目标相关证据或新线索用 useful，读过确认无关用 useless，无法读取用 blocked；没有看到消息不能作为无用结论。

## 输入与访问

- 使用任务提供的目标、trailId、nodeId、url 与预算；已分配节点时不新建 trail、不派发下级任务。独立起步用 `trail_start({goal, seeds: [url]})`，再 `trail_next({trailId, n: 1})` 取真实节点；已有活动 trail 时沿用其 ID，不用 force 覆盖。
- 遇到 `t.me/+...`、`t.me/joinchat/...` 的 telegram-invite 或 Discord 等 chat-invite，**不访问邀请、不加入**，直接交 `STATUS: blocked`、`BLOCKED: login`，在 FOUND 列原邀请网址，交给用户处理。不要先打开邀请探测是否能加入。
- 公开频道先用 `web_fetch` 读取 `https://t.me/s/<name>`，name 来自已知频道网址；输入为某条消息时保留原消息网址，先记录目标消息证据再查看频道预览。
- 预览空白、403 或需登录时，才考虑当前会话实际可用且已授权的 `browser_*`，先取得租约；不另找 Cookie、Token 或登录绕行方式。参数按实际工具 schema，不发明 Telegram API 工具。

## 简介、置顶、最近 30 条

1. 简介：读取频道名、公开用户名、描述、官方主页、关联讨论入口和公开联系方式，区分频道自述与可核验事实。
2. 置顶：只读实际可见的置顶内容，优先提取最新地址、资源总目录、公告和关联频道。看不到置顶则说明未读取，不能推断没有置顶。
3. 最近消息：查看**最多最近 30 条可见消息**，按时间识别新旧；不从入口向历史无限翻页。不足 30 条就按实际数量交回，并说明预览截断或可见范围，不假定已穷尽频道。
4. 提取消息里的站外链接、网盘、仓库、论坛和其他频道。关注“搬家”“备份频道”“链接已换”“资源失效”的时间与原文依据；资源可用性未经检查时不要写成已验证。
5. 对转发消息，记录“转发自”的实际来源频道和原消息链接；有公开来源链接就列 NEW，只有隐藏来源名称则写 FOUND，不猜用户名或邀请地址。可见的明确 @用户名可作为待核验的 `https://t.me/<name>` 线索，理由说明其来源是可见用户名，不声称已访问。
6. 邀请链接即使出现在公开消息中，也只作 NEW 登记；实际处理邀请节点时仍直接 blocked/login，不在当前节点加入或探查。

FOUND 优先使用具体消息的 `https://t.me/<name>/<msgId>` 出处；没有消息链接时引用实际预览页并注明范围。SUMMARY 写已读消息数量、日期范围、简介/置顶的可见情况。普通回报最多 50 条 NEW，给 1–5 整数优先级和具体理由；原频道不同消息的合并、邀请识别与去重交插件，不自行改 key。

## 浏览器租约与预算

- 所有 `browser_*` 前先 `trail_browser_lease({trailId, action: "acquire", nodeId})`；明确成功后才操作，全局串行，不与其他侦察共享操作用户标签页。
- acquire 失败时用公开预览或等待任务安排，不抢占、不忙轮询。若本轮因此无法检查，blocked/other 说明租约忙，不伪报 login 或频道无用。
- 默认租期 5 分钟；过期即停止操作，继续前重新 acquire。正常、异常和中止都调用 `trail_browser_lease({trailId, action: "release", nodeId})`，不以自动释放代替收尾。
- 独立模式默认 maxNodes=60、maxDepth=5、maxMinutes=90、同 host 最多 15 个节点、每 host 每分钟最多 10 次 fetch；服从实际配置与排队。队列模式仅以委派队列 budget 为准，本插件独立预算不叠加生效；最近 30 条是本打法的读取上限。
- 到限即停止新读取，已读部分如实回报；不另开 trail 绕限，不实现调度、规范化、去重或持久化。

## 交回结果

单 Agent 自行处理时调用 `trail_report({trailId, nodeId, report})`，report 为统一格式完整文本；核对解析摘要，格式错误则修正当前节点。NEW 已随回报接收，不再用 trail_add 重复加入。委派队列接管时按任务书交同格式最终文本，由 onResult 接收，没有明确要求时不重复提交 trail_report。

验证码、地域限制、确认删除/不存在及能力缺失分别记 captcha、geo、dead、other，附实际证据；不自动发消息、订阅、加群或下载附件。回报不含 Cookie、Token、私人凭据；不手写插件结果、节点、边或地图文件，也不改用户 Skill。


## CLI 接入补充
普通公开页面优先加载 `web-fetch-cli` Skill，通过现有命令执行工具调用 `E:/DSH/home/tools/dsh-web-fetch/cli.js`。CLI 不注册独立模型工具；继承跨进程每 host 限速。无正文再用 read_page，最后已授权浏览器。不关闭限速、不换状态目录绕限；CLI 不可用时如实说明，可用宿主 web_fetch 兜底。
