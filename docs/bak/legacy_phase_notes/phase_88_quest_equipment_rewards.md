# Phase88 任务奖励装备化

## 目标

任务奖励可以发放装备道具，并且任务详情需要直接展示奖励装备的关键信息：

- 装备名称和数量。
- 装备槽位。
- 属性加成。
- 装备提供的精灵。

## 本阶段内容

- `QuestModel` 新增奖励装备详情行，普通奖励和自选奖励都能识别装备。
- 任务面板和 NPC 任务提示会显示 `奖励装备` 分行。
- 任务奖励物品会校验是否存在于背包物品表，避免配置错误被静默跳过。
- `释放毒精灵` 任务新增装备奖励 `祝木棒 x1`，用于验证奖励装备入包和详情显示。

## 玩家可见效果

`释放毒精灵` 的任务详情会显示：

```text
奖励：20石币、祝木棒 x1
奖励装备：
- 祝木棒 x1 / 右手武器 / 攻击 +4 / 精灵 恩惠精灵1
```

完成任务后，祝木棒进入随身包。背包满时沿用现有任务领取保护：奖励无法完整放入时不会领取成功，并提示背包空间不足。

## 自测

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-quest-equipment-reward-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-quest-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-quest-ui-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-check
```

## 预览

```sh
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase88_quest_equipment_rewards.png --quit-after 90 -- --quest-equipment-tutorial-preview
```
