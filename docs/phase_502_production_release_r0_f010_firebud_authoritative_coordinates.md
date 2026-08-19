# Phase 502：生产发布 R0.F010 Firebud 权威坐标夹具

日期：2026-08-20
任务：`R0.F010 AUTO｜让世界与宠物服务测试跟随 Firebud v2 权威坐标`

## 结论

R0.F010 已完成。`auth-social-world.test.js` 和 `pet-service-access.test.js` 不再把旧版
Firebud 坐标当作固定测试事实，而是从 `client/godot/data/*_map.json` 的当前权威地图按
地图 ID 与交互点 ID 解析服务点、出生点和碰撞语义，再选择可站立的邻格、两格外、远端
及阻挡移动样本。

兽栏近距/远距/移动中权限、宠技训练师身份与距离权限、持久回执重放后的新 key 重新鉴权、
服务端阻挡格拒绝四类产品合同均保持不变。生产地图、位置校验、宠物服务访问规则、玩家
资料和客户端均未修改。

完整服务端套件为：

```text
tests       1978
pass        1970
fail        7
cancelled   0
skipped     1
todo        0
duration    70051.918084 ms
```

相对 R0.F009 的 `1978 tests / 1966 pass / 11 fail / 1 skip`，失败数精确减少 4，
新增失败为 0。服务端发布门禁仍为 `BLOCKED`，下一游标是 R0.F011。

## 根因

Firebud v2 的服务区和训练场碰撞已经按正式候选布局移动：

- `firebud_stable_keeper` 当前权威格为 `[5,20]`，旧测试仍在 `[5,17]` 假设相邻；
- `firebud_pet_skill_trainer` 当前权威格为 `[7,18]`，旧测试把 `[8,18]` 当作两格外，
  实际已经是一格相邻；
- 训练场旧阻挡目标 `[11,14]` 当前可通行，具名碰撞测试 NPC `block_tester` 已在
  `[16,12]`。

因此三项宠物服务用例在尚未进入目标权限/幂等合同前就落在错误距离前提，世界移动用例则
把合法步错误地期待为 `movement_cell_blocked`。生产端严格跟随当前地图是正确行为，不能
为了旧断言回退地图或放宽距离与碰撞规则。

## 权威地图测试夹具

新增 `server/node/test-support/authoritative-map-test-fixture.js`，只供测试读取仓库当前地图：

- 扫描与生产相同的 `client/godot/data/*_map.json` 来源，并要求目标 map ID 唯一；
- 深度冻结读取结果，防止测试运行时篡改权威地图事实；
- 按精确 interaction ID 查找服务点，并可同时锁定 `kind`、`actionType`、`trainerId`
  与 `movementCollision`；
- 按地图 `gridSize`、`blockedCells` 和 interaction collision 判定可站立格；
- 通过 Chebyshev 距离动态选择一格邻接、两格外和至少三格外的可站立格；
- 对具名阻挡 interaction 自动选择一个正交可站立起点，目标必须仍声明阻挡，否则测试
  在装载时 fail closed；
- 地图缺失、重复、字段漂移、无可用样本或非法 cell 均抛错，不回退到魔法坐标。

本次解析得到的当前证据为：

| 场景 | 权威点 | 选取样本 |
|---|---|---|
| 兽栏 | `[5,20]` | 邻格 `[4,19]`、两格外 `[4,18]`、远端 `[0,0]` |
| 宠技训练师 | `[7,18]` | 邻格 `[6,17]`、两格外 `[5,16]`、远端 `[0,0]` |
| 错误地图 | 训练场默认出生点 `[14,12]` | 同样请求兽栏/训练师服务，必须拒绝 |
| 训练场阻挡 | `block_tester=[16,12]` | 从可站立 `[15,12]` 走向阻挡格，必须拒绝 |

`pet-service-access.test.js` 的静止邻格、移动中邻格、两格外、远端和错误地图路径全部复用
这些派生样本；`auth-social-world.test.js` 只把旧阻挡步替换成具名权威阻挡 interaction，
没有改变传送、跨图、记录点或 QA 逃生口断言。

## 验证

执行的核心命令：

```sh
git diff --check
node --check server/node/test-support/authoritative-map-test-fixture.js
node --check server/node/test/auth-social-world.test.js
node --check server/node/test/pet-service-access.test.js
node --test --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f010_after_target.tap \
  server/node/test/auth-social-world.test.js \
  server/node/test/pet-service-access.test.js
node --test --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f010_adjacent.tap \
  server/node/test/auth-social-world.test.js \
  server/node/test/pet-service-access.test.js \
  server/node/test/auth-profile-actions.test.js \
  server/node/test/auth-durable-commit.test.js \
  server/node/test/pet-encounter-permit-authority.test.js \
  server/node/test/auth-http-server.test.js
cd server/node && node --test --test-reporter=tap \
  --test-reporter-destination=../../.run/server_test_classification/r0_f010_full.tap
```

结果：

- 修复前两个目标文件稳定复现 `42 tests / 38 pass / 4 fail`；
- 三个改动 JavaScript 文件语法与 `git diff --check` 通过；
- 两个目标文件 `42/42 pass`；
- 世界/社交、宠物服务、档案动作、持久提交、遭遇位置许可与 HTTP 相邻组合
  `178/178 pass`；
- 完整服务端 `1978 tests / 1970 pass / 7 fail / 1 skip`，精确消除 R0.F010 的 4 项失败；
- 剩余稳定失败闭合为 R0.F011 的 `1 个已废弃预期` 与 R0.F012 的
  `6 个测试夹具漂移`；
- R0.F013 的间歇性战斗夹具本次没有出现，但仍需独立修复；
- 唯一 skip 仍是未配置 `BEASTBOUND_TEST_VALKEY_PORT` 的真实 Valkey 流测试，有既定理由；
- 测试全部使用内存 store、只读地图文件和回环 HTTP，没有连接共享或玩家数据库。

本机原始 TAP 输出保存在忽略目录：

```text
.run/server_test_classification/r0_f010_before_target.tap
.run/server_test_classification/r0_f010_after_target.tap
.run/server_test_classification/r0_f010_adjacent.tap
.run/server_test_classification/r0_f010_full.tap
```

## 非目标与剩余风险

- 本阶段不处理 R0.F011–R0.F013，不改 GM 回执、启动器依赖或战斗随机夹具；
- 地图测试夹具复刻当前服务端站立/碰撞判定所需的最小规则，用于选样而不是替代生产
  `mapDocumentById` 或位置权威；
- Firebud v2 仍保持既定 `owner_review_pending`，修复测试坐标不构成 OWNER 美术批准或
  地图发布提升；
- 完整服务端仍有 7 个稳定失败，R0.05 零失败门禁尚未通过；
- 没有产品地图、客户端或热路径变化，因此不需要 Godot、Main.tscn 或性能探针；
- TAP 和其他 `.run` 内容是忽略的本地生成物，不进入提交。

下一任务：`R0.F011 AUTO｜更新通用 GM 回执的 selectionEpoch 预期`。
