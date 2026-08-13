# Phase 424：通用 planner touched-set 与组合容量门槛

## 目标与红灯

本阶段完成 `P0.6d-2c-12d`。此前 MySQL planner 即使只修改一个玩家档案或一条普通挂单，也会在生成 SQL 时重新枚举完整 `accounts`、`sessions`、`profileBindings`、`profiles` 与 `marketListings`；四角色槽还会先展开所有账号的完整名册。普通市场上架的容量认证随后又单独遍历一次全部挂单，按卖家重新计数。邮箱、回执、装备墓碑虽已分别在 Phase 275、274、423 收敛为增量状态，但最后的通用对象 diff 仍会让同一笔共享资产事务随在线档案和挂单总量线性增长。

最终规则是：已认证、同 lineage 的共享资产／身份 record map 只向 planner 暴露本次 touched record；启动、完整 reload、不可信输入、跨 lineage 和周期 checkpoint 仍保守执行完整 diff。不能证明增量关系时必须回退，不能把“没有证据”误报成零变化。

## record lineage 合同

以下六个持久容器进入统一 record lineage：

- `accounts`、`sessions`、`profileBindings`；
- `accountCharacterSlots`、`profiles`、`marketListings`。

发布根中的 record value 全部深冻结。`cloneAuthorityRoot` 为候选建立只复制外层 map 的可写 Proxy，直接赋值、删除和 `defineProperty` 都记录 `{recordId, before, after}`；正式 writer 继续优先使用 `setAuthorityRootRecord`／`deleteAuthorityRootRecord`。旧发布根和值不会被候选污染，嵌套对象也不能绕过 outer-record replacement 偷改已发布事实。

lineage 只有在完整容器通过 bucket-specific 身份认证后才可用于 planner：账号按 username 外键认证但 SQL 仍按 accountId；session、binding、profile、listing 必须分别匹配自己的服务端身份；四角色槽必须是固定四项且每个非空 slot 的 accountId／slotIndex／playerId 与外层名册一致。容器 record key 与 SQL 主键是两套明确身份：planner 以 record key 追踪 touched set，再以文档内实体主键生成 SQL。账号注册因此不会把 username 错当 accountId；同一 SQL 实体若发生外层重键，会先在 touched entity map 中合并，再按原有 diff 规则生成更新，而不会因 record 顺序产生先插后删。

普通市场的 lineage 同时维护总挂单数与每卖家挂单数。上架条件 planner 直接读取认证后的计数缓存，再认证唯一新增 listing；不能取得认证计数时才走原有完整市场统计。缓存只随 touched listing 的 before／after 增量更新，不复制完整卖家 map。

## MySQL planner 与提交基线

通用 `appendObjectEntityDiff` 先读取 record delta，只为 touched SQL entity 生成 DELETE／INSERT／UPDATE；四角色槽把 touched 账号的至多四个 slot 展开后，继续保持“所有释放身份先 DELETE，再 UPDATE／strict INSERT”的唯一索引安全顺序。profile／binding／market 的单行条件资格也复用同一 delta，不再各自构建完整 canonical map。

MySQL load、正常 COMMIT 和条件 COMMIT 后的 Node-local baseline 都重新冻结并认证 lineage。条件事务只把已证明的 profile、binding 或 listing 行合入旧 baseline，保留其他 Node-local 事实；不会把整个请求候选冒充成数据库全量快照。备份、迁移和 structured-clone 边界会先把内部 Proxy 物化为普通 JSON 容器，私有 lineage 与计数从不持久化，也不进入玩家可见数据。

record journal 深度最多 1024。第 1025 次 mutation 建立新 segment；旧 baseline 与新 segment 做 planner 比较时明确返回 `checkpoint`，完整 diff 与条件资格 fallback 分别计量。一次完整回退提交后，新 baseline 从当前 segment 继续增量，不会永久退化。uncertified、lineage mismatch、branch mismatch、journal discontinuity 和 value mismatch 同样只允许完整回退或失败关闭。

## 组合容量门槛

新增 `tools/p0_6_planner_touched_set_gate.mjs`，在同一进程先认证：

- 200 个账号、session、binding、profile 与固定四角色槽名册；
- 120 条普通市场挂单；
- 单账号 200 封正式活动邮件；
- 20,000 条 durable receipt；
- 100,000 条永久装备消费墓碑。

门槛执行 5 次 warmup 与 20 次计时事务，交替做普通挂单撤销／创建，同时只更新操作者 binding、profile 与一条 receipt。它对 before／candidate 的六个 record map、canonical mailbox、receipt ledger 和 tombstone ledger 同时拦截 `Object.keys`、`Object.values`、`Object.entries` 与 `Reflect.ownKeys`；条件 plan 仍须精确得到预期种类、最多 3 个锁和 5 个写入。

Apple M5 / Node v25.8.1 的最终候选结果：planner p95 `0.211 ms`、max `0.217 ms`；受保护容器枚举 `0`，mail own-key 增量 `0`，steady-state delta fallback、journal checkpoint、planner checkpoint fallback 与 full diff 都为 `0`。25 次 warmup／计时事务共记录 75 个业务 record mutation，planner 命中 exact lineage 231 次。

独立 checkpoint 证据执行 1025 次同 profile replacement：`journalCheckpoints=1`。同一个 segment 边界分别被通用 diff 与条件资格检查观察，因此 `plannerCheckpointFallbacks=2`、`plannerFullDiffScans=2`；这两个回退没有混入 steady-state 指标。既有 `tools/p0_6_large_collection_journal_gate.mjs` 同时更新到四角色槽与 generation-one 邮件夹具，200 档案／20k 回执／100k 墓碑的 MySQL 路径 p95 `0.974 ms`、历史对象 key 扫描 `0`。

## 回归证据

authority record、root clone／materialization、角色槽、存储、profile conditional、market conditional、durable receipt、邮件和装备相邻矩阵 `295/295` 通过；语法检查与 `git diff --check` 通过。完整 Node 套件使用两个独立干净 worktree 对照：

- 未改动 `2939dd533` 基线：`1775/1854`，79 个失败；
- 只含 Phase 424 暂存内容的候选：`1783/1860`，77 个失败。

候选失败名集合是基线严格子集，没有新增红灯；新增 6 个测试全部通过，并修复 `real record_point_save` 与 `real paid pet reset` 两个仍假设“注册即自动有角色”的旧夹具。其余既有失败继续来自既有战斗断言、未迁移的注册后未选角脚本、隔离 MySQL harness 和批量迁移工具，不能被本阶段冒充为通过，也没有混入本次提交。

## 非目标与剩余风险

- 本阶段的“零枚举”结论只针对已经完成完整认证的 planner diff 区段。首次 load、完整 reload、normalizer 认证、legacy bridge 与第 1025 代 checkpoint 仍允许全量遍历，并有独立诊断；不宣称端到端每次 save 在所有阶段都绝对零扫描。
- party、family、manor、GM grant 与追加型审计／战斗历史不属于本次共享资产容量组合，继续保留原有 diff／append 合同；本阶段没有借“通用”之名重写这些领域 writer。
- 没有修改客户端协议、玩家 UI、经济数值或数据库 schema；没有连接共享 MySQL、执行真实 DML、读写玩家档案或更改 `GLOBAL`／`PERSIST` 参数。
- `P0.6d-2c-13` 仍需完成复杂装备 legacy 的真实 MySQL 双向交错、重复 listing／envelope identity 全资产回滚和跨 Node 模糊 COMMIT 精确重放。完成并复审 13 后，才能决定关闭 `P0.6d-2c` 与上层 `P0.6d-2`。
