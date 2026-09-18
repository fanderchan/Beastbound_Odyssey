# 万兽纪元 / Beastbound Odyssey

原创、受石器时代启发的 **2.5D 回合制宠物 MMORPG**。PC 优先、中文、始终在线；核心体验是抓宠、练宠、观察隐藏成长，再通过转生、进化和融合追求稀有结果。

项目已有较完整的玩法与服务端基础，仍处在开发和候选验收阶段，尚未达到正式收费上线门槛。

## 重新接手，从这里开始

| 你想了解什么 | 入口 |
| --- | --- |
| 游戏做到哪里、现在该用哪个工作区 | [项目现状](docs/project-status.md) |
| 文档应该按什么顺序读 | [文档导航](docs/README.md) |
| 一个功能的代码和测试在哪里 | [架构与功能定位](docs/architecture.md) |
| 怎样启动、修改、验证和交付 | [开发流程](docs/development.md)、[测试指南](docs/testing.md) |
| 后续如何整理大文件 | [维护清单](docs/maintenance.md) |
| 完整文件与历史记录 | [代码索引](docs/reference/code-index.md)、[阶段索引](docs/reference/phase-index.md) |

**日常开发只使用当前 `Beastbound_Odyssey` 主目录。** 更新的发布候选代码、未完成的工具改动及文档整理已统一到这里；另外两个工作区作为历史快照保留。继续开发时读取本目录的计划和进度。

```sh
node tools/repository_guide.mjs status
```

## 运行游戏

需要 Godot 4.7 标准版、Node.js 22+，以及已配置的本地 MySQL 9.7。以下从仓库根目录执行：

```sh
npm --prefix server/node ci
npm --prefix server/node run ops -- start
godot --path client/godot --scene res://scenes/Main.tscn
```

正常客户端通过账号服务登录；这是玩家数据路径。测试环境、隔离 QA 与前置条件见 [测试指南](docs/testing.md)。后端状态、备份和启停见 [服务端说明](server/node/README.md)。

## 仓库布局

| 目录 | 职责 |
| --- | --- |
| `client/godot/` | 客户端输入、世界/战斗表现、UI、同步与自动检查 |
| `client/godot/data/` | 双端共享的玩法、地图、目录与数值 JSON |
| `server/node/src/` | HTTP/WS、账号与玩法权威、持久化和运维基础设施 |
| `server/node/test/` | 服务端行为、事务、协议和存储回归 |
| `tools/` | 自动检查、生产管线、性能与维护工具 |
| `docs/` | 现行指南、架构、阶段记录和自动索引 |
| `.agents/skills/` | 宠物、技能、地图、NPC、音频的正式工作流 |
| `database/mysql/` | 早期数据库方案；当前运行时 schema 以 `mysql-store.js` 为准 |

产品路线图是 [stoneage_gap_plan.md](stoneage_gap_plan.md)，发布执行队列是主目录的 `production_release_loop_plan.md`。旧 `tasks.md`、`release_plan.md`、`quality_cleanup_plan.md` 已完成，作为历史保留。

新增或移动文件后维护导航：

```sh
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```
