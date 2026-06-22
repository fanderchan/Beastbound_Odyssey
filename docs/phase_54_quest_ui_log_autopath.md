# Phase54：任务详情 / 日志历史 / 任务自动寻路

本阶段修 Phase53 新手任务链暴露出来的三个体验问题。

## 内容

- 左下战斗、奖励、任务提示日志改为历史滚动区。
  - 最近 80 行保留在窗口中。
  - 新消息追加到底部，并自动滚到最新内容。
  - `world_log_message` 仍保留最近一条提示，避免旧自测和临时提示语义被破坏。
- 行动栏新增 `任务`。
  - 打开任务详情面板可查看任务名称、状态、目标、进度、奖励、地点。
  - 右上 HUD 继续只放短追踪文本，避免挤爆。
- 任务详情面板新增 `自动寻路`。
  - 对话任务：走向目标 NPC。
  - 商店任务：走向对应商店 NPC。
  - 战斗任务：走向对应遭遇区。
  - 捕捉任务：根据目标宠物种系寻找合适遭遇区。
  - 目标在别的地图时，先走向当前地图里通往目标地图的传送点；传送后再点一次继续走向目标。

## 当前边界

- 跨地图寻路第一版只做直接相邻地图传送，不做多跳地图图算法。
- 自动寻路只负责“去哪里”，不自动帮玩家买东西、使用道具、开战或捕捉。
- 装备、装备店、买肉后使用肉的教学链放后续阶段继续做。

## 自测

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-quest-ui-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-quest-chain-check
godot --path client/godot --scene res://scenes/Main.tscn --write-movie .run/godot/phase54_quest_ui_preview.png --quit-after 12 -- --quest-ui-preview
```
