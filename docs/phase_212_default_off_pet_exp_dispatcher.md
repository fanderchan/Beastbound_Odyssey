# Phase 212 — 默认关闭的宠物 EXP 统一 Dispatcher

## 目标

Phase 211 已有严格 Node 成长目录和纯 `pet_growth_authority_v1` 逐级结算器，但生产代码中的战斗宠、骑宠和世界宠物经验道具仍直接调用旧 writer。继续分别接功能会形成三套升级语义，并可能让 v1 宠在某个入口偷偷退回只改等级、不长属性的旧算法。

本阶段先完成一个可安全上线、但不启用 v1 的暗接线：

1. 三个普通宠物 EXP 入口统一经过同一个纯 dispatcher。
2. 现有 legacy linked/unlinked 宠保持原等级经验公式，四维和旧私密字段不变。
3. authority-v1、未知形态、损坏或伪造的成长状态全部失败关闭，绝不降级旧 writer。
4. 世界道具失败不扣道具、不改宠物、不推进任务、不增加 revision。
5. 多人战斗先预检全场真实战宠和骑宠；任一失败时，全场人物、战宠、骑宠和训练伙伴 EXP 都不发，避免部分账号获得经验。

这完成的是 P0.2c-2a；安全新 Lv1 v1 创建和 v1 正式启用仍需与公开响应、客户端不重滚和协议 v2 原子切换。

## 复现事实

- `applyBattleExpRewardToProfile()` 原本让战斗宠和骑宠各自直接调用 `applyBattleExpToEntry()`。
- `applyWorldPetExpItemAction()` 会先扣经验道具，再调用同一个只修改 `level/exp/nextExp` 的旧 writer。
- 旧 writer 不认识严格成长档，也不会校验 v1 envelope；若直接用于 v1，会让等级和可见属性失去确定性对应。
- `profileAction/getProfile` 当前仍返回完整档案。若此时启用 v1，成功响应会暴露 `privateSeed/privateRoll/continuousStats`，旧客户端也可能因拿不到或误处理私密状态而重滚。
- 战斗 writeback 按账号循环；若第二个账号的成长异常向外抛错，可能造成部分发经验。因此不能只在单宠调用点捕获，也要在结算前做全场 EXP 预检。
- 现有 EXP 回归夹具使用了数据目录中不存在的 `bui_normal_blue_water10`。严格目录正确拒绝了它；夹具改为真实存在、仍走 legacy 的 `bui_normal_yellow_wind10`，没有新增产品形态。

## Dispatcher 契约

`pet-exp-settlement.js` 只接受显式注入的深冻结严格目录和纯经验公式：

```text
createPetExpSettlement({growthCatalog, calculateAward, enableAuthorityV1=false})
  .settle(pet, amount, maxLevel, {name})
```

成功结果分成三层：

- `pet`：仅供服务端替换并持久化的内部宠物；
- `publicExp`：保持旧 EXP 摘要字段，可进入普通响应和战报；
- `settlement`：只含公开逐级属性证据，本阶段不进入响应、事件、trace 或战报。

dispatcher 不修改输入对象。legacy 路由只替换 `level/exp/nextExp`；v1 显式启用时才调用 Phase 211 runtime。默认服务没有环境变量或字符串真值逃生口，构造时不传 `enableAuthorityV1`，所以 v1 必然失败关闭。

旧档缺失或数值为 `0` 的 `nextExp` 继续以本次经验公式计算值作比较基线，保持旧 writer 的 `changed` 语义。满级溢出仍可以出现 `changed=false` 且 `overflowExp>0`，不伪造一次档案修改。

所有内部错误只映射成两个固定公开结果：

- `pet_growth_runtime_disabled`：合法 v1 尚未启用；
- `pet_growth_state_invalid`：未知、损坏、错配或其他非法状态。

公开错误不拼接原始异常、目录详情、seed、stack 或私有字段。

## 三入口事务边界

### 世界宠物经验道具

固定顺序为：

```text
验证宠物、等级和道具数量
→ 纯预结算
→ 扣除一件道具
→ 原子替换宠物内容
→ 档案任务/revision/save
```

dispatcher 失败时，`profile-actions` 会丢弃候选档案，因此宠物、背包、任务和 revision 全部不变。成功路径仍只保存一次。

### 战斗宠与骑宠

战斗关闭事务中的档案 writeback 先对所有参战账号的真实战宠和骑宠做纯预结算。任一只失败时，每个账号都收到固定、无秘密的失败摘要：

- `amount=0` 表示实际没有发放；
- `amount/baseAmount/rawBaseAmount/scaledAmount/partyBonusAmount/killCount` 全部归零，避免统计把失败尝试当成实际发放；
- `attemptedAmount/attemptedBaseAmount/attemptedRawBaseAmount/attemptedScaledAmount/attemptedPartyBonusAmount/attemptedKillCount` 单列本来要发的上下文；
- 人物、战宠、骑宠和训练伙伴 EXP 全部不变。

全场预检成功后，每个账号内部仍先完成全部真实宠物候选计算，再写人物和训练伙伴 EXP。同一宠物即使异常同时出现在战宠和骑宠奖励中，也会按原顺序在同一候选对象上累计，不会后写覆盖前写。训练伙伴宠物是人物/宠物快照，不属于真实可培养宠物，继续使用旧快照成长规则。

派生战报摘要同步保留 `failed/code/attemptedAmount`，同时所有实际发放聚合为 0；以后统计和 UI 不需要从正数基础经验猜测这是一场失败结算。

本阶段只把 **EXP 发放** 做成全场一致。若 EXP 预检失败，已经发生的 HP、战斗消耗品、捕捉、金币/物品奖励、任务和挂机结算仍按原规则写回；要让整场所有结果一起回滚，需要独立的 battle candidate transaction，不混入本次三入口统一。

## 隐私与兼容边界

- 正式服务只能以默认关闭方式构造 dispatcher；本阶段没有可由环境变量、HTTP 或普通配置打开的 v1 开关。
- 单元测试可以直接创建显式启用的纯 dispatcher，以验证 Phase 211 runtime；服务集成测试只验证默认关闭。
- legacy linked/unlinked 宠不迁移、不重抽、不长四维，已有 `individualSeed` 等字段原样保留。
- authority-v1 或 authority-shaped 损坏状态不能因兼容需求退回 legacy。
- 不读取、不修改真实玩家档案或 MySQL；所有服务验证使用隔离 memory store。

## 非目标与下一步

- 未创建任何新的 authority-v1 宠，四条新宠创建路径仍保持 Phase 209 legacy 私密状态。
- 未启用公开 profile 投影、双缓存登录清洗、客户端不重滚或协议 v2。
- 未接捕捉、转生、挂机、离线收益、GM 升级、进化或融合入口。
- 未解决战斗 room/profile/trace 的完整 candidate transaction；本阶段只保证 dispatcher 异常不逃出、EXP 不会按账号部分发放。

下一步必须先完成 P0.2b2b-2b 的原子公开边界，再按以下顺序启用：生成一次 CSPRNG 私密身份 → 严格目录 `resolveNewPetProfile` → linked form 使用 `initializePetGrowth`，unlinked form 保持 legacy → 三入口 v1 gate 打开。Lv1 捕捉与转生成长周期继续留在 P0.2c-3。

## 涉及文件

- `server/node/src/auth/pet-exp-settlement.js`
- `server/node/src/auth-service.js`
- `server/node/test/pet-exp-settlement.test.js`
- `server/node/test/pet-exp-service-integration.test.js`
- `server/node/test/auth-battle-room.test.js`
- `.agents/skills/design-beastbound-pets/SKILL.md`
- `.agents/skills/design-beastbound-pets/references/repository-contracts.md`
- `.agents/skills/design-beastbound-pets/scripts/inspect_pet_design.mjs`
- `stoneage_gap_plan.md`

## 验证

```text
node --check server/node/src/auth-service.js
node --check server/node/src/auth/pet-exp-settlement.js
node --check .agents/skills/design-beastbound-pets/scripts/inspect_pet_design.mjs
  passed

node --test \
  server/node/test/pet-exp-settlement.test.js \
  server/node/test/pet-exp-service-integration.test.js \
  server/node/test/auth-profile-actions.test.js \
  server/node/test/auth-battle-room.test.js
  74/74 passed

npm --prefix server/node test
  198/198 passed

node .agents/skills/design-beastbound-pets/scripts/inspect_pet_design.mjs --check
  errors=0; growthProfiles=true; petExpDispatcher=true; petExpV1=false

node tools/battle_action_catalog_check.mjs
  status=ok; actions=29; passives=5; petForms=31; petSkillSlots=7

godot --headless --path client/godot --quit
  passed on Godot 4.7

git diff --check
  passed
```

由于没有玩家可见 UI、输入、移动、绘制或帧循环变化，不需要截图、视频或性能探针。测试没有连接真实 MySQL，也没有读取或修改真实玩家数据。
