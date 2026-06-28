# Phase93 NPC/设施对话操作升级

## 目标

让村医、记录点、商店、宠物技能训练师这些设施继续使用同一个 NPC 对话框，但按钮语义更清楚：

- 主按钮执行当前设施最常用操作。
- 任务相关内容显示在对话正文里。
- 当设施同时关联当前任务时，额外提供 `查看任务`，不覆盖原本的买卖、治疗、保存、训练动作。

## 本阶段内容

- 对话框动作改为统一 action 分发：
  - `领取奖励`
  - `完成`
  - `治疗队伍`
  - `保存`
  - `训练`
  - `买卖`
  - `查看任务`
- 杂货铺在买肉任务期间默认仍是 `买卖`，旁边可点 `查看任务`。
- 村医默认 `治疗队伍`。
- 记录点默认 `保存`，正文显示当前记录点和将保存的位置。
- 宠物技能训练师默认 `训练`，点击后进入宠物技能训练面板。
- `GM/QA` 面板的命令摘要补充设施对话自测入口。

## 暂不做

- 不做建筑室内地图。
- 不做 NPC 头顶常驻交互菜单。
- 不把任务详情复制成新的大型弹窗；详细目标仍进入任务面板查看。

## 自测

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-facility-dialog-options-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-npc-interaction-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-village-healer-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-record-point-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-skill-training-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-shop-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-quest-ui-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-qa-panel-check
```

## 性能基线

本阶段开发前记录的同命令窗口基线：

- `--movement-spam-click-check`：通过，120 次快速点击被合并为 2 次寻路应用。
- `--shop-select-perf-check`：通过，道具选择约 529 ms，装备选择约 782 ms。
- `godot --path client/godot --scene res://scenes/Main.tscn` 空闲窗口 CPU 约 32%-37%。

本阶段开发后记录：

- `--movement-spam-click-check`：通过，120 次快速点击仍被合并为 2 次寻路应用。
- `--shop-select-perf-check`：通过，道具选择约 494 ms，装备选择约 750 ms。
- `godot --path client/godot --scene res://scenes/Main.tscn` 空闲窗口 CPU 约 31%-34%。

后续阶段需要继续用同一组命令记录“开发前 / 开发后”差异，避免功能开发重新引入卡顿。
