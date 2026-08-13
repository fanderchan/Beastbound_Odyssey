# Phase 425：复杂装备 legacy 真实 MySQL 收口门槛

## 目标与结论

本阶段完成 `P0.6d-2c-13`。装备市场上架和装备邮件转寄继续保留 `legacy_global_cas`，没有为了追求并行而扩大细粒度条件写范围；本阶段补的是此前缺失的真实数据库竞争、严格新增身份回滚和跨 Node 模糊提交恢复证据。

最终审计确认 `P0.6d-2c-12` 的四个子项均已完成，`P0.6d-2c-1` 至 `13` 也已全部闭合，因此本阶段同时关闭 `P0.6d-2c` 与上层 `P0.6d-2`。`P0.6d` 仍保持未完成：它还要求横向部署后的 event／presence／WebSocket 路由与长时多 Node 证据，本阶段没有越界宣称这些结论。

## 装备领取与 legacy 写的双向交错

门槛用三个真实账号构造一封待领取装备邮件，并让同一收件人同时持有可上架、可转寄的两个精确装备实例。四组场景分别使用独立数据库：

1. 装备领取先进入业务 COMMIT，legacy 装备上架等待；
2. legacy 装备上架先进入业务 COMMIT，装备领取等待；
3. 装备领取先进入业务 COMMIT，legacy 装备转寄等待；
4. legacy 装备转寄先进入业务 COMMIT，装备领取等待。

每组都实际观察到 InnoDB 锁等待。先提交者成功，陈旧竞争者返回已知资源冲突而不是覆盖；竞争者完整 reload 后使用原 operation ID 安全重试。最终 MySQL 同时保留领取结果和外移结果，两条 durable receipt 各一份，global revision 精确为 2，所有 profile、邮件、市场和消费记录中的木棒装备总数与初始值一致。四组 `deadlockDelta` 均为 0，结束后活动事务和锁等待均为 0。

业务 COMMIT gate 只在事务已经出现 INSERT／UPDATE／DELETE 后拦截。这样不会误把 shared read 或 exact-receipt 的只读 COMMIT 当作竞争点，也不会用同帧 helper 冒充真实锁等待。

## 严格新增身份与全资产回滚

### 挂单物理身份

普通条件上架先提交固定 `market_c13_shared_listing_identity`；装备 legacy 上架随后被强制生成同一 listing ID。为避免测试被更早的旧 profile guard 截断，另建一个只用于装载的数据库，让陈旧 Node 已知普通上架后的 future profile，但不知道目标库里的挂单和 receipt。装备写因此真实走到尾部 strict listing INSERT：主键冲突后，先前暂存的档案、装备移除、装备挂单、receipt 和 global revision 全部回滚。普通赢家挂单逐字段保持不变；同一装备 operation 换新的内部 listing／envelope ID 后只提交一次。

### 装备邮件物理容器身份

纯文本条件邮件先提交固定 `mail_c13_shared_mail_identity`，装备 legacy 转寄随后尝试复用同一 mail ID。目标是验证承载装备信封的物理邮件容器行不能被覆盖：strict mail INSERT 冲突后，发件人档案、装备移除、新装备邮件、receipt 和 global revision 全部回滚，文本赢家邮件保持不变；原 operation 换新的内部 mail／envelope ID 后只成功一次。

这里明确区分三层身份，避免把不同保证混称为一个“envelope”结论：

- `mailId` 是装备邮件的物理容器主键，本阶段验证了跨条件／legacy 的 strict INSERT 尾部回滚；
- 活动装备 `envelopeId` 嵌在 mail／listing 文档内，没有独立可被 row-local writer 竞争写入的数据库行，其跨容器唯一性仍由 equipment ownership registry、完整 shared read 和 legacy global CAS 共同保护；
- 已消费 `envelopeId` 使用 `consumed_equipment_envelopes` 永久 strict INSERT。组合门禁继续通过既有 `mailDuplicateEnvelopeRolledBack=true`，证明重复消费凭证会回滚前序档案和邮件写；本阶段没有把这条既有证据冒充为新 schema。

两个新增身份场景均证明 `duplicateRolledBackAllAssets=true`、原 operation 可安全重试、装备守恒、`deadlockDelta=0`。

## COMMIT 模糊与跨 Node 精确重放

装备转寄 writer 在真实业务 COMMIT 已成功后注入连接回包丢失，并同时让该 Node 的 exact receipt 通道暂时失败。首次调用只能返回 `storage_outcome_unknown`，不得回滚未知结果或盲目再保存。数据库此时已精确包含原 receipt、只移除一次的装备实例和一封装备邮件，global revision 为 2。

另一个在提交前已装载旧根的 Node 随后执行两次核对：同 operation 但错误 request hash 返回 `idempotency_key_conflict` 且 `saveCalls=0`；原 operation/hash/action 从 MySQL exact receipt 完整 reload 后返回 `replayed=true`，仍为 `saveCalls=0`。最终只有一封目标邮件、一条原 receipt，装备总数守恒。

## 一次性真实 MySQL 门槛

`tools/p0_6d_profile_parallel_mysql_gate.mjs` 新增 `--complex-equipment-only`，并把该子门槛纳入默认完整组合运行。该子门槛使用：

- MySQL `9.7.0-er2`、`REPEATABLE-READ`；
- 临时 datadir、随机非 3306 端口、128 MiB buffer pool；
- 7 个互相隔离的业务场景数据库，另加 1 个只读装载夹具数据库；
- 进程内清空外部 MySQL 密码环境入口，不读取玩家服凭据；
- 每个场景都对账 deadlock、活动事务、锁等待与资产总数，最终验证临时进程和目录已经清理。

同时修正旧市场 mixed gate 的夹具：装载库只用于表达“陈旧 Node 已知 future profile”，不再把目标库的三条 receipt 人工复制进空库。后者会伪造一次多 receipt bootstrap 写，违反现有在线事务每次最多净增一条 receipt 的容量合同，并不代表产品回归。

最终完整组合结果为 `qualified=true`、`cleanupVerified=true`：profile、市场撤单／购买／上架、邮件领取／发送、复杂装备和 20k receipt 稳态全部通过；回执容量从 19,999 竞争到精确 20,000，所有子门槛 deadlock 增量、残留事务和残留锁等待均为 0。

## 回归与基线对照

- `node --check tools/p0_6d_profile_parallel_mysql_gate.mjs` 通过；
- `git diff --check -- tools/p0_6d_profile_parallel_mysql_gate.mjs` 通过；
- `node tools/p0_6d_profile_parallel_mysql_gate.mjs --complex-equipment-only` 通过；
- `node tools/p0_6d_profile_parallel_mysql_gate.mjs` 完整组合通过；
- equipment registry、shared read、durable commit、mail claim/send、market create、资源锁序和 shared transaction 扩大组合为 `213/245`。

扩大组合唯一 32 个失败全部位于旧 `mysql-shared-transaction-integration.test.js`，原因是 fake harness 尚未建模 Phase 424 后的角色槽 INSERT 与 generation 邮件控制读。未改动远端 HEAD `90d210c69` 的独立干净 worktree 用同一文件对照，同样为 `0/32`、相同测试名和 `shared_mysql_unknown_operation`；候选没有新增失败。真实 MySQL 门槛使用生产 mysql2 store，不依赖该 fake harness。

## 非目标与剩余风险

- 没有修改服务端生产逻辑、客户端、协议、玩家 UI、经济数值或数据库 schema；本阶段交付的是发布门禁、夹具修复和可复核证据。
- 没有连接共享 MySQL、执行玩家库 DDL／DML、修改 `GLOBAL`／`PERSIST` 参数或读取真实账号数据。
- 复杂装备继续保守走全局 CAS；本阶段证明它与已细粒度化的普通资产并存时不会丢失或复制装备，不宣称复杂装备已经获得行级并行吞吐。
- 没有运行 Godot 检查，因为没有客户端／素材／玩家可见行为变化；没有以本次短门槛替代 `P0.6d` 尚需的真实横向部署和长时多 Node 验证。
