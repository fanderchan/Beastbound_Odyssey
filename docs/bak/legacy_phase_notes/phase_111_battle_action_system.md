# Phase111: 战斗动作数据化

## 目标

- 把装备触发的特殊攻击接入统一战斗动作表，避免以后每把武器都硬写一段战斗逻辑。
- 第一版接入六转奖励弓的群体攻击：攻击时随机命中 6-10 个敌方目标。
- 预留全场场地精灵动作，例如风属性场地强化，后续可以在数值阶段再决定具体加成公式。

## 数据规则

- `battle_actions.json` 新增 `equipment_action` 类型，表示由装备提供的战斗动作。
- 装备通过 `attackActionId` 指定普通攻击替换动作，通过 `battleActionIds` 暴露可用动作列表。
- 群体弓使用 `targetMode = enemy_random_range`，并配置 `minTargets` / `maxTargets`。
- `powerMultiplier` 表示威力系数，不是最终伤害。当前弓为 `0.65`，意思是每个目标按普通攻击伤害的 65% 结算，再走命中/回避等规则。
- `criticalDamageMultiplier` 表示会心伤害倍率。当前弓为 `1.0`，意思是允许出现会心表现，但伤害不放大。
- 全场场地动作使用 `targetMode = battlefield` 与 `effect.type = field_effect`，不选择单体目标。

## 当前内容

- `玄影连射`
  - 来源：六转玄影群攻弓。
  - 目标：敌方随机 6-10 个。
  - 每个目标独立判定回避。
  - 可出现会心表现，但当前会心伤害倍率为 1.0。
  - 暂不触发反击、击飞。
- `风场精灵1`
  - 来源：动作表预留。
  - 目标：全场。
  - 当前记录 `wind_power_1`，持续 3 回合。
  - 第一版只建立状态生命周期，具体属性影响留给数值阶段。

## 自测

```bash
node tools/battle_action_catalog_check.mjs
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-action-catalog-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-action-system-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-event-ledger-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-auto-10v10-check
```
