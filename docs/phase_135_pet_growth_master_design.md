# Phase135：宠物成长系统完整方案

## 目标

宠物成长是本项目最核心的长期玩法。现有 `pet_growth_profiles.json` 中的 `individualVariance.initialBonus` / `growthBonus` 只是骨架期占位：所有宠物共用一套随机范围，无法支撑“同种同级宠物也有明显个体差异”“不同物种有不同极品边界”“转生后长期培养仍有意义”的玩法。

本阶段设计新的宠物成长系统，目标是：

- 保留石器时代式的抓宠乐趣：同一种宠物也会有好坏差异。
- 超越原始设计的可调性：数值策划可以直接通过 JSON 控制物种、成长、极品率和转生继承。
- 让“极品”按物种相对评价，而不是只按全局战力粗暴判断。
- 为捕捉、自动丢弃、宠物转生、强化、图鉴、宠物栏、后续服务端存档预留稳定结构。

## 石器时代参考结论

本地 StoneAge 8.0 参考中，宠物/敌人模板不是所有物种共用同一个最终血攻防敏浮动。其 `enemybase` 模板包含：

- `E_T_INITNUM`
- `E_T_LVUPPOINT`
- `E_T_BASEVITAL`
- `E_T_BASESTR`
- `E_T_BASETGH`
- `E_T_BASEDEX`

创建敌人或捕获宠物时，源码会读取模板基础四维，对四项基础参数分别做小随机，再随机分配额外点数，最后按等级成长系数映射到角色属性。

这说明原始思路是“模板基础档 + 个体随机 + 等级成长公式”，而不是“最终 HP 固定 `-3 ~ +3`”。玩家观察到的某些宠物 HP 浮动更大，通常来自模板、等级、内部四维和最终属性公式叠加后的结果。

Beastbound 不直接复制源码，但应吸收这个结构，并改造成更易调参、更易验证的现代数据系统。

## 核心设计

新方案采用三层结构：

| 层级 | 作用 | 是否每只宠物固定 |
|---|---|---|
| 物种成长模板 | 定义某个 form 或 species 的基础成长边界 | 否，所有同种共用 |
| 个体成长记录 | 捕捉或生成时决定这一只宠物的随机结果 | 是，生成后固定 |
| 培养修正 | 转生、强化、活动、装备类长期培养带来的额外变化 | 是，随培养变化 |

### 一、物种成长模板

每个可成长宠物形态都要有一个 `growthSpeciesProfileId`，不要只依赖现在的 `growthProfileId`。

`growthProfileId` 继续表示大方向，例如：

- `attack_high`：攻击倾向
- `agility_high`：敏捷倾向
- `defense_high`：防御倾向
- `hp_high`：生命倾向
- `balanced`：均衡

`growthSpeciesProfileId` 表示真正的物种数值边界，例如：

- `bui_red_fire10_v1`
- `wuli_orange_fire10_v1`
- `blue_man_dragon_v1`
- `shadow_rebirth_beast_v1`

示例结构：

```json
{
  "profileId": "blue_man_dragon_v1",
  "displayName": "蓝人龙成长档",
  "familyRole": "stoneage_like_attacker",
  "internalBase": {
    "initScalar": 29,
    "levelScalar": 4.5,
    "genes": {
      "vital": 27,
      "strength": 36,
      "toughness": 16,
      "dexterity": 20
    }
  },
  "outputBase": {
    "maxHp": 60,
    "attack": 14,
    "defense": 8,
    "quick": 6
  },
  "outputGrowth": {
    "maxHp": 8.3,
    "attack": 2.32,
    "defense": 1.03,
    "quick": 1.3
  },
  "individualRules": {
    "initialOutputSpread": {
      "maxHp": [-5, 5],
      "attack": [-2, 2],
      "defense": [-1, 1],
      "quick": [-2, 2]
    },
    "growthOutputSpread": {
      "maxHp": [-1.1, 1.1],
      "attack": [-0.32, 0.31],
      "defense": [-0.15, 0.16],
      "quick": [-0.22, 0.21]
    },
    "distribution": "uniform",
    "rareExtremeRate": 0.0
  },
  "targetAudit": {
    "lv1MaxHpSpread": [-5, 5],
    "threeStatGrowthBand": [4.1, 5.2],
    "hpGrowthBand": [7.2, 9.4],
    "lv140PowerBand": [850, 1100],
    "qualityHighRate": 0.12,
    "qualityTopRate": 0.02
  }
}
```

`initialOutputSpread` 是玩家可理解的最终属性浮动边界。这样数值策划可以明确写出“蓝人龙生命上下浮动 5 点，某高血大型宠物上下浮动 9 点”。底层可以继续用内部基因模拟，但最终调参以可观察属性为准。

### 二、个体成长记录

每只宠物生成时写入一次，不允许每次打开游戏重新随机。

```json
{
  "growthVersion": "pet_growth_v2",
  "growthSpeciesProfileId": "blue_man_dragon_v1",
  "individualSeed": "capture:shadow_cave:20260627:000123",
  "individualRoll": {
    "schemaVersion": 1,
    "qualityRoll": 8421,
    "initialBonus": {
      "maxHp": 8,
      "attack": 1,
      "defense": -1,
      "quick": 0
    },
    "growthBonus": {
      "maxHp": 0.62,
      "attack": 0.11,
      "defense": -0.03,
      "quick": 0.04
    },
    "geneRoll": {
      "vital": 2,
      "strength": 1,
      "toughness": -1,
      "dexterity": 0
    }
  },
  "growthEvaluation": {
    "speciesPercentile": 91,
    "qualityTier": "A",
    "qualityLabel": "优秀",
    "strongStats": ["maxHp", "attack"],
    "weakStats": ["defense"]
  },
  "growthRecord": {
    "level": 1,
    "baseStats": {},
    "initialStats": {},
    "growthRates": {},
    "finalStats": {},
    "combatPower": 0
  }
}
```

关键点：

- `individualRoll` 是永久个体值。
- `growthEvaluation.speciesPercentile` 是同物种内排名，不和其他物种粗暴比较。
- `qualityTier` 建议使用 `S / A / B / C / D`，比“偏高/普通/偏低”更适合抓宠追求。
- `growthRecord` 是当前等级快照，可以重算，但 `individualRoll` 不应丢失。

### 三、随机分布

不建议用纯均匀随机。纯均匀会让极品太常见，垃圾和极品都太平，抓宠没有层次。

第一版支持三种分布：

| 分布 | 用途 | 特点 |
|---|---|---|
| `weighted_center` | 默认野宠 | 中间多，极值少 |
| `uniform` | GM 测试、特殊活动 | 每个结果概率相同 |
| `rare_spike` | 稀有宠、活动宠 | 大多数普通，极少数非常高 |

默认推荐 `weighted_center`：

- 60% 落在中间 40% 区间。
- 25% 落在中高或中低区间。
- 13% 落在优秀/较差边界。
- 2% 才进入极限极品或极限低档。

这会让“抓到能用的不难，抓到极品很有追求”。

## 最终属性公式

正式公式分两步。

### 第一步：计算个体后的基础与成长

```text
初始属性 = 物种 Lv1 基础属性 + 个体初始浮动 + 培养初始修正
每级成长 = 物种每级成长 + 个体成长浮动 + 培养成长修正
当前属性 = round(初始属性 + 每级成长 * (等级 - 1))
```

每项独立计算：

```text
maxHp = round(baseMaxHp + hpInitialBonus + (hpGrowth + hpGrowthBonus) * (level - 1))
attack = round(baseAttack + attackInitialBonus + (attackGrowth + attackGrowthBonus) * (level - 1))
defense = round(baseDefense + defenseInitialBonus + (defenseGrowth + defenseGrowthBonus) * (level - 1))
quick = round(baseQuick + quickInitialBonus + (quickGrowth + quickGrowthBonus) * (level - 1))
```

这比直接使用内部四维更适合当前 Beastbound，因为现有战斗、宠物栏、图鉴、战力都已经围绕 `maxHp / attack / defense / quick` 运转。

内部 `geneRoll` 暂时作为解释层和未来兼容层，不强行进入第一版战斗公式。以后如果要更接近石器原始四维，可以把最终公式切换为：

```text
内部四维种子 -> 体力/腕力/耐力/速度 -> maxHp/attack/defense/quick
```

### 第二步：培养修正

培养修正分开保存，不污染原始个体。

```json
{
  "cultivationBonus": {
    "rebirthBonus": {
      "initialBonus": {},
      "growthBonus": {}
    },
    "enhanceBonus": {
      "flatStats": {},
      "growthStats": {}
    }
  }
}
```

这样一只宠物的“天生好不好”和“后天培养了多少”可以清楚分开。

## 品质评价

品质必须按物种相对评价。

同样 `+5 HP`：

- 如果某宠物 HP 上限是 `+5`，这就是顶级。
- 如果蓝人龙 HP 上限是 `+9`，这只能算偏上。

所以品质评价用模拟分位：

```text
个体分 = 当前个体在该物种理论样本中的 percentile
```

建议标签：

| 分位 | 标签 | 用途 |
|---:|---|---|
| 98-100 | S | 极品，建议锁定 |
| 85-97 | A | 优秀 |
| 55-84 | B | 良好 |
| 20-54 | C | 普通 |
| 0-19 | D | 偏低 |

宠物详情可以显示：

```text
成长评价：A 优秀
强项：生命、攻击
弱项：防御
预测：Lv140 战力 1186
```

图鉴只显示物种平均范围，不显示某只宠物的个体结果。

## 战力与成长评价的关系

战力和品质不能混为一谈。

- 战力：当前能不能打，适合排序、自动丢弃、战斗强度判断。
- 品质：这只宠物在同物种里的成长好不好，适合抓宠、锁定、培养决策。

例如高速宠可能战力不如高血高攻宠，但它在高速物种里可能是 S 级，不能被全局战力误杀。

自动丢弃第一版仍可保留战力阈值，但后续应增加：

```text
自动丢弃条件：
1. 战力低于 X
2. 或同物种品质低于 C
3. 任务宠 / 锁定宠 / 已装备骑乘宠永不自动丢弃
```

## 捕捉生成流程

捕获成功时：

1. 读取 `formId` 对应的 `growthSpeciesProfileId`。
2. 根据战斗 ID、地图 ID、敌方 slot、捕捉序号生成 `individualSeed`。
3. 按物种成长模板生成 `individualRoll`。
4. 计算 `growthEvaluation`。
5. 计算当前等级 `growthRecord.finalStats`。
6. 写入宠物实例。
7. 如果宠物栏满，进入兽栏；兽栏也满则保持现有提示和逻辑。

捕捉日志建议：

```text
捕捉了蓝人龙 Lv1。
成长评价：A 优秀，强项：生命、攻击。
```

如果后续想保留神秘感，可以改为先显示“未鉴定”，找鉴定 NPC 或道具后显示完整评价。第一版不必复杂化。

## 宠物升级流程

宠物获得经验升级时，不再临时随机。

```text
升级 -> 使用固定 individualRoll 和 cultivationBonus 重算属性 -> 更新 hp 上限
```

HP 当前值处理：

```text
升级后 maxHp 增加 N，则当前 hp 增加 N
```

这样升级有即时反馈，也不会因为升级导致当前血量比例变低。

## 宠物转生

宠物转生是长期追求，不能只“Lv140 回 Lv1”。

建议第一版正式规则：

```text
转生要求：Lv140
转生结果：等级回 Lv1，经验清零，保留 formId、技能、锁定状态
继承内容：
- 保留 individualRoll
- rebirthCount +1
- 根据 Lv140 时相对同物种中位数的优势，转换为 rebirthBonus
```

继承公式建议：

```text
可继承优势 = max(0, 当前 Lv140 属性 - 该物种 Lv140 中位属性)
转生加成 = round(可继承优势 * 继承率)
```

初始继承率建议：

| 转生次数 | 继承率 |
|---:|---:|
| 1转 | 8% |
| 2转 | 6% |
| 3转 | 5% |
| 4转以后 | 3% |

并设置硬上限：

```text
单项转生成长修正不得超过该物种基础成长的 12%
总转生战力修正不得超过未转生同物种 S 级 Lv140 的 18%
```

这样优秀宠值得转生，但不会无限膨胀到破坏数值。

## 宠物强化

强化和转生分离。

强化建议作为稳定消耗线：

- 强化等级：+0 到 +10。
- 强化只加少量固定属性，不改变天生个体。
- 强化失败、材料、费用后续再做。

第一版公式：

```text
每级强化：战力约 +1.5% 到 +2%
生命型宠更多加 maxHp
攻击型宠更多加 attack
防御型宠更多加 defense
敏捷型宠更多加 quick
```

强化显示：

```text
培养：2转 强化+6
天生评价：A 优秀
培养加成：生命 +24，攻击 +5
```

## 宠物栏显示

宠物栏的“个体”页建议显示：

```text
蓝人龙 Lv37 出战
属性：7水3火
成长：高生命 / 高攻击
成长评价：A 优秀
生命：312/312   攻击：86   防御：42   敏捷：61
战力：267
强项：生命、攻击
培养：1转 强化+3
```

详情展开或滚动区域显示：

```text
个体浮动：
生命 +8 / 范围 -9~+9
攻击 +1 / 范围 -2~+2
防御 -1 / 范围 -2~+2
敏捷 0 / 范围 -3~+3

每级成长：
生命 +13.82
攻击 +2.26
防御 +1.17
敏捷 +1.09

预测：
Lv140 战力 1186
同种分位 91%
```

主界面不要堆太多字，只在宠物详情里看。

## 图鉴显示

图鉴展示物种平均与可能范围，不展示个体。

```text
蓝人龙
成长倾向：生命 / 攻击
Lv1 生命范围：55-65
三维成长范围：约 4.1x-5.2x
Lv140 生命预测：约 1060-1370
极品率：约 2%
捕捉难度：高
常见区域：玄影洞窟
```

图鉴的作用是让玩家知道“这种宠物值不值得抓”，宠物栏的作用是判断“我抓到的这只好不好”。

## 自动捕捉与自动丢弃

自动捕捉设置应支持：

- 指定 form / 图鉴宠物。
- 等级条件。
- 血量条件。
- 捕捉工具优先级。
- 品质条件。
- 战力条件。

自动丢弃建议分两层：

```text
硬保护：
- 锁定宠不丢
- 任务宠不丢
- 队伍宠不丢
- 已培养宠默认不丢

筛选条件：
- 战力低于 X
- 或品质低于 C
- 或非目标宠
```

第一版可以只补“品质低于 C 自动丢弃”，保留现有战力丢弃作为兼容。

## 数据文件建议

建议拆成三个文件。

### `pet_growth_profiles.json`

保留全局公式和大类成长档：

- 战力公式
- 品质标签
- 成长倾向标签
- 默认兜底范围

### `pet_growth_species_profiles.json`

新增。每个物种或形态的正式成长边界：

- `growthSpeciesProfileId`
- `outputBase`
- `outputGrowth`
- `individualRules`
- `targetAudit`

### `pet_growth_simulation_sets.json`

新增。数值策划用来跑样本：

- 每个物种抽样 1000 只。
- 输出 Lv1、Lv80、Lv100、Lv131、Lv140 区间。
- 输出 S/A/B/C/D 比例。
- 输出自动丢弃误杀率。

## 兼容旧存档

旧宠物没有 `growthSpeciesProfileId` 时：

1. 根据 `formId` 找新物种成长模板。
2. 如果旧宠物已有 `individualVariance`，转换为 `individualRoll.initialBonus/growthBonus`。
3. 如果没有旧个体值，用 `individualSeed` 稳定生成。
4. 保存 `growthVersion = pet_growth_v2`。

旧的 `individualVariance` 字段保留一段时间，作为迁移兼容，不再作为新系统主入口。

## 数值校验

每次改宠物成长表后必须跑：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-growth-species-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-growth-simulation-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-capture-quality-check
```

当前已先实现可运行的物种成长离线模拟器：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-growth-species-simulation-check
```

它会基于 `client/godot/data/balance/pet_growth_species_profiles.json` 生成：

- `.run/godot/pet_growth_species_simulation_report.json`
- `.run/godot/pet_growth_species_simulation_rows.csv`

其中 CSV 是 100 只样本从 Lv1 到 Lv140 的逐级明细，可直接用 Excel 打开分析。

校验项：

- 每个 `formId` 都能解析到成长模板。
- 每个成长模板的随机范围合法。
- S/A/B/C/D 比例接近配置目标。
- Lv140 战力没有超出 `targetAudit.lv140PowerBand`。
- 同种同级随机 1000 只后，最终属性范围不越界。
- 自动丢弃不会丢锁定宠、任务宠、队伍宠。

## 性能约束

宠物成长重算不能进入 `_process`、HUD 刷新、地图移动热路径。

允许重算的时机：

- 捕捉成功。
- 宠物升级。
- 宠物详情打开。
- 宠物转生/强化确认。
- 进入战斗构造 actor。
- 战斗结算写回。

不允许：

- 每帧重算全队宠物成长。
- 每次 HUD 坐标刷新扫描全部宠物。
- 宠物列表滚动时反复 normalize 全量 profile。

宠物列表应使用已缓存的：

- `combatPower`
- `qualityTier`
- `qualityLabel`
- `growthRecord.finalStats`

## 分阶段落地

### Phase135A：数据合同

- 新增 `pet_growth_species_profiles.json`。
- 给现有布伊、乌力、转生兽配置第一版物种成长模板。
- 给 JSON 添加 `_fieldNotes`，方便手改数值。

### Phase135B：模型改造

- `PetIndividualGrowthModel` 改为读取 `growthSpeciesProfileId`。
- 保留旧 `individualVariance` 迁移。
- 个体品质改成同物种分位。

### Phase135C：捕捉和升级接入

- 捕获宠物生成 `individualRoll`。
- 升级使用固定成长记录重算。
- 自动捕捉可读取品质。

### Phase135D：UI 展示

- 宠物栏显示成长评价、强项、培养。
- 图鉴显示物种平均范围。
- 宠物详情展开显示个体浮动和预测。

### Phase135E：转生和强化接入

- 宠物转生继承 `rebirthBonus`。
- 强化写入 `enhanceBonus`。
- 详情展示天生与后天分离。

### Phase135F：模拟与平衡工具

- 自动生成 1000 只样本报告。
- 输出极品率、战力区间、误杀率。
- 作为后续数值策划的固定工作流。

## 设计取舍

本方案不直接照搬石器时代的内部公式。原因：

- 原始公式可玩性强，但对现代调参不够直观。
- 玩家最终看到的是 HP、攻击、防御、敏捷，所以数值策划最好能直接控制最终可见范围。
- 内部基因仍保留为解释层，后续如果要更接近原始公式，可以平滑迁移。

本方案比当前骨架强在：

- 每个物种有自己的成长边界。
- 极品按同物种评价。
- 随机分布可控，极值稀有。
- 转生继承有上限，长期培养不爆炸。
- 图鉴和宠物栏职责分离。
- 有模拟器校验，方便进入正式数值策划。

## 待确认

1. 品质标签是否采用 `S/A/B/C/D`，还是中文 `极品/优秀/良好/普通/偏低`？
2. 第一版是否显示完整个体浮动，还是需要“鉴定”后才显示？
3. 宠物转生是否允许无限转，但收益递减并硬封顶？
4. 自动丢弃是否立刻加入“低于某品质丢弃”，还是继续只用战力阈值？
