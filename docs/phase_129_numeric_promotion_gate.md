# Phase129 数值晋升门禁

本阶段补的是“数值能不能晋升”的统一裁判。前面已经有经验/成长/区域收益、战斗公式 shadow、固定战斗仿真、经济净收入账本，但这些报告分散在不同文件里。Phase129 把它们合成一个门禁报告，避免以后凭感觉把某套数值或公式切成 active。

## 自测命令

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-numeric-balance-gate-check
```

输出报告：

```text
.run/godot/numeric_balance_gate_report.json
```

## 数据来源

执行模型：

```text
client/godot/scripts/progression/numeric_balance_gate_model.gd
```

它会复用：

- `BalanceCatalogModel.validation_errors()`
- `NumericExperimentModel.build_report()`
- `CombatFormulaShadowModel.validation_errors()`
- `CombatFormulaDriverABModel.validation_errors()`
- `NumericBattleSimulatorModel.validation_errors()`
- `NumericEconomyLedgerModel.validation_errors()`

## 状态含义

| 状态 | 含义 | 是否让自测失败 |
|---|---|---|
| `pass` | 该门禁通过 | 否 |
| `watch` | 可以继续开发，但需要策划解释或补金币回收/风险说明 | 否 |
| `blocked` | 不建议晋升某个候选项，例如真实战斗公式 | 否 |
| `fail` | 基础报告或硬门槛坏了 | 是 |

这里故意把 `blocked` 和 `fail` 分开。当前战斗公式仍处于 shadow 阶段，不 ready 是正常状态；只有报告本身坏、区域收益坏、固定战斗坏、经济净收入为负，才应该让自测失败。

## 当前门禁

| 门禁 | 当前状态 | 口径 |
|---|---|---|
| 数值表结构 | `pass` | balance 表字段、引用、区间合法 |
| 区域经验/石币/战数 | `pass` | 9 个区域收益样本经验和石币命中，7 个可重复区战数命中 |
| 战斗公式 shadow 报告健康 | `pass` | shadow 样本可用 |
| 真实战斗公式晋升 | `pass` | 平均伤害差 0.00 <= 5.0，平均概率差 0.00% <= 8.00%，最大单样本差为 0 |
| 真实公式驱动 A/B | `pass` | 9 个固定战斗样本 legacy/table 完全一致 |
| 固定战斗仿真 | `pass` | 9/9 满足胜负、回合和血量门槛 |
| 经济净收入 | `watch` | 7/7 可重复练级区净收入为正，但高阶区每小时净收入偏高 |
| 数值基线文档 | `pass` | Phase123-133 关键文档齐全 |

汇总：

| 指标 | 当前值 |
|---|---:|
| 门禁数 | 8 |
| pass | 7 |
| watch | 1 |
| blocked | 0 |
| fail | 0 |
| 基础校验健康 | true |
| 真实战斗公式可晋升 | true |

## 当前结论

- 可以进入正式数值策划的“表驱动调参”阶段，因为基础表、区域、固定战斗、经济账本都能跑通。
- Phase132 后 `combat_formulas.json` 已具备真实战斗公式晋升条件，并且 shadow 单点样本、固定战斗 A/B 回放都严格 parity；不过默认真实驱动仍保持 `legacy`，正式切换要单独评审。
- Phase133/134 后 active balance set 为 `phase123_core_v1`，战斗结算会记录数值版本回执和源指纹，后续调参可以追踪“这场战斗用的是哪套表、同名版本内容是否一致”。
- 高阶区经济需要 watch：现在不是负收益问题，而是后续通胀回收问题。

## 后续门槛

以后准备晋升某套数值或公式时，至少要满足：

1. `--auto-numeric-balance-gate-check` 没有 `fail`。
2. 如果要切真实战斗公式，`combat_formula_active_switch` 和 `combat_formula_driver_ab` 必须同时保持 `pass`。
3. 如果经济仍是 `watch`，必须在调参文档里说明金币回收来源。
4. 如果固定战斗仿真或经济净收入变成 `fail`，不能晋升 active。
5. 晋升后要把新报告快照写入对应 baseline 文档。
6. 如果新增或晋升 balance set，必须让战斗回执和服务端预留投影继续带完整版本字段和源指纹。
