# Phase 420：30 天只读邮件归档事务与独立分页

## 目标与边界

本阶段完成 `P0.6d-2c-12b-3c`：只把已经由永久身份登记为“无待领资产、已结算”，且结算时间达到 30 个完整 UTC 日的活动邮件，原子迁入 MySQL 只读归档。迁移同时更新永久身份位置、删除活动实体并递减收件人活动计数；任何一步冲突都整批回滚。

这不是活动邮箱 200 上限，也不是奖励仓。`vault_claim_enabled` 与 `active_limit_enabled` 继续保持关闭；未领取物品、货币或装备邮件永远不因年龄进入归档，缺少显式 `settledAt` 的 legacy 空邮件也不猜测结算时间。正式客户端的“收信／奖励／归档／写信”四区与 200 容量展示继续由 `3e` 完成，本阶段只提供已经认证的服务端只读分页能力。

## 启用顺序与运维门禁

归档能力默认关闭。只有 generation 1 bootstrap 已完成、所有旧 Node 已停止并排空、现有外部备份流程已经完成后，才允许专用 fresh maintenance store 执行：

```sh
npm --prefix server/node run mail-archive:enable -- --maintenance-confirmed
```

package script 故意只带 `--enable`；缺少 `--maintenance-confirmed` 会在 env、目录、物理结构审计或连接池创建前拒绝。命令不接受 host、端口、账号、密码、database、env 文件或 socket 参数，避免凭据进入命令历史。

启用前先独立认证 source 与五张邮箱生命周期表的物理结构；随后在单一 RR 事务内按 control → 全部活动邮件 → 全部永久身份 → 全部活动计数 → archive key → vault key 的顺序锁定当前事实。当前正式目录重新认证每封活动邮件，再从 source 重建身份与计数期望；历史 bootstrap 计数只能小于等于当前 forward-maintained 计数，archive/vault 必须仍为空。只有 source、identity、counter 和关闭中的其他 feature flag 全部精确一致，才 CAS 单调写 `archive_enabled=1` 并读回后 COMMIT。

COMMIT 回包丢失时销毁原连接，只用独立连接读取 exact control 当前值：本次完整旧 control 只变化 archive flag 才恢复成功；仍是精确旧值才报告未提交且可显式重跑，其他状态固定 outcome unknown。启用后必须重启正常 Node；运行中 store 只使用启动时捕获的 flag fence，不热切换普通 writer 能力。

## 归档事务

后台维护默认启动后等待 30 秒，每 5 分钟执行一轮；每批最多 64 封、单轮最多 4 批，硬上限分别为 128 与 16。重叠触发合并为同一任务，失败只结束当前轮并记录固定错误码，下一轮仍可运行；关机先停止调度，等待当前数据库事务结束后不再开启下一批，再与 HTTP、WebSocket、durable queue 一起排空。

单批使用 Beastbound 连接级 session policy 与 RR：

1. 以 SHARE 锁定 exact generation 1／ready／archive-only control；
2. 从永久身份按 `settledAt <= now - 30 days` 选择有界候选；
3. 按 binary key order 锁收件人计数、永久身份与候选活动邮件，避免 JavaScript 与 `utf8mb4_0900_ai_ci` 排序差异造成跨 Node 反向取锁；
4. 从活动正文重新执行 authority、真实附件目录与 lifecycle 认证，证明资产为空、显式结算、结算时间不晚于 cutoff、永久身份与 document digest 完全一致；
5. 对每封邮件依次 strict INSERT archive、CAS 更新 identity 为 archive、按完整物理正文 strict DELETE active，最后按收件人 exact decrement counter；
6. 所有 affectedRows 必须为 1，counter 不得下溢或 revision 溢出，最后才 COMMIT。

候选发现不持行锁，以保持全局资源顺序。等待期间若另一 Node 已经完成同一封邮件，当前事务只在同时锁定并认证 archive 正文、lifecycle、永久身份和活动行缺失后把它列为 `retiredMailIds`；任何局部状态或摘要漂移都回滚，不把“看起来已经没了”当成功。

COMMIT 模糊恢复只由独立连接当前读 control、counter、identity、active 与 archive：全部精确等于提交后状态才恢复成功，全部精确等于提交前状态才报告未提交，其他组合固定 outcome unknown、不可盲重试。与本批交错且已被其他 Node 归档的邮件也会在恢复连接重新认证，只有确证后才从 Node/store 基线退休。

## 只读分页与不可复活

`GET /mail/archive?limit=...&cursor=...` 使用独立的 opaque cursor envelope `v=1/k=mail_archive`，不能与活动收件箱 cursor 混用。分页固定按 `(createdAt DESC, mailId DESC)`、recipient-only、`limit+1` keyset 读取，无 OFFSET；同一 RR 内逐行认证 archive 正文与 permanent identity。公开结果只保留正常玩家邮件字段和 `archivedAt`，不暴露 sender/recipient account ID、摘要、revision 或内部诊断字段。

归档开启后，无 query 的旧客户端收件箱请求也强制走默认 30 条 MySQL 活动分页，不能从某个旧 Node 的完整缓存再次看到已归档邮件。已读与领取继续先做目标邮件精确共享读；物理活动行消失后返回 missing，不能更新 archive。legacy/global writer 在 archive flag 下仍必须锁 exact `location=active` 永久身份；已归档 identity 会令整笔事务在物理邮件写之前回滚。新信 strict identity INSERT 也不能复用历史 mailId。

## 验证证据

纯分页、eligibility、事务锁序、并发 stale candidate、COMMIT 三分恢复、启用门禁与非空 source 对账、后台调度／关机、HTTP 公开投影、旧客户端读穿、Node/store 基线同步、generation 1 ordinary writer 与资源顺序均由 memory 或 recording fake pool 测试覆盖。隔离 worktree 的定向归档与相邻 HTTP／writer／锁序矩阵为 `111/111`，changed-JS syntax 与 `git diff --check` 通过。扩展存储矩阵为 `293/297`，其中四个旧邮件领取失败在未改动远端基线的同一文件中同样为 `19/23`；durable 回归为 `50/51`，唯一 WebSocket 握手补档失败也在未改动远端基线单独复现，因此没有把既有红灯误报为本片回归或全绿。本阶段不连接共享 MySQL、不执行真实 feature enable 或归档 DML、不读取或修改真实玩家数据，也不设置 MySQL GLOBAL/PERSIST 参数。

真实库启用、真实多 Node 竞争与长期运行属于有备份、有停服窗口的后续运维门禁，不能把 recording fake pool 的绿灯表述成真实数据库已经迁移。`3d` 奖励仓和 `3e` 200 上限仍是明确未完成项。
