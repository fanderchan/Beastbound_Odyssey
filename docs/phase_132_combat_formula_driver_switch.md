# Phase132 真实战斗公式驱动切换门禁

本阶段把 Phase131 的 `CombatFormulaModel` 接入真实 `BattleModel`，但默认玩法仍使用旧公式驱动。目标不是马上改手感，而是建立“以后可以安全切换”的工程门禁。

## 本轮结论

- `BattleModel` 新增 `combatFormulaDriver`：默认 `legacy`，可显式切到 `table`。
- `table` 驱动调用 `CombatFormulaModel`，读取 `combat_formulas.json` 的 `combat_v1`。
- 新增 `CombatFormulaDriverABModel`，用同一组固定战斗样本分别跑 `legacy` 和 `table`，对结果、回合、血量、核心事件计数和事件摘要做 A/B。
- 当前 9 个固定战斗样本全部一致：`identical=9`、`mismatches=0`、最大回合差 `0`、最大人物血量差 `0`。
- `NumericExperimentModel` 和 `NumericBalanceGateModel` 已接入 A/B 报告；门禁现在会阻止有差异的真实公式驱动晋升。

## 驱动边界

| 驱动 | 用途 | 默认启用 |
|---|---|---|
| `legacy` | 当前真实战斗旧公式 | 是 |
| `table` | 通过 `CombatFormulaModel` 和 `combat_formulas.json` 计算 | 否 |

切换方式只通过战斗 state：

```gdscript
state = BattleModel.with_combat_formula_driver(
	state,
	BattleModel.COMBAT_FORMULA_DRIVER_TABLE,
	BalanceCatalogModel.active_combat_formula()
)
```

这个设计有三个目的：

- 正常客户端不变，避免暗改玩家手感。
- A/B 回放使用同一套 state 和 seed，差异能被定位到公式驱动。
- 公式表快照可随战斗记录持久化，方便未来服务端回放和查账。

## 已接入的公式点

| 战斗点 | legacy | table |
|---|---|---|
| 普通攻击伤害 | `BattleModel._attack_damage_for` | `CombatFormulaModel.attack_damage_for` |
| 宠物/技能伤害 | `BattleModel._skill_damage_for` | `CombatFormulaModel.skill_damage_for` |
| 多目标攻击伤害 | `BattleModel._multi_attack_damage_for` | `CombatFormulaModel.multi_attack_damage_for` |
| 合击重算伤害 | 旧合击总和 + 固定 8 | `CombatFormulaModel.combo_damage_for` |
| 回避率 | 旧敏捷平方根对抗 | `CombatFormulaModel.dodge_rate_for` |
| 暴击率 | 旧敏捷平方根对抗 | `CombatFormulaModel.critical_rate_for` |
| 合击率 | 旧职业/怪物基础率 | `CombatFormulaModel.combo_rate_for_event` |
| 状态命中 | 基础命中 - 抗性 | `CombatFormulaModel.status_hit_rate_for` |

`combat_v1` 仍是严格旧行为 parity。未来要做等级差伤害、属性克制、群攻目标数衰减、状态敏捷修正时，应新增 `combat_v2`，不要修改 `combat_v1`。

## A/B 报告

新增报告：

```text
.run/godot/combat_formula_driver_ab_report.json
```

报告字段：

| 字段 | 说明 |
|---|---|
| `scenarioCount` | 固定战斗样本数 |
| `identicalCount` | 完全一致样本数 |
| `mismatchCount` | 差异样本数 |
| `maxAbsRoundDelta` | 最大回合差 |
| `maxAbsPlayerHpDelta` | 最大人物血量差 |
| `eventDigestHash` | 每个样本的事件摘要哈希 |
| `firstMismatch` | 第一个差异点 |

## 自测命令

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-combat-formula-driver-ab-check
```

当前输出：

```text
combat formula driver ab check ready: status=ok samples=9 identical=9 mismatches=0 max_round_delta=0 max_hp_delta=0 ready=true errors=
```

总报告也会带上 A/B：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-numeric-experiment-report-check
```

门禁：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-numeric-balance-gate-check
```

当前门禁口径：

- `combat_formula_active_switch`：公式单点 shadow 差异必须低于阈值。
- `combat_formula_driver_ab`：真实战斗回放必须完全一致。
- 两个门禁都通过时，`formulaSwitchReady=true`。

## 性能边界

本阶段没有把公式表读取放进 `_process`、HUD、任务追踪或移动路径。正常玩法默认 `legacy`，不会在每次攻击时读 JSON。A/B 测试会把公式快照写进 state，避免战斗循环内反复查 active formula。

后续如果真的把默认驱动切到 `table`，必须重新跑完整客户端性能基线，尤其是：

```sh
godot --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --perf-probe
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-player-stat-spam-perf-check
```

## 后续

1. 继续扩充 A/B 样本：自动捉宠、逃跑、击飞、PVP 预留、更多异常状态。
2. 新增 `combat_v2` 之前，先写调参目标和期望差异，不在 `combat_v1` 上直接改。
3. 等公式、固定战斗、经济账本、性能基线都稳定后，再讨论是否把真实默认驱动从 `legacy` 切为 `table`。
