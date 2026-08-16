# Phase 463：双 Node 战斗运行态检查点与半场接管

## 结果与范围

本阶段完成 `P0.6d-3b-2n`：战斗房主 Node 在回合中被强杀后，只要最后一次已确认操作对应的
Valkey 运行态检查点仍有效，另一 Node 可以在旧租约到期后取得新 generation，恢复同一房间、同一回合、
已提交命令和私有随机权威，并继续结算，而不是无条件把玩家送回中立终止流程。

运行态房间仍不进入 MySQL 玩家权威快照。MySQL 只保留 Phase 437 建立的双方 failure ticket，作为接管时
重新认证房间与真人参与者的持久事实；Valkey 只保存有 TTL、有大小上限、带 checksum 的临时私有快照。
损坏、过大、票据过期或参与者冲突的快照不会被猜测修复，仍回到既有“不计胜负、稳定恢复、可重开战斗”
中立通道。因此本项没有删除原故障兜底，也没有把临时战斗房间误持久化到玩家数据库。

本阶段没有完成宽口径网络分区、反向代理或 TLS 部署验收，`P0.6d-3b`、`P0.6d-3`、`P0.6d` 和
`P0.6` 继续保持未完成。

## 运行态权威合同

1. 每个活跃房间在 Valkey 使用 SHA-256 房间键、`nodeId:processToken` owner token、单调 generation 和
   独立快照 TTL；generation 与 snapshot 同步续期、正常释放后同期限过期，原始 room id 不出现在 key 名中。
2. 房主第一次 checkpoint 原子建立 owner lease 与 snapshot；续写必须精确持有同一 token。租约被抢占、
   本地已过期或快照缺失都会令旧进程 fatal，旧 owner 不能静默重新取得写权。
3. 正常关机只释放 owner、短期保留 generation 与 snapshot，允许立即迁移；正常终局或主动离开会原子删除
   owner、generation 与 snapshot，避免房间代际键永久残留。
4. 创建庄园战房间、队伍遇敌、接受切磋、普通战斗命令和离开房间的 HTTP 成功响应，都必须等待相应
   checkpoint 完成。运行态写失败时不向客户端伪装“已安全接管”。本地 battle 事件另有串行补点，避免
   同一房间并发覆盖乱序。
5. 接管方只有在路由超时且活房主不能继续响应时才 claim；随后用进程内 WeakSet capability 调用内部
   hydration。复制 capability 字段的普通对象会在读取或发布任何运行态之前被拒绝。
6. hydration 重新核对双方持久 failure ticket、房间 id 和其他活跃房间冲突；成功后恢复完整私有 room、
   32 字节随机 secret 和剩余命令时间，并给予最短重连宽限。公开 room 永不暴露 secret、checksum 或
   `clusterCommandReceipts`。

## 命令幂等与随机连续性

- 非终局战斗命令继续不写 MySQL durable receipt。房间私有快照新增最多 32 条 operation receipt，绑定
  operation id、request hash、action id 与账号，并保存当次公开响应；接管后原 operation 返回完全相同的
  room／command／turn／message，改变意图固定返回 `idempotency_key_conflict`。
- 终局结算仍沿用角色范围 MySQL durable receipt 和唯一战绩，不由 Valkey 快照替代。
- 战斗随机 authority 新增只供集群内部使用的 base64url secret 导出／恢复。长度、编码和已有 secret 冲突
  均失败关闭；相同 room + context 在接管前后得到相同 roll，不能退回公开 seed 或重新掷一次随机结果。
- 快照 checksum 覆盖 schema、房间、检查点时间、剩余 deadline 和随机 secret；总大小默认限制 8 MiB，
  TTL 默认 6 小时，owner lease 默认跟随账号租约。以上均可通过有界环境变量配置。

## 启动、健康与回退

新增 battle runtime 独立 GLIDE control client，并把健康状态纳入 `/health/ready`。控制连接失败、租约过期、
续约失败或旧 owner 写入都会让 readiness 失败，必要时触发既有 fatal drain。正式入口只在集群运行时、
权威存储和服务都初始化成功后打开监听端口；故障门禁为一次性 MySQL 冷启动保留独立 30 秒 worker 预算，
不放宽正式默认 15 秒 Node／账号／战斗租约。优雅关机先停止 HTTP／WebSocket 与 durable admission，等待
该房间全部串行 checkpoint 和存储 flush 完成，再释放战斗 runtime 与账号 owner，避免接管方无谓等待旧租约。

无快照门槛仍单独执行原中立恢复路线：第 2 代账号接管、双方稳定恢复回执、战绩不变和重新开战全部通过。
因此“有可信快照则续战、无可信快照则中立终止”两条合同均保留。

## 真实双节点故障门禁

新增并执行：

```bash
node tools/run_valkey_two_node_event_gate.mjs --mysql-battle-hydration-only
```

门禁启动两个独立 Node／HTTP 进程、真实 loopback Valkey，以及随机非 `3306` 端口和随机业务库的一次性
MySQL `9.7.0-er2`。Node A 创建正式切磋并提交第 1 回合一方命令；HTTP 返回后强制 `SIGKILL` A。
租约到期后 Node B 从 MySQL 第 2 代账号事实与 Valkey 私有快照恢复同一 room：回合仍为 1、已提交账号
仍存在、interruption 清空。B 对 A 已确认的 operation 精确重放，响应逐字段一致；改变 payload 的重放
返回 409。另一方随后防御，第 1 回合只结算一次并进入第 2 回合。门禁还在崩溃前后分别取得随机 secret
的 SHA-256 摘要并强制相等；只传递摘要、不输出 secret，因此随机连续性由真实进程接管直接证明。

最终门禁回执：

```json
{
  "status": "PASS",
  "roomOwnerCrashedWithSigkill": true,
  "halfFinishedRoundHydrated": true,
  "submittedCommandPreserved": true,
  "randomAuthorityContinuationHydrated": true,
  "exactNonterminalReplayStable": true,
  "alteredReplayRejected": true,
  "roundResolvedExactlyOnceAfterTakeover": true,
  "runtimeOnlyBattleRoomStayedOutOfMysql": true,
  "persistentFailureTicketsPreserved": true,
  "runtimeTakeovers": 1,
  "runtimeCheckpoints": 6,
  "rawBearerAndPasswordAbsentFromValkeyStream": true,
  "mysqlGlobalValuesUnchanged": true,
  "mysqlDeadlockDelta": 0,
  "mysqlResidualTransactions": 0,
  "mysqlResidualLockWaits": 0,
  "battleRuntimeReconnectHydrationProven": true,
  "temporaryDatabaseDropped": true,
  "mysqlCleanupVerified": true,
  "temporaryStateRemoved": true
}
```

既有 `--mysql-battle-routing-only` 和无快照 `--mysql-battle-only` 也再次 `PASS`：正常跨 Node 状态／命令
委派、精确重放、旧 generation 拒绝，以及中立恢复／重新开战均未回归。

## 验证与安全边界

- RNG、运行态 domain、Valkey lease/store、router 和 cluster config：`21/21`；
- 完整战斗房间、cluster account boundary 与 HTTP 跨 Node 路由：`76/76`；
- 默认 HTTP 启动／健康、HTTP 战斗路由和 cluster config：`41/41`；
- durable commit、failure ticket、runtime recovery 与 MySQL 精确回执：`68/68`；
- HTTP cluster admission 与优雅关机 ownership drain：`6/6`；
- 真实 `--mysql-battle-hydration-only`、`--mysql-battle-routing-only`、`--mysql-battle-only`：全部 `PASS`；
- 变更 JavaScript／MJS `node --check` 与 `git diff --check`：通过。

门禁没有读取本机玩家数据库凭据、连接共享玩家库、修改 MySQL `GLOBAL/PERSIST/PERSIST_ONLY`、启动持久
服务、改变公共协议、战斗数值、经济规则或玩家 UI。临时 Node、Valkey、MySQL、业务库和目录均已清理。

## 后续边界

- 宽口径网络分区中的迟到房主响应、双向隔离与恢复证明；
- 反向代理、TLS 与正式部署拓扑验收。

上述项目完成前，不宣称所有网络故障下无缝续战，也不关闭 `P0.6d-3b`。
