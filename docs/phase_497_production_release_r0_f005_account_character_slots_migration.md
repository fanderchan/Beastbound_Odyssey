# Phase 497：生产发布 R0.F005 批量档案迁移角色槽合同

日期：2026-08-20
任务：`R0.F005 AUTO｜让批量档案迁移工具理解 accountCharacterSlots`

## 结论

R0.F005 已完成。批量档案迁移现在把 `accountCharacterSlots` 当作 MySQL 持久根合同的一部分，并按当前四角色槽模型审计账号、角色槽、活动角色绑定和档案之间的完整身份图。

旧实现仍假定“一个账号只有一个档案，且每个档案都有活动绑定”。Phase 378 已允许一个账号拥有最多四个角色，只有当前选择的角色出现在 `profileBindings`；因此真实 MySQL dry-run 在读到 `accountCharacterSlots` 时先因 `batch_root_contract_field_unclassified` fail closed，即使绕过该字段也会错误拒绝未激活的同账号角色。

本阶段没有放宽根合同，也没有绕过审计。迁移候选仍只改目标 `profile` 文档；角色槽进入来源摘要、候选摘要、完整候选核验和非目标持久投影。目标测试从 13 项失败恢复为 `19/19 pass`，相邻迁移、备份和存储测试为 `82/82 pass`。

最终完整服务端套件为：

```text
tests       1977
pass        1928
fail        48
cancelled   0
skipped     1
todo        0
duration    82403.459708 ms
```

相对 R0.F004 的稳定基线，顶层失败名称集合精确移除本任务的 13 项，新增集为空。服务端发布门禁仍为 `BLOCKED`，下一游标是 R0.F006。

## 四角色槽持久合同

迁移审计现在要求每个显式角色槽 roster 满足以下合同：

- roster 的账号键必须有效，并指向现有账号；
- roster 必须精确包含 4 个位置，空位置只能是 `null`；
- 占用位置必须只包含 MySQL 可往返的 7 个字段：`accountId`、`slotIndex`、`playerId`、`createdAt`、`updatedAt`、`lastSelectedAt`、`schemaVersion`；
- 未知字段、缺失字段、错误 schema、账号/物理位置不一致、无效时间戳和重复 player ID 均在写入前 fail closed；
- 每个占用槽都必须指向一个现有档案，每个档案也必须且只能由一个角色槽归属，二者账号所有者必须一致；
- 活动 `profileBinding` 必须指向同账号已占用槽，但未激活的同账号兄弟角色不再被错误要求拥有 binding；
- binding 与活动档案之间原有的账号、player ID 和 revision 一致性检查继续保留。

显式的全空 `[null, null, null, null]` roster 会以 `batch_character_roster_empty_unroundtrippable` 拒绝：它在 `account_character_slots` 表中没有任何物理行，写入再读取后无法保持精确 before image。没有角色的账号仍由 `accounts.characterSlotsInitialized` 表达；真实 MySQL 快照不会伪造一个无法往返的全空 roster。

## 迁移、核验与回滚边界

### 只读计划与真实 CLI 形状

真实 CLI 的 fake-MySQL 测试现在返回一个当前 schema 的双角色账号：一个活动角色、一个未激活角色、两条物理 `account_character_slots` 行和两份旧 schema 档案。dry-run 必须：

- 查询 `account_character_slots` 并成功构造两个目标档案；
- 生成确有变更的只读迁移计划，不执行 DDL、DML、事务或备份写入；
- 只输出安全 ID 与计数，不泄露数据库密码或角色中文档案内容。

静态与内存夹具也改为生产形状，覆盖同账号活动/未活动角色切换、跨账号槽、重复角色、槽与档案双向缺失以及未知字段等失败路径。

### 应用与歧义提交

- 备份仍必须先写入并验证，之后才允许打开 writer 和保存候选；
- 来源在备份后发生任何角色槽漂移时，应用在第一次 profile save 前拒绝；
- 迁移 plan digest 绑定包含角色槽的完整候选，篡改槽时间戳会在第一次写入前被拒绝；
- 正常应用后，候选中的 `accountCharacterSlots` 必须与来源完全一致；
- 模糊 COMMIT 仍只能在重新加载并证明整个候选成立时接受；“整个候选”现在明确包含角色槽投影，而不只是迁移后的 profile。

### 验证失败与回滚

应用后若角色槽或其他非目标持久状态不等于已审核候选，验证会 fail closed。回滚仍只恢复本次候选改动的目标档案，不覆盖迁移期间合法并发写入的角色槽、市场配置、家族或 consumed-envelope 账本；目标档案出现第三种状态时仍拒绝覆盖。

## 完整服务端差集

相对 `.run/server_test_classification/r0_f004_full_server_final.tap`，最终结果精确移除以下 13 个失败，新增失败为 0：

```text
an ambiguous save response is accepted only when reload proves the whole candidate
apply refuses source drift after backup and performs no profile save
apply verification covers both changed targets and the non-target persistent projection
apply writes and verifies backup before opening writer, then saves one candidate
batch plan changes only profile payloads and exposes a deterministic safe report
in-memory rehearsal applies, verifies, rolls back, and verifies the before image
real batch CLI defaults to read-only rehearsal without DDL, writes, or backup
rollback accepts an already-restored before image but rejects a third profile state atomically
rollback conflict fails closed without overwriting a third profile state
rollback never deletes ledger entries appended by the migration
rollback restores only candidate profiles and preserves concurrent non-target state
verification failure restores profiles only and preserves concurrent non-target state
writer initialization or reload failure reports the verified backup path
```

当前 48 个稳定失败继续闭合为 `47 个测试夹具漂移 + 1 个已废弃预期`；R0.F013 登记的随机战斗夹具间歇失败本次没有出现，但仍必须按独立任务修复，不能靠复跑视为完成。

## 验证

执行的核心命令：

```sh
node --check server/node/src/auth/profile-migration-batch-ops.js
node --check server/node/test/profile-migration-batch-ops.test.js
node --check server/node/test/mysql-profile-migration-script.test.js
git diff --check
node --test --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f005_target_final_2.tap \
  server/node/test/profile-migration-batch-ops.test.js \
  server/node/test/mysql-profile-migration-script.test.js
node --test --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f005_adjacent_final.tap \
  server/node/test/profile-migrations.test.js \
  server/node/test/profile-migration-backup.test.js \
  server/node/test/profile-migration-batch-ops.test.js \
  server/node/test/mysql-profile-migration-script.test.js \
  server/node/test/auth-storage.test.js
cd server/node
node --test --test-reporter=tap \
  --test-reporter-destination=../../.run/server_test_classification/r0_f005_full_server_final.tap
```

结果：

- Node 语法与 `git diff --check` 通过；
- 目标迁移测试 `19/19 pass`；
- 相邻迁移、备份与存储测试 `82/82 pass`；
- 完整服务端 `1977 tests / 1928 pass / 48 fail / 1 skip`；相对 R0.F004 精确移除 13 项、无新增；
- 唯一 skip 仍是需要 `BEASTBOUND_TEST_VALKEY_PORT` 的真实 Valkey 流测试，本阶段没有隔离端口，保持有理由 skip；
- 所有迁移验证均使用内存、静态或 fake-MySQL 夹具，没有连接真实 MySQL、共享后端或玩家资料，也没有执行真实写入；
- 本阶段没有玩家界面、Godot、输入、地图或每帧热路径变更，因此不需要客户端渲染和性能探针。

本机原始输出保存在忽略目录：

```text
.run/server_test_classification/r0_f005_before_target.tap
.run/server_test_classification/r0_f005_target_final_2.tap
.run/server_test_classification/r0_f005_adjacent_final.tap
.run/server_test_classification/r0_f005_full_server_final.tap
```

## 非目标与剩余风险

- 本阶段不执行生产档案迁移，不操作真实备份、数据库或玩家数据；生产执行仍需单独的变更窗口、已验证备份和回滚批准；
- 本阶段不处理 R0.F006–R0.F013，也没有改动客户端协议、普通玩家玩法、经济、战斗、地图或宠物成长；
- 服务端零失败门禁仍被 48 个稳定失败及 R0.F013 的间歇性夹具风险阻塞；
- 测试 TAP、日志与其他 `.run` 生成状态不进入提交。

下一任务：`R0.F006 AUTO｜升级 shared transaction fake harness 到当前 MySQL 合同`。
