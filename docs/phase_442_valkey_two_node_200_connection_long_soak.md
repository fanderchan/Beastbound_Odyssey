# Phase 442：Valkey 双 Node 200 连接长时容量门槛

## 结果与范围

本阶段完成 `P0.6d-3b-2k`：两个独立 Node 进程以各自 HTTP／WebSocket 端口接入同一真实
loopback Valkey，并以正式 mysql2 pool／async store 共用一次性 MySQL `9.7.0-er2` 业务库；200 个真实
WebSocket 连接在同一地图的四个 AOI 簇内持续移动、心跳、读取档案／队伍和发送持久 nearby 聊天 30 分钟，
同时经过滚动重连、50 人风暴和 200 人全量风暴，最终正式门槛
`status=PASS`、`qualification=full_30_minute`、`twoHundredConnectionSoakProven=true`。

这证明当前单机双 Node 拓扑在该明确负载合同下具备 200 连接长稳能力，不等于服务已经可以横向部署。
宽口径网络分区、MySQL 可达性分区、跨 Node 正常战斗命令路由、战斗运行态重连 hydration 与反代／TLS
仍为 `false`，因此 `P0.6d-3b`、`P0.6d-3`、`P0.6d` 和 `P0.6` 均继续保持未完成。

## 正式门禁

新增命令：

```bash
node tools/run_valkey_two_node_capacity_soak.mjs --full --duration-seconds=1800 \
  --output=.run/phase442_two_node_capacity_full30m_taskpolicy.json
```

门禁只使用一次性基础设施：

1. 启动随机非 3306 回环端口的隔离 MySQL、临时 datadir 和随机业务库；预写 200 个真实
   account／session／profile，并为 A／B 创建仅存在于该实例的独立临时数据库用户；
2. 启动真实 Valkey 与两个独立 Node；每个 Node 承载 100 个 WebSocket，全部账号仍在同一
   `firebud_training_yard`，坐标分布于四个 AOI 簇；
3. 每 100ms 调度 4 次移动，形成约 40 movement/s；同时执行约 10 heartbeat/s、档案／队伍读取、
   1 条持久 nearby chat/s，并用另一 Node 的 sentinel 精确核对跨节点位置和聊天；
4. 在第 5／10／15／20／25 分钟各滚动重连 10 个连接，第 12 分钟重连 50 个连接，第 22 分钟重连
   全部 200 个连接；总计 300 次重连，重连时业务负载不中止；
5. 每秒采样两 Node 的连接数、event-loop、ELU、heap／RSS、GC、durable queue、relay readiness、
   owner readiness 和进程 CPU，同时采集 macOS CPU、外部负载近似值、VM、swap、memory pressure、
   thermal 与电源状态；
6. 结束后独立连接复核 MySQL revision 增量恰等于聊天 COMMIT 数，账号／session／profile 各 200，
   最新聊天标记存在，deadlock 增量、live transaction 与 lock wait 均为 0；
7. 关闭两个 Node、Valkey 和 mysqld，删除随机业务库与临时目录，并确认源码指纹在整段运行中未变化。

短于 1,800 秒的开发／quick 运行只可验证工具和行为，不会设置
`twoHundredConnectionSoakProven=true`。

## 诊断与宿主机调度边界

门禁新增逐 Node `PerformanceObserver` GC 观测和有界热点列表。每秒报告 GC 次数、总耗时、最大事件、
kind 与 flags；event-loop 最大样本同时携带 Node、heap、RSS 和同窗口 GC，因此不能再把一次长停顿笼统归因
于 V8。

前两次正式尝试均被保留为失败证据，未冒充资格结果：

- 首次运行唯一失败为 event-loop max `573.047ms`；同秒宿主机 busy `82.968%`，压测外部负载近似
  `75.321%`，对应分钟 swapout 峰值 `25.726MiB/s`；
- 补齐 GC 观测后的第二次运行唯一失败为 event-loop max `253.624ms`，超过既定 `250ms` 上限
  `3.624ms`。该样本来自 `capacity-b`，同窗口 GC 为 0，而宿主机 busy `71.140%`、外部负载近似
  `62.286%`；另一次双 Node 同时约 `236–239ms` 的停顿也对应 `58.192%` 外部负载。

门槛没有放宽。最终工具只对自己拥有的 benchmark driver 与 capacity worker 执行 macOS
`taskpolicy -B -p <pid>`，移除可能从桌面 Agent 继承的 Darwin background 标记，恢复系统默认前台调度；
它不提高 nice／实时优先级，不暂停或关闭其他应用，进程退出后策略自然消失。macOS 上该操作失败会在负载启动前
失败关闭；非 macOS 明确记录为不需要。最终报告确认 driver 与 A／B 三者均
`action=remove_darwin_background_policy`、`success=true`。

## 正式回执

最终资格报告位于忽略目录
`.run/phase442_two_node_capacity_full30m_taskpolicy.json`，大小 `100580` bytes，SHA-256：

```text
f68c1c9abcddca43c55332635847cb4924f98194becc90cc0f7cd67d9844218b
```

关键正确性结果：

```json
{
  "status": "PASS",
  "qualification": "full_30_minute",
  "twoHundredConnectionSoakProven": true,
  "durationSeconds": 1800,
  "initialConnections": 200,
  "finalConnections": 200,
  "movementAccepted": 71606,
  "heartbeatAccepted": 17541,
  "profileReads": 3567,
  "partyReads": 3566,
  "chatAccepted": 1794,
  "requestFailures": 0,
  "reconnects": 300,
  "crossNodePosition": "70783/70783",
  "crossNodeChat": "1768/1768",
  "eventSeqRegressions": 0,
  "eventSeqDuplicates": 0,
  "presenceRevisionRegressions": 0,
  "protocolErrors": 0,
  "unexpectedCloses": 0
}
```

200 人全量风暴期间每秒 health 采样最低曾见 3 个已连接 socket，这是刻意同时关闭并带 5 秒 jitter
重建全部连接的中间态；风暴完成后恢复为 200，连接建立 p95／max 为 `4.052/16.403ms`，不含测试注入的
jitter。所有代次合计 500 个 socket，接收 `2,003,156` 帧／`2,256,141,081` bytes，position batch
`1,593,850` 帧／`4,453,542` 个 delta，序号重复、倒退与协议错误均为 0。

关键 p95／p99 延迟（ms）：

| 类别 | p95 | p99 |
| --- | ---: | ---: |
| movement | 4.510 | 8.511 |
| heartbeat | 4.927 | 7.102 |
| profile read | 3.178 | 6.369 |
| party read | 1.847 | 5.542 |
| persistent chat write | 25.412 | 29.229 |
| cross-node position | 34.013 | 35.586 |
| cross-node chat | 26.427 | 30.441 |
| WebSocket reconnect | 4.383 | 6.754 |

event-loop p95／p99／max 为 `12.861/15.139/172.360ms`，低于 `20/50/250ms` 三条门槛。
GC 观测完整，合计 1,176 次／`2128.073ms`；最大单次为 `148.799ms` minor GC，对应窗口 event-loop
`169.738ms`，仍低于上限。A／B retained heap 净增长为 `+2.806/+2.350MiB`，斜率
`0.116/0.155MiB/min`；RSS 净增长与斜率均为负，durable queue full／timeout／failed 为 0，最终
pending／running 均为 0。

最终 MySQL `authRevision 1→1795`，增量 `1794` 与 1,794 次聊天 COMMIT 精确一致；账号、session、profile
各 200，聊天和 service event 仅保留正式上限 500 条。MySQL 全局值前后不变，deadlock 增量、残留事务、
锁等待均为 0。临时数据库、mysqld runtime 和全部临时状态均已确认删除。

宿主机证据为 `environmentValid=true`，仅保留 `preflight_static_swap_high` 警告；运行期 memory pressure
最低空闲 `38%`、pages throttled 为 0、swap 使用量净下降 `1134.94MiB`。该结果只证明上述本机回环拓扑，
不外推公网、反代、TLS 或独立物理机延迟。

## 验证

- `node --check tools/run_valkey_two_node_event_gate.mjs`：通过；
- `node --check tools/run_valkey_two_node_capacity_soak.mjs`：通过；
- `node tools/run_valkey_two_node_capacity_soak.mjs --self-test`：`PASS`；
- 20 秒 development smoke：`PASS`，200 连接和隔离清理完整；
- 120 秒 quick：`PASS`，4,794 次移动、1,176 次心跳、120 次聊天、60 次重连，0 请求失败；
- 1,800 秒 full：`PASS`，正式资格与数据如上；
- 原默认双 Node event／takeover 门槛、共享隔离 MySQL battle owner failure 门槛、Valkey 单节点分区旧 owner
  写栅栏门槛继续 `PASS`；
- `git diff --check`：通过；运行后没有专用 Node worker、Valkey、隔离 mysqld、随机业务库或临时目录残留。

本阶段没有连接共享玩家库、读取本机数据库凭据、修改 MySQL 全局／持久参数、启动持久服务、变更公共协议、
玩家 UI、战斗规则、经济数值或数据库 schema 合同。

## 后续边界

下一切片应在明确故障语义后覆盖 MySQL 可达性分区与 COMMIT outcome 恢复。跨 Node 正常战斗命令路由和
战斗运行态重连 hydration 仍是独立架构／产品选择；当前已验证的 owner 故障中性终止与重开不能冒充半场续战。
