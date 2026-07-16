# Phase 282：generation 1 邮件全写路径 forward maintenance

## 目标与产品边界

本阶段完成 `P0.6d-2c-12b-3b-2c`：当邮箱生命周期已经由停服 bootstrap 切换到 `dataGeneration=1/ready` 后，每一笔新邮件和既有邮件更新都必须在原业务事务内同步维护活动计数与永久身份，不能产生“实体邮件已提交、辅助表未提交”的分裂状态。

本阶段不执行也不提供 bootstrap apply，不切换当前数据库代次，不启用活动邮箱 200 上限、归档、奖励仓领取或任何玩家可见新规则。现有数据库仍可保持 generation 0；generation 0 writer 只增加精确 control fence，邮件行为和物理写法保持不变。二进制现在具备维护 generation 1 的能力，但真正切换仍由后续 2d 在旧 Node 全部排空后完成。

## 唯一身份投影

`projectActiveMailIdentityRow` 成为停服 bootstrap 与在线 forward writer 共用的唯一投影公式。永久身份固定包含 mailId、发件账号、收件账号和创建时间；`identityDigest` 与 `documentDigest` 的输入、版本和规范化规则不再分别实现。

forward planner 只消费 store 已经认证的 typed mail changes：

- 新邮件必须是规范 ISO 创建时间，登记一条 generation 1 永久身份，并为收件人活动计数增加一；同一批多封邮件按收件人聚合增量；
- 已读、部分领取和完整结算都锁定既有 identity，认证永久身份完全不变，再以旧 document digest 做 CAS 更新新 digest；
- `settledAt` 只允许从空变成一个规范时间，已经结算后不得撤销或改写；
- generation 1 活动邮件禁止裸 DELETE；未来归档必须由独立的“活动行迁移到归档”事务同时维护位置与计数；
- unknown attachment、future schema、身份漂移、重复 change 或缺少真实目录认证器全部在取得数据库连接前失败关闭。

为兼容 bootstrap 已保守保留的旧档，既有非 ISO `createdAt` 可以在身份不变时继续被已读/领取更新；新生成邮件仍必须使用 canonical ISO，不能继续制造旧格式。

## 三类 writer 全覆盖

真实 MySQL store 在启动结构围栏后保存 immutable mail-storage capability；不能从 authority document 猜测代次，也不能在进程运行期间静默切换。附件目录认证器只在 generation 1 真正出现邮件写时延迟创建。

三条持久化路径使用同一 forward planner 与 SQL adapter：

1. row-local conditional：普通/文本邮件发送、市场成交邮件、标记已读和附件领取；
2. legacy/global CAS：装备或混合寄件、教学/系统/资格奖励等所有回退写，以及任何条件 scope 认证失败后重建的完整 diff；
3. `singleWriterMaintenance` 停服通用 writer：使用原始 SQL 时加入精确 control assertion 与每个 exact UPDATE 的 `ROW_COUNT()` 失败哨兵。

通用 diff 现在始终记录 insert/update/delete 的完整 before/after typed change。即使调用方没有 touched-row journal，或 row-local scope 被拒绝并回退 legacy，也不能绕过 generation 维护。若畸形旧集合只能生成 generic 物理 SQL、却无法为每条 SQL 证明一项 typed change，generation 1 会在取得连接前失败关闭；generation 0 继续保留原有隔离兼容。

## 事务、锁序与失败语义

generation 1 新邮件的规范资源顺序为：

`mail_storage_control SHARE → profile/listing（若业务需要）→ mail_active_counter → mail_identity → mail_message → envelope/tax（若需要）→ durable receipt`

同一 counter 只允许 `seed → increment` 复用；identity update 必须先以完整十一字段预期值 `FOR UPDATE`，再按旧 digest/settled 状态精确更新。counter、identity、mail 和 receipt 每条写都认证允许的 affectedRows；duplicate identity/mail、counter 溢出、陈旧 digest、物理邮件漂移或尾部 receipt 冲突都会回滚整个业务事务。

legacy/global writer 先取得既有全局 EXCLUSIVE 兼容屏障，因此与所有 conditional SHARE writer 互斥；其业务 profile/market 写之后才执行 counter、identity lock/write、mail，receipt 最后作为恢复见证。停服 writer 没有 mysql2 affectedRows，使用同事务内 SQL 哨兵把任何 0-row exact update 转成 duplicate-key 失败。

每次真实邮件事务都会按该 store 启动时看到的 generation 和三项关闭 flag 精确锁 control 行。若数据库代次在进程运行中被外部改变，事务在任何 sidecar/mail 写前回滚，并返回不可自动重试的 `mysql_mail_storage_runtime_state_changed`，要求服务重启重新审计，而不是用旧能力反复重试。

## 性能与发布边界

generation 0 只增加一条共享 control 行锁；generation 1 新信增加一次 counter seed、一次有界 increment 和一次 identity insert，既有邮件更新增加一次 identity 行锁与一次 digest update。control 使用 SHARE，同代次正常玩家事务互相兼容；没有全邮箱扫描、全 identity 扫描或全 counter 扫描。本阶段没有宣称 200 人地图容量，也没有运行真实 MySQL 竞争或 30 分钟容量门槛。

当前安全发布顺序仍是：先部署具备 generation 1 forward maintenance 的二进制，但数据库保持 generation 0；后续 2d 停止并排空全部旧 Node，在单一持锁事务内重新读取、补齐、对账并最后切 ready/data1；切换后只能启动本阶段及以后版本。归档、vault 与 active-limit 继续保持关闭。

## 验证证据

验证完全使用纯 planner、recording fake pool、隔离 authority fixture 和仓库内真实物品/装备目录；未连接共享 MySQL，未执行 DDL/DML/apply，未读取或修改真实玩家数据，也未改变 MySQL 全局或持久参数。

聚焦组合覆盖 bootstrap 目录/规划/dry-run、forward planner/adapter/writer、generation schema、统一资源锁序、邮件发送/已读/领取、市场成交、畸形旧基线 typed 覆盖、生命周期、authority journal 与事务期限，共 `217/217` 通过；另以现有 store fixture 验证增量写和默认异步 MySQL 装配 `2/2` 通过。语法检查和 `git diff --check` 通过。
