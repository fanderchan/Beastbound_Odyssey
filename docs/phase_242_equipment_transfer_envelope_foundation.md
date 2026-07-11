# Phase242：装备实例信封与客户端 v3 无损边界

## 问题复现

P0.5b-2 已把服务端玩家根档案提升到 `schemaVersion=3`，但 Godot 的 `PlayerProgressModel.normalize_profile` 仍是为 schema1 本地旧档设计的修复器。它会强制重写根版本、重建装备实例并把银行重新整理为模板表示。服务器档案每次拉取、打开背包/装备/银行/交易所/邮件等面板时又会反复经过这个入口。

因此，在银行、交易所或邮件真正返回装备信封后，客户端可能在展示前就删除信封、覆盖实例位置或吞掉未来词缀。这个风险必须先于任何跨容器功能解除，否则服务端虽保住资产，客户端仍会显示或回传错误事实。

服务端还缺少共享的跨容器表示。现有实例 ID（例如 `equip_000001`）只在单个玩家档案内唯一，不能直接作为跨账号交易后的目标实例 ID；市场买家和卖家很容易拥有同名 ID。

## 原创 Beastbound 规则

### 1. 服务端 v3 档案是只读运行态快照

- 服务器响应先经过宠物私有成长字段公开投影，再严格要求根档案版本恰好为 `3`。
- 缺失、旧版、非法或未来根版本都失败关闭：客户端不替服务器猜迁移，也不把不兼容档案赋给运行态。
- 合法 v3 档案进入 `PlayerProgressModel` 后只做深拷贝，不再执行 schema1 的有损修复。连续打开或刷新面板不能改变根版本、装备实例、槽位映射、银行信封或未知字段。
- schema1 本地旧档继续走原有 normalizer，现有离线 QA/旧存档修复行为不变。
- 本地公开缓存发布复用同一 exact-v3 边界；legacy 缓存只允许清除已知宠物秘密并强制重新拉取，非法或 future 缓存保持原字节且拒绝写回。缓存不能被当作当前权威档案，也绝不重新引入宠物私有成长种子。

### 2. 实例信封不复用跨账号实例 ID

- 信封自身有独立 `envelopeId`、严格 schema、SHA-256 状态指纹和私有来源记录；源 `instanceId` 只作为审计线索，不是接收档案中的目标身份。
- 导出只接受已经通过 canonical 装备审计、位于背包且与 `itemId` 精确一致的具体实例。
- 信封携带耐久、强化历史、磨损余数、经验丹充能、来源以及当前版本尚不理解但能原样保存的未来字段；不携带背包/穿戴位置作为目标事实。
- 导入时从接收档案的 `nextEquipmentInstanceSerial` 分配全新且不冲突的本地实例 ID，并恢复为背包实例。
- 状态指纹使用稳定键序，覆盖会影响资产身份的完整状态；同一状态与对象插入顺序无关，任何未来字段变化都会改变指纹。
- 未知状态必须是可持久化的 JSON-safe 数据；`undefined`、函数、BigInt、循环引用、非普通对象和危险对象键不能进入指纹或信封。
- 导入 helper 会在对应导入实例仍存在时拒绝同一 `envelopeId` 的即时重放，同一容器内的信封 ID 也必须唯一。永久消费语义不能依赖会无限膨胀的玩家流水表；跨账号及再次转运后的 exactly-once 必须由后续银行/市场/邮件在一次权威存储事务中“读取唯一信封→导入→删除该信封”保证，不能接受客户端回传的完整信封。
- SHA-256 只用于服务端权威数据的状态完整性与陈旧选择复核，不是客户端来源认证。客户端只提交 `instanceId` 或 `envelopeId`。
- 非规范或未来信封、装备目录错配、重复兑换、指纹篡改、实例 serial/容量冲突全部失败关闭，输入档案和信封不变。

### 3. 具体实例展示是纯投影

- 客户端 presenter 从背包/已装备实例和银行 slot 信封生成稳定行，携带 `instanceId` 或 `envelopeId` 作为后续请求选择键。
- Node 和 Godot 共用 public envelope v1 向量：公开 DTO 保留嵌套 `instanceState`，但删除私有 provenance、装备来源和内部转运记录。
- 玩家摘要优先展示强化、耐久、磨损、充能、词缀和特性数量，不显示内部 schema、指纹、审计字段或 QA 文案。
- 坏 slot、坏 envelope 容器、缺字段、坏指纹格式和重复 ID 必须生成不可操作的异常行，不能把资产从列表中静默隐藏。
- presenter 不规范化或改写档案；相同输入重复生成完全一致的行。
- 公开投影只接受 exact v1 的内部信封或 exact v1 的公开 DTO；future、缺指纹、未知根字段和坏状态只能投影为不可操作异常对象，不能被“补字段”洗成合法 v1，也不能泄露私有 provenance。
- 内部信封公开投影必须复用权威装备目录、磨损阈值、Lv140 上限和经验曲线的 canonical 校验；指纹正确但状态规则非法时仍返回异常对象。客户端 presenter 使用同一目录与数值边界，不能把服务端会拒绝的磨损余数、强化历史或经验丹充能显示为可操作实例。

## 产品边界

现有已验收方向仍是“普通玩家统一走交易所，面对面交易仅保留协议兼容”。本阶段不会恢复面对面交易按钮或玩家面板。后续 P0.5b-3d 只补隐藏 legacy 协议的实例预约、接受时复核和原子交换。

本切片只建立无损边界、信封纯规则和展示模型，不解除银行、市场、邮件或交易的临时装备拒绝。解除顺序为：银行端到端 → 交易所/邮件持久托管 → legacy 交易协议兼容。

## 风险控制

- 不读取、迁移或改写真实 MySQL 玩家档案。
- 不修改非装备、石币、宠物、任务或战斗数值。
- 不把 schema1 本地旧档冒充服务端 v3，也不允许 future schema 静默降版。
- 不运行无关完整服务端 343 项或本地全 CI；本阶段没有画面布局、移动和性能热路径改动。

## 验证

```text
node --check server/node/src/auth/equipment-transfer-envelope.js
node --check server/node/src/auth/profile-visibility.js
node --check server/node/src/auth-service.js
node --check server/node/test/equipment-transfer-envelope.test.js
node --check server/node/test/auth-profile-visibility.test.js
node --test server/node/test/equipment-transfer-envelope.test.js server/node/test/auth-profile-visibility.test.js server/node/test/equipment-profile-state.test.js server/node/test/server-profile-public-v2-vector.test.js server/node/test/pet-growth-runtime.test.js
node --test server/node/test/auth-economy.test.js
node --test server/node/test/auth-profile-actions.test.js
godot --version
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2
node tools/run_godot_auto_checks.mjs --only=--auto-server-pet-growth-boundary-check,--auto-server-profile-sync-check,--auto-shop-check,--auto-equipment-instance-check --fail-fast
git diff --check
```

Node 信封、公开可见性、既有实例状态、宠物公开向量与成长运行态核心聚焦回归 `47/47` 通过，服务层经济/档案动作回归另有 `57/57` 通过。Godot 4.7 解析、真实 `Main.tscn` 入口和四个唯一聚焦检查通过；自动检查连同一次解析为 `5/5`。没有运行无关完整服务端 343 项或本地全 CI。
