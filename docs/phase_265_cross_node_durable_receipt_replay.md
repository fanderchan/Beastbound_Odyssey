# Phase 265：跨 Node 精确回执重放

## 问题与玩家风险

Phase247 已让同一 Node 和重启后完整 reload 的原 operation ID 可以重放，Phase259–264 又保证市场、邮件与档案写入在 MySQL 中原子结算。但两个同时运行的 Node 仍各自保留内存 receipt 视图：Node A 已 COMMIT、响应丢失后，持旧快照的 Node B 不知道该回执。

已复现的旧行为：

- 普通市场购买在 Node A 成交后，Node B 同 key 重试先读到“挂单已不存在”，返回 `market_listing_missing`，而不是第一次成功结果。
- 普通商店/档案资产写在 Node B 会先撞 `mysql_resource_revision_conflict`，第一次返回 `storage_write_failed`；只有下一次请求触发完整 reload 后才会 replay。

两种行为都不会直接重复扣款，但会让玩家在断线、反代换节点或响应丢失后看到假失败，并可能误用新 operation ID 再发一次真实操作。本阶段完成 `P0.6d-2c-4d`：由 MySQL 精确回执证明第一次结果，并在同一次重试中返回。

## 精确读取合同

MySQL store 新增 `readDurableMutationReceipt(operationId)`。一次参数化查询同时读取 Node 已知的全局版本和精确回执，不扫描 receipt 表：

```sql
SELECT revision_row.revision AS store_revision,
       receipt.operation_id, receipt.request_hash, receipt.action_id,
       receipt.account_id, receipt.committed_at, receipt.expires_at,
       receipt.document_json
FROM auth_store_revisions AS revision_row
LEFT JOIN mutation_receipts AS receipt ON receipt.operation_id = ?
WHERE revision_row.scope_key = ?
```

读取规则：

- operation ID 必须先通过既有 16–160 位格式校验，非法值在取得连接前拒绝。
- 全局版本必须是非负安全整数；SQL 主键、request hash、action、account、提交时间、过期时间必须与 JSON 文档完全一致；任一漂移整次读取失败关闭。
- 缺行返回明确的 `receipt: null`；过期行仍原样返回，由服务权威时间决定是否可重放，MySQL reader 不擅自过滤。
- `authorityCurrent` 只有在全局版本未漂移、并且该 operation ID 在 store 已知 receipt baseline 中与数据库完全一致时才成立。条件资产事务不会推进 global revision，因此不能只看 global revision。
- exact read 排在该 Node 的 async storage FIFO 尾部，不能越过本 Node 先前尚未完成的 COMMIT；读取失败不会污染 `lastSaveError`。
- 读取复用 Phase264 的 guarded transaction：每次 checkout 只执行 Session 级 `3/5` 秒锁等待策略，并受 acquire/session/transaction deadline 约束。没有 `GLOBAL/PERSIST/PERSIST_ONLY`、配置文件修改或数据库重启。
- 冷 store 的非法 operation ID 在创建 pool 前拒绝；合法 exact read 不先加载完整 authority root。

本阶段刻意不把单条外部回执写进本地 2 万条 receipt lineage。若 exact row 与 Node baseline 一致，同 Node 重试可 O(1) 重放而不完整 reload；若全局版本或该 receipt baseline 漂移，则完整 reload 一次，使 service root 与 MySQL diff baseline 重新共享同一权威账本。初始本地已有活动回执而 DB missing/drift 时，会在任何 reload 前立即失败关闭，绝不能先抹掉本地证明再重复执行。

## 分层重放策略

不能在每个带 Idempotency-Key 的 durable 调用前都查 MySQL。`submitBattleCommand` 的普通中间回合是运行态热路径，原设计为 0 store save；无条件 exact read 会把每个回合变成 `SET SESSION + BEGIN + SELECT + COMMIT`。

因此采用三层策略：

1. 市场购买、市场撤单、邮件领取、邮件已读先完成共享资产 RR read-through，再做 exact precheck。这样即使 Node A 恰好在 Node B 的两步之间提交，B 也会在 exact 或后续条件写冲突中找到原回执，不会停在 `market_listing_missing` / `mail_missing`。
2. 商店、档案、银行、装备、任务、转生、离线/在线挂机、创建挂单和确认交易等高价值资产方法，如果陈旧状态让远端成功在本地提前变成 domain failure，会在返回假失败前做一次 exact reconciliation。市场/邮件本请求已经 precheck 时不会重复查第二次。
3. 其他写正常执行候选事务。若 MySQL 返回 store/resource revision conflict 或 COMMIT ambiguity，再读取 exact receipt；匹配命中后只在 baseline 漂移时 reload，并在当前请求返回原结果。
4. 纯运行态成功、普通新战斗回合和无 operation ID 的调用不做 receipt read。测试同时要求 `saveCount=0` 与 `receiptReadCount=0`。候选业务已执行后若 exact 要求刷新但没有活动回执，本次候选会被丢弃并要求重试，绝不把旧 candidate 覆盖到刚刷新的权威根。

活动回执的结果：

- malformed/空 session token 在 DB 前拒绝；格式正确但本 Node 尚未知的新 token 可以通过 exact hit + 权威 reload 恢复，随后仍必须按最新 session/account 重新鉴权。
- account/hash/action 全部匹配：返回原 response，并只把 `durableCommit.replayed` 改为 `true`；跨 Node 命中后的本地 profile/cache 也来自权威 reload。
- 任一身份或意图不同：统一返回 `idempotency_key_conflict`，不暴露别人的 response。
- 本地存在活动回执但 MySQL 缺行或内容不同：视为不可能的完整性破坏，返回 `storage_read_failed`，绝不重新执行业务。
- exact read 命中过期行且 baseline 漂移：先完整 reload；若这是候选执行后的发现，本次直接终止，下一次同 key 再走既有原子 `DELETE + INSERT` 安全替换。
- exact read 或随后的完整 reload 失败：失败关闭；没有原回执证明时不能把候选结果当作成功。
- 原写若是 `mysql_commit_outcome_ambiguous`，async store 会保留该写所属的 operation/hash/action。后续只有同一意图的活动 exact receipt 完成 authority/session/account 校验才可解除门闩；context 缺失、换 operation/hash/action、malformed/空 token、exact missing/expired、读失败、reload 失败或校验失败都继续返回 `storage_outcome_unknown` 且 `outcomeUnknown=true`，不能降级成普通读失败或再次执行。

跨 Node replay 不发布失败候选中暂存的 service event、runtime effect 或资产；只有第一次真实 COMMIT 产生结算。恢复成功并完成 receipt/session/cache 校验后才清理该 Node 的原 save error，后续请求不会再被旧错误强制阻断。

typed COMMIT ambiguity 在 async wrapper 中先传播给 exact reader，不再先调用无期限的完整快照恢复。跨 Node reload 仍使用现有 CLI loader，但 Beastbound 子进程新增默认 3 秒、硬上限 4 秒 timeout 与既有 192 MiB 输出上限；只终止 Beastbound 自己的子进程，不修改共享 MySQL 的全局/Session 配置。解析仍是同步且受 192 MiB 上限约束，因此这里只声明“外部命令有界”，不宣称恢复链完全异步。

## 实现范围

- `server/node/src/auth/durable-receipt-read-model.js`：operation ID 与 exact view 的统一认证。
- `server/node/src/auth/durable-mutation-state.js`：高价值资产 domain-failure reconciliation 能力边界。
- `server/node/src/mysql-store.js`：参数化 PK 查询、SQL/JSON 镜像校验及 Phase264 guarded transaction。
- `server/node/src/auth-service.js`：Node-local FIFO、市场/邮件 precheck、存储冲突后的 exact replay、COMMIT ambiguity 意图门闩、过期 reload 与读指标。
- `server/node/test/mysql-durable-receipt-read.test.js`：真实 store 边界的 fake-pool 精确验证。
- `server/node/test/auth-shared-asset-read-through.test.js`、`auth-durable-commit.test.js`：两个同时运行 Node 的玩家级重放与热路径边界。
- `tools/p0_6d_profile_parallel_mysql_gate.mjs`：一次性真实 MySQL exact/missing 行与陈旧 Node service replay 验证。

没有修改客户端协议、经济规则、玩家存档 schema 或 MySQL 全局配置。

## 验证证据

定向 Node 回归 `211/211` 通过：

- durable commit/recovery `49/49`；
- shared asset + HTTP `45/45`；
- exact receipt/shared read/transaction guard `26/26`；
- profile、市场购买/撤单、邮件领取 conditional planner/executor `91/91`。

覆盖内容包括：

- Node A 市场成交后 Node B 同 key 原样 replay，买家只扣一次、物品只发一次、卖家成交邮件只有一封；shared-read/exact 的 TOCTOU 窗口也有确定调度回归；
- Node A 邮件领取后 Node B 同 key replay，附件和货币只结算一次；
- 普通商店写无论撞资源 revision，还是远端成功已让本地提前余额不足，均在同一次请求 exact reload 并 replay；
- 同 key 改 hash/action/account 冲突；远端注销 token 被拒，新 Node 签发的同账号 token 可恢复；malformed token 为 0 receipt read；
- 本地活动回执而 MySQL missing 时在 reload 前失败关闭；跨 Node 过期 key 在 reload 后用同 key安全替换；过期回执不能让旧 failure candidate 覆盖新权威根；
- typed ambiguity 的 context 缺失/错配、malformed/空 token、exact read failure、missing、reload failure 均保持 unknown 且不二次 save；同 operation 的 exact hit + bounded reload 成功才 replay/clear；
- async exact read 不越过本地未完成写入，读失败不污染 save state；只读 COMMIT 模糊会 destroy connection 且不 rollback/release；
- battle 中间回合同时保持 0 save、0 receipt read。

一次性隔离 MySQL 9.7.0-er2 / `REPEATABLE-READ` 门槛通过：

- 随机非 3306 端口、128 MiB buffer pool、临时非玩家 schema；外部 MySQL 密码被主动清空且未读取。
- Node B 在 Node A 条件成交前先加载无回执 baseline；Node A COMMIT 不推进 global revision 后，B 的单查询精确读真实返回 `authorityCurrent=false`，且 exact read 本身不偷做 full reload。
- B 随后经真实 service shared-read + exact 流程只 full reload 一次并 replay 原成交；缓存中的 profile/receipt/listing 与 MySQL 一致，再次 exact 返回 `authorityCurrent=true`，钱、物品、税金、挂单和回执均无二次结算。不存在的 operation ID 仍返回 null 且同基线为 current。
- 原 profile/市场/邮件竞争与资产守恒门槛继续通过，`deadlockDelta=0`、残留 transaction/lock wait 均为 0。
- 临时 mysqld、schema 与 datadir 全部清理，`cleanupVerified=true`。

主要命令：

```text
node --test server/node/test/auth-durable-commit.test.js
node --test server/node/test/auth-shared-asset-read-through.test.js server/node/test/auth-http-server.test.js
node --test server/node/test/mysql-durable-receipt-read.test.js server/node/test/mysql-shared-asset-read.test.js server/node/test/mysql-transaction-guard.test.js
node --test server/node/test/mysql-profile-conditional-save.test.js server/node/test/mysql-market-cancel-conditional-save.test.js server/node/test/mysql-market-buy-conditional-save.test.js server/node/test/mysql-mail-claim-conditional-save.test.js
node tools/p0_6d_profile_parallel_mysql_gate.mjs
```

## 非目标与剩余风险

- exact precheck 目前是独立短事务，市场/邮件的新 mutation 会比 Phase264 多一次 revision-row + receipt-PK read；它们不是战斗热路径，但正式多 Node 容量门槛仍需测量。未来可在不削弱认证的前提下并入 shared-asset RR transaction。
- 格式正确但无效的随机 token 携带合法 operation ID 时可能发生一次 exact PK read，以换取“另一 Node 刚签发的新 token”可恢复；malformed/空 token 仍为 0 DB。公网 admission/rate-limit 与容量门槛仍需继续验证。
- domain-failure reconciliation 只覆盖明确列出的高价值资产方法，不把 chat、GM、family/manor 或普通 battle failure 默认放大成 DB read；其余路径仍依赖保存冲突恢复。跨 Node battle/runtime 路由尚未完成。
- authority CLI 子进程已有 3 秒默认/4 秒硬上限，但 reload 仍会同步暂停 Node 事件循环，写事务、exact 与 reload 的串行总时间也不保证低于 HTTP 10 秒；完整 TSV 解析仍同步且只由 192 MiB 上限约束。正式多 Node 容量阶段应测真实最大快照 p95/max，并改为异步/scoped reload。
- 多 Node 各自清理 receipt 的全局 20,000 条 retention 协调尚未解决；单键读取不等于全局账本收敛。
- service event、presence 与 WebSocket 仍没有跨 Node 路由/失效；200 人、30 分钟、真实多 Node + MySQL 混合 soak 仍未完成。
- 本阶段没有连接共享/玩家数据库，也没有运行完整 local CI；父项 `P0.6d-2c-4`、`P0.6d-2c` 与 `P0.6d` 继续保持未完成。
