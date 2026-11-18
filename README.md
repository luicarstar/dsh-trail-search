# dsh-trail-search（线索搜索）

让 AI 按线索"顺藤摸瓜"进行深搜的 DSH 插件：从论坛、导航站、GitHub、Telegram、问答或社交页面里提取新链接，去重归一后按优先级逐条推进，并维护可存盘续搜的线索地图。

> 当前在 `profiles/desktop` 中已启用。本插件只负责线索去重、站点识别、进度地图与访问次序，**不自行创建子 Agent**（可单 Agent 循环使用，也可通过 `trailSearch` 服务交给委派插件的队列阶段并发调度）。

## 注册工具

| 工具名 | 作用 |
|---|---|
| `trail_start` | 新建一条独立搜索（设定目标与种子链接/搜索词） |
| `trail_add` | 追加新链接或 `search:关键词`，自动规范化去重并记录发现来源 |
| `trail_next` | 按优先级领取下一批待看线索，并返回推荐访问顺序与对应 `trail-*` Skill |
| `trail_report` | 提交标准回报（`STATUS/SUMMARY/FOUND/NEW`），自动入库并解析新线索 |
| `trail_skip` | 跳过指定线索并记录原因 |
| `trail_map` | 以树形或表格形式查看线索地图（不含抓回全文） |
| `trail_status` | 查看搜索进度统计、预算归属与被拦截清单 |
| `trail_browser_lease` | 调用 `browser_*` 前申请/释放进程全局互斥租约，防止多个任务抢同一浏览器 |

## 界面与配套规范

- **右侧栏标签页「线索」**：查看当前搜索状态、进度地图与被拦列表。
- **配套站点打法 Skill**（`skills/`）：`trail-directory`、`trail-forum-thread`、`trail-general`、`trail-github`、`trail-qa`、`trail-social`、`trail-telegram`。
- **访问边界**：遇到登录墙、验证码或地域限制直接回报 `blocked`，不做绕过。

## 文件结构

- `index.js`：插件注册、系统提示词指引、`trailSearch` 服务提供与 HTTP 接口
- `src/`：控制器、线索存储与去重、工具定义、站点识别与访问策略
- `client.js`：右侧栏「线索」面板
- `SPEC.md`：实现规格说明
