# Phase259：普通市场撤单的 MySQL 条件事务

## 本阶段解决的问题

Phase258 只允许经过服务端认证的纯档案写并行。市场挂单仍走完整 authority root 的 legacy 全局事务；如果直接根据“最终 diff 很小”放开，会把业务实际读取的市场书、装备信封、税率和其他账号状态漏在锁外。

本阶段只完成 P0.6d-2c 的第一刀：**普通物品撤单**。它成功时固定修改卖家 binding/profile、删除一条属于卖家的 schema1 普通挂单，并新增一条 durable receipt；不涉及第二个账号、成交邮件、税金或装备墓碑。这一边界可以在不迁移 listing schema 的前提下独立证明。

以下路径继续使用 `legacy_global_cas`：

- 普通/装备上架；
- 普通/装备购买；
- 装备撤单；
- 教学机器人挂单；
- 没有幂等 key/receipt 的裸 HTTP 撤单；
- 同时改变 mail、marketConfig、consumed envelope 或任何额外持久资源的候选事务。

## 服务认证与 planner 双重失败关闭

只有成功的 `cancelMarketListing` 可以生成：

```text
kind = row_local_market_cancel_v1
accountId / playerId / listingId
operationId / requestHash / actionId
```

服务层先确认 session、卖家、角色、schema1 普通物品、无装备信封、目标挂单在 candidate 中已经删除。MySQL planner 不相信 scope 自报的 write-set，还会重新验证：

- 根 schema 不变；
- 恰好一个既有 binding/profile 从 `r → r+1`；
- 恰好删除一个属于该账号的 schema1 listing；
- 恰好插入一个身份完全匹配的 immutable receipt；
- 除 profileBindings、profiles、marketListings、mutationReceipts 外没有其他 SQL group。

任一条件不成立就回退 legacy，而不是尝试猜测一个更宽的条件事务。

## 固定锁序与 SQL 合同

条件撤单使用 Phase258 的 profile-first 总序：

```text
global revision FOR SHARE + expected revision
→ seller binding FOR UPDATE
→ seller profile FOR UPDATE
→ target listing FOR UPDATE
→ conditional binding UPDATE (affectedRows=1)
→ conditional profile UPDATE (affectedRows=1)
→ conditional listing DELETE (affectedRows=1)
→ strict receipt INSERT (affectedRows=1)
→ COMMIT
```

listing 当前没有资源 revision。事务锁定目标行后，同时核对 SQL 镜像列和完整 `document_json` 语义对象；随后 DELETE 再带 listing/seller/item/currency/price/count/createdAt 条件。目标消失、内部 JSON 漂移、任一条件写 0 行或 receipt 重复都会整笔回滚。

未来扩展跨账号购买/邮件时继续使用统一顺序：bindings 按 accountId、profiles 按 playerId、listings 按 listingId、mails 按 mailId、envelopes 按 envelopeId，最后插入 receipt；不能按“买家优先”或“卖家优先”临时改变锁序。

## 与 legacy 的兼容

普通撤单一定推进卖家 profile revision，因此可复用 Phase258 的新旧事务兼容屏障：

- 撤单先进入 shared barrier：legacy 等待；撤单提交后，legacy 的完整 binding/profile snapshot guard 在业务 SQL 前发现 revision 漂移并回滚。
- legacy 先进入 exclusive barrier：提交后推进 global revision；等待中的撤单在取得 shared barrier 后、任何资源锁之前拒绝旧 expected revision。

这个推论只适用于必然修改 profile 的撤单，不能拿来开放只改邮件已读状态等 metadata-only 写入。

## Node-local baseline 与模糊 COMMIT

撤单 COMMIT 后，MySQL store 只合并已证明的四类资源：目标 binding、目标 profile、目标 listing 的删除和 planner 已证明仅追加一条的 canonical receipt ledger。不能用对象展开重建 receipt ledger，否则会丢失增量 lineage、扫描最多 2 万回执，并让同 Node 下一次撤单错误降级为 legacy。测试中 A 携带陈旧的 B 挂单快照在 B 已提交撤单后才 COMMIT，也没有把 B 的挂单写回；同一个 store 随后第二次撤单仍使用 global SHARE，global revision 保持不变。

连接在 MySQL 已提交后丢失响应时，只有 reload 同时证明下列事实才恢复成功：

- operation/request/action/account 完整匹配的 receipt 存在；
- 目标 binding/profile 与候选提交结果完全相等；
- 目标 listing 确实不存在。

只看到 listing 不存在不能判成功，因为也可能是另一项操作删除的。receipt、profile 或 listing 任一错配都保守返回存档失败；玩家随后可以用同一个幂等 key 从 durable receipt 重放已确认结果。

## 验证证据

定向验证覆盖：

- 服务 scope 与 planner 的正常/越界分流；
- 不同卖家撤单在 A 尚未 COMMIT 时由 B 先完成，global revision 不推进，两边 profile/listing/receipt 均正确；
- 同一 store 连续两次撤单都保留 canonical receipt delta、走条件事务，且不复活另一 Node 已删除的挂单；
- 同一撤单严格一胜一败，输家在删除 listing 前失败；
- listing 已被其他操作删除但卖家 profile 未变化时，在 listing lock 阶段以 0 条业务写失败；
- listing 完整 JSON 漂移在业务写前拒绝；
- duplicate receipt 发生在 profile 更新和 listing 删除已暂存后仍整笔回滚；
- conditional/legacy 两种先后顺序均不覆盖；
- COMMIT 后另一个账号又提交记录点时，scoped 模糊恢复仍确认本次撤单并发布完整 reload；receipt/profile/listing 三类错配均拒绝；
- 原市场/银行/装备托管回归和 Phase258 profile 条件事务无回退。

最终定向命令：

```text
node --check server/node/src/mysql-store.js
node --check server/node/src/auth-service.js
node --test server/node/test/auth-economy.test.js \
  server/node/test/mysql-market-cancel-conditional-save.test.js \
  server/node/test/mysql-profile-conditional-save.test.js \
  server/node/test/mysql-shared-transaction-integration.test.js
node tools/p0_6d_profile_parallel_mysql_gate.mjs
git diff --check
```

结果为 `110/110`。扩展后的一次性真实 MySQL 门槛也通过：`9.7.0-er2`、`REPEATABLE-READ`、随机非 3306 端口、128 MiB buffer pool；真实 JSON `FOR UPDATE` 与 listing DELETE 成功，故意注入 duplicate receipt 后 profile/listing 写全部回滚，`deadlockDelta=0`、active transaction/lock wait 均为 0，临时 mysqld 与目录清理成功。

以上都是正确性测试，不是性能测试；隔离实例不读取玩家服凭据、schema 或数据，本阶段也没有运行完整 local CI。

## 未完成边界

- P0.6d-2c 尚未完成：购买仍需处理买家 profile、卖家成交邮件、税金累计和装备墓碑；邮件领取仍需部分领取与严格信封消费；之后还要做统一跨账号锁序和隔离真实 MySQL 门槛。
- 其他 Node 的内存 `marketListings` 缓存不会因为本次数据库提交自动失效。当前只证明数据库资产不会被陈旧 writer 覆盖，不宣称多 Node 市场读取已实时一致。
- 没有性能、QPS、200 人同图或横向部署结论；普通撤单的玩家表现和客户端协议均未改变，无需本阶段人工试玩。
