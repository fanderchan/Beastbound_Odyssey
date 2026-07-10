# Phase 207 — 宠物成长隐私投影与私有种子原语

## 目标

P0.2b 的第一块先建立两个影子安全原语：

1. 把内部完整档案投影成玩家可见档案，任何嵌套位置都不能带出隐藏成长 seed、roll、连续累加器或精确内部品质。
2. 为后续新宠提供不可预测、可测试的服务端私有种子，彻底脱离公开房间 seed、形态 ID、实例 ID 和捕捉序号。

本阶段仍不接入现有 HTTP/WS 响应或宠物创建路径。原因是当前 Godot 收到缺少 seed/roll 的联网宠物后会用实例 ID 本地重滚并覆盖服务器属性；单独启用服务端删字段会破坏旧宠，所以真实切换必须等 P0.2b2 客户端、服务端和协议一起原子上线。

## 先复现

使用内存 store 创建隔离测试账号，把代表性的旧/新私密成长字段写入单只测试宠物，再调用当前 `getProfile`：

```text
saved=true
getProfile=true
leakedKeys=individualSeed,growthSpeciesSeed,growthSpeciesRoll,growthRecord,petGrowth
leakCount=5
```

没有连接 MySQL，也没有读取或修改真实账号。进一步静态审计确认，当前 `auth-service.js` 与 focused auth domains 共有 24 个返回完整 `profile` 的成功/失败出口；仅在 HTTP 最后一层擦除并不足够，service 直接调用和事件响应也必须使用同一投影。

另一个已确认问题是当前新宠种子可预测：捕捉种子使用公开 `room.seed + formId + level + serial`，宠物蛋、转生宠和部分培养 roll 也由公开或可猜字段拼接。即使把 seed 字段从响应删除，玩家仍可重建结果。

## 玩家档案公开投影

新增 `server/node/src/auth/profile-visibility.js`：

- `publicProfile(profile)`：深拷贝整个玩家档案；`petInstances/pets` 和任意 `.pet` 容器强制走宠物 DTO，具备典型宠物身份+属性的未来嵌套对象也会被识别。
- `publicPet(pet)`：使用正向安全字段表，而不是“复制全部再删几个已知键”；当前宠、legacy 宠、地面掉落宠、训练伙伴快照或可识别的未来嵌套宠，未知字段默认丢弃。
- `publicGrowthObservation(observation)`：只允许玩家已经获得的观察证据字段，四维子表只允许 `maxHp/attack/defense/quick`，并严格校验 number/string/boolean 类型。

明确删除：

- `individualSeed/Variance/Quality*`
- `growthSpeciesSeed/SampleNo/Roll`
- 整个 `growthRecord`
- `privateSeed/privateRoll/continuousStats/settledContinuousStats`
- `initialBonus/innateGrowthBonus/growthBonus/internalGrowthBonus`
- `petGrowth.private` 及其他 private growth 容器
- 培养历史、最近培养结果内任意层级的 seed/roll
- 转生内部权重、内部战力池和 roll seed

明确保留：

- 宠物实例/形态/名称/状态/等级/经验/当前血攻防敏
- 元素、技能、锁定/绑定等正常玩家事实
- `growthModelVersion/growthSpeciesProfileId`
- 原始 Lv1 4V：`growthSpeciesLevel1Stats/initialStats`
- 严格白名单后的成长观察等级、已观察等级数、四维实际均值/分位/等级和总体等级
- 玩家本来就能看到的培养次数、可见增量、结算摘要和等级

`growthAuthority`、Lv1 stats、元素、培养记录/事件、转生助手石点和战力拆分同样分别使用正向白名单。未来 `petGrowth` envelope 只接受版本、档案 ID、已结算等级、Lv1 4V、当前 stats、公开观察和一层 `public`；即使内部开发者误把 `exactLv140Stats` 放进所谓 public 容器，投影也会删除它。所有投影都不修改内部原对象，并丢弃 prototype-pollution 危险键。

当前 legacy `growthObservation` 仍由隐藏 roll 计算，这是 P0.2d 要替换的事实；本阶段只保证它不附带目标等级精确属性或内部随机状态。玩家从公开 Lv1/当前属性自行算出的历史均值不属于秘密。

## 服务端私有种子

新增 `server/node/src/auth/pet-private-seed.js`：

- 默认读取 `crypto.randomBytes(32)`，提供 256 位新鲜熵。
- 使用 `SHA-256(domain + purpose + entropy)` 做命名域隔离；相同测试熵在 capture/rebirth 等用途下仍产生不同种子。
- 输出固定 `bps1_` + 43 位 Base64URL，总长度 48；字符串不编码 purpose、房间、形态、等级或序号。
- 生产 API 只接受 `purpose`，固定调用 `crypto.randomBytes`；传入第二参数会失败，room/form/serial 或弱随机源没有注入入口。
- 单测仅通过 Node 测试框架临时 mock `crypto.randomBytes` 来固定熵，mock 在用例结束后自动恢复，不进入产品 API。
- 提供格式检查和断言，但任何错误信息或测试输出都不打印实际 seed。

种子版本只定义私有随机材料的格式，不等于成长算法版本。P0.2b2 接入时，所有新建宠物路径必须按用途调用该原语并持久保存；旧宠物保持原结果，不因新 seed 原语重新开奖。

已经发给旧客户端、或曾由公开房间 seed 推导出的历史 seed 无法重新变成秘密。兼容旧宠时优先保持其现有结果；真正不可预测的隐藏成长只从切换点后的 CSPRNG 新宠开始保证，并禁止再把私有状态写入玩家响应或本地缓存。

## 为什么仍是影子状态

当前 Godot 的实际链路是：

```text
server profile
  -> ServerSyncCoordinator
  -> PlayerProgressModel.normalize_profile
  -> PetGrowthObservationModel / PetIndividualGrowthModel
  -> 缺 seed/roll 时用 instanceId 本地生成
  -> 重算并覆盖血攻防敏、growthRecord 和品质
```

登录还会先读取 `user://server_accounts/<username>/player_profile.json`；旧缓存会在首次服务端 pull 前触发同样重滚，`.last_good.json` 备份又可能继续保存旧秘密。因此 P0.2b2 必须作为一个不可拆部署组同时完成：

1. 给联网档案增加明确 `growthAuthority=server` 与真实 legacy/model version；旧线性宠和旧个体宠不能冒充 `pet_growth_authority_v1`。
2. 联网归一化只接受服务器当前 stats、Lv1 4V 和公开观察，缺私有字段时绝不生成、预测或覆盖属性。
3. 清洗 active server cache 与 `.last_good`，或在第一次权威 pull 前禁止旧缓存参与成长归一化。
4. 全部新宠创建路径改用 CSPRNG 私有种子；房间 seed 只保留战斗回放用途。
5. 24 个 profile 响应出口统一调用 `publicProfile`，service direct result 与 HTTP/WS 均有防回归检查。
6. 客户端/服务端协议从 v1 原子升级到 v2 并拒绝旧客户端；删隐藏字段是实际不兼容契约，不能假装仍兼容 v1。

## 本阶段文件

- `server/node/src/auth/profile-visibility.js`
- `server/node/test/auth-profile-visibility.test.js`
- `server/node/src/auth/pet-private-seed.js`
- `server/node/test/pet-private-seed.test.js`
- `.agents/skills/design-beastbound-pets/references/repository-contracts.md`

## 验证

```text
node --check server/node/src/auth/profile-visibility.js
node --check server/node/src/auth/pet-private-seed.js

node --test \
  server/node/test/pet-growth-authority.test.js \
  server/node/test/auth-profile-visibility.test.js \
  server/node/test/pet-private-seed.test.js
  13/13 passed

git diff --check
  passed
```

本阶段没有启动后端、没有连接 MySQL、没有改变协议或任何运行时响应，因此当前泄漏尚未宣称修复。
