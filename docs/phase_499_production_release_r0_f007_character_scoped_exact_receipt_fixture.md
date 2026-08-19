# Phase 499：生产发布 R0.F007 角色作用域精确回执夹具

日期：2026-08-20
任务：`R0.F007 AUTO｜补齐 MySQL 精确回执夹具的角色作用域字段`

## 结论

R0.F007 已完成。`mysql-large-collection-journal.test.js` 的 fake exact-row 现在直接返回服务提交后发布的完整 durable receipt，不再手工重建一个缺少 `scopeKind/playerId/selectionEpoch` 的旧形状；目标文件从 `3/4` 恢复为 `4/4 pass`。

本阶段只修复测试夹具并增加角色作用域断言，没有修改生产服务、MySQL schema、经济规则、客户端协议或玩家行为。完整服务端套件为：

```text
tests       1978
pass        1962
fail        15
cancelled   0
skipped     1
todo        0
duration    70584.293416 ms
```

相对 R0.F006 的 `1978 tests / 1961 pass / 16 fail / 1 skip`，失败数精确减少 1，新增失败为 0。服务端发布门禁仍为 `BLOCKED`，下一游标是 R0.F008。

## 根因

目标场景先用同一个 operation ID 替换一条已过期的 legacy receipt，再模拟另一个 Node 从 MySQL 精确读取已提交行并重放结果。生产服务提交的新 receipt 已按 Phase 378 合同写入：

```text
scopeKind      character
playerId       当前选中角色
selectionEpoch 当前 session 的选角代次
```

旧 fake 在首次提交后却手工拼装 `committedReceipt`，只复制了 legacy receipt 的账号级字段和 response。第二次调用时，本地 published receipt 含角色作用域，而 fake MySQL 的 `document_json` 不含这三个字段；`authorityCurrent` 的严格深比较因此正确判为不一致，服务通过 `storage_read_failed` 失败关闭。

这里不存在生产 SQL 漏列。`mutation_receipts` 的物理镜像列仍是 operation、request、action、account 和提交/过期时间；角色作用域属于完整 `document_json` 合同，并已由 `mysql-durable-receipt-read.test.js` 覆盖规范化和读取。修复没有为测试虚构三列，也没有放宽本地与 MySQL 回执一致性检查。

## 夹具修复

首次 durable commit 后，测试现在先读取真实发布状态并明确断言：

- `scopeKind === "character"`；
- `playerId` 等于当前测试角色；
- `selectionEpoch` 等于当前 session 的服务端选角代次；
- request hash、action、TTL 和 response 仍与首次提交一致。

随后以 `structuredClone(publishedReceipt)` 作为 fake MySQL 已提交文档。这样 exact-row 的六个物理镜像字段和 `document_json` 都来自同一条真实发布回执，不会再由测试重复实现一份容易漂移的 receipt schema。

第二次同 operation ID 调用继续证明：

- 不重复执行业务或写入；
- 只执行一条带 session policy 的 receipt PK 精确读；
- 返回首次提交结果且 `durableCommit.replayed === true`；
- 过期旧行的 DELETE 仍先于新 receipt INSERT；
- SQL 镜像字段或文档损坏仍由相邻 exact-read 测试回滚并 fail closed。

## 验证

执行的核心命令：

```sh
node --check server/node/test/mysql-large-collection-journal.test.js
git diff --check
node --test --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f007_after_target.tap \
  server/node/test/mysql-large-collection-journal.test.js
node --test --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f007_adjacent.tap \
  server/node/test/mysql-large-collection-journal.test.js \
  server/node/test/mysql-durable-receipt-read.test.js \
  server/node/test/durable-mutation-state.test.js \
  server/node/test/auth-durable-commit.test.js \
  server/node/test/auth-shared-asset-read-through.test.js \
  server/node/test/auth-account-characters.test.js \
  server/node/test/auth-storage.test.js
npm --prefix server/node test -- \
  --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f007_full.tap
```

结果：

- 修复前目标文件稳定复现 `4 tests / 3 pass / 1 fail`，失败为 exact replay 的 `storage_read_failed`；
- Node 语法和 `git diff --check` 通过；
- 目标文件 `4/4 pass`；
- 角色槽、receipt 状态、精确读、durable commit、跨节点 shared read 和 MySQL storage 相邻组合 `160/160 pass`；
- 完整服务端 `1978 tests / 1962 pass / 15 fail / 1 skip`，精确消除 R0.F007 的 1 项失败；
- 剩余稳定失败闭合为 `14 个测试夹具漂移 + 1 个已废弃预期`，与 R0.F008–R0.F012 一致；R0.F013 的间歇性战斗夹具本次没有出现，但仍需独立修复；
- 唯一 skip 仍是未配置 `BEASTBOUND_TEST_VALKEY_PORT` 的真实 Valkey 流测试，有既定理由；
- 测试只使用内存状态、fake CLI 和 fake pool，没有连接共享或玩家 MySQL。

本机原始 TAP 输出保存在忽略目录：

```text
.run/server_test_classification/r0_f007_before_target.tap
.run/server_test_classification/r0_f007_after_target.tap
.run/server_test_classification/r0_f007_adjacent.tap
.run/server_test_classification/r0_f007_full.tap
```

## 非目标与剩余风险

- 本阶段不处理 R0.F008–R0.F013，不改变 durable receipt 的生产结构或跨角色幂等规则；
- 完整服务端仍有 15 个稳定失败，R0.05 零失败门禁尚未通过；
- 没有客户端代码或玩家可见行为变化，因此不需要 Godot、Main.tscn 或性能探针；
- TAP 和其他 `.run` 内容是忽略的本地生成物，不进入提交。

下一任务：`R0.F008 AUTO｜补齐 multi-store no-op 夹具的角色槽基线`。
