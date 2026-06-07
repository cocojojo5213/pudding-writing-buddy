# 维护手册

这份手册用于维护本机和 GitHub 上的写作助手布丁（Pudding Writing Buddy）。

## 仓库信息

- 本机路径：`/home/ubuntu/ai-novel-copilot`
- GitHub 远端：`https://github.com/cocojojo5213/pudding-writing-buddy.git`
- 主分支：`main`
- 应用名：`pudding-writing-buddy`
- 运行环境：Node.js 20 或更新版本，无生产 npm 依赖

每次维护前先执行：

```bash
cd /home/ubuntu/ai-novel-copilot
git status --short --branch
git remote -v
```

不要覆盖或删除 `data/` 里的本地稿件数据。这个目录已经被 `.gitignore` 排除，不应提交到 GitHub。

## 日常启动

启动本地服务：

```bash
cd /home/ubuntu/ai-novel-copilot
npm start
```

浏览器打开：

```text
http://127.0.0.1:5179
```

如果 `5179` 端口被占用，换一个端口：

```bash
PORT=5180 npm start
```

健康检查：

```bash
curl -s http://127.0.0.1:5179/api/health
```

预期返回：包含 `ok: true`、`app: pudding-writing-buddy`、schema version 和项目指标的 JSON。

## 数据与备份

当前项目保存在：

```text
data/project.json
```

快照保存在：

```text
data/snapshots/
```

维护规则：

- 把 `data/project.json` 当成用户稿件和项目真相来源。
- 不提交 `data/`、`.env`、API key、浏览器截图产物或本地快照。
- 改服务端、schema、结算逻辑前，先从 UI 创建 Snapshot，或通过 `/api/snapshot` 生成备份。
- 如果 `project.json` 损坏，服务端会先备份坏文件再重置默认项目；清理 `data/` 前要先检查这些备份。
- `409` 写入冲突是正常保护机制。服务端用 `versionToken` 防止旧浏览器页覆盖新稿件。

## 验证流程

提交或推送前运行完整验证：

```bash
cd /home/ubuntu/ai-novel-copilot
npm test
node --check lib.js
node --check server-config.js
node --check server.js
node --check public/app.js
node --check test/config.test.js
node --check test/core.test.js
node --check test/server.test.js
node --check test/frontend.test.js
git diff --check
```

运行时检查需要先启动服务，再执行：

```bash
curl -s http://127.0.0.1:5179/api/health
curl -I http://127.0.0.1:5179/
```

`CODE_AUDIT.md` 里记录的最近一次完整验证是 90 个测试通过。只要工作树是脏的，这条记录就只能当历史记录，必须重新跑验证。

## 发布流程

常规维护发布按这个顺序走：

```bash
cd /home/ubuntu/ai-novel-copilot
git status --short --branch
git diff --stat
npm test
git diff --check
git add <changed-files>
git commit -m "简短明确的提交说明"
git push origin main
```

提交要小而清楚。不要把未验证的代码、稿件数据、密钥、`.env` 或临时文件混进去。

## 代码地图

- `server.js`：本地 API、静态文件服务、项目持久化、快照、模型代理、写入冲突检查。
- `server-config.js`：端口等整数环境变量解析。
- `lib.js`：项目默认值、归一化、提示词、离线助手、审计、结算、指标、Markdown 导出。
- `public/index.html`：工作台页面结构。
- `public/app.js`：浏览器状态、自动保存、UI 工作流、模型配置、导出与快照。
- `public/styles.css`：响应式界面样式。
- `test/*.test.js`：核心逻辑、配置、服务端、前端 DOM stub 回归测试。
- `CODE_AUDIT.md`：逐行审计记录、修复说明和历史验证结果。
- `REFERENCE.md`：参考项目研究和链接。

## 模型网关注意事项

没有 API key 时，应用会使用确定性的离线助手。使用真实模型时，浏览器把模型配置随请求发给本地 Node 服务；API key 只存在浏览器 `localStorage`，服务端不落盘。

默认情况下，模型 Base URL 不能指向或解析到私有地址、链路本地地址、多播地址、云元数据地址或非 localhost 的回环地址。本地 `localhost`、`127.0.0.1` 网关允许使用。

如果明确要连可信的局域网或 Tailnet 模型网关，用：

```bash
ALLOW_PRIVATE_MODEL_BASE_URLS=1 npm start
```

排查模型问题时，不要打印或提交 API key。

## 逐行审计清单

继续“逐行分析、查缺补漏”时，按这个循环推进：

1. 用行号读当前文件。
2. 找崩溃路径、静默数据丢失、不安全类型转换、竞态、Markdown 注入、路径处理、旧版本写入和缺失测试。
3. 做一个边界清晰的修复。
4. 增加或更新聚焦的回归测试。
5. 先跑目标测试，再跑完整验证。
6. 只有实现并验证后，才更新 `CODE_AUDIT.md`。

常用检查命令：

```bash
nl -ba lib.js | sed -n '1,220p'
nl -ba server.js | sed -n '1,260p'
rg "String\(|JSON\.parse|writeFile|rename|versionToken|localStorage|innerHTML|fetch\(" lib.js server.js public/app.js
```

## 当前停止点

分支是 `main`，远端已配置。继续维护前先确认：

```bash
git status --short --branch
git log --oneline -3
```

上一轮记录的 `lib.js` 未完成点已经处理并验证：

- `formatSettlement(undefined)` 不再因为 `timelineEvent` 空值崩溃。
- `offlineRevise` 的 audit 输入统一走文本归一化。
- 直接传入 object/array/boolean 的文本 helper 已有回归测试，避免生成 `[object Object]` 或假正文。
- `applySettlement()` 直接入口现在不会让空白 incoming 标题、计划、审校、状态或创建时间覆盖已保存章节元数据。
- 前端 settlement 报告显示现在会对畸形 API 字段回落到默认文案，不再显示 `[object Object]` 或数组伪文本。
- 当前完整测试为 94 个通过。

下次继续逐行审计前先看：

```bash
git status --short --branch
git diff
```

## 故障恢复

如果应用无法启动：

```bash
node --check server.js
node --check lib.js
PORT=5180 npm start
```

如果保存返回 `409`，先刷新浏览器里的项目再保存。通常是另一个标签页或延迟 autosave 已经写入了更新的 `versionToken`。

如果改代码后 UI 仍像旧版本，重启 `npm start` 并强制刷新浏览器。这个项目没有构建步骤，页面由 Node 静态服务直接提供。
