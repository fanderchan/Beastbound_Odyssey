# 开发与迭代流程

本文中的命令默认在 `/Users/fander/projects/Beastbound_Odyssey` 执行。日常开发固定使用这个主目录；[项目现状](project-status.md) 记录统一结果和当前待办。

## 重新开始开发

```sh
node tools/repository_guide.mjs status
git status --short --branch
git log -5 --oneline
```

然后读主目录的产品路线图“进度追踪”、发布计划（若做发布工作）、目标目录的 AGENTS，以及最新相关 Phase。明确需求优先于计划游标；普通“继续”按既定路线图规则推进，不能被旧目录中的未勾选项带偏。

## 开发环境与启动

需要 Node.js 22+、Godot 4.7 标准版、Python 3（部分工具），以及已配置的本地 MySQL 9.7。Node 依赖由 [package-lock.json](../server/node/package-lock.json) 固定：

```sh
npm --prefix server/node ci
npm --prefix server/node run ops -- status
```

已有数据库配置时，正常启动方式：

```sh
npm --prefix server/node run ops -- start
godot --path client/godot --scene res://scenes/Main.tscn
```

这是正常玩家客户端，会连接账号服务并使用玩家数据。根目录 `start-backend.command` 是双击重启入口；开发者日常查询、启动、备份和关闭统一使用 `ops`。详细配置与存储边界见 [服务端说明](../server/node/README.md)。

凭据使用已有的本机忽略配置；不要把它们写进文档、命令行参数或 Git。初次建库与数据迁移是独立操作，不能把现有数据库当作可随时重建的测试夹具。

## 从一个需求到一轮交付

1. **定位**：在 [架构表](architecture.md) 找客户端入口、服务端域、共享 JSON 和测试；用 [代码索引](reference/code-index.md) 和 [阶段索引](reference/phase-index.md) 追读。
2. **定义边界**：写清玩家可见行为、服务端权威事实、需要修改的契约与不涉及的范围。经济规则、公式、账号政策等未决定的产品问题先取得决定。
3. **实现**：优先修改负责该领域的模块。入口文件只做接线；共享 ID、协议和持久化变更追踪所有消费者。保持现有中文文案和交互，除非本轮明确要求改变。
4. **验证**：先 `git diff --check`、语法与最窄回归。玩家体验和热点变更补真实客户端、静止/移动/输入压力证据；见 [测试指南](testing.md)。
5. **记录**：新增或更新一份相关 Phase，说明问题、最终行为、验证和剩余限制。对应路线图项确实完成后才勾选；资产候选保持真实生命周期。
6. **更新导航**：运行下面两条命令。索引纳入 Git 可见的未提交代码，但不会把它视为已发布。

```sh
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

## 代码和产物放在哪里

| 内容 | 位置 |
| --- | --- |
| 客户端领域逻辑与 UI | `client/godot/scripts/` 对应子目录 |
| 服务端领域逻辑 | `server/node/src/auth/`；HTTP/网络基础设施放 `src/` |
| 双端共享内容与数值 | `client/godot/data/` |
| 服务端测试 / 工具测试 | `server/node/test/` / `tools/test/` |
| 当前操作说明 | 本文、架构、测试、模块 README |
| 阶段证据与产品决定 | `docs/phase_XXX_*.md`，先检查所用工作区是否已有该编号 |
| 运行日志、临时报告、测试数据 | 已忽略的 `.run/`；不能混入产品源码 |
| 正式资产及其生产证明 | 既有资产包和专用 Skill 规定的位置；冻结证据不是缓存 |

宠物、NPC、地图、技能和音频的具体生产必须按对应 Skill；通用目录整理不能绕过它们的契约与验收。

## Git 交付

普通整理请求不自动提交或推送；长期路线图的既有窄提交授权按 AGENTS 执行。混合工作树只暂存本次精确路径，检查 staged diff；不要用 `git add -A` 把历史候选一起带走。推送前核对分支、远端所有者和 Git 身份，保持项目规定的 SSH remote。

旧候选和融合目录保留作历史现场。若以后确需隔离的发布工作区，由开发者建立并在本文和项目现状中写清用途；不要让多个目录长期各自推进。发布前在实际交付树重新生成索引并运行 `check`。
