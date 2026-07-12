# Phase254：P0.6b 在线 presence 增量与 WebSocket 背压

## 问题复现

Phase168 已能按地图和格子判断 AOI，但它只在结果层过滤，没有建立连接订阅桶。当前一次位置变化会先为移动者重建完整在线名册，再遍历全部 WebSocket；每个观看者又重新扫描、排序全部 session/account，并重新生成最多 64 人的 `players`。

Apple M5、Node `v25.8.1`、HEAD `c9cb8f46ef6c66fb3251e95aae0d159ae942272c` 的隔离内存复现固定 200 个活跃账号在同一 AOI：

- 单次原始位置更新约 `12–14ms`；
- 对 200 个 session 执行当前观看者投影约 `2.20–2.39s`；
- 200/200 连接可见，但每包重复携带最多 64 人名册，总 JSON 约 `4.76–5.06MiB`；
- 当前只读 `listOnlinePlayers` 经资产级 durable candidate 约 `60–192ms`；
- 200 个并发 durable roster read 只有 128 个被接纳，另外 72 个返回 `storage_queue_full`；
- 假慢 socket 连续 10,000 次 `write(false)` 后仍未断开，当前没有 drain、队列字节预算、合并或阻塞超时。

这证明当前路径既不是 touched-character 增量，也会让纯在线读取挤占充值资产的单 writer。

## Beastbound 原创规则

### 1. 内部权威位置与公开 presence 分离

- `playerPositions` 继续作为单 Node 的 runtime-only 权威位置，供移动、遇敌、交易距离、组队跟随、战斗返回和庄园等现有规则使用；本阶段不把它持久化，也不大改这些消费者。
- 资产事务内产生的战斗/转生返回位置继续使用既有 request-private runtime merge：COMMIT 前不发布，失败不残留。
- 普通 `/players/position` 与 `/movement/step` 是运行时位置操作，不进入资产 durable coordinator，不触发 store save。
- `scope=map` 即使携带服务端校验所需的私有格子，也只公开地图精度；格子仍可作为内部移动锚点。只有明确的权威逐格移动事件才向允许看到它的观看者公开格子。

### 2. 初始快照一次，后续只发单角色增量

- WebSocket 建连仍发送一次 `online.snapshot`，用于重连后完整重建客户端缓存。
- 后续 `online.position` 不再携带 `players` 全名册，而是对每个观看者生成一个角色的最终变化：

```json
{
  "type": "online.position",
  "change": "upsert",
  "accountId": "acc_...",
  "player": {},
  "presenceRevision": 12
}
```

或：

```json
{
  "type": "online.position",
  "change": "remove",
  "accountId": "acc_...",
  "presenceRevision": 12
}
```

- `upsert` 覆盖进入 AOI 和 AOI 内移动；`remove` 覆盖离开 AOI、跨地图和下线清理。新旧位置都不可见时不发送。
- 观看者自己移动会收到同一条 `online.position change=rebase`，其中只有 `presenceRebase.upserts/removedAccountIds` 的 AOI 边界差量；这解决静态玩家进入/离开新视野的问题，不向所有观看者恢复完整 roster。map-only 同图移动通常是空差量，跨图最多受 64 条快照上限约束。
- 同账号增量带单调 `presenceRevision`；snapshot 与 rebase 中的每个角色也携带自己的 revision，客户端按账号忽略旧 revision。
- 同一慢连接的多个未发远端 `upsert/remove` 只保留该账号最新最终状态，并保留其最后入队时刻相对其他事件的顺序；观看者自己的 `rebase` 是连续边界差量，必须走有界有序 FIFO，不能只留最后一条，否则会漏掉跨越多个 AOI 边界的成员变化。
- HTTP 位置/移动响应只返回自己的权威位置、移动结果、队伍和私有 encounter permit；不再附带远端完整名册。远端缓存由 WS snapshot/delta 维护。
- 这是实际不兼容的事件合同，客户端与服务端协议统一升级为 v8，不保留可被恶意省略 capability 参数重新触发 O(N²) 的旧 fanout。

### 3. 地图/AOI 连接订阅桶

- Event hub 建立 `account → connections`、`session → connections`、全局订阅、地图订阅与固定格子桶索引。
- 位置变化只取新旧地图/格子覆盖的候选连接，再做一次精确 Chebyshev AOI 判断；不再对不相关地图遍历或投影。
- 观看者自身位置变化时原子迁移订阅桶。map-only 观看者订阅整张地图；精确 AOI 默认 18、最大 48 格，语义保持 Phase168 不变。
- targeted party/battle/session 事件优先用账号/会话索引，不再无条件遍历所有连接。
- 初始 roster 与显式 `GET /players/online` 仍保留最多 64 条；客户端世界绘制仍保留既有 24 人安全上限。200 人容量表示 200 个连接可同图活动和接收正确增量，不等于一次画出 200 个角色。

### 4. Presence 读取不占资产 writer

- 新增只读事件会话授权，只校验既有 session/account，不补档、不写 party presence、不克隆权威根。
- `GET /players/online` 只计算即时展示；队伍在线状态由 runtime activity 派生。十分钟离线自动踢仍由 `getPartyState` 等显式 durable maintenance 负责，不能藏在 roster read 中。
- WS 普通建连、在线快照、无战斗连接的断开均不进入 durable coordinator。只有确实存在活动战斗房间时，连接状态才走原有 durable battle 边界。
- Presence 阶段 store save 和 durable accepted 增量都必须为 0，不能让 200 个在线读取挤占资产提交队列。

### 5. 每连接有界出站 writer

每个连接统一使用一个 writer：

- `socket.write(false)` 后停止继续写，等待 `drain`；
- replayable chat/party/battle/session 使用有序 critical FIFO，不静默丢弃；
- 远端 `online.position upsert/remove` 按 `accountId` 合并并移动到统一 FIFO 的最新位置；自身 `rebase` 不合并；
- 默认最多排队 128 帧、256KiB；持续背压最多 2 秒；任一硬门槛超出就断开慢消费者，让其通过 replay + snapshot 恢复；
- replay 期间的 live event 也进入同一预算，不能另设无界 `pendingLiveEvents`；
- 同账号多个 socket 使用引用计数，最后一个相关连接关闭时才标记战斗 disconnected；`session.replaced` 发出后关闭目标旧 session 连接。

`/health.eventStream` 只暴露安全指标：连接数、背压连接数、当前全局排队帧/字节、全局历史峰值、单连接历史峰值、已发送帧/字节、合并次数和慢消费者断开数，不暴露账号、token 或事件正文。全局峰值用于容量观察；128 帧/256KiB 是单连接硬预算，不能把多个连接同时各排一帧误判成单连接越界。

## 客户端合同

- 新增 focused presence cache model：`online.snapshot` 完整替换；`online.position upsert/remove/rebase` 只按账号修改；同账号旧 revision 丢弃；缓存仍最多 24 个可绘制远端玩家。
- 普通 HTTP position/movement 回包缺少 `players` 时不得把现有缓存清空。
- WebSocket 每帧最多处理 8 包的既有限制保持；重连后的 snapshot 是 presence 丢包/合并后的权威恢复边界。
- 玩家 UI、地图绘制样式和中文文案不变，本阶段没有新的可见调试信息。

## 验收门槛

容量工具使用独立服务器 worker，预种 200 个隔离测试账号；业务流量只走真实 `127.0.0.1` HTTP/WebSocket。正常场景预热 5 次、采样 20 次：

| 指标 | 门槛 |
| --- | ---: |
| 200 个 WS 全部 ready + snapshot | 总计 ≤ 10s，失败 0 |
| HTTP movement ack p95 | ≤ 75ms |
| 最后一个相关 WS 收到 delta p95 | ≤ 150ms |
| fanout spread p95 | ≤ 100ms |
| 同 AOI 每次移动 delta | 精确 200 条，重复/丢失 0 |
| 单条 steady-state delta p95 | ≤ 2KiB，禁止 `players` roster |
| 每次移动 200 人 application JSON | ≤ 400KiB |
| presence 阶段 store save / durable accepted | 0 / 0 |
| 正常消费者背压或断开 | 0 |
| 强制 GC 后 heap 增长 | ≤ 32MiB |
| 在线测量 peak RSS 增长 | ≤ 128MiB |

慢消费者同时用确定性假 socket和真实 loopback raw socket验证：假 socket 精确断言 write-false/drain、合并、关键 FIFO、256KiB/128 帧硬上限与 2 秒超时；真实慢连接在 5 秒内被隔离，其他正常连接继续收到最终 sentinel，不能被连带断开。

## 测试矩阵

- presence delta：同桶移动、跨桶仍可见、进入、离开、跨地图、自身移动后订阅 rebase、map-only、旧 revision、重连 snapshot。
- 只读边界：roster/position/普通 WS handshake 为 0 durable、0 store save；party 自动踢仍通过 durable `getPartyState` 生效。
- runtime merge：并发资产 COMMIT 不覆盖更新的位置；失败 COMMIT 不发布事务内返回位置；普通移动不进入持久根。
- WS writer：write false 后停写、drain 恢复不重复；presence 合并；critical 不被覆盖；超帧/超字节/超时断开；close/error/shutdown 清理 listener/timer/index。
- 连接生命周期：同账号双连接引用计数、session replacement 精确关闭、战斗内连接状态继续可靠。
- 既有回归：auth/session、social/world、party、battle room、economy/trade distance、family/manor、storage、durable COMMIT、HTTP/WS replay。
- Godot：parse、auth-server-client、online AOI、online position、server event、event replay、移动 spam 与 idle/moving perf。

## 实现与验证结果

### 服务端与客户端实现

- `auth/online-presence.js` 将 revision、单角色 upsert/remove 和观看者 rebase 从 `auth-service.js` 中隔离；远端投影剥离新旧精确内部坐标，显式 AOI/map 请求缺少权威位置时失败关闭。
- 在线账号/session 索引只在冷启动构建一次，并在 durable 根替换时继承；5 万历史 session/account 冷构建约 `17.32ms`，缓存命中约 `0.030ms`，无关资产保存换根后约 `0.050ms`。
- runtime session/位置副作用在 MySQL COMMIT 后才发布；logout 提交期间同账号移动有 barrier，失败提交不会提前下线或留下幽灵位置。普通位置、presence 维护和 roster 读取保持 runtime-only。
- Event hub 使用账号/session/地图/AOI 桶选择候选连接；统一 writer 在 `write(false)` 后等 `drain`，普通远端 presence 可按账号合并，自身 rebase 与关键事件保持 FIFO。健康指标区分全局峰值与单连接峰值。
- Godot 使用 focused presence cache 接收 snapshot/upsert/remove/rebase，按账号 revision 抗乱序并保留 24 人绘制上限；HTTP 位置回包没有 `players` 时不再清空缓存。三项 live QA 已同步升级到 v8 WS 合同，并支持通过 `BEASTBOUND_AUTH_SERVER_URL` 指向隔离后端。

### 200 连接短门禁

Apple M5、Node `v25.8.1`，独立 JSON/内存测试状态、真实 `127.0.0.1` HTTP/WebSocket，5 次预热和 20 次采样：

| 指标 | 结果 |
| --- | ---: |
| 200 WS ready + snapshot | `44.171ms`，200/200 |
| movement HTTP ack p95 | `2.719ms` |
| 最后相关 WS delta p95 | `2.633ms` |
| fanout spread p95 | `1.970ms` |
| 单条 delta p95 | `828B` |
| 单次移动 application / wire 最大值 | `176633B / 177433B` |
| 20 次采样 | 每次 200 条，重复/缺失/非法/roster 泄漏均 0 |
| presence store save / durable accepted | `0 / 0` |
| heap / peak RSS 增长 | `0.102MiB / 0.609MiB` |
| 正常消费者背压/断开 | `0 / 0` |

真实 raw 慢连接连续接受 `1184/1184` 次合法移动后，于 `178.340ms` 被单独隔离、`178.758ms` 收到 TCP close；正常连接最终 sentinel 为 `0.322ms`。全局瞬时峰值为 129 帧（慢连接 128 + 正常连接 1），单连接峰值严格为 `128` 帧、`172224B`，慢消费者断开计数精确增加 1。

### 回归证据

- Node 最终跨域：presence/social/durable/battle/HTTP/protocol/event hub `162/162`；economy/trade/family/storage `73/73`；指标修正后的 HTTP + event hub `45/45`。
- 容量工具：`node tools/p0_6_presence_ws_gate.mjs` 通过，普通场景和真实慢消费者场景均无失败。
- Godot 4.7 parse 通过；client protocol v8 通过；隔离端口 `18787` 的 online position、AOI、server event 三项 live QA `3/3` 通过，未连接 8787 或真实 MySQL。
- panel registry、map panel、movement `3/3`；离线性能 `8/8`：idle p95 `0.470ms`、moving p95 `0.330ms`、317 次点击 spam p95 `0.450ms`、`max_input_us=145`，合并/settled/final match 均通过。
- 宽口径 `auth-server-client` 中本阶段 online/position/movement/event 均为 true；唯一 `shop=false` 是 2026-07-12 起已存在且与本阶段无关的旧失败，未借本阶段修改商店。
- `git diff --check` 通过；临时 18787 服务与 Godot 检查进程均已关闭。

## 非目标与剩余风险

- 不处理公网可信代理、HTTP body、WS 入站 frame/fragment/opcode、Origin、token/限流、TLS 和掉线风暴；属于 P0.6c。
- 不做 30 分钟聊天/移动/战斗混合 soak；本阶段只有短时 200 loopback 机制门槛，不能据此宣称生产环境已稳定支持 200 人同图。
- 不做跨进程事件总线、多 Node presence 或数据库 CAS/行锁；属于 P0.6d。
- 不改变玩家可见角色绘制上限、地图美术、移动手感或战斗规则。
- replay cursor 过旧、未来 cursor 和 server epoch 的完整 reset/resync 合同仍需在 P0.6c 的重连风暴与公网边界中一起收口；本阶段保证慢消费者在当前 500 条窗口内可重连恢复。
- 不连接、不修改真实 MySQL、账号或玩家数据。

## 实际涉及文件

- 新增 focused WS presence subscription/cache 模块；
- `server/node/src/event-hub.js`、`http-server.js`；
- `server/node/src/auth-service.js` 只做只读授权、delta projection、revision 与接线；
- `client/godot/scripts/net/` 下 focused presence cache model；
- `client/godot/scripts/progression/server_auth_client_model.gd` 与 coordinator 薄接线；
- `server/node/src/protocol.js`、协议与聚焦测试；
- `tools/p0_6_presence_ws_gate.mjs`；
- 本文与 `stoneage_gap_plan.md`。

若实现能以更小改动满足同一合同，可缩小范围；不得为了本阶段把所有内部位置消费者推翻重写。
