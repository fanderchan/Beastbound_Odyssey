# Phase135：宠物物种成长离线模拟器

## 目的

宠物成长表不能靠打开客户端肉眼试。这个模拟器直接调用 Godot 数值模型，在 headless 模式下批量生成宠物成长样本，输出 JSON 汇总和 CSV 明细，方便后续用 Excel 或数据分析工具评估。

第一版使用 `blue_man_dragon_v1`：

- 样本数：100 只。
- 等级范围：Lv1 到 Lv140。
- 明细行数：100 * 140 = 14000 行。
- 输出路径：
  - `.run/godot/pet_growth_species_simulation_report.json`
  - `.run/godot/pet_growth_species_simulation_rows.csv`
  - `.run/godot/pet_growth_observation_100.csv`

CSV 可以直接用 Excel 打开；当前也会额外生成一份人工分析用 `.xlsx`，便于直接筛选每只宠的血成长、三维成长和逐级成长曲线。

`pet_growth_observation_100.csv` 与宠物面板“成长”页使用同一个观察模型：每只宠每级一行，包含四维当前值、每级平均成长、四维分位、四维评级、战力成长分位和综合评级。

综合评级不实时大样本计算。`pet_growth_species_profiles.json` 的 `growthObservation.powerGrowthPercentilesByLevel` 已经预先写入每个等级的战力成长分位阈值；宠物升级或打开成长页时只查当前等级阈值，把当前 `powerGrowthPerLevel` 映射成百分位。

## 数据来源

物种成长配置来自：

```text
client/godot/data/balance/pet_growth_species_profiles.json
```

当前字段包括：

- `outputBase`：Lv1 可见基础四维。
- `outputGrowth`：每级成长。
- `individualRules.initialOutputSpread`：Lv1 个体浮动。
- `individualRules.growthOutputSpread`：每级成长个体浮动。
- `individualRules.distribution`：随机分布。
- `targetAudit`：模拟期望。
- `growthObservation`：离线预算好的成长观察阈值；调成长参数后需要重新生成。

## 自测命令

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-growth-species-simulation-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-growth-threshold-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-growth-observation-check
```

`--auto-pet-growth-threshold-check` 会用 10000 只离线样本生成 `.run/godot/pet_growth_power_percentiles.json`。确认后再把其中对应 profile 的 `powerGrowthPercentilesByLevel` 写回数值 JSON，避免运行时抽样。

## GM 手动测试

打开 `GM` -> `宠物` 后，可以在宠物面板使用：

- `GM蓝龙`：领取一只 Lv1 蓝人龙，按 `blue_man_dragon_v1` 个体随机生成。
- `GM升1级`：对当前选中的物种成长宠物升 1 级，并刷新成长观察结果。

宠物详情页新增 `成长` 标签，用四象限雷达图展示生命、攻击、防御、敏捷成长分位；文字区展示每项成长评级和按战力成长计算的综合评级。

## 当前样本结果

```text
profile=blue_man_dragon_v1
rows=14000
samples=100
levels=140
lv1_hp=55-65 avg=60.39
hp_growth=7.209-9.381 avg=8.321
three_growth=4.115-5.180 avg=4.644
lv140_power=890-1074 avg=978.02
quality=S3/A13/B30/C34/D20
lv140_observation=S3/A11/B32/C28/D26
```

## 初步评估

- Lv1 生命范围已回到 StoneAge-like 口径：基础 60，浮动 -5 到 +5，所以样本落在 55-65。
- 三维成长样本范围为 4.115-5.180，已贴近“未转生蓝人龙约 4.1x 到 5.2x”的校准目标。
- 血成长样本范围为 7.209-9.381，避免上一版 Lv1 生命 188、Lv140 生命 2000+ 的偏高问题。
- 100 只样本中，品质分布按同物种分位计算，不用全局战力硬套。
- Lv140 成长观察综合评级按预计算战力成长分位表查表；100 只样本中 S/A 分布会有抽样波动，但不再被理论最小/最大范围压到几乎没有 S。
- Lv140 平均战力 978.02，当前更适合作为对齐旧石器成长口径的基准宠，而不是为了测试战斗强度临时拉高的高血宠。

## Excel 分析输出

```text
.run/godot/pet_growth_species_per_pet_summary.xlsx
.run/godot/pet_growth_species_per_pet_summary.csv
```

Excel sheets：

- `每只宠汇总`：每只宠一行，包含血成长/级、攻防敏成长/级、三维总成长/级、Lv140 战力。
- `逐级成长曲线`：每只宠每级一行，包含本级血成长、本级攻防敏成长、本级三维成长、从 Lv1 到当前等级的累计平均成长。
- `原始逐级数据`：Godot 模拟导出的原始 14000 行。
- `S-D差距`：按品质档自动汇总 S 与 D 的差距。

## 后续扩展

- 支持命令行指定 `profileId`，一次模拟任意物种。
- 支持批量模拟所有 `pet_growth_species_profiles.json` 中的 profile。
- 将 `.xlsx` 导出纳入固定工具脚本或 Godot 自动检查输出。
- 增加“同一物种 1000 只”的大样本模式。
- 接入自动捕捉筛选，评估自动丢弃是否误杀 S/A 个体。
