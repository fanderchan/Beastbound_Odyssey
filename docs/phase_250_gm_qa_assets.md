# Phase250：装备、全物品与银行 GM 测试档案

## 阶段目标

本阶段完成 `P0.5d-3`：让当前已授权 GM 通过一个固定 manifest，一次准备当前正式目录中的全部 76 种物品，并用正式装备实例、私有 equipment envelope 与银行 schema2 承载 31 件装备样本。该档案用于集中验收背包、穿戴、强化、耐久、商店、市场、邮件和银行，不允许客户端填写数量、装备状态、目标账号或私有实例字段，也不能覆盖、重排或删除现有资产。

本阶段不改变任何普通玩家的掉落、商店、任务、转生、宠物蛋、装备门槛或经济规则；也不把 QA 资产伪装成普通进度所得。

## 修复前事实

当前服务层没有批量准备装备与全物品的方法。正式数据目录共有：

- 76 种可进入物品系统的 item ID；
- 其中 45 种普通物品、31 种装备；
- 银行为 6 页 × 15 格，共 90 格，默认只开放 1 页；
- 空档按本 manifest 准备后占用 76 格，保留 14 格；
- 普通物品目标总量为 83：默认每种 1 个，木质、皮革强化碎片各 20 个；
- 31 件装备必须逐件经过正式 fresh-instance factory、私有 envelope 和银行导入链，不能手写实例 JSON。

现有单件 GM 发放、商店购买和普通银行存取都不能提供永久幂等的完整测试档。重复点击或响应丢失后再次操作可能复制高价值物品；同时，现有公开 profile/envelope 投影会保留未知实例字段，因此在加入 QA provenance 前必须先封住隐私泄漏。

## 固定命令与 manifest

新增命令：

```text
POST /gm/commands/gm_prepare_qa_assets
Idempotency-Key: <stable operation key>
{"manifestId":"qa_assets_v1"}
```

请求体必须只有 `manifestId`。禁止提交账号、数量、物品 ID、装备状态、银行页数、实例 ID、envelope ID、耐久、强化或来源。命令只能作用于 bearer session 对应的当前 GM，且必须同时通过 GM 身份和 `gm_prepare_qa_assets` 显式 command grant。

manifest 使用显式冻结清单，并在运行时与当前 76 种正式目录精确核对。未来目录增加或分类变化时，旧 manifest 失败关闭，必须发布新版本；不能因新增一个商业宠蛋或高阶装备而静默扩大旧命令的发货范围。

## 高价值发货权与进度边界

“全物品”有意包含转生戒指、任务凭证、宠物蛋、高转装备和商业价值较高的装备。它们进入银行后可能满足已有持有判定，也可以沿正式市场、邮件或银行路径转运。因此：

- `gm_prepare_qa_assets` 是受审计的高价值发货权，不是普通客服权限；
- 获得完整测试档的 GM 不再适合作为普通玩家进度、掉落稀缺性或新手经济基准；
- 本阶段不额外绑定或阉割样本，因为市场与邮件转运正是验收范围；所有转运仍必须经过现有权威校验、审计、托管 envelope 和 durable COMMIT；
- 在 P0.5d-4 完成初始化、短期授权和本地 QA 边界前，不应在共享服或正式经济中授予该 command；
- 普通玩家、仅有其他 GM 命令的账号和缺少显式 grant 的 GM 全部拒绝。

这是 QA 权限边界，不改变正常玩家的物品来源和装备规则。

## 普通物品目标

45 种普通物品按“银行自身”的现有数量补至固定下限：

- 除强化碎片外每种至少 1 个；
- `equip_frag_wood_basic` 至少 20 个；
- `equip_frag_hide_basic` 至少 20 个；
- 合计目标量 83 个。

只补银行差额，不降低已有数量；背包中已有同类物品不抵扣银行目标。这样打开银行即可看到完整 45 类目录，而不会因 P0.5d-1 已放在背包里的高频物资出现目录缺口。准备完成后的使用、领取、出售、交易、丢弃或任务消耗不会触发补发；永久 manifest 账本是“曾经准备过”的唯一权威。

## 正式装备样本

31 个固定装备槽各生成一个全新、满耐久、`+0` 的正式实例：

```text
一个空背包格写入装备模板
→ grantFreshBackpackEquipmentInstances
→ 写入私有 qaAssetSample provenance
→ exportBackpackEquipmentEnvelope
→ addEquipmentEnvelopeToBank
```

背包只使用一个原本精确为空的格作为可复用 staging；即使背包已有可堆叠的经验丹装备，也不能临时合并进旧格。每个样本导出后该格恢复为空；整个操作结束时原背包格、捕捉工具、已穿戴装备、现有强化/耐久、银行石币和原银行格顺序保持。`nextEquipmentInstanceSerial` 必须真实前进 31，不能为了表面恢复背包而回滚 provenance 序号。

样本不自动穿戴、强化、磨损、修理，也不修改人物等级或转生。高转装备继续受原有门槛约束。需要第二件同名木棒时，玩家从现有商店正式购买，顺便验证商店实例工厂与同名实例选择。

## 银行容量与原子失败

首次准备自动开放全部 6 页，不扣钻石、不改变银行石币。完成后必须至少保留 1 个银行空格，供存取、市场和邮件往返验收。

执行前必须同时满足：

- 背包至少有 1 个可用 staging 格；
- 当前银行在补齐普通物品和 31 个装备 envelope 后仍至少空 1 格；
- profile v3、bank v2、装备实例、registry、永久消费墓碑和现有 envelope 全部合法。

任一条件失败时整批回滚：不开放部分页、不补一部分物品、不生成部分实例、不增加 revision，也不发布缓存。

## 私有 provenance 与永久幂等

私有根账本：

```text
profile.gmQaAssetManifests.qa_assets_v1
  schemaVersion / manifestId / preparedAt / ordinaryTargets / equipmentSlots

equipmentInstance.qaAssetSample
  schemaVersion / manifestId / slotId / itemId / initialEnvelopeId
```

规则：

- 初始 envelope ID 由账号、manifest 和固定槽位生成不含明文账号的稳定 opaque ID；
- ledger、31 个槽位和资产在同一 profile revision、同一次审计和同一次 durable COMMIT 中产生；
- 同 key 由 durable receipt 重放；新 key、重启或 receipt 过期后由永久 ledger 返回 no-op；
- 样本后来进入背包、市场、邮件、其他账号或永久消费墓碑，仍不补发；
- ledger 缺失但发现本 manifest marker/初始 envelope 归属或墓碑，future/bad ledger、重复槽、错误 item、跨账号复制、registry 冲突全部失败关闭；
- 普通物品没有实例级 provenance，因此重复执行只按 ledger 判定，不根据当前数量再次发货。

`gmQaAssetManifests`、`qaAssetSample`、QA `source`、envelope provenance、fingerprint 和内部 registry 都必须从公开 profile、银行、市场、邮件及 envelope 摘要中剥离；内部 envelope 往返仍完整保留 marker。

## 安全公开摘要

客户端只接受以下计数语义：

- manifest/schema、`changed`、`alreadyPrepared`；
- 目录 76 种、普通 45 种、装备 31 种；
- 普通目标总量 83、装备样本 31；
- 当前银行普通物品存在/缺少种类；
- 当前仍在银行的装备样本/缺少件数；
- 银行开放页、90 格容量、已用/空闲格、首次保留 1 格；
- profile revision 前后值。

首次成功必须 45/45、31/31、至少空 1 格且 revision 只增加 1。曾准备过后允许显示当前缺失，并明确解释“可能已移到背包、交易所或邮件，不会自动补发”；不能把缺失显示为又可领取一次。

## 原子执行顺序

```text
认证 session、当前 GM 与显式 command grant
→ 严格校验 payload、账号绑定、revision 与固定目录
→ 校验 ledger、profile/bank/装备/registry/墓碑
→ ledger 已存在则只计算安全现状摘要
→ 预检 staging 格、最终银行容量和保留格
→ 在 profile clone 中开放 6 页并补普通目标差额
→ 31 次正式 template → instance → envelope → bank
→ 校验背包恢复、序号前进、marker、银行与全档完整性
→ 写一次 ledger、一次 profile revision、一次 GM 审计
→ MySQL COMMIT
→ 发布共享缓存、权威公开 profile 与成功
```

COMMIT 失败或结果不明确时沿用 Phase247 的 durable receipt 恢复规则；COMMIT 确认前不返回成功。

## 客户端合同

GM/QA 面板增加“准备装备与全物品档”与“银行 / 交易所 / 邮箱”快捷入口：

- 固定构造 `{manifestId:"qa_assets_v1"}`；
- 非服务器会话、档案同步或任何相关资产请求 pending 时禁用；
- 只有 `profileApplied=true` 且安全 summary 完整时显示成功；
- 成功后留在 QA 面板，不自动跳转；玩家自行打开银行继续验收；
- 已准备但缺失时显示不会补发，不显示成失败或可再次领取；
- 不保存或展示实例 ID、envelope ID、ledger、marker、source、audit 或 raw server code。

银行、市场和邮件继续复用现有实例 presenter；本阶段不新增装备寄件 UI。邮件装备附件的发送合同由 Node 定向测试覆盖，客户端只验收已有展示与领取。

## 非目标

- 不修改 76 种物品的数值、来源、价格、绑定、掉落或任务条件；
- 不自动制造近损坏或已强化装备；耐久磨损继续走真实战斗结算；
- 不绕过等级、转生、槽位、强化材料和修理规则；
- 不开放普通玩家面对面交易 UI；
- 不新增 MySQL 表或协议版本；ledger 随现有 profile JSON 增量持久化；
- 不操作真实 MySQL、`auth1373` 或其他玩家数据；真实 GM 点击留到人工验收；
- 不把该 GM 档案当作正式服经济或新手进度验收结果。

## 验证矩阵

完成前必须覆盖：

1. 固定 manifest 精确覆盖 45 普通 + 31 装备 = 76 种；目录漂移失败关闭。
2. 空档生成后普通目标总量 83、装备样本 31、银行占 76/90，背包和捕捉工具逐字恢复，装备序号前进 31；背包已有同类物品仍不抵扣银行目录。
3. 现有背包、银行、穿戴、强化、耐久、unknown 字段和银行石币不被覆盖、降低或重排。
4. 最终刚好保留 1 格成功；最终 0 格或满背包 staging 时原子失败。
5. 31 件全部经正式实例 factory、canonical envelope 和银行导入，不手造正式实例。
6. 同 key、新 key、重启、receipt 过期、样本转运/消耗后都不补发。
7. future/bad ledger、重复 marker、item 漂移、错误 registry、账本缺失但发现历史身份全部失败关闭。
8. 普通玩家、缺 command grant、目标账号/数量/item/状态注入、坏 manifest、缺 key全部拒绝。
9. 战斗中和离线挂机中拒绝准备。
10. COMMIT 失败不发布缓存；恢复后只产生一批。
11. 公开银行、市场、邮件、背包和 envelope 递归搜索不到 ledger、marker、QA source 与私有 provenance。
12. 木棒可取出、穿戴、强化和正常磨损；高转装备仍受原门槛。
13. 商店新买同名装备得到新实例；银行、市场、邮件往返保留具体私有状态。
14. Godot 固定 payload、严格 summary、pending/账号切换、不会补发提示和三个快捷入口通过。
15. 1280×720 QA 与银行截图不裁切、不泄露私有字段。

## 实际验证

服务端核心 manifest、正式实例、银行、幂等与隐私组合：

```text
node --test \
  server/node/test/auth-gm-qa-assets.test.js \
  server/node/test/auth-gm-qa-profile.test.js \
  server/node/test/auth-gm-qa-pets.test.js \
  server/node/test/bank-profile-state.test.js \
  server/node/test/equipment-profile-state.test.js \
  server/node/test/equipment-transfer-envelope.test.js \
  server/node/test/auth-profile-visibility.test.js
# 68/68 通过；其中新增 auth-gm-qa-assets 13/13 通过
```

HTTP、durable、存储和 profile action 回归：

```text
node --test \
  server/node/test/auth-gm-qa-assets.test.js \
  server/node/test/auth-http-server.test.js \
  server/node/test/auth-durable-commit.test.js \
  server/node/test/auth-storage.test.js \
  server/node/test/auth-profile-actions.test.js \
  server/node/test/auth-profile-visibility.test.js
# 109/109 通过
```

市场、邮件及跨账号托管回归：

```text
node --test \
  server/node/test/auth-economy.test.js \
  server/node/test/auth-social-world.test.js
# 70/70 通过
```

客户端固定请求、严格摘要、账号切换、六类 pending 与入口授权：

```text
node tools/run_godot_auto_checks.mjs --only=--auto-auth-check --fail-fast
# Godot parse + auth/GM 合同 2/2 通过
# gm_assets_contract/pending_all/account_clear/status_first 均为 true
```

现有装备、银行、市场、邮件、商店与耐久/成长规则：

```text
node tools/run_godot_auto_checks.mjs \
  --only=--auto-equipment-instance-check,--auto-market-panel-check,--auto-mailbox-check,--auto-shop-check,--auto-equipment-check \
  --fail-fast
# 6/6 通过

node tools/run_godot_auto_checks.mjs \
  --only=--auto-equipment-durability-check,--auto-equipment-growth-check \
  --fail-fast
# 3/3 通过
```

语法与补丁检查：

```text
node --check server/node/src/auth/gm-qa-assets.js
node --check server/node/src/auth-service.js
node --check server/node/src/http-server.js
node --check server/node/src/auth/profile-visibility.js
node --check server/node/src/auth/equipment-transfer-envelope.js
node --check server/node/test/auth-gm-qa-assets.test.js
godot --headless --path client/godot --quit
git diff --check
# 通过
```

上述 Node 测试使用内存 store、重启快照和故障注入 async store，没有连接或修改真实 MySQL、`auth1373` 或其他玩家档案。QA 命令专属测试覆盖 COMMIT 前失败、同 key 恢复和永久 ledger 收敛；“MySQL 已 COMMIT 后连接断开”的分支复用 Phase247 已通过的通用 ambiguous-commit/receipt 框架，本阶段没有再对真实 MySQL 注入断线。

1280×720 非 headless 本地证据：

- `.run/evidence/phase250_qa_panel.png`：当前 GM、固定资产入口和高价值边界文案可见，新增 `buttons/qa_profile/bank/market/mailbox/screenshot` 均为 `true`；
- `.run/evidence/phase250_bank_instances.png`：同名木棒、强化、耐久、储能与银行具体实例行可见，`bank_panel/screenshot=true`。

完整历史 `--auto-qa-panel-check` 仍被既有 `stable=false`、`gm_tiger_level=false` 拖红，新增入口、快捷路由与截图本身全部为真，因此没有把历史红灯误记为本阶段失败或全绿。本阶段只在打开/刷新 GM/QA 面板时构造静态状态文本，没有进入 `_process`、`_draw`、世界签名、移动或网络轮询热路径；沿用 Phase248/249 同类静态 QA 面板切片的边界，不重复跑移动性能探针，也未运行 `tools/run_local_ci.mjs` 或整套 343 项测试。

## 人工验收

1. 使用隔离本地 GM，确保背包至少空 1 格；点击一次“准备装备与全物品档”。
2. 打开银行，确认 6 页开放、76 类目录资产可见且至少留 1 格；重点检查木/皮碎片各 20。
3. 取出木棒，穿戴并强化；进入本地战斗确认武器磨损仍由权威结算产生。
4. 从商店买第二根木棒，确认同名装备是两个独立实例；分别存取、上架/撤单并比较状态。
5. 用低价值样本走市场与邮件领取链，确认公开 UI 只显示玩家可理解的装备状态。
6. 再次点击准备；确认 revision 不变、银行不新增。若已移走或使用样本，摘要明确显示缺失且不会补发。

当前无法通过自动测试判断银行 76 类目录是否过密、装备状态文案是否足够易读；以以上 1280×720 实机步骤、查找目标物品所需时间、同名实例误操作率和是否需要查看内部 ID 为人工通过标准。

## 实际涉及文件

- `server/node/src/auth/gm-qa-assets.js`；
- `server/node/src/auth-service.js`、`http-server.js` 的薄 wiring；
- `server/node/src/auth/profile-visibility.js`、`equipment-transfer-envelope.js` 的私有字段投影；
- `server/node/test/auth-gm-qa-assets.test.js`；
- `client/godot/scripts/progression/gm_qa_assets_client_model.gd`；
- `client/godot/scripts/ui/qa_panel_catalog.gd`、`panel_flow_coordinator.gd` 的薄 wiring；
- `client/godot/scripts/main.gd`、`qa/auto_check_coordinator.gd` 的命令白名单与聚焦断言；
- 本文件与 `stoneage_gap_plan.md`。
