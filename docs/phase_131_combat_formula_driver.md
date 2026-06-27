# Phase131 表驱动战斗公式模型

本阶段目标是把 Phase130 的公式校准结果从 shadow 报告里抽出来，形成一个可复用的表驱动计算模型。它仍然不改变真实战斗结果，但已经为未来把 `BattleModel` 切到表驱动公式打好了工程边界。

## 本轮结论

- 新增 `CombatFormulaModel`，统一计算表驱动的普通攻击、宠物伤害技能、多目标攻击、合击伤害、回避率、暴击率和状态命中率。
- `CombatFormulaShadowModel` 不再保存一份重复公式，而是调用 `CombatFormulaModel` 和旧 `BattleModel` 做 A/B 对照。
- `combat_v1` 被收紧为旧实战严格 parity 公式，避免未来切换时暗改手感。
- 当前 12 个 shadow 样本全部严格一致：平均伤害差 `0.00`，平均概率差 `0.0000`，最大伤害差 `0`，最大概率差 `0.0000`。
- 真实战斗仍默认未切换到表驱动。Phase132 已补显式开关和固定战斗 A/B 回放门禁，正式默认切换仍需单独评审。

## 新增模型

```text
client/godot/scripts/progression/combat_formula_model.gd
```

职责：

- 只读取 `combat_formulas.json` 和战斗 state，不依赖 `BattleModel`。
- 允许未来 `BattleModel` 反向调用它，避免循环 preload。
- 保留旧战斗中的细节：防御先取整、守护后向下取整、敏捷平方根对抗、合击固定伤害、状态基础命中减抗性。

当前公开函数：

| 函数 | 用途 |
|---|---|
| `attack_damage_for()` | 普通攻击伤害 |
| `skill_damage_for()` | 宠物/技能伤害 |
| `multi_attack_damage_for()` | 多目标攻击伤害 |
| `combo_damage_for()` | 合击总伤害 |
| `dodge_rate_for()` | 回避率 |
| `critical_rate_for()` | 暴击率 |
| `combo_rate_for_event()` | 合击触发率 |
| `status_hit_rate_for()` | 状态命中率 |

## `combat_v1` 边界

`combat_v1` 是旧实战 parity 版本，不是最终“更好玩”的新公式。

关键字段：

| 字段 | 当前值 | 含义 |
|---|---:|---|
| `roundDefenseBeforeSubtract` | `true` | 先对防御减免四舍五入，再扣攻击 |
| `levelDifferenceMultiplierPerLevel` | `0.0` | 旧实战伤害不吃等级差倍率 |
| `guardRounding` | `floor` | 防御姿态后向下取整 |
| `dodge.mode` | `quick_contest_sqrt` | 回避使用旧敏捷对抗 |
| `critical.mode` | `quick_contest_sqrt` | 暴击使用旧敏捷对抗 |
| `combo.flatBonusPerExtraParticipant` | `8` | 合击每多一个参与者固定加 8 |
| `multiTarget.applyPowerMultiplierAfterDefense` | `true` | 先算普通伤害，再乘群攻倍率 |
| `statusHit.mode` | `legacy_base_minus_resistance` | 状态命中 = 基础命中 - 抗性 |

如果后续要加入等级差伤害、状态命中敏捷修正、群攻目标数衰减，应该新增 `combat_v2`，不要污染 `combat_v1`。

## 当前样本

| 样本 | 旧真实公式 | 表驱动公式 | 差异 |
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

## 门禁升级

`NumericBalanceGateModel` 的真实战斗公式晋升门禁现在不只看平均差，还看最大单样本差：

| 指标 | 当前值 | 门槛 |
|---|---:|---:|
| 平均伤害差 | 0.00 | <= 5.0 |
| 平均概率差 | 0.0000 | <= 0.08 |
| 最大伤害差 | 0 | <= 10 |
| 最大概率差 | 0.0000 | <= 0.08 |
| 严格 parity | true | 参考指标 |

## 自测命令

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-combat-formula-parity-check
```

当前输出：

```text
combat formula parity check ready: status=ok samples=12 damage=6 rate=4 combo=2 avg_damage_delta=0.00 avg_rate_delta=0.0000 max_damage_delta=0 max_rate_delta=0.0000 strict=true errors=
```

门禁：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-numeric-balance-gate-check
```

当前输出：

```text
numeric balance gate check ready: status=ok gates=8 pass=7 watch=1 blocked=0 fail=0 core_ok=true formula_ready=true errors=
```

## 后续切换要求

真正把真实战斗切到表驱动前，还需要：

1. 保持 explicit formula driver 开关，默认仍走旧 `BattleModel`。
2. 继续扩充固定 seed 完整战斗事件 A/B，而不是只比单点公式。
3. 覆盖普通练级、10V10 自动战斗、自动捉宠、洞穴守护、玄影顶层、击飞/休息/PVP 预留样本。
4. 跑完整客户端性能基线，确认公式模型不会进入 `_process` 或 HUD 热路径。
5. 如果未来要做新平衡，新增 `combat_v2` 并让门禁报告明确显示差异来源。
