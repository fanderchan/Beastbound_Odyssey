# Phase 263：MySQL 条件事务统一资源获取顺序

## 问题与玩家风险

Phase258–262 已把人物档案、普通市场撤单/购买、邮件领取和跨 Node 权威读穿拆成条件事务，但过去的锁序只分散写在各 planner 中。测试主要观察显式 `FOR SHARE/FOR UPDATE`；成交邮件 INSERT、装备墓碑 INSERT、市场税金 UPDATE 和 mutation receipt INSERT 在业务写阶段才首次取得数据库锁，若不进入同一合同，未来一次看似无害的数组换序就可能制造循环等待，而原测试仍然显示绿色。

本阶段不改变市场价格、税率、邮件金额、背包结算或玩家可见规则。目标是让当前条件事务的真实资源获取顺序成为执行器必须认证的技术合同，并用隔离 MySQL 的购买/撤单与双方互买竞争证明当前 SQL 路径可收敛且资产守恒。

## 统一获取合同

所有四类条件事务必须先持有 `auth_store_revisions/auth FOR SHARE`，随后按以下资源阶段获取：

```text
profile_binding（accountId canonical 顺序）
→ profile（playerId canonical 顺序）
→ market_listing
→ mail_message
→ consumed_equipment_envelope
→ market_tax（物理行 server_state/auth）
→ mutation_receipt
```

同一阶段的 key 使用 JavaScript UTF-16 code-unit 字典序，不能依赖进程 locale。角色互买时，无论谁是买家或卖家，双方 binding 与 profile 都会得到相同总序；卖家资源只读时使用 SHARE，买家写资源使用 UPDATE。

`mysql-resource-acquisition-order.js` 同时处理两类锁：

- 显式锁：binding/profile/listing/mail 的 `SELECT ... FOR SHARE/UPDATE`。builder 只对这些锁按资源阶段和 key 排序，不修改调用方输入。
- 隐式首次获取：新成交邮件、装备消费墓碑、市场税金行和 durable receipt。它们保持实际 writes 顺序，若逆序、重复或越过较早资源阶段，认证直接失败，不能由执行器悄悄修复。

profile/binding/listing 以及既有 mail 的 UPDATE/DELETE 必须先有同 key 的 exclusive lock；卖家的 shared binding/profile 不能被写。认证器不信任自由 metadata：每种 lock/write 都必须匹配完整 SQL 模板、精确参数数量、真实主键参数，lock 的 `expectedRow` 主键也必须等于 metadata key；binding/player、profile/account 与 mail recipient/created 等现有索引身份不得在条件 UPDATE 中迁移；`FOR SHARE/FOR UPDATE`、tax currency 与四处 JSON path、物理 `server_state/auth` 行和 `expectedAffectedRows === 1` 都纳入合同。这样不能把 seller SQL 伪装成 buyer write，也不能把实际 mail INSERT 标成较晚的 receipt 来绕过顺序。

四个 planner 都通过同一 builder 生成计划；`runMysqlPoolSavePlan()` 在申请数据库连接前再次认证。测试或未来代码即使篡改了已生成计划，也会得到 `mysql_resource_acquisition_order_invalid`，且不会占用连接或执行任何 SQL。

该层只证明资源顺序，不复制经济、邮件余量或装备语义；金额、物品、revision、scope 与 receipt 身份仍由各业务 planner 认证。

## Legacy 隔离边界

legacy 全根写仍先取得 global revision exclusive lock，再验证 server-state/完整 profile 读集；条件事务持有同一行的 shared lock。因此两条 lane 不能同时进入各自内部资源阶段，legacy 的内部顺序不强行伪装成 conditional 顺序。

这能隔离当前正税购买末尾的 `server_state/auth` 更新与 legacy 开头的 server-state 锁，但不代表旧版本 Node 可滚动混跑。Phase258 以前的写入端仍须排空并统一升级。

## 验证证据

- 纯认证模型覆盖 builder 不修改输入、UTF-16 排序、mode/完整 SQL/主键参数/expectedRow 一致、重复锁、exclusive prelock、写资源白名单、seller-write 与伪装 SQL 反例、tax 物理行、邮件/墓碑/税金/回执首次获取、篡改计划在取连接前拒绝；与四类 planner/执行器定向组合共 `104/104`：`server/node/test/mysql-resource-acquisition-order.test.js`。
- 真实 buy plan 的 trace 包含卖家/买家 binding、profiles、listing、sale mail、`market_tax/auth` 和 receipt，装备邮件 trace 的墓碑严格 canonical。
- shared transaction/read-through `39/39`，继续证明不同/同 profile、撤单、邮件与墓碑竞争，以及跨 Node 市场/邮箱读穿。
- 一次性隔离 MySQL 9.7.0-er2、`REPEATABLE-READ`、随机非 3306 端口、128 MiB buffer pool：
  - buy-first 对 seller cancel：购买提交，等待中的撤单整笔失败。
  - cancel-first 对 stale buy：撤单提交，等待中的购买在任何买家写入前失败。
  - A 买 B、B 买 A：A 在真实第一条 canonical account `SELECT ... FOR UPDATE` 成功后暂停，B 以相反卖家角色对同一行发出 `FOR SHARE`，`performance_schema.data_lock_waits` 确认逐锁阶段等待后再放行；同时记录赢家完整五步实际锁序与竞争方首锁。首轮严格一胜一败，失败方完整 reload 后用新 operation 重试成功。
  - 每组对账 binding/profile revision、钱包、背包物品、listing、成交邮件、税金和 receipt；重试后从最终 MySQL 重新读取两封成交邮件，再证明 `买家支出 = 卖家邮件 + 税`，托管物品数量与买家新增数量一致。
  - `deadlockDelta=0`、`activeTransactions=0`、`activeLockWaits=0`、`cleanupVerified=true`。

隔离门槛继续使用一次性 datadir 和非玩家 schema，清空外部 MySQL 凭据，不连接或修改玩家数据库。

## 明确未完成

- 当前只把锁序变成可执行合同；正式服务的 `innodb_lock_wait_timeout` 仍可能使用较长默认值。session 级锁等待上限、pool acquire、query/transaction hard deadline 与失败分类属于下一切片。
- mysql2 的回调 inactivity timeout 不能当作可靠的服务端事务取消；HTTP 断线也不能取消已经开始的 durable mutation。二者必须在明确的连接销毁与模糊 COMMIT 对账合同下另做。
- seller 邮件领取对并发购买、成交邮件 ID 碰撞、同 operation ID 跨 Node replay/模糊响应恢复仍需扩展矩阵。
- `createMarketListing`、`sendMail` 与装备市场路径仍在 legacy/失败关闭边界；本阶段没有宣称它们已经细粒度并行。
- 逻辑资源总序不替代未来 schema 的二级索引审计；新增索引或新写资源时必须扩展 acquisition rank 和真实竞争门槛。
- 当前条件事务每次最多新建一封成交邮件，生产 ID 为规范小写 UUID；若未来允许一笔事务插入多封 mail，必须先消除 `mail_id` 默认大小写不敏感 collation 与应用 UTF-16 排序的物理键差异。
- 尚未完成 200 人、30 分钟、真实多 Node + MySQL 混合 soak，也不宣称横向部署或容量已经最终放行。

本阶段的隔离竞争由同一进程中的多个独立 store/pool 驱动真实 MySQL，不把它扩称为多 Node/HTTP 部署证据。

因此本阶段只完成 `P0.6d-2c-4b`；父项 `P0.6d-2c-4`、`P0.6d-2c` 与 `P0.6d` 保持未完成。
