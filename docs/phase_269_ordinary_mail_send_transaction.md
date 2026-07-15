# Phase 269：纯文本与普通附件邮件发送条件事务

## 目标与现状边界

本阶段完成 `P0.6d-2c-7`，只收敛玩家普通发信的跨 Node 读写边界：

- 纯文本邮件不再锁定或写入任何 profile；
- 普通物品附件邮件只更新发件人的 binding/profile、唯一邮件和唯一 durable receipt；
- 邮件、附件扣除和回执必须同一事务提交或同一事务回滚；
- 装备附件和普通物品与装备混合附件继续使用 legacy 全资产事务；
- 不改变收件人存在性、禁止给自己发信、标题/正文规范化、绑定物限制、附件数量、领取方式、玩家文案或回执重放语义。

当前代码库没有“邮箱最多保存 N 封”的玩法规则。Phase262 也把邮件保留、归档和分页列为未决定事项，因此本阶段没有虚构邮箱容量、邮费或收件人背包检查。未来若增加邮箱上限，必须让玩家、系统、市场、教学等全部产信源共同取得收件人容量 guard 并读取实时总数，不能直接复用本阶段的无邮箱扫描路径。

## 发信前权威读穿

新增的 `mail_send` 权威读穿在 MySQL `REPEATABLE READ` 事务中按规范化用户名解析真实收件账号：

1. 认证当前 global revision、发件账号、旧 Node 已知的收件账号和数据库实际解析出的收件账号；
2. 纯文本只读发件人与收件人账号，不读发件人 profile，也不扫描任何邮箱；
3. 普通物品附件额外读取并采纳发件人的 binding/profile，随后才检查库存和扣除附件；
4. 收件人缺失、账号镜像漂移、global revision 越界或 view 不完整时失败关闭或完整 reload，不能使用旧 Node 缓存猜测；
5. 畸形附件、冲突表示、未知物品、装备选择和空标题/正文不提前扩大读集，仍由原领域规则返回原有错误。

读穿只解决请求时权威事实，不等于跨 Node 邮箱实时推送。

## 可认证的最小写集

成功请求只有满足以下全部条件才签发 `row_local_mail_send_v1`：

- 最终只新增一封 `schemaVersion=2`、既定十五字段的玩家邮件；
- 邮件 `readAt=null`，货币和装备信封为空，不含 `mailKind` 或额外字段；
- 发件人、收件人、用户名、显示名、邮件 ID 与账号权威事实一致；
- 既有邮件逐条不变，装备信封消费墓碑没有变化；
- 只新增一条 account、operation、request hash、action 完全匹配的 immutable receipt；
- receipt 的玩家重放内容与实际邮件逐字段一致，普通附件的 profile/profileSummary 也必须与候选档案一致；
- 纯文本必须证明发件人 binding/profile 完全不变；
- 普通附件必须在服务层和 MySQL planner 两次证明唯一发件人档案严格 `r → r+1`，发送前库存足够，并且只按邮件中的普通物品精确扣除和重新归一化 `captureTools`。

装备或混合附件、系统/货币邮件、缺少回执、库存不足、回执响应漂移、额外持久化 bucket 或身份漂移都不能冒充本 scope；装备邮件继续保守回退 legacy。

## 条件事务与锁序

纯文本邮件的事务顺序为：

```text
auth_store_revisions/auth FOR SHARE + expected revision
→ mail_messages plain INSERT
→ mutation_receipts plain INSERT
→ COMMIT
```

普通附件邮件的事务顺序为：

```text
auth_store_revisions/auth FOR SHARE + expected revision
→ sender profile_binding FOR UPDATE
→ sender profile FOR UPDATE
→ profile_binding conditional UPDATE
→ profile conditional UPDATE
→ mail_messages plain INSERT
→ mutation_receipts plain INSERT
→ COMMIT
```

两条路径都不锁收件人 profile，也不推进 global revision。相同发件人的普通附件邮件由 profile revision 串行；不同发件人的普通附件邮件可以重叠；纯文本邮件即使来自同一发件人也没有 profile 热点。

## 回滚、发布与模糊 COMMIT

- 邮件 ID 或 operation receipt 重复、profile revision 失配、affected rows 异常、锁超时或任一 SQL 失败都会让此前暂存的扣物、档案、邮件和回执整单回滚。
- COMMIT 后 Node-local baseline 只合并精确 mail 与 receipt；普通附件再合并精确 sender binding/profile，不覆盖无关邮箱、档案或其他 Node 的提交。
- COMMIT 结果不确定时，纯文本只接受 exact mail + exact receipt；普通附件还要求 exact sender binding/profile。恢复不比较完整根，也不接受仅有相同 ID 但重放内容漂移的回执。
- 同 operation 在失败方 reload 后可以安全重放或重试，不会重复扣物或重复发信。

## 数据库与性能边界

- 纯文本不读取或锁定 profile；普通附件只在单一发件人上串行。
- 不扫描收件箱，不增加全局邮箱容量 guard，也不增加新的 `server_state/auth` 热点。
- 继续复用 Phase264 的 Beastbound Session-only 锁等待限制和进程内事务 hard deadline。
- 没有执行 `SET GLOBAL`、`SET PERSIST`、`SET PERSIST_ONLY`、配置文件修改或数据库重启；共享 MySQL 的全局值不变。
- 本阶段是事务正确性和并发边界证据，不宣称已经达到单地图 200 人吞吐或长时多 Node 发行容量。

## 验证

最终定向 Node 验证共 `275/275` 通过，未运行完整本地 CI：

- 服务、durable、邮件规则与 shared read：`129/129`；
- mail send/claim planner、锁序、multi-store 与期限：`77/77`；
- shared transaction 并发交错：`30/30`；
- MySQL 存储隔离回归：`38/38`；
- 玩家搜索与邮件 HTTP 主链路：`1/1`。

`git diff --check`、所有修改 JS/MJS 的 `node --check` 也通过。

一次性隔离 MySQL 9.7.0-er2 / `REPEATABLE-READ` 门槛使用随机非 3306 端口、128 MiB buffer pool 和非玩家 schema，证明：

- `mail_send` 权威读取真实按用户名解析收件人且没有邮箱分区读取；
- 同一发件人的两封纯文本邮件真实重叠并都成功；
- 不同发件人的普通附件邮件真实重叠并都成功；
- 同一发件人的普通附件邮件在 profile 行出现真实锁等待，首轮恰好一笔成功，失败方以原 operation reload 后安全成功；
- 强制重复 mail ID 和重复 receipt ID 都在前序写入后触发整单回滚；
- 邮件测试 schema 的 global revision 保持稳定，`deadlockDelta=0`，结束时 active transaction 与 lock wait 都为 0；
- 一次性 mysqld、datadir 和门槛进程全部清理，未读取外部 MySQL 密码，未连接共享玩家库。

## 非目标与后续

- 装备邮件依赖完整 equipment ownership、provenance、信封和永久墓碑审计，继续使用 legacy 全资产事务。
- 系统邮件、市场成交邮件、货币邮件和未来批量发信不冒充普通玩家发信 scope。
- 邮箱保留上限、归档和分页需要单独产品决定。
- event/presence/WS 路由、旧二进制滚动混跑策略与长时真实多 Node soak 仍留在 `P0.6d` 父项。
