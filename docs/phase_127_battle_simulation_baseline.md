# Phase127 固定战斗仿真基线

本阶段补的是“数值系统的硬回放门槛”。Phase126 只做公式点样本 shadow 对照，Phase127 开始用真实 `BattleModel` 事件循环跑固定战斗场景，记录胜负、回合数、血量余量、合击/暴击/回避/击飞、奖励预览。以后调经验、成长、敌人、装备或公式时，必须先看这组样本有没有漂。

## 自测命令

单独跑固定战斗仿真：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-numeric-battle-simulation-check
```

输出报告：

```text
.run/godot/numeric_battle_simulation_report.json
```

总数值报告也会包含同一份 `battleSimulation`：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-numeric-experiment-report-check
```

## 数据来源

场景表：

```text
client/godot/data/balance/battle_simulation_scenarios.json
```

执行模型：

```text
client/godot/scripts/progression/numeric_battle_simulator_model.gd
```

仿真规则：

- 复用真实 `BattleModel.build_player_pet_round_events()` 和 `BattleModel.apply_battle_event()`。
- 每个事件后检查战斗是否结束，避免死亡/击飞后继续执行整轮。
- 反击从 `lastCounterEvent` 单独执行并统计。
- 毒等轮末状态通过 `build_round_end_status_events()` 执行。
- 战斗结束区分 `victory`、`defeat`、`timeout`、`knockaway`。
- 使用固定 `targetSeed`，不使用非确定性 RNG。
- 这是数值基线，不代表完整挂机 AI、补给策略、玩家手操或视觉动画。

## 当前读数

| 场景 | 结果 | 回合 | 人物剩余血量 | 经验预览 | 关键风险 |
|---|---|---:|---:|---:|---|
| 火芽新手单人草丛 | 胜利 | 6 | 59.46% | 80 | 单人低级可控 |
| 河岸成长单人练级 | 胜利 | 5 | 83.89% | 728 | 中期单人偏安全 |
| 一转准备三人练级 | 胜利 | 4 | 93.73% | 4646 | 小队明显降低压力 |
| 一转后五人练级 | 胜利 | 4 | 92.23% | 12493 | 满队清怪较快 |
| 四洞深层五人练级 | 胜利 | 5 | 89.84% | 29371 | 当前偏稳 |
| 玄影追赶五人练级 | 胜利 | 8 | 62.04% | 66714 | 开始有消耗感 |
| 玄影满级冲刺五人练级 | 胜利 | 10 | 37.02% | 109631 | 当前最硬样本 |
| 四洞守护资格战 | 胜利 | 2 | 100.00% | 5951 | 仪式感偏短，后续 boss 数值可加强 |
| 玄影顶层转生战 | 胜利 | 2 | 100.00% | 11731 | 已避免 1 回合结束，但仍偏短 |

汇总：

| 指标 | 当前值 |
|---|---:|
| 场景数 | 9 |
| 胜利数 | 9 |
| 失败 / 超时 / 击飞 | 0 / 0 / 0 |
| 满足期望 | 9 / 9 |
| 平均回合 | 5.11 |
| 平均人物剩余血量 | 79.80% |
| 最硬场景 | `shadow_capstone_full_team` |
| 最低人物剩余血量 | 37.02% |

## 当前结论

- 练级段整体能打通，玄影冲刺段已经能体现伤害压力。
- 满队练级的回合数偏短，这是当前“数值基线”，不是最终平衡完成结论。
- 两个资格战仍偏短，后续正式副本数值应通过 boss 血量、阶段技能、反击/控制、奖励结构来增加仪式感，而不是只堆普通草丛敌人。
- 这套基线现在可以作为公式切换门槛：如果启用新战斗公式后出现失败、超时、击飞、回合数过短/过长或血量余量异常，就不能晋升为 active 公式。

## 切换门槛

下一次修改 `combat_formulas.json`、`pet_growth_profiles.json`、`player_growth.json`、`reward_economy.json` 或区域敌人基线时，至少要满足：

1. `--auto-numeric-battle-simulation-check` 通过。
2. 9 个场景全部满足 `expect`。
3. 玄影满级冲刺不能从“有压力”漂成无压力；人物剩余血量低于 60% 比较合理。
4. 资格战不能退回 1 回合结束。
5. 若回合数或血量余量大幅漂移，需要在文档里解释是预期调参还是回归。
