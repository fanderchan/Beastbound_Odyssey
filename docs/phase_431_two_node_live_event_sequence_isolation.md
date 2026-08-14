# Phase 431：双独立 Node 实时事件与接收端序号隔离

## 结果与范围

本阶段完成 `P0.6d-3b-2a`：两个独立 Node 进程以不同 HTTP／WebSocket 端口和不同稳定
node ID 接入同一真实 Valkey Streams 后，正常账号粘性拓扑下的跨节点位置、世界聊天，以及旧会话
替换通知能够抵达目标进程的真实 WebSocket。

同时修复一个只能在真实多 Node 游标下暴露的正确性问题：`eventSeq` 由每个 `AuthService` 在本
Node 内独立分配。旧中继会把源 Node 的序号原样交给接收 Node；如果接收连接的本地重连游标为
`100`，源 Node 的新事件序号为 `1`，`EventHub` 会把合法远端事件误判成旧帧并静默丢弃。

接收端现在继续使用中继信封 `eventId` 做跨 Node 至少一次去重，但在投影远端实时事件前移除源
Node 私有的 `eventId/eventSeq`。玩家客户端早已把缺失／零 `eventSeq` 视为合法实时帧，因此不改
协议 10；本 Node 自己产生的 replayable 事件仍保留既有本地序号和重连窗口。

这是实时事件切片，不是完整故障恢复。远端事件尚未进入接收 Node 的本地 reconnect replay 窗；
party／battle 运行态的权威接管、离线期间事件 hydration、账号 owner 租约、presence revision
跨 owner 单调接续及 200 连接长时双 Node soak 仍属于后续阶段。

## 为什么不能沿用源 Node 的 `eventSeq`

Phase 428 的中继信封有全局可判重的：

- `originNodeId`；
- `originEpoch`；
- `originSequence`；
- 由前三者确定的 `eventId`。

业务事件内的 `eventSeq` 则只属于源 Node 的 `serviceEvents` 窗口。它服务于该 Node 的
`lastEventSeq + eventStreamEpoch` 重连合同，不是跨 Node 总序。把两种序号混为一个字段会同时造成：

1. 接收端本地游标大于源序号时丢失实时事件；
2. 两个 Node 恰好使用同一序号时把不同事件误判为重复；
3. 客户端把远端序号写回本地游标后，反过来压掉本 Node 后续合法事件。

因此本阶段的最小安全边界是：中继层继续按信封去重；远端玩家帧暂时明确标记为不参与本地
replay cursor。后续不能通过“保留源序号”假装完成恢复，而必须建立接收端自己的 hydration／rebase
合同。

## 真实双进程门槛

`tools/run_valkey_two_node_event_gate.mjs` 每次执行都会：

1. 在随机 loopback 端口和随机临时目录启动无 RDB／AOF 的一次性 Valkey；
2. fork 两个真实 Node 进程，各自创建 `AuthService + EventHub + node:http`，监听不同随机端口；
3. 两个进程使用相同的隔离内存账号快照，但 Node A 的本地事件序号从 `0` 开始，Node B 的
   reconnect cursor 固定为 `100`；
4. 账号甲的 HTTP／WS 都在 A，账号乙的 HTTP／WS 都在 B，符合当前 account-sticky 边界；
5. A 的世界聊天以本地 `eventSeq=1` 发出，A 本地 socket 保留序号，B socket 在游标 `100` 下仍
   收到同一消息，且远端帧不再携带源 `eventSeq/eventId`；
6. A 的服务端逐格移动在 B 的真实 socket 投影为合法 `online.position upsert`，presence revision
   为正且客户端没有 revision 回退；
7. 额外把一个旧会话 socket 放在 B，再在 A 完成合法密码登录，B 精确收到
   `session.replaced` 并关闭目标旧连接；这证明跨 Node 踢旧连接，不等于账号 authority 已接管；
8. 两边 readiness 保持 200，中继租约／reader 健康；随后正常 drain 两个 Node，停止 Valkey并
   删除临时目录。

最终回执：

```json
{
  "status": "PASS",
  "gate": "valkey_two_independent_node_event",
  "engine": "real_loopback_valkey",
  "independentGameNodeProcesses": 2,
  "independentHttpAndWebSocketPorts": true,
  "remoteSourceSequenceBelowReceiverCursorDelivered": true,
  "livePresence": true,
  "liveWorldChat": true,
  "remoteSessionReplacement": true,
  "partyAndBattleAuthorityTakeoverProven": false,
  "reconnectHydrationProven": false,
  "persistentServiceStarted": false,
  "temporaryStateRemoved": true
}
```

## 验证

- `event-hub.test.js`：`59/59 PASS`，新增接收游标 `100` 对源序号 `31/32` 的定向回归；
- cluster config／relay／Valkey bridge：`11/11 PASS`；
- 真实双 Node 门槛连续两次 `PASS`；
- changed Node syntax、`git diff --check` 和暂存区检查通过；
- 两次门槛后均没有 Valkey service、遗留进程或 `beastbound-two-node-gate-*` 临时目录。

门槛使用隔离内存档案，只验证真实进程、传输、适配器与 WS 投影；没有连接 MySQL，没有 DDL／DML，
没有触碰玩家档案，也没有修改 MySQL `GLOBAL/PERSIST`。

## 后续边界

下一切片必须实现并证明：账号 owner 租约与到期接管；新 owner 的 presence revision 单调基线；
连接中断期间 chat／party／battle 的权威 hydration；party invite／battle room 等运行态不会只留在死亡
进程；网络分区和 replay window 耗尽时失败关闭并从权威状态 rebase。上述完成后才有资格执行
200 连接长时双 Node soak，父项 `P0.6d-3b` 与 `P0.6d` 继续保持未完成。

## Phase 432 后续说明

本页回执记录的是 Phase 431 提交时的历史门槛。Phase 432 启用账号 owner 后，跨 Node 登录不再允许
先改会话、再靠远端 `session.replaced` 补救；当前同名工具已扩展为先证明 wrong-node 登录在 mutation
前返回 503，再证明同 owner 会话替换、强杀 owner、租约到期接管及 presence revision 换代。实时事件
序号隔离结论不变，新增结论见 `docs/phase_432_valkey_account_owner_takeover.md`。
