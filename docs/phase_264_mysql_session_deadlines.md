# Phase 264：MySQL 会话锁等待与事务期限

## 目标与结论

本阶段完成 `P0.6d-2c-4c`：让在线 MySQL 读穿与持久化事务在 durable HTTP 10 秒响应期限内有明确边界，并区分“根本没开始”“确认未提交”“COMMIT 结果不确定”。这只收紧 Beastbound 自己的连接和进程，不改变共用 MySQL 的全局配置。

生产默认预算：

| 边界 | 默认值 | 实现位置 |
| --- | ---: | --- |
| TCP connect | 2 秒 | mysql2 Beastbound pool |
| pool acquire | 2 秒 | Beastbound 进程 timer |
| Session 初始化 | 1 秒 | Beastbound 进程 timer |
| InnoDB row lock wait | 3 秒 | 每次 checkout 的 `SET SESSION` |
| metadata lock wait | 5 秒 | 每次 checkout 的 `SET SESSION` |
| 整笔 transaction | 6 秒 | Beastbound 进程 hard deadline |
| pool 等待队列 | 64 | mysql2 Beastbound pool |

最坏主路径约为 acquire 2 秒 + Session 初始化 1 秒 + transaction 6 秒，仍小于 durable coordinator 的 10 秒响应上限。

## 共用数据库安全边界

Node/mysql2 的 checked-out connection 就是 JDBC connection/session 的等价边界。每次事务取得连接后、`BEGIN` 前只执行下面一条参数化语句：

```sql
SET SESSION innodb_lock_wait_timeout = ?, SESSION lock_wait_timeout = ?
```

默认参数为 `[3, 5]`。连接池复用物理连接时仍会重新设置，不能依赖进程启动时设置一次。

明确禁止：

- `SET GLOBAL`、`SET PERSIST`、`SET PERSIST_ONLY`；
- 修改 `my.cnf` 或任何 server-wide timeout/lock 配置；
- 为 Beastbound 调整共享 MySQL 而重启数据库；
- 用 mysql2 query `timeout` 冒充事务取消。

Session 初始化失败或超时会强制关闭该连接，且不得执行 `BEGIN` 或业务 SQL。项目根与服务端 `AGENTS.md` 已把该规则固化为后续开发约束。

## 统一事务执行合同

共享资产 RR 读穿、legacy global-CAS、profile/市场/邮件 conditional transaction 现在进入同一个事务守卫：

1. 在 2 秒内取得连接；超时后仍消费晚到结果并立即 release，不能泄漏连接。
2. 在 1 秒内应用 Session 策略；失败即关闭连接。
3. 读穿先设 `REPEATABLE READ`，再 `BEGIN`；写事务直接 `BEGIN`。
4. 所有 query、业务 callback、rollback 和 COMMIT 共用 6 秒绝对期限。
5. 普通 SQL 失败、行锁超时或死锁后显式回滚整笔事务。MySQL 的 row lock timeout 默认只撤销当前语句，不能把它误当成整笔事务已回滚。
6. hard deadline 会先强制 reset 当前 TCP socket，再把连接逐出 pool，避免 mysql2 的优雅 `destroy()` 让阻塞命令继续占用事务。

失败分类：

- `not_started`：pool acquire 或 Session 初始化失败；无 `BEGIN`、无业务 SQL，`outcomeUnknown=false`。
- `rolled_back`：COMMIT 前失败，已完整 rollback 或连接被强制关闭；不得走模糊成功恢复。
- `commit_ambiguous`：COMMIT 已派发但确认丢失；不再发送 ROLLBACK，不自动用新 operation ID 重试。

`commit_ambiguous` 只能由原 operation ID 的 exact durable receipt 与对应 scoped binding/profile/listing/mail/envelope 结果证明成功。仅仅“整个快照碰巧相等”不再足以确认模糊 COMMIT；不能确认时向上返回 `storage_outcome_unknown`。

## HTTP 断线

HTTP request 的断开信号会传到 durable coordinator：

- 操作仍在串行队列、业务函数尚未开始时，可取消为 `storage_request_canceled`，业务函数不会执行；
- 一旦业务函数开始，立刻解除 abort listener；玩家断线不会中断数据库写入或留下半笔结算；
- response timeout 仍只结束等待，不取消已经开始的持久化。

## 实现范围

- `server/node/src/mysql-transaction-guard.js`：Session 策略、acquire/session/transaction timer、连接强制关闭与失败分类。
- `server/node/src/mysql-store.js`：有限 pool、统一读写事务执行器与配置入口。
- `server/node/src/auth-service.js`：确定未提交不再做 ambiguous recovery；模糊 COMMIT 只走 exact scoped receipt。
- `server/node/src/auth/durable-mutation-coordinator.js`、`server/node/src/http-server.js`：只取消未开始的断线请求。
- `tools/p0_6d_mysql_session_deadline_gate.mjs`：一次性隔离 MySQL 9.7 真实门槛。

可调环境变量全部只作用于 Beastbound 进程或 Beastbound Session：

- `BEASTBOUND_MYSQL_CONNECT_TIMEOUT_MS`
- `BEASTBOUND_MYSQL_POOL_ACQUIRE_TIMEOUT_MS`
- `BEASTBOUND_MYSQL_SESSION_SETUP_TIMEOUT_MS`
- `BEASTBOUND_MYSQL_TRANSACTION_TIMEOUT_MS`
- `BEASTBOUND_MYSQL_ROW_LOCK_WAIT_TIMEOUT_SECONDS`
- `BEASTBOUND_MYSQL_METADATA_LOCK_WAIT_TIMEOUT_SECONDS`
- `BEASTBOUND_MYSQL_POOL_QUEUE_LIMIT`

## 验证证据

定向服务端回归共 `303/303` 通过，覆盖 MySQL lifecycle、profile/市场/邮件 conditional transaction、shared RR read、跨 store/harness、durable recovery、HTTP 断线与存储隔离。`auth-storage.test.js` 单独运行，避免其进程级临时目录断言与其他文件并行互相干扰。

一次性隔离 MySQL 9.7 门槛结果：

- Beastbound checkout Session 为 row/metadata `3/5` 秒；
- `@@GLOBAL` 前后均为 `50/31536000`；
- 独立观察连接 Session 前后也为 `50/31536000`；
- pool acquire 100ms 门槛下业务调用为 0，晚到连接被释放；
- 真实 `ER_LOCK_WAIT_TIMEOUT` 约 3.0 秒，超时前的 row/receipt 写入整笔回滚；
- 隔离门槛把 transaction deadline 临时收紧到约 0.5 秒并把 row lock wait 放宽到 30 秒，证明 hard deadline 先触发且先前写入仍回滚；生产默认仍为 6 秒/3 秒；
- 结束后残留事务 0、锁等待 0，临时 datadir 已删除；
- 没有连接共享玩家数据库。

主要命令：

```text
node --test <本阶段 18 个定向测试文件>
node --test server/node/test/auth-storage.test.js
node tools/p0_6d_mysql_session_deadline_gate.mjs
```

## 非目标与剩余风险

- 本阶段没有改变经济规则、锁顺序、协议版本或玩家存档 schema。
- 没有宣称 200 人同图、多 Node 长时容量或公网性能达标；父项 `P0.6d-2c-4` 仍未完成。
- 没有运行完整 local CI，也没有操作共享/真实玩家数据库。
