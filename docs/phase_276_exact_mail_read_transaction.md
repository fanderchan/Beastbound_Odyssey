# Phase 276：邮件已读精确行事务

## 目标与范围

本阶段完成 `P0.6d-2c-12b-1`，只收敛“标记邮件已读”的跨 Node 读取与 MySQL 写入热路径，不关闭整个活动邮箱/归档/分页任务。

此前 `markMailRead` 的领域逻辑虽然只按 `mailId` 修改一封邮件，但 MySQL 运行路径会先读取操作者档案和完整收件箱，随后因缺少细粒度 planner 回退 `legacy_global_cas`。邮箱越大，单次点开邮件付出的读取、diff 和锁竞争成本越高。

## 精确读穿合同

`markMailRead` 使用独立 `mail_mark_read` 范围：

- 请求绑定当前会话账号和目标 `mailId`；
- MySQL 只按 `(mail_id, recipient_account_id)` 读取目标行，不读取 profile、binding、完整邮箱分区或装备消费墓碑；
- 返回 `targetMailId + mailRows` 精确 replacement。存在且属于当前账号时只覆盖这一行；不存在或属于其他账号时只删除本 Node 对该 key 的陈旧缓存；
- 精确 replacement 不复用完整 `mailPartitions`，因此不会把未读取邮件误判为已删除；
- 行身份、收件人、镜像列、`document_json` 和装备信封基本结构不一致时失败关闭。

附件领取仍保留既有 profile/邮箱一致 RR 读穿。在 `P0.6d-2c-12c` 的装备归属 registry 完成前，不能把 claim 的所有权读集误缩成单行。

## 条件事务合同

服务端只为同一 canonical mailbox lineage 上唯一一条 `readAt: null -> canonical ISO timestamp` 的更新签发 `row_local_mail_read_v1`。以下任一情况都不能获得细粒度 scope：

- 目标邮件不属于操作者；
- 除 `readAt` 外任何字段改变；
- 同时夹带第二封邮件、profile 或其他持久资源变化；
- receipt 的账号、operation、request hash 或 action 不匹配；
- 目标原本已经是已读状态。

MySQL planner 再独立认证完整写集后生成 `mail_read_conditional_v1`：

1. 持有 global compatibility SHARE；
2. `SELECT ... FROM mail_messages WHERE mail_id = ? FOR UPDATE` 锁定并核对目标完整行；
3. 条件 `UPDATE` 只把该行推进到新 `readAt/document_json`；
4. 按统一资源顺序写回执容量与 immutable durable receipt；
5. COMMIT 后 Node-local store baseline 只合并目标邮件和回执，不把请求候选中的无关资源冒充数据库新快照。

并发附件领取若先提交，已读事务会在行锁后的完整文档核对或条件 UPDATE 处失败，不能用旧附件正文覆盖新状态；已读事务若先提交，领取会在最新行上继续结算。原本已读的邮件维持既有无业务写、无新 receipt 的幂等返回，不为本阶段扩大中央 no-op receipt 语义。

## 验证

定向证据：

- `mail-read-consistency`、shared view、MySQL shared read、planner、资源锁序、跨 Node 读穿及相邻 mail send/claim：非监听用例通过；
- durable COMMIT 与 HTTP 邮箱路由本机回环：`79/79`；
- 全部本阶段组合共 `215/215`；
- 2,000 封合成邮箱中，已读 planner 对 before/candidate mailbox 的 Proxy `ownKeys` 增量均为 `0`；
- 精确 shared read 只发出一条目标邮件查询，profile/binding/完整收件箱查询均为 `0`；
- 另一 Node 已完整领取时返回 `mail_missing` 且零保存，部分领取时保留最新剩余附件；
- 夹带第二封邮件或 profile 变化时回退 `legacy_global_cas`，不把不完整 touched set 当完整写集；
- JavaScript 语法检查与 `git diff --check` 通过。

测试使用隔离内存、recording/fake MySQL 连接和本机临时回环端口；没有连接共享 MySQL、修改 MySQL GLOBAL/PERSIST 参数或触碰真实玩家数据。

## 非目标与后续

- `/mail/inbox` 仍返回全量收件箱，MySQL inbox shared read 仍读取完整收件人分区；
- MySQL 启动 loader 仍会载入全部 `mail_messages`；
- 活动邮箱上限、30 天只读归档、未领取附件永久保留和系统奖励兜底仓尚未实现；
- 没有新增真实 MySQL 双事务竞争门槛，本阶段以完整行锁/条件写 recording 证据和现有跨 Node 回归为主。

下一步 `P0.6d-2c-12b-2` 必须让服务端 keyset cursor、Godot“加载更多”和服务端总未读数同一批交付。分页结果不得应用为完整邮箱分区，也不能先让旧客户端静默只看到第一页。
