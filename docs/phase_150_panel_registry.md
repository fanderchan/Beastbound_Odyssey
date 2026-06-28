# Phase150-A：面板注册表

本阶段目标是继续降低 `main.gd` 的 UI 维护成本。先做一个小但关键的基础设施：把“哪些面板会挡住地图点击”和“哪些面板算世界菜单打开”从重复数组中抽出来。

## 本轮范围

- 新增 `client/godot/scripts/ui/panel_registry.gd`。
- `main.gd` 在 HUD 构建完成后统一注册：
  - `input_blockers`：用于 `_is_ui_point`，防止地图点击穿透 UI。
  - `world_menu_panels`：用于 `_world_menu_is_open`，防止挂机、自动寻路、点击移动在菜单打开时继续执行。
- `_is_ui_point` 和 `_world_menu_is_open` 改为读取注册表。
- 修正一个历史漏项：`equipment_synthesis_panel` 现在也会挡住地图点击。
- 新增 `--auto-panel-registry-check`，专门验证面板注册表行为。

## 设计边界

- 不改变各面板布局。
- 不改变背包、装备、宠物、商店业务逻辑。
- 不把 GM/QA 文本显示到普通玩家 UI。
- 当前只是 Phase150 的第一步；后续仍应继续拆背包、商店、宠物、装备的 view/controller。

## 本轮验证

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-panel-registry-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-qa-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-equipment-synthesis-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
godot --path client/godot --scene res://scenes/Main.tscn --quit-after 30
```

结果：

- Godot 解析检查通过。
- 面板注册表通过：`registry=true`，`top_blocks=true`，`synthesis_menu=true`，`synthesis_blocks=true`，关闭后 `clear=true`。
- QA 面板通过：`button_count=18`。
- 装备合成通过：`status=ok`，`ui_ready=true`，`ui_result=true`。
- 移动连点通过：`clicks=360`，`coalesced=true`，`settled=true`，`final_match=true`，`avg_input_us=12`，`max_input_us=391`。
- `--perf-probe` 启动首轮仍有 HUD 构建尖峰；稳定后 `hud_signature` 约 `0.03-0.08ms`，`redraw_check` 约 `0.01-0.03ms`，`process_total` 多数约 `0.17-0.33ms`。
- 完整客户端入口可启动并自动退出；无 Godot 残留进程。
