# Phase 430：Valkey Streams 生产事件适配器与节点租约

## 结果与范围

本阶段完成 `P0.6d-3b-1`：把 Phase 428 的抽象跨 Node 中继合同接到可实际运行的 Valkey Streams
适配器，并让正式 `http-server.js` 能通过显式环境配置启用。默认仍为单 Node；没有 Valkey 配置时，
现有本地运行、HTTP、WebSocket 和协议 10 行为不变。

选择 Streams 而不是 MySQL polling，是为了不把高频 presence／chat／party／battle 事件写进玩家
权威数据库。Valkey 官方将 Streams 定义为可追加、可裁剪并支持 `XREADGROUP` 消费组的日志；本实现
使用官方 Node 客户端 `@valkey/valkey-glide@2.5.1`。参考：

- <https://valkey.io/topics/streams-intro/>
- <https://valkey.io/commands/xreadgroup/>
- <https://valkey.io/commands/xinfo-groups/>
- <https://glide.valkey.io/languages/nodejs/api/>

本阶段不宣称已经完成双 Node 横向部署。独立进程事件恢复、账号失效接管、presence revision 接续、
battle／party／chat 故障恢复及 200 连接长时双 Node 门槛仍属于后续 `P0.6d-3b-2`。

## 适配器合同

`valkey-stream-event-bridge.js` 实现 Phase 428 要求的：

- `at_least_once`：每个节点使用独立 consumer group，只有本机 relay 接受信封后才 `XACK`；
- `bounded replay`：同一 node ID 重启先读取固定 consumer 的 PEL，再读取 `>` 新消息；stream 以
  `MAXLEN ~` 有界裁剪；
- `per_origin ordering`：同一桥接实例的 `XADD` 通过一条有界串行 promise 尾发布；
- `account_sticky`：启动必须显式声明入口已做账号粘性；未声明时拒绝启用多 Node 模式；
- 单条事件继续受 Phase 428 的 JSON、类型与 1 MiB 事件上限约束；适配器在发布前和消费后复用
  同一完整信封校验，非法流记录会报告并 ACK 丢弃，不允许一条毒消息永久卡住该节点；
- `XINFO GROUPS lag=null` 被视为裁剪造成的未读缺口并拒绝启动；PEL 已被裁剪时
  `XREADGROUP` 返回 null payload，节点进入 fatal，而不是跳过资产／战斗事件继续假健康；
- 发布排队默认最多 1,024 条，bridge publish 与 Phase 428 的 2 秒发布 deadline 共同形成背压。

## 节点身份与失败关闭

每个节点在订阅前以 `SET NX PX` 获取 Valkey 节点租约，默认 15 秒、每三分之一窗口续约；续约与
释放使用 token-checked Lua，旧进程不能释放新进程租约。重复 node ID 在创建 HTTP 服务和打开端口
前失败；初始化中途失败会先释放自己持有的租约，再关闭三个 GLIDE 客户端。

租约明确丢失或过期后：

1. bridge 停止健康并拒绝新发布；
2. EventClusterRelay 只投影 `ok/leaseHeld/readerRunning/readerHealthy` 等脱敏状态；
3. `/health/ready` 返回 503；
4. 默认入口触发既有 HTTP/WS/durable drain，关闭 store 和进程自有 Valkey 客户端，退出码置 1。

远端 Valkey 明文连接被配置层拒绝；只有 loopback 允许 `TLS=0`。密码只从环境传给客户端，不进入
health、结构化日志或错误文案。默认 stream 长度 262,144 只是有界工程默认值，不冒充 200 人长时
容量结论，正式值必须以后续故障窗口与内存实测校准。

## 真实引擎门槛

`tools/run_valkey_event_bridge_live_gate.mjs` 使用当前机器 Valkey 9.1.1，但不注册 Homebrew service：

1. 在随机临时目录和随机 loopback 端口启动无 AOF、无 RDB 的一次性 Valkey；
2. 两套真实 GLIDE 客户端／bridge／relay 互发事件，源节点回声忽略，目标节点收到一次；
3. 第二个同 node ID bridge 在租约阶段明确失败；
4. 一个节点拒绝本地 delivery 后不 ACK，关闭并用同 node ID 重建，PEL 事件成功重放并 ACK；
5. 启动真实 `server/node/src/http-server.js`（隔离 JSON 空档），`/health/ready` 返回 200 且 relay
   lease／reader 为健康；第二个相同 node ID、不同 HTTP 端口的完整入口以退出码 1 拒绝；
6. 主节点仍健康，随后 SIGINT 正常 drain；Valkey、HTTP 子进程和临时目录全部清理。

最终回执：

```json
{
  "status": "PASS",
  "gate": "valkey_event_bridge_live",
  "engine": "real_loopback_valkey",
  "httpEntrypointReady": true,
  "duplicateNodeStartupRejected": true,
  "persistentServiceStarted": false,
  "temporaryStateRemoved": true
}
```

## 自动验证

- 新增纯规则／HTTP readiness／relay ownership 门槛：`11/11 PASS`；
- 真实 Valkey live gate：`1/1 PASS`，并完成完整 HTTP 入口与重复 node ID 启动拒绝；
- `event-hub + auth-http-server + http-public-security` 相邻回归全部通过；
- 启动器两套定时测试在并发组合中曾因固定 wall-clock 超时出现 2 个失败；分别串行重跑为
  `4/4 PASS` 与 `6/6 PASS`，因此记录为同机并发噪声，不掩盖也不修改其门槛；
- `npm audit --omit=dev`：0 vulnerabilities；依赖树只有精确锁定的
  `@valkey/valkey-glide@2.5.1` 与既有 `mysql2@3.22.6`；
- Node syntax 与 `git diff --check` 通过。

没有连接玩家 MySQL、没有 DDL/DML、没有修改共享 MySQL 全局参数、没有创建账号或改玩家档案。

## 后续唯一剩余边界

`P0.6d-3b-2` 必须用两个独立 Node 进程和各自 HTTP／WS 端口完成：账号节点所有权、粘性路由
证据、节点崩溃／网络分区、租约到期接管、presence revision 单调续接、battle／party／chat 恢复、
重放窗口耗尽后的权威 rebase，以及 200 连接长时双 Node soak。完成前正式部署仍不得宣称可横向扩容。
