# Phase 433：跨 Node 认证读穿与接管权威 rebase

## 结果与范围

本阶段完成 `P0.6d-3b-2c`：在 Phase 432 的账号 owner 租约和 presence revision 换代之上，
补齐登录凭据、会话身份的精确存储读穿，并在新 Node 真正取得账号 owner 时按需从持久存储重载权威根。
因此一个缓存仍停留在旧版本的 Node，不再只凭本机旧密码、旧 session、旧档案或旧队伍状态接管账号。

第 2 代及之后的 owner 接管一律重载；第 1 代只有在精确认证读证明本机缓存不是当前权威时才重载。
重载与现有 durable mutation coordinator 串行，先在未发布对象中完成规范化、账号存在性认证和运行态清理，
全部通过后才一次替换服务权威根。任何读取、结构或身份认证失败都会让 admission 失败关闭，而不是带着混合新旧状态继续服务。

这仍不是完整横向恢复。真实共享 MySQL 双进程、离线事件 hydration、运行中 battle room 恢复、网络分区
耗尽后的重建，以及 200 连接长时双 Node soak 均未在本阶段证明。

## 精确认证读穿

新增 `server/node/src/auth/cluster-account-authority.js`，定义不可变的集群认证视图：

- 登录视图绑定规范化 username、账号文档和全局 store revision；
- 会话视图绑定 SHA-256 token hash、session、account 和同一 store revision；
- account/session 缺一、账号不匹配、SQL 镜像字段与 JSON 文档漂移、非法 salt/hash/expiry 或异常 revision
  均失败关闭，不从残缺字段猜身份；
- 缺失账号仍使用固定 dummy salt 完成有界 scrypt，公网错误保持统一，不泄露账号是否存在；
- HTTP 登录只接受本次精确读取返回的对象身份证明。该证明由进程内 `WeakSet` 绑定，普通对象、复制对象、
  旧证明或密码摘要不匹配都不能触发 owner admission；
- bearer 只有在本地解析为 `session_missing` 且 token 形态合法时读穿；撤销、过期和 refresh grace 仍按原
  会话合同判断，其他本地失败不会绕路查询存储。

MySQL 精确读取使用连接池、每次 checkout 的 Beastbound SESSION 锁等待策略、参数化 username/token hash
索引查询和单事务内的 revision 行。读取前先校验 key，非法输入不会取得连接；读到多行、半行或镜像漂移会
回滚。只有精确行、完整本机基线和全局 revision 同时一致时才标记 `authorityCurrent=true`，允许第 1 代省略
一次全量 reload；该优化不适用于第 2 代接管。

异步 store 包装器把凭据、session 和全量 authority 读取排在本 Node 既有写队列尾部，避免读穿越过本机
更早的 COMMIT。三类读取有独立计数，不把读取失败伪装成持久化写失败。

## Owner 接管与原子发布

Valkey owner observer 现在同时传递冻结的 `{acquired, generation, reused}` 元数据：

- generation `> 1` 的新 owner 必须重载，不依赖本机是否自认为缓存新鲜；
- generation `= 1` 只在精确登录/session 读穿发现存储视图不是本机当前基线时重载；
- 同 token 续租只抬高/确认 presence floor，不反复读取全量权威根；
- MySQL 全量接管读取改为异步 child-process 路径并设置既有 authority load hard deadline，避免 live admission
  使用启动期同步 loader 阻塞 Node 事件循环；
- 全量快照读取、规范化、目标账号认证和发布都位于 durable mutation coordinator 内；并发本机持久写不能
  在快照读取与发布之间丢失；
- 发布前保留其他账号当前运行态，只清除被接管账号关联的 position、party invite、battle invite、
  battle room、battle recovery、trade offer、runtime session、移动限频和 position barrier；
- 持久 party、profile、账号、角色及其他 authority 文档来自新快照。battle room 和邀请继续遵守既有
  runtime-only 合同，不伪造死亡进程的战斗续局。

重载失败会从 owner observer 返回错误。Valkey admission 释放刚取得的租约并把 Node 标记为 fatal；HTTP
只返回脱敏 `503 account_node_unavailable` 或既有账号切换提示，不暴露存储错误、账号、token 或凭据。

## 真实双 Node 门槛

`tools/run_valkey_two_node_event_gate.mjs` 在原 Phase 432 流程中增加了权威漂移夹具：

1. 启动一次性 loopback Valkey 和两个不同 HTTP/WebSocket 端口的独立游戏 Node；
2. Node A 持有账号，Node B 保留旧服务缓存；
3. 在 A 崩溃前，独立推进 B 的 backing-store 账号显示名、档案 revision/标记和持久队伍，但不刷新 B 服务缓存；
4. `SIGKILL` A，确认租约未到期前 B 仍被拒绝；
5. 到期后 B 取得 generation 2，在 admission 返回前完成 authority reload；
6. RPC 探针确认 B 看到新账号、档案和持久队伍，且 reload/runtime-reset metrics 已推进；
7. 原有跨 Node presence、世界聊天、接收端序号隔离、同 owner session replacement 与 presence generation
   连续性全部继续通过；
8. 正常 drain，停止临时 Valkey 并删除临时目录。

关键回执：

```json
{
  "status": "PASS",
  "gate": "valkey_two_node_event_and_account_takeover",
  "independentGameNodeProcesses": 2,
  "crashedOwnerLeaseExpiryTakeover": true,
  "presenceRevisionGenerationAdvanced": true,
  "takeoverAuthorityReloadFromAdvancedStoreFixtureProven": true,
  "persistentProfileAndPartyAuthorityReloadProven": true,
  "partyAndBattleAuthorityTakeoverProven": false,
  "reconnectHydrationProven": false,
  "persistentServiceStarted": false,
  "temporaryStateRemoved": true
}
```

## 验证与安全边界

- 认证视图、服务边界、HTTP admission、owner、EventHub、Valkey bridge、MySQL 精确读与存储相邻矩阵
  `166/166 PASS`；
- 真实 loopback Valkey bridge gate `PASS`；
- 扩展双独立 Node 崩溃接管 gate `PASS`；
- MySQL 测试证明精确查询参数化、SESSION policy 在 BEGIN 前、漂移回滚、非法 key 在 checkout 前拒绝，
  以及 live 全量 loader 会让事件循环 timer 正常运行；
- changed Node syntax、`git diff --check` 和暂存区隔离在提交前再次执行；
- 两个真实 gate 均明确 `persistentServiceStarted=false`、`temporaryStateRemoved=true`。

本阶段未连接共享 MySQL、未执行真实 DDL/DML、未触碰玩家数据，也未修改 MySQL `GLOBAL/PERSIST`。
双 Node 权威漂移结论来自隔离 backing-store 夹具；它证明接管机制，不等同于真实共享 MySQL 部署验收。

## 后续边界

下一切片仍需选择并实现 reconnect hydration：死亡 Node 未投影/未确认的 chat、party、battle 事件如何按
玩家 reconnect cursor 有界补回；运行中 battle room 是否需要独立共享权威、快照还是明确判负/重开；
replay window 耗尽与网络分区时如何失败关闭并重建。真实共享 MySQL 双 Node 接管门槛通过后，才进入
200 连接长时 soak；`P0.6d-3b`、`P0.6d-3` 与 `P0.6d` 继续保持未完成。
