# Phase 281：邮箱 bootstrap 只读一致性预演

## 目标与产品边界

本阶段完成 `P0.6d-2c-12b-3b-2b`：让维护者能够用真实服务端目录读取现有物理邮件和 generation 辅助表，连续生成两份独立的一致性快照，确认来源、规划与目标表在预演期间是否发生漂移。

这是诊断工具，不是迁移执行器：

- 只支持 dry-run，没有 `apply`、writer、DML、DDL 或 `COMMIT`；
- 两次读取完全一致时仍固定 `applySafe=false`，不能据此写库；
- 不创建、不检查、不输出也不接管数据库备份，用户现有定期备份继续由外部运维负责；
- 不要求 dry-run 时停服；在线写入造成 A/B 漂移时只报告不稳定。真正 apply 必须等 generation 1 全写路径完成，并在停服持锁事务内重新读取和重新对账。

## 真实附件认证

bootstrap 不启动 `auth-service` 或 HTTP server，也不加载完整 authority root。独立目录认证器直接复用生产数据加载器：

- `bag_items.json` 提供普通物品身份；
- `equipment_items.json` 与 bag item 的 `useContexts=equipment` 共同识别装备；
- `player_growth.json` 提供装备耐久规则；
- `level_curves.json` 提供装备信封内等级/经验认证所需的最大等级与经验曲线；
- `readMailAttachmentState` 继续负责 schema1/2、普通附件、货币和装备信封的 fail-closed 认证。

未知物品、future mail/envelope schema 或任何不完整装备信封都会使该次规划失败；工具不会猜测、删除或修补历史资产。

## MySQL 只读快照

每次 snapshot 都从 Beastbound 自己的连接池 checkout 一条连接，复用既有 SESSION-only 锁等待策略和进程内 hard deadline，固定执行：

1. `SET SESSION innodb_lock_wait_timeout/lock_wait_timeout`；
2. `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`；
3. `START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY`；
4. 在同一事务内认证五张生命周期表的精确结构，同时认证活动 `mail_messages` 为 InnoDB 且七个来源字段精确兼容，再读取 control、七字段 source、identity、counter、archive key 和 vault key；
5. 正常结束也执行 `ROLLBACK`，随后释放连接。

adapter 不接受 apply 参数，查询不包含锁定读、业务写、结构写或 server-global 配置。START/SELECT 失败时先尝试回滚；回滚失败或 hard deadline 时销毁连接，不能把状态未知的连接放回池中，也不能返回半份 snapshot。

## 双快照漂移探针

CLI 连续调用 adapter 两次；每次事务已经结束后才开始下一次，因此 A/B 是两个独立的 RR/read-only 一致性观察。每份快照都重新执行 planner、verify 与 reconciler，并计算：

- `sourceDigest`：完整物理邮件来源；
- `planDigest`：generation 1 identity/counter 的完整确定性规划；
- `targetDigest`：规范 control、identity、counter 及 archive/vault key 集合。

只有三类摘要和 plan/verify/reconcile 三项检查状态都一致才报告 `stable=true`。相同邮件数量下正文变化、相同 identity/counter 数量下字段变化、control 变化、行增删或同摘要但认证结果变化都必须变成漂移。两份相同的冲突快照可以是 `stable=true`，但 `ok=false`；只有 A/B 两份都通过完整检查且稳定时 `ok=true`。无论哪种结果，未来停服 apply 仍必须在自己的持锁事务里重新 build/reconcile。

## 隐私与操作入口

运行入口为：

```sh
npm --prefix server/node run mail-storage:dry-run
```

参数在读取 `.local/mysql.env`、加载目录和建立连接之前认证。当前只接受无参数或 `--dry-run`；`--apply`、`--backup-path`、维护确认和未知参数都会提前拒绝。

stdout 只允许固定字段：模式、布尔状态、SHA-256 摘要、邮件/身份/收件人计数、exact/missing 数量、对账状态，以及经过已知 code 集合和已知 planner path 结构双重白名单过滤的 code/path。报告不含 mailId、账号、标题、正文、附件、货币、missing row、冲突 key、SQL、连接配置、密码、stack 或底层错误文本。

## 验证边界

验证使用 recording fake pool、纯对象和仓库内真实目录，不连接共享 MySQL、不执行 DDL/DML、不修改玩家账号或邮件。聚焦检查覆盖：真实普通物品与装备信封、未知/future 数据失败关闭、201 封不截断、source InnoDB/七字段与辅助表结构、control/数字/JSON 异常、同连接一致性读取、事务期限与连接清理、A/B 同数量内容漂移、目标同数量字段漂移、状态型认证器结果漂移、参数早拒绝、SQL 副作用词拒绝及完整输出秘密扫描。最终核心检查 `49/49`、计入精确结构合同后 `60/60`、连同相邻事务 guard、附件、生命周期与 authority 合同共 `92/92` 通过；syntax 与 `git diff --check` 通过。
