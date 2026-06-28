# Phase142：combat_v2 影子候选

本阶段只做战斗公式候选观察，不切换真实战斗。正式客户端和固定战斗模拟仍使用 `combat_formulas.json.activeFormulaId = combat_v1`。

## 目标

`combat_v2_candidate` 是下一轮战斗手感调参的候选公式，先通过固定样本做影子对比：

- 等级差轻微影响伤害。
- 群攻目标越多，单体伤害越低。
- 极端回避率和暴击率上限更收敛。
- 状态命中接受敏捷差和等级差修正。
- 野怪合击率略低，降低普通练级被连续合击的压力。

这些差异先进入报告和门禁，不进入真实战斗。

## 数据入口

候选公式写在：

```text
client/godot/data/balance/combat_formulas.json
```

关键约定：

- `combat_v1`：当前正式公式。
- `combat_v2_candidate`：Phase142 候选公式。
- `activeFormulaId`：仍保持 `combat_v1`。

以后如果要让候选公式进入实战，必须先通过专门的 A/B 回放、固定战斗仿真和用户手测，再单独切换 `activeFormulaId`。

## 报告

专用报告：

```text
.run/godot/combat_v2_shadow_candidate_report.json
```

数值总报告也会包含：

```text
combatV2Shadow
```

数值门禁会新增一项：

```text
combat_v2_shadow_candidate
```

这个门禁只代表候选样本健康，不代表真实公式可以切换。

## 样本覆盖

当前样本包括：

- 普通攻击。
- 宠物伤害技能。
- 防御目标。
- 高等级打低等级。
- 低等级打高等级。
- 玄影弓 6 目标。
- 玄影弓 10 目标。
- 快速目标回避。
- 快速攻击者暴击。
- 我方合击。
- 敌方合击。
- 催眠命中。
- 石化命中带抗性。

## 自测命令

语法和导入：

```sh
godot --headless --path client/godot --quit
```

专用候选报告：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-combat-v2-shadow-check
```

确认正式公式仍可回归：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-combat-formula-parity-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-combat-formula-driver-ab-check
```

确认进入数值总报告和门禁：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-numeric-experiment-report-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-numeric-balance-gate-check
```

## 性能边界

候选公式报告只在自测命令、数值实验报告和数值门禁中生成。不要把 `CombatFormulaCandidateModel.build_report()` 放进 `_process`、战斗逐帧动画、HUD 刷新、移动寻路或常驻面板刷新里。

## 后续

如果候选公式手感合理，下一步应做：

1. 扩大固定战斗仿真样本。
2. 加入真实战斗回放 A/B。
3. 让 GM 工具能临时切换公式测试。
4. 用户确认后再切 `activeFormulaId`。
