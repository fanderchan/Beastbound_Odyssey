# Phase 422：活动邮箱 200 上限与正式邮件中心

## 目标与产品规则

本阶段完成 `P0.6d-2c-12b-3e`，并收口 `P0.6d-2c-12b`：活动收件箱固定最多 200 封，玩家邮件在数据库内按收件人原子占用容量；满箱时发送明确失败，发件人的普通附件与 durable receipt 都不得提交。系统资产不再依赖活动邮箱容量，继续由 Phase 421 的奖励仓保管和领取；已结算邮件继续按 Phase 420 的 30 天规则进入只读归档，不以静默删除附件换容量。

正式客户端将原来单一邮件列表整理为四个互相独立的玩家页签：

- `收件箱`：独立 keyset page、加载更多、未读角标和活动容量；
- `奖励`：独立 reward cursor、可领取角标与幂等领取；
- `归档`：独立 archive cursor，只读查看，不出现领取入口；
- `写信`：保留已有玩家发信合同和失败反馈。

容量与角标来自同一次服务端交叉认证摘要，不由客户端根据当前已加载的局部页猜测。正常玩家界面只显示中文业务结果，不暴露计数器 revision、feature flag、数据库错误码或 QA 文案。

## 跨 Node 原子容量

generation 1 邮件写计划在既有 control fence 后，为目标收件人执行：counter seed → 有界 counter increment → permanent identity insert → physical mail insert → receipt。启用上限后，计数增加固定使用：

```sql
UPDATE mail_active_counters
SET active_count = active_count + ?, revision = revision + 1
WHERE recipient_account_id = ? AND data_generation = 1
  AND active_count <= 200 - ?
  AND revision < 18446744073709551615
```

`affectedRows=1` 才能继续写邮件；`affectedRows=0` 时事务在同一行锁内重读活动计数。只有可证明 `activeCount + incrementBy > 200` 才映射为 `mail_recipient_full`，否则仍按资源冲突失败关闭。该失败带 `noCommitGuaranteed + rollbackConfirmed`，客户端收到“对方邮箱已满，附件也没有扣除”，不能把未知提交结果伪装成满箱。

两个独立 Node 执行器共享同一计数器的确定性夹具证明：首笔把 `199→200` 并提交；第二笔串行取得同一行后尝试第 201 封，必须在 mail／receipt insert 前回滚，计数保持 200。归档迁出继续在同一事务减少活动计数，奖励通知在已有容量时仍只投递空附件通知；满箱时奖励本体保留在 vault。

## 邮件中心摘要与客户端状态

`GET /mail/inbox` 的 MySQL 专用分页结果增加严格九字段 `mailCenterSummary`：schema、活动数、固定容量 200、未读数、可领取奖励数、归档数，以及 archive／vault／active-limit 三个能力状态。服务端分别读取活动 counter、未读 COUNT、可领取 reward COUNT 和 archive COUNT 后交叉认证：

- 所有计数必须是非负安全整数，`unreadCount <= activeCount`；
- active limit 开启时 `activeCount <= 200`；
- active limit 只能在 reward vault 已开启时出现；
- 摘要字段不接受额外键或客户端回填。

Godot `MailCenterModel` 分别维护 inbox、reward、archive 的 entries、cursor 和 `hasMore`。切页只刷新目标数据源，不把局部页采纳为完整邮箱；领取奖励后只更新目标 reward 行并安全减少角标。账号 token 轮换会取消旧请求并一次性清空三个 page、摘要、选择和 active tab。每次请求票据绑定 token、session generation 和 domain owner；切号后旧响应即使迟到，也无法覆盖新账号邮件状态。

1280×720 实机收口后，顶部使用紧凑的“容量 200/200”，四页签与底部操作完整留在面板内；详情中的 ISO 时间改为玩家可读的 `YYYY-MM-DD HH:MM`。满容量、未读、奖励数量只作为业务信息显示，不在玩家界面加入数据库或测试说明。

## 停服启用顺序

本阶段只交付能力和门禁，没有连接或修改共享 MySQL，也没有执行真实 feature enable。正式启用必须由外部运维先完成备份并排空全部 Node，然后按既有单调顺序确认：bootstrap ready → archive enabled → reward vault enabled → active limit enabled。最后一步命令为：

```sh
npm --prefix server/node run mail-active-limit:enable -- --maintenance-confirmed
```

命令拒绝 host、端口、账号、密码、database、socket 或任意 env 覆盖，只能创建 fresh dedicated maintenance store。事务按 source → identity → counter → archive → vault 全量锁定并重新认证，要求 vault 已开启、全部活动计数与物理活动邮件一致且没有账号超过 200；随后只把 `active_limit_enabled` 从 0 单调切为 1。重复执行是只读幂等回滚；COMMIT 回包丢失只接受 control 的精确前态或精确后态。成功后所有正常 Node 必须统一重启并捕获新 flag，不允许新旧 writer 滚动混跑。

## 验证证据

- Node 邮件中心、200 上限、归档／奖励兼容、启动围栏、HTTP、写入顺序与条件发送定向组合：`212/212`；其中发送条件事务 `35/35`、MySQL inbox 摘要／分页 `7/7`。
- 仅含本阶段暂存内容的干净快照扩展邮件／奖励矩阵为 `344/348`；4 项失败均是父阶段已记录的 claim 夹具未先选角（`character_selection_required`），本阶段定向覆盖保持全绿，未把该既有基线误报为本阶段通过。
- 双 Node 共享 counter 夹具：`199→200` 首笔提交，第 201 封完整回滚，活动计数不超限、mail／receipt 均未写；产品层满箱回归同时证明发件人附件保留。
- Godot parse 无 `SCRIPT ERROR`／`Parse Error`；正式邮件中心自动检查覆盖 page model、严格摘要、四页签、容量／角标、奖励领取、账号清空与真实迟到响应票据，结果 `status=ok`。
- Metal 真实窗口截图为 `1280×720`，四页签、容量、列表、详情与操作区均未越界；截图使用隔离 QA 档案。正式玩家档案清单 SHA-256 在取证前后均为 `f41d9246c493c9f1ab919349d51fc14a79c7a048c78e6569d454c856487b2aee`，隔离目录已清理。
- 固定 60 FPS 性能探针：世界静置 `process_total=0.03ms`；真实跨帧移动 `status=ok`、`process_total=0.03ms`；邮箱保持 90 帧时 `process_total=0.07ms`、`hud_update=0.03ms`、`draw_world=0.18ms`。本阶段没有把分页、摘要构造或网络请求放入逐帧热路径。

## 剩余风险

本阶段没有在真实 MySQL 上执行停服开关或多进程压力测试；fake pool 的双 Node 行级串行证据证明 SQL／执行器合同，但不能替代隔离真实库的锁等待、故障注入和长期 soak。`P0.6d-2c-12c` 仍需把装备归属从跨容器扫描收敛为增量 registry，`12d` 仍需完成通用 planner touched-set 与 200 档案／120 挂单／20k 回执／100k 墓碑组合容量门槛；这些未完成项不因邮件中心可用而自动关闭。
