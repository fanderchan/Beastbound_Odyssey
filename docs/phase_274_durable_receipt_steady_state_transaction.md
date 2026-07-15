# Phase 274：2 万回执稳态条件事务

## 目标与红灯

本阶段完成 `P0.6d-2c-11`：durable receipt 达到 20,000 条后，普通档案、市场和邮件条件事务仍能用有界、可认证的过期回执替换继续运行；达到容量不能永久退化为 `legacy_global_cas`，也不能为了腾位置删除仍在 72 小时有效期内的幂等结果。

修复前有三个确定性红灯：

1. 回执满额且没有过期项时，容量清理会淘汰最老的活动回执，使仍在重试窗口内的请求失去第一次结果；
2. 六类 conditional planner 只接受 receipt INSERT，任何 receipt DELETE 都会退回 global EXCLUSIVE；
3. 初版兼容实现仍让 legacy 路径按 operation ID 宽松删除。若条件事务先删除同一过期 victim，陈旧 legacy DELETE 命中 0 行后仍可能继续插入新回执和推进 auth revision，造成物理 20,001 行而计数仍为 20,000。

最终实现同时封住这三条路径。回执容量仍是硬上限，不以牺牲幂等安全换取吞吐。

## 保留期与容量规则

- durable receipt 继续保留 72 小时，硬上限继续为 20,000；
- 只有 `expiresAt <= 本次权威 committedAt` 的真实过期回执可以删除；不再存在 `reason: "capacity"`；
- 20,000 条全部仍活动时，新资产操作明确返回 `mutation_receipt_capacity_exceeded`，零资产写、零活动回执淘汰；
- 原始持久化账本超过 20,000 条时加载即失败关闭，不把超额数据静默截断；
- `auth-service` 每次操作只读取一次权威 `now()`，同一个毫秒值同时生成 `committedAt`、`expiresAt` 并参与过期判断，避免边界时钟漂移。

同 operation ID 的旧回执已过期时，优先严格删除旧行再用原 key 插入新结果。活动回执仍不可改写。

## 有界过期 victim

新 operation 在满额账本中需要腾出一行时：

1. 只查看 expiry index 给出的至多 256 个 canonical 过期候选；
2. 以新 operation ID 的稳定 FNV-1a hash 选择一个 victim；
3. 每笔操作至多产生一条过期 DELETE 和一条新 INSERT。

相同 operation 的重试会选择相同 victim；不同 operation 通常会分散到不同过期行。这样既不扫描 20,000 条对象，也避免满额稳态把所有不同账号事务集中到同一条最老回执上。

## 条件 planner 写集合同

以下六类条件计划都支持这一写集：

- `profile_conditional_v2`；
- `market_create_conditional_v1`；
- `market_cancel_conditional_v1`；
- `market_buy_conditional_v1`；
- `mail_send_conditional_v1`；
- `mail_claim_conditional_v1`。

认证要求为：

- 恰好一条 receipt INSERT；
- 零或一条 receipt DELETE；
- operation、request hash、action、account、committed/expires 时间、完整 JSON 文档都与 SQL 参数逐字段一致；
- DELETE 额外证明旧 `expiresAt <=` 新 receipt 的 `committedAt`；
- DELETE 只接受 `expired` 或 `expired_same_operation_id`，generic snapshot diff 不能成为在线删除凭证；
- DELETE/INSERT 的物理 key 按 canonical 总序获取；复用同一 key 时必须严格相邻 `DELETE → INSERT`；
- DELETE、INSERT 或容量 UPDATE 的 `affectedRows` 任一不是 1，整笔资产事务回滚。

不同 key 不承诺“所有 DELETE 永远先于所有 INSERT”；它们按统一 key 总序避免死锁。同一事务仍只有完整 COMMIT 或完整 ROLLBACK 两种结果。

## 精确容量计数与串行尾部

`auth_store_revisions/mutation_receipt_capacity` 的 revision 代表 `mutation_receipts` 的物理行数：

- 新 schema 以 `COUNT(*)` 初始化缺失的容量行；停服单写维护会重新按物理行数校准；
- 没有过期 victim 的净增长事务用有界 `+1` UPDATE，两个陈旧 Node 从 19,999 竞争时最多一笔进入 20,000；
- 删除一条、插入一条的净零事务不更新容量行；
- legacy 写同样从 typed receipt 写集计算净变化，不能让条件与兼容路径的计数分叉。

低于上限、没有过期 victim 的净增长事务仍会在这一条专用 capacity 行上短暂串行。这是保证 20,000 硬上限所需的窄尾部，不是 auth global EXCLUSIVE；达到 20,000 后，选择不同过期 victim 的不同账号净零事务不触碰 capacity 行，可以真实重叠执行。

## Legacy 失败关闭与兼容边界

legacy planner 保留 global EXCLUSIVE，但 receipt DELETE 不再执行宽松的 `WHERE operation_id = ?`。计划先生成 typed 写集，执行时改用七字段参数化严格 DELETE；如果目标已被另一事务替换，`affectedRows = 0` 会在新 receipt、资产写和 auth revision 提交前触发整笔回滚。

raw SQL 只作为同步维护和诊断文本，执行器逐条核对它与 typed 写集的数量、顺序和内容。只有以 `INSERT INTO mutation_receipts` 或 `DELETE FROM mutation_receipts` 开头的语句才会被识别为回执写，玩家 JSON 文本中出现 `mutation_receipts` 不会误分类。

旧二进制不会维护新的 capacity 行，因此不支持新旧节点在线混写。部署顺序必须是：排空资产写流量、停止旧节点、全量升级、校验 `COUNT(mutation_receipts) == mutation_receipt_capacity`，再恢复写流量。若账本已经超过 20,000，必须先离线审计，不能由运行时静默删除玩家幂等凭证。

## 验证

当前定向证据：

- durable state、resource order、profile planner、large journal 与 exact read：`75/75`；
- 五个市场/邮件 conditional 文件：`116/116`；
- MySQL 存储文件串行：`39/39`；
- multi-store：`10/10`；
- shared transaction harness：`32/32`，其中新增确定性交错证明条件事务先提交后，陈旧 legacy 的七字段 DELETE 命中 0 行并整单回滚，最终回执行数和 capacity 均为 20,000，auth revision 为 0；
- `node --expose-gc tools/p0_6_large_collection_journal_gate.mjs` 通过：200 档案、20k receipt、100k tombstone 下最新 recording MySQL path p95 为 `3.848 ms`，每笔至多一条过期 DELETE，历史对象 key scan 为 0；
- 一次性隔离 MySQL 的 `--receipt-retention-only` 门槛约 `22.86 s`：19,999 并发净增长恰一笔成功；条件事务抢先替换 victim 后陈旧 legacy 的邮件、背包扣减、binding/profile revision、新回执和 auth revision 全部回滚；20,000 稳态不同账号选择不同 victim，B 可在 A 尚未 COMMIT 时完成；deadlock、活动事务和锁等待残留均为 0；
- 完整隔离 MySQL 门槛约 `123.29 s`，覆盖相邻 profile、市场、邮件与回执场景；MySQL 9.7/RR 下全部 qualified，四个独立 schema 的 deadlock、活动事务和锁等待残留均为 0，清理成功。

所有真实数据库证据都来自随机独立 schema 和临时 mysqld；没有连接共享玩家数据库，没有修改 MySQL GLOBAL/PERSIST 参数，临时实例、端口和 datadir 均在结束时清理。

## 非目标与后续

- 本阶段没有改变回执 TTL、容量、市场/邮件/银行经济规则、客户端协议或 UI；
- 没有宣称支持新旧服务二进制混跑；
- 专用 capacity 行的净增长短串行尾部仍然存在，长时多 Node 容量门槛留在父项；
- 固定 20,000 条且保留 72 小时，理论稳态只容纳约 6,667 个新 durable operation/日；本阶段按既定 20k 合同解决正确性，不把它宣称为 200 人正式服容量，容量参数必须在真实流量模型建立后重新评估；
- `P0.6d-2c` 父项尚未完成；下一项是 `P0.6d-2c-12` 的邮箱、装备归属 registry 与通用 diff 热路径有界化，复杂装备真实 MySQL 收口仍留 `2c-13`。
