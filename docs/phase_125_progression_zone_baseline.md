# Phase125 区域收益基线

本文件记录 `progression_zones.json` 接入后的第一版区域收益基线。它用于回答“每个等级段应该去哪练、每战大概多少经验/石币、每级大概多少战”。

## 生成命令

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --numeric-experiment-report
```

自检命令：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-numeric-experiment-report-check
```

关键输出：

```text
.run/godot/numeric_experiment_report.json
```

## 当前样本

| 区域 | 等级段 | 平均经验 | 平均石币 | 锚点每级战数 | 状态 |
|---|---:|---:|---:|---:|---|
| 火芽村入口草丛 | 1-20 | 80 | 18 | 16 | 命中目标 |
| 河岸成长区 | 20-60 | 720 | 67 | 25 | 命中目标 |
| 一转准备练级区 | 60-80 | 4572 | 193 | 25 | 命中目标 |
| 一转后高原练级区 | 80-100 | 12245 | 367 | 30 | 命中目标 |
| 四洞深层练级区 | 100-120 | 28656 | 717 | 41 | 命中目标 |
| 玄影追赶练级区 | 120-131 | 64528 | 1343 | 46 | 命中目标 |
| 玄影满级冲刺区 | 132-140 | 104990 | 1971 | 51 | 命中目标 |
| 四洞守护资格战 | 80-120 | 5928 | 207 | 不适用 | 资格战 |
| 玄影顶层转生战 | 100-140 | 8460 | 427 | 不适用 | 资格战 |

## 设计判断

- 火芽草丛仍是低级教学区，不承担中后期练级。
- Lv60 后每级战数被控制在几十战量级，适合后续接挂机、补给和装备耐久。
- Lv120-131 和 Lv132-140 已分开，避免经验丹测试追赶段污染最终满级节奏。
- 四洞守护和玄影顶层是资格战，不作为重复刷级区；它们给经验和石币存在感，但主要价值来自任务推进。

## 后续调参入口

- 想调升级速度：先改 `progression_zones.json` 的目标，再改 `reward_economy.battleExp`。
- 想调区域石币：改 `battle_rewards.json` 对应 encounter group 的 `stoneCoins`。
- 想调掉落：改 `battle_rewards.json` 的 `rewards`，不要在结算代码里硬改。
- 想调高阶消耗：优先改修理、强化、捕捉工具和补给成本，不要简单加快耐久损耗。
