# Phase 423：装备归属增量索引与有界派生状态

## 目标与红灯

本阶段完成 `P0.6d-2c-12c`。此前每次建立装备转运归属 registry 都会分别遍历完整 `profiles`、`mailMessages`、`marketListings`，随后再次遍历 profile、银行、邮箱和市场中的 materialized origin；即使一次请求只改一个银行格、一封邮件或一条挂单，也会随全部历史容器线性增长。

最终规则不是新增一份可持久化的“装备所有权表”。权威事实仍只来自现有 profile／银行、活动邮件、市场挂单、装备实例 provenance 和永久消费墓碑；registry 是进程内、不可序列化、可随时从权威根重建的派生索引。启动、完整 reload、跨 lineage 或不可信旧对象允许一次完整重建，正常同 lineage 资产写只处理本次 touched record。

## 派生索引合同

每个权威容器维护独立 record slice：

- profile slice 同时记录装备实例的 `originEnvelopeId` 与银行格中的活动 envelope；
- mail slice 记录单封邮件的 envelope 与其 provenance；
- market slice 记录单条挂单的 envelope 与其 provenance；
- 消费墓碑继续使用既有 canonical ledger 的 O(1) membership index，不复制或枚举 10 万历史键。

权威根首次审计后缓存这些 slice。`cloneAuthorityRoot` 只继承派生状态，`setAuthorityRootRecord`／`deleteAuthorityRootRecord` 在替换 profile 或挂单时只重算对应 record；所有在线 profile、银行、市场、GM QA 和共享读穿写入口均已路由到该 setter。市场容器与 profile 一样在 normalize 后成为深冻结 COW record map，候选写不会污染已发布根。

Phase 275 的 canonical mail view 增加 opaque incremental cursor。它只暴露从游标到当前 view 的 touched `mailId + after`，不暴露 lineage 内部对象，也不调用 mailbox Proxy 的 `ownKeys`。staged view 与 COMMIT 后 view 均可增量推进；邮件历史达到既有 `2048 history / 1024 dead key` checkpoint 后 cursor 明确失效，registry 对当前邮箱做一次完整重建，并把 fallback 单独计数。

消费墓碑 append 从 canonical pending delta 精确取得新增 envelope ID。staged append 只刷新这些 ID；同一 ledger view 的 COMMIT 只是把已经可见的 pending row 发布为 committed row，不重复检查全部 active owner。只有无法证明 exact delta 的 rebase／外部 lineage 才保守重验当前 active ownership map，仍不枚举 append-only tombstone history。

## 分层映射与 checkpoint

增量不能只把“业务对象全扫”换成“派生 `Map` 全复制”。record index 和 root aggregate 因此使用私有 layered map：正常候选只保存 touched key 的 set/delete overlay，point lookup 沿有界祖先链读取；没有任何归属变化的 runtime-only 根直接复用同一 aggregate，不制造空 overlay。

overlay 深度固定最多 1024。第 1025 次真实变更会把派生 map 物化为新 checkpoint，并分别计入 profile、market、mail 或 aggregate checkpoint 诊断；随后从深度 0 继续。checkpoint 只遍历派生 slice，不回扫权威 profile/mail/market/tombstone 容器。索引 ancestry 断开时 root aggregate 做一次明确的 full aggregation，不把周期性扫描伪报为 steady-state 零扫描。

registry 对外合同保持不变：`ownerships`、`duplicates`、`conflicts`、`materializedTraces`、`isAvailable`、`isConsumed`、`requireUnique` 与 `requireMaterializedInstanceOrigin` 的错误码、玩家文案和 fail-closed 语义均未改变。全量列表只在显式读取对应 getter 时物化；正常资产操作的单 ID 校验走 point lookup。

## 容量门槛

新增 `tools/p0_6_equipment_ownership_registry_gate.mjs`，在一个进程内先完整装载并审计：

- 200 份 profile／银行装备 owner；
- 120 条装备市场挂单；
- 单账号 200 封活动装备邮件；
- 100,000 条永久消费墓碑。

门槛随后执行 5 次 warmup 与 20 次独立 touched mutation，每次各替换 1 个 profile、1 封邮件、1 条挂单并追加 1 条墓碑；另以 tombstone-only append 命中一条仍活动的邮件 envelope，证明 exact ID 会立即进入 duplicate quarantine。门槛同时监控四个权威容器的 `Object.keys/entries/values/Reflect.ownKeys` 与 canonical mailbox `ownKeys`。

仅含最终暂存内容的干净快照在 Apple M5 / Node v25.8.1 上结果为：registry p95 `0.035 ms`、max `0.036 ms`；profile／mail／market／tombstone 容器枚举均为 0，full aggregation 为 0，26 次墓碑变化全部走 targeted refresh、fallback 为 0，周期 checkpoint 为 0。1025 代独立单测另证明 profile derived checkpoint 恰好 1 次、权威容器扫描仍为 0；1025 个纯 runtime 根不增长空 aggregate overlay。

## 回归与夹具修复

Phase 423 的 registry、mail journal、authority clone、经济、共享读穿、conditional planner、durable commit 与 profile action 相关矩阵 `381/381` 通过。完整 Node 套件候选为 `1775/1854`、79 个失败，未改动的 `f9beba720` 基线为 `1755/1849`、94 个失败；候选失败名集合是基线严格子集，没有新增红灯，修复了 15 个旧夹具红灯并新增 5 个通过用例。扩展装备矩阵唯一红灯为既有“玄影弓固定 28 伤害”断言；基线同位置、同断言可重复复现，因此不归因于本阶段，也没有借机修改战斗公式。其余完整套件既有红灯继续属于注册后未选角夹具、共享 MySQL harness 未建模邮件控制表和既有战斗断言等后续债务，不能被本阶段冒充为通过。

此前若干市场／邮件 conditional 与 WebSocket 修复夹具仍假定“注册即自动创建并选择角色”，与已发布的 P0.8 四空槽生产合同不一致。本阶段只修夹具：显式执行注册、建角、选角，并为 durable `createCharacter` 提供合法 operation ID 与 request hash；没有恢复生产自动建角，也没有改变玩家行为。

## 非目标与剩余风险

- 本阶段不修改客户端协议、UI、装备经济、邮件容量、归档、奖励仓或数据库 schema；没有连接共享 MySQL，也没有读写真实玩家档案。
- `P0.6d-2c-12d` 仍需消除通用 planner 中 profile／market 等剩余全对象 diff，并把 20k receipt 合入最终组合容量门槛；本阶段的 registry gate 不能替代该父级门槛。
- `P0.6d-2c-13` 的复杂装备 legacy 真实 MySQL 双向交错、strict identity 全回滚与跨 Node 模糊 COMMIT 恢复仍未完成。
- 完整 reload、邮件 lineage checkpoint 和第 1025 代 derived checkpoint 会按设计重建；这些路径均有独立诊断，后续 soak 必须分别观察，不能拿 steady-state p95 掩盖周期峰值。
