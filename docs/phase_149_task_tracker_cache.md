# Phase149：HUD / 任务追踪缓存

本阶段目标是降低移动帧里的任务相关开销，不新增玩法。

## 本轮范围

- 为任务追踪新增缓存：任务文本、任务寻路目标、是否可寻路。
- `HUD` 和右上角寻路按钮只读取缓存，不在刷新按钮时重新全量计算任务目标。
- NPC 任务标记新增 dirty/force 刷新机制：
  - 世界重绘签名读取缓存。
  - 绘制 NPC 标记时使用非强制刷新。
  - 测试、面板、点击寻路等主动查询仍可强制刷新，避免直接改 `player_profile` 的自测拿到旧结果。
- 增加 `_save_player_profile_now()`，让散落的 profile 保存点能统一触发任务 UI 缓存失效。

## 热点路径规则

这些路径只能读轻量缓存：

- `_world_hud_signature`
- `_update_hud_text` 的 route button 分支
- `_refresh_task_route_button`
- `_world_draw_signature`
- `_draw_npc_quest_marker`

这些路径允许强制计算：

- 玩家点击任务寻路。
- 打开任务面板。
- 自测直接调用 `_quest_marker_state_for_item`。
- profile 保存、切地图后第一次刷新。

## 后续建议

1. 将散落的 `player_profile = ...` 修改点继续收敛成少数 profile mutation helper。
2. 背包、商店、宠物、装备面板拆 view/controller，减少 `main.gd` 继续膨胀。
3. 后续如果任务类型增加，优先在任务模型层提供轻量 tracker receipt，避免 UI 再扫完整 profile。

## 本轮验证

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-task-tracker-route-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-npc-quest-marker-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
godot --path client/godot --scene res://scenes/Main.tscn --quit-after 30
```

结果：

- Godot 解析检查通过。
- 任务寻路通过：`status=ok`，`button=true`，`route=true`，`disabled_after=true`，`reenabled=true`。
- NPC 任务标记通过：`available=true`，`accepted_talk=true`，`in_progress=true`，`ready=true`，`blocked=true`，`hidden=true`，`rebirth=true`。
- 移动连点通过：`clicks=360`，`coalesced=true`，`settled=true`，`final_match=true`。
- 人物状态加点保存通过：`elapsed_ms=3.21`，`refresh_count=2`，`saves=1`。
- QA 面板通过：`button_count=18`，`gm_level=true`，`gm_mm_level=true`。
- 商店选择通过：`item_us=1513393`，`equipment_us=2145298`。
- 服务端 profile 契约通过：`modules=24`，`equipment_instances=18`，无 profile error。
- `--perf-probe` 启动首轮仍有 HUD 构建尖峰；稳定后 `hud_signature` 约 `0.03-0.06ms`，`redraw_check` 约 `0.01-0.04ms`，`process_total` 多数约 `0.19-0.37ms`。
- 完整客户端入口通过：`godot --path client/godot --scene res://scenes/Main.tscn --quit-after 30` 可启动并自动退出；无 Godot 残留进程。
