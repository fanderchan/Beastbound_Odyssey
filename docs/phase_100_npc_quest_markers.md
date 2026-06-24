# Phase100 NPC 任务头顶标记

## 目标

让 NPC 头像上方显示任务状态，接近经典 MMORPG 的任务标记阅读习惯。

## 规则

- 黄色感叹号：当前任务可推进，第一版用于当前可对话推进的任务 NPC。
- 灰白问号：任务已经在进行中，但还没有满足交付条件，显示在交付 NPC 头顶。
- 黄色问号：任务目标已完成，可以找交付 NPC 交任务。
- 红色感叹号：有后续任务，但当前角色不满足条件，例如转生次数不足。
- 交完任务后，如果没有新的任务状态，标记消失。
- 第一版不重构任务接取模型；仍基于现有“任务链自动激活下一步”的规则显示标记。

## 实现

- 世界层绘制轻量圆形符号，不创建额外 UI 控件。
- 标记状态由当前任务、任务状态、交付 NPC、任务可见门槛计算。
- 世界重绘签名加入任务标记签名，任务变化时才重绘。
- 新增 `--auto-npc-quest-marker-check` 覆盖四态和完成后隐藏。
- 新增 `--npc-quest-marker-preview` 作为手动预览入口。

## 自测

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-npc-quest-marker-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-quest-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-quest-ui-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-facility-marker-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-qa-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-remote-stable-unlock-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --shop-select-perf-check
```

## 预览

```sh
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase100_npc_quest_marker.png --quit-after 120 -- --npc-quest-marker-preview
```

截图证据：

- `/Users/fander/projects/Beastbound_Odyssey/.run/godot/phase100_npc_quest_marker00000119.png`

## 结果

- `--auto-npc-quest-marker-check`: ok，黄色感叹号、灰白问号、黄色问号、红色感叹号、完成后隐藏均通过。
- `--auto-quest-chain-check`: ok。
- `--auto-quest-ui-check`: ok。
- `--auto-facility-marker-check`: ok。
- `--auto-qa-panel-check`: ok。
- `--auto-remote-stable-unlock-check`: ok。
- `--movement-spam-click-check`: ok，`clicks=120`，`applied=2`。
- `--shop-select-perf-check`: ok，`item_us=572432`，`equipment_us=951807`。

## 性能对比

- Phase99 基线：`movement applied=2`，商店 `item_us=633363`，`equipment_us=900568`。
- Phase100 当前：`movement applied=2`，商店 `item_us=572432`，`equipment_us=951807`。
- 结论：移动连点保持合并；商店切换仍在同一档波动，没有新增卡顿迹象。
