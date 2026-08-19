# Phase 500：生产发布 R0.F008 multi-store 角色槽基线

日期：2026-08-20
任务：`R0.F008 AUTO｜补齐 multi-store no-op 夹具的角色槽基线`

## 结论

R0.F008 已完成。`mysql-multi-store-concurrency.test.js` 的两个 Node 现在从同一份现行 MySQL 权威基线加载固定四角色槽，不再把 legacy roster bridge 误计为首次 no-op 保存；目标文件从 `9/10` 恢复为 `10/10 pass`。

本阶段只修复测试夹具，没有修改生产 MySQL store、schema、CAS、角色槽兼容逻辑、服务端业务或客户端行为。完整服务端套件为：

```text
tests       1978
pass        1963
fail        14
cancelled   0
skipped     1
todo        0
duration    71238.017292 ms
```

相对 R0.F007 的 `1978 tests / 1962 pass / 15 fail / 1 skip`，失败数精确减少 1，新增失败为 0。服务端发布门禁仍为 `BLOCKED`，下一游标是 R0.F009。

## 根因

multi-store 场景希望证明下面的顺序：

1. Node A 与 Node B 同时加载 store revision 0 的同一完整根；
2. Node A 保存原对象是真正 no-op，不开 pool、不加锁、不推进 revision；
3. Node A 提交变化后，仍持有 revision 0 的 Node B 在全局锁后、任何业务 SQL 前冲突并回滚；
4. Node B reload 赢家根后可以基于新 revision 提交。

旧 fake loader 只返回 `profile_bindings` 和 `profiles`，并把 `account_character_slots` 表报告为不存在。生产 store 会把返回给调用方的 legacy 单角色 binding 桥接到槽 0，但内部持久化 baseline 故意保留数据库真实形状。于是 `saveAsync(loadedA)` 正确识别出“数据库缺少槽位行”，执行角色槽 INSERT 并将 store revision 从 0 推到 1；测试随后在 `shared.events.length === 0` 处得到 `4 !== 0`，尚未进入预期的陈旧 Node CAS 路径。

这不是生产 no-op 或 CAS 回归，而是并发夹具把 legacy 数据迁移与现行完整基线混在了同一场景。

## 夹具修复

fake MySQL 现在按当前物理合同：

- 对 `auth_store_revisions` 和 `account_character_slots` 两张实际存在的表返回存在；
- 返回 `acc_multi_store/0` 的规范角色槽行，包含 schema、账号、槽序号、player ID、创建/更新时间和 `lastSelectedAt`；
- 继续让与本测试无关的可选表保持不存在，不扩大 fake 能力范围；
- 明确断言两个独立 store 均加载 `[player_multi_store, null, null, null]`；
- 明确断言 RR loader SQL 包含角色槽读取。

原有关键断言保持不变：首次保存的 pool event 和 query 都是 0，revision 保持 0；Node A 提交后 Node B 只执行全局 `FOR UPDATE` 就以 expected 0 / actual 1 回滚，不执行 profile 或 receipt 业务 SQL；reload 后 Node B 保留 Node A 赢家变化并成功提交。

legacy 兼容没有被删除或伪装为 no-op。独立的 `auth-storage.test.js` 用例 `mysql store bridges a legacy profile binding into slot zero and persists it once` 继续使用真实缺槽基线，验证只 INSERT 一次槽 0、第二次保存 no-op，且不重写 binding/profile。

## 验证

执行的核心命令：

```sh
node --check server/node/test/mysql-multi-store-concurrency.test.js
git diff --check
node --test --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f008_after_target.tap \
  server/node/test/mysql-multi-store-concurrency.test.js
node --test --test-concurrency=1 --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f008_adjacent.tap \
  server/node/test/mysql-multi-store-concurrency.test.js \
  server/node/test/auth-storage.test.js \
  server/node/test/auth-durable-commit.test.js \
  server/node/test/mysql-large-collection-journal.test.js \
  server/node/test/mysql-profile-conditional-save.test.js \
  server/node/test/mysql-shared-transaction-integration.test.js
npm --prefix server/node test -- \
  --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f008_full.tap
```

结果：

- 修复前目标文件稳定复现 `10 tests / 9 pass / 1 fail`，首个 no-op 断言实际观察到 4 个事务事件；
- Node 语法和 `git diff --check` 通过；
- 目标文件 `10/10 pass`；
- storage、multi-store、durable commit、large journal、profile conditional save 和 shared transaction 串行相邻组合 `184/184 pass`；
- 相邻 TAP 明确包含当前 no-op、legacy bridge once 和 stale second store 三项通过证据；
- 完整服务端 `1978 tests / 1963 pass / 14 fail / 1 skip`，精确消除 R0.F008 的 1 项失败；
- 剩余稳定失败闭合为 `13 个测试夹具漂移 + 1 个已废弃预期`，与 R0.F009–R0.F012 一致；R0.F013 的间歇性战斗夹具本次没有出现，但仍需独立修复；
- 唯一 skip 仍是未配置 `BEASTBOUND_TEST_VALKEY_PORT` 的真实 Valkey 流测试，有既定理由；
- 全部验证使用临时 fake MySQL CLI、recording pool 和内存状态，没有连接共享或玩家 MySQL。

本机原始 TAP 输出保存在忽略目录：

```text
.run/server_test_classification/r0_f008_before_target.tap
.run/server_test_classification/r0_f008_after_target.tap
.run/server_test_classification/r0_f008_adjacent.tap
.run/server_test_classification/r0_f008_full.tap
```

## 非目标与剩余风险

- 本阶段不处理 R0.F009–R0.F013，不改变生产 CAS、角色槽迁移或玩家规则；
- fake pool 证明事务装配和冲突边界，不替代真实 MySQL 多节点吞吐与锁等待证据；
- 完整服务端仍有 14 个稳定失败，R0.05 零失败门禁尚未通过；
- 没有客户端代码或玩家可见行为变化，因此不需要 Godot、Main.tscn 或性能探针；
- TAP 和其他 `.run` 内容是忽略的本地生成物，不进入提交。

下一任务：`R0.F009 AUTO｜重建三项战斗测试的服务端权威遭遇夹具`。
