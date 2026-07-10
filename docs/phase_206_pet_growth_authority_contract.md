# Phase 206 — 宠物成长双端权威算法地基

## 目标

P0.2 的第一块先解决一个底层事实：相同物种档、服务端私有种子、培养修正和目标等级，在 Node 与 Godot 必须得到完全相同的 Lv1 4V、逐级成长和当前属性。

本阶段只建立影子算法与双端黄金向量，不接管现有宠物创建、升级、存档或战斗结算。因此它不会重滚旧宠、改变现有数值、迁移玩家档案，也不会访问 MySQL。

## 调查结论

### 当前项目事实

- 当前物种成长在捕捉/生成时一次抽出 `initialBonus` 与固定 `growthBonus`，之后用线性公式直接重算任意等级。
- 玩家成长观察会读取同一隐藏 roll，并能精确计算目标等级属性；这不符合“练约 20 级逐渐判断，但不能直接看穿 Lv140”的产品目标。
- Node 端没有等价的物种成长目录与升级公式，宠物获得经验时主要只改等级和经验；双端不存在固定种子一致性门禁。
- 现有 Godot hash 与取整没有可直接安全照搬到 JavaScript 的正式契约。JavaScript `Math.round()` 对负半值的行为也与 Godot 不同。
- 现有档案没有实例级成长算法版本。若直接给剩余形态补成长档，旧宠可能因模板路由变化而换算法。

### 本地 StoneAge 8.0 机制意图

本地稳定参考 `/Users/fander/projects/_local_references/StoneAge` 显示，普通宠物成长由两层随机构成：生成时保存个体隐藏成长底板；每次升级再围绕底板进行本级随机分配。捕捉会保留遇到的那只宠的隐藏底板，不会入栏后二次开奖。正常玩家状态只得到可见结果，不得到隐藏底板。

Beastbound 采用原创的现代联网抽象：用不可变私有种子按“模型版本 + 物种档 + 宠物 + 等级 + 属性轴”确定性生成每级波动。这样既保留玩家看到的逐级运气，也能让在线练级、离线挂机、GM 升级、重连和审计复现相同结果。

## Beastbound 契约

### 模型版本

- 新影子版本：`pet_growth_authority_v1`。
- 版本是算法身份，不是平衡表版本。hash、键格式、分布、量化、取整或逐级求和语义变化时必须使用新版本，不能静默改写同一版本。
- 现有宠物仍走原运行时路径。后续启用时，旧实例必须固定到对应 legacy/species-linear 版本或冻结已保存 roll 与当前属性；禁止因模板新增引用而自动换算法。
- 物种成长档 ID 自身也必须版本化；会影响已生成宠物未来结果的修改应新增档案版本，或把必要参数冻结到实例私有状态，不能原地改写同一 `profileId` 的历史语义。

### 私有输入

- `privateSeed`：只由服务端生成和保存，不得由房间 seed、实例 ID、形态 ID、捕捉序号等公开信息推导。
- `privateRoll.initialBonus`：决定捕获后立即可见、以后保持不变的原始 Lv1 4V 浮动；转生或培养修正不得回写这份捕获快照。
- `privateRoll.innateGrowthBonus`：决定长期每级成长均值，是玩家通过训练逐渐观察的隐藏底板。
- `levelOutputNoiseSpread`：可选的每级独立波动范围。未配置时为 0，便于影子接入和旧档兼容；正式新宠档必须在万人模拟后配置合理噪声。

所有可覆盖的 `privateRoll` 参数都按 `privateSeed` 重新推导并逐字段校验，不匹配时失败关闭。它只允许来自服务端私有持久化或本地 QA 夹具；P0.2b 的 HTTP/WS 路由不得接受客户端提交的 seed、roll、成长均值或连续累加器。

### 玩家公开输出

`buildPublicSnapshot` 只输出：

- `schemaVersion`
- `growthModelVersion`
- `growthSpeciesProfileId`
- 当前等级
- `levelOneFourV`：`maxHp/attack/defense/quick`
- 当前可见四项属性

公开快照不包含 `privateSeed`、`privateRoll`、隐藏成长均值或可用于精确反推它们的内部字段。后续成长观察只允许使用已经发生的等级增量和物种先验，Lv140 应给概率区间，不给读取私有 roll 算出的准确答案。

### 确定性算法

1. 随机单元使用 SHA-256 前 32 位，除以 `0xffffffff` 得到 `[0, 1]`。
2. 随机键包含模型版本、物种档 ID、私有种子、用途、等级和属性轴，避免不同用途互相复用随机数。
3. 支持 `uniform`、`weighted_center`、`rare_spike` 三种分布；每次输出在进入后续计算前量化到 6 位小数。
4. 所有 `.5` 使用显式“远离 0”取整，避免 Node/Godot 负数取整漂移。
5. Lv1 为基础值、个体初始浮动和培养初始修正之和。
6. Lv2 起逐级累加物种成长、隐藏成长底板、培养成长修正和本级随机波动；每一级累加后量化到 6 位小数。
7. 对玩家展示时再远离 0 取整，最低属性为 1，等级限制为 1–140。

`growthDeltaForLevel/growth_delta_for_level` 是未来所有经验入口共用的单级原语；黄金向量同时验证从 Lv1 一次一级回放到 Lv140，与直接确定性重建 Lv140 完全一致。P0.2c 运行时必须持久化私有的 6 位连续累加器与已结算等级，再把整数属性作为公开投影；禁止把本级小数增量加到上一级已显示/已取整属性后再次取整，否则误差会随等级累积。也不能把 Lv1→140 全量重算放进响应或热路径。

本版 `cultivation.initialBonus/growthBonus` 表示在一个成长周期进入 Lv1 前就已冻结的修正。若某种培养允许在中途生效，实例必须记录 `effectiveFromLevel` 或分段成长历史，不能覆盖同一对象后追溯改写此前等级。转生、进化或融合开启新成长周期时再按各自合同生成新的冻结修正。

`uniform` 当前保持既有“连续区间抽样后再显示取整”的语义，因此整数端点所占区间约为内部整数的一半。宠物设计与万人模拟必须按该事实验收；若产品要求每个 Lv1 整数点严格等概率，应新增明确的离散分布 ID 和新模型版本，不能静默改变 `uniform`。

## 共享黄金向量

`tools/fixtures/pet_growth_authority_v1_vectors.json` 是 Node 与 Godot 的共同事实源，覆盖：

- 当前蓝人龙数值输入的 `uniform` 分布。
- 中文私有种子、`weighted_center`、培养修正和非零逐级波动。
- `rare_spike` 与非零逐级波动。
- Lv1、Lv2、约 Lv20 观察点和 Lv140。
- 选定等级的 6 位连续属性与单级成长增量，避免整数显示相同掩盖双端小数漂移。
- 私有 roll 重复计算稳定、公开快照无私有字段。

黄金向量含私有种子和私有 roll，仅是仓库 QA 夹具，不是可以返回给真实玩家的响应示例。

## 本阶段文件

- `server/node/src/auth/pet-growth-authority.js`：Node 纯算法。
- `client/godot/scripts/progression/pet_growth_authority_model.gd`：Godot 纯算法镜像与黄金向量检查。
- `tools/fixtures/pet_growth_authority_v1_vectors.json`：共享事实向量。
- `server/node/test/pet-growth-authority.test.js`：Node 精确断言、公开/私有边界和运行时蓝人龙输入漂移门禁。
- `client/godot/scripts/main.gd`、`client/godot/scripts/qa/auto_check_coordinator.gd`：只增加 `--auto-pet-growth-authority-check` 薄接线。

## 明确非目标

- 不让新算法接管任何现有或新创建的运行时宠物。
- 不修改 `pet_growth_species_profiles.json`、`pet_templates.json` 或玩家可见数值。
- 不删除旧 seed/roll，不进行档案迁移，不写真实玩家数据。
- 不在本阶段修正现有成长观察 UI 的准确 Lv140 预测。
- 不把 P0.2 标为完成；服务端响应隐私、服务端逐级结算、观察区间、全物种档案和旧档迁移仍未完成。

## 后续顺序

1. 建立统一 public profile/pet projection；新宠使用服务端 CSPRNG 私有种子；联网 Godot 收到无 seed/roll 的宠物时不得自行重滚。该组必须原子上线，并配套协议版本。
2. 为旧实例写只读迁移审计：已有 roll/可见属性优先冻结，绝不重新开奖；只对新宠启用新版本。
3. 把捕捉、战斗经验、挂机、离线收益、经验道具和 GM 升级统一到服务端逐级结算与成长历史。
4. 改造观察模型，只依据实际成长证据给等级、百分位和 Lv140 区间；验证约 Lv20 的极品识别率与误丢率。
5. 为全部正式形态补独立物种档，并逐档运行至少 10,000 样本审计。

## 验证证据

```text
node --test server/node/test/pet-growth-authority.test.js
  5/5 passed

node tools/run_godot_auto_checks.mjs --only=--auto-pet-growth-authority-check,--auto-pet-growth-species-simulation-check,--auto-pet-growth-observation-check --fail-fast
  godot-parse passed
  pet growth authority: status=ok version=pet_growth_authority_v1 vectors=3
  existing species simulation and growth observation passed
  summary: 4/4 passed
  log: .run/godot_auto_checks/2026-07-10T19-21-35-090Z.log

git diff --check
  passed
```

本阶段没有启动本地后端、没有连接 MySQL，也没有创建或修改账号与宠物数据。
