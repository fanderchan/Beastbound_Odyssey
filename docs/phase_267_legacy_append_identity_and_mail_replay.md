# Phase 267：legacy 新增资源身份防覆盖与邮件回执恢复

## 问题与玩家风险

Phase 262 已让市场读穿采纳当前市场、相关账号与档案，但市场范围不会读取邮箱分区。这是有意的最小读集，却暴露了 legacy 写路径的一条边界：旧 Node 可以已经采纳最新市场和档案、仍看不到另一 Node 刚提交的成交邮件。此前 legacy diff 会把“本地基线中不存在”的普通邮件或市场挂单写成 `INSERT ... ON DUPLICATE KEY UPDATE`。若两个 Node 极低概率生成相同 ID，后写事务可能覆盖先提交资源，而不是把冲突作为整单失败。

相同问题也存在于装备信封永久消费墓碑：append-only 身份若使用重复键 no-op，调用方无法从数据库结果区分“本次成功消费”与“该身份早已被其他事务消费”。这会削弱资产唯一性最后一道防线。

此外，`sendMail` 首次已在 Node A 提交、响应丢失后，Node B 可能先从陈旧档案判断附件已不存在并返回业务失败，尚未触达数据库写入。若不在失败路径读取原 operation 的 durable receipt，玩家会看到“发送失败”，但收件人实际已经收到邮件。

本阶段完成 `P0.6d-2c-5`：保持 legacy 全局事务和现有经济规则不变，只收紧新增资源的数据库身份语义，并把 `sendMail` 纳入失败后精确回执恢复。

## Beastbound 规则

### 1. 本地基线中新 ID 必须 strict INSERT

- `mail_messages`：本地 committed baseline 中不存在的 `mailId` 只允许 plain `INSERT`。
- `market_listings`：本地 committed baseline 中不存在的 `listingId` 只允许 plain `INSERT`。
- `consumed_equipment_envelopes`：新增永久墓碑始终使用 plain `INSERT`。
- 本地基线中已存在且内容确实变化的邮件或挂单继续使用既有 upsert；这是更新/领取/维护语义，不被误改成“只能创建一次”。
- 主键重复必须由 MySQL 报 `ER_DUP_ENTRY`，统一事务守卫执行明确 ROLLBACK；不得把冲突吞成成功，也不得覆盖数据库中的先行资源。

该变化不增加查询、不扫描完整邮箱或市场，也不新增 gap lock。正常无碰撞时 SQL 数量与锁范围不变；只把过去错误的冲突成功改为确定失败。

### 2. legacy 邮件碰撞必须回滚整单

一次性真实 MySQL 门槛构造以下交错：

1. legacy Node 在远端成交前加载旧 baseline。
2. 条件市场购买在另一 Node 提交成交邮件。
3. legacy Node 只执行 `market_read` 权威读穿；它采纳最新市场/档案，但认证视图的 `mailPartitions` 为空，因此基线仍看不到该成交邮件。
4. legacy Node 发送普通附件邮件，并强制复用成交邮件 ID。
5. strict INSERT 命中数据库主键冲突；此前暂存的发件人档案 revision、附件扣除和 durable receipt 全部回滚。
6. 原成交邮件逐字段保持不变，global revision 不前进。
7. 同一 operation/request/action 改用新的内部邮件 ID 重试，恰好提交一次。

邮件 ID 属于服务端内部身份，不属于玩家请求语义；已知回滚后换新内部 ID，不会改变幂等 operation 的业务意图。

### 3. `sendMail` 只在失败后恢复远端成功

`sendMail` 加入 durable failure reconciliation 白名单，但不加入健康请求预读：

- 正常首次发送继续保持 0 次 receipt read。
- 只有本地业务结果失败、请求带有效 operation ID/hash/action 时，才进行一次 exact receipt read。
- 若 MySQL 证明同账号、同请求、同 action 已提交，则完整 reload 权威根并重放首次响应，`replayed=true`。
- ordinary attachment 与 equipment attachment 都不得再次保存、再次扣物或再次创建邮件。
- receipt 缺失、过期、账号/hash/action 不一致或 reload 失败继续失败关闭，不能猜测成功或盲重试。

## 验证证据

静态与定向验证：

- `node --check server/node/src/mysql-store.js`
- `node --check server/node/src/auth/durable-mutation-state.js`
- `node --check server/node/test/auth-storage.test.js`
- `node --check server/node/test/auth-durable-commit.test.js`
- `node --check tools/p0_6d_profile_parallel_mysql_gate.mjs`
- `git diff --check`
- 存储单文件 `38/38`：新 mail/listing/tombstone SQL 形态、既有 mail/listing 更新仍 upsert、重复新邮件在前序账号写后整笔回滚及明确错误分类。
- durable 单文件 `50/50`：普通附件和装备附件的跨 Node 首次结果重放，健康发送 0 receipt read，陈旧失败只读一次、0 次二次保存。
- 市场买/撤、邮件领取、资源锁序与 shared transaction 相邻组合 `88/88`。

一次性隔离 MySQL 9.7.0-er2 / `REPEATABLE-READ` 门槛：

- 临时 datadir、随机非 3306 端口、128 MiB buffer pool、非玩家 schema；外部 MySQL 凭据被忽略。
- `legacyPartialAdoptMailDuplicateRollbackVerified=true`：市场读穿不含邮箱分区时，重复邮件 ID 明确回滚，原成交邮件、发件档案、附件、receipt 和 global revision 均不变。
- `legacyMailCollisionSameOperationRetryVerified=true`：原 operation 换新内部邮件 ID 后只成功一次。
- 最终 `globalRevision=6`、23 条预期 receipt 精确对账。
- `deadlockDelta=0`、`activeTransactions=0`、`activeLockWaits=0`、`cleanupVerified=true`。

## 性能与数据库边界

- 不修改 MySQL `GLOBAL`、`PERSIST`、配置文件或共享数据库；仍只使用 Beastbound checkout 后的 Session 级超时。
- strict INSERT 与旧 upsert 都是同一条单行写；正常路径没有额外数据库往返。
- `sendMail` 仅在已经失败且 operation 可对账时增加一次精确 receipt read；健康发送不增加读放大。
- 未触碰真实玩家数据，未运行完整 local CI 或 Godot 检查；本阶段没有客户端、协议、玩法或 UI 变化。

## 非目标与剩余风险

- `createMarketListing` 仍没有市场权威读穿；陈旧 Node 可能错误命中全市场 120 条或单账号 20 条上限，并且 legacy 路径仍锁/比对全 profile 根。下一项需要把容量判断放进有界、可认证的市场上架事务。
- 纯文本和普通附件 `sendMail` 仍走 legacy 全局 revision 与完整 profile read-set；本阶段只修身份覆盖和跨 Node 假失败，不宣称邮件发送吞吐已经完成。
- 装备邮件与装备市场继续保留保守 legacy 边界；strict envelope/mail/listing 身份保证不会静默覆盖，但不等于已经达到 200 人容量。
- service event、presence、WebSocket 跨 Node 路由、全局 2 万 receipt 保留协调，以及真实多 Node + MySQL 30 分钟混合门槛仍留在 `P0.6d`。

因此本阶段只关闭 `P0.6d-2c-5`；`P0.6d-2c`、`P0.6d-2` 与 `P0.6d` 继续保持未完成。
