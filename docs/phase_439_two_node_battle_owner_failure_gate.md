# Phase 439：真实双 Node 战斗 owner 强杀与中性恢复门槛

## 结果与范围

本阶段完成 `P0.6d-3b-2h`：扩展 `tools/run_valkey_two_node_event_gate.mjs`，在两个独立 Node、两个独立
HTTP／WebSocket 端口和真实 loopback Valkey 上创建一场正式 ready 切磋，强杀持有双方账号与战斗运行态的
Node A，再由 Node B 取得第 2 代账号 owner。B 不伪造丢失的运行态房间，而是从共享持久权威读取双方
failure ticket，通过公共接口中性终止，并证明本场不产生胜负、双方可重新开战。

这证明的是“owner 故障后的安全恢复”，不是半场无缝续战。运行态 `battleRooms` 继续不持久化；共享 MySQL、
网络分区、跨 Node 正常战斗命令路由和 200 连接长时 soak 仍未完成，因此 `P0.6d-3b` 与横向部署总门槛保持
未完成。

## 隔离权威夹具

原有实时事件／账号接管门槛继续使用各 Node 独立的内存 store，保持既有陈旧缓存与手工推进 backing-store
场景不变。战斗验证使用第二对全新 Node 和一个只存在于一次性临时目录的共享 JSON store：

- 两个 Node 在开战前同时启动，因此 B 的服务内存保持开战前旧状态；
- 强杀前只允许 A 执行业务写，强杀并等租约到期后只允许 B 写，避免 JSON 全快照 store 的并发覆盖；
- 两个专用账号使用完整合法角色战斗档案和十点元素配点，不绕过生产战斗 admission；
- Valkey 只负责真实 node/account 租约与 generation，JSON 只代替尚未执行的共享 MySQL 隔离环境。

这个夹具可以证明两个真实进程对同一持久事实的接管顺序，但不能表述为生产共享 MySQL 已验收，也不能证明
JSON store 适合作为多写者生产存储。

## 强杀与恢复序列

1. Node A 为双方建立相邻位置，完成 `/battle/invite` 与 accept；两边 `/battle/state` 均返回同一个
   `status=ready` 房间且没有 interruption。
2. 强杀前直接复核共享存储：运行态 `battleRooms=0`、`battleRecords=0`，双方活动 session 各有且仅有一张
   合法 `battle_failure_<32 hex>` 票据，两张票据指向同一 room 但 ticket ID 不同。
3. 对 A 执行真实 `SIGKILL`。租约到期前 B 必须返回脱敏 `503 account_node_switching`；到期后双方请求成功，
   随后位置 revision 均达到 `2,000,000,001+`，证明已进入第 2 代 owner。
4. B 的双方 `/battle/state` 都必须是 `room=null`，并返回同一旧 room 的公共
   `battle_owner_interruption`；不会把 B 的空运行态误报为仍在战斗。
5. 每个账号都从自己的公开 ticket 确定性派生 `bbo_battle_recover_<32 hex>`，调用
   `/battle/interruption/recover`。同 operation ID 重放必须返回 `durableCommit.replayed=true`，票据清除后
   `/battle/state` 的 interruption 为 null。
6. 双方互查战绩均为 `total/wins/losses/draws = 0`。重新建立位置后再次邀请并接受，得到与故障房间不同的
   ready roomId，证明双方没有因孤儿房间或票据残留而被永久锁死。

## 关键回执

```json
{
  "status": "PASS",
  "battleOwnerFailureNodeProcesses": 2,
  "battleOwnerFailureSharedJsonAuthorityFixtureProven": true,
  "battleOwnerFailureGenerationTwoTakeoverProven": true,
  "battleOwnerFailureTicketTakeoverProven": true,
  "battleOwnerFailureNeutralRecoveryProven": true,
  "battleOwnerFailureStableRecoveryReplayProven": true,
  "battleOwnerFailureWinLossUnaffected": true,
  "battleParticipantsCanRematchAfterRecovery": true,
  "sharedMysqlBattleTakeoverProven": false,
  "crossNodeNormalBattleCommandRoutingProven": false,
  "battleRuntimeReconnectHydrationProven": false,
  "temporaryStateRemoved": true
}
```

保留 `partyAndBattleAuthorityTakeoverProven=false` 与 `battleRuntimeReconnectHydrationProven=false` 是刻意的：本阶段
没有恢复丢失房间或半场状态，只证明中性终止所需的持久票据权威能够安全接管。

## 验证与安全边界

- `node --check tools/run_valkey_two_node_event_gate.mjs`：通过；
- `node tools/run_valkey_two_node_event_gate.mjs`：真实门槛连续两次 `PASS`，包含原有事件／聊天／队伍接管与
  新增战斗 owner 强杀子门槛；
- `git diff --check -- tools/run_valkey_two_node_event_gate.mjs`：通过；
- 运行后无 `beastbound-two-node-gate-*` 临时目录、Node worker 或专用 Valkey 进程残留；
- 没有连接共享 MySQL、没有读取或修改真实玩家数据、没有启动持久服务，也没有修改客户端协议、玩家 UI、
  战斗数值或服务端生产规则。

## 后续边界

下一阶段进入真实共享 MySQL 双 Node、网络分区／rebase 和 200 连接长时门槛。跨 Node 正常战斗命令路由与
半场无缝续战仍是独立架构／产品决策；当前已验收的中性终止方案足以防止故障场次记胜负或永久卡战，但不能
替代这些证据。
