---
name: trail-directory
description: 当 trail-search 线索是导航站、友情链接页、资源目录或 awesome 列表，需要列出页面外链及原分类时使用。
---

## 统一回报格式

最终回报使用以下纯文本结构；STATUS 只选一个值，BLOCKED 仅在 blocked 时出现，SUMMARY 不超过三句。FOUND 每条带实际出处网址；每个外链独占一行 NEW。

```text
STATUS: useful | useless | blocked
BLOCKED: login | captcha | geo | dead | other
KIND: directory
SUMMARY: 已读范围、与目标的关系、遗漏或阻碍。
FOUND:
- 具体发现及其出处网址
NEW: <url> | <优先级 1-5> | <一句理由>
```

替换模板中的说明文字，不把枚举或尖括号原样交回。未能读取不等于 useless；有目标相关线索用 useful，读完确认无关用 useless，无法继续读取用 blocked。

## 输入与访问

- 从任务取目标、trailId、nodeId、url 和剩余预算，使用真实 ID。已分配节点时只处理该节点，不另建 trail 或派发下级任务。
- 单独从一个网址起步时，调用 `trail_start({goal, seeds: [url]})`，再用返回的 trailId 调用 `trail_next({trailId, n: 1})`，以返回节点的 id 为 nodeId。会话已有活动 trail 时沿用其 ID；不以 force 覆盖。
- 先 `web_fetch`，正文为空、403 或仅有壳时尝试 `read_page`，最后才考虑当前会话真实可用的 `browser_*`。参数以实际工具 schema 为准，不猜测工具名或 MCP 接口。
- 看当前目录页的正文、分类标题和链接；只展开本页折叠内容，不点开目录所指向的网站。若受登录、验证码或地域限制且无可用的合法读取方式，直接回报对应 BLOCKED。

## 只列链接，不深入

1. 识别页面上的分类标题，按标题原顺序收集外链。相对 href 根据当前页面地址还原为绝对地址；保留可见的原始目标，不自行重写去重键、移除参数或追逐短链。
2. 每条 NEW 的理由写成“[页面分类] 链接文字；与目标的关系”。没有分类标题时用“[未分类]”。同一页面的外链逐条列全；弱相关也保留，赋较低优先级，不因主观筛选漏掉整个分类。
3. FOUND 概述各分类与目标有关的资源，并引用当前目录页作为出处。可见的外部仓库、频道、论坛、网盘和作者主页都属于候选；站内锚点、脚本和纯样式资源不作为外部线索。
4. 所有候选都只登记，不逐个点击、不验证各站可达性、不展开仓库或下载文件；去重、黑名单和站点识别交插件处理。NEW 使用真实发现的网址，不能把分类名、群号或猜测的域名充当网址。
5. 优先级取 1–5：5 为直接命中目标，4 为强相关入口，3 为待查资源，2 为间接线索，1 为明显弱相关。保持分类内的页面顺序，用理由保留分组。

本 Skill 始终输出 `KIND: directory`。其他页面标题或路径含 nav、导航、awesome、links、resources、目录、大全，或外链至少 20 条且跨至少 8 个 host 时，也可按本打法回填 directory。

普通回报上限 50 条 NEW；directory 允许超过 50 条。为完整收录当前页面外链，可以交回全部 NEW；插件按优先级最多入队 200 条，其余写入结果文件备查。不要为规避上限拆报同一节点。SUMMARY 写明实际收集数、页面是否完整可见；入队数以 `trail_report` 返回摘要为准。

## 浏览器租约与预算

- 使用任何 `browser_*` 前调用 `trail_browser_lease({trailId, action: "acquire", nodeId})`，只有明确取得租约才操作；全局同时仅一名侦察使用浏览器。
- acquire 失败时改用非浏览器方式，或交还等待安排，不忙轮询、不操作持有者标签页。若本轮无法完成，报 `STATUS: blocked`、`BLOCKED: other` 并说明租约忙。
- 租约默认 5 分钟；异常、中止或结束都在收尾时调用 `trail_browser_lease({trailId, action: "release", nodeId})`。到期后不能继续操作，确需继续先重新 acquire；不依赖自动释放作为正常收尾。
- 独立模式默认 maxNodes=60、maxDepth=5、maxMinutes=90、同 host 最多 15 个节点、每 host 每分钟最多 10 次 fetch；遵守当前实际配置及排队。队列模式只以委派插件的队列 budget 为准，本插件独立预算不叠加生效。
- 到限就停止新访问，不另开 trail 绕过预算。规范化、去重、队列、限流、持久化和地图均由宿主插件处理，不在 Skill 中重做。

## 交回结果

单 Agent 自行处理的节点调用 `trail_report({trailId, nodeId, report})`，report 为上述完整文本；检查返回的解析摘要。提示“回报格式不符”时修正该节点回报，不伪造入队数，也不另用 trail_add 重复加入 NEW。委派队列接管时按任务书交回同格式的最终文本，由 onResult 接收；没有明确要求时不重复调用 trail_report。

不手写 results、nodes、edges 或 map 文件，不改用户规则与自定义 Skill。回报不得带 Cookie、Token、私人凭据或伪造的读取结果。


## CLI 接入补充
普通公开页面优先加载 `web-fetch-cli` Skill，通过现有命令执行工具调用 `E:/DSH/home/tools/dsh-web-fetch/cli.js`。CLI 不注册独立模型工具；继承跨进程每 host 限速。无正文再用 read_page，最后已授权浏览器。不关闭限速、不换状态目录绕限；CLI 不可用时如实说明，可用宿主 web_fetch 兜底。
