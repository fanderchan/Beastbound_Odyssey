# Phase 275：邮箱权威 touched-row journal 基础

## 目标与范围

本阶段完成 `P0.6d-2c-12a`，不是关闭整个 `P0.6d-2c-12`。目标是先移除健康邮箱在权威根复制、durable 变更比较，以及已经认证为行级条件事务的邮件发送、附件领取和市场成交邮件中的全邮箱 diff。

本阶段没有决定活动邮箱容量、过期时间或归档规则，也没有把 `listInbox`、标记已读、系统奖励邮件、装备归属 registry 或所有 legacy planner 改成有界路径。因此不能据此宣称邮箱体系已经完整容量化。

## 权威邮箱合同

健康的 `mailMessages` 在加载/规范化后成为不可直接写入的 canonical MVCC view：

- 邮件正文先验证为无环 JSON，索引 `mailId` 必须与文档身份一致，并要求合法 `recipientAccountId`；
- 邮件文档被深冻结，直接赋值、删除或改写附件都会失败；
- 领域写入只能通过 `stageMailAuthorityUpsert` / `stageMailAuthorityDelete` 生成 request-private view；
- COMMIT 前旧 published view 看不到候选变化；COMMIT 后只有提交 view 前进，旧 view 仍保留原快照；
- 同一基线的并发候选若触碰同一邮件，后提交者得到明确 `mail_authority_commit_conflict`；
- 备份、迁移和 JSON 边界统一物化为普通隔离对象，不把 Proxy 写进存档。

权威根 clone 共享 canonical 邮箱身份，不再复制全部邮件。可信根只接受同 lineage 的单调后代；把邮箱字段替换为另一份 canonical 容器仍视为权威根被破坏并失败关闭。

## touched-row diff 与条件事务

MySQL planner 只在存在内部 consistency scope 时尝试读取 canonical mail delta。已认证路径只消费 touched rows：

- 纯文本/普通附件邮件发送：一条 mail INSERT；
- 普通或装备附件领取：一条 mail UPDATE 或 DELETE；
- 普通市场成交：一条 sale-mail INSERT；
- 单档案条件写：邮箱未变化时不枚举邮箱。

planner 还会逐行核对 delta 的 `before` 与 store-owned baseline。store 与 service 使用不同 mail lineage，避免请求 COMMIT 提前推进 store baseline；COMMIT 后只把计划内邮件行合并到 store baseline。

安全回退规则是：任何条件 planner 不接受完整写集时，必须重新生成普通全量 diff 后才进入 `legacy_global_cas`。不能把 touched delta 带入 legacy 路径隐藏额外邮件变化。邮件发送、领取和市场成交的 service scope 还要求 service 的 before/candidate 是同 lineage 且恰好存在目标邮件变化；跨 lineage 或夹带第二封邮件不能签发细粒度 scope。

## 历史与墓碑边界

每次请求只追加 touched mail history。为了避免已删除邮件正文、附件和 revision 数组永久增长，当前 lineage 达到以下任一阈值时确定性 checkpoint：

- 2,048 条 history；
- 1,024 个 dead mail key。

checkpoint 把当前活动邮件换到新 lineage，旧 view 留在旧 lineage 继续满足 MVCC 快照隔离；如果当前已无邮件，新 lineage 不再持有被删除邮件正文。

checkpoint 会遍历一次当前 lineage 的 tracked mail IDs。诊断显式报告 checkpoint 次数、最近/累计扫描 ID 数、history、dead key、tracked ID 和 Proxy `ownKeys` 次数，避免把周期性扫描伪装成“严格零扫描”。在活动邮箱容量/归档合同确定前，这只是有界历史和摊销边界，不是 `P0.6d-2c-12` 的最终容量结论。

## MySQL 加载与特殊键

MySQL 启动时给 store-owned snapshot 单独建立 canonical mailbox，返回给 service 的加载对象再独立规范化。这样第一次邮件 COMMIT 不会在成功之后才冻结整份 store mailbox，也不会让 service candidate 与 store baseline 共用可推进 lineage。

加载 `mail_messages` 时使用 `Object.defineProperty` 保存 SQL 主键；即使异常主键为 `__proto__`，也会保留为可审计 own row，而不是触发对象原型 setter。身份漂移仍由既有严格加载/领域审计失败关闭，不静默删邮件或附件。

## 验证

定向证据：

- mail authority：`9/9`，覆盖冻结、单行/批量 stage、commit、陈旧冲突、内容签名、物化、连续更新 checkpoint，以及 insert/delete churn 后当前 lineage 释放已删除正文而旧 view 仍可读；
- authority root、经济、社交、共享资产读穿、profile/mail/market 条件 planner 组合：`295/295`；
- durable COMMIT 本机回环 HTTP：`51/51`；
- MySQL 存储：非监听用例 `38/38`，单独回环 HTTP 用例 `1/1`；
- 2,000 封合成历史邮件下，profile-only、mail send、mail claim UPDATE/DELETE 和 market sale-mail planner 的 `ownKeys` 增量均为 0；
- 错误 row-local scope 会回退 `legacy_global_cas`，并证明目标新增邮件与额外既有邮件更新都进入 SQL；
- `git diff --check` 与所有变更 JavaScript 语法检查通过。

测试全部使用隔离内存、mock/recording store 或本机临时回环端口；没有连接共享 MySQL、没有修改任何 MySQL GLOBAL/PERSIST 参数、没有触碰真实玩家数据。

## 非目标与后续

- `listInbox` 仍会扫描当前 Node 的全邮箱，MySQL shared mail read 仍按收件人读取完整活动分区；
- 标记已读、部分系统奖励和其他未认证 legacy 邮件写仍会在 planner 回退时做完整邮箱 diff；
- active mailbox 容量、保留时间、归档表、分页 cursor 和玩家可见规则尚未决定；
- equipment ownership registry 仍会扫描 profile/mail/market 容器；
- profile、market 等通用 planner 的 touched-set 及 200 档案、120 挂单、目标邮箱档位、20k 回执、100k 墓碑组合门槛尚未完成；
- 没有新增真实 MySQL 引擎竞争门槛，也没有改变客户端协议、UI 或经济规则。

下一步是 `P0.6d-2c-12b`：先制定活动邮箱/归档与分页合同，再把 inbox 读取和标记已读收敛到精确页/精确行；在产品规则确定前不得偷偷删除或隐藏玩家邮件附件。
