# Phase56：人物状态 / 装备属性汇总

本阶段把装备属性从“只在战斗里生效”推进到装备面板可见。

## 内容

- 玩家进度模型新增人物属性汇总。
  - 基础属性使用普通野外战斗玩家基准：生命 120、攻击 18、防御 6、敏捷 70。
  - 装备加成来自当前 `equipmentSlots`。
  - 当前属性 = 基础属性 + 装备加成，最低保持 1。
- 装备面板新增 `人物属性` 区。
  - 无装备时显示基础值。
  - 木棒显示 `攻击 18+6=24`。
  - 石斧显示 `攻击 18+11=29`、`敏捷 70-2=68`。
- 战斗玩家 actor 改为使用同一份属性汇总结果。
  - UI 当前属性和战斗实际属性保持一致。
  - 战斗 actor 会带上 `equipmentStatSummary`，供自测和后续服务端事件对齐。

## 当前边界

- 只展示人物装备属性，不做宠物装备属性。
- 不做人物等级成长后的基础属性变化；后续等级系统接入时再替换基础值来源。
- 不做装备图标和人物外观变化。

## 自测

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-shop-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-quest-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-reward-check
godot --path client/godot --scene res://scenes/Main.tscn --write-movie .run/godot/phase56_player_stats.png --quit-after 420 -- --equipment-swap-preview
```
