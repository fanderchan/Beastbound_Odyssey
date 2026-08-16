# Phase 468：同节点 Valkey／MySQL 双链路分区与旧 owner 写栅栏

## 结果与范围

本阶段完成 `P0.6d-3b-2p`：两个独立 Node 共用真实 loopback Valkey 与同一个一次性
MySQL `9.7.0-er2` 业务库时，A 的 Valkey 和 MySQL 链路分别经过测试拥有的故障代理，B 则始终直连
两项依赖。A 的战斗开场写已经到达真实 MySQL、并阻塞在 `auth_store_revisions('auth')` 行锁上以后，
门槛在同一故障边界静默黑洞 A 的 MySQL 传输并切断 A 的 Valkey 连接。

真实门槛最终连续两次 `PASS`。A 的首个 fatal 始终是 account owner 或 Valkey node lease 失效，
事务栅栏在 COMMIT 前摧毁 checked-out MySQL 连接；旧 HTTP 请求约 `3.1–3.2s` 返回
`503 storage_write_failed`，没有迟到成功，独立 verifier 确认 auth revision 增量、failure ticket、
battle room 和 battle record 均为 `0`。只有 A 退出后门槛才释放注入锁，B 随后以第 2 代 owner 接管，
新战斗 COMMIT 令 revision 恰好 `+1`。

这证明的是“单个旧 owner 同时失去两条依赖链路，而另一节点与两项依赖仍健康”的精确故障模型。
它不等于宽口径网络分区：生产入口分区、跨可用区链路、Node 间双向隔离和全部依赖同时不可用均未由
本门槛覆盖，因此 `broadNetworkPartitionRecoveryProven=false`，横向部署父项继续保持未完成。

## 故障注入合同

- MySQL 故障代理新增单向状态切换 `blackhole()`：已建立 TCP 连接不主动关闭，后续 client/server 字节
  只计数并丢弃；它与既有“COMMIT 确认丢失”和“立即断开全部 socket”模式互斥，旧门槛语义不变；
- 黑洞前必须至少存在一条 A 的 mysql2 真实连接，且 `performance_schema.data_lock_waits` 必须已经看到
  A 对全局修订行的真实等待，避免用尚未到达数据库的请求冒充在途事务；
- MySQL 黑洞先置位，随后立即切断 A 的 Valkey listener 和全部连接。B 的 storage 与 cluster relay
  readiness 在故障期间都必须保持健康，旧租约到期前仍明确返回 `account_node_switching`；
- A 必须先观察到 Valkey/account lease fatal。持续 MySQL 黑洞导致的 storage health fatal 可以随后出现，
  但不得排在 lease fatal 之前，也不能改变已经触发的 transaction-only fence；
- 旧请求只允许已知未提交失败，不允许 `2xx` 或 COMMIT。即使 MySQL 服务端的锁等待观测短暂晚于客户端
  fence 消失，释放注入锁后 live/detached transaction 与 lock wait 都必须归零；
- B 的 Valkey 与 MySQL 均绕过 A 的故障代理，接管后必须以 generation 2 presence floor 和独立的新事务
  成功开战，作为依赖健康、旧写未偷跑和新 owner 可写的共同证据。

## 真实故障门槛

新增命令：

```bash
node tools/run_valkey_two_node_event_gate.mjs --dual-dependency-partition-only
```

门槛只使用随机非 `3306` 回环端口、临时 datadir、随机业务库、临时 MySQL 用户和真实 loopback Valkey。
它不会读取本机玩家库凭据，也不会连接共享玩家数据库。完整序列为：

1. 启动一次性 MySQL 与真实 Valkey，写入五账号权威夹具；A/B 以不同临时 MySQL 用户连接同一业务库；
2. A 的 Valkey／MySQL 分别接入可切断代理和可黑洞代理，B 直连；两个 Node 均通过正式 cluster admission、
   mysql2 pool、async store 与 HTTP durable mutation 路径启动；
3. A 取得切磋双方第 1 代 owner、建立相邻位置与邀请；独立连接锁住全局修订行，直到 A 的接受邀请事务
   出现在真实 InnoDB lock wait；
4. 记录 A 的 MySQL 活连接数后启用静默黑洞，并切断 A 的 Valkey。代理必须实际丢弃至少一个方向的
   MySQL 字节；B 同时保持 readiness `200`；
5. 验证 A 的 lease fatal 排在 storage fatal 之前、旧请求为 `503`、A 退出码为 `1`，且此时测试锁仍未释放；
6. 释放锁并从直连 verifier 证明旧写 revision 增量 `0`、没有战斗票据／房间／战绩；
7. 等待租约到期后由 B 取得第 2 代 owner，重新设置双方位置并成功完成新战斗开场，revision 恰好 `+1`；
8. 验证 MySQL 全局值不变、deadlock／live transaction／lock wait／detached instrumentation 均为 `0`，
   再删除临时数据库并停止两个 Node、两个代理、Valkey、mysqld 和临时目录。

## 关键回执

最终复跑之一：

```json
{
  "status": "PASS",
  "engine": "real_cuttable_tcp_valkey_blackholed_tcp_mysql_and_isolated_mysql",
  "mysqlVersion": "9.7.0-er2",
  "oldNodeValkeyAndMysqlLinksPartitionedTogether": true,
  "mysqlBlackholeConnectedPairsAtStart": 1,
  "mysqlBlackholedServerBytes": 81,
  "mysqlBlackholeSpannedLeaseFatal": true,
  "oldOwnerFirstFatalCode": "cluster_valkey_node_lease_expired",
  "oldOwnerStorageHealthFatalBeforeLeaseLoss": false,
  "lateOldOwnerSuccessResponse": false,
  "oldWriteEnteredMysqlLockWait": true,
  "oldOwnerTransactionFenceProven": true,
  "oldOwnerCommitAfterLeaseLoss": false,
  "oldOwnerExitedBeforeInjectedLockRelease": true,
  "oldOwnerFatalExitCode": 1,
  "oldWriteFailedAfterMs": 3179,
  "failedOldWriteAuthRevisionDelta": 0,
  "successorGenerationTwoTakeoverProven": true,
  "successorBattleCommitProven": true,
  "successorAuthRevisionDelta": 1,
  "mysqlGlobalValuesUnchanged": true,
  "mysqlDeadlockDelta": 0,
  "mysqlResidualTransactions": 0,
  "mysqlResidualLockWaits": 0,
  "broadNetworkPartitionRecoveryProven": false,
  "temporaryDatabaseDropped": true,
  "mysqlCleanupVerified": true,
  "temporaryStateRemoved": true
}
```

## 验证

- 新双依赖分区真实门槛：最终代码连续两次 `PASS`；
- 既有 `--valkey-partition-only`：`PASS`，只断 Valkey 的旧 owner 写栅栏语义保持；
- 既有 `--mysql-partition-only`：`PASS`，COMMIT 确认精确恢复与立即 MySQL 分区语义保持；
- health monitor、MySQL transaction deadline／guard、account owner、Valkey bridge 与完整 HTTP 聚焦组合：
  `67/67`；
- `node --check tools/run_valkey_two_node_event_gate.mjs` 与 `git diff --check`：通过；
- 每次成功或失败运行后均无专用 Node worker、Valkey、mysqld、随机业务库或临时目录残留。

本阶段没有修改生产运行时、数据库 schema、公共协议、玩家 UI、战斗规则或经济数值；没有读取本机数据库
凭据、连接共享玩家库、修改 MySQL `GLOBAL/PERSIST/PERSIST_ONLY` 或启动持久服务。

## 后续边界

下一步若继续关闭横向部署父项，应使用真实生产候选入口和部署拓扑，分别验证 account-sticky、代理健康切换、
跨可用区与 Node 间链路故障；不能把本机 loopback、B 始终健康的单旧节点双依赖门槛外推为生产宽分区结论。
