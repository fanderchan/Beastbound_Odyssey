# Phase 428：跨 Node 事件中继合同与不安全拓扑围栏

## 目标与结论

`P0.6d-1` 与 `P0.6d-2` 已证明共享 MySQL 中的档案、市场、邮件和装备事务可以在明确锁序下安全竞争，但当前 `EventHub` 仍只订阅本进程 `AuthService.onEvent()`。如果负载均衡把两个玩家或同一账号的 HTTP／WebSocket 会话放到不同 Node，另一进程不会看到 party、battle、chat、presence 或 `session.replaced`；数据库正确并不等于实时事件正确。

本阶段完成 `P0.6d-3a`：建立可注入的跨 Node 事件中继语义，并让任何声称进入多 Node 模式的实例在中继能力、节点身份或取消订阅边界不完整时启动失败。两个独立 `EventHub` 实例已通过同一严格桥接夹具互发定向事件、AOI presence 与会话替换；总线重复投递只在目标 Node 投影一次，源 Node 回声不会形成广播环。

本阶段没有选择 Redis、NATS、Kafka、MySQL polling 或其他生产基础设施，也没有宣称已经可以横向部署。真实适配器、跨进程重放、账号节点接管、presence revision 接续和长时双 Node 容量仍属于 `P0.6d-3b`。

## 复现边界

现有单 Node 路径是：

1. 业务域调用 `emitServiceEvent()`；
2. 本进程 `AuthService.onEvent()` 通知本进程 `EventHub`；
3. 本进程按 account/session/map/AOI 索引投影到本机 WebSocket。

这条链没有跨进程出口。即使两个 Node 共享同一个 MySQL：

- A Node 产生的 `party.update` 不会到达 B Node 上的队友 socket；
- A Node 更新位置后，B Node 的同图观察者不会收到 `online.position`；
- A Node 撤销旧 session 后，B Node 上使用该 session 建立的 socket 不会收到 `session.replaced`；
- 仅靠数据库 reload 也无法替代实时通知、每连接背压和断线重放语义。

因此本阶段先冻结中继合同，避免后续因为选用不同基础设施而改写游戏事件、客户端协议或 EventHub 投影规则。

## 中继能力合同

启用 `clusterRequired=true` 时必须显式注入 bridge、唯一 `clusterNodeId`，并声明以下全部能力：

| 能力 | 必须值 | 原因 |
| --- | --- | --- |
| `schemaVersion` | `1` | 防止不同中继信封语义静默混跑 |
| `delivery` | `at_least_once` | 允许失败恢复，但要求消费端幂等 |
| `replay` | `bounded` | 断线／短故障后必须能追回窗口内事件 |
| `ordering` | `per_origin` | 同一业务 Node 的事件顺序不能被重排 |
| `sessionRouting` | `account_sticky` | 自身 rebase、战斗连接和运行态位置依赖账号请求／socket 归属一致 |

缺 bridge、node ID、任一能力或 unsubscribe 回调都会在 `createEventHub()` 阶段失败关闭。单 Node 默认不启用中继，现有运行与协议保持不变。

`account_sticky` 是当前过渡期硬条件，而不是最终故障接管结论：正式 Node 接管仍需在 `P0.6d-3b` 证明新 owner 能承接最后 presence revision、运行态位置、战斗连接和重放 cursor。

## 版本化信封与安全门槛

本阶段的内部信封固定为：

```json
{
  "schemaVersion": 1,
  "originNodeId": "node-a",
  "originEpoch": "process-random-epoch",
  "originSequence": 1,
  "eventId": "node-a:process-random-epoch:1",
  "publishedAtMs": 1786723200000,
  "event": {}
}
```

约束如下：

- `originNodeId + originEpoch + originSequence` 精确决定 `eventId`，不能由适配器重写；
- epoch 每次进程启动重新随机，旧进程与新进程即使复用 node ID 也不会碰撞；
- 事件必须是带合法 `type` 的普通 JSON 数据，序列化后最多 `1 MiB`；循环引用、函数、BigInt、非法类型和超限载荷在进入 bridge 前拒绝；
- 接收端重新验证完整信封和事件，并重新 JSON snapshot，不能把桥接对象原型或后续可变引用带进 EventHub；
- 源 Node 收到自己的 bridge 回声只计数并忽略，远端事件直接进入本机 `publish()`，绝不再次写回 bridge；
- 每 Node 保存最多 `32K` 个 event ID 的插入序去重窗。bridge 可以至少一次重放；replayable 事件另有 `eventSeq`，presence 另有 `presenceRevision`，客户端恢复边界保持现有合同；
- bridge publish 可同步或异步，默认 `2s` 超时；失败不伪装成功，进入安全指标和错误回调。关闭时先取消业务／bridge 订阅，再等待已接纳发布有界收口；
- 健康指标只暴露中继启用、能力已接受、pending／去重大小和计数，不透传适配器任意字段、事件正文、账号、token、node ID 或 topic。

## EventHub 接线

本机业务事件仍先走原有 `publish()`，然后送入 cluster relay。远端信封经严格验证和 event ID 去重后只调用本机 `publish()`：

```text
AuthService A -> EventHub A -> local sockets A
              -> cluster relay -> EventHub B -> local sockets B
```

因此既有 account/session/map/AOI 订阅索引、每连接 writer、presence 合并、critical FIFO、128 帧／256 KiB／2 秒慢消费者门槛全部复用，没有另造第二套 WebSocket fanout。`session.replaced` 仍由目标 session 索引精确关闭旧 socket；远端 presence 仍先通过 B Node 的 viewer projection 和 AOI 可见性检查。

## 验证结果

### 纯中继门槛

`server/node/test/event-cluster-relay.test.js` 覆盖：

- 两个 node relay 互发、源回声忽略和 bridge 重复重放去重；
- source event 发布后再修改不会污染信封快照；
- 缺 bridge、缺 node ID、best-effort 能力、非法信封、循环 JSON、非法 event type 和 1 MiB 门槛失败关闭；
- 异步 publish rejection 计入失败；关闭会等待已接纳的有界 publish。

结果：`3/3 PASS`。

### 两个 EventHub 的实时路由

`server/node/test/event-hub.test.js` 新增两个独立 service／hub、各自节点 identity 和共享严格 bridge：

- A Node 的 targeted `party.update` 精确抵达 B Node 的目标账号；重复 delivery 不重复 WebSocket 帧；
- A Node 的 `online.position` 经 B Node AOI 与 v10 DTO 投影后抵达；重复 delivery 不重复投影；
- A Node 的 `session.replaced` 精确关闭 B Node 上目标 session socket；
- A Node 自身 bridge 回声只忽略，不形成 A→B→A 循环；关闭后两边订阅均释放。

`event-hub.test.js` 自身为 `59/59 PASS`；与前述 relay `3/3` 合计 `62/62 PASS`。

### 相邻 HTTP／公网安全回归

- `server/node/test/auth-http-server.test.js`
- `server/node/test/http-public-security.test.js`

组合结果：`44/44 PASS`。单 Node 默认未配置 relay 时，`/health.eventStream` 与现有精确指标结构保持兼容；只有实际启用 cluster relay 才增加脱敏的 `clusterRelay` 子树。

社交／世界、战斗房间与协议相邻组合另为 `107/107 PASS`，覆盖在线 AOI、位置维护、party、chat、battle reconnect、`session.replaced` 和协议 10 唯一窗口。

## 非目标与剩余风险

- 没有生产 bridge adapter，不能把测试夹具当成 Redis／NATS／跨主机证据。
- 没有改变客户端协议 10、事件 DTO、玩家 UI、数值、MySQL schema 或持久档案。
- 没有连接共享／玩家 MySQL，没有执行 DDL／DML，也没有修改 `GLOBAL`／`PERSIST`。
- 没有证明另一个 Node 的本地 authority root 能在任意时刻投影全部远端 battle／party 状态；当前合同明确要求 account-sticky，并把 failover reload／ownership handoff 留给下一项。
- 没有解决 presence revision 在节点接管时的单调续接；不能在完成接管门槛前做非粘性请求路由。
- 没有执行独立进程、不同端口、网络分区、桥接 backlog、节点崩溃、重放窗口耗尽或 30 分钟／200 连接双 Node soak。
- 因此 `P0.6d-3` 与 `P0.6d` 均保持未完成，正式部署继续是单 Node；下一阶段必须先确定运维可接受的生产消息基础设施，再实现适配器和真实故障门槛。
