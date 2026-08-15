# Phase 441：Valkey 单节点分区与旧 owner 写栅栏

## 结果与范围

本阶段完成 `P0.6d-3b-2j`：两个独立 Node 共用真实 loopback Valkey 与隔离 MySQL 时，只切断 A 的
Valkey 链路而保持 B 可达。A 在租约失效前已经接纳、且真实阻塞于 MySQL 全局修订行的战斗开场写入，会由
cluster fatal transaction fence 在 COMMIT 发出前摧毁连接并以已知未提交失败；A 随后退出，B 在租约到期后
以第 2 代 owner 重载同一 MySQL 权威根并完成一场新的切磋开场 COMMIT。

这关闭了“Valkey 单节点分区时旧 owner 的 pre-COMMIT 写入仍可能在失去租约后提交”的竞态。它不等于宽口径
网络分区恢复：MySQL 可达性分区、COMMIT 已发出后的数据库结果确认、跨 Node 正常战斗命令路由、半场续战和
200 连接长时 soak 仍未证明，`P0.6d-3b` 与横向部署总门槛继续保持未完成。

## 运行时修复

正常停服与集群 fatal 现在使用不同语义：

- 正常 `SIGTERM`／`SIGINT` 仍先停止新 durable admission，再等待已经接纳的写入完成；既有安全停服合同不变；
- Valkey node lease 或 account owner lease 进入 fatal 时，入口先触发 Node 生命周期专属 `AbortSignal`，再执行
  HTTP／WebSocket／durable／store drain；
- 正式 MySQL store 把这个 signal 绑定到其连接池的所有 guarded transaction。若 signal 在 COMMIT 发出前触发，
  transaction guard 立即 reset/destroy checked-out socket，返回 `mysql_transaction_rolled_back`、
  `transactionFenced=true`、`noCommitGuaranteed=true`，连接不会回池，也不会再发送 COMMIT；
- 若 fatal 与已经发出的 COMMIT 竞速，仍按既有 `mysql_commit_outcome_ambiguous` 合同处理，绝不把未知结果误报成功；
- signal 在事务正常完成时移除，deadline timer 同时清理；无 signal 的单 Node／维护工具路径保持原行为。

## 真实故障门禁

新增命令：

```bash
node tools/run_valkey_two_node_event_gate.mjs --valkey-partition-only
```

门禁序列如下：

1. 启动一次性 MySQL `9.7.0-er2`、随机非 3306 loopback 端口和临时 datadir；在随机业务库写入五账号夹具，
   A／B 使用仅存在于该实例的两个独立临时数据库用户；
2. 启动真实 Valkey。A 的全部 GLIDE 连接经可切断本地 TCP proxy，B 直连 Valkey；两个 Node 都使用正式
   mysql2 pool、async store 与 cluster account admission；
3. A 取得双方第 1 代 owner，建立相邻位置与切磋邀请。测试 admin 对 `auth_store_revisions('auth')` 持有
   `FOR UPDATE`，A 接受邀请后可在 `performance_schema.data_lock_waits` 精确看到同一主键上的 X lock wait；
4. 只关闭 A 的 proxy listener 和全部已建 socket。B 的 Valkey readiness 继续为 200，并在旧 lease 到期前返回
   `503 account_node_switching`；
5. A 同时观察到 `cluster_valkey_node_lease_expired` 与 `cluster_account_owner_lease_expired`。事务栅栏使旧 HTTP
   写入约 3.6 秒即返回 `503 storage_write_failed`，显著早于刻意配置的 15 秒行锁等待上限；A 以退出码 1
   完整失败关闭；
6. 只有确认 A 已退出后才释放测试锁。独立 verifier 证明全局修订增量为 0、双方 failure ticket 为 0、
   `battleRooms=0`、`battleRecords=0`；
7. B 在第 2 代 presence floor 上重新设置双方位置，建立并接受新邀请。该 COMMIT 成功后全局修订相对初始值
   恰好 `+1`，双方各有一张新 failure ticket，证明旧写没有偷跑、新 owner 写也没有被测试锁伪阻塞；
8. 最终 live MySQL transaction／lock wait、detached instrumentation row、deadlock 增量均为 0；临时库、
   Node、Valkey、mysqld 与目录全部清理。

MySQL 9.7 在被 reset 的客户端正阻塞于行锁时，服务端 instrumentation 记录可短暂晚于客户端 fence 消失。
门禁因此同时记录锁对象与 processlist owner，区分 live transaction 和无 live thread 的 detached 观测记录；
最终仍要求二者全部归零，并以 B 对同一全局修订行的成功 COMMIT 作为实际可写性的最终证据。

## 关键回执

```json
{
  "status": "PASS",
  "engine": "real_cuttable_tcp_valkey_and_isolated_mysql",
  "mysqlVersion": "9.7.0-er2",
  "partitionScopedToOldNodeValkeyLink": true,
  "successorValkeyLinkStayedHealthy": true,
  "oldWriteEnteredMysqlLockWait": true,
  "oldWriteSpannedLeaseFatal": true,
  "oldOwnerTransactionFenceProven": true,
  "oldOwnerCommitAfterLeaseLoss": false,
  "oldOwnerExitedBeforeInjectedLockRelease": true,
  "oldOwnerFatalExitCode": 1,
  "oldWriteFailedAfterMs": 3652,
  "configuredRowLockWaitTimeoutMs": 15000,
  "failedOldWriteAuthRevisionDelta": 0,
  "successorGenerationTwoTakeoverProven": true,
  "successorBattleCommitProven": true,
  "successorAuthRevisionDelta": 1,
  "mysqlDeadlockDelta": 0,
  "mysqlResidualTransactions": 0,
  "mysqlResidualLockWaits": 0,
  "mysqlDetachedInstrumentationTransactionsBeforeInstanceStop": 0,
  "mysqlDetachedInstrumentationLockWaitsBeforeInstanceStop": 0,
  "mysqlNetworkPartitionRecoveryProven": false,
  "twoHundredConnectionSoakProven": false,
  "temporaryDatabaseDropped": true,
  "mysqlCleanupVerified": true,
  "temporaryStateRemoved": true
}
```

## 验证

- `node --check`：transaction guard、MySQL store、HTTP server 与双 Node 门禁均通过；
- `node tools/run_valkey_two_node_event_gate.mjs --valkey-partition-only`：连续两次 `PASS`；
- `node tools/run_valkey_two_node_event_gate.mjs`：默认真实 Valkey 事件／聊天／队伍／账号接管／JSON 战斗恢复继续
  `PASS`；
- `node tools/run_valkey_two_node_event_gate.mjs --mysql-battle-only`：共享隔离 MySQL owner 强杀恢复继续 `PASS`；
- MySQL transaction、durable、HTTP、cluster config、Valkey owner／stream 聚焦组合 `119/119`；其中生产 HTTP
  入口测试证明 fatal signal 先于 drain 触发，正常停服测试
  继续证明已接纳 COMMIT 会被排空，而不是被 cluster-only fence 误取消；
- `git diff --check`：通过；运行后无专用 Node worker、Valkey、mysqld、随机业务库或临时目录残留。

本阶段没有连接共享玩家库、读取本机数据库凭据、修改 MySQL 全局参数、启动持久服务、改变公共协议、玩家 UI、
战斗数值或数据库 schema 合同。

## 后续边界

下一切片应执行 200 连接双 Node 长时 soak，并在明确故障模型后单独覆盖 MySQL 可达性分区与 COMMIT outcome
恢复。跨 Node 正常回合路由和半场续战仍是独立产品／架构决策，不由本阶段的中性重开路径代替。
