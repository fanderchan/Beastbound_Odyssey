# Phase258：不同档案真实并行与 MySQL 兼容屏障

## 问题与目标

Phase257 的 `profile_conditional_v1` 已经把单档案 mutation 收窄到 binding、profile 和 receipt，并用资源 revision 保证同档案竞争只有一个赢家；但它仍独占并推进 `auth_store_revisions/auth`，所以两个互不相关的角色也必须串行。这能保正确，却不能满足 P0.6d-2b 的目标。

本阶段只解决一个窄问题：让经过明确读集认证的纯档案写不再推进 global revision，不同 `playerId` 可以在数据库事务上真实重叠；同时保证相同 `playerId` 仍只成功一笔，并且不能被仍使用完整 authority root 的 legacy 写覆盖。

完成条件不是“删掉全局锁”，而是同时成立：

- `record_point_save` 的认证档案写走 `profile_conditional_v2`，共享 global compatibility barrier；
- 不同账号、不同角色的 v2 事务可同时持有 shared barrier，并分别提交自己的资源行；
- 相同账号/角色在 binding/profile 行上竞争，陈旧 writer 必须整笔回滚；
- legacy 写继续独占 compatibility barrier，并在任何业务 SQL 前核对完整 binding/profile snapshot；
- Node-local baseline 只推进本次 COMMIT 真正证明的档案资源，不能把陈旧完整 candidate 冒充为最新数据库根；
- COMMIT 响应丢失时，只能用目标 binding、profile 和 receipt 的精确证据恢复，且恢复后吸收数据库中其他档案已经提交的赢家。

## 认证边界：只有 `record_point_save`

`profile_conditional_v2` 不是根据“diff 看起来很小”自动启用。完整根的 write-set 不能证明业务没有读取其他账号、市场、邮件或全局配置，因此服务层必须显式提供：

```text
consistencyScope.kind = row_local_profile_v1
accountId
playerId
operationId
requestHash
actionId
```

当前只有 durable `/profile/action` 的 `record_point_save` 会生成该 scope。planner 还会再次失败关闭地核对：

- binding/profile 都已存在，账号、角色、创建时间和归属没有变化；
- before binding 与 profile revision 相等，after 两者都严格为 `r + 1`；
- 只改变一个 binding、一个 profile，并新增恰好一个 mutation receipt；
- receipt 的 operation ID、request hash、action ID、account ID 与认证 scope 完全一致；
- schema、配置、账号、session、listing、mail、equipment envelope、service event 等其他持久 bucket 均未变化。

缺 scope、scope 不匹配、没有 receipt、多改一个实体，或任何非 `record_point_save` 动作，都回退到 `legacy_global_cas`。这条限制是读集安全边界，不是暂时的 UI 开关；扩展其他动作前必须逐个证明它们只依赖声明的资源。

## S/X 全局兼容屏障

`auth_store_revisions/auth` 不再只承担“所有写都加一”的全局 CAS，也承担新旧事务共存时的 shared/exclusive compatibility barrier：

### `profile_conditional_v2`：shared

```text
BEGIN
→ SELECT auth global revision FOR SHARE
→ 必须等于本 Node 最后确认的 global revision
→ SELECT profile_binding/accountId FOR UPDATE，并核对归属与 revision
→ SELECT profile/playerId FOR UPDATE，并核对归属与 revision
→ 条件 UPDATE binding，affectedRows 必须为 1
→ 条件 UPDATE profile，affectedRows 必须为 1
→ INSERT durable receipt，重复键或非 1 行即失败
→ COMMIT
```

v2 事务不更新 `auth_store_revisions`，COMMIT 后 `globalRevisionAdvanced=false`。多个纯档案 writer 可以同时持有 global shared lock；真正的互斥只发生在相同 binding/profile 资源行。

shared barrier 仍会比较 expected global revision。若此前有 legacy 写推进了 global revision，陈旧 v2 writer 会在任何档案锁或业务写之前以 `mysql_store_revision_conflict` 失败，不能带着旧 session、配置或其他全局事实继续提交。

### `legacy_global_cas`：exclusive

```text
BEGIN
→ SELECT auth global revision FOR UPDATE，并核对 expected revision
→ SELECT 全部 profile_bindings ORDER BY account_id FOR UPDATE
→ 精确核对完整 binding snapshot
→ SELECT 全部 profiles ORDER BY player_id FOR UPDATE
→ 精确核对完整 profile snapshot
→ 执行 legacy 业务 SQL
→ 条件推进 global revision
→ COMMIT
```

legacy 事务取得 exclusive barrier 前必须等待所有已进入的 profile-v2 shared 事务结束。取得后再以固定顺序锁定并核对完整 binding/profile snapshot；只要任一 v2 提交改变了任何档案 revision，legacy 就在第一条业务 SQL 前以 `mysql_resource_revision_conflict` 回滚。这样，即使 v2 没有推进 global revision，陈旧完整根也不能覆盖它。

反方向上，legacy 先提交会推进 global revision；随后取得 shared barrier 的 v2 writer 会在 global expected 校验处失败。两条路径因此形成双向兼容，而不是只保护其中一种提交顺序。

## 固定锁序与失败语义

当前锁序固定为：

```text
global compatibility barrier
→ profile bindings（accountId 顺序）
→ profiles（playerId 顺序）
→ 条件业务写 / receipt
→ legacy 才推进 global revision
```

profile-v2 只锁自己的 binding，再锁自己的 profile。legacy 因尚无认证读集，暂时锁并核对完整 binding snapshot，再锁并核对完整 profile snapshot。资源缺行、身份不符、revision 不符、条件更新 0 行或 receipt 重复，全部是确定性的 `mysql_resource_revision_conflict`；事务必须 ROLLBACK，不能发布 candidate，也不能把冲突当作模糊 COMMIT 成功。

完整 snapshot guard 是正确性过渡方案，不是最终高吞吐设计。它会让 legacy 写的锁持有时间和档案总量相关；只有后续为更多业务建立可信 read-set，才能逐步把它替换成实际资源锁。

## Node-local baseline 与陈旧资源

profile-v2 COMMIT 只证明本次认证的 account binding、player profile 和对应 durable receipt 已提交。`mergeMysqlSaveBaselineAfterCommit` 因此只推进该 writer 已证明的行局部事实，保留其他资源在这个 Node 上原有的已知版本；它不会把请求携带的完整 candidate 标记成新的数据库全局 snapshot，也不会推进该 Node 的 global revision baseline。

这意味着一个 Node 可以连续更新自己刚提交的档案；如果它随后尝试更新另一个已经被其他 Node 改过、但自己尚未 reload 的档案，资源 revision 校验会拒绝旧基线。失败后必须 reload 最新持久根再重建业务意图，不能用旧完整 snapshot 自动重放。

这一设计解决的是“不会丢掉别人的提交”，不是让每个 Node 的内存自动实时看到所有其他 Node 的状态。跨 Node 缓存失效、事件广播、presence、战斗/交易运行态与 WS 路由仍需后续独立合同。

## 模糊 COMMIT 的行局部恢复

连接可能在 MySQL 已 COMMIT 后丢失响应。不同档案现在可以在同一时间提交，因而“reload 后完整根必须等于 candidate”的旧判断会把合法的其他档案赢家误判为本次失败。

`record_point_save` 的行局部恢复使用同一个 `row_local_profile_v1` scope，并要求 reload 后以下三项都与本次 candidate 精确相等：

- 目标 `profileBindings[accountId]`；
- 目标 `profiles[playerId]`；
- 目标 `mutationReceipts[operationId]`，且 operation/request/action/account 四项身份一致。

三项都匹配才把丢失响应认定为已提交；服务随后发布 reload 得到的持久根，所以同一窗口内其他档案的已提交变化也会被保留。receipt 缺失、目标 profile 已被后来提交替换、scope 不完整或非认证动作，都不得恢复成功，玩家不会收到无证据的成功响应。

## 共享 Harness 竞争证据

共享事务 harness 新增 shared/exclusive 主键锁语义：多个 `FOR SHARE` 可共存，排队的 `FOR UPDATE` 必须等所有 shared owner 释放；事务仍保留私有写集、COMMIT 原子应用、ROLLBACK、严格 waiter 事件与泄漏检查。

生产 planner/executor 通过两个独立 `createMysqlAuthStore()` 接入同一 harness，聚焦覆盖：

- A 在 COMMIT apply 前暂停时，不同 profile 的 B 已完成 COMMIT；A 放行后两边档案和 receipt 都保留，global revision 不变；
- 相同 profile 的 B 在 binding 行真实进入 lock wait，A 提交后 B 读到新 revision 并回滚，只有 A 的 receipt 存在；
- 一个 Node 连续推进自己的行局部 baseline 后，用陈旧基线写另一个已变化档案会失败，reload 后重试保留双方赢家；
- profile 先提交时，陈旧 legacy 即使只想写另一档案，也会被完整 snapshot guard 拒绝，且没有执行业务 SQL；
- legacy 先提交时，等待中的 profile writer 在 shared global barrier 读到新 revision，并在资源锁前失败；
- duplicate receipt 发生在 binding/profile 写已暂存之后，最终 committed snapshot 仍整笔回滚。

Harness 证明的是生产代码的锁序、等待和提交语义。它不模拟 InnoDB gap/range lock、deadlock detector、磁盘、网络或真实查询优化器，因此不能代替真实引擎门槛。

## 一次性真实 MySQL 9.7 RR 门槛

`tools/p0_6d_profile_parallel_mysql_gate.mjs` 启动一套完全独立的一次性 MySQL：

- 使用本机 MySQL 9.7 二进制和 `--no-defaults --no-login-paths`，并清空进程继承的 MySQL 密码环境变量；
- 临时 datadir、随机 loopback 非 3306 端口、随机测试 schema；
- `REPEATABLE-READ`、启用 performance schema、关闭 mysqlx 与 binlog；
- 128 MiB InnoDB buffer pool，最多 50 个连接；
- 不读取玩家服配置、凭据、schema 或数据，结束后关闭 mysqld 并删除临时目录。

初始化、CLI、admin 查询、COMMIT gate、store/pool 关闭和 mysqld 停止都有硬超时。失败清理会先释放全部 gate，再等待或强制结束本次临时进程；只有确认该进程已经退出，才删除本次 `mkdtemp` 返回的精确目录，不能通过删掉仍在运行的 datadir 伪造清理成功。

门槛直接运行 production store/planner/executor，并以真实 InnoDB 状态验收：

1. A 在 COMMIT 前暂停时，不同 profile 的 B 必须在 A 放行前提交，证明不是串行脚本假象；两边档案都保留，纯 profile 写不推进 global revision。
2. 两个 writer 修改相同 profile 时，`performance_schema.data_lock_waits` 必须观察到真实行锁等待；放行赢家后只能一笔成功，输家是资源 revision conflict。
3. profile 先、legacy 后时，legacy 必须等待 compatibility barrier，随后被完整 profile snapshot guard 拒绝。
4. legacy 先、profile 后时，profile 必须等待 compatibility barrier，随后因 global revision 已推进而拒绝。
5. 全部 store 关闭后 active transaction 和 active lock wait 都为 0，`Innodb_deadlocks` 增量为 0；mysqld 已退出且临时目录已删除。

这是一次功能与正确性门槛，不是性能测试。128 MiB、单机 loopback、少量固定事务不能得出 QPS、p95、200 人同图容量、多机网络延迟或生产硬件规格结论；运行时 CPU/内存占用也不能作为游戏服容量成绩。正式性能门槛仍需在对应阶段用当前源码、明确负载和独立指标执行。

## 风险与非目标

- 当前只有 `record_point_save` 获得 `row_local_profile_v1` 资格；宠物、背包、货币、战斗结算等动作不能因为也只显示一个 profile diff 就直接复用。
- legacy 完整 binding/profile snapshot guard 偏保守，档案越多成本越高；本阶段接受该成本来保证混合路径正确，不能包装成已完成的并发优化。
- profile-v2 不推进 global revision，因此任何新增 legacy writer 若绕过 exclusive barrier 或 snapshot guard，都会重新引入覆盖风险；所有入口必须继续统一走 production planner/executor。
- Phase257 及更旧的在线 writer 没有完整 profile snapshot guard，不能与 Phase258 writer 连接同一数据库滚动混跑。部署本阶段版本必须先停掉全部旧 Node，再统一启动新版本；后续只有建立显式版本握手/迁移合同后才能讨论滚动升级。
- 本阶段未完成 P0.6d-2c。listing、mail、equipment envelope、市场/邮件跨账号资产、canonical 多资源锁序、deadlock/timeout 与其模糊 COMMIT 对账仍未实现。
- 本阶段不改客户端协议、玩家 UI 或产品数值，也不连接、迁移、清理真实玩家数据库。
- 真实引擎门槛仍在一个进程内用多个独立 store/pool 驱动事务；它证明 InnoDB 锁与隔离语义，不证明多主机部署、跨 Node 事件一致性、故障转移或 200 玩家容量。

## 验收标准

- 无 `row_local_profile_v1` 或 scope/receipt 不一致时，planner 必须回退 legacy；不能靠 diff 猜测读集。
- profile-v2 使用 global `FOR SHARE` 且校验 expected revision，不更新 global revision；legacy 使用 global `FOR UPDATE`、完整 binding/profile snapshot guard 并条件推进 revision。
- 不同 profile 在 shared harness 和一次性真实 MySQL 中都能在 A 未 COMMIT 时让 B 先完成；最终两笔变化和 receipt 均存在。
- 相同 profile 在两类环境中都观察到资源等待，且严格一胜一败，无后写覆盖、无失败 receipt。
- profile/legacy 两种先后顺序都失败关闭，输家在业务写前被 global 或 snapshot guard 拒绝。
- Node-local baseline 不吸收未经本次 COMMIT 证明的其他 profile；陈旧跨档案写失败，reload 后可保留赢家并安全重试。
- 模糊 COMMIT 只有目标 binding/profile/receipt 全部匹配才恢复；恢复发布的根包含同时存在的其他档案赢家，目标或 receipt 错配必须失败。
- 真实门槛确认 MySQL 9.7、`REPEATABLE-READ`、非 3306、非玩家 schema、deadlock 增量 0、活动事务/等待 0 和临时实例清理。
- 文档与结果只宣称“认证纯 profile 数据库事务可并行”，不宣称 listing/mail/envelope 已完成，不宣称性能达标，也不宣称服务已可横向部署。
