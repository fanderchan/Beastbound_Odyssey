# Phase 277：收件箱 Keyset 分页与客户端加载更多

## 目标与范围

本阶段完成 `P0.6d-2c-12b-2`：让正式 Godot 客户端不再为一次打开邮箱读取完整收件箱，同时保证旧客户端、旧时间文本、跨 Node 邮件和未领取附件不会因局部分页被误删或隐藏。

本阶段不实现活动邮箱 200 封上限、30 天只读归档或系统奖励兜底仓；这些属于下一项 `P0.6d-2c-12b-3`。

## 兼容与玩家合同

- 新客户端首屏显式请求 `GET /mail/inbox?limit=30`，后续只携带服务器返回的 opaque cursor；服务端允许 `1..50`。
- 无分页参数的旧客户端仍获得完整收件箱，所以本阶段不升级 HTTP 协议版本，也不会让旧版本升级服务端后只看见第一页。
- 响应继续包含 `messages` 与全收件箱 `unreadCount`，并新增 `nextCursor`、`hasMore`。旧服务端缺少新增字段时，新客户端按“已全部加载”兼容。
- cursor 是 canonical base64url JSON v1，内部位置为 `(createdAt, mailId)`；客户端只保存、URI 编码和回传，不解释或展示它。
- 历史邮件的 `createdAt` 保留数据库原始非空 VARCHAR 排序键，不强制改写成严格 ISO，避免为分页破坏旧档案。

## 服务端与 MySQL 边界

内存/JSON 路径在 canonical mailbox lineage 中维护 `recipientAccountId -> historical mailId` 索引。分页只遍历当前收件人的活动/有界历史 key，pending upsert/delete 也通过 touched rows 纳入；2,000 封其他账号邮件的测试中，分页前后 mailbox Proxy `ownKeys` 增量为 `0`。

MySQL 正式路径使用独立只读 store view，不复用完整 `mailPartitions`，也不把局部页 apply/adopt 回 Node-local authority root。一个 `REPEATABLE READ` 事务内完成：

1. 按 `recipient_account_id` 过滤；
2. 按 `(created_at DESC, mail_id DESC)` 和 `limit + 1` 做 keyset page；
3. 用同一收件人条件计算全收件箱未读 `COUNT`；
4. COMMIT 后直接 public projection，不改变持久化 baseline。

SQL 的 `ORDER BY` 与续页 `WHERE` 使用同一 MySQL collation。服务层不会再用 JavaScript 文本顺序重判数据库顺序，否则 `B/a` 一类历史键会被误拒；但仍重新认证收件人、行镜像、canonical 文档、重复 mailId、页大小、未读下界、输入 cursor 精确重复和输出 last-row cursor。内存路径则统一使用同一个 code-unit comparator 完成排序与 cursor 过滤。

为查询新增 `idx_mail_recipient_created_id(recipient_account_id, created_at, mail_id)`。已有表启动迁移满足：

- `ALTER ... ALGORITHM=INPLACE, LOCK=NONE`；
- 只在该 mysql CLI 会话执行 `SET SESSION lock_wait_timeout`，绝不修改 `GLOBAL/PERSIST`；
- metadata lock 默认最多等待 5 秒；
- DDL 使用独立 hard deadline，`BEASTBOUND_MYSQL_MAIL_INBOX_INDEX_MIGRATION_TIMEOUT_MS` 默认 `300000` 毫秒、最大 `900000` 毫秒，不复用普通业务事务的 6 秒期限；
- 超时、metadata lock 超时和其他迁移失败分别分类并拒绝启动；
- 启动时验证索引精确三列、无 prefix、可见且为 BTREE。

## Godot 客户端

新增 focused `MailboxPageModel`，负责首屏替换、续页追加、按 `mailId` 去重、cursor/hasMore、服务端总未读数、请求失败保留旧页、账号切换清空，以及已读/领取后的单次未读扣减。

邮箱左栏底部新增“加载更多邮件”按钮：仅有下一页时显示，请求中显示“正在加载...”，失败后已有邮件和 cursor 保持不变并允许重试。角标不再只统计当前已加载页。顺带修复 GDScript 把 `readAt: null` 字符串化后误当“已读”的问题。

可见客户端截图位于忽略目录 `.run/evidence/phase277_mailbox_pagination.png`；按钮未遮挡列表、详情或领取附件操作。

## 验证证据

- Node 语法检查：10 个变更源码/测试文件通过；`git diff --check` 通过。
- 最终定向服务端：分页 helper、MySQL store/迁移和 social/mail 回归 `49/49`；本机回环 HTTP 旧路径、有效续页、非法参数、partial-page no-adopt 与 503 映射 `2/2`。
- Godot：parse、`--auto-auth-server-client-check`、`--auto-mailbox-check` 共 `3/3`；可见 Metal 客户端邮箱检查与截图通过。
- paired perf 复测：同一时段旧 HEAD idle `process_total 0.34-0.38ms`、当前 `0.30-0.32ms`；旧 HEAD moving `0.23-0.29ms`、当前 `0.26-0.35ms`，均维持约 60 FPS 且 movement check 为 `status=ok`，没有发现与邮箱分页相关的热路径回归。
- 测试仅使用 memory、fake/recording pool、fake mysql CLI、本机临时 HTTP 端口和 Godot 本地检查；未连接共享 MySQL、未操作真实玩家数据、未修改数据库全局参数。

## 残余风险与后续

- MySQL 启动 loader 仍加载全部 `mail_messages`；本阶段只关闭玩家 inbox 请求热路径。
- 旧客户端的无参数全量接口为滚动兼容保留，正式淘汰旧版本后才能移除。
- 发行门槛前仍需在隔离真实 MySQL 上补 `EXPLAIN`、混合大小写历史键、分页期间并发插入/已读/领取，以及首次双 Node 同时迁移的演练；当前 recording/fake 测试不冒充这份真实数据库证据。
- 当前索引契约未额外检查 ASC/DESC 元数据；查询全部 DESC 可反向使用默认升序 BTREE，仍需以上述真实 `EXPLAIN` 确认。
- 下一步 `P0.6d-2c-12b-3` 落实活动容量、只读归档和系统奖励兜底仓，不能用静默删除未领取资产换取容量。
