# Phase247：资产请求的 durable COMMIT、幂等回执与崩溃恢复

## 问题复现

原 `createAsyncWriteAuthStore()` 把写入接到后台 FIFO 后，返回的是已经吞掉 rejection 的队尾 Promise；`createAuthService.save()` 又立即发布共享缓存和事件。实测会出现三种发行阻断：

- MySQL 尚未开始写，注册、交易或领取请求已经得到 `ok=true`；
- 原请求写失败仍显示成功，失败只会在下一次无关请求上变成 503；
- 失败请求留在共享缓存，数据库恢复后的下一次整根保存会把玩家已经收到失败的资产变化重新落库。

此外，市场、邮件、银行、装备、任务奖励和最终战斗结算没有统一 operation receipt。若数据库已经 COMMIT、但响应在网络中丢失，客户端无法证明重试是同一次操作，可能再次扣款或发货。

## 原创 Beastbound 提交规则

### 1. 成功只表示已经 durable

HTTP 资产入口不再直接操作共享根。同步领域方法保持原 API，但在 `invokeDurable()` 中改为：

```text
排队前容量检查
→ 克隆已发布根为请求私有 candidate
→ 在 candidate 上完成全部校验、随机和多账号原子变更
→ 缓冲 service events
→ 一次持久化最终 candidate
→ MySQL COMMIT 确认
→ 合并提交期间发生的运行时位置变化
→ 发布共享缓存和 WebSocket 事件
→ 返回 HTTP 成功
```

明确写失败时丢弃 candidate 和事件，原请求直接得到 503；后续请求不会继承失败资产。同步 memory/seed 测试 API 保持兼容，生产 async store 若绕过 durable facade 写持久字段会失败关闭。

WebSocket 升级前的会话补档和在线快照也等待同一 durable 队列；若首次连接需要修复缺失档案或刷新队伍在线状态，必须先提交再接受连接，不能因绕过异步边界而直接断线。

### 2. 有界异步串行，而不是阻塞线程或无限排队

当前 MySQL store 仍以完整权威根和 `lastPersistentData` 计算增量，因此本阶段保留一个有序 writer，避免旧快照乱序覆盖。协调器默认最多接纳 128 个进行中/等待中的持久操作，默认 10 秒未确认就向本次 HTTP 返回 `storage_commit_timeout`，但内部事务不会被取消，也不会提前放行下一笔资产写。

等待数据库使用 Promise，不阻塞 Node 事件循环。高频 `/movement/step`、位置广播、面对面交易报价/取消和临时邀请不进入 durable ACK。纯 battle trace 与 battle-only event sequence 留在内存，并随下一次真实结算折叠写入；普通战斗邀请和非资产运行时变化不启动 SQL。最终战斗记录、人物/宠物状态、消耗品、捕获、经验、掉落和装备磨损仍必须等待 COMMIT。

### 3. 与资产同一事务的 operation receipt

当前客户端为资产/持久权益 mutation 生成 `Idempotency-Key: bbo_...`，并在同一次自动网络重试中复用。服务端用 HTTP 方法、路径、服务方法和业务参数计算 SHA-256 请求摘要；会话 token 只用于鉴权与回执账号归属，不属于玩家意图，因此同账号重新登录换 token 后仍能恢复原操作。成功结果写入新的 `mutationReceipts` 根桶和 MySQL `mutation_receipts` 表，与资产变化处于同一事务。

规则固定为：

- 同 key、同 action、同 request hash：直接返回第一次结果，`durableCommit.replayed=true`，不再执行领域方法；
- 回放前必须用当前有效会话解析账号并命中 `receipt.accountId`；跨账号、空归属或失效会话均不得读取原结果；
- 同 key 但请求不同：返回 409 `idempotency_key_conflict`；
- 已存在回执不可改写；数据库侧重复 `operation_id` 让整笔事务回滚，只有过期清理可以删除；
- receipt 在进程重启后由 MySQL 恢复，仍可重放；
- 回执保留 72 小时，按提交时间有界到 20000 条，过期记录由后续事务增量删除；
- 注册、登录、刷新会话仍等待 durable commit，但禁止把含原始 session token 的响应写进 receipt。

receipt 是第 26 个 MySQL 持久根字段。批量档案备份/预演合同同步覆盖其 map key、`operationId`、hash、action、账号归属、时间窗和 response 结构，不能让迁移工具成为回执盲区。

### 4. 超时、模糊提交与崩溃

- 明确失败：原 write job rejection 原样归属于原请求，缓存和事件不发布；
- 超时：HTTP 不返回成功，后台继续确认；当前客户端以原 key 自动重试；
- COMMIT 后连接丢失：async wrapper 重载持久快照；完整 candidate 命中时识别为已提交，不能再次执行；
- 进程在 COMMIT 后、响应前退出：重启后由同事务 receipt 恢复第一次结果；
- 同一事务既没有可确认回执、又无法确认完整 candidate 时失败关闭，不猜测成功。

### 5. MySQL 写入性能

生产 `saveAsync()` 使用 `mysql2/promise` 持久连接池，消除每笔资产保存都启动 `mysql` 子进程和重新建连的固定成本。上层仍只有一个有序 writer；连接池解决连接复用，不冒充并发一致性方案。每次保存从池中取得一条连接，`beginTransaction → 增量 statements → commit`，失败尝试 rollback 后释放连接。

若持久投影完全相同，`buildSaveStatements()` 返回空数组，1000 次运行时/no-op save 均为 0 次 SQL、0 次子进程。自定义 `mysqlPath`、只读迁移和 fake CLI 测试继续使用现有命令行路径。优雅停服先停止 HTTP 新连接，立即封闭 WebSocket 并排入断开清理，再原子关闭 durable admission；已接纳事务、store FIFO 和 HTTP close 全部排空后才 flush、关闭连接池。15 秒硬退出窗口大于默认提交确认窗口。

## 客户端边界

- 市场、邮件、银行、装备、profile action、GM 宠物、商店、任务、转生、挂机、家族/庄园、battle command/leave 和聊天使用 durable key；
- builder 构造时已经带 key，覆盖绕过通用重试器的直发路径；通用发送器再次 prepare 时保持第一个 key；
- movement/position、trade propose/cancel/state、临时 party/battle invite 和 party encounter 不自动重试；遇敌响应丢失时通过 `/battle/state` 恢复房间，不能重复建房；
- 这是一项兼容性增强，不改变现有请求 body 或公开档案 schema，因此协议版本保持 7。

## 涉及文件

- `server/node/src/auth/durable-mutation-coordinator.js`：有界队列、精确失败归属、超时与指标。
- `server/node/src/auth/durable-mutation-state.js`：运行时合并、持久变化投影与严格 receipt 合同。
- `server/node/src/auth-service.js`：请求私有 candidate、事件延迟、receipt 与提交后发布。
- `server/node/src/http-server.js`、`event-hub.js`：HTTP/WS durable facade、错误映射、停服 drain。
- `server/node/src/mysql-store.js`：receipt 表、增量 SQL、no-op 跳过和连接池 writer。
- `server/node/src/auth/profile-migration-batch-ops.js`：第 26 个持久字段的迁移审计。
- `client/godot/scripts/progression/server_auth_client_model.gd`、`main.gd`：稳定 key 和同 key 重试。
- 聚焦 Node/Godot 测试。

## 非目标与残余风险

- 本阶段没有连接或修改真实 MySQL、真实账号或玩家档案；pool、COMMIT、失败和模糊响应均由隔离 fake/in-memory store 验证。
- 当前是单 Node、有界单 writer。按账号/挂单并行、数据库 CAS/行锁、多 Node 横向扩容仍属于 P0.6；在此之前不能宣称 200 人资产并发容量。
- 15 秒硬退出仍可能中断极慢且尚未确认的内部事务；它不会让未 COMMIT 的请求收到成功，但维护结算若要在机器强杀后必达，仍需 P0.6 的持久 inbox/outbox。
- receipt 的长期容量、过期清理压力与 5万/10万永久墓碑共同进入 P0.6 压测；本阶段只证明增量写和有界保留。
- 原始 StoneAge 行为不决定数据库提交规则；本规则服务于 Beastbound 的充值网游资产一致性。

## 验证证据

覆盖以下必需场景：COMMIT 前 HTTP pending、事件为 0；原写失败返回 503 且缓存/持久根均不含失败资产；同 key 重试与重启后重放只扣发一次；同 key 改请求返回 409；同账号换 token 可恢复、跨账号不可读取；通用 GM 审计同样走 durable 回执；COMMIT 后断线由快照恢复；提交超时不返回成功、后台完成后原 key重试恢复；队列满在业务执行前拒绝；WebSocket 握手在缺档补写提交后才接受玩家；停服先关闭 WebSocket 来源并拒绝 late mutation，再排空已接受事务；运行时战斗邀请 0 次 store save；1000 次 runtime/no-op 保存 0 次 MySQL 调用；async 错误不再同步逐句启动诊断进程。

```text
node --check <7 个改动的 Node 源文件>
node --test --test-reporter=dot <15 个持久化/HTTP/资产/战斗聚焦测试文件>
# 295/295 passed

godot --headless --path client/godot --quit
node tools/run_godot_auto_checks.mjs --only=--auto-client-version-check --fail-fast
# 2/2 passed

npm --prefix server/node ls mysql2 --depth=0
# mysql2@3.22.6
npm --prefix server/node audit --omit=dev
# 0 vulnerabilities
```

本阶段是服务器/网络一致性改动，没有玩家画面，不要求截图或视频。人工验收只需在隔离本地服对一笔商店购买断网重试：最终石币只减少一次、物品只增加一次，刷新档案后与成功回执一致。
