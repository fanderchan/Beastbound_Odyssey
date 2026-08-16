# Phase 454：跨 Node 正常战斗状态与命令委派

## 结果与范围

本阶段完成 `P0.6d-3b-2m`：账号当前由 Node B 接入、战斗运行态仍由 Node A 持有时，B 可以通过既有
Valkey Streams 集群通道向 A 委派 `/battle/state` 和普通 `/battle/rooms/:roomId/commands`，玩家无需
回到原节点，也不会把 bearer token、Authorization 头或密码放进 Valkey。战斗房间、随机状态和回合推进
仍只存在于 A；B 只认证当前请求、持有账号 generation、转发有限意图并返回 A 的公开结果，不复制或
拼装半份战斗权威。

本阶段没有实现房主进程崩溃后的战斗运行态 hydration。A 明确失去 Node 租约时，仍沿用 Phase 437～440
已经验证的中立终止：不计胜负、稳定恢复回执、允许重新开战。宽口径网络分区与反代／TLS 也没有借本项
冒充完成，因此 `P0.6d-3b`、`P0.6d-3`、`P0.6d` 和 `P0.6` 继续保持未完成。

## 权威与安全合同

1. B 先在本机按原 HTTP 合同认证 bearer，再取得账号当前 owner generation、角色 `playerId` 和
   `selectionEpoch`；集群请求只携带这些有限身份、房间、公开命令和幂等意图。
2. A 执行前用 Valkey Lua 原子核对“账号 owner 节点 + generation”仍精确等于 B。账号 owner 租约值现在
   绑定 `nodeId:processToken`，旧 generation、错误节点或已释放 owner 均不能执行。
3. A 只为通过核对的请求签发进程内 WeakSet capability；capability 同时绑定账号、角色和选择代次，且
   必须仍是房间参与者。复制同字段得到的普通对象会在任何回执读取前失败，公共
   `submitBattleCommand` 入口也不能把伪对象解释为集群身份。
4. 请求以 SHA-256 intent 绑定类型、request id、请求节点、owner generation、房间、payload 和 durable
   operation。响应必须来自已观察到的房主节点，且 room id、响应类型、请求节点和 relay origin 全部一致。
5. `cluster.control.battle.*` 帧在 EventHub 内部被截获，不进入玩家投影、WebSocket replay 或普通远端事件
   observer；普通 battle／party／presence 事件仍按原中继合同到达玩家。
6. 已知房主租约仍存活而委派超时时失败关闭为脱敏 `503`；只有已知房主租约明确消失时，才把原持久
   interruption 交回既有中立恢复流程。未知房主不会被猜成已死亡。

## 幂等、终局与账号迁移

- 活房主以账号 + operation id 缓存有界 promise/result；同 request hash 与 action 精确重放，改变意图
  返回 `idempotency_key_conflict`，不会再执行一次命令。
- 普通非终局回合继续是运行态写；终局结算仍由 A 在唯一 MySQL COMMIT 中写战绩、角色资产和角色范围
  durable receipt。即使房主路由缓存丢失，同 operation 也从精确回执返回 `replayed=true`，不会生成第二
  条战绩。
- 账号 authority rebase 继续清目标账号 position、邀请、trade 和进程会话，但可显式保留当前进程拥有的
  battle room／recovery。账号迁回房主时不会误删整场房间或另一参战者的恢复状态；默认 reset 调用仍保持
  原来的全清语义。

## 真实双节点门禁

新增并执行：

```bash
node tools/run_valkey_two_node_event_gate.mjs --mysql-battle-routing-only
```

门禁使用两个独立 Node／HTTP／WebSocket 进程、真实 loopback Valkey，以及随机非 `3306` 端口、随机业务
库的一次性 MySQL `9.7.0-er2`：A 建立并持有切磋房间后，测试只迁移其中一个账号到 B。B 能读取 A 的
第 1 回合状态、提交一次普通攻击、对同 operation 精确重放，并拒绝改变 payload 的重放；A 的另一条命令
令回合只结算一次。双方 WebSocket 各只收到一份公开命令／回合事件，任何内部控制帧均不可见。

随后把账号从 B 释放并由 A 重新取得，A 的房间仍在第 2 回合；B 用旧 generation 发送的控制请求和真实
HTTP 请求都在执行前返回 `account_node_switching`。独立 MySQL 复核运行态房间未落库、双方 failure
ticket 保留、战绩未被非终局回合写入。最终回执为：

```json
{
  "status": "PASS",
  "crossNodeBattleStateDelegationProven": true,
  "crossNodeNormalBattleCommandRoutingProven": true,
  "remoteCommandExecutedExactlyOnce": true,
  "exactReplayStable": true,
  "alteredReplayRejected": true,
  "roundResolvedExactlyOnce": true,
  "publicBattleEventsReachedBothNodes": true,
  "clusterControlFramesHiddenFromPlayerWebSockets": true,
  "staleOwnerControlRejected": true,
  "staleOwnerHttpRejectedBeforeExecution": true,
  "runtimeOnlyBattleRoomStayedOnOwnerNode": true,
  "persistentFailureTicketsPreserved": true,
  "rawBearerAndPasswordAbsentFromValkeyStream": true,
  "mysqlGlobalValuesUnchanged": true,
  "mysqlDeadlockDelta": 0,
  "mysqlResidualTransactions": 0,
  "mysqlResidualLockWaits": 0,
  "battleRuntimeReconnectHydrationProven": false,
  "networkPartitionRecoveryProven": false,
  "temporaryDatabaseDropped": true,
  "mysqlCleanupVerified": true,
  "temporaryStateRemoved": true
}
```

既有房主强杀门禁也重新执行并 `PASS`：第 2 代接管、中立恢复、同 operation 稳定重放、战绩不变和重新
开战全部保持，证明本次正常委派没有吞掉原故障恢复语义。

## 验证

- 变更 JavaScript 全部 `node --check`：通过；
- cluster router、HTTP、EventHub、Valkey owner／bridge、战斗、durable receipt、认证与相邻集群合同：
  `270/270`；
- 真实 `--mysql-battle-routing-only`：最终硬化后再次 `PASS`；
- 既有 `--mysql-battle-only`：`PASS`；
- `git diff --check`：通过；
- 完整 `npm --prefix server/node test` 已运行但没有作为本项绿灯：其失败包含干净基线
  `e7e2832bd` 可同命令复现的既有 Boss／骑乘／毒伤／迁移与性能夹具问题；抽取 8 个代表文件在干净基线
  与当前候选均为相同 `24` 个失败，本阶段定向矩阵没有新增红灯。

门禁没有连接共享玩家库、读取本机数据库凭据、修改 MySQL `GLOBAL/PERSIST/PERSIST_ONLY`、启动持久
服务、改变数据库 schema、公共协议、玩家 UI、战斗规则或经济数值；临时 Node、Valkey、MySQL、业务库
和目录均已清理。

## 后续边界

- 战斗运行态在房主崩溃后的 hydration／半场续战；
- 宽口径网络分区中的请求归属、迟到响应和恢复证明；
- 反向代理、TLS 与正式部署拓扑验收。

上述项目完成前，不宣称任意节点故障下无缝续战，也不关闭 `P0.6d-3b`。
