# Phase 266：卖家领取与市场成交邮件并发门槛

## 问题与玩家风险

普通市场购买会扣除买家货币、发放物品、删除挂单、给卖家创建成交邮件、累计税金并写入 durable receipt；卖家领取旧成交邮件则会增加卖家货币、删除或更新邮件并写入另一条 receipt。两条路径单独原子并不等于交错时安全：如果共享卖家档案的锁语义错误，可能出现陈旧购买覆盖领取结果；如果两笔购买生成同一个成交邮件 ID，重复键可能发生在买家扣款和删单已经暂存之后。

本阶段完成 `P0.6d-2c-4e`，用确定性 shared-transaction 回归和一次性隔离 MySQL 竞争证明这些晚阶段冲突会整单回滚，并据此关闭 `P0.6d-2c-4` 的跨账号统一门槛。本阶段没有修改生产锁序、市场价格、税率、邮件金额、客户端协议、玩家存档 schema 或数据库全局配置。

## 既有锁合同与交错结果

生产条件事务继续遵守 Phase263 的统一顺序：

```text
global revision SHARE
→ accountId 总序的 binding
→ playerId 总序的 profile
→ listing/mail
→ envelope
→ market tax
→ receipt
```

市场购买对买家 binding/profile 使用 EXCLUSIVE，对卖家 binding/profile 使用 SHARE；卖家邮件领取对卖家 binding/profile 使用 EXCLUSIVE。由此得到两个确定结果：

- 购买先取得卖家 SHARE：领取等待；购买提交不改变卖家 revision，领取随后继续并成功。旧邮件款进入卖家钱包，新成交邮件仍保留。
- 领取先取得卖家 EXCLUSIVE：陈旧购买等待；领取提交令卖家 revision 前进，购买随后在验证卖家资源时失败，且尚未执行买家扣款、删单、插邮件、税金或 receipt。购买方 reload 后可用原 operation ID 安全重试。

不新增邮箱全局锁，也不对不存在的 mail ID 做 gap lock。成交邮件继续使用 strict INSERT 和数据库主键作为最终防线；重复键或锁等待超时由统一事务守卫显式回滚整笔事务。

## 验收矩阵

### 1. 购买先行、领取等待

- 在购买已经取得卖家 SHARE 并到达 COMMIT gate 后启动领取。
- shared harness 与真实 `performance_schema.data_lock_waits` 都观察到领取等待卖家 binding/profile。
- 放行后两笔均成功；买家只扣一次、只收到一次物品，旧邮件只领取一次，新成交邮件和两条 receipt 均存在。

### 2. 领取先行、陈旧购买失败后重试

- 领取持有卖家 EXCLUSIVE 时启动基于旧 revision 的购买。
- 领取提交后，陈旧购买返回已知资源冲突；确定性 SQL 日志证明它在任何 `UPDATE/DELETE/INSERT` 之前失败。
- 买家钱包、背包、挂单、税金和购买 receipt 均未变化。
- reload 后使用相同 operation ID、request hash 和 action 重试，恰好成功一次。
- 真实 MySQL 场景使用领取前不存在的独立成交邮件 ID；逐条 SQL 锁观察要求领取先取得卖家 binding/profile EXCLUSIVE，购买再以 SHARE 请求同一卖家首锁，防止测试悄悄回退到 legacy 全局围栏而产生假阳性。

### 3. 两笔购买生成同一成交邮件 ID

- 两个独立 store/pool 购买同一卖家的不同挂单，并强制相同 `saleMailId`。
- 先行事务提交；后行事务在 strict INSERT 唯一键上失败。
- 后行事务此前暂存的买家 binding/profile 更新和 listing DELETE 全部回滚；税金与 receipt 也没有落库。
- 后行方 reload 后使用原 operation ID、相同 request hash、重新生成的内部 mail ID 重试成功。内部 mail ID 不属于玩家请求语义，因此不改变幂等意图。

### 4. 成交邮件唯一键等待超过 Session 上限

- 先行事务持有同一 mail ID 的唯一键，刻意不提交，直到后行事务触发 Beastbound Session 的 `ER_LOCK_WAIT_TIMEOUT`。
- 错误分类为 `mysql_transaction_rolled_back`，`outcomeUnknown=false`、`rollbackConfirmed=true`；不是模糊 COMMIT。
- 后行买家、挂单、税金和 receipt 全部保持原样；先行方提交后，后行方仍可用原 operation ID 和新内部 mail ID 重试成功。
- 该门槛使用每次 checkout 的 Session 级 row-lock 3 秒策略；没有执行 `SET GLOBAL/PERSIST`、修改 MySQL 配置或连接共享玩家库。

## 验证证据

定向验证结果：

- `node --check server/node/test/mysql-shared-transaction-integration.test.js`
- `node --check tools/p0_6d_profile_parallel_mysql_gate.mjs`
- shared transaction 单文件 `20/20`。
- 市场购买、邮件领取、资源锁序与 shared transaction 相邻组合 `75/75`。
- `git diff --check` 通过。

一次性隔离 MySQL 9.7.0-er2 / `REPEATABLE-READ` 门槛：

- 临时 datadir、随机非 3306 端口、128 MiB buffer pool、非玩家 schema；外部 MySQL 凭据被忽略。
- `sellerClaimPurchaseFirstVerified=true`。
- `sellerClaimClaimFirstRetryVerified=true`。
- `saleMailDuplicateRollbackVerified=true`。
- `saleMailLockTimeoutRollbackVerified=true`。
- `saleMailCollisionSameOperationRetryVerified=true`。
- 最终 22 条预期 receipt 精确对账，买家钱包/物品、卖家旧邮件领取、新成交邮件、挂单、税金与 receipt 全部守恒。
- `deadlockDelta=0`、`activeTransactions=0`、`activeLockWaits=0`、`cleanupVerified=true`。

## 非目标与剩余风险

- 生产成交邮件 ID 是规范小写的随机 UUID，并在 Node 内最多尝试 16 次；自然碰撞概率极低。本阶段注入碰撞是为了证明数据库最终防线，而不是增加全邮箱扫描或全局邮件锁。
- 当前 schema 没有永久 mail identity tombstone。不同收件人之间再叠加人为 UUID 碰撞和原邮件恰好删除的病理场景，若要求永不复用，需要更大的 schema/身份代际合同，不在本阶段扩张。
- `createMarketListing`、`sendMail` 与装备市场仍在 legacy 或失败关闭边界；下一步只读审计它们是否可作为本阶段正式边界，再决定能否关闭 `P0.6d-2c`。
- service event、presence、WebSocket 跨 Node 路由、全局 2 万 receipt 保留协调、同步 full reload 延迟，以及 200 人/30 分钟真实多 Node + MySQL 混合门槛仍未完成。
- 没有运行完整 local CI 或 Godot 检查；本阶段只改变服务端测试、隔离数据库门槛和文档，不改变客户端或生产运行时代码。

因此本阶段完成 `P0.6d-2c-4e` 并关闭其父项 `P0.6d-2c-4`；`P0.6d-2c`、`P0.6d-2` 与 `P0.6d` 继续保持未完成。
