# Phase 432：Valkey 账号 owner 接管与 presence revision 换代

## 结果与范围

本阶段完成 `P0.6d-3b-2b`：在 Phase 430/431 的真实 Valkey Streams 与双 Node 实时事件之上，
增加每账号独占 owner 租约，并把正确密码登录、已有 bearer HTTP 请求和 WebSocket 握手放到同一
mutation 前置围栏。错误节点不能再先撤销旧会话或写入业务状态、再靠远端事件事后补救。

强杀原 owner 后，另一 Node 只有在租约真实到期后才能取得下一代 owner。每次新一代接管都会把该
账号的 presence revision 下限提高十亿；因此客户端不会把新 owner 的合法位置误判成旧 revision。

这仍不是完整横向恢复。远端断线期间事件 hydration、party／battle 运行态权威接管、死亡进程内
临时状态的持久化/rebase、网络分区耗尽后的恢复，以及 200 连接长时双 Node soak 均留在后续。

## Owner 合同

`server/node/src/valkey-account-owner.js` 使用独立官方 GLIDE control client：

- 启动必须真实 `PING` 成功；独立控制连接失败会立即令账号归属 readiness 变红，不能借事件桥的
  另一条健康连接冒充 owner 可用；
- Valkey key 只含固定 namespace 与账号 ID 的 SHA-256，不含明文账号；value 是进程随机 token；
- token-checked Lua 原子执行 acquire／renew／release。空 owner 才能 `INCR` 持久 generation 并
  `PSETEX`；同 token 只续期；其他 token 只返回有界剩余 TTL；
- 默认租约 15 秒，每三分之一窗口续约；默认最多持有 4,096 个账号、同时最多 1,024 个新 admission，
  续约以 64 个为一批并行，避免按账号串行耗尽租期；
- 本机曾持有的租约一旦被替换、过期或失去连续性，不允许原地悄悄重取，整个 Node 进入 fatal 并
  触发既有 drain；revision floor 不能被服务采用时也会先释放新租约并 fatal；
- health/metrics 只投影健康、fatal、持有数、pending 数和计数，不暴露 node ID、账号、key hash、
  token、Valkey 地址或凭据。

## Mutation 前置顺序

HTTP bearer 请求先用 `AuthService._clusterIngressIdentity()` 只读解析 token，不写 runtime session；
有效身份取得/确认 owner 后，才进入原服务方法。`/auth/refresh` 只有该路径显式允许 refresh grace。

HTTP 登录先完成既有有界异步 scrypt，再以 `_httpClusterLoginIdentity()` 对摘要做常量时间匹配。只有
正确凭据才申请 owner；错误密码不创建 key。owner 冲突在 `_httpLoginPasswordDigest()` 前返回 503，
因此旧 session 不会被 wrong-node 登录撤销。

WebSocket 在 `getEventSession()` 可能记录 runtime 在线状态之前，先以同一只读 token 身份申请 owner；
随后再次授权并核对 account/session 未发生竞态变化，才建立连接、加载 replay 和标记在线。

注册生成的是此前不存在的随机 account ID，不存在旧 owner 可接管；其首个 bearer 请求或 WS 仍会
先取得 owner。跨 Node 新账号即时数据 hydration 不属于本阶段证明。

正常关机先停止新 TCP、关闭 WS、排空 durable mutation 并 flush store，最后才释放账号租约。进程
崩溃不会执行 release，只能等待 TTL；旧 token 不能删除后来 owner 的租约。

## Presence revision 换代

owner generation 只增不减，每代对应 `generation * 1,000,000,000` 的 revision floor：

- 第 1 代采用 `1,000,000,000`，下一次位置事件从 `1,000,000,001` 开始；
- 第 2 代采用 `2,000,000,000`，下一次位置事件至少为 `2,000,000,001`；
- `raiseFloor()` 只允许单调提高，本机已有更高值时绝不回退；每代被硬限制在自己的十亿编号窗口，
  窗口耗尽或新代与当前值重叠会明确抛错停止发号，绝不越界侵入下一代。

这解决 owner 切换后的实时 presence 版本倒退；它不把远端事件改造成接收 Node 的 reconnect cursor，
Phase 431 的 live-only 序号隔离边界保持不变。

## 真实双 Node 门槛

`tools/run_valkey_two_node_event_gate.mjs` 现在执行：

1. 随机 loopback 端口启动无 AOF/RDB 的一次性 Valkey；
2. fork 两个独立游戏 Node，各自拥有 HTTP/WS 端口、事件 consumer group、node lease 和 account owner；
3. 账号甲固定在 A、账号乙与替换验证账号固定在 B，继续证明位置、世界聊天和源序号 `1` 小于接收
   cursor `100` 时仍送达；
4. 替换账号已由 B 持有时，在 A 用正确密码登录明确返回 `503 account_node_switching`，B 的旧 session
   和 WS 保持有效；在 B 登录才正常产生 `session.replaced` 并关闭旧 socket；
5. `SIGKILL` 强杀 A，B 在原 TTL 内仍被拒绝；租约到期后 B 取得第 2 代 owner，并用同一旧 token
   完成位置同步；
6. B 上观察者收到的新位置 revision 至少 `2,000,000,001`，且严格大于 A 第 1 代最后 revision；
7. B readiness 保持 200，随后正常 drain，停止 Valkey并删除临时目录。

回执关键字段：

```json
{
  "status": "PASS",
  "gate": "valkey_two_node_event_and_account_takeover",
  "independentGameNodeProcesses": 2,
  "crossNodeLoginConflictBeforeMutation": true,
  "sameOwnerSessionReplacement": true,
  "crashedOwnerLeaseExpiryTakeover": true,
  "presenceRevisionGenerationAdvanced": true,
  "partyAndBattleAuthorityTakeoverProven": false,
  "reconnectHydrationProven": false,
  "temporaryStateRemoved": true
}
```

## 验证与安全边界

- owner／presence／配置／服务身份／HTTP 认证与入口聚焦测试 `26/26 PASS`；
- EventHub `60/60 PASS`，包含 owner 在 session authorization 前执行及冲突释放 pending admission；
- 相邻 HTTP／公网安全／relay／bridge `61/61 PASS`；
- 原真实 Valkey bridge 完整入口门槛继续通过；扩展双 Node owner 门槛连续执行两次；
- changed Node syntax、`git diff --check` 与暂存区审计通过；
- 每次真实门槛后均无 Valkey service、遗留 Node/Valkey 进程或临时目录。

所有门槛使用隔离 memory store；没有连接共享 MySQL，没有 DDL/DML，没有触碰玩家档案，也没有修改
MySQL `GLOBAL/PERSIST`。Homebrew Valkey 仅作为一次性本机测试二进制运行，没有注册常驻 service。

## 后续边界

下一切片必须建立 reconnect hydration 与权威 rebase：死亡 Node 上尚未 ACK/投影的 chat、party、battle
事件如何恢复；party invite／battle room 等进程运行态如何被新 owner 接管；replay window 耗尽和
网络分区时如何失败关闭并从共享权威状态重建。完成后才进入 200 连接长时双 Node soak；
`P0.6d-3b`、`P0.6d-3` 与 `P0.6d` 继续保持未完成。
