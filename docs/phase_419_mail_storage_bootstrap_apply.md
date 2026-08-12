# Phase 419：邮箱停服 bootstrap apply 与提交模糊恢复

## 目标与边界

本阶段完成 `P0.6d-2c-12b-3b-2d`：在所有旧 Node 已经停止并排空写事务后，由一个专用停服维护进程把既有 `mail_messages` 保守登记到 generation 1 的永久身份与每收件人活动计数，完成全量对账后才把唯一 control 行切为 `ready/data1`。

这不是在线迁移，也不是新玩法。它不会启用活动邮箱 200 上限、30 天归档或奖励仓领取，三项 feature flag 在写前、切换条件和最终读回中都必须保持关闭。它也不会猜历史系统奖励来源、补造 `settledAt`、搬移活动邮件、复制装备或其他资产。数据库备份继续由既有外部运维负责；本工具不创建、不检查、不声明备份可恢复。

安全部署顺序固定为：先部署 Phase 282 及以后、能维护 generation 1 的二进制但保持 data0；停止并确认所有旧 Node 已排空；按现有外部流程完成备份；先运行 dry-run；再显式运行 apply；只有报告明确成功后才允许启动当前二进制。`--maintenance-confirmed` 是操作员对“全部 writer 已停止”的明确声明，工具不会把进程扫描猜测当成跨主机停服证明。

## 单一持锁事务

专用 apply store 不能从普通 server store、只读 store 或环境变量自动获得能力；CLI 必须同时提供 `--apply --maintenance-confirmed`，并创建一个尚未进入普通 authority load/save 生命周期的 fresh store。apply 只使用 mysql2 pool 和 Beastbound 连接级超时策略，不执行 CLI 拼接 SQL、不启动服务、不加载完整玩家根。

事务固定执行：

1. 每次 checkout 先设置该 Beastbound session 的行锁／metadata lock 等待，再以 RR 开始事务；禁止 `SET GLOBAL/PERSIST/PERSIST_ONLY`；
2. 在同一事务逐表认证当前精确结构，并对 control、全部活动邮件、identity、counter、archive key、vault key 做 `FOR UPDATE` 锁定读；
3. 重新用当前正式目录 build、verify、reconcile；dry-run 的摘要只作运维参考，不能成为本次写授权；
4. uninitialized 先以完整旧值谓词把 control 切到 `building/data1`，building 可从 exact 子集继续；identity/counter 只以最多 128 行一批的参数化 plain INSERT 补入缺失确定性行，每批 affectedRows 必须与输入行数完全一致，重复键或少写任一行都会整单回滚；
5. 补齐后再次持锁全量读取、重建计划并要求 `finalize`；来源或计划摘要变化立即回滚；
6. 以全部 generation、状态、关闭 flag、cursor、计数和 source digest 作为 CAS 条件切 `ready`，再第三次完整持锁读取并要求 `already_ready`，最后才发送 COMMIT。

空邮箱同样形成可认证的 `ready/data1`：计数保持零，物理 cursor 保持 NULL，规范投影读为缺省空字符串。已精确 ready 的重复运行是锁定 no-op，只 ROLLBACK，不再发送 COMMIT。building 断点只补 missing 行，任何 drift、extra、非空 archive/vault、feature flag、坏附件或 future schema 都失败关闭，不覆盖或删除目标行。

## COMMIT 结果模糊

COMMIT 发出后连接超时或断开时，原连接立即销毁，绝不发送 ROLLBACK，也不直接重跑事务。恢复只允许新 checkout 的独立连接执行第二个 RR 事务，并用 control `FOR UPDATE` 当前读等待原事务真正完成，再逐表重读和重新认证：

- source/plan 完全相同，且完整 target digest（包括本次 `reconciledAt`）与 COMMIT 前第三次读回的 exact `ready` 完全一致：证明已提交，返回 `mail_storage_bootstrap_apply_recovered`；另一维护者随后产生的不同 ready 不能冒充本次结果；
- source/plan 完全相同、reconcile 仍安全且完整 target digest 与写前完全相同：证明未提交，返回 `mail_storage_bootstrap_commit_not_applied`，只此结果允许操作员显式重跑；
- 任一其他状态、独立读取失败或无法认证：返回 `mail_storage_bootstrap_commit_outcome_unknown`，`retryable=false`，必须停手调查。

报告只包含固定 kind/schema、状态、action、四项计数和 SHA-256 摘要，不包含 mailId、账号、标题、正文、附件、SQL、凭据、stack 或驱动错误文本。事务已经明确完成后，即使连接池 close 报错也不会覆盖已知 durable 结果。

## 操作入口

只读预演保持：

```sh
npm --prefix server/node run mail-storage:dry-run
```

正式 apply 必须显式追加停服确认；package script 自身故意只带 `--apply`，单独运行会在加载环境或连接数据库前拒绝：

```sh
npm --prefix server/node run mail-storage:apply -- --maintenance-confirmed
```

参数不接受 host、账号、密码、database、env 文件或 backup path；连接配置仍只来自 ignored `.local/mysql.env`／既有环境合同，避免凭据进入 shell 历史或 stdout。

## 验证证据

新增 recording transactional fake pool 覆盖首次 start、空箱、201 封真实计数与 `128+73` 有界批次、building 缺行续填、already-ready no-op、目标漂移、重复键、持锁重读来源漂移，以及 COMMIT 模糊的“已提交／未提交／第三状态未知”三分支；同时覆盖缺维护确认零连接、普通 store 零连接、专用 fresh-store capability、CLI 参数早拒绝、报告脱敏和关池异常不覆盖已知结果。

聚焦 apply/read/dry-run/CLI 回归 `39/39` 通过。测试未读取 `.local/mysql.env`，未连接共享 MySQL，未执行真实 DML/COMMIT，未读取或修改玩家邮件、账号或资产，也未修改 MySQL 全局参数。相邻 planner、schema、forward writer、事务 guard、邮件生命周期与 store 回归在最终发布门槛继续验证；真实库 apply 属于有备份、有停服窗口的后续运维动作，不把 fake pool 结果冒充已迁移真实数据库。
