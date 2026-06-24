# Phase98 二转到六转转生框架

## 目标

让人物转生系统从“一转演示”扩展为完整的 1-6 转框架，同时不提前进入复杂终版数值。

## 规则

- 新增 `二转资格` 到 `六转资格` 五个任务。
- 每个资格任务都由转生导师阿岚完成，第一版都是对话确认。
- 转生资格任务不再用普通 `nextQuestId` 直接串起来：
  - 0转时只开放一转资格。
  - 执行一转后，才开放二转资格。
  - 以此类推，执行五转后开放六转资格。
  - 执行六转后不再开放新转生资格任务；Phase99 起会接入远程兽栏任务。
- 每转执行仍要求：
  - 当前转生资格任务已记录。
  - 人物 Lv80。
  - 未达到 6 转上限。
- 转生执行继续沿用同一套预览和二次确认。

## 暂不做

- 不做每转不同地图、指定宠物、指定道具或战斗考验。
- 不做终版转生数值公式。
- 不做六转后远程兽栏任务，只为后续阶段留出入口。

## 自测

```bash
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-player-rebirth-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-player-rebirth-execute-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-player-rebirth-preview-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-quest-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-quest-ui-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-status-closure-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-equipment-inactive-after-rebirth-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-qa-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --shop-select-perf-check
```

## 结果

- `--auto-player-rebirth-chain-check`: ok，1-6 转完整链路通过。
  - 当前版本执行六转后会进入 `远程兽栏` 后置任务，而不是空任务。
- `--auto-player-rebirth-execute-check`: ok。
- `--auto-player-rebirth-preview-check`: ok。
- `--auto-quest-chain-check`: ok。
- `--auto-quest-ui-check`: ok。
- `--auto-equipment-status-closure-check`: ok。
- `--auto-equipment-inactive-after-rebirth-check`: ok。
- `--auto-qa-panel-check`: ok。
- `--movement-spam-click-check`: ok，`clicks=120`，`applied=2`。
- `--shop-select-perf-check`: ok，`item_us=574987`，`equipment_us=890959`。

## 预览

```bash
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase98_rebirth_chain.png --quit-after 120 -- --player-rebirth-chain-preview
```

截图证据：

- `/Users/fander/projects/Beastbound_Odyssey/.run/godot/phase98_rebirth_chain00000072.png`
