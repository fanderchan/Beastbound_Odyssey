# Phase 262：市场与邮箱跨 Node 权威读穿

## 问题与玩家风险

Phase259–261 已让普通撤单、普通购买和邮件领取在 MySQL 中原子结算，但其他 Node 仍可能继续使用启动时的内存市场与邮箱。玩家可能看到已经售出/撤下的挂单、看不到成交邮件，或者对另一 Node 已领取的旧邮件继续操作。

其中最危险的不是“界面晚刷新”，而是混合旧根：一个 Node 可能先从市场操作吸收了角色最新 profile revision，却仍保留同账号的旧附件邮件。此后旧 `markMailRead` 的 legacy 保存能够通过完整 profile revision 校验，并把已删除或部分领取的邮件重新写回，形成重复领取入口。

本阶段增加请求时的权威读穿，让公开市场、当前账号邮箱以及购买、撤单、领取、标记已读在使用共享资产前读取同一份 MySQL `REPEATABLE READ` 范围快照。读失败必须失败关闭，不能回退陈旧缓存。

## 权威读取合同

每次范围读取先在单个 MySQL `REPEATABLE READ` 事务中读取 `auth_store_revisions/auth`，再按 scope 投影：

- `market_read/market_mutation` 读取当前完整市场簿（当前玩法上限 120 条）、market config、操作者与所有挂单卖家账号，以及操作者 binding/profile；mutation 额外读取目标卖家的 binding/profile。
- `mail_read/mail_mutation` 只读取当前账号的完整邮箱分区，以及该账号的 account、binding/profile。
- account、binding、listing、mail 的 SQL 镜像列必须与各自 JSON 中实际持有的身份、数值和时间字段一致；profile 外层账号、revision 与时间来自 SQL 列，再与 binding 的账号/player/revision 对应关系交叉校验。
- 每个 scope 要求的操作者/目标卖家都必须同时存在 binding 与对应 profile；任一行缺失，或 binding/profile 的账号、player、非负安全整数 revision 不一致，整次读取都回滚，不能用 Node 旧档案补位。
- MySQL reader 负责按请求构造 actor/卖家资源集合并检查数据库行；返回 view 的认证模型负责 scope、声明 key、实体内层身份、canonical 顺序、收件分区及“values 不得超出 keys”，不能把未声明的额外文档带入缓存。

局部投影不能冒充完整权威根，也不能用观察到的全局 revision 推进本 Node。若事务中 revision 与 Node 已加载的 revision 不同，必须先完整 reload，再重新鉴权当前 session，然后最多重试一次；远端已注销的 token 不得借旧缓存继续读取或重放结果。

## 装备信封与墓碑边界

范围读取不会扫描或替换 5 万/10 万永久墓碑账本。它只从本次投影的市场、邮箱和 profiles 收集：

- 当前 active market/mail/bank equipment envelope ID；
- 已物化装备及 market/mail/bank envelope 的 `transferProvenance.originEnvelopeId`。

随后只查询这些 ID 在 `consumed_equipment_envelopes` 中是否存在，并把数据库确认存在的 ID 作为有序增量追加到当前可信账本 lineage。无效 provenance 失败关闭；返回的 tombstone ID 若不属于本次 view 的任何资产引用也会被认证模型拒绝。读事务绝不猜测、补写或重建历史墓碑。

## 应用、缓存与失败语义

公开 `GET /market/listings` 与 `GET /mail/inbox` 使用临时 overlay：响应来自权威范围快照，但不会把一次 GET 发布成“全根已经刷新”。购买、撤单、领取和标记已读在构造 candidate 前采用范围 view，同时更新 MySQL store baseline 与服务 authority root。

同一个 view 在两个缓存边界分别深拷贝 account/profile/listing/mail 文档，不能共享可变对象引用。否则服务层修改 `mail.readAt` 或 listing nested state 会先污染 store diff baseline，造成漏写。

`markMailRead` 现在也使用 `mail_mutation`：远端已完整领取时返回 `mail_missing` 且零写入；远端只领取一部分时，只能在最新余量邮件上标记已读，不能恢复旧附件。市场、邮箱或 revision 读取失败统一映射为 HTTP 503 `storage_read_failed`。

范围 adopt 不改变 `serverStateReady`。即使 `server_state/auth` 初始化 marker 尚缺失，后续 legacy 事务仍必须通过正常 revision 围栏补建该行。

## 验证证据

- 认证 view、双缓存深拷贝、精确邮箱分区、unreferenced tombstone 拒绝、profile provenance 增量：`server/node/test/shared-asset-read-model.test.js`、`server/node/test/mysql-shared-asset-read.test.js`。
- 两个独立 Node 的市场购买、成交邮件读取与领取；远端完整/部分领取后 `markMailRead` 不复活附件；读失败、revision reload、远端 session 注销、普通/装备/教学 legacy fallback：`server/node/test/auth-shared-asset-read-through.test.js`。
- 范围读取与既有 profile/market/mail 条件事务组合（含操作者/卖家 binding 或 profile 缺行失败关闭）：`94/94`。
- HTTP 503 映射、经济规则和 authority-root 隔离组合：`105/105`。
- 一次性隔离 MySQL 9.7.0-er2、`REPEATABLE-READ`、随机非 3306 端口、128 MiB buffer pool：
  - 真实市场/邮箱范围读穿与相关 tombstone delta 通过。
  - 手工推进 global revision 后旧 Node 拒绝局部越界；完整 reload 后重试成功。
  - 删除 `server_state/auth` 后执行 mail adopt，再做只追加 auth event 的 legacy 保存，marker 被正常补建且 revision 只推进一次。
  - `deadlockDelta=0`、`activeTransactions=0`、`activeLockWaits=0`、`cleanupVerified=true`。

隔离门槛只使用一次性 datadir 和非玩家 schema，主动清空外部 MySQL 密码，不连接或修改玩家数据库。

## 明确未完成

- 这是请求时 read-through，不是跨 Node 推送失效；玩家打开面板后，另一 Node 的变化不会自动刷新当前画面。
- mutation receipts、service events、presence 与 WebSocket 还没有跨 Node 失效/路由；同一 operation ID 的跨 Node 结果重放与模糊响应对账仍需后续切片。
- `createMarketListing`、`sendMail` 及装备市场路径仍保留 legacy/失败关闭边界；现有普通无回执撤单、装备撤单和教学机器人购买已做不回归验证。
- 统一多资源 canonical lock order、buy-vs-cancel/双向购买等真实竞争矩阵、数据库 lock/query/transaction timeout 和 HTTP 超时后的 DB 取消尚未完成。
- 当前市场整簿上限与产品的 120 条全局上限一致；若未来放大该规则，必须重新设计分页/游标与一致性合同。
- 当前账号邮箱仍按完整分区读取，尚未确定正式服保留上限、归档或分页规则；超大邮箱与数据库查询超时一并留在父项收口。
- 尚未完成 200 人、30 分钟、真实多 Node + MySQL 混合 soak，也不据此宣称横向部署、吞吐或实时一致性达标。
- Phase261 及更旧 Node 没有本阶段读穿，尤其仍可能走可复活旧附件的历史 `markMailRead` 路径；部署必须排空旧进程后统一升级，或在过渡期保证市场/邮箱流量只进入 Phase262 Node，不能直接滚动混跑。

因此本阶段只完成 `P0.6d-2c-4a`，父项 `P0.6d-2c-4`、`P0.6d-2c` 与 `P0.6d` 继续保持未完成。
