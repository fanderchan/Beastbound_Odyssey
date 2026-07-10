# Phase 211 — 服务端严格成长目录与逐级结算影子内核

## 目标

P0.2a 已锁定 Node/Godot 双端算法，但服务端仍缺少两个可以安全接入生产升级入口的基础能力：严格读取物种成长档，以及对一只宠物的完整私有成长状态进行初始化、校验和逐级结算。

本阶段先完成不接生产事务的影子内核：

1. 从现有共享 JSON 建立唯一的 Node 严格成长目录，不复制第二份宠物数值。
2. 定义可持久化的 `pet_growth_authority_v1` canonical envelope，并对全部事实做确定性重算。
3. 从已保存的 6 位连续属性逐级结算到目标等级，返回只含可见变化的等级证据。
4. 收紧玩家公开投影的合法 v1 判定，缺私有 schema、成长档 ID 或冻结培养修正时一律标记为 invalid。

## 复现事实

- `pet_growth_species_profiles.json` 当前有 7 个档案，`pet_templates.json` 有 31 个形态；只有 7 个形态双向链接成长档，剩余 24 个必须继续明确走 legacy，不能自动套用通用档案。
- 旧 Node 读取方式会容忍数字字符串、缺字段、反向范围、未知分布或静默默认值，不适合决定有商业价值宠物的长期成长。
- 正式宠物 EXP writer 当前只更新 `level/exp/nextExp`，不会更新 `maxHp/attack/defense/quick`。
- 公开投影此前只检查 seed、roll 和 continuous；若缺失运行时必需的冻结培养修正，仍可能错误派生“可运行 v1” marker。
- Phase 209 创建的 `individualSeed + Lv1 facts` 仍是 legacy 兼容状态，不能据此自动迁移成 v1，否则会给旧宠重新开奖。

## 严格服务端目录

`pet-growth-catalog.js` 只从仓库固定路径读取现有两份共享 JSON，测试可以注入内存文档，但生产 API 不接受任意文件路径。

目录在启动/构造时一次性验证：

- 两份文档都必须为 schema 1，profiles/forms 为非空数组；
- ID 非空、无首尾空格、无重复，成长档 ID 必须以 `_vN` 版本化；
- 四维对象必须恰好为 `maxHp/attack/defense/quick`，只接受有限 number；
- range 必须恰好两个数且 `min <= max`，禁止交换、补零、截断或数字字符串；
- 分布只允许 `uniform/weighted_center/rare_spike`，极值概率必须显式提供并位于 `0..0.25`；
- 最差 Lv1 属性至少为 1，最差单级成长仍大于 0；
- profile 与 form 的 ID、名称、基础属性和反向引用必须一致，模板 `agility` 显式映射为成长轴 `quick`。

运行时只能得到由严格目录标记、深度冻结的 authority profile：`profileId/formId/outputBase/outputGrowth/individualRules`。观察阈值、显示名和其他原始 JSON 元数据不会进入结算器，绕过目录直接传原始 JSON 会被 runtime 拒绝。

同一形态允许历史**档案 ID** `v1/v2/...` 共存：模板链接只选择**新宠 active profile**，已有 authority-v1 宠必须由实例的 `growthSpeciesProfileId + petGrowth.profileId/modelVersion` 解析回原历史档案。仅有 form/template 链接、没有实例 v1 envelope 的旧宠明确返回 `legacy_existing`，不会因今天给模板新增档案而重抽；未链接形态返回 `legacy_unlinked`。未知算法版本、invalid marker、缺模型的 authority-shaped envelope、错配、悬空或“成长档属于另一形态”全部失败关闭，绝不降级到 legacy RNG。

## Canonical v1 envelope

内部宠物只允许一份私有成长状态：

```text
petGrowth
├── schemaVersion/modelVersion/profileId/settledLevel
├── private
│   ├── schemaVersion/privateSeed/privateRoll
│   ├── cultivation(schemaVersion/initialBonus/growthBonus)
│   └── continuousStats
└── public
    └── schemaVersion/growthModelVersion/growthSpeciesProfileId/level/levelOneFourV/stats
```

同时锁定：

- `pet.level === petGrowth.settledLevel === petGrowth.public.level`；
- 根四维等于公开 `stats`，且等于 continuous 使用 Phase 206 远离零规则后的整数显示；
- `initialStats`、`growthSpeciesLevel1Stats` 与 `levelOneFourV` 完全一致；
- `levelOneFourV` 故意不含培养 initial bonus，当前 `stats` 可以包含冻结培养修正；
- canonical seed 只在 `petGrowth.private.privateSeed`，初始化后删除同值的 legacy `individualSeed`，不保留第二份秘密；
- `growthAuthority` 只由响应投影派生，运行时不信任也不持久化它。
- 私有 `cultivation.growthBonus` 与已有玩家可见 `petCultivation.rebirthGrowthBonus` 必须完全一致；转生切片必须原子更新两者。

validator 不只检查字段齐全，而是由 seed 重新推导 roll，由 Lv1 逐级重建目标等级 continuous 和 public，再逐项比较私有累加器、公开快照、根属性和 Lv1 历史。伪造 continuous 即使尚未改变整数显示也会被拒绝；错误信息不包含 seed 值。

## 初始化与逐级结算

`initializePetGrowth()` 只用于真正的新 Lv1、已由严格目录解析到 v1 的宠物。已有完整相同状态时幂等；半截 envelope、不同 seed/培养、冲突 Lv1 历史或任何其他 legacy 私有状态都会失败关闭。它不承担旧档迁移。

`settlePetGrowthToLevel()` 要求整数目标等级位于当前等级至 140：

- 同等级返回无变化；
- 降级明确拒绝，转生必须使用以后单独的成长周期 API；
- 每级从已保存 continuous 加上该级 delta，再量化至 6 位；
- 最终同时用 Phase 206 直接重建结果交叉验证，禁止从上一级已取整四维继续累加。

返回的 `settlement.levels[]` 只含 `level/stats/visibleDelta`，不保存无界历史，也不含 seed、roll、cultivation 或 continuous。runtime 返回的 `.pet` 是仅供服务内部持久化的私有对象，未来 action/HTTP 只能返回 settlement 或经过 `publicProfile/publicPet` 投影的结果。跨模块测试已锁定“runtime internal pet → public v1 pet → 再投影幂等”且没有私有字段。P0.2d 的观察模型以后只能消费这些已发生的可见证据，而不是读取隐藏底板。

普通升级的 HP 规则锁定为：满血仍满血、保留绝对缺血量、`hp=0` 仍为 0，不允许借升级复活。转生回满属于独立事务规则。

## 明确非目标与兼容边界

- 本阶段未接 `auth-service.js`，未改变任何捕捉、战斗、挂机、经验道具、转生、响应或客户端行为。
- 不扫描、不读取、不迁移、不重滚任何旧宠或真实玩家数据；没有连接 MySQL。
- 24 个未链接形态、全部现有 legacy 宠、Phase 209 新宠仍走原逻辑。
- 捕捉 actor 仍可能来自客户端提交的遇敌事实，因此不能在 P0.3 服务端权威遇敌之前直接启用 v1 捕捉。
- 转生会降低等级并替换成长周期培养修正，不能调用普通 settle；必须另写事务级 reset contract。
- 当前只有 7/31 形态具备成长档，不能据此声称全物种成长已完成。

下一切片 P0.2c-2 将在内存/隔离事务测试中接入“安全的新 Lv1 linked-form 创建 + 三个普通 EXP 入口共用 dispatcher”，保持 legacy/unlinked 原样；捕捉和转生分别后置。

## 涉及文件

- `server/node/src/auth/pet-growth-catalog.js`
- `server/node/src/auth/pet-growth-runtime.js`
- `server/node/src/auth/profile-visibility.js`
- `server/node/test/pet-growth-catalog.test.js`
- `server/node/test/pet-growth-runtime.test.js`
- `server/node/test/auth-profile-visibility.test.js`
- `.agents/skills/design-beastbound-pets/references/repository-contracts.md`
- `stoneage_gap_plan.md`

## 验证

```text
node --check server/node/src/auth/pet-growth-catalog.js
node --check server/node/src/auth/pet-growth-runtime.js

node --test \
  server/node/test/pet-growth-runtime.test.js \
  server/node/test/pet-growth-catalog.test.js \
  server/node/test/pet-growth-authority.test.js \
  server/node/test/auth-profile-visibility.test.js \
  server/node/test/pet-private-seed.test.js \
  server/node/test/pet-private-state.test.js
  37/37 passed

npm --prefix server/node test
  185/185 passed

git diff --check
  passed
```

本阶段没有玩家可见 UI、输入、移动、绘制或热路径变化，因此不需要截图、视频或性能探针。
