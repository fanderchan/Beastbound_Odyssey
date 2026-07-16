# Phase 279：邮箱生命周期持久化地基与 generation 启动围栏

## 目标与范围

本阶段完成 `P0.6d-2c-12b-3b-1`。在不改变现有发信、已读、领取和分页行为的前提下，为后续永久邮件身份、活动容量、只读归档与系统奖励兜底仓建立 store-private MySQL 物理合同。

本阶段不扫描或回填旧邮件，不移动归档，不生成或领取奖励仓资产，也不启用 200 封活动上限。四张业务辅助表初始为空，控制行固定为 schema generation 1、data generation 0、`uninitialized`，三个业务能力开关全部关闭。

## 五张辅助表

- `mail_storage_control`：单例 `mail_lifecycle` generation marker。除结构/数据代次与生命周期状态外，预留停服 bootstrap cursor、来源/身份/收件人/活动总数、source digest、对账时间，以及 archive、vault claim、active limit 三个独立开关。
- `mail_active_counters`：每收件人活动邮件物理计数、data generation 与 revision。没有 `<=200` CHECK；旧账号即使超过 200 也必须先完整保留和对账。
- `mail_identity_registry`：永久 `mail_id`，记录不可变 sender/recipient/created identity、当前 `active|archive` 位置、结算/归档时间、身份与文档 digest、可选 reward link、generation 与 revision。未来只允许严格注册和 `active→archive`，不能因邮件迁出活动表而复用 ID。
- `mail_archive_messages`：保留原邮件 SQL 镜像、完整 `document_json`、结算/归档时间和 archive generation；未来只允许严格 INSERT，不作为普通 authority root 的可变集合。
- `reward_vault_entries`：ASCII binary `reward_id`、收件人范围内唯一的 `(source_kind, source_key)`、source digest、状态、`deliveredAt/claimedAt`、交付邮件链接、data generation、revision 与完整资产文档。交付邮件链接也有唯一键；这些字段为后续 `available→mail_delivered→claimed` 条件更新和 COMMIT 模糊恢复提供稳定物理合同，装备奖励仍须等待 ownership registry 后才可启用。

系统 sender 不一定存在于玩家账号表，删号策略也不能级联销毁永久资产证据，因此这些表不建立账号外键或级联删除。

## 结构与身份合同

建表使用独立、可重入的 `CREATE TABLE IF NOT EXISTS`，不对既有表执行 `ALTER`，也不回填任何业务行。随后正常 pooled writer 会从 `information_schema.tables/columns/statistics` 精确认证五表的 engine、列顺序、类型、NULL/default、charset/collation、主键、唯一键和分页索引。

永久身份表、归档表和 vault 的 delivered-mail link 使用与现有 `mail_messages.mail_id` 相同的 `VARCHAR(96)/utf8mb4_0900_ai_ci` 比较域；启动审计同时认证活动表原列，避免同一文本 ID 在不同表中产生大小写/排序语义分裂。reward/source/digest/control key 使用 ASCII binary。

这些对象不会加入 `loadPersistentDataSql()`、authority-root normalization、全量 diff 或普通 save。当前玩家邮件仍只从 `mail_messages` 读取和写入；空 archive/vault/registry/counter 不增加请求热路径扫描，也不会被一次普通保存误删。

## generation 启动围栏

正式 online MySQL writer 与显式 `singleWriterMaintenance` 停服写工具在 `store.load()` 内完成：

1. 在同一个 mysql CLI session 只设置 `SET SESSION lock_wait_timeout`；
2. 创建缺失辅助表并 `INSERT IGNORE` 初始控制行；
3. 精确审计结构与活动 `mail_id` 比较域；
4. 读取并认证唯一控制行；
5. 通过后才继续加载 authority root。

`createPreloadedAuthService()` 在 HTTP listener 打开前同步调用 `store.load()`，因此坏结构、缺失/重复控制行、future/incompatible generation、`building`、`repair_required`，以及当前二进制不支持却已启用的 feature flag 都会失败关闭。`uninitialized` 仅允许 data generation 0、空 cursor/digest/时间、全部计数为 0 和全部开关关闭。

本阶段二进制的最大可维护 data generation 明确固定为 0；它尚未在普通发信/领取事务中维护 identity/counter，所以即使 marker 是结构合法的 `ready/gen1` 也必须拒绝启动。下一阶段只有在所有 forward writer 同时接通后，才可由源码显式声明支持 generation 1。纯状态机还预先认证 ready marker 的静态对账关系：source、identity、active 三个 bootstrap 计数必须相等，recipient 为 0 当且仅当 active 为 0，并且不能大于 active。容量开关具有不可绕过的 `activeLimit ⇒ vaultClaim` 依赖，不能仅靠 supported-features 参数绕过“奖励仓先可领取”的产品边界。

DDL 只使用 Beastbound session 级 metadata lock wait（默认 5 秒），另有 30 秒进程 hard deadline、最大 120 秒；绝不执行 `SET GLOBAL/PERSIST/PERSIST_ONLY`、修改共享 MySQL 配置或重启数据库。不能执行非空 durable save 的 CLI-only 诊断/旧测试路径只安装空表；所有 pooled writer 与 `singleWriterMaintenance` 维护写路径强制同一结构/generation 审计，即使显式 `ensureSchema:false` 也只能跳过安装 DDL、不能跳过围栏。下一阶段 dry-run/bootstrap 还可在只读且未取得写能力时显式要求审计。

## 验证证据

- 先在现有存储测试中复现正式 schema 完全没有 `mail_storage_control`，红测按预期失败；实现后同一测试转绿。
- focused schema/启动测试 `11/11`：新建与二次启动、精确 contract、活动 mail identity reference、当前二进制 generation 0 上限、feature 依赖、ready 对账计数、metadata-lock 分类和进程 timeout 全部通过。
- `auth-storage.test.js` 非监听部分 `38/38`，受沙箱限制的单个 localhost HTTP 提交用例在允许回环后 `1/1`，合计 `39/39`。
- 邮箱分页索引 `6/6`、双 store/revision 启动 `10/10`、MySQL session/transaction deadline `7/7` 通过。
- `ensureSchema:false` 的既有结构 writer 也经过新围栏后，profile 条件写 `40/40`、共享资产双事务 `32/32`、大集合 journal `4/4` 通过；旧 fake CLI 由测试专用 wrapper 提供规范 gen0 结构响应，不在产品代码中增加绕过开关。
- JavaScript 语法与 `git diff --check` 通过；辅助表保持在全量 loader/save 之外的断言通过。

测试仅使用纯函数、fake mysql CLI、recording pool、临时文件和一次 localhost 回环；没有读取本地数据库凭据、连接共享 MySQL、执行真实 DDL、修改真实玩家数据或改变数据库全局参数。本阶段没有客户端/UI/热路径改动，因此不重复 Godot 与帧性能门槛。

## 部署与后续风险

- generation marker 无法阻止旧二进制继续写，因为旧程序根本不知道新表。未来从 `uninitialized` 切到 `ready` 前必须排空全部旧 Node、停服 bootstrap，并整批升级；不能把它描述成可安全滚动混跑。
- fake CLI 能证明 SQL、状态机和失败分类，不能冒充真实 MySQL 的双首次启动、metadata lock 或 `information_schema` 结果。发行隔离门槛仍需一次性 datadir 演练，不能连接共享玩家库。
- data generation 0 时永久 ID、活动 counter、archive 和 vault 都尚未参与业务事务；因此本阶段绝不启用容量或归档。该版本遇到任何 post-bootstrap data generation 都拒绝启动，而不是以旧写入路径继续运行。

下一项 `P0.6d-2c-12b-3b-2` 将实现默认 dry-run 的停服 bootstrap：备份与 source/plan digest、写前重读、保守回填全部物理活动邮件身份和真实收件计数（允许超过 200）、精确对账、可恢复 forward-fix，以及最后单调切换 `ready`。它不会猜历史 system source、把现有装备邮件复制进 vault、补猜 `settledAt` 或移动任何归档。
