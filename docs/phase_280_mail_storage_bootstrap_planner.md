# Phase 280：邮箱停服 bootstrap 纯规划与严格对账

## 目标与范围

本阶段完成 `P0.6d-2c-12b-3b-2a`：把现有 `mail_messages` 物理活动邮件转换成 generation 1 永久身份与每收件人活动计数的规则，收口为无 I/O 的确定性 planner/reconciler。

本阶段不连接 MySQL、不读取凭据、不写备份、不执行 DML、不改变 generation marker，也不启用容量、归档或奖励仓。`MAIL_STORAGE_MAX_SUPPORTED_DATA_GENERATION` 继续保持 0；在所有普通邮件 writer 接通之前，任何工具都不能把真实库切到 `ready/data1`。

## 物理来源认证

planner 输入每封邮件的七个物理事实：`mail_id`、sender、recipient、title、created、read 与完整 `document_json`。每行必须同时通过：

1. 七字段集合精确，SQL 列与 JSON 内的 mail/sender/recipient/title/created/read 逐项一致；
2. 现有 mail authority JSON/身份认证；
3. 调用方注入的当前生产附件认证器，覆盖 schema1/2、普通物品、货币和装备信封；
4. 现有生命周期认证，拒绝 future schema、未知资产、非法 read/settled 时间和“仍有资产却已结算”等冲突。

历史 schema1 与非 ISO `createdAt` 只要物理列和 JSON 严格一致，仍可保守登记；缺失 `settledAt` 必须保持 `NULL`，不能因为邮件看起来为空就补猜。显式 `settledAt` 只有通过当前附件与生命周期认证后才复制。

活动表和辅助表使用 `utf8mb4_0900_ai_ci` 比较域，而 JavaScript 不能安全模拟完整 MySQL collation。现有 durable ID 生成域是 lowercase ASCII，因此 bootstrap 对 mail/sender/recipient ID 也只接受 lowercase ASCII 的 `[a-z0-9_:-]+`；发现大小写、重音或其他历史异常时失败关闭，不自动改 ID、不合并账号。

## 确定性投影与摘要

- 每个物理活动行生成一个 `location=active` 的永久 identity；`rewardId/archivedAt` 固定为空。
- `identityDigest` 只绑定 mailId、sender、recipient、createdAt 四个永久事实；`documentDigest` 绑定带用途和版本标签的完整 canonical JSON。
- 每个收件人生成一个真实活动计数；201 封或更多仍按实际数量保留，不检查或截断到 200。
- 不根据 `mailKind`、标题或时间猜 system source，不生成 vault 行，不移动 archive，也不复制任何资产。
- source/plan digest 使用稳定 canonical SHA-256，绑定规则版本、完整来源、全部 identity/counter、计数与目标静态 marker；不包含当前时间或 `reconciledAt`。

`verifyMailStorageBootstrapPlan` 不把 SHA 当认证：必须再次传入当前附件认证器，重新执行附件与生命周期检查，再从 source 独立重建 identity/counter。即使有人修改投影或 future schema 后同步重算全部摘要，也不能通过 verify。

## target 对账与 forward-fix

reconciler 只接受已经由未来物理 adapter 投影成规范形状的 control、identity、counter、archive 和 vault 快照：

- 期望行不存在时记为 `missing`；
- 既有行必须逐字段 `exact`；
- 任一 drift、duplicate、target-extra、非空 archive/vault、坏 control、`ready` 缺行都属于 `conflict`；
- 一旦有 conflict，结果会清空全部 missing rows，不能边覆盖冲突边继续；
- `bootstrapCursorMailId` 仅作历史进度事实，forward-fix 始终以完整 exact/missing 对账为准，陈旧 cursor 不能跳过缺行；
- `uninitialized` 只接受四张业务辅助表全空；`building` 只允许当前 source 的 exact 子集；`ready` 必须完整 exact 才是 no-op。

纯 planner 只能声明 `sourceSafe`，纯 reconciler 只能声明 `targetSafe/forwardFixSafe`；两者的 `applySafe` 永远为 false。后续 executor 必须在同一持锁事务中重读物理 source/target、重新 build/reconcile 并核对预期摘要后，才可产生真正的写授权。

## 隐私边界

内部 plan 为了摘要与严格对账包含完整邮件正文、昵称、附件和货币，因此禁止直接输出到 stdout、日志或审计 JSON。模块提供显式 `publicMailStorageBootstrapPlanReport`，只公开计数、摘要和经过已知 code 集合与 planner path 结构双重白名单过滤的错误事实，不公开 mailId、账号、正文、标题或资产。数据库备份继续由用户现有外部运维负责；本项目 bootstrap 工具不创建、不检查、不输出或接管备份。

## 验证证据

- 聚焦 planner/reconciler `21/21`：覆盖空箱、schema1/2、201 封、摘要稳定、七字段漂移、future/未知资产、生命周期冲突、摘要重算攻击、MySQL collation 非法 ID、脱敏报告、uninitialized/building/ready、duplicate/extra/conflict、陈旧 cursor 与 feature flag 围栏。
- 相邻 attachment/lifecycle/authority 回归 `20/20`。
- 上一阶段五表结构与 generation 启动围栏回归 `11/11`。
- JavaScript syntax 与 `git diff --check` 通过。
- 测试只使用纯对象、Buffer 和现有认证函数；没有连接共享 MySQL、没有执行 DDL/DML、没有修改真实账号或玩家数据。

## 后续部署顺序

`3b-2` 余下工作继续拆为：

1. 默认 dry-run、真实目录附件认证、两个独立只读一致性快照的漂移探针与显式脱敏报告；
2. generation 1 的全部在线/停服 forward writers：新信同事务登记 identity/counter，已读/领取同步 document digest/settledAt，普通路径禁止裸删；
3. 停服 apply：在持锁事务内重新读取、重新规划和完整对账，处理 COMMIT 模糊恢复并最后单调切换 `ready/data1`；2b 的只读双快照结果只作诊断，不能充当写授权。

部署时必须先让所有旧 Node 退出，再执行停服 bootstrap，随后只启动能同时维护 gen1 的新二进制；不能把 ready 后旧新节点滚动混跑描述成安全方案。
