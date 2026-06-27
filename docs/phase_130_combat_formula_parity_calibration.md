# Phase130 战斗公式 parity 校准

本阶段目标是把 `combat_formulas.json` 从“候选设计公式”校准成“能表达当前真实战斗公式的表结构”。这一步仍然不改变真实战斗来源，只让 shadow 报告证明：如果后续要把战斗公式迁到表驱动，表里已经有足够字段承接当前手感。

## 本轮结论

- 真实战斗公式晋升门禁已经从 `blocked` 变成 `pass`。
- Phase131 后当前 shadow 平均伤害差为 `0.00`，平均概率差为 `0.0000`，最大单样本差也为 `0`。
- 宠物技能、防御取整、等级差样本和状态命中都已收紧到旧实战严格 parity。
- `CombatFormulaModel` 已接管表驱动计算，shadow 报告不再保存重复公式。
- 真实战斗尚未切换到表驱动。下一步若要切换，应该新增开关和 A/B 回放，而不是直接替换 `BattleModel`。

## 校准点

### 1. 敏捷对抗

旧 `BattleModel` 的回避和暴击不是简单线性差值，而是平方根型敏捷对抗。线性公式会把高敏单位的回避和暴击压得太低。

本轮在 `combat_formulas.json` 中加入：

```json
{
  "mode": "quick_contest_sqrt",
  "dexDivisor": 0.02
}
```

回避使用 `dexDivisor=0.02`，暴击使用 `dexDivisor=0.09`，并保留旧上限。

### 2. 合击

旧合击有两个核心行为：

- 我方基础合击率 `50%`
- 敌方基础合击率 `20%`
- 合击伤害是参与者伤害和，再按额外参与者固定加 `8`

本轮把固定加成写成表字段：

```json
{
  "allyBaseRate": 0.50,
  "monsterBaseRate": 0.20,
  "bonusPerExtraParticipant": 0.0,
  "flatBonusPerExtraParticipant": 8
}
```

### 3. 多目标弓

旧玄影弓样本的顺序是：

```text
普通攻击伤害 = 攻击 - 防御减免
群攻伤害 = 普通攻击伤害 * 群攻倍率
```

如果改成“先乘倍率再扣防御”，同一把弓会少 5 点伤害。为了保持旧手感，本轮加入：

```json
{
  "applyPowerMultiplierAfterDefense": true,
  "targetCountFalloffPerExtra": 0.0
}
```

后续如果要削弱全体弓，不应该改这份 parity 公式，而应该新增 `combat_v2`，通过固定战斗仿真和用户体感评审。

### 4. 防御取整、等级差和状态命中

Phase131 进一步收紧了三个容易被忽略的差异：

- 旧伤害是先对防御减免四舍五入，再从攻击中扣除。
- 旧普通伤害不吃等级差倍率，所以 `combat_v1` 的 `levelDifferenceMultiplierPerLevel=0.0`。
- 旧状态命中只做 `基础命中 - 抗性`，所以 `statusHit.mode=legacy_base_minus_resistance`。

## 当前样本

| 样本 | 旧真实公式 | 新表驱动公式 | 差异 |
|---|---:|---:|---:|
| 普通攻击同级 | 76 | 76 | 0 |
| 宠物伤害技能 | 78 | 78 | 0 |
| 防御目标 | 34 | 34 | 0 |
| 等级差普通攻击 | 76 | 76 | 0 |
| 玄影弓 6 目标 | 49 | 49 | 0 |
| 玄影弓 10 目标 | 49 | 49 | 0 |
| 快速目标回避率 | 51.96% | 51.96% | 0 |
| 快速攻击者暴击率 | 24.27% | 24.27% | 0 |
| 我方合击率 | 50.00% | 50.00% | 0 |
| 我方合击伤害 | 208 | 208 | 0 |
| 敌方合击率 | 20.00% | 20.00% | 0 |
| 敌方合击伤害 | 120 | 120 | 0 |
| 催眠命中 | 82.00% | 82.00% | 0 |
| 石化命中带抗性 | 49.00% | 49.00% | 0 |

## 自测命令

```sh
godot --headless --path client/godot --quit-after 1200 -- --auto-combat-formula-parity-check
```

结果：

```text
combat formula parity check ready: status=ok samples=12 damage=6 rate=4 combo=2 avg_damage_delta=0.00 avg_rate_delta=0.0000 max_damage_delta=0 max_rate_delta=0.0000 strict=true errors=
```

门禁：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-numeric-balance-gate-check
```

结果：

```text
numeric balance gate check ready: status=ok gates=7 pass=6 watch=1 blocked=0 fail=0 core_ok=true formula_ready=true errors=
```

## 后续边界

1. 本阶段只校准公式表和 shadow 计算器，不切真实战斗。
2. 后续切换真实战斗前，需要一个明确的 active formula 开关。
3. 切换时必须跑固定战斗仿真、自动战斗、自动捉宠、洞穴 boss、PVP 预留样本和性能基线。
4. 如果要做新平衡，例如降低群攻弓、调整合击概率、削弱高敏回避，应新增公式版本，而不是污染当前 parity 版本。
