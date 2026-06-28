# Phase103 四元素洞穴多层化

## 目标

把 Phase102 的薄洞穴闭环升级成真正的多层入口链路：

- 每个元素洞穴拆成 4 层地图。
- 火芽村入口只进入第 1 层。
- 第 1 层可返回火芽村。
- 第 1/2/3 层只负责跑图与楼层切换，不触发守护兽。
- 第 4 层才出现 10V10 顶层守护兽。
- 任务导航按守护兽 group 找到第 4 层，而不是误指向入口层。

## 数据合同

`rebirth_trials.json` 的每个 `elementCaves` 项新增：

- `floorMapIds`：按顺序列出 1 到 4 层地图。
- `guardianFloorMapId`：守护兽所在地图，必须是 `floorMapIds` 最后一项。

`RebirthTrialModel` 现在校验：

- `floorMapIds.size() == floors`。
- 第一层地图必须等于 `caveId`。
- 守护兽地图必须是最后一层。

## 新增地图

每个洞穴新增 2/3/4 层地图：

- 岩脉洞穴：`earth_vein_cave` -> `earth_vein_cave_f2` -> `earth_vein_cave_f3` -> `earth_vein_cave_f4`
- 潮回洞穴：`tide_echo_cave` -> `tide_echo_cave_f2` -> `tide_echo_cave_f3` -> `tide_echo_cave_f4`
- 焰心洞穴：`ember_core_cave` -> `ember_core_cave_f2` -> `ember_core_cave_f3` -> `ember_core_cave_f4`
- 岚息洞穴：`gale_breath_cave` -> `gale_breath_cave_f2` -> `gale_breath_cave_f3` -> `gale_breath_cave_f4`

第 4 层保留 Phase102 的守护兽配置：10 只怪，平均 Lv100，中心主怪 Lv112 并带强技能。

## 自测

```sh
jq empty client/godot/data/*cave*_map.json client/godot/data/rebirth_trials.json client/godot/data/firebud_village_gate_map.json
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-rebirth-cave-guardian-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-rebirth-trial-contract-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-remote-stable-unlock-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-player-rebirth-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-quest-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-battle-reward-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-npc-quest-marker-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-map-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-slot-detail-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --shop-select-perf-check
```

## 结果

- `--auto-rebirth-cave-guardian-check`: ok，`entrances=4`，`returns=4`，`rings=4`，`chain=true`，`top_only=true`。
- 四个洞穴详情均为 `floors=4`、`chain=true`、`top_only=true`、`pets=10`、`center=true`、`ring=true`。
- `--auto-rebirth-trial-contract-check`: ok。
- `--auto-remote-stable-unlock-check`: ok。
- `--auto-player-rebirth-chain-check`: ok。
- `--auto-quest-chain-check`: ok。
- `--auto-battle-reward-check`: ok。
- `--auto-npc-quest-marker-check`: ok。
- `--auto-map-panel-check`: ok。
- `--auto-equipment-slot-detail-check`: ok。

## 性能基线

- Phase102 记录：`movement applied=2`，商店 `item_us=2417917`，`equipment_us=4183295`。
- Phase103 当前：`movement applied=2`，商店 `item_us=2670827`，`equipment_us=4165710`。

结论：

- 移动连点合并仍稳定，没有因为多地图注册退化。
- 商店选择微基准仍偏高，当前阶段没有改商店 UI 路径，继续保留为独立优化项。

## 下一步

1. Phase104 已建立 `玄影洞窟` 多层地图。
2. Phase104 已在 `玄影洞窟` 前几层放置 Lv50 转生兽捕捉遭遇。
3. Phase104 已在顶层接入平均 Lv110 的转生守护兽战。
4. 下一步让转生导师检查四戒指、对应转生兽、最终战完成状态，再允许执行本轮转生。
