# Phase257：单档案 MySQL 条件写与共享事务 Harness

## 目标

P0.6d-1 的全局 `auth_store_revisions/auth` 行锁已经能阻止两个 Node 用旧完整根互相覆盖，但所有持久写仍被同一行串行化。Phase257 先完成 P0.6d-2a：不提前解除全局围栏，只为“一个既有账号绑定的一个既有角色档案”建立资源锁、条件更新、`affectedRows` 和共享内存 harness 事务竞争测试基础。

这一步优先保护玩家资产正确性。只有后续证明不同档案能在不丢失其他 Node 已提交变化的前提下并行，才允许移除 profile 路径的全局围栏。

## Beastbound 规则

正式客户端的 `/profile/action` 只提交业务意图与 Idempotency-Key。服务端完成动作后，正常候选根只改变：

- 一个 `profileBindings[accountId]`；
- 一个 `profiles[playerId]`；
- 至多新增一个不可改写的 `mutationReceipts[operationId]`。

首个代表动作选择 `record_point_save`。它不新增其他实体、不发服务事件，也没有宠物、背包、任务或随机结算分支，适合验证存储并发语义。客户端仍不提交 expected revision；expected revision 只来自服务端最后一次确认 COMMIT 的 MySQL baseline。

## Planner 合同

异步 MySQL 保存统一先生成三类计划：

```text
noop
profile_conditional_v1
legacy_global_cas
```

`profile_conditional_v1` 只接受以下全部条件：

- binding/profile 都是同一既有账号与角色，禁止创建、删除、换绑；
- 两个 before revision 都是同一个安全整数 `r`；
- 两个 after revision 都严格为 `r + 1`，且 after `updatedAt` 相同；
- 恰好一个 binding 与一个 profile 发生变化；
- 根 schema、市场配置、离线挂机配置、service event 高水位和 journal 均不变；
- receipt delta 没有删除，且只允许 0 或 1 条新 INSERT；新 receipt 必须属于该账号；
- listing、mail、envelope、account/session、家族、战斗记录等任何其他持久 bucket 都不变。

任一条件不满足都保留原有 `legacy_global_cas`，不能用宽松猜测进入快路径。

## SQL 与提交顺序

本阶段事务仍按以下顺序执行：

```text
BEGIN
→ SELECT auth_store_revisions/auth FOR UPDATE
→ 校验 global expected revision
→ SELECT profile_bindings/accountId FOR UPDATE
→ SELECT profiles/playerId FOR UPDATE
→ UPDATE profile_bindings ... WHERE account_id/player_id/profile_revision=r
→ UPDATE profiles ... WHERE player_id/account_id/profile_revision=r
→ 可选 plain INSERT mutation_receipts
→ UPDATE auth_store_revisions ... WHERE revision=expected
→ COMMIT
```

两个资源 UPDATE 和 receipt INSERT 都要求 `affectedRows === 1`。锁行缺失、身份/revision 不匹配、0 行更新或重复 operation ID 都产生确定性的 `mysql_resource_revision_conflict` 并整笔 ROLLBACK；异步 wrapper 不把这种冲突误判为模糊 COMMIT，也不执行昂贵的全根相等恢复。

profile/binding/receipt 的资源锁与业务写全部使用 mysql2 参数，不把账号、角色、档案 JSON 或回执拼进 SQL 字符串；global revision CAS 只内插服务端已校验过的安全整数。profile binding 始终先于 profile；后续跨资源事务必须延续固定 canonical lock order。

## `server_state` 热点收窄

旧 `server_state.document_json.counts` 从未被 loader 恢复，也不是可靠数据库总数：战斗历史只含热窗口、party invite 为运行态，而运维状态本来就直接查询实体表。若每个新 receipt 都把 `counts.mutationReceipts` 写回同一行，不同玩家即使将来拆掉全局 revision，仍会被这个诊断字段重新串行化，而且两个旧 snapshot 都可能写成同一个 `N + 1`。

Phase257 正式让这些诊断 count 退出 `server_state`。该行只保留：

- `schemaVersion` 与 `storage` marker；
- `marketConfig`；
- `offlineHangConfig`；
- 既有 `serviceEventSeq` 字段。

新库或旧 legacy state 第一次真实保存会原子写一次 entity-state marker；后续普通实体数量变化不再触碰共享行。旧 row 中已有的 `counts` 不在在线启动时绕过 CAS 清理，下一次真实配置/序号更新会自然覆盖。运维统计改为按实体表或有效账本读取。

## 共享事务 Harness

新增的测试 harness 使用多个独立 pool/connection 共享一个 committed 数据库模型，提供：

- 主键等值 `SELECT ... FOR UPDATE` 与严格 FIFO waiter；
- COMMIT 前事务私有写集、read-your-writes 和外部不可见；
- 条件 update/delete 的真实 `affectedRows=0/1`；
- 原子 COMMIT、整笔 ROLLBACK；
- COMMIT apply 前失败与 apply 后响应丢失；
- 确定性 gate/event wait，不用 sleep 猜竞争；
- 未建模 SQL 默认拒绝和事务/锁/连接泄漏检查。

两个生产 `createMysqlAuthStore()` 实例运行在同一个 shared harness 上并从 revision 0 加载：A 在 COMMIT apply 前暂停，B 在 harness 中实际等待 `auth_store_revisions/auth`；放行 A 后，B 读取 revision 1，并在任何 profile/receipt SQL 前回滚。最终只存在 A 的 binding、profile、receipt 与全局 revision 变化。该用例验证生产 planner/executor 的竞争语义，不等同于真实 MySQL 引擎隔离测试。

## 非目标与剩余风险

- 全局 revision 围栏仍保留，所以本阶段没有提升多 Node 写吞吐，也没有证明不同 profile 已能并行。
- 不同 Node 的完整内存 baseline、service event、presence、战斗/交易运行态与 WS 路由仍未合并；不能据此横向部署。
- listing、mail、equipment envelope、跨账号交易及 canonical 多行锁顺序仍属于 P0.6d-2 后续切片。
- 当前条件计划资格判断仍先经过通用 bucket diff，并再次核对 binding/profile map；工作量仍会随账号/档案数增长。200 档案门槛已通过，但 P0.6d-2b 不能把它当作无限规模结论，应结合资源 dirty metadata/baseline 失效设计消除重复全表对象扫描。
- Harness 只模拟目标主键等值锁，不冒充 InnoDB gap/range lock、deadlock detector 或真实网络/I/O 延迟。
- 本阶段没有连接、迁移或清理本机玩家 MySQL，也没有修改客户端协议或玩家 UI。

## 验收

- planner/executor 聚焦用例覆盖严格资格、schema/config/event/多资源/回执清理回退、锁行不匹配、两条 UPDATE 0 行、回执重复/0 行与 stale global fence。
- harness 自测覆盖 FIFO、私有写集、条件更新、原子回滚以及 COMMIT 前后两类故障。
- 两个生产 store 的 gate 驱动竞争证明 waiter 真正等待，并在锁移交后读取最新 committed revision；败方随后从动态 loader 读到赢家档案并以新 revision 安全重试。
- duplicate receipt 在生产 executor + shared harness 中发生于 binding/profile 已暂存之后，最终 committed snapshot 必须证明三者整笔回滚。
- storage、multi-store、durable commit、profile action 和大集合 journal 的受影响回归通过；不运行与本切片无关的全量本地 CI。

完成 Phase257 仍不能勾选整个 P0.6d-2。下一步是只对 profile 路径解决跨 Node baseline 合并/失效后，证明不同 playerId 可并行、同 playerId 只能成功一次，再考虑移除该路径的 global fence。

## 实际验证（2026-07-14）

- 最终相关串行回归 `150/150` 通过；其中条件 profile 聚焦回归 `25/25`，shared harness + 生产 store 实例集成 `9/9`。
- 200 profiles、20,000 receipts、100,000 tombstones 的 production planner + recording pool gate 通过：MySQL transaction p95 `0.389ms`，最多 `4` 条业务 SQL、含 global fence 最多 `6` 条，历史容器 `Object.keys` 扫描 `0`；heap delta `0.050MiB`。
- 所有数据库竞争使用内存 shared harness、临时 fake loader 与 recording pool，`realMysql=false`；没有读取或写入本机玩家库，也没有把 fake 锁延迟外推为真实 MySQL 吞吐。
