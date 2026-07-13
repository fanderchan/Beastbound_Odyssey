# Phase256：P0.6d 多 Node MySQL CAS 与资源行锁

## 问题复现

Phase255 之前只保证一个 Node 内的 durable coordinator 串行，并在本次 MySQL COMMIT 后才发布 candidate。每个 `createMysqlAuthStore()` 仍各自持有进程内 `lastPersistentData`；数据库没有全局 revision、`SELECT ... FOR UPDATE` 或 expected-revision 条件。

聚焦复现让 Node A、B 同时从 store revision 0 和同一 profile revision 1 载入：A 先把石币 100 改为 90 并提交，B 随后用旧根把 profile 写回另一份 revision 2。修复前 B 也成功，测试报 `Missing expected rejection`；两个事务都 COMMIT，后写者可覆盖先写者，而两边玩家都收到成功。这会进一步形成市场双买、邮件双领、不同 operation ID 重复消费或“两个成功回执只剩一个最终资产根”。

## 分段目标

### P0.6d-1 全局正确性围栏

- 新增独立单行表 `auth_store_revisions(scope_key, revision)`；live schema 在可写启动时幂等创建并 seed `auth=0`，不修改早期 `database/mysql/001_auth_schema.sql`。
- loader 在同一 `REPEATABLE READ` 事务里先读取 store revision，再读取全部实体；revision 只作为 store 私有 metadata，不进入玩家存档、authority root、HTTP、WS 或客户端协议。
- 默认在线 mysql2 pool 写入必须：`BEGIN → SELECT revision ... FOR UPDATE → 比对 expected → 业务 SQL → 条件 UPDATE revision → COMMIT`。旧 revision 在任何 profile/receipt/listing/mail SQL 之前整笔 rollback。
- COMMIT 返回后才能推进本进程的 diff baseline 和 revision。no-op 不加锁、不增加 revision；失败 candidate、receipt、事件和 runtime side effect 均不可发布。
- typed `mysql_store_revision_conflict` 是内部存储错误，不让客户端提供或伪造 revision。async wrapper 不得把确定性 CAS 冲突误走“模糊 COMMIT 全根相等”恢复；下一次同一业务意图先 reload 赢家根，再重新执行或命中 durable receipt。
- 同步 mysql CLI 写入不是在线多 Node 通道。只有显式 `singleWriterMaintenance` 的停服迁移/本地 GM 运维可用，并在同一维护事务里推进 revision；默认玩家服继续走 mysql2 pool。
- Godot 只补 profile response 的 revision 单调保护：晚到的低 revision payload/summary 被视为已由更新结果覆盖，不得把当前档案倒退；不新增 CAS 参数、错误码、协议或 UI。

### P0.6d-2 细粒度资源并发

全局 revision 只解决安全，会让不同账号的无关写也互相冲突。本阶段后续必须建立共享事务 harness，并按固定表序、主键排序锁定实际 touched resources：

- profile/profile binding 使用现有 `profile_revision` 条件更新；
- listing 的购买/取消锁 listing 与买卖双方 profile；
- mail 领取/已读锁 mail 与收件人 profile；
- equipment envelope 的 market/mail/bank 流转锁父资源，未存在的新墓碑继续由唯一键 INSERT 仲裁；
- receipt、listing、mail、DELETE/UPDATE 全部检查 `affectedRows`，不能让 0 行结果继续发资产；
- 两账号交易、邮件/市场跨账号写按 canonical lock order，覆盖 deadlock、timeout、失败重做、同/异 operation ID 和 ambiguous COMMIT。

只有不同 profile/listing/mail/envelope 可以真正并行、相同资源仍只成功一次，并且竞争门槛通过后，才可完成 P0.6d。global fence 在所有领域拆完前不得移除。

## 全局 CAS 事务合同

```text
锁外：从本进程已确认 baseline 构建 exact touched-row diff
→ getConnection / BEGIN
→ SELECT revision AS storeRevision
    FROM auth_store_revisions
    WHERE scope_key='auth' FOR UPDATE
→ actual != expected：typed conflict / ROLLBACK / 0 条业务 SQL
→ 执行现有业务 delta SQL
→ UPDATE auth_store_revisions
    SET revision=revision+1
    WHERE scope_key='auth' AND revision=expected
→ affectedRows 必须为 1
→ COMMIT
→ 本进程 baseline/revision 前进并发布 candidate
```

第二个事务会在 revision 行锁上等待，首笔 COMMIT 后读到新 revision，再于业务 SQL 前拒绝。末尾条件 UPDATE 是防御性 CAS。revision 缺行、负数、非安全整数或 `affectedRows != 1` 都失败关闭。

加载使用 `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ` 与 `autocommit=0`；第一条一致性读建立 snapshot，revision 和所有实体必须来自同一时代，末尾 COMMIT。不能把 revision 与多条 autocommit entity SELECT 分开读取。

## 重试、随机性与客户端边界

- 客户端继续只提交业务意图与既有 Idempotency-Key，不发送 global/profile expected revision。
- 第一次 CAS 冲突返回现有安全的存储暂不可用语义；candidate 未发布。下一次同 key 请求先 reload，再按权威新根重算。不得自动重放旧完整 snapshot。
- 宠物成长、转生、掉落等随机业务后续若做服务端内部自动重算，必须让一次 operation 的私有随机事实不可被多次试抽；相关前置事实已变化时应返回正常业务冲突，而不是重新抽到满意结果。
- Godot `server_profile_sync_expected_revision` 只能单调不降。低 revision 直接响应仍视为请求成功，但忽略其中旧 profile，并保留当前公开缓存和 summary。

## 部署与兼容

- 旧 writer 不会读取或推进 `auth_store_revisions`，所以新旧版本不能滚动混写。部署顺序必须是：停止全部旧 writer → 备份 → 单次 schema/seed → 启动全部新 writer → 验证 revision 与业务写。
- 显式停服维护工具可继续同步 CLI 写，但必须标记 `singleWriterMaintenance`；该模式不提供并发保护，运行时若仍有玩家 writer 就属于操作错误。
- global CAS 不解决陈旧只读缓存、Node-local service event sequence、presence revision、battle/trade/runtime state 或跨 Node WS 路由。细粒度数据库锁完成后仍不能直接宣称可横向部署；revision watcher/owner routing 与跨 Node event/presence 合同必须另有证据。
- 本阶段不连接、不迁移、不清理真实 MySQL 或玩家数据。schema、锁、提交和冲突全部先用 fake/shared transaction harness 验证；真实引擎竞争只能在一次性隔离 MySQL schema 中验收。

## 验收矩阵

- 两 store 同 revision：仅一笔成功；loser 有 begin/lock/rollback，且 0 条业务 SQL；revision 精确 +1。
- loser reload 后从赢家根重建业务意图，可提交 revision +2，并保留赢家变化。
- revision row 缺失/非法、条件 UPDATE 0 行、query/commit 前失败均不推进 baseline，不发布 candidate。
- async wrapper 对确定性 CAS conflict 不运行 ambiguous full-root equality；service 下一次请求只 reload 一次并保留赢家根。
- loader 的 revision SELECT 位于 profile/entity SELECT 之前且共享一个 RR snapshot。
- 同步维护写默认拒绝；显式维护模式推进 revision，相关迁移/GM 工具继续通过停服与备份门槛。
- Godot 低 revision payload/summary 不覆盖新 profile；相同/更高 revision、非法 future profile、面板 deferred pull 保持既有行为。
- `auth-storage`、`auth-durable-commit`、large collection journal、容量 recording pool 与协议/客户端 focused checks 无回归。
- P0.6d-1 至少重跑 120 秒单 Node quick capacity gate；完成 P0.6d 全部细粒度锁后再重跑 30 分钟正式门槛。global fence 本身不能被包装成多 Node 吞吐结论。

## 预计涉及文件

- `server/node/src/mysql-store.js`、`auth-service.js`、`http-server.js`；
- `server/node/scripts/migrate-local-userdata-to-mysql.js`、`migrate-mysql-profiles.js`、`local-qa-gm-account.js`、`mysql-live-smoke.js`；
- `server/node/test/mysql-multi-store-concurrency.test.js`、storage/durable/journal tests 与后续 shared transaction harness；
- `client/godot/scripts/net/server_sync_coordinator.gd` 和最近的 profile sync auto check；
- P0.6 capacity/journal recording tools、本文与 `stoneage_gap_plan.md`。

## P0.6d-1 实际实现（2026-07-13）

### 从红测到全局围栏

修复前先用两个独立 `createMysqlAuthStore()` 实例载入同一 revision 0：A 提交扣币后，B 仍能从旧根提交，聚焦测试以 `Missing expected rejection` 失败。修复后 live schema 幂等创建并 seed `auth_store_revisions/auth=0`；可写 loader 在同一 RR snapshot 中先读 revision，再读实体。两个 store 都只保存自己最后一次确认 COMMIT 的 baseline/revision。

默认玩家服务器在 `createDefaultStore()` 明确强制 mysql2 pool，即使配置了 `BEASTBOUND_MYSQL_BIN` 或尝试关闭 pool，也不会静默退化成异步 CLI writer。可写 pool 在 `ensureSchema:false`、版本表缺失、版本行缺失或非法 revision 时均失败关闭。在线 `saveAsync/saveAsyncOwned` 不再具有 CLI 分支；同步 `save()` 只有显式 `singleWriterMaintenance` 才能执行，并且版本行必须存在。

pool 事务按本文合同执行。旧 store 在 `FOR UPDATE` 后发现 revision 已变化时，在 0 条业务 SQL 的位置 rollback；revision 条件 UPDATE 为 0 行、业务 query 失败或 COMMIT 未确认时，本地 baseline/revision 都不前进，同 candidate 会重新构造并执行完整事务。确定性 `mysql_store_revision_conflict` 不进入 ambiguous full-root equality；失败 candidate 不发布，下一次 durable 请求先 reload 赢家根再重算业务意图。

停服工具边界同时收紧：批量档案迁移继续要求维护确认，本地 GM 工具继续实际检查后端已停止；单账号 userdata 导入新增 `--maintenance-confirmed`，缺少确认会在创建 writer 前拒绝。MySQL live smoke 改成只读取得快照后在隔离内存服务验证登录，不再为了 smoke 改真实 session。

客户端不接触 global revision。Godot 只把服务端 `profileRevision` 保持单调：当前 revision 已大于 0 时，晚到的 revision 1、revision 0 或缺失 revision payload/summary 都保留当前 profile；相等与更高 revision 继续正常应用。顺带修复 Godot CLI 即使输出 Parse/Compile Error 仍可能 exit 0 的测试假绿，runner 现在把明确编译诊断标为 `compile_error`。

### 已验证边界与未完成项

聚焦 fake transaction tests 覆盖：schema/seed、RR 加载顺序、no-op 0 连接、旧根 0 业务 SQL、reload 后保留赢家变化、条件 UPDATE 0 行、COMMIT 失败、非法 revision、缺行、同步维护、异步 CLI 拒绝、wrapper/service 重载。所有验证只使用临时 fake MySQL CLI、shared recording pool、loopback HTTP/WS 和临时 Godot userdata；没有连接、迁移或清理真实 MySQL/玩家数据。

这仍不等于真实 MySQL 行锁竞争或多 Node 吞吐证据。当前全局 revision 会串行化所有持久写，而且 Node-local event sequence、presence、runtime battle/trade 与跨 Node WS 路由仍未解决。P0.6d-2 必须完成 profile/listing/mail/envelope 细粒度锁与共享竞争 harness；之后才重跑当前源码的 30 分钟正式门槛并讨论横向部署。

### 验证证据

- 服务端定向回归：`node --test --test-concurrency=1` 串行运行 storage、multi-store、durable commit、large journal、三类维护脚本与 health，共 `113/113` 通过。新 multi-store 文件单独 `8/8`，覆盖旧根、zero-row CAS、COMMIT 失败、非法/缺失 revision、schema seed、CLI 边界、wrapper 和 service reload。
- Godot：4.7 headless parse 与 `--auto-server-profile-sync-check` 共 `2/2`；低 revision 1、revision 0、缺失、相等和更高 revision 均由同一真实入口检查。runner 自测 `3/3`，确认 exit 0 的 parse/dependent compile/load compilation error 都会失败。
- 大集合 MySQL planner：200 profiles、2 万 receipt、10 万 tombstone，20 次样本 p95 `0.386ms`；历史集合 `Object.keys=0`，业务 SQL 最多 5 条，加全局 revision lock/update 后总计最多 7 条，heap delta `-0.032MiB`。
- 容量工具自测 `30/30`。最终报告 `.run/p0_6d_global_cas_quick120_final.json` 与起止源码指纹一致，120 秒 quick gate 为 `qualified=true`：200/200 客户端最终在线；event-loop p95/p99/max `18.219/29.819/34.570ms`；heap 增长 `13.111MiB`、采样峰值 RSS 相对稳态 `+140.438MiB`；501/501 transaction COMMIT、0 rollback、store save p95/p99/max `12.026/12.853/26.459ms`，最多 32 条总 statement/31 touched rows；durable accepted/completed `1585/1585`、最终 pending 0；120/120 资产响应均不早于对应 COMMIT；50 人快速掉线风暴排除 jitter 后恢复 p95/max `51.304/68.671ms`；worker 退出、端口关闭、fixture 删除全部通过，环境有效且无 warning/failure。
- quick gate 使用 production planner + recording fake pool，明确 `realMysql=false`。它证明新增固定 CAS SQL 没破坏单 Node 200 客户端基线，不证明真实 MySQL 锁等待、多 Node 吞吐、公网/反代或横向部署。没有运行全 local CI，也没有触碰真实玩家数据库。
