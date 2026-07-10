# Phase 209 — 服务端新宠私密身份、真实 Lv1 事实与培养安全开奖

## 目标

P0.2 的玩家体验依赖两个不可重建的事实：宠物第一次归属玩家时的私密成长身份，以及确实在 Lv1 时看到的四维。Phase 209 先把这两个事实安全写入正式创建路径，同时保持现有响应字段和协议不变，为后续客户端/服务端原子切换减少风险。

本阶段解决：

1. 新宠不再使用房间、形态、序号或来源拼成的可预测身份。
2. 确实为 Lv1 的宠物保存真实 `maxHp/attack/defense/quick`，且重复初始化不会改写历史。
3. Lv2+ 捕捉只得到私密身份，不把当前等级战斗属性伪装成 Lv1 历史。
4. MM 转生的运气开奖不再由目标宠、材料宠和秒级时间决定。

## 复现事实

调查四条正式新宠入口后，原实现分别使用：

- 人物转生赠宠：`rebirth:<form>:<serial>`；
- 战斗捕捉：`capture:<room seed>:<form>:<level>:<serial>`；
- 世界宠物蛋：`pet_egg:<form>:<serial>`；
- MM 奖励宠：`pet_rebirth_mm:<source>:<stage>:<serial>`。

这些字符串既可预测，也没有保存 Lv1 四维。MM 转生培养另用目标 ID、材料 ID 和秒级时间拼接 roll seed，玩家可以推测或通过时机试探结果。

同时确认当前真实收藏宠的战斗 EXP、骑宠 EXP 和经验道具最终都只更新 `level/exp/nextExp`，不会更新四维。这是 P0.2c 的服务端逐级结算缺口，本阶段不假装已经完成隐藏成长接管。

## 实现契约

新增 `server/node/src/auth/pet-private-state.js`：

- `initializeNewLegacyPetPrivateState(pet, purpose, options)` 仅在身份为空时生成一个 `bps1_` CSPRNG 身份，已有身份永不替换；
- `knownLevelOneStats=true` 且宠物确实是 Lv1 时，保存两份独立拷贝：`initialStats` 与 `growthSpeciesLevel1Stats`；
- 声明已知 Lv1 却缺少任一项正整数四维时，在生成身份或写入事实前失败关闭，绝不把默认值 `1` 固化成历史；
- 如果一份有效 Lv1 事实已经存在，只补齐缺失副本，不根据后来变化的根属性覆盖历史；
- Lv2+ 或无法证明 Lv1 的入口不生成任何 Lv1 记录；
- `generatePetCultivationRollSeed()` 使用独立 `rebirth_mm_roll` 命名域，每次从 32 字节系统 CSPRNG 派生新种子。

生产命名域固定为：

| 路径 | purpose | Lv1 事实 |
| --- | --- | --- |
| 战斗捕捉 | `capture_growth` | 仅捕捉等级为 1 时写入 |
| 世界宠物蛋 | `world_egg_growth` | 写入 |
| 人物转生赠宠 | `player_rebirth_reward_growth` | 写入 |
| MM 奖励宠 | `rebirth_mm_reward_growth` | 写入 |
| MM 转生开奖 | `rebirth_mm_roll` | 不适用 |

不另写 `growthSpeciesSeed`，避免同一个秘密出现第二份副本；也不伪造 `pet_growth_authority_v1`。当前创建的仍是兼容旧模型宠物，完整 v1 envelope 由 P0.2c 在服务端真正拥有逐级结算后建立。

## 为什么可以先于协议 v2 接入

不兼容风险来自“服务端删掉私有字段，而旧客户端仍会因缺 seed 本地重抽”。本阶段没有删除或改名响应字段，`individualSeed` 仍是字符串，旧客户端可以继续消费；只是字符串从可猜内容变成不可预测内容，并补充真实 Lv1 记录。

以下内容仍必须作为同一切换组上线：

- 24 个 profile 响应出口和人物转生 `starterPet` 的公开投影；
- Godot 对 server marker 分流并禁止本地 RNG fallback；
- active 与 `.last_good.json` 两份缓存的安全清洗；
- 联网成长面板不显示隐藏品质或精确 Lv140；
- 客户端/服务端协议严格升级到 v2 并拒绝 v1。

在这些完成前，响应仍可能暴露内部种子。Phase 209 只解决身份不可预测和历史事实缺失，不把 P0.2b2b 标成完成。

## 旧档与数据安全

- 不扫描、不迁移、不重滚任何已有宠物。
- 已有 `individualSeed` 无论格式都保持不变。
- 已有有效 Lv1 事实不会被当前属性覆盖。
- Lv2+ 旧宠及当前客户端提交的 Lv2+ 野宠继续保留当前四维，并明确缺少 Lv1 历史。
- 新字段仍位于现有 profile JSON 内，不需要 MySQL 表结构变更。
- 验证只使用内存 store，不连接或修改真实 MySQL/玩家数据。

当前在线遇敌仍接受客户端组合的形态、等级与战斗属性；因此 Lv1 捕捉记录是“当前战斗 actor 已知为 Lv1 时的可见事实”，还不是最终防作弊来源。Phase 209 没有扩大客户端权限，也不比原捕捉结果多信任新数值；P0.3 仍必须让服务端权威抽取或验证遇敌，之后才能把所有新捕宠的 Lv1 来源称为完整服务器事实。

## 涉及文件

- `server/node/src/auth/pet-private-state.js`
- `server/node/src/auth-service.js`
- `server/node/test/pet-private-state.test.js`
- `server/node/test/auth-profile-actions.test.js`
- `server/node/test/auth-battle-room.test.js`
- `server/node/test/auth-quest-hang.test.js`
- `server/node/test/auth-storage.test.js`
- `server/node/test-support/auth-service-test-context.js`
- `.agents/skills/design-beastbound-pets/references/repository-contracts.md`
- `.agents/skills/design-beastbound-pets/references/growth-capture-encounter.md`

## 验证

```text
node --check server/node/src/auth/pet-private-state.js
node --check server/node/src/auth-service.js

node --test \
  server/node/test/pet-private-state.test.js \
  server/node/test/pet-private-seed.test.js \
  server/node/test/auth-profile-actions.test.js \
  server/node/test/auth-battle-room.test.js \
  server/node/test/auth-quest-hang.test.js \
  server/node/test/auth-storage.test.js
  93/93 passed

npm --prefix server/node test
  167/167 passed

git diff --check
  passed
```
