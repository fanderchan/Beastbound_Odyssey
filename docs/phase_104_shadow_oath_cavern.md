# Phase104 玄影洞窟与转生兽捕捉层

## 目标

把最终转生洞窟从合同推进到可加载、可捕捉、可打顶层 boss 的基础闭环：

- `漆黑洞穴` 在本项目中命名为 `玄影洞窟`。
- 火芽村入口新增 `玄影洞窟入口`。
- 玄影洞窟为 5 层地图。
- 前 3 层可以捕捉 Lv50 转生兽。
- 顶层触发平均 Lv110 的 10V10 转生守护战。
- 顶层中心主怪为 Lv122 `玄影转生兽`，携带冲撞、催眠、混乱、石化等强技能。

## 数据与地图

新增宠物模板：

- `转生兽系`
- `试炼转生兽`
- `地灵转生兽`：`rebirth_beast_earth_lv50`
- `水灵转生兽`：`rebirth_beast_water_lv50`
- `火灵转生兽`：`rebirth_beast_fire_lv50`
- `风灵转生兽`：`rebirth_beast_wind_lv50`

新增地图：

- `shadow_oath_cavern`：玄影洞窟一层，捕捉地灵转生兽。
- `shadow_oath_cavern_f2`：玄影洞窟二层，捕捉水灵转生兽。
- `shadow_oath_cavern_f3`：玄影洞窟三层，捕捉火灵、风灵转生兽。
- `shadow_oath_cavern_f4`：玄影洞窟四层，过渡层。
- `shadow_oath_cavern_f5`：玄影洞窟顶层，转生守护战。

`rebirth_trials.json` 的 `finalCave` 新增：

- `floorMapIds`
- `captureFloorMapIds`
- `bossFloorMapId`

## 战斗与捕捉

- 捕捉层使用普通野怪遭遇，可捕捉，等级固定 Lv50。
- 顶层 boss 使用固定 10 只怪，等级数组为 `108, 109, 122, 109, 108, 110, 111, 110, 107, 106`，平均 Lv110。
- 顶层 boss 怪物显式 `catchable=false`，避免玩家把 boss 当成可捕捉目标。
- `BattleModel` 和 `EncounterModel` 支持遭遇表覆盖 `catchable` / `captureDifficulty`。

## 自测

```sh
jq empty client/godot/data/pet_templates.json client/godot/data/battle_rewards.json client/godot/data/firebud_village_gate_map.json client/godot/data/shadow_oath_cavern*_map.json client/godot/data/rebirth_trials.json
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-shadow-oath-cavern-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-pet-template-catalog-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-rebirth-trial-contract-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-rebirth-cave-guardian-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-remote-stable-unlock-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-player-rebirth-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-quest-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-pet-codex-list-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-battle-reward-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-npc-quest-marker-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-map-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --shop-select-perf-check
```

## 结果

- `--auto-shadow-oath-cavern-check`: ok，`floors=5`，`capture_forms=4/4`，`boss_count=10`，`boss_avg=true`，`center=true`。
- `--auto-pet-template-catalog-check`: ok。
- `--auto-rebirth-trial-contract-check`: ok。
- `--auto-rebirth-cave-guardian-check`: ok。
- `--auto-remote-stable-unlock-check`: ok。
- `--auto-player-rebirth-chain-check`: ok。
- `--auto-quest-chain-check`: ok。
- `--auto-pet-codex-list-check`: ok。
- `--auto-battle-reward-check`: ok。
- `--auto-npc-quest-marker-check`: ok。
- `--auto-map-panel-check`: ok，`marker_count=15`，新增玄影洞窟入口后符合预期。

## 性能基线

- Phase103 记录：`movement applied=2`，商店 `item_us=2670827`，`equipment_us=4165710`。
- Phase104 当前：`movement applied=2`，商店 `item_us=2123371`，`equipment_us=3644610`。

结论：

- 移动连点合并仍稳定。
- 商店选择 microbenchmark 仍偏高，但本阶段较 Phase103 略低；继续作为独立优化项保留。

## 后续

Phase105 已接入执行层：

1. 导师转生条件升级为检查四戒指、对应转生兽、玄影顶层 boss 胜利。
2. 执行转生时会消耗四戒指、交出对应转生兽，并让人物 Lv1 后回到记录点。
3. 每转 starter 战宠和道具/装备奖励已落成真实奖励。
