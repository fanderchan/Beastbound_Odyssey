# Phase53：任务链 / 新手引导链

本阶段把 Phase05 的临时 NPC 任务标记升级为玩家档案里的任务链系统，并先落一条新手链。

## 目标

- 任务数据独立放在 `client/godot/data/quests.json`。
- 玩家档案保存当前任务、每个任务进度、可领取和已领取状态。
- NPC 对话、商店购买、战斗胜利、捕捉宠物都能发出任务事件。
- 新手链先串起最近已经完成的核心玩法：对话、买补给、野外战斗、捕捉乌力。

## 第一条新手链

1. `认识训练师`
   - 和训练师阿土对话。
   - 奖励：20 石币、肉 x2。
2. `补给准备`
   - 在火芽杂货铺购买任意补给。
   - 奖励：初级捕捉绳 x1。
3. `村外试炼`
   - 在村外草丛赢得一场战斗。
   - 奖励：30 石币、回复药5 x1。
4. `捕捉乌力`
   - 捕捉任意乌力系宠物。
   - 奖励：60 石币、捕捉网 x1。

第一版新手链使用 `autoClaimOnReady`，达成目标后自动领取奖励并推进到下一环。后续可以把某些任务改成回 NPC 交付，只需要把数据改成非自动领取即可。

## 数据契约

任务条目包含：

- `id`: 任务唯一 ID。
- `title`: 玩家可见标题。
- `giverId`: 发放任务的 NPC 或系统来源。
- `turnInId`: 非自动领取时的交付 NPC。
- `autoClaimOnReady`: 达成目标后是否自动领奖。
- `objective`: 目标类型与过滤条件。
- `rewards`: 石币和背包道具奖励。
- `nextQuestId`: 下一环任务 ID。

支持的目标类型：

- `talk`: 对话目标，按 `targetId` 匹配。
- `buy_item`: 购买目标，可按 `shopId`、`itemId` 或 `itemIds` 过滤。
- `battle_victory`: 战斗胜利目标，可按 `encounterGroupId` 过滤。
- `capture_pet`: 捕捉目标，可按 `lineId`、`formId` 或 `formIdPrefix` 过滤。

## 当前边界

- 仍然是 Godot 本地档案，不接服务端任务权威。
- 不做任务列表面板、支线筛选、追踪切换和多人共享任务进度。
- 不做复杂条件树；第一版一个任务只有一个可计数目标。

## 自测

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-quest-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-npc-interaction-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-shop-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-reward-check
godot --path client/godot --scene res://scenes/Main.tscn --write-movie .run/godot/phase53_quest_preview.png --quit-after 12 -- --quest-preview
```
