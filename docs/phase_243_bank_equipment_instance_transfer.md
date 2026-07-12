# Phase243：银行装备实例存取与具体实例选择

## 问题复现

Phase240 为避免复制和状态丢失，暂时禁止装备进入银行；Phase242 虽建立了严格实例信封和客户端无损边界，但银行仍是 schema1 的模板数量表示。此前如果直接解除限制，会产生三类发行级问题：

- 同名但耐久、强化、磨损或未来词缀不同的装备，在客户端只显示为一叠模板，玩家不能决定存哪一件；
- 银行只保存 `itemId/count`，取回时无法恢复原实例状态；
- 客户端若回传完整信封，就可能伪造强化、耐久或来源，破坏服务端权威。

另在本阶段审查中固定复现：直接提交 9 条银行物品时，旧解析器会静默只执行前 8 条却返回成功。该行为会使玩家误判整单完成，现已改为超过上限整单明确拒绝。

## 原创 Beastbound 规则

### 1. 银行 schema2 保存完整私有实例信封

- 银行根结构固定为 `schemaVersion=2`，保留 `stoneCoins/items/slots/unlockedTabs`；装备格为 `{itemId,count,equipmentEnvelopes[]}`，且数量必须与信封数严格一致。
- `items` 只是 `slots` 的汇总镜像；重复或乱序汇总可在一次成功写入中规范化，但不能改变任何信封状态。
- 装备信封完整保存耐久、强化历史、磨损余数、经验丹充能、来源和当前未知的 JSON-safe 未来字段。
- 同一银行内重复 `envelopeId`、物品身份错配、坏指纹、非法或 future schema、锁定页占用、容量溢出全部失败关闭，原档案不变。
- 旧 schema1 仅在全部为可证明的普通物品时升级；历史模板-only 装备无法证明具体实例，继续返回 `bank_equipment_transfer_unsupported`，不猜测、不删除。

### 2. 存入和取回都只接受选择意图

- 存入装备时，客户端只能提交 `itemId/count=1/instanceId/sourceSlotIndex/bankSlotIndex?`。服务端复核实例确实位于该档背包、模板格和物品身份一致，再导出私有信封并从候选档删除源实例。
- 取回装备时，客户端只能提交 `itemId/count=1/envelopeId/bankSlotIndex/targetSlotIndex?`。服务端从银行读取唯一可信信封，导入时分配本档新的唯一实例 ID，再从候选银行删除信封。
- 完整 `envelope`、`instanceState`、`provenance` 或未知装备意图字段由服务端拒绝；Godot 请求构造器也会先做一次正向白名单剥离。
- 普通物品、装备和石币可在同一请求中处理，但只在全部步骤成功后持久化一次。第 1 条已进入候选状态、第 2 条运行期失败时，返回档案、revision、背包、银行和石币均保持原值。
- 一次最多 8 条物品；第 9 条不再被静默忽略，而是以 `bank_transfer_line_limit` 整单拒绝。

### 3. 玩家明确选择同名不同状态装备

- 银行面板把背包装备展开成独立 `instanceId` 行，把银行装备展开成独立 `envelopeId` 行；每行数量固定为 1。
- 行内显示玩家能理解的强化、耐久、磨损、充能和公开词缀摘要，不显示 schema、指纹、来源证明或 QA 字段。
- 普通物品仍按格子和数量操作；装备不出现数量拆分框语义。
- 按钮、双击和拖放最终都经过同一个纯 `BankProfileModel.transfer_item`，无效、重复、损坏或锁定行没有选择键且不可操作。
- 合法服务端 profile v3/bank v2 在 Godot 中只深拷贝，不经过旧 schema1 normalizer，因此信封和未知未来字段不会因打开银行而丢失。

## 兼容与非目标

- 新账号直接创建 bank schema2；旧的干净普通物品银行会在第一次成功写入时升级。
- 解锁银行页、只存取石币、普通物品存取均复用同一严格读取器，合法私有信封逐字保留。
- 公开 `profile.bank` 和响应顶层 `bank` 都经过同一正向投影，删除 `provenance`、实例 `source` 和 `transferProvenance`。
- 本阶段不解除交易所、邮件附件或 legacy 面对面交易的装备限制；它们分别留在 P0.5b-3c 与 P0.5b-3d。
- 未读取、迁移或改写真实 MySQL 玩家数据，测试只使用内存 store 和本地 Godot fixture。

## 涉及文件

- 服务端纯状态与事务：`server/node/src/auth/bank-profile-state.js`、`server/node/src/auth/economy.js`、`server/node/src/auth-service.js`
- 档案迁移与审计：`server/node/src/auth/equipment-profile-migration.js`、`server/node/src/auth/profile-migrations.js`
- 客户端模型与 UI：`client/godot/scripts/progression/bank_profile_model.gd`、`player_progress_model.gd`、`server_auth_client_model.gd`、`panel_flow_coordinator.gd`
- 自动验证：`auto_check_coordinator.gd` 及对应 Node tests

## 验证与证据

```text
node --check server/node/src/auth/bank-profile-state.js
node --check server/node/src/auth/economy.js
node --check server/node/src/auth/equipment-profile-migration.js
node --check server/node/src/auth-service.js
node --test server/node/test/bank-profile-state.test.js server/node/test/auth-economy.test.js server/node/test/equipment-profile-migration.test.js server/node/test/profile-migrations.test.js server/node/test/auth-profile-visibility.test.js server/node/test/auth-profile-actions.test.js
godot --headless --path client/godot --quit
node tools/run_godot_auto_checks.mjs --only --auto-equipment-instance-check --fail-fast
node tools/run_godot_auto_checks.mjs --only --auto-server-profile-contract-check,--auto-server-profile-sync-check --fail-fast
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3
git diff --check
```

- 服务端聚焦覆盖 schema1→2、安全信封存取、混合事务回滚、8 行上限、石币-only 信封保持、公开投影、银行开页、迁移和资产摘要；`90/90` 全部通过。
- Godot 4.7 解析、装备实例银行检查 `2/2`、profile boundary/sync `3/3` 和真实 `Main.tscn` 入口通过。
- 可见渲染截图：`.run/evidence/phase243/bank_equipment_instances.png`，1280×720；画面同时显示两件同名不同强化/耐久木棒和银行内信封实例，均有独立选择行。
- 对比 Phase242 的 detached HEAD：idle `process_total` 由约 `0.10–0.40ms` 到 `0.10–0.44ms`；真实跨帧移动由 `0.17–0.29ms` 到 `0.16–0.29ms`，移动检查均 `status=ok`。本阶段没有把银行扫描或实例 presenter 放入 `_process/_draw` 热路径。
- 未运行无关完整 343 项服务端套件或 `tools/run_local_ci.mjs`。

## 玩家验收建议

若后续需要人工复核，只需在 GM 测试号准备两件同名、强化/耐久不同的装备：打开银行后应看到两条独立行；依次存入、取回并重新打开装备详情，确认状态保持且取回实例 ID 为本档新 ID。普通肉和石币应仍可按原方式存取。自动检查和截图已经覆盖本阶段发布门槛，因此本项不要求当前立即人工试玩。
