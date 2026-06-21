# Phase20：战斗角色数据化与公式设计

## 目标

把当前本地 10v10 战斗原型里写死的占位数值，整理成一套小而清楚的数据化战斗切片。

Phase20 要让下面这些东西变得明确、可测试：

- 人物、宠物、友方 NPC、野怪的基础属性来自数据文件。
- 行动速度由角色敏捷属性计算，不再散落在代码常量里。
- 物理伤害由攻击方属性、防御方属性、行动配置共同计算。
- 敌方攻击目标由 AI 规则决定，不再固定打中间位或主角位。
- 当前本地战斗事件列表，后续可以自然过渡给 Node.js 服务端权威结算。

这一阶段仍然只做 Godot 本地逻辑。暂时不接 Node.js、不接 MySQL、不做账号状态、不做正式背包、不做宠物仓库、不换正式美术。

## 为什么现在做

当前战斗已经有这些基础：

- 10v10 阵型。
- 人物指令和受控宠物指令。
- 按速度排序的战斗事件列表。
- 合击原型。
- 捕捉原型。
- 精灵和物品的目标规则。
- 敌人攻击目标分散。

接下来最大的风险是代码继续膨胀。如果继续加宠物、怪物、技能、道具，但角色属性和公式还写死在代码里，后面会很难验证、很难维护。Phase20 应该先把底层数据契约立起来。

## 不做范围

Phase20 暂时不做：

- 属性相克。
- 闪避、暴击、异常状态回合数、中毒跳伤、眩晕、睡眠、复活。
- 完全复刻石器时代原版公式。
- 服务端权威战斗。
- 正式角色、宠物、怪物美术替换。
- 背包、宠物栏、装备、账号持久化。

这些等基础数据模型稳定后再做。

## 建议新增数据文件

### `client/godot/data/battle_actors.json`

这个文件定义可复用的战斗角色模板。早期先放少量模板就够：

```json
{
  "schemaVersion": 1,
  "actors": [
    {
      "id": "player_trainee_hunter",
      "label": "见习猎人",
      "kind": "player",
      "level": 5,
      "stats": {
        "maxHp": 120,
        "attack": 18,
        "defense": 8,
        "agility": 70
      },
      "ai": {
        "control": "player"
      },
      "capture": {
        "catchable": false
      },
      "placeholderPalette": "controlled_player"
    },
    {
      "id": "pet_bui",
      "label": "小布伊",
      "kind": "pet",
      "level": 5,
      "stats": {
        "maxHp": 90,
        "attack": 14,
        "defense": 6,
        "agility": 68
      },
      "ai": {
        "control": "controlled_pet"
      },
      "capture": {
        "catchable": false
      },
      "placeholderPalette": "controlled_pet"
    },
    {
      "id": "wild_woori",
      "label": "野生乌力",
      "kind": "wild_pet",
      "level": 4,
      "stats": {
        "maxHp": 80,
        "attack": 10,
        "defense": 5,
        "agility": 48
      },
      "ai": {
        "control": "enemy_ai",
        "targetPolicy": "random_living_ally"
      },
      "capture": {
        "catchable": true,
        "difficulty": 42
      },
      "placeholderPalette": "wild_pet"
    }
  ]
}
```

字段说明：

- `id`：模板 ID，用于阵型或后续数据库引用。
- `label`：玩家看到的名字。
- `kind`：角色类型，例如 `player`、`pet`、`wild_pet`。
- `level`：等级。
- `stats.maxHp`：最大生命。
- `stats.attack`：攻击。
- `stats.defense`：防御。
- `stats.agility`：敏捷。
- `ai.control`：控制方式，例如玩家控制、宠物控制、敌方 AI。
- `ai.targetPolicy`：AI 选目标规则。
- `capture.catchable`：是否可捕捉。
- `capture.difficulty`：捕捉难度。
- `placeholderPalette`：占位美术颜色，不是正式美术配置。

### `client/godot/data/battle_formations.json`

这个文件定义测试战斗阵型。Phase20 先只需要本地测试用例：

- `wild_1v1`：玩家和受控宠物，对一只野怪。
- `formation_10v10`：当前完整 20 个位置的预览阵型。
- `stat_formula_test`：专门测试高攻击、高防御、高敏捷的 10v10 数值验证阵型。

示例：

```json
{
  "id": "formation_10v10",
  "actors": [
    {
      "instanceId": "ally_player",
      "templateId": "player_trainee_hunter",
      "side": "ally",
      "slotId": "ally.back.3"
    },
    {
      "instanceId": "ally_pet",
      "templateId": "pet_bui",
      "side": "ally",
      "slotId": "ally.front.3"
    }
  ]
}
```

字段说明：

- `instanceId`：这场战斗里的唯一角色 ID，例如 `ally_player`。
- `templateId`：引用 `battle_actors.json` 里的模板。
- `side`：阵营，`ally` 或 `enemy`。
- `slotId`：10v10 阵型位置，例如 `ally.back.3`。

### 继续使用 `client/godot/data/battle_actions.json`

现有 `battle_actions.json` 继续作为行动目录。Phase20 只在必要时增加这些字段：

- `speedBonus`：行动速度修正。
- `powerMultiplier`：物理伤害倍率。
- `flatPower`：技能固定加值。
- `formula`：公式类型，例如 `physical_damage`、`fixed_heal`、`fixed_damage`、`capture`、`defend`。

角色属性不要放进行动文件里，避免角色数据和技能数据混在一起。

## 运行时模型

Phase20 应该增加聚焦的小脚本，不继续把逻辑塞进 `main.gd`。

建议新增：

- `client/godot/scripts/battle/battle_actor_catalog.gd`
  - 加载角色模板。
  - 校验必要字段。
  - 根据 `templateId`、`instanceId`、`side`、`slotId` 生成战斗运行时角色。

- `client/godot/scripts/battle/battle_formula.gd`
  - 计算行动速度。
  - 计算物理伤害。
  - 计算治疗量。
  - 需要时计算简单 AI 目标。

`battle_model.gd` 继续负责构建战斗事件列表和应用事件，但属性读取与公式计算交给这些小模型脚本。

## 运行时角色结构

现有 UI 依赖的字段要保留，避免这阶段改坏显示：

```json
{
  "id": "ally_player",
  "templateId": "player_trainee_hunter",
  "name": "见习猎人",
  "side": "ally",
  "kind": "player",
  "slotId": "ally.back.3",
  "level": 5,
  "hp": 120,
  "maxHp": 120,
  "attack": 18,
  "defense": 8,
  "quick": 70,
  "ai": {
    "control": "player"
  },
  "catchable": false,
  "captureDifficulty": 0,
  "actionState": "idle"
}
```

`quick` 先保留为 `agility` 的兼容别名。等测试和 UI 都迁完后，再考虑统一字段命名。

## 公式方案

## 石器 8.0 源码参考结论

已参考本机 `stoneage9/gmsv` 源码中的战斗排序逻辑：

- `src/battle/battle.c` 里通过 `BATTLE_DexCalc` 计算行动顺序值。
- `BATTLE_DexCalc` 会读取 `CHAR_WORKBATTLECOM1`，也就是当前角色本回合选择的战斗命令。
- `src/include/battle.h` 定义了 `BATTLE_COM_ATTACK`、`BATTLE_COM_GUARD`、`BATTLE_COM_CAPTURE`、`BATTLE_COM_ITEM`、`BATTLE_COM_JYUJYUTU` 等命令。
- `src/battle/battle_command.c` 会把客户端命令写入 `CHAR_WORKBATTLECOM1`，例如攻击、防御、捕捉、精灵、物品。

源码里能明确看到：

- 普通攻击、防御、捕捉等没有独立的“固定速度加成表”，大多走默认速度公式。
- 默认速度公式大致是 `CHAR_WORKQUICK + 20`，再减去一定随机值。
- 物品 `BATTLE_COM_ITEM` 有单独速度公式：在默认随机范围基础上额外加了一段速度优势。
- 精灵/咒术 `BATTLE_COM_JYUJYUTU` 在当前源码分支里没有比默认更快的固定加成。
- 部分职业技能、宠物技能有自己的速度公式，有的变快，有的变慢。

所以 Phase20 不应该使用之前那张：

```text
普通攻击 0
宠物技能 +10
精灵 +12
物品 +12
防御 +6
捕捉 +4
```

这张表只能算我之前为了原型测试写的“临时游戏感设定”，不能当作石器 8.0 依据。Phase20 应该改成“速度公式组”，而不是简单固定加成表。

### 行动速度

Phase20 建议先做可测试的确定性近似，不直接引入随机浮动：

```text
speed = actor.agility + profile.flatBonus + round(actor.agility * profile.percentBonus)
```

第一版速度公式组：

- `default`：普通攻击、防御、捕捉、逃跑、普通宠物攻击、精灵。
- `item_quick`：物品。参考源码里 `BATTLE_COM_ITEM` 有额外速度优势。
- `skill_fast`：明显快速类宠物技能或职业技能，后续有具体技能再启用。
- `skill_slow`：明显慢速高威力技能，后续有具体技能再启用。

Phase20 初始配置建议：

- 普通攻击：`default`
- 防御：`default`
- 捕捉：`default`
- 精灵：`default`
- 物品：`item_quick`
- 宠物普通攻击：`default`
- `布伊冲撞`：先用 `default`，除非后续从技能资料确认它应该更快或更慢。

这样做的理由：

- 不再假装有一张原版固定加成表。
- 敏捷高低容易测试。
- 保留后续扩展空间：具体技能可以独立配置速度组。
- 暂时不加随机速度浮动，方便定位问题；后续可以在服务端权威战斗时加入随机偏移。

### 物理伤害

先用一个能明显体现攻防差异的简单公式：

```text
base = attacker.attack * action.powerMultiplier + action.flatPower
mitigation = defender.defense * 0.65
level_delta = clamp(attacker.level - defender.level, -10, 10)
damage = round(base - mitigation + level_delta * 1.2)
damage = max(1, damage)
```

默认值：

- 普通攻击：`powerMultiplier = 1.0`，`flatPower = 0`
- `布伊冲撞`：`powerMultiplier = 1.0`，`flatPower = 12`

Phase20 暂时不加随机伤害浮动。第一版公式要先可测、可解释。随机浮动可以放到 Phase21 或更后面。

### 固定治疗和固定伤害

精灵和物品先继续使用行动目录里的固定值：

```text
heal = action.effect.amount
fixed_damage = action.effect.amount
```

这样 Phase20 可以专注角色属性和物理公式。后续再讨论精灵、道具是否受人物属性影响。

### 防御指令

Phase20 先保留 `防御` 的可见状态，但不真正减少本回合伤害。

原因：

- 真正防御减伤需要“本回合状态”的生命周期。
- 这最好和异常状态、持续状态一起设计，不要临时硬塞进一个指令里。

## 敌方 AI 目标

Phase20 先支持这些目标策略：

- `random_living_ally`：野怪默认策略，从我方活人中选择目标。
- `first_living_enemy`：友方 NPC 自动攻击敌人时的保底策略。

敌方随机目标要做到“本次事件列表稳定、下一回合可以变化”：

```text
targetSeed = battleId + round + localRandomSeed
target = stable_hash(targetSeed + attackerId + sequence) % livingTargets.size
```

意思是：

- 同一轮已经生成的事件列表不会忽然变化。
- 多轮战斗不会永远打同一个位置。
- 自动测试可以稳定复现。

## 战斗事件列表契约

Phase20 继续使用当前本地事件列表，只是把公式结果写得更明确：

```json
{
  "type": "attack",
  "actionId": "player_attack",
  "attackerId": "ally_player",
  "targetId": "enemy_front_5",
  "targetSide": "enemy",
  "damage": 15,
  "speed": 90,
  "sequence": 4,
  "formula": {
    "kind": "physical_damage",
    "attack": 18,
    "defense": 5,
    "levelDelta": 1
  }
}
```

`formula` 这块用于日志、测试、未来服务端对齐，不显示在普通玩家 UI 上。

## 战斗追踪日志

Phase20 的工程验证只做日志，不做游戏窗口里的调试面板。

目标：

- 帮你和我验证战斗公式、出手顺序、目标选择、伤害计算。
- 不污染正常 PC/手机游戏画面。
- 自动化测试可以直接读它背后的文本日志。

当前实现一层：

### 战斗追踪日志

新增一个内部追踪器，例如：

- `client/godot/scripts/battle/battle_trace_recorder.gd`

每次生成战斗事件列表和应用事件时，记录结构化文本。输出位置建议：

```text
.run/battle_trace/latest.jsonl
```

每行一条 JSON，示例：

```json
{
  "round": 1,
  "event": "attack",
  "attackerId": "ally_player",
  "targetId": "enemy_front_5",
  "speed": 90,
  "hpBefore": 80,
  "hpAfter": 65,
  "damage": 15,
  "formula": {
    "kind": "physical_damage",
    "attack": 18,
    "defense": 5,
    "levelDelta": 1
  }
}
```

这层最重要，因为自动化测试和我后续排错都应该读文本，而不是靠肉眼看画面。

`--battle-debug-window` 这个旧参数当前只作为兼容别名：它不再打开 Godot 窗口，只开启 `.run/battle_trace/latest.jsonl` 追踪日志。以后如果确实需要独立外挂式工具，应该做成主游戏窗口之外的单独工具或日志查看器，而不是塞进游戏 HUD。

## 验证方案

### 新增 Node 校验

新增命令：

```sh
node tools/battle_actor_catalog_check.mjs
```

它要校验：

- 每个角色模板都有 `id`、`label`、`kind`、`level`、`stats.maxHp`、`stats.attack`、`stats.defense`、`stats.agility`。
- 可捕捉角色必须有捕捉难度。
- 测试阵型里受控人物和受控宠物唯一。
- 所有阵型条目都引用已存在的角色模板。
- 所有阵型 `slotId` 都符合现有 10v10 位置规则。

### 新增 Godot 校验

新增命令：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1200 -- --auto-battle-stat-formula-check
```

它要校验：

- 同样指令下，高敏捷角色先行动。
- 同一个目标下，高攻击角色造成更高物理伤害。
- 同一个攻击者下，高防御目标受到更低物理伤害。
- 敌方 AI 目标不会永远固定选择同一个我方角色。
- 已有的人物攻击、宠物攻击、宠物技能、精灵、物品、捕捉、合击检查仍然通过。
- 生成 `.run/battle_trace/latest.jsonl`，并能从里面读到速度、目标、伤害、HP 变化。

### 保留现有回归

继续跑：

```sh
godot --headless --path client/godot --quit
node tools/battle_action_catalog_check.mjs
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 300 -- --auto-battle-action-catalog-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 900 -- --auto-battle-speed-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-battle-round-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --auto-battle-pet-target-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-spirit-four-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-item-check
```

## 手动测试方案

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-preview-10v10
```

检查：

- 受控人物在我方阵型里仍然能明显区分。
- `攻击` 仍然要求选择敌方目标。
- PET `技1 攻击` 和 `技3 布伊冲撞` 仍然要求选择敌方目标。
- 伤害数字仍然正常显示。
- 敌人不会总是打同一个中间位或主角位。
- 使用 `--battle-debug-window` 启动时，只写 `.run/battle_trace/latest.jsonl`，不在游戏窗口里显示工程信息。

这一阶段不要把调试属性、公式明细、测试结果显示在普通战斗 UI 上。

## 给用户的手工验证办法

数值系统不能只靠普通战斗画面验证。当前已经准备一个专门的工程验证入口：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-stat-test --battle-debug-window
```

这个入口不用于正常游戏，只用于确认底层规则有没有生效。

当前入口仍然是 10v10 战斗模板，只是替换成验证用角色名和属性。主战斗窗口能看到 `高速猎人`、`普通猎人`、`慢速猎人`、`低防乌力`、`高防乌力`、`高攻猎人` 等名字；速度排序和伤害公式输入写入 `.run/battle_trace/latest.jsonl`。

### 验证 1：敏捷是否影响出手顺序

准备三个测试角色：

- `高速猎人`：敏捷高，攻击普通。
- `普通猎人`：敏捷中等。
- `慢速猎人`：敏捷低，攻击普通。

手工看 `.run/battle_trace/latest.jsonl`：

- 行动顺序表里，`高速猎人` 应该排在 `普通猎人` 前面。
- `普通猎人` 应该排在 `慢速猎人` 前面。

判断标准：

- 不需要你自己算公式。
- 只要确认“敏捷越高越早出手”成立。

### 验证 2：物品是否比默认行动更快

准备同一个角色，在两次测试里分别使用：

- 普通攻击。
- 物品。

手工看 `.run/battle_trace/latest.jsonl`：

- 同一个角色、同一敏捷下，物品行动的 `speed` 应该高于普通攻击。

判断标准：

- 只验证趋势：物品更快。
- 不要求你记住精确数值。

### 验证 3：攻击越高，伤害越高

准备两个攻击者打同一个目标：

- `高攻猎人`：攻击高，其他尽量相同。
- `低攻猎人`：攻击低，其他尽量相同。

手工看 `.run/battle_trace/latest.jsonl`：

- 两人攻击同一个敌人。
- `高攻猎人` 的 `damage` 应该大于 `低攻猎人`。

判断标准：

- 同一个目标、同一种行动下，高攻击必须打得更痛。

### 验证 4：防御越高，受到伤害越低

准备同一个攻击者打两个目标：

- `高防目标`：防御高。
- `低防目标`：防御低。

手工看 `.run/battle_trace/latest.jsonl`：

- 同一个攻击者、同一种攻击打两个目标。
- `高防目标` 受到的 `damage` 应该小于 `低防目标`。

判断标准：

- 同一个攻击来源下，高防御必须更抗打。

### 验证 5：宠物技能是否比普通攻击更痛

用同一只宠物打同一个敌人：

- 第一次用 `技1 攻击`。
- 第二次用 `技3 布伊冲撞`。

手工看 `.run/battle_trace/latest.jsonl`：

- `布伊冲撞` 的 `damage` 应该大于普通攻击。

判断标准：

- 同一宠物、同一目标下，技能伤害应该更高。

### 验证 6：敌方目标不是固定打一个人

打开 10v10 测试战斗，连续观察几轮。

手工看 `.run/battle_trace/latest.jsonl`：

- 敌方每个攻击事件都有 `targetId`。
- 一轮里不应该所有敌人都打同一个 `targetId`。
- 多轮下来也不应该永远打主角或中间位。

判断标准：

- 你只要看 `targetId` 是否分散。
- 不需要确认真正随机概率，只确认“不是固定目标”。

### 验证 7：普通游戏画面没有调试污染

正常启动：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-preview-10v10
```

手工看普通战斗画面：

- 不应该出现公式、内部 ID、测试结果、日志文本。
- 仍然只看到正常战斗 UI。

判断标准：

- 工程验证信息只出现在 `.jsonl` 日志里。
- 普通玩家画面保持干净。

## 实施顺序

1. 新增 `battle_actors.json` 和 `battle_formations.json`。
2. 新增 `battle_actor_catalog.gd`，加载并校验角色模板。
3. 把 `BattleModel.create_wild_battle` 和 `create_formation_preview_battle` 改成从阵型数据生成角色。
4. 新增 `battle_formula.gd`。
5. 把速度计算和物理伤害计算迁移到 `battle_formula.gd`。
6. 新增 Node 数据校验。
7. 新增 Godot 属性/公式自测。
8. 新增 `.jsonl` 战斗追踪日志。
9. 保留 `--battle-debug-window` 作为日志兼容参数，不创建窗口。
10. 跑完整战斗回归。

## 需要你拍板的问题

实施前请确认这几个选择：

- Phase20 的伤害和速度先保持确定性，不加随机浮动。
- 行动速度不使用“攻击 0、防御 +6、捕捉 +4”这类固定表，改用源码参考后的 `speedProfile` 方案。
- `防御` 不再靠速度抢先执行；提交防御后，本回合从事件开始就处于防御状态，并参与减伤。
- 使用 `battle_actors.json` 加 `battle_formations.json`，不做一个巨大的战斗数据文件。
- 精灵、物品的数值先继续使用行动目录固定值，不跟角色属性挂钩。
- 增加 `.jsonl` 战斗追踪日志；暂不开发 PC 工程验证窗口。
