# Phase 268：普通市场上架权威读穿与有界容量事务

## 目标

本阶段完成 `P0.6d-2c-6`，只解决市场上架的跨 Node 正确性和事务边界：

- 陈旧 Node 不能因为本地仍保留 120 条全市场挂单或当前卖家 20 条挂单而永久返回假失败；
- 两个 Node 同时上架时，数据库最终不能超过全市场 120 条或单卖家 20 条；
- 普通 `schemaVersion=1` 物品上架不再锁定并比较完整 profile 根；
- 装备上架和教学即时成交继续保留原有玩法、资产与 legacy 边界；
- 挂单扣物、挂单行和 durable receipt 必须同一事务提交或同一事务回滚。

本阶段不改变价格、币种、绑定物限制、上架扣物、成交收税、教学任务、装备信封或玩家可见文案。

## 权威读穿

`createMarketListing` 在执行业务校验前复用 `market_read`：

1. 在 MySQL `REPEATABLE READ` 事务中读取当前 `auth` revision；
2. 读取最多 120 条的完整市场簿、相关账号、操作者 binding/profile、市场配置和本次引用的装备信封墓碑；
3. 认证 SQL 镜像列、JSON 身份和 profile revision；
4. 以 `adopt=true` 更新当前 Node 的 store/service 基线后，再判断 120/20、物品数量和挂单内容。

读取失败或 global revision 漂移时必须失败关闭或完整 reload，不能回退陈旧内存。共享刷新若因完整 reload 带回同 operation 的活动 receipt，会先做 O(1) 本地重放；健康的普通上架保持 0 次精确 receipt 查询。

## 普通上架条件事务

只有同时满足以下条件的成功请求才签发 `row_local_market_create_v1`：

- 最终只新增一个普通 `schemaVersion=1` 挂单，且既有挂单逐条不变；
- 只修改操作者自己的 binding/profile，revision 严格 `r → r+1`；
- 只追加一个与 account、operation、request hash、action 完全匹配的 immutable receipt；
- 挂单只有八个既定字段，不是装备目录物品，也没有教学即时成交邮件；
- scope 中的已观察总数、卖家数量和 120/20 上限与候选及共享常量完全一致。

任一条件不成立都不会猜测较宽读集，而是回退 legacy。

条件事务固定顺序为：

```text
auth_store_revisions/auth FOR SHARE + expected revision
→ actor profile_binding FOR UPDATE
→ actor profile FOR UPDATE
→ auth_store_revisions/market_create_capacity FOR UPDATE
→ live COUNT(*) + SUM(seller_account_id = actor)
→ profile_binding conditional UPDATE
→ profile conditional UPDATE
→ market_listings plain INSERT
→ mutation_receipts plain INSERT
→ COMMIT
```

容量守卫行只充当项目内的事务互斥量，revision 固定为 0，不推进全局 revision。等待者取得守卫后才执行本事务的首次普通一致性读，因此在 RR 下能看到前一位守卫持有者的已提交挂单；在 RC 下同样读取当时已提交结果。总量查询最多面对玩法允许的 120 行，避免范围锁、`INSERT ... SELECT` 和整表 `FOR UPDATE`。

检查顺序保持原产品语义：卖家已经 20 条时先返回 `market_listing_limit`，否则全市场已经 120 条时返回 `market_full`。两类错误都发生在任何业务写之前，标记为明确未提交并完整回滚。

## legacy 单挂单新增兼容保护

总审复现了一个不能只靠 global SHARE/EXCLUSIVE 解决的竞态：

1. 普通条件事务基于 119 条创建并提交第 120 条，但不推进 global revision；
2. 已经基于旧 119 条生成候选的装备或无 scope legacy 上架随后取得 global EXCLUSIVE；
3. 若 legacy 只重验 profile，它仍可能继续插入第 121 条。

因此，任何最终“精确新增一条挂单”的 `legacy_global_cas` 计划也必须附加同一个容量守卫和实时聚合检查。它仍保持原有 global EXCLUSIVE、完整 profile snapshot guard、装备/回执/其他宽写集和 global revision CAS，只在所有既有资源锁之后、第一条业务 SQL 之前重算容量。教学流程最终不保留挂单，不增加该守卫；多挂单初始化也不冒充玩家单条上架。

legacy 计划在申请连接前还会认证：plain INSERT 数量、无 listing DELETE、canonical seller、守卫 SQL/行/顺序、聚合 SQL、120/20 阈值与 seller 参数。缺失或篡改全部失败关闭。实际旧二进制仍按 Phase258 的部署合同先排空再统一升级，不能与本版本滚动混写。

## 身份、回执与恢复

- 挂单和 receipt 都使用 plain INSERT；重复 listing ID 或 operation ID 会让此前暂存的档案和扣物整笔回滚。
- 容量失败前会用原 operation 精确核对 receipt，避免另一 Node 已提交同一操作时错误返回“市场已满”。
- COMMIT 结果模糊时仍只接受同 account/hash/action 的 exact receipt 和 scoped authority reload，不能用完整根恰好相等猜成功。
- COMMIT 后 Node-local baseline 只合并本次 binding/profile、新挂单和 receipt；其他 Node 的挂单继续保留在本 Node 已知基线，不能用请求候选覆盖数据库全局事实。

## 数据库与性能边界

- 没有执行 `SET GLOBAL`、`SET PERSIST`、配置文件修改或数据库重启；共享 MySQL 的全局锁等待和隔离配置不变。
- 继续复用 Phase264 的 Beastbound Session-only `innodb_lock_wait_timeout=3`、`lock_wait_timeout=5` 与事务 hard deadline。
- 新热点只影响上架创建；购买和取消只会减少挂单数量，不需要取得容量守卫。
- 全市场最多 120 行，实时聚合是有界查询；未来若增加玩家批量上架，必须另行设计 delta-aware 容量合同，不能复用当前单新增证明。
- 正式运行与发行门槛仍要求并校验 `REPEATABLE READ`；算法在 `READ COMMITTED` 下仍安全，但本阶段不把它列为已支持发行配置，`READ UNCOMMITTED` 不受支持。

## 验证

定向验证全部通过，未运行完整本地 CI：

- 服务读穿、回执和经济规则：`130/130`；
- create/cancel/buy/mail/profile planner、锁序、multi-store 与事务期限：`153/153`；
- 存储 schema/strict identity 与 shared mixed transaction：`66/66`；
- `git diff --check` 和所有修改 JS/MJS 的 `node --check` 通过。

一次性隔离 MySQL 9.7.0-er2 / `REPEATABLE-READ` 门槛使用随机非 3306 端口、128 MiB buffer pool 和非玩家 schema，证明：

- 118 条时两个不同卖家在容量守卫处串行，两笔都成功，最终恰好 120；
- 119 条时只有一笔成功，另一笔 `market_full`，失败方 profile、物品、挂单和 receipt 均未写入；
- 双数据库 loader/target 场景让 legacy writer 持有“未来正确 profile + 旧 119 条市场”基线，它真实等待普通事务的 auth SHARE，随后通过完整 profile guard、在 live count 读到 120 并于第一条业务 SQL 前回滚；
- 主证据 schema 仍为 global revision 6、23 条既有 receipt；市场创建 schema 的 global revision 与容量 guard revision 均保持预期；
- 两个 schema 的 `deadlockDelta=0`，结束后 active transaction/lock wait 均为 0；
- 一次性 mysqld、datadir 和门槛进程全部清理，未读取外部 MySQL 密码，未连接共享玩家库。

## 非目标与后续

- 装备上架仍是 legacy global 事务，只共享容量保护；本阶段不宣称装备路径已经达到细粒度吞吐。
- 教学即时成交仍按原逻辑完成任务并生成邮件，不进入普通条件 planner。
- 当前没有玩家运行时批量新增多条挂单接口；未来增加时必须为总量和每卖家 delta 单独认证。
- 跨 Node event/presence/WS 路由和长时多 Node soak 仍留在 `P0.6d` 父项。
- 下一项 `P0.6d-2c-7` 是纯文本/普通附件邮件发送条件事务；装备邮件继续独立审计。
