# Phase97 装备状态提示闭环

## 目标

- 转生后仍保留在槽位、但暂不生效的装备，需要在更多入口被玩家看见。
- 背包和装备铺的换装预览，需要明确提示“需求未满足，装备后暂不生效”。
- 装备栏空槽推荐只推荐当前真的可以装备的物品。

## 行为

- 人物状态面板的“装备加成”下方显示：
  - `装备: N件生效 / M件未生效`
  - 有失效装备时，列出 `未生效: 装备名（原因）`
- 转生预览在可转生、且当前生效装备会在转生后不满足需求时，追加：
  - `装备影响: 转生后部分装备可能暂不生效。`
  - `可能暂不生效: ...`
- 背包和装备铺选中当前不满足需求的装备时，换装预览追加：
  - `需求未满足，装备后暂不生效。`
- 装备槽推荐会继续排除当前等级/转生数不满足需求的装备。

## 自测

```bash
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-status-closure-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-inactive-after-rebirth-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-requirement-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-shop-preview-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-player-status-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-player-rebirth-preview-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-qa-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --shop-select-perf-check
```

## 结果

- `--auto-equipment-status-closure-check`: ok
- `--auto-equipment-inactive-after-rebirth-check`: ok
- `--auto-equipment-requirement-check`: ok
- `--auto-equipment-shop-preview-check`: ok
- `--auto-player-status-check`: ok
- `--auto-player-rebirth-preview-check`: ok
- `--auto-equipment-check`: ok
- `--auto-qa-panel-check`: ok
- `--movement-spam-click-check`: ok, `clicks=120`, `applied=2`
- `--shop-select-perf-check`: ok, `item_us=649004`, `equipment_us=954916`

## 预览证据

- `/Users/fander/projects/Beastbound_Odyssey/.run/godot/phase97_equipment_status_closure00000119.png`

