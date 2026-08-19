# Phase 501：生产发布 R0.F009 服务端权威遭遇夹具

日期：2026-08-20
任务：`R0.F009 AUTO｜重建三项战斗测试的服务端权威遭遇夹具`

## 结论

R0.F009 已完成。群弓、骑宠提前倒地经验和毒杀经验三项测试不再把请求中的
`selectedWildPet.battleStats` 当作敌宠最终属性，而是显式注入仅存在于
`server/node/test-support/` 的服务端权威遭遇目录。客户端请求现在只提交稳定的
`encounterZone.id`；敌人数、阵型、属性、经验和是否可捕捉均由测试端权威目录解析。

三项产品合同保持不变：玄影弓一次命中十个唯一目标并只消耗一次武器耐久；骑宠在人物
最后一击前倒地后不再获得该击杀经验；致死毒 tick 继续把冻结来源归属结算给人物及当时
骑乘宠，且不触发击飞。生产遭遇目录、成长物化、捕捉候选和客户端信任边界均未修改。

完整服务端套件为：

```text
tests       1978
pass        1966
fail        11
cancelled   0
skipped     1
todo        0
duration    70502.250084 ms
```

相对 R0.F008 的 `1978 tests / 1963 pass / 14 fail / 1 skip`，失败数精确减少 3，
新增失败为 0。服务端发布门禁仍为 `BLOCKED`，下一游标是 R0.F010。

## 根因

旧测试通过 `startPartyEncounter` 请求直接携带固定 `selectedWildPet.battleStats`，并据此
假设敌宠会保留 1 点或 15 点生命、固定防御和固定速度。现行正确运行链路会为可捕捉野宠
生成服务端私密成长候选，再由 `pet-capture-candidate-authority` 把 actor 的生命、攻击、
防御和速度同步为该权威候选。请求中的属性因此不会成为最终 actor 属性。

这三个失败均发生在测试预设场景尚未建立时：

- 玄影弓面对的是权威成长后的 Lv140 乌力，固定 28 点伤害前提失效；
- 骑宠经验场景的一点生命敌宠没有在首轮死亡，房间保持 `ready`；
- 毒杀目标没有被首轮毒伤和 tick 击杀，无法进入冻结来源经验结算。

生产端覆盖客户端属性是安全边界，不是回归。修复不能恢复请求属性覆盖，也不能降低捕捉
候选权威性。

## 测试夹具设计

`auth-service-test-context.js` 新增 `createAuthoritativePetEncounterFixture`：

- 构造时复制一份以 zone ID 为键的测试目录，并拒绝目录键与条目 `id` 不一致；
- 解析时只从请求读取 `encounterZone.id` 或等价 intent ID；
- 未登记 ID 返回 `encounter_zone_invalid`，不回退到请求里的敌宠事实；
- 已登记 ID 的敌人数、阵型、野宠、属性和奖励全部来自内部副本；
- 继续复用旧测试夹具的标准 encounter 输出形状，但用
  `authority=test_authoritative_fixture` 明确来源；
- 文件位于 `test-support`，仅由三个测试显式 import 和注入；`server/node/src/` 没有引用，
  生产 HTTP 或运行配置无法选择该目录。

三个固定敌人均标记为 `catchable: false`。它们是验证群攻、骑宠经验资格和毒来源冻结的
战斗靶 actor，不是捕捉测试对象；这样生产捕捉候选流程会按原合同跳过它们，而不是再次
用成长候选改写靶属性。相关捕捉权威测试仍在相邻回归中通过。

各测试在进入目标行为前直接断言房间中的实际敌人属性：

- 玄影弓：`500 HP / 1 攻 / 20 防 / 10 速`，权威敌人数为 10；
- 骑宠经验：`1 HP / 40 攻 / 1 防 / 300 速`，经验奖励为 200；
- 毒杀经验：`15 HP / 1 攻 / 1 防 / 1 速`。

请求只保留各自 zone ID，不再重复这些权威事实。

## 验证

执行的核心命令：

```sh
git diff --check
node --check server/node/test-support/auth-service-test-context.js
node --test --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f009_after_target.tap \
  server/node/test/auth-battle-equipment-authority.test.js \
  server/node/test/auth-battle-riding-authority.test.js \
  server/node/test/auth-battle-status-lifecycle.test.js
node --test --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f009_adjacent.tap \
  server/node/test/auth-battle-equipment-authority.test.js \
  server/node/test/auth-battle-riding-authority.test.js \
  server/node/test/auth-battle-status-lifecycle.test.js \
  server/node/test/auth-battle-room.test.js \
  server/node/test/pet-encounter-authority.test.js \
  server/node/test/pet-encounter-permit-authority.test.js \
  server/node/test/pet-capture-candidate-authority.test.js \
  server/node/test/pet-exp-settlement.test.js
cd server/node && node --test --test-reporter=tap \
  --test-reporter-destination=../../.run/server_test_classification/r0_f009_full.tap
```

结果：

- 修复前三个目标文件稳定复现 `21 tests / 18 pass / 3 fail`；
- Node 语法和 `git diff --check` 通过；
- 三个目标文件 `21/21 pass`；
- 战斗房间、遭遇权威、遭遇许可、捕捉候选与经验结算相邻组合 `123/123 pass`；
- 完整服务端 `1978 tests / 1966 pass / 11 fail / 1 skip`，精确消除 R0.F009 的 3 项失败；
- 剩余稳定失败闭合为 `10 个测试夹具漂移 + 1 个已废弃预期`，与
  R0.F010–R0.F012 一致；
- R0.F013 的间歇性战斗夹具本次没有出现，但仍需独立修复；
- 唯一 skip 仍是未配置 `BEASTBOUND_TEST_VALKEY_PORT` 的真实 Valkey 流测试，有既定理由；
- 所有战斗状态都使用内存 store 和测试随机权威，没有连接共享或玩家数据库。

本机原始 TAP 输出保存在忽略目录：

```text
.run/server_test_classification/r0_f009_before_target.tap
.run/server_test_classification/r0_f009_after_target.tap
.run/server_test_classification/r0_f009_adjacent.tap
.run/server_test_classification/r0_f009_full.tap
```

## 非目标与剩余风险

- 本阶段不处理 R0.F010–R0.F013，不改 Firebud v2 坐标、GM 回执或启动器夹具；
- 旧的宽松请求型测试 authority 仍供历史测试使用，本阶段只让三项强权威用例显式选择
  新目录，避免一次性迁移无关测试；
- 非可捕捉靶 actor 只用于隔离战斗合同，不替代真实可捕捉野宠的成长与捕捉回归；
- 完整服务端仍有 11 个稳定失败，R0.05 零失败门禁尚未通过；
- 没有客户端代码或玩家可见行为变化，因此不需要 Godot、Main.tscn 或性能探针；
- TAP 和其他 `.run` 内容是忽略的本地生成物，不进入提交。

下一任务：`R0.F010 AUTO｜让世界与宠物服务测试跟随 Firebud v2 权威坐标`。
