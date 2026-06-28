# Phase75：任务奖励选择

本阶段给任务系统加入第一版“固定奖励 + 自选奖励”能力。

## 规则

- 任务 `rewards` 继续支持固定奖励：
  - `stoneCoins`
  - `items`
- 任务 `rewards.choices` 支持多选一奖励包。
- 带 `choices` 的任务不会自动领取，完成后需要玩家在任务面板选择奖励并点击 `领取奖励`。
- 如果玩家和交付 NPC 对话，按钮会显示 `选择奖励`，点击后打开任务面板，不会默认领取第一项。
- 如果调用领取接口但没有传奖励选择 ID，会返回 `请选择任务奖励。`

## 当前接入

- `捕捉乌力` 改为手动领取任务。
- 固定奖励：`60石币`。
- 自选奖励：
  - `捕捉网 x2`
  - `初级捕捉绳 x4`
  - `回复药5 x3`

## 自测

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-quest-reward-choice-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-quest-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-quest-ui-check
```

预览截图入口：

```bash
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase75_quest_reward_choice.png --quit-after 80 -- --quest-reward-choice-preview
```
