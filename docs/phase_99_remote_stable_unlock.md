# Phase99 六转后远程兽栏

## 目标

把 Phase94 设计里的 `远程兽栏` 从预留能力变成正式任务奖励：玩家完成六转后，去找兽栏管理员阿牧学习，学会后才可以在普通宠物面板随身存取兽栏。

## 规则

- 六转前不会出现远程兽栏任务。
- 执行六转后，自动接入 `远程兽栏` 任务。
- `远程兽栏` 任务由 `兽栏管理员阿牧` 完成。
- 任务奖励是永久能力 `remoteStable`。
- 未学会前：
  - 普通宠物面板的 `存入` / `取出` 禁用。
  - 村内兽栏和 GM/QA 入口仍可打开兽栏。
- 学会后：
  - 普通宠物面板的 `存入` / `取出` 可用。
  - 已学会的角色不会再出现该任务。

## 实现

- `quests.json` 新增 `quest_remote_stable_unlock`。
- `QuestModel` 新增能力奖励解析和显示。
- `PlayerProgressModel.claim_active_quest` 领取奖励时写入 `unlockedAbilities`。
- 任务可见性支持：
  - `requiredRebirthCount`
  - `requiredMissingAbility`
- `--auto-player-rebirth-chain-check` 更新为六转后接入远程兽栏任务。
- 新增 `--auto-remote-stable-unlock-check`。

## 自测

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-remote-stable-unlock-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-player-rebirth-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-quest-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-quest-ui-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-stable-facility-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-pet-stable-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-qa-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-player-rebirth-execute-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --shop-select-perf-check
```

## 结果

- `--auto-remote-stable-unlock-check`: ok。
- `--auto-player-rebirth-chain-check`: ok，六转后 active 为 `quest_remote_stable_unlock`。
- `--auto-quest-chain-check`: ok。
- `--auto-quest-ui-check`: ok。
- `--auto-stable-facility-check`: ok。
- `--auto-pet-stable-check`: ok。
- `--auto-qa-panel-check`: ok。
- `--auto-player-rebirth-execute-check`: ok。
- `--movement-spam-click-check`: ok，`clicks=120`，`applied=2`。
- `--shop-select-perf-check`: ok，`item_us=633363`，`equipment_us=900568`。

## 性能对比

- Phase98 基线：`movement applied=2`，商店 `item_us=574987`，`equipment_us=890959`。
- Phase99 当前：`movement applied=2`，商店 `item_us=633363`，`equipment_us=900568`。
- 结论：移动连点保持合并；商店切换为小幅波动，没有回到秒级卡顿。

## 预览

```sh
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase99_remote_stable_unlock.png --quit-after 120 -- --remote-stable-unlock-preview
```

截图证据：

- `/Users/fander/projects/Beastbound_Odyssey/.run/godot/phase99_remote_stable_unlock00000119.png`
