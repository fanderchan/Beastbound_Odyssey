# Phase253：P0.6a-2 大型持久集合增量 dirty journal 合同

> 状态：**P0.6a-2 已实现并通过隔离容量 gate（2026-07-12）**。未连接真实玩家 MySQL；recording pool 证明真实 `createMysqlAuthStore().saveAsync()` 的 planner、事务装配和 COMMIT 生命周期，不冒充 MySQL 引擎 I/O 压测或 200 人同图结论。

## 问题复现

Phase252 已让普通请求共享通过审计的永久装备墓碑，但“真正新增一条墓碑”和 durable receipt 仍会把大型集合重新复制、规范化、排序或全量 diff。固定 200 份档案、使用隔离内存/fake MySQL 依赖且不连接玩家库，本轮改造前得到：

| 场景 | 0 条 | 中档 | 大档 | 结论 |
| --- | ---: | ---: | ---: | --- |
| `ensure` 新增 1 条墓碑 | 0.02ms | 50,000：14.63ms | 100,000：35.17ms | append 仍复制整个冻结对象并重建 Set |
| 实际银行装备取回并新增 1 条墓碑 | 3.73ms | 50,000：20.35ms | 100,000：38.80ms | 请求耗时仍随历史墓碑数增长 |
| receipt normalize | — | 10,000：29.33ms | 20,000：58.21ms | 每次完整克隆全部 response |
| receipt prune | — | 10,000：37.13ms | 20,000：74.50ms | 每次 `Object.values + sort + materialize` |

给每条历史 receipt 放入约 2KiB response 后，一次真实 durable 银行资产写的单次隔离样本从 0 条的 4.66ms 增长到 10,000 条的 1,016.83ms、20,000 条的 2,695.67ms；进程 RSS 分别约 90MiB、693MiB、1,129.6MiB。另一组预热后 p95 样本仍为 7.90ms、301.13ms、601.68ms，说明具体绝对值受 Node/机器/样本形态影响，但线性复制与瞬时分配是真实问题。

使用实际 `buildSaveStatements` 和隔离 recording pool 的 MySQL writer 路径，只产生少量业务 SQL 时，0/10,000/20,000 receipt 的 planner p95 仍约为 1.44/76.19/145.42ms，20,000 档瞬时 heap 约增加 136MiB。SQL 最终虽是增量语句，JS planner 仍先全扫历史集合。

同时复现到一个一致性缺口：若同一个 operation ID 的旧 receipt 已过期，本次事务既要清除旧行又要写入新结果，现有全量 diff 会把它识别为“改写已有回执”并拒绝。正确语义应是同一事务中明确 `DELETE old → INSERT new`，不能绕过活动回执的不可改写规则。

## 本阶段目标

只为下面两个已验证的大型持久集合建立服务端内部 dirty journal：

- `consumedEquipmentEnvelopes`：永久、只追加的装备信封消费墓碑；
- `mutationReceipts`：72 小时有效、最多 20,000 条活动记录的 durable 幂等回执。

在线请求的 CPU、分配量和 MySQL planner 工作量必须与本次实际新增/删除的行数相关，而不是与 5万/10万墓碑或 1万/2万未触碰 receipt 相关。原始载入、备份、迁移和显式 snapshot 仍完整物化并审计，不允许以性能优化为由跳过坏数据检查。

这里的“普通保存不做全根 deep-equal/MySQL planner 扫描”特指：这两个大型桶不得再因嵌在 authority root 中而被完整遍历。其他较小持久字段继续使用现有 diff；本阶段不冒充已经为所有领域建立通用 ORM/unit-of-work。

## dirty journal 数据合同

### 1. 已验证基线、已提交 overlay、请求私有 pending

最终实现没有增加一个包揽所有根字段的通用 journal。两个现有聚焦模块分别用 `WeakMap` 保存 canonical MVCC 视图元数据，`authority-root-clone.js` 只负责可信身份与结构共享，`authority-root-materialization.js` 统一负责 snapshot/JSON/备份/迁移物化；内部元数据不会写入玩家存档：

```text
validated base (不可变、启动时完整审计)
+ committed overlay/index (仅包含 COMMIT 已确认的增量)
+ request-private pending delta (本次 candidate 的 touched rows)
= effective view
```

- `cloneAuthorityRoot()` 共享已经验证的 base/committed view，只复制本次很小的 pending delta；不得复制 10 万墓碑或 2 万 receipt。
- pending 必须属于 candidate。业务拒绝、异常、明确存储失败或取消发布时，丢弃 candidate 即丢弃 pending，不能污染已发布根。
- COMMIT 前不得把 pending 合入共享 membership/index；否则并发读取可能看到最终回滚的墓碑或回执。
- journal 绑定必须同时校验根身份和两个字段的 canonical 身份。若调用方绕过 accessor 直接替换字段，不得继续使用旧 journal；应完整重新审计，或在在线 mutation 路径失败关闭。
- raw MySQL/JSON/迁移输入第一次进入服务时仍完整校验 map key、schema、记录身份和 receipt response 结构，然后才建立索引。缓存不能让恶意或损坏输入跳过审计。

### 2. 墓碑 delta

墓碑 pending 只允许 `add(envelopeId, canonicalRecord)`：

- membership 按 base、committed overlay、pending 的统一 index 做 O(1) 查询；
- 已存在 ID 是幂等 no-op；新 ID 只创建一条冻结 canonical record；
- 删除、改写 schema、改写 `envelopeId` 一律在事务规划前失败；
- MySQL warm path 只为 pending add 生成对应 `INSERT`，不得枚举 base；
- online economy/mail/GM 等写入口必须通过 root-aware accessor 追加，不能再把 `{...ledger}` 赋回根字段。

保留现有 field-only canonicalizer 供 raw load、迁移和单元审计使用，但它不能成为在线新增墓碑的默认路径。

### 3. receipt delta 与索引

receipt effective view 至少需要 O(1) operation ID lookup，并在首次完整审计时建立按 `expiresAt` 与 `committedAt` 查找过期/容量淘汰候选的索引。在线追加不得再执行全桶 `normalize → Object.values → sort → Object.fromEntries`。

pending receipt journal 只表达：

- `deleteExpired(operationId)`：仅删除已经过期或按 20,000 上限应淘汰的记录；
- `insert(operationId, frozenReceipt)`：只插入一份已经完整校验、深拷贝并冻结的第一次结果；
- 同一 operation ID 若活动回执仍存在，仍按原规则 replay 或 409 conflict，绝不能更新；
- 同一 operation ID 若旧回执已过期，pending 必须同时记录 delete 和 insert，MySQL 在同一事务内先 DELETE 后 INSERT；
- cap/TTL 清理复杂度只与本次实际删除数 `D` 成正比，不与未触碰历史数 `N` 成正比；单次成功资产事务最多清理 256 条常规过期/容量记录，同 key 过期复用允许额外记录该 key 的删除。大量历史过期会在后续成功事务中有界渐进清理，避免把 10,000 条 DELETE 延迟压到一个玩家请求。

活动回执计数、replay 与过期判断都必须读取 effective view；物理上尚待本事务删除的过期行不得被当作活动回执。Phase257 起诊断计数不再写入共享 `server_state`，以免每笔回执制造全局热点。

### 4. 小签名替代大型桶 deep-equal

`durableBusinessChanged()` 的投影中，这两个大型桶应替换为不可伪造的小型版本签名，例如：

```text
{ committedGeneration, pendingAddIds, pendingDeleteIds }
```

签名只用于判断是否有持久业务变化，不是玩家数据，也不能代替完整导出。一个未触碰大型桶的普通资产请求不得枚举、克隆或 stringify 大型桶；新增 1 条墓碑/receipt 时，只比较本次 delta。

## 一致性生命周期

### 1. 正常成功

```text
读取 published root 的 effective view
→ clone 为请求私有 candidate + 私有 pending
→ 同步领域校验/随机/多账号修改
→ journal-aware normalize 与 businessChanged
→ stage 过期/超限 receipt 删除、新 receipt 或新墓碑
→ MySQL planner 从 exact pending 生成 touched-row SQL
→ BEGIN / DELETE receipt / INSERT delta / 其他业务 SQL / COMMIT
→ COMMIT 返回后幂等 finalize journal
→ 发布 candidate 与缓存、发送事件、向玩家返回成功
```

receipt 的 DELETE 必须早于同 ID INSERT；墓碑没有 DELETE。journal finalize 必须可幂等调用，避免 async wrapper 与底层 store 对同一个已确认 commit 重复收尾时造成重复行或版本漂移。

### 2. 业务拒绝或明确数据库失败

- 领域方法返回失败且没有持久变化：不保存、不 finalize，pending 被丢弃；
- planner 发现非法墓碑删除/回执改写：在 `START TRANSACTION` 前失败；
- BEGIN、SQL 或 COMMIT 明确失败：rollback 后不 finalize、不发布、不发送事件、不返回成功；
- 使用相同 operation ID 重试时，应重新从最后一次已确认 published root 执行，资产只成功一次。

### 3. 超时与模糊 COMMIT

- HTTP 超时不代表事务取消，writer 继续确认，且下一笔 durable mutation 不能越过仍未判定的前序写；
- 只有底层确认 COMMIT，或 reload 后完整 candidate/receipt 证明已提交，才能 finalize；
- reload 得到 raw root 后先完整审计并重建 journal，再恢复 published root；
- 无法确认时继续返回 `storage_outcome_unknown`/失败关闭，不能猜测成功，也不能提前把 pending 变成 committed。

### 4. snapshot、JSON、迁移与重启

- `snapshot()`、备份、批量迁移、JSON store 和显式导出必须 materialize `base + committed + pending` 为完整普通对象；
- 未确认 pending 不得进入公开 snapshot。传给 store 的 candidate 可包含 pending，但只有对应事务 COMMIT 后才成为 published snapshot；
- MySQL warm save 可以直接消费 journal；没有 journal 的 raw/untrusted root 必须回退到完整 validation/diff，不能假定其安全；
- materialized 数据重新载入后必须得到相同数量、相同记录和相同 replay 结果，内部 journal 元数据本身不要求跨进程序列化。

## MySQL planner 与提交合同

- journal-aware warm save 对两个大型桶仅消费 exact pending，不调用它们的 `Object.keys/Object.entries/Object.values`，也不构造完整 previous/next map；
- 墓碑 SQL 数严格等于新增墓碑数 `A`；receipt SQL 数严格等于删除数 `D` 加新增数 `R`。其他档案/metadata SQL 可另计，但不能随 untouched history 增长；
- receipt SQL 顺序为所有所需 DELETE 在对应 INSERT 前；INSERT 继续使用数据库唯一键保护，不改为覆盖式 upsert；
- 墓碑仍为 append-only plain INSERT。数据库发现重复/冲突时整笔回滚；
- `lastPersistentData`/writer baseline 只在 COMMIT 后推进。rollback 不能让下一笔保存误以为失败 delta 已存在；
- `stateMetadata()` 的大型集合 count 使用 effective index，不重新扫全桶；
- health probe 不 reload/替换 writer baseline，不应让下一笔 save 退回完整扫描。

## 性能验收门槛

所有档位必须使用独立子进程，固定 200 份档案；记录 Node 版本、CPU、HEAD、dirty 状态、原始样本与 GC/RSS。每档至少预热 5 次、采集 20 次，p95 从原始样本计算。历史 receipt 使用约 2KiB response，避免用空对象制造虚假好成绩。

| 门槛 | 数据档位 | 验收标准 |
| --- | --- | --- |
| 实际银行装备取回新增 1 墓碑 | 0 / 50k / 100k 墓碑 | 各档 p95 ≤ 75ms；100k 相对 0 档历史增量 ≤ 20ms；资产、revision、墓碑数均精确 |
| 新 durable 银行资产写并新增 1 receipt | 0 / 10k / 20k receipt | 各档 p95 ≤ 100ms；20k 相对 0 档历史增量 ≤ 25ms；只扣发一次、保存一次 |
| 活动 receipt replay | 0 / 10k / 20k receipt | 20k p95 ≤ 30ms；0 次领域执行、0 次 save、结果与首笔一致且 `replayed=true` |
| 1 条过期回执同 key 重用 | 20k receipt | p95 ≤ 100ms；exact DELETE+INSERT，同事务成功，最终活动数不超过 20,000 |
| MySQL planner/transaction path | 上述全部大档 | recording pool 下 p95 ≤ 50ms；大型桶 SQL 行数只等于 `A + D + R`，untouched ID 为 0；BEGIN/COMMIT/rollback 次序正确 |
| 分配门槛 | 100k 墓碑、20k receipt | 测量区间强制 GC 后 heap 增长各 ≤ 32MiB；单次 delta 的额外 peak RSS 增长 ≤ 128MiB |
| untouched enumeration guard | 100k 墓碑、20k receipt | journal 建立后为历史容器安装计数/throw guard；普通写、replay 与 planner 均为 0 次全桶枚举 |

recording fake pool 只证明真实 `createMysqlAuthStore().saveAsync()` planner/事务装配代码，不证明 MySQL 引擎 I/O 延迟。若要满足“真实隔离 MySQL COMMIT”证据，必须使用一次性容器或 CI 专用 MySQL 实例与独立 schema，绝不能连接本机玩家库；没有该环境时应把引擎级门槛明确保留为待验证，不能拿 fake pool 冒充。

大批量真实过期（例如一次触碰 10,000 条）另报 `D`、SQL 数、总耗时和内存，不套用“只删 1 条”的 100ms 门槛；验收重点是复杂度与 `D` 成正比、与另外 10,000 条未触碰记录无关。

## 测试矩阵（已覆盖）

| 层级 | 必须覆盖 |
| --- | --- |
| journal 单元 | raw 初始化完整审计；clone 共享 base 但 pending 隔离；stage/finalize/discard；finalize 幂等；字段身份被直接替换时失败关闭或重新审计 |
| 墓碑 | 100k 基线上新增 1 条不复制/枚举历史；重复 add no-op；删除/改写拒绝；registry、origin backfill、GM/economy/mail 统一读取 effective view |
| receipt | 20k O(1) active lookup/replay；TTL 与 cap 候选正确；活动同 key conflict；过期同 key DELETE→INSERT；response 不被后续对象修改；跨账号仍不可读取 |
| durable service | 业务失败不 save；明确存储失败不发布 journal/资产/事件；成功仅在 COMMIT 后发布；同 key 重试/重启只扣发一次；普通无关 mutation 不扫描大型桶 |
| MySQL | exact touched statements；receipt delete-before-insert；墓碑 append-only；非法改写事务前拒绝；rollback baseline 不推进；commit 后 baseline 推进；health 不破坏 warm identity |
| 模糊提交 | COMMIT 后抛错可 reload + receipt 恢复；未 COMMIT 不误判；reload 重建索引后 replay 与 count 一致 |
| store/export | memory/JSON save、snapshot、备份、迁移、MySQL load/save round-trip 都完整 materialize；重启不丢 committed overlay，也不泄露未提交 pending |
| metadata | receipt/墓碑 count 从 effective view 或实体表按需诊断；`server_state` 不再承载这些共享计数；delete+insert 同 key 不产生负数、重复或漂移 |
| 容量工具 | 200 档案、0/中/大三档独立 worker；原始样本、p95、heap/RSS、SQL cardinality、revision、save 次数和 HEAD 可审计 |
| 既有回归 | Phase247 durable commit/timeout/replay；Phase252 canonical ledger/health；storage、migration、equipment quarantine、economy/mail/GM 聚焦测试 |

容量工具为 `tools/p0_6_large_collection_journal_gate.mjs`，只调用产品真实 service/store 路径，没有另写简化算法作为验收对象。

## 实际实现与验证（2026-07-12）

### 实现结果

- 墓碑使用不可变 MVCC Proxy view：启动完整审计并冻结 baseline；`ensure` 只复制本请求 touched IDs，COMMIT 后才推进 candidate revision。不同 lineage、旧 revision、丢失 pending 或直接换字段均不能复用 trusted root。
- receipt 启动时完整校验、深冻 response，并建立 O(1) lookup、count、expiry/oldest heap；在线 stage 只复制至多 256 条 delete 与一条 insert 的小 Map。活动同 key 继续 replay/conflict，过期同 key 明确形成同事务 `DELETE → INSERT`。
- receipt 的 `histories/keys/heaps/countByRevision` 达到有界阈值后 checkpoint 为新的 2 万活动 baseline；旧 MVCC view 仍保留原 revision 直到自然释放，在线 published view 不再随服务器生命周期总 operation ID 无界增长。
- `durableBusinessChanged()` 用 lineage/revision/pending 小签名替换两个大型桶；MySQL 同 lineage warm planner 只消费 exact delta，运行时 count 读取索引。Phase257 起 `server_state` 不再持久化诊断 count；raw、迁移、不同 lineage 或坏数据继续完整 diff 并在事务前失败关闭。
- MySQL COMMIT 成功后才 finalize 两个 view；明确失败不发布资产、revision、事件、墓碑或 receipt，同 key 可安全重试一次。模糊 COMMIT 仍走完整 reload/materialize 核对。
- `snapshot()`、memory/JSON store、批量 MySQL profile 迁移和备份统一经过 `authority-root-materialization.js`；输出为完整普通对象，可 `structuredClone`，不会把 Proxy/journal 元数据写入文件。

### 容量 gate

命令：

```bash
node --expose-gc tools/p0_6_large_collection_journal_gate.mjs
```

环境：Apple M5、Node `v25.8.1`、HEAD `40360943c3a673545430bb4f76013ebec3fa8c81` 加本 issue 工作树；每档独立子进程，启动审计不计入在线样本，预热 5 次、采样 20 次。

| 真实产品路径 | 0 | 中档 | 大档 | 结果 |
| --- | ---: | ---: | ---: | --- |
| 单条墓碑 `ensure` p95 | 0.087ms | 50k：0.086ms | 100k：0.094ms | 历史增量约 0.007ms |
| 200 档案装备银行取回、新增墓碑 p95 | 25.637ms | 50k：20.456ms | 100k：19.306ms | 每档 25 次取回/存回，50 次 save；最终资产、revision、墓碑数精确 |
| 200 档案 durable 银行写 p95 | 15.101ms | 10k：15.451ms | 20k：13.632ms | 20k 不再随历史退化，最终 receipt 上限、石币、银行与 revision 精确 |
| 同 key replay p95 | 0.215ms | 10k：0.111ms | 20k：0.241ms | 0 次额外 save |
| 200 档案 + 20k receipt + 100k 墓碑 MySQL path p95 | — | — | 8.058ms | 每事务最多 5 条业务 SQL，历史大型桶 `Object.keys=0` |

所有 worker 的在线强制 GC 后 heap 增量不超过 `0.994MiB`，在线 peak RSS 增量不超过 `27.047MiB`。MySQL worker 真实调用产品 `createMysqlAuthStore().saveAsync()`、`beginTransaction/query/commit`，精确验证 receipt DELETE 在 INSERT 前、墓碑只 INSERT、untouched ID 不进 SQL、rollback 后可重试；连接是隔离 recording pool，不是数据库引擎延迟测试。

### 正确性回归

命令：

```bash
node --test server/node/test/durable-mutation-state.test.js server/node/test/authority-root-clone.test.js server/node/test/equipment-envelope-consumed-ledger.test.js server/node/test/mysql-large-collection-journal.test.js server/node/test/auth-durable-commit.test.js server/node/test/auth-storage.test.js server/node/test/auth-economy.test.js server/node/test/auth-equipment-envelope-quarantine.test.js server/node/test/auth-social-world.test.js server/node/test/auth-gm-qa-assets.test.js server/node/test/profile-migrations.test.js server/node/test/profile-migration-batch-ops.test.js server/node/test/mysql-profile-migration-script.test.js server/node/test/profile-migration-backup.test.js
```

结果 `171/171`。覆盖 20k cap/淘汰、4 万 history checkpoint、旧 view 隔离、过期同 key 的 service→MySQL、明确 COMMIT 失败不发布两个 journal、ambiguous reload、100k 实际装备银行循环、坏数据 fallback、trusted 字段替换/回退、JSON/snapshot/迁移/备份物化和 Phase247/252 既有语义。另通过相关 JS 语法检查与 `git diff --check`。

未运行完整 `tools/run_local_ci.mjs`、Godot 或真实玩家 MySQL：本 issue 没有客户端/协议/UI 改动，仓库规则要求使用聚焦验证；MySQL 引擎 I/O、200 个真实连接/AOI 和 30 分钟负载仍分别属于 P0.6c/后续发行容量门槛。

## 预计涉及文件

- `server/node/src/auth/authority-root-materialization.js`（新增，聚焦 snapshot/JSON/备份/迁移物化）
- `server/node/src/auth/authority-root-clone.js`
- `server/node/src/auth/equipment-envelope-consumed-ledger.js`
- `server/node/src/auth/equipment-envelope-registry.js`
- `server/node/src/auth/durable-mutation-state.js`
- `server/node/src/auth-service.js`（只做接线与 COMMIT 生命周期，不继续堆积领域实现）
- `server/node/src/mysql-store.js`
- economy/mail/GM 继续复用原 `ensureConsumedEquipmentEnvelopeIds` 接口，无需分散改写调用点
- `server/node/test/` 下 journal、durable、storage、economy/mail/GM 聚焦测试
- `tools/p0_6_large_persistent_collection_journal_gate.mjs`

若实现能以更小改动满足同一合同，可缩小文件范围；不得为了匹配清单进行无关重构。

## 非目标与剩余风险

- 不改变玩家看到的装备、银行、邮件、回执或错误文案，不改变 JSON schema、MySQL schema、HTTP/WS 协议版本。
- 不改变 72 小时 TTL、20,000 活动回执上限、活动回执不可改写、墓碑永久 append-only 等产品规则。
- 不处理 200 人同 AOI presence、位置 fanout、慢 WS 消费者背压；这些仍属于 P0.6b。
- 不处理公网 HTTP/WS 限流与真实连接压测；这些仍属于 P0.6c。
- 不提供多 Node CAS、资源行锁或并行 writer；单 Node 有序 writer 以外的一致性仍属于 P0.6d。
- 不宣称已经支持 200 人同地图；固定 200 档案只用于放大持久根，不能替代真实 200 客户端/AOI 压测。
- 不连接、不修改、不清理真实账号或玩家 MySQL 数据；引擎级测试只能使用一次性隔离实例。
- 不把 snapshot/备份/迁移强行优化为 O(1)。这些低频路径必须优先保证完整、可恢复、可审计。

## 完成判定

P0.6a-2 的代码、聚焦正确性回归、独立容量 gate 和隔离 MySQL planner/事务装配证据已完成，可以勾选该叶子。这里的完成只表示大型持久集合在线复杂度和单 Node COMMIT 边界达标；不表示 MySQL 引擎延迟、200 人同 AOI、30 分钟公网负载或多 Node CAS 已完成。
