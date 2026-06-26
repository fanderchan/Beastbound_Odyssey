# Phase112 战斗失败 / 击飞 / 宠物休息闭环

## 目标

- 人物被击飞时，本场战斗按失败结算，并回到当前记录点。
- 宠物被击飞时，宠物档案强制进入休息状态，生命为 0，不能作为待机宠换上场。
- 敌方单位也使用同一套击飞标记，便于后续 PVP 和守护兽战斗复用。
- 胜利、失败、逃跑、捕获后的档案回写统一走 `PlayerProgressModel.apply_battle_result`。

## 结算契约

`apply_battle_result` 现在会返回这些击飞相关字段：

- `playerKnockedAway`: 当前玩家人物是否被击飞。
- `activePetKnockedAway`: 当前出战宠是否被击飞。
- `knockedAwayActorIds`: 本次结算中所有被击飞的 actor。
- `allyKnockedAwayActorIds`: 我方被击飞 actor。
- `enemyKnockedAwayActorIds`: 敌方被击飞 actor。
- `returnToRecordPoint`: 是否需要由世界层送回记录点。

## 当前规则

- 人物 `ally_player` 被击飞时，即使宠物仍存活，也立刻视为本场失败并回记录点。
- 普通 0 血倒下不是击飞，不会回记录点；回到世界时人物生命保底为 1。
- 出战宠 `ally_pet` 被击飞时，档案中的对应宠物会变为 `休息`，且不会自动把其他宠物切成出战。
- 敌方野宠被击飞时会进入 `launched/revivable=false`，并按正常胜利条件结算。

## 自测命令

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-knockaway-result-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-result-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-launch-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --auto-record-point-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --auto-hang-settings-check
```

