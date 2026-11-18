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

## 开发

```bash
node --test test/*.test.js
```

零依赖，只需要 Node.js 18 以上（用到 `node:test`、`structuredClone`、`Intl`）。测试会在系统临时目录里建独立的线索目录，不会碰真实数据。

## 版本记录

### 1.0.1

- 修复：`trails/` 下出现名字不合法的目录（备份文件夹、网盘同步目录、手动复制）时，整个插件启动失败、所有历史搜索都读不到。现在跳过这类目录并通过 `skipped()` 报告，不再连带其它搜索一起挂掉。
- 修复：脱敏漏掉裸密钥与中文字段名。新增按前缀识别的 OpenAI/Anthropic、GitHub、Slack、AWS、Google、Stripe、GitLab、Telegram、npm、HuggingFace、JWT 模式，以及「密码/口令/密钥/令牌/凭据/私钥」+ 是/为/冒号/等号的中文写法。本插件专门爬论坛和代码托管站，正是最容易捡到别人泄露凭据的地方。
- 修复：`trail_next` 在「搜索已完成」「被时间预算暂停」「未在运行」三种情况下都返回空数组，调用方无法区分该收尾还是该继续。现在空批次返回 `{nodes:[],reason}`，`reason` 取 `done`/`paused`/`empty`/`max-minutes`，并附 `hint`。`next()` 本身仍返回数组，原有调用方不受影响。
- 修复：结果路径被写成绝对路径，搜索目录换盘符或拷到另一台机器后引用全部失效且看不出来。现在目录内的结果存相对路径，目录外的保留原样并标记 `resultExternal`。
- 修复：事务日志每条都重写完整 `meta`，膨胀稳定在快照的 1.97 倍且永不回收。现在过 512 KB 后按真实快照大小比对，超过 1.5 倍即压缩成单条快照事务，`seq` 保持连续。
- 修复：`test/core.test.js` 硬编码了 `C:/Users/Administrator/...` 绝对路径，换机器测试直接失败。改用系统临时目录。
