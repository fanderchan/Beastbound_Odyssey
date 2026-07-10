# Phase 208 — 宠物成长权威标记与客户端公开投影影子边界

## 目标

P0.2b2 不能直接从“服务端删除 seed”跳到正式启用。当前 Godot 在缺少旧成长 seed/roll 时会用实例 ID 本地补抽，并覆盖服务端返回的当前四维。Phase 208 先建立可独立验证、尚未接入运行时的双端边界：

1. 服务端根据内部宠物事实派生版本化 `growthAuthority`，不照抄档案里可能过时或伪造的模型声明。
2. Godot 提供只清洗、只校验、绝不读取成长目录或调用随机算法的服务器宠物投影。
3. 明确区分可运行的旧 individual、旧 species-linear、v1 权威模型，以及需要修复的损坏 v1 状态。
4. 先证明旧宠当前属性、受伤血量和公开观察不会被投影改写，再进入协议 v2 原子切换。

本阶段仍是 P0.2b2a 影子能力，不修改 HTTP/WS 响应、协议版本、缓存或真实宠物创建路径。

## 调查中发现并排除的错误方案

曾验证过“递归清洗整份 service payload”的方案，但它会把联网战斗中的宠物 actor 误识别成档案宠，删除 `actorId/ownerAccountId/side/kind/slot/statuses` 等战斗字段；也会把训练伙伴经验摘要里的 `.pet` 当成档案宠，删除等级和经验结算字段。因此没有保留通用 `publicServicePayload`。

正式启用时只能投影每个结果中明确的 `profile` 字段，并单独处理档案外的宠物奖励，例如人物转生结果中的 `starterPet`。HTTP/WS 传输层不得再次递归投影已经处理过的整份业务结果。

## 服务端权威标记

玩家可见宠物统一得到：

```json
{
  "growthAuthority": {
    "schemaVersion": 1,
    "source": "server",
    "modelVersion": "legacy_individual_v0",
    "settledLevel": 20
  },
  "growthModelVersion": "legacy_individual_v0"
}
```

可运行模型只有三种：

- `legacy_individual_v0`：没有 v1 envelope、也没有物种成长档 ID 的现有宠物。
- `legacy_species_linear_v0`：没有 v1 envelope，但已有 `growthSpeciesProfileId` 的现有宠物。
- `pet_growth_authority_v1`：内部 v1 状态通过结构一致性检查的新模型宠物。

如果内部 `petGrowth.modelVersion` 已声明 v1，但私有状态不完整或前后矛盾，服务端派生 `invalid_pet_growth_authority_v1`。这是故意不属于可运行模型的失败关闭标记：客户端保留服务器快照并要求修复，绝不静默降级成旧模型或重新开奖。

v1 结构检查要求：

- `level/settledLevel` 为 1–140 的相同整数；
- 私有种子符合 `bps1_` 256 位格式；
- private roll 版本和 profile ID 与实例物种档一致；
- initial/innate/continuous/public Lv1/public current 均为严格四轴数值表；
- public current 与根部当前四维一致，continuous 取整后也与公开当前四维一致。

此处只负责响应分类，不加载成长目录，也不声称重新证明 roll 一定由 seed 推导。P0.2c 的服务端结算必须调用 `pet-growth-authority.js`，用真实 profile 对 seed/roll 做派生校验后才能升级或写回。

投影保持幂等：严格公开后的 v1 envelope 可再次投影而不变；损坏 v1 也不会在第二次投影时被误降为 legacy。`growthAuthority` 只是客户端路由事实，服务端结算永远不能信任它来决定数值。

## 旧档兼容与档案路由

严格 DTO 同时把服务端仍接受的旧别名翻译成当前字段：

- `id -> instanceId/petId`
- `speciesId -> formId/templateId`（缺少当前形态字段时）
- `speciesName -> name`
- `battleState/status -> state`
- `rebirthHelper -> petRebirthHelper`

旧 JSON 中的安全数字字符串会转换为 number，避免投影后整只宠物因缺等级或四维而被 Godot 丢弃。v1 私有状态仍要求真正的数值和整数，不把宽松旧档规则用于新权威模型。

`publicProfile` 只对已登记档案路径做强制宠物投影：根 `petInstances/pets`、`trainingPartners[].pet`、`groundPetDrops[].pet`；带 `instanceId/petId` 和形态/四维特征的未来嵌套宠仍走严格 DTO。任意 `petGrowth` envelope 会走专用公开白名单。普通非宠物对象中的 `qualityScore/growthBonus` 等同名字段保持不变，避免隐私黑名单误伤未来装备、任务或经济数据；新的宠物容器必须显式登记并加测试。

`petCultivation.lastPreview` 不再返回半截旧预览。培养次数、公开成长加成、历史结算、最近结果和 MM 石点继续公开；内部权重、随机种子和战力池继续删除。

## Godot 服务器宠物公开投影

新增 `PetGrowthPublicProjectionModel.project_server_pet()`：

- 递归擦除 seed、roll、variance、quality、growthRecord、private、continuous、内部均值和精确预测；
- 严格保留服务端 `level/hp/maxHp/attack/defense/quick`，包括受伤血量差值；
- 校验 marker schema/source/model/settledLevel、公开 envelope、观察结构和所有 Lv1 记录的一致性；
- 连续投影幂等；未知模型、损坏 v1、等级冲突或 v1 缺 Lv1 时只返回安全快照并标记刷新，绝不 RNG fallback；
- Lv1 宠没有历史记录时，可把当前服务器四维同时作为 Lv1 4V；
- Lv2+ legacy 宠没有 Lv1 记录是不可逆的历史能力缺口，不是同步错误。投影保留当前属性，写入 `growthObservationUnavailableReason=legacy_missing_level_one` 和 warning，但不永久循环刷新，也不从模板反推。

影子自检覆盖十二种情况：两类 legacy、v1、幂等、Lv1 补记录、v1 缺记录、legacy 缺记录、损坏 v1、公开成长档冲突、公开当前四维冲突、未知模型和结算等级冲突。

## 为什么还不能称为修复完成

当前正式链路仍然是旧行为：

```text
server profile
  -> PlayerProgressModel.normalize_profile
  -> PetGrowthObservationModel / PetIndividualGrowthModel
  -> 缺 seed/roll 时本地重滚
```

同时仍有以下未完成项：

- `publicProfile` 尚未接入 24 个真实 profile 响应出口；当前响应仍会泄漏旧隐藏字段。
- Godot `PlayerProgressModel` 尚未按 server marker 分流；新投影目前只有 focused auto-check 消费。
- active cache 与 `.last_good.json` 尚未清洗。
- 捕捉、宠物蛋、人物转生赠宠、MM 宠和培养 roll 仍使用可预测字符串种子。
- 服务端新宠还没有统一保存 Lv1 4V；很多旧宠永久缺少这项历史事实。
- Node/Godot 当前仍各自维护投影 fixture；正式启用前要增加一份共享公开 DTO 黄金向量，防止字段或 model version 单边漂移。
- 协议仍是 v1；旧客户端若突然收不到 seed 会本地重滚。
- 成长面板仍可能根据隐藏 roll 显示精确 Lv140，详情也可能把缺品质字段误显示成“普通”。

因此 P0.2b2b 必须在同一个不可拆部署组中完成：客户端 marker 分流、缓存双文件清洗、明确 profile/奖励响应投影、全部新种子入口、所有新宠 Lv1 记录、非精确成长 UI、真实 profile-sync 回归，以及客户端/服务端协议 v2 拒绝旧客户端。

## 涉及文件

- `server/node/src/auth/profile-visibility.js`
- `server/node/test/auth-profile-visibility.test.js`
- `client/godot/scripts/progression/pet_growth_public_projection_model.gd`
- `client/godot/scripts/qa/auto_check_coordinator.gd`
- `client/godot/scripts/main.gd`

## 验证

```text
node --check server/node/src/auth/profile-visibility.js
node --test server/node/test/auth-profile-visibility.test.js
  4/4 passed

node tools/run_godot_auto_checks.mjs \
  --only=--auto-server-pet-growth-boundary-check,--auto-pet-growth-authority-check \
  --fail-fast --timeout-ms 180000
  godot parse + focused checks 3/3 passed
  boundary cases=12, authority vectors=3

git diff --check
  passed
```

验证只使用内存 fixture 和本地 Godot，没有启动服务端、连接 MySQL、修改协议或触碰真实玩家数据。
