# Godot 客户端

Godot 4.7 标准版、GDScript，PC 1280×720 优先。正常入口是 `scenes/Main.tscn`；该场景仅负责 bootstrap，大部分运行时世界、战斗和 UI 由脚本构造。

## 开发入口

- [整个项目的现状](../../docs/project-status.md)：当前主目录为唯一日常开发入口。
- [架构与功能定位](../../docs/architecture.md)：按领域查脚本和服务端消费者。
- [开发流程](../../docs/development.md)、[测试指南](../../docs/testing.md)。
- [客户端执行约束](AGENTS.md)、[自动代码索引](../../docs/reference/code-index.md)。

以下从仓库根目录执行：

```sh
npm --prefix server/node run ops -- start
godot --path client/godot --scene res://scenes/Main.tscn
```

正常联机路径由服务器决定账号、档案、物品、货币、移动接受和战斗结果。客户端提交意图、播放事件、缓存权威投影；本地预览模型不是联机结算依据。

## 修改位置

| 目录 | 放什么 |
| --- | --- |
| `scripts/world/` | 地图、寻路、交互、世界表现 |
| `scripts/battle/` | 战斗事实模型、目录、布局、事件回放 |
| `scripts/progression/` | 档案投影、背包、装备、任务、宠物培养与网络契约 |
| `scripts/net/` | 同步、选角和重连协调 |
| `scripts/ui/` | 控件、presenter、面板 controller 和注册 |
| `scripts/player/`、`scripts/pet/`、`scripts/audio/` | 人物/宠物/声音表现和资源生命周期 |
| `scripts/qa/` | 自动检查和审查场景 |
| `data/` | 双端共享的内容与数值 JSON |

新逻辑不继续堆进 `main.gd`、`panel_flow_coordinator.gd`、`auto_check_coordinator.gd`；入口只负责装配和转发。

## 选择检查

```sh
node tools/run_godot_auto_checks.mjs --help
node tools/run_godot_auto_checks.mjs --list
```

按修改领域使用 `--only`。该运行器采用隔离 QA lane；只做解析时使用 `--parse-only`，领域回归使用 `--only`。具体命令和本地 QA 后端前置见 [测试指南](../../docs/testing.md)。

旧 Phase 62 功能列表与局部预览记录保留在 [历史手册](../../docs/bak/handbooks_20260917/client-readme.md)，不再当作当前能力清单。
