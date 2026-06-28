# Phase102 四元素洞穴入口与守护兽闭环

## 目标

把 Phase101 的转生洞穴合同向可玩闭环推进一步：

- 火芽村入口可以进入四个元素洞穴。
- 每个元素洞穴有返回火芽村的出口。
- 每个洞穴顶层有固定 10 只守护兽，使用现有 10V10 站位合同。
- 守护兽中心主怪固定在敌方前排 3 号位，等级更高并携带强技能。
- 击败对应守护兽后可以通过现有战斗奖励系统获得对应元素戒指。

## 本阶段实现

新增地图：

- `earth_vein_cave`：岩脉洞穴，掉落 `地之戒`。
- `tide_echo_cave`：潮回洞穴，掉落 `水之戒`。
- `ember_core_cave`：焰心洞穴，掉落 `火之戒`。
- `gale_breath_cave`：岚息洞穴，掉落 `风之戒`。

新增/更新数据：

- `bag_items.json` 新增四枚元素戒指。
- `battle_rewards.json` 新增四个守护兽奖励表。
- `firebud_village_gate_map.json` 新增四个洞穴入口 warp 和返回 spawn。
- `EncounterModel` 支持 `fixedWildPets`，让守护兽战按配置固定生成 1-10 号位。
- `BattleModel` 在固定野怪生成 actor 时保留 `activeSkillIds` / `petSkillSlots` / `passiveSkillIds`。
- `Main.tscn` 自测入口新增 `--auto-rebirth-cave-guardian-check`。

## 守护兽规则

当前四个洞穴守护战均为：

- 10 只怪。
- 等级数组为 `98, 99, 112, 99, 98, 100, 101, 100, 97, 96`，平均 Lv100。
- 敌方前排 3 号位为中心主怪，Lv112。
- 中心主怪携带对应强技能，例如冲撞、催眠、混乱、石化中的组合。

这一步先做“可进入、可遭遇、可掉戒指”的基础闭环；洞穴仍是轻量地图。后续再扩展成真正多层迷宫和更完整的楼层规则。

## 自测

```sh
jq empty client/godot/data/bag_items.json client/godot/data/battle_rewards.json client/godot/data/firebud_village_gate_map.json client/godot/data/earth_vein_cave_map.json client/godot/data/tide_echo_cave_map.json client/godot/data/ember_core_cave_map.json client/godot/data/gale_breath_cave_map.json client/godot/data/rebirth_trials.json
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-rebirth-cave-guardian-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-rebirth-trial-contract-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-remote-stable-unlock-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-player-rebirth-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-npc-quest-marker-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-quest-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-battle-reward-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-quest-ui-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-requirement-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-slot-detail-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-map-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --shop-select-perf-check
```

## 结果

- `--auto-rebirth-cave-guardian-check`: ok，四洞穴入口、返回、固定 10 怪、中心主怪、戒指奖励、导航目标均通过。
- `--auto-rebirth-trial-contract-check`: ok。
- `--auto-remote-stable-unlock-check`: ok。
- `--auto-player-rebirth-chain-check`: ok。
- `--auto-npc-quest-marker-check`: ok。
- `--auto-quest-chain-check`: ok。
- `--auto-battle-reward-check`: ok。
- `--auto-quest-ui-check`: ok。
- `--auto-equipment-requirement-check`: ok。
- `--auto-equipment-slot-detail-check`: ok。
- `--auto-map-panel-check`: ok。
- `--movement-spam-click-check`: ok，`clicks=120`，`applied=2`。
- `--shop-select-perf-check`: ok，`item_us=2417917`，`equipment_us=4183295`。

## 性能基线

- Phase99 记录：`movement applied=2`，商店 `item_us=633363`，`equipment_us=900568`。
- Phase101 记录：`movement applied=2`，商店约 `item_us=1994033`，`equipment_us=3613408`。
- Phase102 当前：`movement applied=2`，商店 `item_us=2417917`，`equipment_us=4183295`。

结论：

- 移动连点仍保持合并，没有回到“疯狂点击导致寻路打满”的问题。
- 商店选择 microbenchmark 仍偏高，并比 Phase101 单独重跑更高。本阶段未改商店 UI 路径，先继续记录为待优化风险，后续应单独拆装备详情/商店列表刷新成本。

## 下一步

1. Phase103 已把四个洞穴扩成 4 层链路：入口层、中层、顶层，顶层守护兽只在最后一层触发。
2. 建立 `玄影洞窟` 与 Lv50 转生兽捕捉层。
3. 接入导师任务条件：四戒指、对应转生兽、最终守护战完成后才能执行本轮转生。
4. 把每转 Lv1 starter 战宠和奖励规划落成真实奖励。
