# Phase 452：MySQL 单节点分区与 COMMIT 结果精确恢复

## 结果与范围

本阶段完成 `P0.6d-3b-2l`：两个独立 Node 共用真实 loopback Valkey 与同一个一次性
MySQL `9.7.0-er2` 业务库时，只切断 A 的 MySQL 链路而保持 B 的 MySQL／Valkey 链路健康。
A 在 COMMIT 前失联时不会落库，并在权威存储健康探测确认失败后先触发事务栅栏、再安全排空退出；
当 COMMIT 已送达 MySQL、只有确认回包丢失时，服务端只通过原 `operationId` 的精确回执行确认结果，
不会盲重试事务或把未知结果误报成功。

真实门禁连续两次 `PASS`。COMMIT 回包丢失场景中档案 revision 只增加 `1`、回执物理行只有 `1`；
随后 A 的 pre-COMMIT 战斗写在约 `30–31ms` 内失败，全局 auth revision 增量为 `0`。A 以
`storage_health_unavailable` 和退出码 `1` 失败关闭，B 以第 2 代 owner 接管；同一档案操作在 B
只返回 `replayed=true`，档案和全局 revision 增量均为 `0`，之后 B 的新战斗开场 COMMIT 令全局
revision 恰好 `+1`。

这关闭的是“单个游戏 Node 到权威 MySQL 的可达性分区”和“COMMIT 确认回包丢失”两条明确故障模型，
不等于跨机房或多链路宽口径网络分区。跨 Node 正常战斗命令路由、战斗运行态 hydration 与反代／TLS
仍未证明，因此 `P0.6d-3b`、`P0.6d-3`、`P0.6d` 和 `P0.6` 均保持未完成。

## 失败语义

### COMMIT 前失联

- 默认正式 HTTP 入口把权威存储健康探测失败提升为一次性的 `storage_health_unavailable` fatal；
- fatal 先 abort Node 生命周期专属事务 signal，再停止 HTTP／WebSocket／durable admission、排空并关闭
  account owner；正常 `SIGTERM`／`SIGINT` 仍等待已经接纳的 COMMIT，语义不变；
- 已经开始但尚未发送 COMMIT 的 MySQL 事务销毁 checked-out 连接，只能返回已知未提交失败；
- 即使 MySQL 服务端被锁住的语句短暂晚于客户端断线消失，也必须在测试锁释放后归零，且不能推进
  revision、战斗票据或战绩。

`createHttpServer` 只有在调用方显式提供 `onStorageFatal` 时才采用这一进程生命周期策略；默认正式入口和
双 Node worker 已接入，普通嵌入式／单元测试 server 不会被隐式结束。

### COMMIT 后确认回包丢失

- MySQL TCP proxy 识别真实 mysql2 `COM_QUERY COMMIT`，先完整转发给 mysqld，再只丢弃该连接的下一份
  server response；监听器和其他连接保持健康；
- transaction guard 将原连接标记为 `mysql_commit_outcome_ambiguous` 并销毁，绝不发送 ROLLBACK；
- 服务层以同一 `operationId` 从独立连接执行参数化主键回执读；只有回执、request hash、action、账号和
  重载后的权威根全部一致，才返回原结果的 `replayed=true`；
- 精确读缺失、损坏或权威根不能重载时仍为 outcome unknown，同 operation 也不得重新执行。

## 真实故障门禁

新增命令：

```bash
node tools/run_valkey_two_node_event_gate.mjs --mysql-partition-only
```

门禁序列：

1. 启动随机非 `3306` 回环端口、临时 datadir 的一次性 MySQL 和随机业务库；为 A／B 创建仅存在于该
   实例的独立临时用户，并启动真实 Valkey；
2. A 的全部 mysql2 pool 连接经故障 proxy，B 直连同一 MySQL；两个独立 Node 同时预加载权威根；
3. 对 A 的 `record_point_save` 装配稳定 `Idempotency-Key`，只丢弃 COMMIT 确认回包；A 通过精确回执
   恢复并返回成功，独立 verifier 确认档案 revision `+1`、回执行 `1`；
4. A 取得两名切磋账号的第 1 代 owner。测试连接锁住 `auth_store_revisions('auth')`，A 的战斗开场写进入
   可观测的真实 InnoDB lock wait；
5. 只分区 A 的 MySQL proxy。B readiness 仍为 `200`，租约切换前明确返回
   `account_node_switching`；A 的旧写返回 `storage_write_failed`，随后存储健康 fatal 令 A 退出；
6. 只有确认 A 已退出才释放测试锁。独立 verifier 证明旧写 revision 增量 `0`、failure ticket `0`、
   battle room／record 均为 `0`；
7. B 第 2 代接管后，用相同 operation 重放 A 已提交的记录点，档案／全局 revision 均不再增加、回执仍
   只有一行；随后 B 成功提交新的切磋开场，revision 恰好 `+1`、双方各有一张 failure ticket；
8. 最终 MySQL 全局参数不变，deadlock、live transaction、lock wait 和 detached instrumentation 均为
   `0`；临时数据库、Node、Valkey、mysqld 与目录全部清理。

## 关键回执

```json
{
  "status": "PASS",
  "mysqlVersion": "9.7.0-er2",
  "partitionScopedToOldNodeMysqlLink": true,
  "successorMysqlLinkStayedHealthy": true,
  "commitPacketForwardedBeforeAckDrop": true,
  "commitAcknowledgementDropped": true,
  "exactDurableReceiptRecoveryProven": true,
  "commitRecoveryReturnedReplay": true,
  "commitRecoveryReceiptRows": 1,
  "commitRecoveryProfileRevisionDelta": 1,
  "crossNodeExactReplayProven": true,
  "crossNodeReplayAuthRevisionDelta": 0,
  "crossNodeReplayProfileRevisionDelta": 0,
  "oldOwnerStorageHealthFatalProven": true,
  "oldOwnerPreCommitNoWriteProven": true,
  "oldOwnerFatalExitCode": 1,
  "failedOldWriteAuthRevisionDelta": 0,
  "successorGenerationTwoTakeoverProven": true,
  "successorAuthRevisionDelta": 1,
  "mysqlDeadlockDelta": 0,
  "mysqlResidualTransactions": 0,
  "mysqlResidualLockWaits": 0,
  "mysqlNetworkPartitionRecoveryProven": true,
  "temporaryDatabaseDropped": true,
  "mysqlCleanupVerified": true,
  "temporaryStateRemoved": true
}
```

## 验证

- health monitor、transaction guard／deadline 与精确回执读：`31/31`；
- COMMIT 模糊、跨 Node 回执与禁止重执行聚焦：`8/8`；
- 完整 HTTP 服务回归：`34/34`；
- 新 MySQL 分区／COMMIT 恢复真实门禁：连续两次 `PASS`；
- 既有 Valkey 单节点分区门禁：`PASS`；
- 既有双 Node 共享隔离 MySQL 战斗接管门禁：`PASS`；
- 既有默认 Valkey 双 Node 事件／账号接管门禁：`PASS`；
- changed JavaScript `node --check` 与 `git diff --check`：通过。

本阶段没有连接共享玩家库、读取本机数据库凭据、修改 MySQL `GLOBAL/PERSIST/PERSIST_ONLY`、启动持久
服务、改变数据库 schema、公共协议、玩家 UI、战斗规则或经济数值。

## 后续边界

下一技术切片仍应在独立架构合同下处理跨 Node 正常战斗命令路由；战斗运行态 hydration 和反代／TLS 继续
分别保留，不用已经验证的 owner 故障中性终止冒充无缝续战。
