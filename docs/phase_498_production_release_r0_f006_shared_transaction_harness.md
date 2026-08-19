# Phase 498：生产发布 R0.F006 shared transaction fake harness

日期：2026-08-20
任务：`R0.F006 AUTO｜升级 shared transaction fake harness 到当前 MySQL 合同`

## 结论

R0.F006 已完成。`mysql-shared-transaction-integration.test.js` 的共享 MySQL fake 现已跟上四角色槽和邮箱存储代次合同，原有 32 个失败全部恢复；同时新增一项严格 legacy bridge 回滚测试，因此目标文件最终为 `33/33 pass`。

本阶段只修复测试基础设施，没有改变生产 MySQL writer、服务端业务规则、数据库 schema、客户端协议或玩家行为。共享 fake 对未知 SQL 仍返回 `shared_mysql_unknown_operation`，没有增加“默认 affectedRows=1”之类的放行路径。

最终完整服务端套件为：

```text
tests       1978
pass        1961
fail        16
cancelled   0
skipped     1
todo        0
duration    70575.843708 ms
```

相对 R0.F005 的 `1977 tests / 1928 pass / 48 fail / 1 skip`，失败数精确减少 32，新增失败为 0；总测试数增加的 1 项就是本阶段新增的原子回滚覆盖。服务端发布门禁仍为 `BLOCKED`，下一游标是 R0.F007。

## 根因

旧 shared transaction fixture 同时落后于两项已经发布的 MySQL 合同：

1. 权威根已有 `accountCharacterSlots`，但 baseline、物理表 seed 和 fake CLI loader 都没有角色槽行。每个 store 第一次保存都会把旧 binding 桥接成槽位，并生成未建模的严格 `INSERT INTO account_character_slots`。
2. 邮箱存储基础已经要求普通邮件事务持有 `mail_storage_control/mail_lifecycle` 的共享代次锁，旧 handler 不认识包含 schema/data generation 和 feature flags 的控制行查询。

这两个未知操作位于每条事务的前部，因此全文件 32 项都先落入 `shared_mysql_unknown_operation`。补齐前置合同后，原 32 项中有 31 项直接恢复；最后一项继续暴露出此前被遮蔽的 generation-zero legacy `mail_messages` 原始 INSERT。它属于同一个 fake SQL 模型缺口，本阶段一并按精确物理投影修复。

## 当前基线与严格 SQL 模型

### 四角色槽基线

- 权威 fixture 为每个账号提供固定 4 项 roster，其中槽 0 是活动角色，其余为 `null`；
- `sqlSeed()` 同步生成 `account_character_slots` 物理行，包括账号、槽序号、player ID、三个时间字段和完整 `document_json`；
- fake CLI reload 把这些物理行重新投影为根中的 `accountCharacterSlots`；
- 正常 shared transaction 从当前完整基线开始，不再把兼容桥接 INSERT 混入所谓的业务行级并发测试。

### 邮箱代次控制锁

fixture 明确种入 generation-zero 控制行：

```text
scope_key            mail_lifecycle
schema_generation    1
data_generation      0
lifecycle_state      uninitialized
archive_enabled      0
vault_claim_enabled  0
active_limit_enabled 0
```

handler 只接受生产 `MAIL_STORAGE_CONTROL_LOCK_SQL` 的精确七列、单参数、`FOR SHARE` 形状，并通过共享主键锁返回该物理行。其他控制查询、错误参数或锁模式仍 fail closed。

### 原始 INSERT 投影

legacy generation-zero writer 仍会执行原始 SQL，而条件 writer 使用参数化资源写。fake 现在对以下两种原始 INSERT 做严格解析：

- `account_character_slots`：要求固定列顺序、槽序号 `0..3`、可解析 MySQL 字符串/NULL 和 JSON；JSON 中的 schema、账号、槽、player ID 与时间字段必须逐项等于物理列；
- `mail_messages`：要求固定列顺序和 JSON；mail ID、收发账号、标题、创建/已读时间必须逐项等于物理列。

只有完全匹配的语句才会转换为共享 harness 的 strict insert。未知列、额外字段形状、参数数量错误、无效字符串/JSON 或文档投影漂移都会拒绝，不会伪造成功回执。

## 锁序与整单回滚证据

新增测试构造一个只用于兼容验证的旧物理快照：binding/profile 存在，但 `account_character_slots` 为空；loader 按生产兼容路径恢复两个槽 0。随后同一 legacy 邮件事务写入：

1. 全局 auth revision 排他屏障；
2. `mail_storage_control` 共享代次锁；
3. 两条严格角色槽 INSERT；
4. 一条 legacy 邮件 INSERT；
5. 回执容量更新和最终 mutation receipt INSERT。

数据库侧预置了一个 loader 不可见、与最终 operation ID 冲突的物理 receipt。最终 strict INSERT 返回重复身份并被转换为已知 `mysql_resource_revision_conflict`；事务确认回滚后：

- 两条角色槽行均不存在；
- 新邮件不存在；
- 回执容量 revision 保持原值；
- DB-only 冲突 receipt 原样保留；
- auth global revision 不推进；
- `onCommittedSnapshot` 未触发，连接、事务和锁全部收尾。

这条证据同时锁定了原始 SQL 返回行、关键锁顺序和全写集回滚，避免只靠 32 个旧用例“碰巧变绿”。

## 验证

执行的核心命令：

```sh
node --check server/node/test/mysql-shared-transaction-integration.test.js
git diff --check
node --test --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f006_target_final.tap \
  server/node/test/mysql-shared-transaction-integration.test.js
node --test --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f006_adjacent.tap \
  server/node/test/equipment-envelope-registry.test.js \
  server/node/test/auth-shared-asset-read-through.test.js \
  server/node/test/mysql-shared-asset-read.test.js \
  server/node/test/shared-asset-read-model.test.js \
  server/node/test/auth-durable-commit.test.js \
  server/node/test/mysql-mail-claim-conditional-save.test.js \
  server/node/test/mysql-mail-send-conditional-save.test.js \
  server/node/test/mysql-market-create-conditional-save.test.js \
  server/node/test/mysql-resource-acquisition-order.test.js \
  server/node/test/shared-mysql-transaction-harness.test.js \
  server/node/test/mysql-shared-transaction-integration.test.js
node --check tools/p0_6d_profile_parallel_mysql_gate.mjs
npm --prefix server/node ci
node tools/p0_6d_profile_parallel_mysql_gate.mjs
cd server/node
node --test --test-reporter=tap \
  --test-reporter-destination=../../.run/server_test_classification/r0_f006_full_server_final.tap
```

结果：

- Node 语法与 `git diff --check` 通过；
- 目标文件从 `0/32` 恢复为 `33/33 pass`，包括新增的 legacy bridge 原子回滚测试；
- shared-read、durable commit、装备 registry、邮件/市场条件写、资源锁序与基础 harness 相邻组合 `277/277 pass`；
- 一次性真实 MySQL 完整门禁在 MySQL `9.7.0-er2`、`REPEATABLE-READ` 下返回 `qualified=true`、`realMysql=true`、`cleanupVerified=true`；随机端口不为 3306，忽略外部 MySQL 凭据，deadlock 增量、活动事务和活动锁等待均为 0；
- 真实门禁首次预检因候选 worktree 尚无 `mysql2` 本地依赖而在启动 MySQL 前退出；按 lockfile 执行 `npm --prefix server/node ci` 后安装 25 个包、审计 0 漏洞，未改 tracked 文件，原命令随后完整通过；
- 完整服务端 `1978 tests / 1961 pass / 16 fail / 1 skip`；对两个 TAP 中全部 `not ok`（含嵌套子测试）做集合对账，精确移除 32 项、无新增；
- 唯一 skip 仍是需要 `BEASTBOUND_TEST_VALKEY_PORT` 的真实 Valkey 流测试，本阶段没有隔离端口，保持有理由 skip；
- 测试只使用内存 fake、fake CLI 和工具创建的一次性隔离 MySQL；没有读取玩家服凭据、连接共享数据库或改写真实玩家数据。

本机原始 TAP 输出保存在忽略目录：

```text
.run/server_test_classification/r0_f006_before_target.tap
.run/server_test_classification/r0_f006_target_final.tap
.run/server_test_classification/r0_f006_adjacent.tap
.run/server_test_classification/r0_f006_full_server_final.tap
```

## 非目标与剩余风险

- 本阶段不处理 R0.F007–R0.F013，也没有改变真实 MySQL schema、业务事务、经济、战斗、地图、宠物或玩家 UI；
- 当前 16 个稳定失败继续闭合为 `15 个测试夹具漂移 + 1 个已废弃预期`；R0.F013 登记的随机战斗夹具间歇失败本次没有出现，但仍需独立修复；
- 没有客户端代码或玩家可见行为变化，因此不需要 Godot、Main.tscn 或性能探针；
- `node_modules`、TAP、日志和一次性 MySQL 状态均为忽略的本地生成物，不进入提交。

下一任务：`R0.F007 AUTO｜补齐 MySQL 精确回执夹具的角色作用域字段`。
