# Phase 543：项目导航、文档治理与 HTTP 模块边界

日期：2026-09-17。范围：原 `main` 工作区的代码与文档整理；这是用户明确提出的维护工作，不推进产品或发布路线图项。

## 问题与基线

项目已有成熟的服务端权威和候选发布管线，但首页仍混有本地战斗实验描述，客户端 README 停在 Phase 62，架构文档还写“可接服务端”。历史计划、现行指南与数百份 Phase 缺少统一入口。

本目录 HEAD 为 `1f22eded5`，本地 `origin/main` 为 `ddcb4ff77`；原有 116 个 tracked 修改、110 个 untracked 文件。发布候选工作区 HEAD 为 `0bd9ea705`，比本目录多 60 个提交，另有 133 条 Git 可见改动。候选发布游标是 `R1.W024`，本目录副本仍是 `R1.01`。本次只读核对各工作区，没有 fetch、切分支、合并或改候选工作区。

原有 226 个改动文件在整理前保存路径、状态和 SHA-256，位于本机忽略的 `.run/repository-organization-20260917/initial-files.json`。本轮开始时的 Git 状态及要重写的干净手册/HTTP 源文件也在该目录留有快照。

## 最终结构

- 根 README 负责项目定位、当前入口、最小启动与目录职责。
- `docs/README.md` 统一导航；现状、架构、开发、测试、维护各自负责单一主题。
- `docs/reference/code-index.md` 自动列出代码、测试、工具、共享数据和大文件；`phase-index.md` 按编号分组，保留同号不同记录。
- 旧手册进入 `docs/bak/handbooks_20260917/`，保留内容和历史测试证据；原 Phase、资产源和冻结证据不移动、不删除。
- 已完成的根目录计划和专项 QA 记录增加历史标识。AGENTS 指向现行指南并要求维护自动索引。

## 导航工具合同

`tools/repository_guide.mjs` 使用 Node 22+ 内置能力，没有新增依赖：

- `status` 读取全部本地 worktree 的 branch、HEAD、改动数、发布游标与 runner 能力；远端信息只来自本地引用。
- `refresh` 只写两份固定索引；输入是当前工作区 Git 可见文件，含未提交源码，不扫描忽略缓存和私有制作档案，不跟随符号链接读取。
- `check` 不改文件；索引过期、现行指南缺失或本地链接目标不存在时返回非零。
- 不启动游戏、服务器，不联网、不连接数据库、不改变 Git。链接检查明确不覆盖全部历史文档、标题锚点或外部 URL。

## HTTP 代码整理

将邮箱、归档与奖励仓三个 `*OptionsFromSearchParams` 函数从 `http-server.js` 提取到 `http-list-options.js`，原函数体保持不变。路由继续调用相同适配器，领域 normalizer、错误码、中文文案、权限、事务、协议号和数据库行为均不变。

兼容风险是三个端点并不完全相同：收件箱允许省略分页并忽略无关查询字段；归档和奖励仓要求显式 limit 且拒绝额外字段。独立模块保留这个差异，回归覆盖重复字段、非法 limit、无效及跨领域游标，避免为了去重改变旧行为。

## 验证

修改前基线：

```sh
node --test server/node/test/auth-http-server.test.js server/node/test/auth-reward-vault.test.js server/node/test/mail-inbox-pagination.test.js server/node/test/mail-archive-pagination.test.js server/node/test/reward-vault-pagination.test.js
```

结果：51/51，通过，无 skip。

本轮完成验证：

```sh
git diff --check
node --check tools/repository_guide.mjs
node --check server/node/src/http-server.js
node --check server/node/src/http-list-options.js
node --test tools/test/repository_guide.test.mjs server/node/test/http-list-options.test.js server/node/test/auth-http-server.test.js server/node/test/auth-reward-vault.test.js server/node/test/mail-inbox-pagination.test.js server/node/test/mail-archive-pagination.test.js server/node/test/reward-vault-pagination.test.js
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
node tools/repository_guide.mjs status
```

结果：目标 Node 回归 **61/61**，无失败、无 skip；三个 Node 语法检查与 `git diff --check` 通过。索引生成覆盖当前工作区 **896 个代码/测试文件、86 个共享 JSON、495 份阶段记录**；现行指南本地链接与索引时效检查通过。首次链接检查找出架构表中错误的 `auth-world.test.js`，已修正到实际 `auth-social-world.test.js` 后复检。

三个提取函数体与修改前源文件逐字一致。整理前记录的 **226/226** 个原有改动文件 SHA-256 保持不变；候选与旧融合工作区没有本轮写入。测试仅使用隔离夹具，无本轮创建的持续服务器或 Godot 进程。

## 边界与后续

本轮不修改玩法、资产、GDScript、共享 JSON、玩家数据库或已存候选。未运行全量 CI、Godot GUI、生产容量与美术验收；当前发布状态继续 BLOCKED。大协调器的分域拆分记录在维护清单，需随明确功能和正确基线逐片实施，不能以一次目录整理宣布架构债已清零。

没有提交或推送本次维护改动。后续如需把它带入发布候选，应移植本轮精确文件和 HTTP 提取，保留候选已存在的其他修复；不能用本目录较旧的整份 `http-server.js` 覆盖候选版本。
