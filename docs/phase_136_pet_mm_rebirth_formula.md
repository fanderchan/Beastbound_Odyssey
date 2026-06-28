# Phase136：宠物 MM 转生喂石公式

## 目标

本阶段把宠物转生从“满几颗石头就给固定成长”改为连续公式。这样 `攻50 其余1`、`攻49 其余50`、`四项都喂一点但都没满` 这类边界玩法不会掉到离散档位之外，也不会因为差 1 点石头出现完全不合理的跳变。

## 核心定义

每个 MM 有四种石头点数：

- `maxHp`：血石
- `attack`：攻石
- `defense`：防石
- `quick`：敏石

每项上限为 `50`。先把每项归一化为 `0.0 - 1.0`：

```text
ratio_i = stone_i / 50
```

再计算“等效满石数”：

```text
effectiveStoneCount = sum(ratio_i ^ 1.35)
```

`1.35` 是刻意设计的惩罚指数：没喂满的石头仍然有价值，但收益低于线性。这样 `49/50` 很接近满石，`1/50` 只提供极少的等效成长。

## 一转成长池区间

一转 MM 的四维等效成长池使用下面的锚点：

| 等效满石数 | 四维等效成长加成范围 |
|---|---|
| 0 | `0.00 - 0.10` |
| 1 | `0.55 - 0.95` |
| 2 | `0.80 - 1.25` |
| 3 | `1.00 - 1.45` |
| 4 | `1.15 - 1.65` |

当 `effectiveStoneCount` 不是整数时，在上下两个锚点之间线性插值：

```text
k = floor(effectiveStoneCount)
t = effectiveStoneCount - k

min = min[k] + (min[k + 1] - min[k]) * t
max = max[k] + (max[k + 1] - max[k]) * t
```

最终总加成由确认转生时的一次随机百分位决定：

```text
totalInternalBonus = min + (max - min) * rollPercentile / 100
```

预览界面默认按 `50%` 中位数估算；真正点击确认转生时，系统生成一次 `rebirthRollSeed`，据此得到 `0 - 100` 的随机百分位，并把 seed、百分位、评级、成长加成都写入培养记录。

注意：石头点数只影响区间和四维分配，不参与随机 seed。这样补 1 点石头只会平滑改变区间，不会因为石头点数本身导致额外重抽。离线模拟或自动化测试可以显式传入测试 seed 来复现结果；正常玩家操作每次确认转生都是一次新的随机事件。

## 四维分配

成长池是战力口径的内部四维：

```text
internalPower = hpGrowth / 4 + attackGrowth + defenseGrowth + quickGrowth
```

最终把 `totalInternalBonus` 分给血攻防敏时，权重由三部分构成：

```text
statWeight =
  targetObservedInternalGrowth * 1.0
  + stoneRatio * 8.0
  + helperSingleStatGrowthWeight * 0.6
```

- 目标宠本身偏什么，会轻微影响转生后偏向。
- MM 喂了哪种石头，是主要分配来源。
- MM 自身单项成长只轻微影响分配，不放大总成长。

生命在内部权重里按 `hp / 4` 计算；写回可见成长时再乘回 `4`。

## 设计例子

### 四满石

```text
血50 攻50 防50 敏50
effectiveStoneCount = 4.0
区间 = 1.15 - 1.65
```

### 攻49，其余满

```text
血50 攻49 防50 敏50
effectiveStoneCount = 1 + (49/50)^1.35 + 1 + 1 ≈ 3.973
区间接近四满石，但略低于四满石。
```

### 攻50，其余1

```text
血1 攻50 防1 敏1
effectiveStoneCount = 1 + 3 * (1/50)^1.35 ≈ 1.015
区间接近单攻满石，但略高一点点。
```

这类喂法会让总成长接近单满石，但分配更偏攻击，同时其他三项不会完全等于空石。

## 运行位置

代码位置：

- `client/godot/scripts/progression/pet_rebirth_mm_model.gd`

模拟脚本：

- `.run/godot/earth_cub_rebirth_stone_matrix_simulation.gd`

常用回归命令：

```bash
godot --headless --path client/godot --script "$(pwd)/.run/godot/earth_cub_rebirth_stone_matrix_simulation.gd"
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-pet-rebirth-mm-formula-check
```
