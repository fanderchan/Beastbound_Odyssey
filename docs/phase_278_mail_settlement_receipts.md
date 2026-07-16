# Phase 278：已领取邮件结算回执

## 目标与范围

本阶段完成 `P0.6d-2c-12b-3a`。此前普通附件、货币和装备邮件在最后一次领取成功后会直接从 `mailMessages` 删除；这会让后续 30 天只读归档失去可信起点，也让玩家、GM 和 COMMIT 模糊恢复无法再看到“这封邮件已经结算”的持久证据。

本阶段只建立结算生命周期，不提前启用 200 封活动上限、30 天归档或系统奖励兜底仓。完整领取后的空回执暂时仍留在活动收件箱，待 `3c` 原子迁入只读归档。

## 生命周期合同

- 带任何普通物品、装备信封或货币的邮件都属于未结算邮件，内部文档不得出现 `settledAt`。
- 部分领取只减少本次真实发放的附件并保留原邮件；不得添加或改写 `settledAt`。
- 最后一批附件成功发放时，原 `mailId` 在同一资产事务内更新为 schema2 空回执：`items=[]`、`equipmentEnvelopes=[]`、`currency={}`，并写入唯一一次服务端 canonical ISO `settledAt`。
- 未读邮件完整领取时 `readAt=settledAt`；已读邮件保留原 canonical `readAt`。玩家重复点击只能得到 `mail_no_attachments`，不能再次获得资产或生成第二个结算时间。
- 新建纯文本玩家邮件从创建时即满足 `settledAt=createdAt`，但 `readAt` 仍可为空，因此“是否已读”和“是否还有待领资产”是两条独立状态。
- 旧的无附件且无 `settledAt` 邮件仍视为未认证 legacy 记录，不在本阶段猜测或自动归档；带资产却预带 `settledAt`、非法 `readAt/settledAt`、未知附件结构和未来字段全部失败关闭并保留资产。

## MySQL 与跨 Node 原子性

`row_local_mail_claim_v1` 只接受 `mailDisposition=update`。普通和装备完整领取的事务顺序保持：profile binding、profile、目标 mail 完整行，再写装备消费墓碑和 durable receipt；目标邮件使用带旧完整文档前置条件的精确 `UPDATE`，不再产生 `DELETE mail_messages`。

planner 独立认证：

- 完整领取只能从“原邮件确有资产且无 `settledAt`”推进到空回执；
- canonical `settledAt` 不早于可认证的 `createdAt`，`readAt` 必须符合上述保留/补写规则；
- durable receipt 的 `response.mail` 必须逐字段等于持久行的公开投影，不能只匹配 `mailId` 或时间；
- 部分领取、完整领取和装备消费墓碑仍只触碰目标档案、目标邮件和本次回执，不枚举未触碰邮箱历史；
- COMMIT 结果模糊时，只有重新读到同一 profile、空回执、消费墓碑和 immutable receipt 才能恢复成功。

因此另一个 Node 上的陈旧已读、市场、银行或装备转寄操作只能读到最新空回执，不能把已领取附件复活。两个并发领取同一邮件仍只有一个事务能通过目标行前置条件。

## 客户端合同

Godot 分页模型收到非空 `mail` 时原位替换同一邮件，不再把完整领取解释为删除。结算回执保留在列表中，继续显示独立的未读/已读状态，并附加“无待领附件”；详情显示结算时间和“附件：无（已结算）”，领取按钮变为禁用的“已结算”。旧服务端仍返回 `mail:null` 时保留原有删除兼容分支。

公开响应新增稳定的 `settledAt: string|null` 字段。服务端只有在严格附件解析与生命周期认证同时成功、邮件确实无资产且已结算时才下发时间；非法时间、带资产冲突或 future schema 即使原文档含该字段也只公开 `null`，避免客户端把受保护的异常邮件伪装成“已结算”。它是向后兼容的附加字段，不改变请求形状，因此本阶段不升级协议版本。

## 验证证据

- JavaScript/MJS 变更文件逐个 `node --check` 通过，Godot 4.7 parse 通过，`git diff --check` 通过。
- 定向服务端覆盖生命周期、严格公开投影、附件解析、普通/装备/货币领取、发信、市场、跨 Node 读穿、row-local planner、已读相邻路径和失败关闭，最终组合 `190/190`；HTTP 回环 `29/29`、MySQL 存储回归 `39/39`（唯一监听用例在允许回环的本机环境补跑）通过。
- recording MySQL 双事务集成 `32/32`：同信竞争只有一胜、不同邮件并发保留两份结算、市场与卖家领取交错、重复装备墓碑整单回滚。
- Godot `--auto-mailbox-check`、`--auto-auth-server-client-check` 连同 parse 共 `3/3`；可见 Metal 客户端结算回执截图为 `.run/evidence/phase278_mail_settled_receipt.png`。
- 当前 idle `process_total` 约 `0.25-0.52ms`；moving `0.27-0.36ms`、约 60 FPS 且 movement check 为 `status=ok`，与 Phase277 的旧 HEAD 范围同量级，未发现结算标签进入热路径。

测试使用 memory、fake/recording MySQL、本机临时 HTTP 回环和本地 Godot 客户端；没有连接共享 MySQL、修改数据库全局参数或触碰真实玩家数据。真实 MySQL gate 只同步更新了结算 UPDATE 契约和断言，本阶段未执行。

## 后续

下一项 `P0.6d-2c-12b-3b` 建立活动计数、永久邮件身份、只读归档和系统奖励仓的持久化地基及保守 bootstrap。在奖励仓可领取且旧档对账完成前，不能先启用活动邮箱 200 上限。
