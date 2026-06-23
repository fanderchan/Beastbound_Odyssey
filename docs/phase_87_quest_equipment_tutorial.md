# Phase87 新手换装精灵教学

## 目标

把新手链从“买武器并装备”继续扩展到“装备会改变人物可用精灵”的教学：

- 购买毒藤布衣。
- 装备毒藤布衣，替换默认水纹衣。
- 进入战斗并使用毒藤布衣提供的毒精灵1。

## 玩家流程

1. `准备武器` 完成后，不再直接进入 `村外试炼`。
2. 新任务 `认识装备精灵` 引导玩家去火芽装备铺购买毒藤布衣。
3. 新任务 `换装改变精灵` 引导玩家在随身包装备毒藤布衣。
4. 新任务 `释放毒精灵` 引导玩家去火芽村口草丛，在战斗中使用毒精灵1。
5. 释放毒精灵后自动领取奖励，并继续进入原来的 `村外试炼`。

## 实现要点

- `QuestModel` 新增 `use_spirit` 目标类型，按 `spiritId` 和 `eventType` 匹配。
- 玩家战斗事件记录到 `BattleEventLedger` 后，会把人物释放的精灵事件同步给任务系统。
- 商店内直接购买并装备时，也会记录 `equip_item` 任务事件。
- `释放毒精灵` 的任务寻路指向 `firebud_grass_01` 对应的草丛。

## 自测

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-quest-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-quest-ui-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-spirit-source-check
```

## 预览

```sh
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase87_quest_equipment_tutorial.png --quit-after 90 -- --quest-equipment-tutorial-preview
```
