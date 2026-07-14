# Phase 261：邮件领取与装备信封 MySQL 原子结算

## 问题与玩家风险

领取邮件可能同时增加角色货币/背包、改变任务进度、精确扣除邮件附件、删除空邮件，并把已物化的装备信封写入永久消费墓碑。旧的全根快照写法在多 Node 竞争下可能重复发奖，或只完成档案、邮件、墓碑中的一部分。

本阶段把成功的 `claimMailAttachments` 纳入细粒度条件事务；发信、标记已读和异常/未来邮件仍走原有失败关闭或 legacy 路径，不改变邮件容量、领取顺序和玩家经济规则。

## Beastbound 结算合同

一次成功领取必须在同一个 MySQL 事务中完成：

1. 收件人的 binding/profile 从 `r` 条件更新为 `r+1`，包含实际入包、货币和任务结算。
2. 背包不足时精确 UPDATE 同一邮件的剩余普通物品/装备信封；附件清空时精确 DELETE。
3. 每个成功物化的装备信封按 ID 排序，以 plain `INSERT` 写入 `consumed_equipment_envelopes`。
4. 最后以 plain `INSERT` 写入唯一 durable mutation receipt。

任一行锁事实漂移、`affectedRows != 1`、墓碑/回执重复或 COMMIT 失败，档案、邮件、墓碑和回执整笔回滚。通用 legacy 墓碑写法仍保留幂等 upsert；只有本条件事务使用严格 INSERT，不能把“另一个 Node 已消费”误判为本次成功。

## Scope 与失败关闭

服务层只为成功且带唯一回执的 `claimMailAttachments` 签发 `row_local_mail_claim_v1`，绑定 account、player、mail、最终 `update/delete`、按字典序排列的 claimed envelope IDs 以及 operation/request/action 身份。

Scope 不从公开的装备 instance ID 猜测墓碑。服务层和 MySQL planner 都分别计算 before mail 到 after mail 实际移除的 envelope IDs，并要求它与 append-only consumed ledger delta 完全一致。Planner 还会再次证明：

- 只有收件人的一个 binding/profile 发生严格 `r -> r+1`。
- 只有一封既有邮件发生 UPDATE 或 DELETE，SQL 主键、内部 mail ID 和收件账号一致。
- 部分领取只允许物品、货币和信封严格减少；邮件元数据与剩余信封内容保持不变。
- consumed ledger 只追加本邮件实际移除的墓碑。
- 只新增一个与 scope 完全一致的 immutable receipt。
- 任何其他持久 bucket 或额外邮件变化都会回退 legacy。

任务进度和可能自动领取的任务奖励属于同一 profile JSON，不被错误拆成第二个资源事务。

## Canonical 锁序

事务顺序固定为：

```text
global revision FOR SHARE + expected revision
→ recipient binding FOR UPDATE
→ recipient profile FOR UPDATE
→ target mail FOR UPDATE（SQL 镜像列 + document_json 精确核对）
→ binding/profile conditional UPDATE
→ exact mail UPDATE 或 DELETE
→ claimed envelope IDs 字典序 strict INSERT
→ mutation receipt strict INSERT
→ COMMIT
```

不同账号、不同邮件可以重叠；同一邮件双领只能一个成功。同一账号的不同邮件仍由 profile revision 串行。两个损坏来源若携带同一 envelope，唯一键会让后到事务在已执行档案/邮件写后失败，并由 MySQL 回滚全部前序写入。

`read_at` 使用 MySQL null-safe 条件，并要求锁定结果真实返回 `NULL`，不能把缺列的伪结果当成匹配。

## COMMIT 后发布与模糊恢复

Node-local baseline 只合并本次已证明的目标 binding/profile、目标邮件 UPDATE/DELETE、canonical receipt lineage 和 committed consumed ledger，不把请求 candidate 的其他邮件或全根状态发布为数据库最新值。

COMMIT 响应丢失时，只在以下事实全部匹配时恢复成功：exact receipt、exact binding/profile、目标邮件的精确剩余文档或确定不存在，以及每个 claimed envelope tombstone 已存在。恢复不比较完整历史墓碑集合，允许其他 Node 同时追加无关墓碑；成功后发布完整 reload 以吸收其他提交。资源后来又合法推进时允许保守返回未知，不能误报成功；同 operation ID 重试仍由 durable receipt 安全重放。

## 验证证据

- Planner、普通/装备部分与完整领取、失败关闭、真实 durable scope、Node-local merge 和模糊 COMMIT：`server/node/test/mysql-mail-claim-conditional-save.test.js`，`19/19`。
- Shared transaction harness：不同账号邮件真实重叠、同邮件严格一胜一败、重复 tombstone 在前序档案/邮件写后整笔回滚，`17/17`。
- 既有邮件/市场/profile 定向回归 `108/108`；durable/HTTP/装备隔离/mail attachment 规则 `74/74`；存储测试隔离运行 `36/36`。
- 一次性隔离 MySQL 9.7.0-er2、REPEATABLE-READ、随机非 3306 端口、128 MiB buffer pool：
  - 普通邮件部分领取真实 UPDATE 并保留精确余量。
  - 普通邮件完整领取真实 DELETE，档案与回执共同提交。
  - 预先存在的装备墓碑在档案与邮件写之后触发 duplicate，整笔事务回滚，邮件和档案未变化、回执未插入。
  - `deadlockDelta=0`、`activeTransactions=0`、`activeLockWaits=0`、`cleanupVerified=true`。

隔离 MySQL 门槛使用一次性 datadir 和非玩家 schema，主动清空外部 MySQL 凭据，不连接或修改玩家数据库。存储文件与其他测试并行时，两项全局临时目录断言会互相观察并镜像失败；按该文件原有隔离要求单独运行后 `36/36` 通过，不属于产品回归。

## 明确未完成

- 其他 Node 的内存邮箱/市场列表仍可能短暂陈旧；跨 Node read-through、变更失效和最终资产对账属于 P0.6d-2c-4。
- 本阶段证明的是事务正确性，不是 200 人容量、吞吐或长期 soak 结论。
- 发信、标记已读、装备市场上架/购买/撤单尚未全部进入统一跨资源锁序矩阵；这些在 2c-4 一并收口。
- Planner 对邮件余量采用严格单调减少和 envelope 对账；完整物品/货币业务语义仍以已经过测试的 mail domain 为权威，不在存储层复制第二套容易漂移的玩法实现。
