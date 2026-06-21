# Phase17：战斗行动目录与目标规则

## 目标

在继续增加精灵、宠物技能、道具或设计工具之前，先把当前可玩的战斗行动收拢到一个小型数据目录里。

当前目标规则故意使用简单布尔字段：

- `isAll`：这个行动影响允许目标侧的全部存活单位。
- `canTargetAlly`：这个行动可以作用于我方。
- `canTargetEnemy`：这个行动可以作用于敌方。
- `requiresSelection`：这个行动需要玩家点击或触摸一个目标。
- `selfOnly`：这个行动只作用于行动者自己。

这样底层机制在早期就能被看见、测试和扩展。后续 MP 消耗、物品数量、状态持续回合、抗性检查、服务器权威和动画元数据都可以在这个目录基础上继续加字段。

## 石器 8.0 源码参考结论

8.0 源码只作为机制参考。没有复制代码或资产。

明确结论：

- `gmsv/src/include/battle.h` 定义了攻击、防御、捕捉、逃跑、道具、咒术类行动等基础战斗指令。
- `gmsv/src/include/char_base.h` 定义 `CHAR_MAXPETSKILLHAVE` 为 `7`，所以本项目保留宠物 `技1` 到 `技7`。
- `gmsv/src/lssproto_serv.c` 的协议注释里有宠物技能字段类型，包括通用、战斗专用、地图专用等。
- 同一处协议注释也记录了宠物技能目标类型，例如自己、他人、我方全体、敌方全体、全体、无目标、除自己外、除自己和宠物外等。
- `gmsv/src/callfromcli.c` 会把 `havepetindex`、`havepetskill`、`toindex` 传入 `PETSKILL_Use`，说明宠物技能选择和人物行动是分开的。
- `gmsv/src/battle/pet_skill.c` 把普通宠物攻击映射为攻击指令，把普通宠物防御映射为防御指令，把冲撞类技能映射到技能战斗指令，把部分咒术类宠物技能映射到咒术类战斗指令。
- `gmsv/src/magic/magic.c` 会阻止恩惠、滋润这类恢复精灵在非 PvP 战斗中作用于敌方。

## 已实现目录

运行时数据位于：

```text
client/godot/data/battle_actions.json
```

当前已实现行动：

- 人物：`player_attack`、`player_defend`、`player_capture`。
- 精灵：`spirit_grace_5`、`spirit_moist_5`、`spirit_poison_5`、`spirit_poison_mist_5`。
- 宠物技能：`pet_attack`、`pet_defend`、`pet_bui_charge`、`pet_sleep_powder`、`pet_confuse_cry`、`pet_stone_gaze`。
- 道具：`item_heal_all_5`、`item_heal_single_5`、`item_poison_single_5`、`item_poison_all_5`、`item_cleanse_single_5`。

当前战斗菜单和战斗事件会从目录读取标签、目标规则、效果数值和状态字段。

可见行为：

- `恩惠精灵5`：我方全体。
- `滋润精灵5`：我方单体。
- `毒精灵5`：敌方单体。
- `毒雾精灵5`：敌方全体。
- `技3 布伊冲撞`：宠物指令阶段选择敌方单体。
- `技4 催眠粉`：宠物指令阶段选择敌方单体，尝试附加睡眠。
- `技5 迷惑吼`：宠物指令阶段选择敌方单体，尝试附加混乱。
- `技6 石化凝视`：宠物指令阶段选择敌方单体，尝试附加石化。
- `净化草5`：物品阶段选择我方单体，解除当前异常状态。

## 设计器与校验工具

在仓库根目录运行 Node 校验器：

```sh
node tools/battle_action_catalog_check.mjs
```

列出当前行动：

```sh
node tools/battle_action_catalog_check.mjs --list
```

输出起步模板：

```sh
node tools/battle_action_catalog_check.mjs --template spirit
node tools/battle_action_catalog_check.mjs --template pet_skill
node tools/battle_action_catalog_check.mjs --template item
```

工具会检查：

- action id 唯一。
- label 存在。
- owner 必须是 `player`、`spirit`、`pet_skill` 或 `item`。
- 目标规则布尔字段存在且类型正确。
- 全体目标行动不能同时要求单体点选。
- 需要点选的行动必须至少允许一侧目标。
- `selfOnly` 不能和敌方目标或全体目标混用。
- 宠物技能槽位必须是 `1` 到 `7`，且不能重复。
- 当前战斗客户端必须使用的行动都存在。
- 状态类效果必须声明合法的 `statusId`、`statusTurns`。
- `statusPotency`、`statusPotencyRatio`、`statusHitRate` 类型必须正确。
- `statusHitRate` 必须在 `0.0` 到 `1.0` 之间。
- `cleanse` 类效果必须声明非空 `statusIds`，且状态 id 必须合法。

## Godot 校验

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 300 -- --auto-battle-action-catalog-check
```

这个检查会从 Godot 内部读取目录，并验证当前可玩的目标规则：

- 恩惠是我方全体。
- 滋润是我方单体。
- 毒是敌方单体。
- 毒雾是敌方全体。
- 布伊冲撞是宠物 `技3`，敌方单体。
- 测试道具覆盖我方全体、我方单体、敌方单体和敌方全体。

## 后续渐进步骤

- 增加 `技7`。
- 增加状态解除、免疫、覆盖和互斥规则。
- 扩展战斗事件契约，让 Node.js 后续能成为战斗权威。
