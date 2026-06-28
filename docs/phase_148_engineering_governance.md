# Phase148：工程治理第一阶段

本阶段目标不是新增玩法，而是降低继续迭代的成本。

## 本轮范围

- 更新 README 顶部状态，避免继续显示过期 Phase62。
- 新增架构说明：`docs/architecture.md`。
- 新增测试与性能基线说明：`docs/testing.md`。
- 将 GM/QA 面板静态入口和自测命令文本抽到 `QaPanelCatalog`。
- 清理已无效的 battle debug window UI 旧代码；`--battle-debug-window` 仍作为 trace 兼容开关存在。

## 不在本轮范围

- 不改战斗手感。
- 不改数值公式。
- 不重写存档结构。
- 不拆 HUD / 任务寻路缓存；这应作为下一阶段单独做并单独压测。

## 后续建议

1. Phase149：HUD / 任务寻路缓存化。
2. Phase150：背包、商店、宠物、装备面板拆 view/controller。
3. Phase151：`PlayerProgressModel` 按领域分层。
4. Phase152：战斗播放 view 拆分。

## 本轮验证

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-qa-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --shop-select-perf-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-player-stat-spam-perf-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-server-profile-contract-check
```

结果：

- Godot 解析检查通过。
- QA 面板通过：`button_count=18`，`layout1=true`，`layout2=true`。
- 移动连点通过：`clicks=360`，`coalesced=true`，`settled=true`，`final_match=true`。
- 商店选择通过：单跑结果 `item_us=1260976`，`equipment_us=1971196`。
- 人物状态加点压力通过：`elapsed_ms=1.31`，`refresh_count=2`，`saves=1`。
- 服务端 profile 契约通过：`modules=24`，`equipment_instances=18`，无 profile error。
