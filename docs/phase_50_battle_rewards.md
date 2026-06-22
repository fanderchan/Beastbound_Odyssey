# Phase50：战斗奖励 / 背包获得物品

## 目标

- 战斗胜利后可以获得道具。
- 获得的道具进入 Phase49 的 15 格随身包，相同道具优先堆叠。
- 背包满或堆叠空间不足时，结算日志提示未获得的道具。
- 本阶段不做金钱、商店、任务奖励、掉落拾取动画和服务器权威结算。

## 数据契约

`client/godot/data/battle_rewards.json`

- `rewardTables`: 奖励表数组。
- `id`: 奖励表 ID。当前优先匹配战斗状态里的 `sourceEncounterGroupId`。
- `fallback`: 可选；没有匹配到奖励表时可作为默认野外奖励。
- `rewards`: 奖励项数组。
  - `itemId`: 背包道具 ID，必须存在于 `bag_items.json`。
  - `min` / `max`: 获得数量范围。
  - `chance`: 掉落概率，`1.0` 表示必得。

第一版 `firebud_grass_01`：

- 必得 `肉` 1-2 个。
- 必得 `初级捕捉绳` 1 个。
- 小概率获得 `捕捉网` 1 个。

## 结算表现

胜利日志追加自然文本：

```text
战斗胜利，获得 30 经验。
我的布伊获得经验。
获得 肉 x2、初级捕捉绳 x1。
```

背包放不下时：

```text
背包已满，未获得 肉 x2、初级捕捉绳 x1。
```

普通 UI 不显示奖励表 ID、roll、seed 或内部字段。

## 自测入口

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-reward-check
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-reward-preview
```
