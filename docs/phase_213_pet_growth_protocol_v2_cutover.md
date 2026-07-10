# Phase 213 — 宠物成长协议 v2 原子切换

## 目标

Phase 208–212 已分别建立公开投影、双缓存清洗、服务端私密种子、严格成长目录、逐级 runtime 和默认关闭的统一 EXP dispatcher，但任何一项都不能单独开启。本阶段把以下边界作为一个不可拆分的部署组切换：

1. 所有对外完整档案只返回公开宠物 DTO，内部存储继续保留私密成长 envelope。
2. Godot 联网登录清洗 active/last-good，但首次服务器拉档前绝不加载旧缓存。
3. 联网宠物重复 normalize 不调用目录、seed fallback 或本地 RNG，也不改写服务器当前六项属性。
4. 新 Lv1 确定性奖励统一由严格 factory 决定 authority-v1 或 legacy 身份。
5. 战宠、骑宠和世界经验道具正式启用 authority-v1 逐级结算。
6. 联网 UI 只展示 Lv1、当前属性和已经发生的成长观察，不显示隐藏个体的精确 Lv140 终值。
7. 客户端和服务端同时锁定协议 v2，旧客户端/旧服务器组合明确拒绝连接。

这同时完成 `P0.2b2b-2b` 与 `P0.2c-2b`。

## 复现事实与主要矛盾

- `publicProfile/publicPet` 已存在，但服务端 24 个完整 profile 出口没有统一调用；直接开启 v1 会把 `privateSeed/privateRoll/continuousStats` 发给客户端。
- Godot `_apply_authenticated_session()` 会先加载账号缓存，再进行服务器首拉取；旧缓存进入 `_normalize_pet_instance()` 后可能用实例 ID 作为 fallback 重抽成长。
- 通用 `PlayerProgressModel.save_profile()` 会先把 active 原文复制到 `.last_good`，不能用于本次首次权威发布，否则旧秘密可能重新污染备份。
- `PetGrowthObservationModel` 会从本地 roll 推出精确 Lv140；这与“练到约 Lv20 才逐步判断去留”的产品规则冲突。
- 三个确定性 Lv1 奖励路径仍先写 legacy 种子；linked form 若先 legacy 再 v1，会把模板基础四维误当成真实 Lv1 4V，并被严格 runtime 正确拒绝。
- 战斗捕捉仍接受客户端提交的 encounter form/等级/四维，不能在本阶段把捕获物伪装为“服务端权威 v1”。

## 服务端切换

### 浅层公开响应边界

`createAuthService()` 的对外方法统一经过 `projectPublicServiceResult()`：

- 只投影明确登记的顶层 `profile`；
- 单独投影人物转生返回的 `rebirth.starterPet`；
- 不递归清洗整个 battle/event payload，避免破坏 battle actor、EXP 摘要等同名 `.pet` DTO；
- `snapshot()` 保持内部视图，继续包含私密 v1 状态，供持久化和隔离测试验证。

共享 `server_pet_profile_public_v2_vectors.json` 同时锁定 Node 的精确公开输出和 Godot 的接受/幂等投影，覆盖 authority-v1、legacy、地面掉落、训练伙伴及私密 canary。

### 新 Lv1 宠 factory

新增：

```text
createNewPetFactory({growthCatalog})
  .finalizeLevelOne(candidate, {purpose})
```

固定顺序：

```text
验证全新且严格 Lv1 的候选宠
→ 严格目录 resolveNewPetProfile
→ 仅生成一次 CSPRNG 私密身份
→ linked: initializePetGrowth
→ unlinked: initializeNewLegacyPetPrivateState
```

factory 不管理背包消耗、容量、serial、状态、图鉴、绑定、技能槽或 MM helper；这些仍由各自事务负责。linked 宠只在 `petGrowth.private.privateSeed` 保存身份，根部不留 `individualSeed`；unlinked 宠保持 legacy 身份和两份不可重写的真实 Lv1 事实。

已接入：

- 人物 1–4 转赠宠（linked）；5–6 转形态未连接成长档，保持 legacy。
- 世界宠物蛋；MM1/MM2 为 linked，四灵幼兽等未连接形态保持 legacy。
- 1/2 转小 MM 奖励。

战斗捕捉继续调用 legacy initializer，留到 `P0.2c-3` 先完成服务端权威遇敌实例。

### EXP 正式启用

正式服务构造 dispatcher 时固定传入 `enableAuthorityV1: true`，不提供环境变量、HTTP 参数或普通配置开关。已有 linked-form legacy 宠没有 v1 envelope，仍解析为 `legacy_existing`，不会迁移或重抽。

- 合法 v1 世界经验道具会逐级更新连续累加器、公开四维和等级经验，再扣除道具并保存一次。
- 损坏 v1 会在扣道具和增加 revision 前失败关闭。
- 多人战斗先预检全部真实战宠/骑宠；成功后 legacy、v1、骑宠和训练伙伴按既有奖励归属共同结算；内部 seed 不进入 room、writeback、record 或响应。

## Godot 切换

### 登录、严格入口和双缓存发布

协议 v2 服务器会话的顺序固定为：

```text
设置该账号 server save path
→ 分别清洗 active 与 last_good
→ 创建不含宠物的中性运行态
→ 不加载任何旧服务器缓存
→ 拉取 fresh server profile
→ 严格档案投影
→ server-marker 无 RNG normalize
→ 应用 summary/revision
→ 专用 publisher 原子替换 active 与 last_good
```

所有装备、商店、转生、聊天、交易、市场、邮件、银行、任务及 profile-action 返回的完整档案都改走 `ServerSyncCoordinator.apply_server_profile_payload()`。缺 marker、坏 marker 或坏 envelope 时，运行态、revision 和既有缓存保持不变，并排队重新拉档。

服务器会话的通用延迟保存和立即保存均为 no-op；只有通过严格投影的新鲜服务器档案可以调用 `ServerProfileCacheModel.publish_fresh_server_profile()`。publisher 不复制旧 active 原文，active/last-good 分别写入同一个已验证公开快照。

### 不重抽与观察 UI

只要 `growthAuthority.source == "server"`，`PlayerProgressModel` 就进入单向安全路径：

- 合法或损坏 marker 都不会回退 `PetGrowthObservationModel.normalize_pet_instance()` 或 `PetIndividualGrowthModel.growth_snapshot()`；
- 重复 normalize 保留 `level/hp/maxHp/attack/defense/quick`、Lv1 事实、公开 envelope 和公开观察；
- 不生成 `individualSeed/growthSpeciesSeed/*Roll/quality/continuous`；
- 缺少可靠观察时显示“未观察/资料不足”，不再默认成“普通”。

联网成长页列名从“预测140”改为“观察趋势”，目标值显示“观察中/不预判”。实际 Lv1→当前的每级成长、分位和评级仍保留，所以玩家约 Lv20 时判断去留的机制没有删除；只是不能再从客户端隐藏 roll 直接透视精确 Lv140。

## 协议与兼容

- Node `PROTOCOL_VERSION/MIN/MAX` 均为 `2`。
- Godot `CLIENT_PROTOCOL_VERSION` 为 `2`。
- health 仍无需协议；HTTP/WS 业务连接拒绝 v1。
- 不修改普通业务 `schemaVersion`。
- 不迁移、不重抽旧宠，不读取或修改真实 MySQL/玩家档案。
- v1 私密 envelope 继续随 JSON/MySQL profile 文档原样持久化；公开 DTO 绝不能回写服务端覆盖内部状态。

## 验证

服务端：

```text
npm --prefix server/node test
  210/210 passed

new-pet factory + public DTO + profile boundary + EXP focused tests
  passed

pet design inspector
  errors=0; growth/dispatcher/v1/factory/public/v2/client-no-reroll=true
```

Godot：

```text
godot --headless --path client/godot --quit
  passed on Godot 4.7

--auto-server-pet-growth-boundary-check
--auto-server-profile-sync-check
--auto-auth-server-client-check
--auto-client-version-check
--auto-pet-growth-observation-check
  focused checks passed
```

真实 Metal 客户端以 1280×720 运行成长页检查，截图：

- `.run/evidence/phase213/server_pet_growth_observation_v2.png`
- 可见“观察趋势 / 观察中 / 不预判”，Lv1、当前值、成长/级和评级仍存在；未出现精确 Lv140 或“个体：普通”误判。

性能抽样：

- 上一接受基线（Phase 205）：idle `process_total` median `0.50ms`、p95 `0.58ms`；moving median `0.43ms`、p95 `0.45ms`。
- 本阶段当前抽样：idle 稳定约 `0.14–0.24ms`；moving 60 FPS、稳定约 `0.12–0.21ms`。
- 移动连点：`317` 次输入、`avg_input_us=10`、`max_input_us=168`、`coalesced=true`、`settled=true`。
- 新投影、目录解析、缓存 I/O 和观察计算只发生在登录、权威响应或面板刷新，不进入 `_process/_input/_draw` 热路径。

`git diff --check` 通过；测试进程没有遗留本地服务。所有服务端测试使用隔离 memory/JSON 测试存储，没有连接真实 MySQL。

## 剩余风险与下一步

1. `P0.2c-3`：客户端仍可提交 encounter form/等级/四维；必须先让服务端生成野宠实例，再把捕捉改成转移该实例，Lv2+ 不能事后伪造 Lv1 历史。
2. `P0.2c-3`：宠物转生、GM 升级、挂机/离线经验、进化和融合尚未全部接入同一成长结算周期。
3. `P0.2d`：当前分位来自已发生的平均成长；可靠置信区间、样本量提示、全物种万人模拟和旧档迁移报告仍待完成。
4. active 与 last-good 是两个独立文件，文件系统不能提供跨两文件的联合事务；任一写入失败时客户端不加载缓存，下次登录仍以 fresh server profile 为准。

## 涉及文件

- `server/node/src/auth-service.js`
- `server/node/src/auth/new-pet-factory.js`
- `server/node/src/protocol.js`
- `server/node/test/*pet*`、`auth-profile-actions.test.js`、`auth-battle-room.test.js`、`auth-http-server.test.js`
- `tools/fixtures/server_pet_profile_public_v2_vectors.json`
- `client/godot/scripts/net/server_sync_coordinator.gd`
- `client/godot/scripts/progression/player_progress_model.gd`
- `client/godot/scripts/progression/pet_growth_observation_model.gd`
- `client/godot/scripts/progression/server_*profile*model.gd`
- `client/godot/scripts/ui/panel_flow_coordinator.gd`
- `client/godot/scripts/qa/auto_check_coordinator.gd`
- `.agents/skills/design-beastbound-pets/`
- `stoneage_gap_plan.md`
