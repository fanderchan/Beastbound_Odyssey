# Phase123 数值表结构整理

## 目标

Phase123 不直接做最终平衡，而是先把数值系统整理成可维护、可实验、可迁移到服务端的表结构和公式契约。后续进入正式数值策划时，应该能回答这些问题：

- 哪些数值在表里调，哪些规则留在代码里。
- 人物、宠物、装备、捕捉、任务、掉落、经济的数值来源分别在哪里。
- 每次调参后如何验证胜率、耗时、收益、消耗和性能没有崩。
- 借鉴 StoneAge 8.0 的系统方向，但不照搬旧源码、旧数据和旧私服公式。

## 总结结论

- 经验、成长、战斗公式、捕捉公式、奖励、商店、装备强化、区域节奏都应该进入可审阅的数据表。
- 事件顺序、HP clamp、死亡/击飞/休息语义、10V10 slot 合法性、背包事务、任务完成事务、随机种子流程应留在代码模型里。
- 第一版继续保持人物和宠物等级上限 140；人物转生的循环锚点先用 Lv80，宠物长期培养锚点用 Lv140。
- 宠物个体成长要保留实例差异：同种同级捕捉结果也应该不同，战力来源必须可解释。
- 战斗要走“公式骨架固定，数值旋钮进表”的路线。多目标弓、合击、暴击、属性克制、异常状态、治疗都要有可调字段。
- 经济要分清一次性奖励和循环经济：任务负责教学和阶段补贴，战斗负责循环产出，捕捉、修理、强化、商店负责循环回收。

## 当前落地状态

Phase123 第一轮已经落地为“表结构和旧行为 parity”，不是最终数值调整。现在的原则是：能从表读取但不改变手感的先接入；会改变战斗胜率、捕捉体感、升级速度的内容先做表和校验，后续用固定 seed 仿真再迁移。

当前新增目录：

```text
client/godot/data/balance/
```

当前表：

| 文件 | 作用 | 当前接入状态 |
|---|---|---|
| `level_curves.json` | 人物/宠物 1-140 经验曲线、阶段锚点 | `PlayerProgressModel.exp_to_next_level()`、经验丹授予已读取 |
| `player_growth.json` | 人物基础四维、升级点数、加点收益、村医费用、转生等级门槛、装备耐久参数 | 人物成长、村医、转生等级、装备磨损/修理已读取 |
| `pet_growth_profiles.json` | 宠物成长档、个体差范围、品质阈值、战力公式 | 宠物成长率、个体差、品质标签、战力来源已读取 |
| `combat_formulas.json` | 物理伤害、回避、暴击、合击、多目标、状态命中旋钮 | Phase131 已由 `CombatFormulaModel` 严格复刻旧公式；真实战斗结果暂不改 |
| `capture_formula.json` | 捕捉基础概率、血量/难度、异常状态、工具权重预留 | 基础概率和状态加成已读取；`capturePower` 仍预留，暂保持旧工具手感 |
| `reward_economy.json` | 货币、商店卖价、战斗经验、奖励/消耗/装备/捕捉价格带 | 商店默认卖价、战斗经验公式和 encounter group 倍率已读取 |
| `progression_zones.json` | 1-140 练级区、资格战、目标经验/石币/战斗数 | 数值报告已读取并输出每段收益是否命中目标 |
| `battle_simulation_scenarios.json` | 固定战斗仿真场景、队伍等级、敌人强度、期望回合/血量门槛 | Phase127 已读取并用真实 `BattleModel` 跑固定 seed 回放 |
| `economy_ledger_scenarios.json` | 经济账本口径、遇敌/回合耗时、低血补给储备和净收入门槛 | Phase128 已读取并输出每战/每小时净石币 |

当前集中读取模型：

```text
client/godot/scripts/progression/balance_catalog_model.gd
```

当前自检入口：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-balance-catalog-check
```

## 数值治理契约

Phase123 后，数值不应再靠“看到哪里硬改哪里”。后续每轮数值实验按下面流程走：

1. 提出假设：例如“Lv80 四洞守护胜率太低，需要降低守护兽防御或提高 Lv60-80 装备收益”。
2. 改 balance 表或实体表，不直接改流程代码。
3. 跑固定 seed 样本，记录胜率、回合数、经验/小时、石币净收入、捕捉成本、药耗、修理费。
4. 对比上一版 baseline。
5. 评审通过后把该配置标记为新的 active id。

版本概念要分开：

| 名称 | 含义 | 例子 |
|---|---|---|
| `schemaVersion` | 表结构版本，字段变更才递增 | JSON 字段重命名、类型变化 |
| `balanceVersion` | 调参版本，数值变化但字段不变 | Lv80 经验、守护兽奖励调整 |
| `formulaVersion` | 公式契约版本，计算方式变化 | 捕捉从 `chanceBonus` 改为 `capturePower` |
| `serverContractVersion` | 服务端回放/存档契约版本 | 后端开始权威计算战斗奖励 |

概率统一用 `0.0-1.0`，UI 才显示百分比。表内不要混写 `30` 和 `0.30`。

## 表结构原则

1. 数值表只描述数值和绑定关系，不写流程逻辑。
2. 所有表带 `schemaVersion`，方便以后迁移到 Node.js / MySQL。
3. 正式数值表和 GM/QA fixture 分开，避免测试怪、GM 钻石、10V10 fixture 污染正式平衡。
4. 客户端运行时只读缓存后的 catalog，不在 `_process`、HUD、移动、任务追踪、地图绘制热路径里解析大表或 normalize 全 profile。
5. 所有关键表都要能被 headless 检查：JSON 解析、字段完整、引用存在、区间合法。
6. 数值策划阶段优先调“锚点”和“曲线形状”，不要一开始填满最终 140 级全量表。

## 建议数据分层

已新增 `client/godot/data/balance/`，用于放全局公式、曲线和默认规则；已有实体表继续保留在 `client/godot/data/`。

| 层级 | 作用 | 示例 |
|---|---|---|
| 全局数值表 | 公式、曲线、通用倍率 | `level_curves.json`, `combat_formulas.json` |
| 实体数值表 | 宠物、技能、装备、物品、商店 | `pet_templates.json`, `battle_actions.json`, `equipment_items.json` |
| 绑定表 | 区域、掉落、任务、商店、遇敌池 | `battle_rewards.json`, `map_regions.json`, `quests.json` |
| QA fixture | GM 地图、固定 10V10、性能样本 | `gm_10v10_training_ground_map.json` |

## 已接入 / 待迁移矩阵

| 模块 | 已接入 | 暂不接入的原因 |
|---|---|---|
| 经验曲线 | `exp_to_next_level()`、`exp_grant_for_level()` | 经验曲线本体已表驱动，后续主要补区域样本 |
| 战斗经验 | `reward_economy.battleExp`、`PlayerProgressModel.battle_exp_reward()` | 已保持低级 parity；中后期区域收益仍需用固定 seed 仿真继续校准 |
| 人物成长 | 基础四维、升级属性点、加点收益 | 转生公式本体后续单独校准 |
| 宠物成长 | 成长档、个体差范围、品质阈值、战力公式 | 品质筛选和极品阈值要等正式数值样本 |
| 捕捉 | 基础概率、血量/难度、异常加成 | `capturePower * toolPowerWeight` 会改变体感，先不启用 |
| 区域收益 | `progression_zones.json`、`battle_rewards.json`、数值报告 | 地图正式开放和怪物分布表仍需后续补全 |
| 商店 | 默认卖价倍率 | 多商店折扣、声望价、限购后续再做 |
| 装备耐久 | 武器攻击次数、防具受击次数、修理单价 | 强化失败率和长期装备经济后续再做 |
| 战斗公式 | 表、校验、Phase126/130/131 shadow parity 和 Phase132 真实 A/B 报告已存在 | 默认真实战斗暂不改；当前表驱动已能在固定样本中无差异接管 |
| 固定战斗仿真 | `battle_simulation_scenarios.json`、Phase127 report | 已覆盖 9 个代表战斗；可作为公式/成长/敌人调参的硬 gate |
| 经济净收入 | `economy_ledger_scenarios.json`、Phase128 report | 已覆盖石币期望、可卖物品、村医、补给储备、人物修理费；捕捉工具消耗和材料交易后续扩展 |
| 数值晋升门禁 | `NumericBalanceGateModel`、Phase129 report | 已合并 catalog、区域、shadow、真实公式 A/B、战斗、经济和文档门禁；经济仍为 watch |

## 当前阶段文档

| 文件 | 内容 |
|---|---|
| `docs/phase_124_numeric_experiment_baseline.md` | 当前数值实验总基线 |
| `docs/phase_125_numeric_system_subagent_synthesis.md` | 四个 subagent 的综合方案：区域、战斗、宠物、经济 |
| `docs/phase_125_progression_zone_baseline.md` | 区域收益目标表和当前样本读数 |
| `docs/phase_125_pet_growth_sample_baseline.md` | 宠物低/中/高个体成长、品质、战力样本 |
| `docs/phase_126_combat_formula_shadow_baseline.md` | 战斗旧公式和表驱动公式的影子对照，不改变真实战斗 |
| `docs/phase_127_battle_simulation_baseline.md` | 真实 BattleModel 固定 seed 战斗仿真，作为公式/成长/敌人调参门槛 |
| `docs/phase_128_economy_ledger_baseline.md` | 经济净收入账本，记录每战/每小时石币净收益和消耗来源 |
| `docs/phase_129_numeric_promotion_gate.md` | 数值晋升门禁，汇总 pass/watch/blocked/fail，判断能否晋升 active |
| `docs/phase_130_combat_formula_parity_calibration.md` | 战斗公式校准记录，解释敏捷对抗、合击、玄影弓倍率顺序如何进入表结构 |
| `docs/phase_131_combat_formula_driver.md` | 表驱动战斗公式计算模型，记录严格 parity、最大差门禁和真实切换边界 |
| `docs/phase_132_combat_formula_driver_switch.md` | 真实 BattleModel 公式驱动开关和 legacy/table 固定战斗 A/B 门禁 |

## 核心数值表

### `data/balance/level_curves.json`

用于人物和宠物经验曲线。第一版建议继续使用公式生成锚点，不手写最终 140 行。

字段建议：

```json
{
  "schemaVersion": 1,
  "maxPlayerLevel": 140,
  "maxPetLevel": 140,
  "curves": [
    {
      "id": "default_1_140",
      "formula": "current_v1",
      "anchors": [
        {"level": 80, "role": "first_rebirth_loop"},
        {"level": 131, "role": "exp_pill_test_anchor"},
        {"level": 140, "role": "pet_long_term_cap"}
      ]
    }
  ]
}
```

第一版判断：

- Lv1-20：教学快段。
- Lv21-60：探索成长期。
- Lv61-80：一转准备段。
- Lv81-100：守护战准备段。
- Lv101-120：高阶洞穴段。
- Lv121-131：经验丹测试和追赶段。
- Lv132-140：宠物转生、满级溢出经验丹、长期培养段。

### `data/balance/player_growth.json`

用于人物基础成长、加点收益和转生重算。

字段建议：

```json
{
  "schemaVersion": 1,
  "baseStats": {"maxHp": 120, "attack": 18, "defense": 6, "quick": 70},
  "statPointsPerLevel": 3,
  "pointGains": {"maxHp": 4, "attack": 1, "defense": 1, "quick": 1},
  "rebirth": {
    "maxRebirth": 6,
    "requiredLevelByRebirth": [80, 80, 80, 80, 80, 80],
    "previewFormula": "rebirth_v1"
  }
}
```

第一版先保留每转 Lv80 硬门槛。后续若要加难度，可以优先靠任务链、转生兽、守护战、装备需求和经济消耗，不急着让每转都变成更高等级墙。

### `data/balance/pet_growth_profiles.json`

用于宠物成长档、个体随机、品质和战力解释。

字段建议：

```json
{
  "schemaVersion": 1,
  "profiles": [
    {
      "id": "attack_high",
      "displayName": "攻击成长高",
      "perLevel": {"maxHp": [8, 10], "attack": [1.8, 2.2], "defense": [0.8, 1.2], "quick": [0.9, 1.3]},
      "individualVariance": {"min": -0.08, "max": 0.08}
    }
  ],
  "powerFormula": "round(maxHp / 4 + attack + defense + quick)"
}
```

宠物实例应保留：

- `growthProfileId`
- `individualSeed`
- `individualRates`
- `initialStats`
- `growthRollHistory`
- `powerBreakdown`

这能解释为什么同种同级宠物战力不同，也能让后续“极品/普通/垃圾”有数据来源。

### `data/balance/combat_formulas.json`

用于战斗公式旋钮。事件流程留在 `BattleModel`，数值放表。

当前 `combat_v1` 是旧实战 parity 公式。它的目标不是做最终更好玩的伤害曲线，而是保证未来把真实战斗切到表驱动时不暗改手感。

```text
rawAttack = attacker.attack + action.flatPower
defenseCut = round(target.defense * defenseFactor)
reduced = rawAttack - defenseCut
if target guarding:
    reduced = floor(reduced * guardMultiplier)
if multi target:
    reduced = round(reduced * action.powerMultiplier)
damage = max(1, round(reduced))
```

建议默认值：

| 项 | 默认值 |
|---|---:|
| 普通攻击 `powerMultiplier` | 1.0 |
| 普通攻击 `defenseFactor` | 0.35 |
| 宠物伤害技能 `defenseFactor` | 0.25 |
| 防御减免取整 | 先四舍五入，再从攻击中扣除 |
| 防御姿态 `guardMul` | 0.45 |
| 防御姿态取整 | `floor` |
| 等级差伤害倍率 | `0.0`，当前旧实战 parity 不启用 |
| 回避模式 | `quick_contest_sqrt` |
| 回避上限 | 0.75 |
| 暴击模式 | `quick_contest_sqrt` |
| 暴击伤害倍率 | 1.35 |
| 合击我方 / 敌方基础率 | 0.50 / 0.20 |
| 合击每多 1 人固定伤害 | 8 |
| 玄影弓倍率顺序 | 先扣防御，再乘群攻倍率 |
| 状态命中模式 | `legacy_base_minus_resistance` |

属性克制第一版用柔和矩阵：

- 地克水
- 水克火
- 火克风
- 风克地
- 强克倍率 1.35
- 被克倍率 0.75

多属性宠物按 10 点属性权重加权计算，不做单一主属性硬判。

### `battle_actions.json` 规范化字段

已有 `battle_actions.json` 继续作为技能表，但建议统一这些字段：

```json
{
  "formula": "physical_damage",
  "flatPower": 0,
  "powerMultiplier": 1.0,
  "defenseFactor": 0.35,
  "elementSource": "attacker",
  "baseDodgeRate": 0.03,
  "maxDodgeRate": 0.35,
  "baseCritRate": 0.05,
  "criticalDamageMultiplier": 1.35,
  "canCounter": true,
  "canLaunch": true,
  "comboEligible": true
}
```

弓类多目标额外字段：

```json
{
  "target": "enemy_random_range",
  "minTargets": 6,
  "maxTargets": 10,
  "targetCountFalloffPerExtra": 0.03,
  "canCounter": false,
  "canLaunch": false,
  "comboEligible": false,
  "criticalDamageMultiplier": 1.0
}
```

这里保留“可会心显示但伤害不放大”的设计：弓可以有会心表现，但不让多目标技能通过暴击造成总伤害爆炸。

### `data/balance/capture_formula.json`

捕捉公式要使用工具权重、血量、等级、难度、异常状态。

字段建议：

```json
{
  "schemaVersion": 1,
  "baseChance": 0.18,
  "hpMissingWeight": 0.35,
  "levelGapWeight": 0.015,
  "difficultyWeight": 0.004,
  "toolPowerWeight": 0.02,
  "statusBonus": {"sleep": 0.12, "stone": 0.08, "poison": 0.03},
  "minChance": 0.02,
  "maxChance": 0.92
}
```

已有捕捉工具强弱顺序继续保留：

| 工具 | 权重 |
|---|---:|
| 空手 | 1 |
| 初级绳 | 3 |
| 捕捉网 | 6 |
| 强化网 | 10 |

自动捕捉选择高级工具时，按权重向下兜底。正式捕捉概率不要只吃 `chanceBonus`，应让 `capturePower` 参与抵消捕捉难度。

### `data/balance/reward_economy.json`

用于统一奖励来源、石币、掉落、邮件兜底和经济回收。

第一版经济锚点：

| 场景 | 目标 |
|---|---|
| 新手任务 | 给足买肉、第一次买装、第一次捕捉的教学成本 |
| 低级野战 | 1 场约等于 1 个基础消耗品 |
| 中级野战 | 1 场约等于 0.3-0.5 件同级装备预算 |
| 高级野战 | 覆盖修理、捕捉、补给，不直接买满下一阶段装备 |
| 守护战 | 普通战斗 8-12 倍奖励，补偿补给和修理 |
| 转生任务 | 少给直接石币，更多给阶段资格和绑定奖励 |

价格形状：

| 类别 | 建议 |
|---|---|
| 基础装备 | 30-120 石币 |
| Lv20-60 装备 | 180-600 石币 |
| Lv60-80 装备 | 800-1800 石币 |
| 1转装备 | 2500-6000 石币或试炼奖励 |
| 2转装备 | 7000-15000 石币，更多依赖材料/合成 |
| 初级绳 | 同级普通战斗约 1 场收入 |
| 捕捉网 | 同级普通战斗约 2-3 场收入 |
| 强化网 | 同级普通战斗约 5-6 场收入 |

钻石第一版只做便利和测试，不进入战力售卖：

- 背包扩容
- 兽栏扩容
- 外观
- 账号便利
- GM/QA 补偿

## 迁移计划

### Phase123A：只整理表和 catalog，不改玩法（已完成）

- 新增 `client/godot/data/balance/`。
- 新增基础 JSON 表和 schema 检查。
- 新增 `BalanceCatalogModel` 集中读取模型。
- 表读取带旧常量 fallback，保证表缺失时不直接炸存档。
- 自检入口：`--auto-balance-catalog-check`。

### Phase123B：经验、成长、战力迁移（已完成第一轮）

- `exp_to_next_level()` 读取曲线 catalog。
- 人物成长、宠物成长档、战力公式读取 balance 表。
- 人物升级属性点、加点收益、村医费用、转生等级门槛读取 balance 表。
- 装备耐久损耗频率、修理单价读取 balance 表。
- 商店默认出售倍率读取 economy 表。
- 做迁移前后 parity 检查，保证旧存档数值不突然变。

### Phase124：数值版本与实验基线（已完成第一轮）

- 给 balance 表补 `balanceVersion`、`formulaVersion`。
- 产出固定样本的 `numeric_experiment_report`，第一轮覆盖经验曲线、练级收益、捕捉矩阵、装备耐久经济。
- 当前命令：`--numeric-experiment-report`。
- 自检命令：`--auto-numeric-experiment-report-check`。
- 当前基线记录：[Phase124 数值实验基线](/Users/fander/projects/Beastbound_Odyssey/docs/phase_124_numeric_experiment_baseline.md)。
- 建立 baseline 文件，后续调参必须对比。

### Phase125：成长和经济仿真（已拆分落地）

- 战斗经验、宠物经验分配、候补宠经验比例进入表。
- 战斗掉落、任务奖励、修理费、补给消耗做净收入报表。
- 不用单场体感判断“爽不爽”，先看每小时收益、死亡率、补给缺口。

### Phase126：战斗公式 shadow 迁移（已完成第一轮）

- 先迁移普通攻击、技能威力、防御系数、回避、暴击，固定 seed 对比旧结果。
- 再迁移属性克制、合击、多目标弓、状态命中、治疗。
- 弓类继续遵守：可目标 6-10 个，可独立未命中，不反击、不击飞、不合击，不做暴击伤害放大。
- 每个迁移都要有固定 seed 的战斗样例，不靠肉眼看一次战斗。

### Phase127：捕捉公式和宠物个体成长校准

- 捕捉公式正式接入 `capturePower` 和 `toolPowerWeight`。
- 按血量、工具、状态、等级差分桶采样。
- 宠物品质阈值、个体差范围用捕获样本回填，不凭直觉定极品率。

### Phase128：奖励、商店、装备经济闭环（已完成净收入账本第一轮）

- 掉落、商店、出售、修理、强化成本统一到 reward/economy 表。
- 背包满、邮箱兜底、任务奖励都走统一奖励流水。
- 装备强化、耐久、合成、修理形成长期金币回收。
- 当前已补 `economy_ledger_scenarios.json` 和 `NumericEconomyLedgerModel`，可计算每战/每小时净收入。
- 后续仍需把捕捉工具实际消耗、材料出售/拍卖、强化失败、任务门票纳入账本。

### Phase129：数值晋升门禁（已完成第一轮）

- 汇总 catalog、区域收益、战斗公式 shadow、固定战斗仿真、经济账本和文档门禁。
- `fail` 表示基础数值坏了；`blocked` 表示某个候选项暂不应晋升；`watch` 表示需要策划解释或后续回收。
- Phase131 后真实战斗公式晋升门禁为 `pass`，经济净收入仍为 `watch`。
- 公式门禁同时检查平均差和最大单样本差，避免平均值掩盖某个技能偏移。
- 自检命令：`--auto-numeric-balance-gate-check`。

### Phase130：战斗公式 parity 校准（已完成）

- 把敏捷对抗、合击固定加成、多目标弓倍率顺序写入 `combat_formulas.json`。
- 初步让公式表低于晋升阈值；Phase131 继续把宠物技能、防御取整、状态命中收紧到严格 parity。
- 记录见 [Phase130 战斗公式 parity 校准](/Users/fander/projects/Beastbound_Odyssey/docs/phase_130_combat_formula_parity_calibration.md)。

### Phase131：表驱动战斗公式模型（已完成）

- 新增 `CombatFormulaModel`，把表驱动公式从 shadow 报告中抽成可复用模型。
- `CombatFormulaShadowModel` 改为调用 `CombatFormulaModel`，避免公式重复实现。
- `combat_v1` 收紧为严格旧实战 parity：12 个样本平均差 0、最大差 0。
- 真实战斗默认仍未切换；Phase132 已补 explicit flag 和固定战斗 A/B，后续还需要继续扩充挂机/捕捉/PVP 回放。
- 记录见 [Phase131 表驱动战斗公式模型](/Users/fander/projects/Beastbound_Odyssey/docs/phase_131_combat_formula_driver.md)。

### Phase132：真实战斗公式驱动切换门禁（已完成第一轮）

- `BattleModel` 新增 `combatFormulaDriver`，默认 `legacy`，可显式切到 `table`。
- `table` 驱动调用 `CombatFormulaModel`，但正常客户端不默认启用，避免暗改手感。
- 新增 `CombatFormulaDriverABModel`，用 9 个固定战斗样本回放 legacy/table，当前全部一致。
- `NumericBalanceGateModel` 新增 `combat_formula_driver_ab` 门禁；公式晋升必须同时满足 shadow 单点 parity 和真实战斗 A/B parity。
- 记录见 [Phase132 真实战斗公式驱动切换门禁](/Users/fander/projects/Beastbound_Odyssey/docs/phase_132_combat_formula_driver_switch.md)。

### Phase133：服务端权威预留

- MySQL 侧只存 active balance set 和版本号，不把客户端旧表散落复制。
- 战斗回放记录 `balanceVersion`、`formulaVersion`、随机 seed、奖励来源。
- 方便以后排查“某次调参前后为什么宠物/收益不同”。
- 已新增 `balance_sets.json`，当前 active set 为 `phase123_core_v1`。
- 战斗结算会追加 `battleResultReceipts`，回执包含数值版本、奖励、捕获、击飞摘要。
- `ServerProfileContractModel` 已预留 `battle_result_receipts` 模块，未来可迁移到服务端追加表。
- 记录见 [Phase133 数值版本与战斗回执契约](/Users/fander/projects/Beastbound_Odyssey/docs/phase_133_balance_version_receipt_contract.md)。

### Phase134：数值快照指纹（已完成第一轮）

- 仅有版本号不够；如果同名版本表内容被改，旧战斗回执会失去审计意义。
- `BalanceCatalogModel.balance_snapshot_summary()` 会对 11 个核心数值源文件计算 SHA-256 digest。
- 战斗回执、数值报告、晋升门禁、服务端投影都带 `sourceDigest` 或 `balanceSourceDigest`。
- digest 不在移动、HUD、战斗动画热路径中计算，只在报告、门禁、结算回执这类低频路径使用。
- 记录见 [Phase134 数值快照指纹契约](/Users/fander/projects/Beastbound_Odyssey/docs/phase_134_numeric_snapshot_digest_contract.md)。

## 验证计划

每次改数值系统都至少验证：

- JSON 可解析，引用都存在。
- 旧存档能正常 normalize。
- 关键公式固定 seed 结果稳定。
- 新手链能完成。
- GM 10V10 能跑。
- 捕捉样本有分桶统计。
- 移动、HUD、任务追踪、商店切换、人物状态点击没有性能回退。

建议命令组见 [Phase123 调研附录](/Users/fander/projects/Beastbound_Odyssey/docs/phase_123_numeric_research_appendix.md)。

本轮 Phase123 已验证的关键命令：

```sh
jq empty client/godot/data/balance/*.json
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-balance-catalog-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-player-stat-points-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-durability-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-shop-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-economy-ledger-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-combat-formula-parity-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-combat-formula-driver-ab-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-balance-version-receipt-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-numeric-balance-gate-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-individual-growth-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-player-stat-spam-perf-check
```

注意：商店批量购买自测必须使用干净背包 profile；默认 GM/任务存档可能已经有大量道具，不适合作为“容量足够”的测试基准。

## 待评审点

- 2转以后是否继续统一 Lv80，还是逐转提高到 Lv90 / Lv100。
- 候补宠物是否获得 30% 还是 50% 经验。
- 宠物兽栏是否永远 0% 经验，还是以后加“训练所”系统。
- 强化是否第一版完全不失败，还是高等级强化加入保底材料。
- 钻石是否只做便利，还是后面允许部分交易/拍卖相关功能。
