# Phase 436：跨 owner 聊天历史与队伍状态恢复

## 结果与范围

本阶段完成 `P0.6d-3b-2e`：在 Phase 434 已证明的跨 owner `events.reset` 边界上，补齐队伍与聊天两个领域的
可验证恢复路径。队伍以接管后 `online.snapshot.party` 的当前权威状态收敛；聊天不依赖两个 Node 之间不存在的
统一事件 cursor，而是在 reset 后通过现有认证接口 `/chat/messages` 重取持久历史。

这不是跨 owner 事件逐条 replay。玩家不会丢失仍处于持久聊天窗口内的消息，也不会把旧 Node 的 party 事件
顺序误当成新 Node 的顺序；但超过聊天保留窗口的历史、只存在于进程内的 battle room／邀请／交易／位置，
以及战斗中断后的继续或结算策略仍不在本阶段承诺内。

## 恢复合同

客户端现有 reset 流程会清空易漂移 presence，并分别排队 profile、party、battle、chat、mail、hang 和 online
snapshot。服务端对应本阶段证明的两个来源是：

1. `party`：generation 2 owner admission 先完成持久权威 rebase，随后 WebSocket bootstrap 才生成
   `online.snapshot.party`；客户端用当前状态覆盖旧状态。
2. `chat`：reset 后，客户端已有的 chat domain refresh 使用 `/chat/messages?channel=...`；新 owner 从 rebased
   `chatMessages` 持久根返回最近有界历史，而不尝试重放旧 Node 的私有 `eventSeq`。

该模型刻意区分“状态”与“历史”：队伍只需要当前成员关系；聊天需要用户可见的近期消息，因此由已有持久
历史补回。两者都不需要伪造跨节点全局序号。

## 真实双 Node 门禁

`tools/run_valkey_two_node_event_gate.mjs` 在两个独立游戏 Node、两个 HTTP/WebSocket 端口和一次性 loopback
Valkey 上增加以下夹具：

1. Alice 仍连接 Node A 时，只推进 Node B 的 backing store：写入新账号显示名、profile 标记、持久 party、
   一条 nearby 聊天消息和下一条 service sequence；Node B 的服务内存故意保持旧值。
2. 门禁先断言旧内存没有该聊天消息，而 store 中存在精确 message ID 与正文，避免假阳性。
3. 强杀 Node A；租约到期前 Node B 继续返回脱敏 `503 account_node_switching`。
4. 租约到期后，Alice 的 WebSocket 作为 Node B 第一个成功 admission，触发 generation 2 reload；ready、reset
   与 party snapshot 必须全部来自新权威根。
5. 随后使用 Alice 的真实 bearer token 调用 `/chat/messages?channel=nearby&limit=50`，必须取得那条仅在接管前
   backing store 中存在的消息，并核对 message ID、正文和新显示名。
6. presence revision 继续从第 2 代单调前进；所有进程与临时目录正常清理。

关键回执：

```json
{
  "status": "PASS",
  "partyCurrentStateHydrationProven": true,
  "persistentChatHistoryHydrationProven": true,
  "crossOwnerChatAndPartyRecoveryProven": true,
  "reconnectEventReplayProven": false,
  "battleRuntimeReconnectHydrationProven": false,
  "reconnectHydrationProven": false,
  "persistentServiceStarted": false,
  "temporaryStateRemoved": true
}
```

## 验证与安全边界

- `node --check tools/run_valkey_two_node_event_gate.mjs`：`PASS`；
- 真实 `node tools/run_valkey_two_node_event_gate.mjs`：`PASS`，两个独立 Node、真实 loopback Valkey、聊天历史
  与队伍当前状态恢复均为 true；
- `git diff --check`：`PASS`；
- 不连接共享 MySQL，不写真实玩家数据，不启动持久服务，临时状态全部清理；
- 本阶段只扩展生产门禁与运维说明，不改客户端协议、玩家 UI 或游戏规则。

## 后续边界

下一切片应单独决定 battle 运行态的生产恢复策略：共享／持久化确定性战斗快照，或在 owner 死亡时执行玩家
可理解且可补偿的终止规则。完成后仍需真实共享 MySQL 双 Node、网络分区恢复和 200 连接长时 soak；
`P0.6d-3b`、`P0.6d-3` 与 `P0.6d` 继续保持未完成。
