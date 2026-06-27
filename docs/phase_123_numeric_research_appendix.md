# Phase123 数值调研附录

本附录记录 Phase123 的 subagent 分工、StoneAge 8.0 本地参考、Beastbound 当前数值盘点、战斗公式建议、经济节奏和验证样本。主方案见 [Phase123 数值表结构整理](/Users/fander/projects/Beastbound_Odyssey/docs/phase_123_numeric_table_structure_plan.md)。

## Subagent 分工

| 方向 | 产出 |
|---|---|
| StoneAge 8.0 本地参考 | 查经验表、宠物成长、战斗、捕捉、掉落、商店，明确可借鉴与不能照搬的部分 |
| 当前项目数值盘点 | 盘点 GDScript 常量和 JSON 字段，整理迁移到数值表的候选项 |
| 战斗公式 | 设计物理伤害、回避、暴击、属性克制、合击、弓多目标、异常、治疗的 V1 公式 |
| 成长 / 经济 / 奖励 | 设计 1-140 经验曲线分段、转生门槛、石币产消、装备和捕捉工具价格形状 |
| 内容节奏 / 验证 | 按新手区、练级区、捕宠区、四洞、玄影、GM 区定义实验样本 |

本轮实际使用了 3 个只读 subagent：

| Subagent | 研究问题 | 核心结论 |
|---|---|---|
| 当前项目盘点 | 现有 GDScript/JSON 数值硬编码在哪里 | Phase123 应先补齐低风险接入面，目标是旧行为 parity，不是立刻重做手感 |
| StoneAge 8.0 参考 | 本地源码哪些机制值得借鉴 | 借鉴表驱动、多维成长、等级差调节、捕捉条件组合、经济源汇分离；不复制旧数字 |
| 数值治理审阅 | 文档和表结构是否足够支撑长期策划 | 文档要升级成数值工程治理：版本、锚点、旋钮、仿真、性能、服务端预留 |

## Phase123 落地记录

新增目录：

```text
client/godot/data/balance/
```

新增/接入的数据表：

| 表 | 主要字段 | 当前说明 |
|---|---|---|
| `level_curves.json` | `maxPlayerLevel`, `maxPetLevel`, `curves`, `anchors` | 使用公式和锚点管理 1-140 经验曲线 |
| `player_growth.json` | `baseStats`, `statPointsPerLevel`, `pointGains`, `rebirth`, `equipmentWear` | 人物成长、村医、转生门槛、装备耐久参数 |
| `pet_growth_profiles.json` | `profiles`, `individualVariance`, `quality`, `powerFormulas` | 宠物成长档、个体差、品质阈值、战力解释 |
| `combat_formulas.json` | `physicalDamage`, `dodge`, `critical`, `combo`, `multiTarget`, `statusHit` | Phase131 已通过 `CombatFormulaModel` 严格复刻旧公式，不直接改变真实战斗 |
| `capture_formula.json` | `baseChance`, `hpRatioPenalty`, `difficultyRatioPenalty`, `statusBonus`, `toolPowerWeight` | 捕捉基础概率已读取；工具权重预留 |
| `reward_economy.json` | `currencies`, `shop`, `rewardBands`, `equipmentBands`, `captureToolBands` | 商店默认卖价已读取，其余先作经济锚点 |
| `battle_simulation_scenarios.json` | `partySize`, `playerLevel`, `petLevel`, `enemyStats`, `expect` | Phase127 已用真实 `BattleModel` 固定 seed 回放 |
| `economy_ledger_scenarios.json` | `assumptions`, `sourceBattleSuiteId`, `minRepeatableNetStonePerBattle` | Phase128 已计算每战/每小时净收入 |

新增集中读取模型：

```text
client/godot/scripts/progression/balance_catalog_model.gd
```

已接入但保持旧行为的点：

- 人物/宠物等级上限仍为 140。
- `exp_to_next_level()` 和经验丹授予读取 `level_curves.json`，当前公式保持旧结果。
- 人物每级属性点、加点收益读取 `player_growth.json`，当前仍是每级 3 点、生命 +4、攻防敏 +1。
- 村医费用读取 `villageHealHpPerCoin`，当前仍是每 20 生命 1 石币。
- 转生需求等级读取 `rebirth.requiredLevelByTarget`，当前仍是每转 Lv80。
- 装备耐久读取 `equipmentWear`，当前仍是武器攻击 100 次掉 1，防具被命中 10 次掉 1，修理 5 耐久/石币。
- 商店默认卖价读取 `reward_economy.shop.defaultSellRate`，当前仍是 0.5。
- 宠物成长档、个体差范围、品质阈值、战力公式读取 `pet_growth_profiles.json`，当前保持旧结果。
- 捕捉公式读取基础概率和异常状态加成，当前仍保持旧工具概率输出。
- 固定战斗仿真读取 `battle_simulation_scenarios.json`，当前 9 个代表战斗全部通过期望门槛。
- 经济账本读取 `economy_ledger_scenarios.json`，当前 7 个可重复练级段净收入为正。

明确暂不迁移的高风险点：

- `BattleModel` 的真实伤害、回避、暴击、反击、合击、守护减伤仍未切换为表驱动；但伤害/回避/暴击/合击/多目标弓/状态命中已具备严格 shadow parity。
- `battle_exp_reward()` 的战斗经验分配。
- 捕捉工具从 `chanceBonus` 切换到 `capturePower * toolPowerWeight`。
- 地图遭遇池、等级区间、怪物 `battleStats` 全量表驱动。
- 装备强化失败率、长期装备经济、宠物转生最终公式。

## Phase127 固定战斗仿真记录

Phase127 新增固定 seed 战斗仿真，目标是给后续数值调整提供硬回放门槛，而不是做玩家 UI。

新增文件：

```text
client/godot/data/balance/battle_simulation_scenarios.json
client/godot/scripts/progression/numeric_battle_simulator_model.gd
docs/phase_127_battle_simulation_baseline.md
```

自测命令：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-numeric-battle-simulation-check
```

当前读数：

- 场景数：9
- 胜利数：9
- 满足期望：9/9
- 平均回合：5.11
- 平均人物剩余血量：79.80%
- 最硬场景：`shadow_capstone_full_team`
- 最低人物剩余血量：37.02%

评审结论：

- 它已经能挡住“公式一改导致练级打不过、超时、击飞、boss 被秒”的大类回归。
- 当前资格战仍偏短，后续正式 boss 数值应继续加强仪式感。
- 这套仿真不代表完整挂机策略，没有计算药耗、回城补给、村医、修理和卖出回流；经济净收入 ledger 仍是下一优先级。

## Phase128 经济净收入账本记录

Phase128 新增经济账本，目标是把“毛掉落”改成“净收入”视角。

新增文件：

```text
client/godot/data/balance/economy_ledger_scenarios.json
client/godot/scripts/progression/numeric_economy_ledger_model.gd
docs/phase_128_economy_ledger_baseline.md
```

自测命令：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-economy-ledger-check
```

当前读数：

- 场景数：9
- 可重复练级段：7
- 资格战：2
- 可重复净收入为正：7/7
- 平均可重复净收入/战：677.00 石币
- 最低净收入样本：`firebud_newbie_solo`
- 最低净收入/战：31.93 石币
- 最高净收入/小时样本：`shadow_capstone_full_team`
- 最高净收入/小时：225866.54 石币

当前账本已经计算：

- 石币期望掉落。
- 可卖物品的期望出售回收。
- 人物村医费用。
- 人物低血时的战斗补给储备。
- 人物武器攻击和防具受击的修理费用。

暂未计算：

- 自动捕捉的工具实际消耗。
- 材料出售、摆摊、拍卖或合成机会成本。
- 强化失败、装备转生、高阶修理材料。
- 陪练伙伴、其他玩家或非主角账号的成本。

评审结论：

- 当前循环不会因为基础补给/修理变成负收入。
- 高阶区净收入明显偏高，是后续通胀风险。
- 后续进入正式数值策划时，不能只调石币毛掉落，还要同时看金币回收系统是否成型。

## Phase129 数值晋升门禁记录

Phase129 新增数值晋升门禁，目标是把分散报告合成一个可执行判断。

新增文件：

```text
client/godot/scripts/progression/numeric_balance_gate_model.gd
docs/phase_129_numeric_promotion_gate.md
```

自测命令：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-numeric-balance-gate-check
```

当前读数：

- 门禁数：7
- pass：6
- watch：1
- blocked：0
- fail：0
- 基础校验健康：true
- 真实战斗公式可晋升：true

当前门禁状态：

- `catalog_integrity`: pass
- `progression_targets`: pass
- `combat_shadow_report`: pass
- `combat_formula_active_switch`: pass
- `battle_simulation_expectation`: pass
- `economy_net_income`: watch
- `numeric_docs`: pass

评审结论：

- 可以继续进入正式数值策划和表驱动调参。
- Phase131 后战斗公式表已经满足晋升门槛，并且 shadow 样本严格 parity；真实战斗切换仍需要独立开关和完整战斗 A/B 回放。
- 高阶经济偏高需要 watch，后续要补强化、合成、捕捉、材料交易等金币回收。

## Phase130-131 战斗公式 parity 校准记录

Phase130 把 `combat_formulas.json` 从候选公式校准成可承接旧真实战斗的表结构。
Phase131 新增 `CombatFormulaModel`，把表驱动公式抽成可复用模型，并把样本收紧到严格 parity。

新增/更新文件：

```text
docs/phase_130_combat_formula_parity_calibration.md
docs/phase_131_combat_formula_driver.md
```

关键校准：

- 回避和暴击使用 `quick_contest_sqrt`，保留旧敏捷对抗形状。
- 合击基础率改为我方 `50%`、敌方 `20%`，并加入 `flatBonusPerExtraParticipant=8`。
- 玄影弓使用 `applyPowerMultiplierAfterDefense=true`，保持“先扣防御，再乘群攻倍率”的旧顺序。
- 群攻目标数不额外做伤害衰减；如果后续要削弱全体弓，应新增 `combat_v2`。

当前读数：

- shadow 样本数：12
- 平均伤害差：0.00
- 平均概率差：0.0000
- 最大单样本伤害差：0
- 最大单样本概率差：0.0000
- 严格 parity：true
- 数值门禁：7 pass / 1 watch / 0 blocked / 0 fail
- 真实战斗公式可晋升：true

评审结论：

- `CombatFormulaModel` 已经能严格表达当前旧战斗公式。
- 本阶段没有改变真实战斗结果。
- 下一步如果要启用表驱动真实公式，必须新增版本开关，并跑固定战斗、自动战斗、自动捉宠、洞穴 boss 和性能基线。

## StoneAge 8.0 本地参考结论

本轮只使用本地参考 `/Users/fander/projects/_local_references/StoneAge`，没有联网、clone 或下载。

### 经验

可借鉴：

- 原版把升级经验放在外部表，`setup.cf` 通过 `USEREXP=data/exp.txt` 指向经验文件。
- 服务端启动时加载经验表，并通过查询函数取等级经验。
- 战斗经验会考虑敌我等级差，骑宠经验还有额外比例。

不应照搬：

- 不搬原表数值。
- 不搬旧服等级上限和私服配置。
- 不把经验衰减常量当作 Beastbound 最终手感。

对应 Beastbound 方案：

- 使用 `data/balance/level_curves.json` 管理经验曲线和锚点。
- 用实验样本回填每小时经验和每级战斗数。

### 宠物成长

可借鉴：

- 原版宠物成长核心是四维和成长率，捕捉成功后会继承敌方个体数据。
- 敌人/宠物生成时有个体差，成长 rank 会影响后续升级表现。

不应照搬：

- 不搬 32-bit 位移打包成长率。
- 不直接修改模板指针。
- 不搬旧 rank 倍率和家族声望副作用。

对应 Beastbound 方案：

- 宠物实例显式保存 `growthProfileId`、`individualSeed`、`individualRates`、`initialStats`、`growthRollHistory`。
- 战力公式保留用户已确认方向：`round(maxHp / 4 + attack + defense + quick)`。

### 战斗

可借鉴：

- 原版先由基础四维派生战斗属性，再进入伤害公式。
- 伤害大体是攻防差分、随机波动、属性修正。
- 命中、闪避、暴击都围绕敏捷差、装备和 luck 类因素。
- 击飞是 overkill 式特殊结果，不等于普通 0HP。

不应照搬：

- 不搬旧服的缩放常数、防御混合系数、随机常数和职业宏。
- 不把旧 1..10000 概率体系直接搬到 Godot。

对应 Beastbound 方案：

- 战斗流程留代码，威力、防御系数、回避、暴击、属性克制、状态命中进表。
- 继续保持普通 0HP、击飞、宠物休息、记录点回村的语义分离。

### 捕捉

可借鉴：

- 捕捉是独立战斗命令。
- 成功率考虑目标可捕标记、等级差、敏捷、幸运、目标血量、睡眠状态。
- 特殊宠可以要求消耗指定道具。
- 成功后创建宠物实例、移出战斗、记录日志。

不应照搬：

- 不搬旧协议命令字母和固定 MP 成本。
- 不搬原版量纲怪异的血量公式。
- 不硬编码宠 ID / 道具 ID。

对应 Beastbound 方案：

- 捕捉公式读取 `data/balance/capture_formula.json`。
- 工具 `capturePower` 参与难度抵消，`chanceBonus` 作为最终概率补正。

### 掉落与商店

可借鉴：

- 敌人有掉落物和掉落概率配置。
- 战斗结算时随机分配战利品。
- 商店支持 buy/sell rate。
- 金钱和背包满需要明确兜底。

不应照搬：

- 不搬旧 enemy.txt 数据。
- 不搬最多 3 个战利品槽的旧体验。
- 不搬旧 NPC 文本协议和窗口格式。

对应 Beastbound 方案：

- 奖励统一走 reward/economy 表和邮件兜底。
- 商店价格、出售率、修理、强化、任务奖励都纳入经济表。

## 当前 Beastbound 数值盘点

| 类别 | 当前位置 | Phase123 目标 |
|---|---|---|
| 经验曲线 | `PlayerProgressModel.exp_to_next_level()` | `data/balance/level_curves.json` |
| 战斗经验 | `PlayerProgressModel.battle_exp_reward()` + `reward_economy.battleExp` | 已接入表驱动，后续补区域样本 |
| 区域收益 | `progression_zones.json` + `battle_rewards.json` | 已接入数值报告，后续补正式地图/遇敌池 |
| 人物基础属性 | `DEFAULT_PLAYER_BATTLE_STATS` | `data/balance/player_growth.json` |
| 人物加点 | `PLAYER_STAT_POINTS_PER_LEVEL`, `PLAYER_STAT_POINT_GAINS` | `data/balance/player_growth.json` |
| 宠物成长档 | `PET_GROWTH_PROFILES` | `data/balance/pet_growth_profiles.json` |
| 宠物模板 | `pet_templates.json` | 保留，补成长引用和品质字段 |
| 宠物个体差 | `pet_individual_growth_model.gd` | `data/balance/pet_growth_profiles.json` |
| 宠物战力 | `pet_power_model.gd` | `data/balance/pet_growth_profiles.json` 或独立公式表 |
| 战斗公式常量 | `battle_model.gd` | `data/balance/combat_formulas.json` |
| 战斗技能 | `battle_actions.json` | 保留，规范 formula 字段 |
| 被动技能 | `battle_passive_skills.json` | 保留，补命中/回避/抗性字段 |
| 装备数值 | `equipment_items.json` | 保留，补成长线字段 |
| 装备强化 | `equipment_model.gd` | `balance_equipment_growth.json` |
| 装备合成 | `equipment_synthesis_recipes.json` | 保留 |
| 掉落奖励 | `battle_rewards.json` | 保留，补绑定和经济分类 |
| 任务奖励 | `quests.json` | 保留，补奖励来源分类 |
| 商店价格 | `item_shops.json` | 保留，补出售率/折扣规则 |
| 背包扩容 | `backpack_model.gd` | `balance_backpack_slots.json` |
| 捕捉工具 | `capture_tools.json` | 保留，接入 `capturePower` |
| 自动战斗默认值 | `auto_battle_settings_model.gd` | `balance_auto_defaults.json` |
| 自动捕捉默认值 | `auto_capture_settings_model.gd` | `balance_auto_defaults.json` |
| 挂机默认值 | `hang_settings_model.gd` | `balance_auto_defaults.json` |
| GM 测试怪 | GM 地图 JSON | 独立 `gm_fixture`，不混入正式数值 |

暂时保留硬编码：

- schema 版本、字段名、状态 ID、装备槽 ID。
- UI 文案 fallback、按钮顺序、动画时长。
- profile normalize 和事务安全检查。
- 事件列表结构、随机种子流程、HP clamp。
- 地图几何、碰撞、传送格坐标。

## 战斗公式建议细节

### 普通物理

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

样例：

- Lv5 攻击 18 打 Lv4 防御 8：`18 - round(8 * 0.35) = 15`，约 15 伤害。
- `布伊冲撞` 若 `flatPower=12`、`defenseFactor=0.25`，约 28 伤害。

说明：这是 `combat_v1` 旧实战 parity 公式。未来如果要让等级差影响伤害，应新增 `combat_v2`，不要直接污染当前 active 公式。

### 回避

```text
chancePercent = sqrt(max(0, (maxQuick - minQuick) / dexDivisor)) * ratio
dodgeRate = clamp((chancePercent + target.luck + target.dodgeBonus) / 100, minRate, maxRate)
```

`combat_v1` 默认：

- `mode=quick_contest_sqrt`
- `dexDivisor=0.02`
- `minRate=0.0001`
- `maxRate=0.75`

说明：这是旧实战 parity。后续如果觉得 10V10 回避太拖回合，应新增 `combat_v2` 降上限或换线性公式。

### 暴击

```text
chancePercent = sqrt(max(0, (maxQuick - minQuick) / dexDivisor)) * ratio
critRate = clamp((chancePercent + attacker.luck + attacker.criticalBonus) / 100, minRate, maxRate)
critDamage = round(damage * action.criticalDamageMultiplier)
```

`combat_v1` 默认：

- `mode=quick_contest_sqrt`
- `dexDivisor=0.09`
- `maxRate=1.0`
- 普通暴击倍率 `1.35`
- 弓多目标 `criticalDamageMultiplier=1.0`

### 合击

```text
comboDamage = sum(participantDamage) + flatBonusPerExtraParticipant * max(1, count - 1)
```

`combat_v1` 默认：

- 玩家/宠基础触发率 `0.50`
- 野怪基础触发率 `0.20`
- 每多 1 个参与者固定 +8 伤害
- 只允许普通近战合击，多目标弓不合击。

### 弓多目标

```text
targetCount = seededRandom(minTargets, maxTargets)
perTargetDamage = round(normalAttackDamage * powerMultiplier)
```

`combat_v1` 不按目标数量衰减单体伤害。若后续要削弱群攻弓，应新增 `combat_v2`。

建议 `玄影群攻弓`：

- 目标 6-10 个。
- `powerMultiplier=0.65`
- `targetCountFalloffPerExtra=0.03`
- 每个目标独立回避。
- 不反击、不击飞、不合击。
- 耐久按一次攻击消耗，不按目标数量消耗。

### 异常状态

```text
statusChance = clamp(
  action.statusHitRate - target.statusResist[statusId or all],
  0.0,
  1.0
)
```

`combat_v1` 默认：

- 免疫优先于概率。
- 状态命中模式 `legacy_base_minus_resistance`。
- 不加入敏捷差和等级差修正。

说明：敏捷差、等级差和控制类上限适合作为未来 `combat_v2` 旋钮，而不是当前旧实战 parity 行为。
- 毒类上限 0.95。
- 群体异常在 action 本身给更低基础命中。

### 治疗

```text
heal = action.amount + round(healer.level * action.levelScale)
actualHeal = min(heal * healingDoneMul * healingTakenMul, target.maxHp - target.hp)
```

第一版建议：

- 物品治疗固定值。
- 装备精灵默认 `levelScale=0`，沿用 `amount`。
- 以后高级精灵再引入 `levelScale` 或装备治疗倍率。

## 成长与经济建议

### 经验曲线

当前公式大致让 Lv140 累计经验约为 Lv80 的 34 倍。这个比例适合：

- Lv80 作为人物转生循环点。
- Lv140 作为宠物长期培养点。
- Lv131 作为经验丹测试和追赶锚点。

第一版不建议分开人物和宠物经验表，先共用一条曲线，靠经验分配比例控制节奏。

建议宠物经验：

- 出战宠：100%
- 候补队伍宠：后续在 30%-50% 之间试验
- 兽栏宠：0%
- 陪练伙伴：按系统规则自动成长，不消耗玩家管理精力

### 石币产出和消耗

任务奖励：

- 主线小任务给 2-4 场普通战斗的石币。
- 阶段任务给 6-10 场普通战斗的石币。
- 转生资格任务少给直接石币，更多给资格和绑定奖励。

普通战斗：

- 低级区：1 场约等于 1 个基础消耗品。
- 中级区：1 场约等于 0.3-0.5 件同级装备预算。
- 高级区：主要覆盖捕捉、修理、补给。

装备：

- 新手装备 2-5 场普通战斗。
- 中段装备 8-15 场普通战斗。
- 转生前装备 20-40 场普通战斗或转为任务/合成来源。

强化：

- 第一版不做高失败率。
- 材料为主、石币为辅。
- 成本按 `next_level^1.5` 或阶梯递增。

钻石：

- 当前默认 10000 明确是 GM/QA 测试值。
- 正式钻石先做便利，不做直接战力售卖。

## 内容节奏与实验样本

| 分区 | 数据锚点 | 玩家体验定位 | 数值验证重点 |
|---|---|---|---|
| 新手区 | 火芽村、火芽训练链 | 学会对话、买肉、用肉、买装、换装精灵、首胜、捕宠 | 首胜前死亡率接近 0，补给不短缺，首捕不卡纯运气 |
| 练级区 | `firebud_training_field` Lv1-10 | 理解自动战斗、挂机、村医、补给 | 每战时长、每小时经验、石币净收入、药耗、治疗费 |
| 捕宠区 | 乌力池、GM 图鉴草丛 | 压血、工具、状态有价值 | 成功率按 HP、工具、状态分桶 |
| 四洞 | 四大洞穴 4 层、守护兽 10V10 | Lv80 可冒险，Lv100 稳定 | Lv80/Lv100/Lv120 胜率、回合数、补给消耗 |
| 玄影 | 5 层、Lv50 转生兽、顶层 boss | 高压收束区 | 捕获成本、boss 时长、击飞率 |
| GM 区 | GM 10V10、随机图鉴、高击飞、变速 | 复现和采样 | 固定 seed、长时间自动、性能回归 |

建议样本：

| 样本 | 路径 | 观察指标 |
|---|---|---|
| E01 新手全链 | 新档完成到捕捉乌力 | 完成耗时、卡点、补给余量 |
| E02 火芽练级 30 战 | 普通草丛手动/自动各一轮 | 每战时长、经验/小时、补给净消耗 |
| E03 捕乌力 100 次 | HP 100/50/20%，空手/绳/网/强化网，睡眠/无状态 | 成功率曲线、每只保留宠成本 |
| E04 GM 10V10 | GM 10V10 草丛 | 回合数、合击频率、自动稳定性、CPU |
| E05 四洞守护 | Lv80/Lv100/Lv120 打守护 | 胜率、药耗、戒指耗时 |
| E06 玄影捕兽 | 玄影 1-3 层捕 Lv50 转生兽 | 工具/状态价值 |
| E07 玄影顶层 | 玄影 5 层 boss | boss 时长、击飞/失败率 |
| E08 高击飞 | GM 高击飞草丛 | 回记录点、宠物休息、非击飞 0HP 不回村 |

## 自测命令组

基础 JSON：

```sh
jq empty client/godot/data/balance/*.json
jq empty client/godot/data/quests.json client/godot/data/map_regions.json client/godot/data/rebirth_trials.json client/godot/data/pet_templates.json
godot --headless --path client/godot --quit
```

Phase123 catalog：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-balance-catalog-check
```

数值实验报告：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --numeric-experiment-report
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-numeric-experiment-report-check
```

当前基线见 [Phase124 数值实验基线](/Users/fander/projects/Beastbound_Odyssey/docs/phase_124_numeric_experiment_baseline.md)。

功能闭环：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-quest-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-map-region-contract-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-result-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-capture-tools-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-capture-settings-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-capture-feedback-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-rebirth-cave-guardian-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-shadow-oath-cavern-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-rebirth-trial-execute-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-knockaway-result-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-hang-loop-closure-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-player-stat-points-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-durability-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-shop-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-individual-growth-check
```

性能回归：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --movement-perf-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-player-stat-spam-perf-check
```

正常客户端手测：

```sh
godot --path client/godot --scene res://scenes/Main.tscn
```

## 本轮自测结果摘要

```text
jq empty client/godot/data/balance/*.json: ok
godot --headless --path client/godot --quit: ok
--auto-balance-catalog-check: status=ok catalog=true level=true player=true pet=true power=true formula=true economy=true
--auto-numeric-experiment-report-check: status=ok anchors=8 reward_samples=4 capture_rows=5
--auto-player-rebirth-preview-check: status=ok
--auto-player-rebirth-chain-check: status=ok final_count=6
--auto-capture-settings-check: status=ok
--movement-perf-check: status=ok path_len=11
--auto-player-stat-points-check: status=ok
--auto-player-stat-spam-perf-check: status=ok elapsed_ms=0.50
--auto-capture-tools-check: status=ok empty=0.342 rope=0.462 net=0.562 reinforced=0.682 sleep=0.862
--auto-equipment-durability-check: status=ok
--auto-shop-check: status=ok
--auto-pet-individual-growth-check: status=ok
```

说明：

- `--auto-capture-settings-check` 里，捕捉目标可能在宠物防御事件前就被抓走。因此判断口径是“触发捕捉且没有误攻击”，不是强制要求每次都出现宠物防御日志。
- 商店批量购买自测必须使用干净背包 profile。默认测试角色可能携带经验丹、捕捉道具、装备材料，不能用来证明批量购买容量足够。
- 本轮没有运行可视化客户端长时间手测；涉及 UI 外观、战斗观感、鼠标疯狂点击等场景时仍需用 `godot --path client/godot --scene res://scenes/Main.tscn` 手测。

## 调参验收口径

早期看顺不顺：

- 任务奖励能自然支撑买肉、基础装备、第一次捕宠。
- UI 不显示 seed、内部 ID、roll、GM 调试文案。
- 玩家不知道公式也能理解为什么强弱变化。

中后期看准备价值：

- Lv80 转生洞穴能冒险但不舒服。
- Lv100 打四洞应稳定。
- 玄影 boss 应明显高压，但不靠随机秒杀。

捕捉看分桶：

- 不用单次成败判断。
- 至少按血量、工具、状态、等级差分桶。

性能和数值一起收口：

- 每个调参阶段保留上一阶段基线。
- 至少比较 idle、移动、挂机/自动战斗、商店选择、人物状态 spam。
- 数值表读取不能重新把 HUD、任务追踪、移动热路径拖慢。

## Phase132 真实公式驱动 A/B 记录

Phase132 将 `CombatFormulaModel` 接入真实 `BattleModel`，但默认驱动仍保持 `legacy`。

新增自测：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-combat-formula-driver-ab-check
```

当前结果：

```text
--auto-combat-formula-driver-ab-check: status=ok samples=9 identical=9 mismatches=0 max_round_delta=0 max_hp_delta=0 ready=true
```

门禁变化：

- `combat_formula_active_switch` 继续检查单点公式 shadow 差异。
- `combat_formula_driver_ab` 检查真实战斗回放差异。
- `formulaSwitchReady=true` 只有两个门禁都通过才成立。
- 经济门禁仍是 `watch`，原因仍是高阶区每小时净收入偏高，需要后续金币回收系统解释。

设计判断：

- `combat_v1` 继续作为旧手感 parity 版本，不直接调成新平衡。
- 如果要做等级差、属性克制、群攻目标数衰减或状态敏捷修正，应新增 `combat_v2`。
- 默认真实战斗何时从 `legacy` 切到 `table` 仍需单独评审；Phase132 只证明工程上已有安全切换门禁。

## Phase133 数值版本与战斗回执记录

Phase133 将 Phase123-132 的数值表收束成一个 active balance set，并把战斗结算结果写成可回放、可迁移到服务端的回执。

新增数据：

```text
client/godot/data/balance/balance_sets.json
```

当前 active set：

```text
balanceSetId=phase123_core_v1
balanceVersion=phase123_core_v1
formulaVersion=combat_v1
captureFormulaVersion=capture_v1
rewardEconomyVersion=battle_exp_v1
```

新增模型：

```text
client/godot/scripts/progression/battle_result_receipt_model.gd
```

回执写入点：

```text
PlayerProgressModel.apply_battle_result()
profile.battleResultReceipts
```

自测命令：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-balance-version-receipt-check
```

当前结果：

```text
--auto-balance-version-receipt-check: status=ok version=true receipt=true projection=true receipts=1 formula=combat_v1 driver=table errors=
```

后续判断：

- 后续任何核心数值大改，都应新增或晋升 balance set，而不是偷偷覆盖旧版本含义。
- 战斗回执只保留轻量摘要，不把完整战斗事件塞进 profile；完整回放以后可接服务端战斗事件表。
- `combat_v1` 仍是旧行为 parity 版本。新平衡应新增 `combat_v2`，并用 Phase129 门禁确认是否可晋升。

## Phase134 数值快照指纹记录

Phase134 给 active balance set 补了内容级 SHA-256 指纹，避免版本号相同但表内容已经变化。

新增接口：

```text
BalanceCatalogModel.balance_snapshot_summary()
```

当前参与 digest 的核心源文件数量：

```text
sourceCount=11
```

当前窄测结果：

```text
--auto-balance-version-receipt-check: status=ok version=true receipt=true projection=true receipts=1 formula=combat_v1 digest=cc7388f7d3a1 sources=11 driver=table errors=
```

接入口径：

- `NumericExperimentModel` 报告带 `sourceDigest`。
- `NumericBalanceGateModel` 的 catalog gate 带 `sourceDigestShort` 和 `sourceCount`。
- `BattleResultReceiptModel` 回执带完整 `sourceDigest`。
- `server_projection()` 带 `balanceSourceDigest`，方便未来 MySQL 记录。

性能判断：

- digest 只在数值报告、门禁、自测、战斗结算回执生成时计算。
- 不允许把它放进 `_process`、移动寻路、HUD 刷新、任务追踪热路径。
