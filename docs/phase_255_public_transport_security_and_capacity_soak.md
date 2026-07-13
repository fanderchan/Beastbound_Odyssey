# Phase255：P0.6c 公网 HTTP/WS 边界与 30 分钟混合容量门槛

## 目标

P0.6b 只证明了 200 个 loopback 玩家在短时同 AOI presence fanout 下可以正确、低延迟地工作。本阶段补齐公网入口的资源边界、协议失败关闭、可信网络身份、重连恢复和长时间混合负载。只有本阶段通过后，才能形成“当前单 Node 在本机与本合同负载下具备 200 人运行基线”的结论；不能把它宣传为任意公网、任意 MySQL 或多 Node 已经稳定。

所有实现与门禁都在隔离 worker 内运行，绝不连接或清理真实 MySQL、账号和玩家数据。业务权威状态使用隔离 fixture，但持久化不能退化成 memory/JSON no-op：必须经过 production `createMysqlAuthStore()` 的增量 planner、`saveAsyncOwned()` 路径与 recording fake pool/fake CLI，并明确报告 `realMysql=false`。fake pool 只模拟事务、SQL 触达行和 COMMIT 延迟，不建立数据库网络连接。TLS 由反向代理终止；多 Node 数据竞争留给 P0.6d。

## 已复现基线（HEAD 798e5407）

### HTTP

- JSON body 无大小、Content-Type 或读取 deadline：`4,194,318B` 请求被完整接收后才返回业务 403；隔离审计中 `2MiB text/plain` JSON 也被接受。
- `X-Forwarded-For` 第一项被无条件相信；同一 peer/账号达到 429 后换伪造 XFF 可立即恢复 200。
- `new URL(req.url)` 位于异步异常边界外；raw `GET http://[` 可触发未处理 `Invalid URL` rejection，并让连接悬挂。
- 认证桶只有 `(action, IP, account)` 复合 key，既无 IP/账号总桶也无 TTL/LRU；3 万伪造 key 约保留 `17.791MiB` heap。
- 密码使用主线程 `scryptSync`；20 次错误登录约连续阻塞 event loop `460.987ms`。
- 注册可持久化 `300,000B` displayName，password 也没有最大字节数。
- 公网 `/health` 每次同步调用 store probe；生产 MySQL 路径会执行同步 schema/CLI 检查，且失败 message 可能暴露内部信息。

### WebSocket

- 每个 chunk 都对未完成帧做 `Buffer.concat`，声明 `64MiB`、只发送 `8MiB` 后连接仍在线；隔离复现 RSS 增长约 `133.25MiB`、external 增长约 `69MiB`。
- 未强制客户端 masking，也未校验 FIN、RSV、opcode、canonical length 和 control frame 125B 上限；unmasked/fragmented/RSV ping 均会收到 pong。
- `Upgrade:h2c`、缺 `Sec-WebSocket-Version`、非法 key 和任意 Origin 仍可 101。
- 同一 token 实测至少 300/300 连接被接受；无 pending/global/IP/account/session admission、upgrade rate、handshake deadline 或 heartbeat。
- 7 天 session token 位于 `/events?...token=`，会进入常见反代 access log。
- future cursor 会让后续事件静默丢失；早于 500 条窗口的 cursor 只得到半截 replay，没有 epoch/reset。upgrade 的 `head` 也未消费。
- 客户端固定 3 秒重连；200 连接各自补 500 条历史时会同拍产生约 100,600 次 socket write。

### 长时集合退化

- 真实 5人+5宠 vs 10怪房间关闭后仍保留在 runtime `battleRooms`；最近 25 组创建/关闭的 p50/p95 从 25 间时 `106/176ms`，退化到 75 间时 `453/526ms`，单房间约 `58KiB`。
- 组队邀请接受/离队后终态 `partyInvites` 永久保留；最近 100 轮三操作 p50/p95 从 100 条时 `59/109ms`，到 200 条时 `188/209ms`。
- `authEvents` 与认证 limiter key 也无总量边界。30 分钟门禁必须显示这些 cardinality/slope，不能靠降低战斗或组队频率掩盖。

## Beastbound 公网合同

### 1. 部署与可信网络身份

- 新安装默认只绑定 `127.0.0.1`。LAN 监听必须显式配置；公网推荐 Node 绑定 loopback/private address，由反向代理终止 TLS。
- 默认不信任 `X-Forwarded-For`。只有 immediate peer 命中显式 trusted proxy exact IP/CIDR 时才解析代理链；最多 3 hop、header 最多 256B，严格 IP 归一后从右向左取第一个非可信 hop。
- HTTP 不开放 wildcard CORS。WS 缺 Origin 允许原生 PC 客户端；一旦带 Origin，只允许配置中的 exact allowlist，默认空 allowlist 等于拒绝所有浏览器 Origin。
- 日志和指标不得记录 query、Authorization、token、body、frame payload、聊天正文或完整 IP；需要关联时只记录进程盐化 IP hash 和 server request ID。

### 2. HTTP 解析、字段与超时

- request target 必须是最长 2KiB 的 origin-form；absolute-form、非法 URL/percent encoding 返回 400 并关闭连接，不能逃逸成 unhandled rejection。
- JSON 全局最大 64KiB，auth/chat 最大 4KiB；Content-Length 预拒绝与 chunk 累计必须同时执行。超限 413、非 JSON 415、坏 JSON/非 object 400。
- headers 5s、body 10s、完整 request receive 15s、socket idle 30s、keepalive 5s、每 socket 最多 100 个请求；全局 active HTTP 默认 512。
- username 保持 3–20 位既有规则；password 为 8–128 UTF-8 bytes；displayName 为 1–24 grapheme 且不超过 96B；bearer session token 只接受 43 字节 base64url。
- 响应统一 `Cache-Control: no-store`、`X-Content-Type-Options: nosniff` 和 request ID。客户端只看到稳定安全错误，内部异常进入结构化日志。

### 3. 有界 admission 与密码验证

- 共享 network admission 在 JSON、密码 hash、service load 和 durable writer 之前执行；所有 bucket 有 TTL、LRU 和最大 key 数。
- 默认 HTTP：authenticated token 300/10s，单 IP gross guard 6000/10s；auth 单 IP 300/min、单账号 10/10min。该 IP 总桶只防 gross flood，不能误伤移动频率或大型 NAT；运营可调但不能设为无界。
- 密码验证使用真正异步 `crypto.scrypt`，不能把 `scryptSync` 包进 Promise。默认 active 4、queue 32；满时 429/503，未知账号执行同成本 dummy verify，登录统一返回 `invalid_credentials`，避免账号枚举。
- `authAttemptState` 默认 TTL 15 分钟、最多 50,000 key；`authEvents` 最多 500 条。

### 4. WebSocket 握手、token 与连接上限

- 协议原子升级到 v10，服务端与 Godot 当前只接受 v10。`/events` URL 只保留 build/protocol/cursor/epoch，不再接受 query token；Godot 在 `WebSocketPeer.handshake_headers` 中发送 `Authorization: Bearer`。
- 严格要求 GET、Connection 包含 upgrade、Upgrade=`websocket`、Version=13、key base64 解码后精确 16B；错误在昂贵鉴权前拒绝。
- 默认 pending upgrade 64、per-IP pending 8、established global 512、per-IP 64、per-account 3、per-session 2。200 loopback 门禁必须显式把测试 IP 上限调到 256，不能放宽生产默认值。
- upgrade pre-auth per-IP 120/min、鉴权后 per-account 12/min；handshake/auth deadline 3s。socket 开 keepalive，服务端每 25s ping 随机 nonce，10s 内没有匹配 pong 则只关闭该僵尸连接。

### 5. WebSocket 入站状态机

- 当前 WS 不接收应用 mutation，所以只允许 masked、FIN 的 close/ping/pong；text/binary/continuation 1003，RSV、fragment、非法/非 canonical length、坏 close 1002，过大 1009，frame flood 1008。
- `maxFramePayload=16KiB`、`maxBuffered=32KiB`；control payload 仍严格 ≤125B。读取完整 payload 前先判断声明长度，不能让攻击者靠 partial frame 占内存。
- 每连接入站 20 frame/s、burst 40；每个 event-loop turn 最多解析 32 帧，余量延后，避免单连接饿死其他玩家。
- upgrade `head` 必须进入同一解析器。任何违规都要在 100ms 内清 listener、timer、订阅和连接计数，且不产生 store/durable 写。

### 6. epoch、cursor reset 与重连抖动

- 每次 Node 启动生成随机 `eventStreamEpoch`。`events.ready` 带 epoch、earliest/latest seq 和 replay mode。
- 无 cursor 是新鲜 snapshot；同 epoch 且 cursor 位于 `[earliest-1, latest]` 才允许 replay。future、窗口淘汰或 epoch 不匹配必须发送 `events.reset`，绝不补半截历史。
- bootstrap 顺序为 ready → reset（如需）→ authoritative online snapshot → valid replay。reset 后客户端把 cursor 切到 latest，并重拉 profile、party、battle、chat/mail 摘要；online 由 snapshot 重建。
- 客户端采用 full-jitter 指数退避 1/2/4/8/16/30s cap，稳定 open 30s 后才清零 attempt；不能让 200 客户端固定同一秒重连。
- v10 将普通、无 target、无 `eventSeq` 的 `online.position` 在服务端按 16ms 窗口合并为 `online.position_batch`。每帧最多 64 个 delta、编码后最多 64KiB；客户端必须把最多 64 个 delta 作为一个原子批次完整校验后再应用，不能半批落地。
- 延迟中的 position batch 与已编码 writer queue 共用单连接预算；combined peak 不得超过 128 frame/256KiB，结束时两侧都必须清零。关键有序事件、带 target 的事件与需要 `eventSeq` 的事件不能进入该批次。

### 7. Health 与可观测性

- `/health/live` 为 O(1) 进程活性；`/health` 与 `/health/ready` 只读后台缓存。storage probe 每 5s 最多一次、deadline 2s、15s 后视为 stale；请求本身绝不直接调用同步 MySQL probe。
- 公网 health 只暴露安全摘要，不返回内部 exception message、host、user、SQL 或凭据。
- 指标至少覆盖 HTTP active/rejected/bytes/latency、rate-limit key 数、auth work active/queued、WS pending/accepted/reject reason/protocol violation/oversize/inbound rate/heartbeat timeout/cursor reset、event loop delay、durable pending/running、核心 runtime collection cardinality。

### 8. 长时集合边界

- `battleRooms` 热根只保留 active room。关闭时立即把完整约 58KiB room 压成按账号可索引的紧凑 recovery/result 摘要，并从完整 room 热根删除；摘要默认 5 分钟、每账号只保留最新一场、全局最多 256。不能以“完整 closed room 最终小于 512”冒充热路径修复。
- party invite 改为 runtime-only，不跨重启恢复；pending 有 TTL、per-account 与全局上限，accepted/declined/expired 在事件/响应构造后立即从权威热根删除。需要审计时只写有界结构化摘要，不把完整终态 invite 留在 profile candidate 或 MySQL。
- battle invite 同样只保留 pending；终态立即删除。revoked/expired session、auth event 和 transport limiter 有 TTL/数量边界。
- 门禁不仅报告 total/active/terminal/cardinality slope，还比较等价的第 5–10 分钟与第 25–30 分钟窗口：两个窗口都在开头包含同样的 60s AOI 热点，并分别在第 8/28 分钟注入同构安全攻击；50/200 人风暴放在第 12/22 分钟，避免落入首尾窗口。runtime p95 后段不得超过 `max(前段×1.5, 前段+25ms)`，durable p95 后段不得超过 `max(前段×1.5, 前段+50ms)`。仅有最终 cap、但 cap 内仍随历史 N 线性退化，视为失败。
- mutation receipt、battle record/trace 与 chat journal 必须同时报告 first/last/minimum/peak，而不是只看最终值。当前门禁要求 active receipt 始终为 20,000、published pending delete/upsert peak 为 0、dead key peak ≤1,023、history entry peak ≤2,047、expiry/oldest heap overhead 各 ≤2,048；`battleRecords` peak ≤10,000 且最终条数精确对应已关闭房间，`battleTrace` peak ≤1,200 并在完整门禁产生足够 trace 后精确停在 cap，`chatMessages` peak ≤500 且最终条数对应已接受聊天写入的有界尾部。

## 容量门禁

### 快速门禁（开发迭代）

默认 120 秒、固定 seed、200 个真实 loopback HTTP/WS 客户端，使用隔离 worker。worker 从 200 profiles、100k consumed tombstones 与 20k active receipts 起步；持久化必须走 production `createMysqlAuthStore()` planner、durable coordinator 的 ownership transfer、async wrapper `saveOwned()` 与 MySQL `saveAsyncOwned()`/`ownedRoot` recording pool/fake CLI 路径。该路径使用 dummy 凭据且没有数据库 endpoint，明确报告 `realMysql=false`；COMMIT emulator 默认 5ms，并每 100 笔注入一次 20ms spike，不能用 memory no-op save 代替历史集合下的生产规划路径。ownership transfer 只省去重复深拷贝，仍保留独立 root，且请求只有在该次 COMMIT 完成后才能返回成功：

- 同图 4 个 50 人 AOI 簇；80 人约 1 step/s，全员 10s position heartbeat；
- nearby/team chat 合计约 2/s；持续组队邀请/接受/离队；
- 至少 4 个并发 5人+5宠 vs 10怪 N-vs-N 房间，轮流提交真实 actor command；
- 资产写约 1/s，使用稳定 Idempotency-Key 做存/取或购买/领取交替，并穿插 profile/party/market read；
- 每 30s 滚动重连 10 人；一次 50 人掉线并以 0–2s 抖动恢复；
- 低率超 body、非法 frame、伪 XFF、过旧/future cursor 攻击，与正常 sentinel 同时进行。

资格严格按实际时长决定：少于 120 秒只能标记 `development_smoke`；120–1799 秒才能标记 `quick`；达到或超过 1800 秒才标记 `full_30_minute`。`--skip-attacks` 只允许 development smoke，任何 quick/full 都必须执行安全攻击。快速门禁只证明机制与阈值没有立即回归，不形成长时容量结论。

### 最终 30 分钟门禁

- 5 分钟预热后，每 5 分钟插入一次 60s 同 AOI 热点；
- 第 12 分钟 50 人掉线风暴；第 22 分钟 200 人掉线并以 0–5s full jitter 恢复；
- 第 8/28 分钟注入同构的有界恶意 HTTP/WS burst，使第 5–10 与第 25–30 分钟成为可比窗口；保留一个越过 500 replay 窗口和一个 future/旧 epoch 客户端，必须显式 reset；
- 每秒采样 CPU、heap/RSS、event-loop delay、HTTP/WS、durable 和集合 cardinality；每 60s 做权威状态对账。
- 周期采样只读取 O(1) recording counters；SQL/touched-row/save latency 使用写入时累计的有界 histogram，并只在最终报告汇总，不能让压测观察器每秒扫描或排序历史事务来污染被测 event loop、heap 和 HTTP 延迟。报告必须记录容量工具与关键服务文件的 SHA-256，确保 dirty worktree 下仍可复现。

门槛：

| 指标 | 门槛 |
| --- | ---: |
| movement/heartbeat HTTP | p95 ≤75ms，p99 ≤150ms |
| chat/party/battle command/资产写 | p95 ≤250ms，p99 ≤500ms |
| WS 最后相关接收 | p95 ≤150ms，p99 ≤300ms |
| 单连接重连 | p95 ≤2s（不含人为 jitter） |
| 50/200 人恢复 | ≤5s / ≤10s（不含人为 jitter） |
| 合法流量 unexpected 4xx/5xx | 0 |
| storage queue full/commit timeout | 0 / 0 |
| durable pending | peak ≤64，稳定 p95 ≤16，结束 0 |
| 正常 WS 意外/慢消费者断开 | 0 / 0 |
| presence/event seq | 抽样精确，重复/缺失/逆序 0；过窗只允许显式 reset |
| position batch | 16ms；每帧 ≤64 delta/64KiB；frame reduction ≥25%，frame reuse ≥50%；combined peak ≤128 frame/256KiB；结束 pending/combined 为 0 |
| event-loop delay | p95 ≤20ms，p99 ≤50ms，max ≤250ms |
| 预热后 retained heap | 净增 ≤64MiB；第 10 分钟后按“每个完整分钟最低 heap”回归，slope ≤1MiB/min |
| 预热后 RSS | 净增 ≤256MiB，后 20min slope ≤2MiB/min |
| runtime terminal collection slope | 淘汰窗口稳定后为 0 |
| receipt 峰值 | active min/peak =20,000；published pending delete/upsert peak=0；dead key ≤1,023；history ≤2,047；双 heap overhead 各 ≤2,048 |
| battle/chat journal 峰值 | battleRecords ≤10,000 且与关闭房间对账；battleTrace ≤1,200；chatMessages ≤500 且与接受写入的有界尾部对账 |

heap 的普通逐秒回归只作为 `heapObservedSlopeMiBPerMinute` 诊断项，不参与 retained slope 判定；minute-floor 排除不完整的最后一分钟，避免一次周期 GC 的锯齿位置支配结论。报告同时给出 MySQL planner/save p95、每事务 SQL/touched row 数与第 5–10/25–30 分钟差分；recording pool 绝不能建立真实网络连接。

最终必须验证资产幂等重复应用 0、party/battle/profile 最终模型 100% 对账、攻击连接只影响自身、所有临时进程和端口已清理。

## 测试矩阵

- HTTP raw：非法 target/percent、absolute-form、Content-Length 恰好 limit/+1、chunked +1、slow header/body、坏 JSON、错误 Content-Type、字段字节/grapheme 边界。
- 网络身份：默认忽略 XFF、trusted proxy exact/CIDR、多 hop/超长/坏 IP fail closed；Map TTL/LRU/max。
- auth：transport 限流先于 hash/durable；async scrypt ticker；unknown/wrong password同成本同文案；queue 满恢复。
- WS handshake/frame：method/Upgrade/Connection/version/key/Origin/token/head/mask/FIN/RSV/opcode/length/control/close/flood/fuzz。
- admission/heartbeat：pending/global/IP/account/session、upgrade rate、断连清理、匹配/错误/缺失 pong。
- replay：fresh/valid/too-old/future/epoch mismatch/restart/live race；reset 后 online/party/battle/chat/profile 恢复。
- health：1000 次 live/ready 不新增 store probe、不泄漏内部 message；后台 probe timeout/stale/recovery。
- collection：closed room replay TTL、terminal party invite TTL/MySQL delete、auth/session/battle invite cap。
- 既有 P0.6b presence gate、durable/economy/social/battle/storage、Godot protocol/event/reconnect 与 idle/moving/input perf。

### 当前实现证据（阶段内）

- party invite 的 MySQL 迁移边界已用假 CLI 验证：可写 store 在 schema 就绪后每个实例只执行一次幂等 `DELETE FROM party_invites`，随后 loader 不再查询或解析旧邀请；read-only store 不执行清理写，旧表 DDL 保留用于滚动兼容。`auth-storage.test.js` `21/21` 通过，未连接真实 MySQL。

## 最终实现

- HTTP 公网边界统一进入有界 request-target、header、Content-Type、body、字段和 deadline 校验；默认只监听 loopback，只有显式可信代理才能提供经过严格解析的转发地址。认证前后的 IP/账号/token 桶都有 TTL、LRU 和容量上限，密码校验改为有界异步 scrypt worker，未知账号走同成本 dummy verify。
- WS 协议原子升级为 v10：token 只经 `Authorization` header 传递；握手、Origin、pending/established admission、heartbeat、masked frame 状态机、payload/buffer/frame-rate 和单 turn 解析预算全部失败关闭。cursor 使用进程 epoch；过旧、future 或旧 epoch 必须 reset，不能补半截历史。
- Godot 客户端使用 full-jitter 指数重连并处理 v10 ready/reset；online position 以最多 64 个 delta 的原子 batch 校验和应用，普通增量、关键事件和 authoritative snapshot 的顺序边界保持分离。
- 关闭的完整 battle room 被压成有 TTL、按账号索引的紧凑 recovery；party/battle invite 只保留 pending，终态立即移出热根。认证事件、session、limiter、receipt、battle/chat journal 均有明确时间窗或 cardinality 上限。
- durable receipt 的持久 JSON 合同不变，但在线 canonical receipt 不再长期保留完整 response 对象图；按需访问时从 canonical JSON 物化并深冻结。service event 的可信认证改为 weak top-level identity，不再用两个强引用 generation 重复持有滚动窗口。
- 容量工具把每秒样本压成所需标量，只额外保留有界的最坏 event-loop 完整诊断和每 30 秒 collection 证据；30 分钟 1,800 个样本仅 `5,119,519B`，避免压测驱动器自身产生约 10MiB/min 的伪增长。
- 正式 quick/full 运行前和运行中采集 macOS CPU、VM、swap、memory pressure、供电和 thermal 证据。环境无效会让门禁无资格，产品失败仍单独保留，不能用“本机慢”豁免业务门槛；采集器不使用 sudo，也不每秒启动外部进程。

## 30 分钟正式门槛证据

命令：

```bash
node tools/p0_6_public_capacity_soak.mjs --full --duration-seconds=1800 --output=.run/p0_6c_full30m_post_retention_final.json
```

固定合同为 Apple M5、16GiB、Node v25.8.1、200 个真实 loopback HTTP/WS 客户端、100,000 个消费墓碑、20,000 个 active receipt、production MySQL planner/owned-save 路径与 recording fake pool。报告为 schema v2，`qualification=full_30_minute`、`qualified=true`、源码 fingerprint 首尾一致；明确 `realMysql=false`，没有数据库网络连接。

| 证据 | 正式结果 | 门槛/结论 |
| --- | ---: | --- |
| movement p95 / p99 | `6.832 / 20.906ms` | `≤75 / 150ms`，通过 |
| heartbeat p95 / p99 | `8.045 / 21.823ms` | `≤75 / 150ms`，通过 |
| chat / party / battle command / asset write p95 | `47.677 / 72.155 / 62.652 / 63.046ms` | 均 `≤250ms`，通过 |
| 同上四项 p99 | `54.854 / 84.476 / 75.563 / 70.844ms` | 均 `≤500ms`，通过 |
| WS 最后相关接收 p95 / p99 | `105.316 / 128.516ms` | `≤150 / 300ms`，通过 |
| 单连接重连 p95 | `11.002ms` | 不含人为 jitter，`≤2s`，通过 |
| 50 / 200 人掉线恢复 p95 / max | `41.454/50.463ms`、`36.028/53.031ms` | 正式判定使用 max；不含 `2s/5s` full jitter，两轮均通过 |
| event-loop p95 / p99 / max | `18.678 / 31.490 / 80.478ms` | `≤20 / 50 / 250ms`，通过 |
| retained heap 净增 / slope | `34.316MiB / 0.755MiB/min` | `≤64MiB / 1MiB/min`，通过 |
| RSS peak growth / 后 20min slope | `144.750MiB / 0.221MiB/min` | `≤384MiB / 2MiB/min`，通过 |
| external / array buffer growth | `7.025 / 6.305MiB` | 各 `≤128MiB`，通过 |
| durable pending peak / stable p95 / final | `1 / 0 / 0` | `≤64 / 16 / 0`，通过 |
| MySQL planner save p95 / p99 / max | `12.272 / 22.413 / 29.024ms` | `7,318/7,318` transaction/commit，其中 7,314 次形成 save 分布；rollback/timeout/failed 均 0 |
| 每事务 SQL / touched-row 最大值 | `30 / 30` | touched-row `≤64`，首尾 p95 都是 24，无历史退化 |
| position batch reduction / frame reuse | `72.8% / 91.0%` | `≥25% / 50%`，通过 |

业务与安全结果：

- 200 个账号最终全部在线且 identity 一致；149,157 次移动、34,424 次 heartbeat、3,600 次聊天、35,882 次 party read、410 场战斗启动、1,224 轮结算、1,800 次资产写均无合法流量 failure。
- 1,800 次成功资产请求全部找到对应 COMMIT，`earlyResponses=0`、`missingCommits=0`、重复资产应用 0；请求最早也在 COMMIT 后 `0.275ms` 返回。
- 第 8/28 分钟两轮攻击均得到预期拒绝：超大 body 为 413、伪 XFF 不能绕过 limiter、非法 frame 只隔离自身、future cursor 显式 reset；共 8 个 expected reject、0 个 unexpected result。
- 最终 profile `200/200`、party `12/12`、battle member `20/20` 对账；29 次权威 checkpoint 没有 durable side effect 或额外 store write。
- receipt active 的 minimum/peak 都是 20,000，pending delete/upsert peak 为 0，dead key peak 1,023、history peak 2,046、双 heap overhead 都是 0。battle record/trace/chat 始终停在 `10,000/1,200/500` 上限；稳定窗口内 active room、terminal invite、session、service event slope 都是 0。
- weak certification 最终只认证 active service-event window `500/500`，强引用 current/previous/unique retained 均为 0；20,000 receipt 的 response JSON 仍可完整 replay，但不再常驻完整 JS response 对象图。
- worker 正常退出，测试端口关闭，fixture 删除；正常 WS unexpected close、slow-consumer disconnect、queue full、commit timeout、failed mutation 均为 0。

## 宿主机判定与残余边界

- 开跑前已有 `80.178%` 静态 swap 占用，因此报告保留 `preflight_static_swap_high` 警告；它不构成产品失败豁免。运行期环境判定为 valid：1,801 个 CPU 样本完整，host busy p95 `29.667%`、外部负载 p95 `20.012%`、memory pressure 最低 `46%`，没有 throttled page、thermal throttling 或持续越过门槛的 paging。
- event-loop p95 `18.678ms` 与 retained heap slope `0.755MiB/min` 虽通过，但相对 `20ms/1MiB/min` 门槛余量有限；以后改动 durable root、event fanout、collection journal 或观测器时必须重跑正式门槛，不能只依赖 120 秒 quick。
- receipt dead-key/history peak 为 `1,023/1,023`、`2,046/2,047`，是 checkpoint 前的预期锯齿但计数余量很小；profile read p95 由首窗 `6.648ms` 增至末窗 `18.334ms`，绝对门槛和退化公式都通过，真实 MySQL 长测仍需重点观察。
- driver 自身 heap/RSS 增长为 `38.046/111.859MiB`，压缩后的 1,800 个采样 JSON 仅 `5.12MB`，但当前没有独立 driver memory gate；容量工具后续膨胀时不能把它误算成服务端容量。
- 本结论只覆盖这台 M5 的单 Node、loopback、recording MySQL planner 合同。它不证明真实 MySQL 网络/磁盘、反向代理/TLS、带宽型攻击、跨 Node 竞争或任意云主机容量；真实 MySQL 与多 Node CAS/行锁继续留给 P0.6d，生产部署和恢复演练留给 P3.2。
- 报告绑定 HEAD `798e5407` 下 fingerprint 一致的 dirty source snapshot；被测源文件一旦变化就必须重跑，不能沿用本报告。

## 自动验证

- `node tools/p0_6_public_capacity_soak.mjs --self-test`：`30/30` suites 通过。
- `node --test tools/lib/macos-host-evidence.mjs`：通过。
- 当前变更/新增 `58/58` 个 JS/MJS 通过 `node --check`。
- `auth-storage.test.js` 单独 `35/35`；其余 27 个 P0.6c 定向服务端测试文件合计后，服务端总计 `453/453`，0 failed、0 skipped。
- Godot `4.7.stable.official.5b4e0cb0f` parse `1/1`；隔离 `/tmp` user-data 下 `--auto-client-version-check`、`--auto-auth-server-client-check` 为 `2/2`，协议 v10、Authorization header、无 query token、position batch、重连模型和请求竞态保护均通过。
- 同一隔离方式下的真实跨帧性能探针通过：idle `process_total` 稳定 median/p95 `0.49/0.55ms`，移动 `0.52/0.52ms`；317 次鼠标移动事件的 `max_input_us=204`，`coalesced/settled/final_match=true`；player-stat 面板连刷 `0.57ms` 并正确 debounce/refresh/save。
- 需要外部后端的 event replay、online position/AOI 和 battle turn live checks 未连接现有玩家服。本轮有一项不计证据的 battle target mapping 检查曾用 fake token 向现有 loopback 服务发起一次 WS 握手并立即收到 426，未通过鉴权、未进入应用 mutation，随后停止所有可能触网的检查且无新进程残留。
- `git diff --check`：通过。

## 非目标

- 不在 Node 内实现证书签发、WAF、DDoS 清洗或 CDN；反代 TLS、防火墙和上游流量清洗必须由部署层提供。
- 不声称单机能抵御带宽型 DDoS；这里只让协议/资源滥用有界且单连接失败隔离。
- 不做跨 Node event bus、共享 rate limit、数据库 CAS/行锁；属于 P0.6d。
- 不改变战斗、宠物、经济、掉落或充值规则；安全拒绝文案不得泄漏内部代码。
