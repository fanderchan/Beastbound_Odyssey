# Phase 434：跨 owner 重连状态 reset hydration

## 结果与范围

本阶段完成 `P0.6d-3b-2d`：账号从死亡 Node 接管到新 owner 时，不尝试把旧 Node 私有 `eventSeq`
伪装成新 Node 的可重放游标，而是利用每个 EventHub 独立的 `eventStreamEpoch` 明确触发
`events.reset`。新 owner 必须先完成 Phase 433 的持久权威 rebase，随后才允许读取 replay catalog、
授权 WebSocket 和生成 `events.ready / events.reset / online.snapshot`。

因此客户端在跨 owner 重连时会得到一个可判定的状态收敛边界：ready 中的账号与 latest sequence、reset
中的新 epoch，以及 snapshot 中的 presence／持久队伍都来自接管后的权威根，而不是接管 Node 的旧缓存。

本阶段证明的是 persistent state reset hydration，不是远端事件逐条 replay。死亡 Node 上只存在于运行内存的
battle room、邀请、交易和位置仍不会复活；跨 owner 的 chat／party／battle 事件缺口也没有获得统一全局
cursor。真实共享 MySQL、网络分区恢复和 200 连接长时 soak 仍未完成。

## 为什么使用 reset，而不是复用远端序号

`eventSeq` 与 `eventStreamEpoch` 原本就是单 EventHub 的重连合同。两个 Node 可以同时拥有相同的数字序号，
也可能一个 Node 的 cursor 已到 `100`、另一个 Node 才发出 `1`。Phase 431 已经证明把源序号直接交给接收
Node 会静默丢帧，因此远端实时事件继续移除源 `eventId/eventSeq`，只由 cluster envelope 做至少一次去重。

跨 owner 重连时：

1. 客户端携带旧 Node 的 epoch 与 cursor；
2. 新 Node 的 EventHub epoch 与旧值不同；
3. cursor authority 返回 `replayMode=reset / reason=epoch_mismatch`；
4. server 发送新权威窗口和 online snapshot，不播放两个局部序号空间之间无法证明顺序的事件；
5. 客户端清空易漂移 presence，并重新拉取档案、队伍、战斗状态、聊天、邮件和挂机状态。

这是保守但可证明的恢复：玩家最终看到当前权威状态，不会因为伪造一个跨 Node 总序而漏掉合法事件或把旧
事件应用到新状态之上。需要逐条补回的离线聊天／战斗事件仍等待单独的全局 cursor 或 durable inbox 设计。

## Admission 与 bootstrap 顺序

`EventHub` 的生产顺序固定为：

```text
token 只读身份
  -> Valkey owner admission
  -> generation 接管权威 rebase
  -> session 再授权
  -> replay catalog
  -> event connection / online snapshot
  -> ready + reset + snapshot
```

新增回归让 `accountAdmission.admit()` 异步推进账号显示名、持久 party 和 latest event sequence；只有 admission
Promise 完成后，fake service 才允许 authorization、replay 与 snapshot。最终帧必须同时满足：

- `events.ready.account.displayName` 为接管后的值；
- `events.ready.latestEventSeq` 为接管后的值；
- `events.ready.replayMode=reset`；
- `events.reset.reason=epoch_mismatch` 且 latest sequence 相同；
- `online.snapshot.party` 为接管后的持久队伍。

这条门槛防止未来重构把“先发旧 snapshot、后台再 reload”引入 WS 路径。

## 真实双 Node 门槛

`tools/run_valkey_two_node_event_gate.mjs` 继续使用两个独立游戏 Node、两个 HTTP/WebSocket 端口和一次性
loopback Valkey，并把接管步骤改为：

1. 在 Node A 保存 Alice 的真实 `eventStreamEpoch` 和最后 cursor；
2. Node B 的 backing store 独立推进账号显示名、profile revision/标记、持久 party 和下一条 service
   event sequence，但 B 的服务缓存保持旧值；
3. `SIGKILL` A，租约未到期时 B 的 HTTP 请求仍返回脱敏 503；
4. 租约到期后，Alice 带 A 的 epoch/cursor 连接 B；该 WebSocket 是 B 对该账号的第一个成功 admission；
5. generation 2 owner observer 先 reload，再生成 bootstrap；
6. ready 使用新账号与 backing-store latest sequence，reset 明确 `epoch_mismatch`，snapshot 直接包含新 party；
7. 随后的 position 写复用已取得 owner，并继续证明 presence revision 跨代单调；
8. 正常 drain，临时 Valkey 与目录全部移除。

关键回执：

```json
{
  "status": "PASS",
  "takeoverWebSocketFirstSuccessfulAdmission": true,
  "ownerEpochResetBeforeReconnectSnapshot": true,
  "persistentReconnectStateHydrationProven": true,
  "reconnectEventReplayProven": false,
  "battleRuntimeReconnectHydrationProven": false,
  "reconnectHydrationProven": false,
  "persistentServiceStarted": false,
  "temporaryStateRemoved": true
}
```

保留宽口径 `reconnectHydrationProven=false` 是刻意的：只有账号/profile/持久 party 的 reset state hydration
已证明，不能把它解读为 chat／party／battle 远端事件逐条补播或战斗运行态续接。

## 验证与安全边界

- EventHub 定向回归 `61/61 PASS`，其余 Phase 433 认证、HTTP/WS、Valkey、MySQL 与存储相邻矩阵
  `106/106 PASS`，组合共 `167/167 PASS`；
- 扩展真实双独立 Node Valkey 门槛 `PASS`；
- 客户端现有 reset 处理会清 presence，并排队 profile、party、battle、chat、mail、hang 与 online snapshot
  恢复；本阶段不改客户端协议或玩家 UI；
- 隔离暂存候选先完成 Godot 资源导入，随后 parse `PASS`；`--auto-auth-server-client-check` 的业务自检
  输出 `status=ok`、`reconnect_ui=true` 且所有字段为 true，但现有 runner 会把该历史输出中的
  `error=true`（错误映射合同通过）按通用失败字段解释，因此 wrapper 仍返回 failed。本阶段不把它记作
  runner PASS，也不混入无关工具修复；
- changed syntax、`git diff --check` 与隔离暂存候选均已验证；
- 没有连接共享 MySQL、没有 DDL/DML、没有触碰玩家数据或 MySQL `GLOBAL/PERSIST`。

## 后续边界

下一切片应选择跨 owner 事件缺口策略：为 chat 等需要逐条保留的领域建立全局有界 cursor／durable inbox，
并为 battle room 明确共享运行态、确定性快照恢复，或玩家可理解的判负／重开规则。两者都不能从 Valkey
consumer ACK 或本机 service `eventSeq` 猜出来。之后仍需真实共享 MySQL 双 Node 和 200 连接长时 soak；
`P0.6d-3b`、`P0.6d-3` 与 `P0.6d` 继续保持未完成。
