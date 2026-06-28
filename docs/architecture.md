# Beastbound Odyssey 架构说明

本文档描述当前 Godot 客户端的模块边界、热点路径和后续拆分方向。目标是让项目从阶段性 vibe coding 逐步变成可维护、可开源协作、可接服务端的工程。

## 当前模块

### 场景入口

- `client/godot/scenes/Main.tscn`
- 主脚本：`client/godot/scripts/main.gd`

`main.gd` 当前仍是总控脚本，负责启动参数、地图加载、HUD、面板、任务寻路、战斗播放、GM/QA 入口等。它是现阶段最大架构债。后续新增功能应优先落在独立 model/view 脚本里，再由 `main.gd` 编排。

### 战斗层

- `client/godot/scripts/battle/battle_model.gd`
- `client/godot/scripts/battle/battle_event_ledger.gd`
- `client/godot/scripts/battle/battle_action_catalog.gd`
- `client/godot/scripts/battle/battle_status_model.gd`
- `client/godot/scripts/battle/pet_template_catalog.gd`

战斗层应尽量保持纯数据输入输出。战斗结果、回合事件、命中、伤害、状态、捕捉和骑宠扣血应由模型生成事实，再由 `main.gd` 或未来的战斗 view 播放。

### 进度 / 存档层

- `client/godot/scripts/progression/player_progress_model.gd`
- `client/godot/scripts/progression/backpack_model.gd`
- `client/godot/scripts/progression/equipment_model.gd`
- `client/godot/scripts/progression/quest_model.gd`
- `client/godot/scripts/progression/pet_growth_observation_model.gd`
- `client/godot/scripts/progression/server_profile_contract_model.gd`

`player_progress_model.gd` 已经承担过多职责，后续应分层：

- `player_profile_model`：人物基础、货币、等级、记录点。
- `pet_collection_model`：宠物队伍、兽栏、放地上、锁定、防误操作。
- `inventory_profile_model`：背包、邮件、道具堆叠、容量。
- `equipment_profile_model`：装备实例、耐久、强化、精灵来源。
- `quest_progress_model`：任务状态、目标进度、可接/可交。
- `server_profile_adapter`：本地存档到后端契约迁移。

### 数值表层

- `client/godot/data/balance/*.json`
- `client/godot/scripts/progression/balance_catalog_model.gd`

数值 JSON 是后续数值策划主入口。核心原则：

- 新平衡新增版本，不覆盖旧版本语义。
- 战斗、成长、掉落、经济都要能用固定 seed 重放。
- 数值表改动要跑对应自测和数值报告。

### UI / QA 层

- `client/godot/scripts/ui/pet_growth_radar_control.gd`
- `client/godot/scripts/ui/panel_registry.gd`
- `client/godot/scripts/ui/qa_panel_catalog.gd`
- `client/godot/scripts/ui/backpack_panel_presenter.gd`

普通玩家 UI 不应显示工程验证文本、raw flag、实现细节或自测命令。GM/QA 工具可以保留测试入口，但应逐步从 `main.gd` 拆成独立模块。

`PanelRegistry` 负责统一维护点击遮挡面板和世界菜单面板。新增玩家面板时应优先注册到这里，不要再在 `_is_ui_point` 或 `_world_menu_is_open` 里手写重复数组。

`BackpackPanelPresenter` 负责背包筛选页签、筛选标签、槽位筛选匹配、选中道具详情文本装配和动作按钮状态。背包容量、道具堆叠、交易、使用、装备事务和邮箱兜底仍归 progression model 与 `main.gd` 编排处理；后续可继续把背包格子按钮渲染迁入 UI 层。

## 热点路径

以下路径对移动卡顿和 CPU 尖峰敏感：

- `_process`
- `_world_hud_signature`
- `_world_draw_signature`
- `_update_world_hud_if_needed`
- `_current_task_text`
- `_refresh_task_route_button`
- 任务寻路目标计算
- 地图 marker / quest marker 刷新
- 背包、商店、宠物列表选中刷新

热点路径规则：

- 不调用完整 `normalize_profile`。
- 不全量扫描任务、地图、宠物和背包。
- 不构建复杂 UI 文本。
- 使用 raw 字段、轻量 signature 和缓存。
- 功能完成后必须验证 idle 和移动场景。

任务追踪在 Phase149 后有专用缓存：HUD 和世界重绘签名只能读 `_task_tracker_signature_for_hud()`、`_quest_marker_signature()` 这类缓存结果；玩家点击寻路、打开任务面板、自测直接查询时才允许强制刷新任务目标或 NPC 标记。

## 兼容层

当前仍存在一些有意保留的兼容层：

- `--battle-debug-window` 旧参数：只作为 trace 开关兼容，不再打开玩家窗口。
- 装备旧字段兼容：从装备实例派生旧字段，保证旧 UI 和战斗逻辑继续工作。
- `combatFormulaDriver=legacy/table`：默认仍保持旧行为 parity，表驱动切换需要单独评审。

兼容层不能无限期增加。新增兼容字段时必须写清楚：

- 什么时候生成。
- 谁读取。
- 迁移后如何淘汰。
- 对应自测命令。

## 后续治理顺序

1. 背包、商店、宠物、装备面板继续拆成 view/controller。
2. `player_progress_model.gd` 按存档领域分层。
3. 战斗播放 view 从 `main.gd` 抽出。
4. 继续收敛散落的 profile mutation / save helper。
5. 服务端 profile contract 对齐 Node.js / MySQL 原型。
