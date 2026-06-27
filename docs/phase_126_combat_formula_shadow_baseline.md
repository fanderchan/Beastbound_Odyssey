# Phase126 战斗公式影子基线

本阶段目标不是立刻改真实战斗，而是把 `combat_formulas.json` 里设计的表驱动公式和当前 `BattleModel` 真实公式并排计算，形成可评审的差异报告。这样进入正式数值策划时，可以先看差异、改旋钮、跑样本，再决定是否切换真实战斗。

## 自测命令

单独检查战斗公式影子样本：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-combat-formula-parity-check
```

输出示例：

```text
combat formula parity check ready: status=ok samples=12 damage=6 rate=4 combo=2 avg_damage_delta=0.00 avg_rate_delta=0.0000 max_damage_delta=0 max_rate_delta=0.0000 strict=true errors=
```

数值实验总报告也会包含同一份 shadow 数据：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --numeric-experiment-report
```

报告输出：

```text
.run/godot/numeric_experiment_report.json
```

## 当前样本读数

| 样本 | 旧真实公式 | 新表驱动公式 | 差异 | 当前判断 |
|---|---:|---:|---:|---|
| 普通攻击同级 | 76 | 76 | 0 | 可保持当前手感 |
| 宠物伤害技能 | 78 | 78 | 0 | parity |
| 防御目标 | 34 | 34 | 0 | 防御减伤 parity |
| 等级差普通攻击 | 76 | 76 | 0 | 旧实战不吃等级差伤害倍率 |
| 玄影弓 6 目标 | 49 | 49 | 0 | 当前按旧实战顺序：先扣防御，再乘群攻倍率 |
| 玄影弓 10 目标 | 49 | 49 | 0 | 目标数下限/上限仍属于装备配置，不在这里额外衰减 |
| 快速目标回避率 | 51.96% | 51.96% | 0 | 表内使用 `quick_contest_sqrt` 复刻旧敏捷对抗 |
| 快速攻击者暴击率 | 24.27% | 24.27% | 0 | 暴击率同样走旧敏捷对抗 |
| 我方合击率 | 50.00% | 50.00% | 0 | 我方基础合击率已表驱动 |
| 我方合击伤害 | 208 | 208 | 0 | 每多参与者固定 +8 已表驱动 |
| 敌方合击率 | 20.00% | 20.00% | 0 | 怪物基础合击率已表驱动 |
| 催眠命中 / 石化抗性 | 旧值 | 表驱动值 | 0 | `legacy_base_minus_resistance` 已复刻旧状态命中 |

## 设计结论

- 普通攻击、宠物单体技能、防御目标、等级差样本、多目标弓、回避、暴击、合击、状态命中已经进入严格旧行为 parity。
- `combat_formulas.json` 现在能表达旧实战里的关键细节：防御先取整、守护后向下取整、平方根敏捷对抗、合击固定伤害、玄影弓先扣防御再乘倍率、状态基础命中减抗性。
- Phase131 新增 `CombatFormulaModel` 后，shadow 报告不再维护一份重复公式，而是用同一个表驱动模型做 A/B。
- 这份报告只调用 shadow 计算，不会改变真实战斗结果。后续如果要启用表驱动公式，应先做固定 10V10 回放、洞穴 boss、自动练级、自动捉宠和性能基线对比。

## 下一步建议

1. 进入真实切换前，先补一个 feature flag 或 active formula 开关，不要一次性不可逆替换 `BattleModel`。
2. 后续如果要削弱全体弓，不应直接改旧 parity 表，而应新增 `combat_v2` 并用仿真报告评审。
3. 每次调整 `combat_formulas.json` 后都跑 `--auto-combat-formula-parity-check` 和 `--auto-numeric-experiment-report-check`。
4. 真正切换到表驱动前，新增一组固定 seed 战斗回放样本，记录胜率、平均回合、合击次数、死亡/击飞次数和耗时。
