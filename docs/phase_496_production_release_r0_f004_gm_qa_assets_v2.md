# Phase 496：生产发布 R0.F004 GM QA 资产清单 v2

日期：2026-08-20
任务：`R0.F004 AUTO｜发布与当前 81 项目录一致的新 GM QA 资产清单`

## 结论

R0.F004 已完成。高价值 GM 测试资产清单从冻结的 `qa_assets_v1` 显式升级为 `qa_assets_v2`，并与当前 `bag_items.json` 的 81 个正式物品 ID 完全一致：

```text
50 种普通物品，目标总数量 88
31 种装备物品，每种生成 1 件正式装备样本
合计 81 种物品，首次准备最坏占用 81 个银行格
```

新增的 5 种普通物品是：

- `pet_evolution_resonance_core`
- `pet_evolution_wuli_crystal_scale`
- `pet_evolution_driftfox_moon_plume`
- `bui_novice_sprout_taming_certificate`
- `bui_novice_sprout_riding_certificate`

目标服务端测试从 `2 pass / 11 fail` 恢复为 `14/14 pass`，相邻资产、档案、银行、装备转移、公开投影与本地 QA 账号测试为 `80/80 pass`。Godot 解析与 QA 面板目标检查为 `2/2 pass`，1280×720 真实渲染证据确认新数量、中文说明和状态文本完整可见。

最终完整服务端套件为：

```text
tests       1976
pass        1914
fail        61
cancelled   0
skipped     1
todo        0
duration    82151.680667 ms
```

相对 Phase 495 的 R0.F003 基线，顶层失败名称集合精确移除本任务的 11 项，新增集为空。服务端发布门禁仍为 `BLOCKED`，下一游标是 R0.F005。

## 根因与版本策略

`qa_assets_v1` 是故意冻结的特权资产清单：45 种普通物品加 31 件装备样本，共 76 种。物品目录后来加入三种进化材料和两种芽耳布伊证书，但旧实现没有发布新 manifest；目录完整性检查因此正确 fail closed，整条 GM 资产准备路径不可用。

本阶段没有静默扩大 v1，也没有只把测试断言从 76 改成 81。现行合同是：

- 客户端和服务端只接受精确 payload `{manifestId: "qa_assets_v2"}`；空 payload、旧 v1、未来 v3 和附加字段均拒绝；
- v1 仍作为历史永久账本和来源标记版本被严格识别，但不再作为新命令请求版本；
- v2 的普通物品列表是冻结的 v1 列表加冻结的 5 项增量，装备计划仍是原 31 个正式装备样本；
- 当前目录再次增加、删除或漂移时，v2 仍会 fail closed，必须发布下一个显式版本。

这是 GM 专用命令与回执更新，没有改变普通玩家 HTTP/WS 合同，因此没有提升客户端协议版本。

## 新档与 v1 升级合同

### 首次准备 v2

- 开放 6 页、90 格银行，写入 50 种普通物品和 31 件正式装备样本；
- 每件装备仍使用确定性 envelope ID、私有 `qaAssetSample` 来源标记和永久账本；
- 最坏占用 81 格并至少保留 1 格，仍使用 1 个背包格完成装备 staging；
- 31 件装备生成后 `nextEquipmentInstanceSerial` 精确推进 31；任何容量、序号、目录、来源或持久化错误均整单回滚。

### 已有合法 v1 档升级到 v2

- 只补入新增的 5 种普通物品，不再生成或补发 31 件装备；
- v1 永久账本逐字段保留，v2 账本继承同一组 v1 装备样本 ID；
- 已经移出、交易、邮寄或消耗的 v1 普通物品和装备继续保持缺失，不会借升级重发；
- 原装备来源标记继续保持 `qa_assets_v1`，装备实例序号不推进；
- 第二次提交 v2 是 revision 不变的 no-op；
- v1 账本损坏、跨版本重复标记、缺少账本的样本或来源冲突均在写入前 fail closed，档案与 revision 原样不变。

现有幂等键、稳定回执重放、失败 COMMIT 后重试、战斗/离线挂起锁定、市场与邮件转移、跨账号来源保护以及公开投影递归脱敏合同均继续通过。普通玩家响应不包含账本、样本标记、QA 来源或私有 envelope 状态。

## 本地 QA 就绪度与客户端表现

本地 QA 账号工具不再硬编码 76：

- 全新档按 v2 计算最坏 81 个银行格，空档准备后仍有 9 格；
- 已有合法 v1 账本只为 5 项增量预留银行格，不要求再次提供装备 staging 背包格；
- 状态同时区分 `assetsPrepared`（v2）与 `legacyAssetsPrepared`（v1）。

Godot 客户端请求、摘要校验、QA 目录和玩家可见文案均同步到 `qa_assets_v2`、81 种、50 种普通物品、31 件装备和普通物品总数量 88。升级回执允许诚实显示历史缺失项，并明确说明旧版已经移出或消耗的样本不会补发；原始 manifest ID、来源标记、审计信息和测试私密字段不会显示在玩家界面。

1280×720 可见证据位于本机忽略目录：

```text
.run/evidence/r0_f004_qa_panel.png
```

画面中的资产详情显示“当前81种正式物品：50种普通物品与31件正式装备样本”，布局无截断，也没有出现私有 ID 或 agent/QA 调试说明。

## 验证

执行的核心命令：

```sh
node --check server/node/src/auth/gm-qa-assets.js
node --check server/node/src/auth/local-qa-gm-account-ops.js
node --check server/node/test/auth-gm-qa-assets.test.js
node --check server/node/test/local-qa-gm-account.test.js
git diff --check
godot --headless --path client/godot --quit
node --test server/node/test/auth-gm-qa-assets.test.js
node --test \
  server/node/test/auth-gm-qa-assets.test.js \
  server/node/test/auth-gm-qa-profile.test.js \
  server/node/test/auth-gm-qa-pets.test.js \
  server/node/test/bank-profile-state.test.js \
  server/node/test/equipment-profile-state.test.js \
  server/node/test/equipment-transfer-envelope.test.js \
  server/node/test/auth-profile-visibility.test.js \
  server/node/test/local-qa-gm-account.test.js
node tools/run_godot_auto_checks.mjs \
  --only=--auto-qa-panel-check --fail-fast --timeout-ms 180000
npm --prefix server/node test
```

结果：

- Node 语法、Godot 解析与 `git diff --check` 通过；
- 服务端目标测试 `14/14 pass`；
- 相邻服务端测试 `80/80 pass`；
- Godot parse 加 QA 面板检查 `2/2 pass`；
- 完整服务端 `1976 tests / 1914 pass / 61 fail / 1 skip`；与 R0.F003 顶层失败集合相比精确移除 11 项、无新增；
- 唯一 skip 仍是需要 `BEASTBOUND_TEST_VALKEY_PORT` 的真实 Valkey 流测试，本阶段没有隔离端口，保持有理由 skip；
- 没有连接 MySQL、共享后端或真实玩家资料，也没有改写任何用户档案。

本机原始输出保存在忽略目录：

```text
.run/server_test_classification/r0_f004_before_target.tap
.run/server_test_classification/r0_f004_target_final.tap
.run/server_test_classification/r0_f004_adjacent.tap
.run/server_test_classification/r0_f004_godot_qa_panel_final.tap
.run/server_test_classification/r0_f004_godot_auth_final.tap
.run/server_test_classification/r0_f004_full_server.tap
.run/server_test_classification/r0_f004_full_server_final.tap
```

## 已识别但未混入本任务的风险

完整 `--auto-auth-check` 仍因两项既有数量断言退出 1：测试代码期待 10 个 GM 服务命令而当前策略为 12 个，并期待“可用功能 29 项”而当前策略/界面为 31 项。R0.F004 的四项资产子合同 `gm_assets_contract`、`gm_assets_pending_all`、`gm_assets_account_clear`、`gm_assets_status_first` 全部为 true；这两项旧预期留给既定 R0.06 客户端检查恢复，不在本阶段扩大修改。

第一次完整服务端复跑还出现过一项与本改动无关的间歇性失败：`pet-exp-service-integration` 的单宠成长战斗没有注入确定性 `battleRandomAuthority`，敌方随机连续攻击时会在约第 11 回合先击倒宠物，使玩家 defend 提交提前结算回合。整文件连续 6 次复跑出现 2 次失败，失败现场确认宠物 `hp=0`；最终完整套件未出现该项，且 R0.F004 的 11 项差集仍精确闭合。该问题已新增为 R0.F013，后续必须修复测试夹具，不能靠反复重跑掩盖。

## 非目标与剩余风险

- 本阶段不处理 R0.F005–R0.F013 的其他服务端失败，也没有修改普通玩家经济、战斗、地图、宠物成长或生产数据库合同；
- 当前稳定完整服务端快照仍有 61 个已分类失败：13 个真实回归、47 个测试夹具漂移、1 个已废弃预期；另有 R0.F013 记录的 1 个间歇性夹具失败；
- 本阶段没有运行完整本地 CI、性能探针或共享环境 live 检查；R0.05、R0.06 和 R0.07 仍分别负责服务端零失败、客户端全检查和真实客户端性能门禁；
- 截图、测试报告、Godot 日志与其他 `.run` 生成状态不进入提交。

下一任务：`R0.F005 AUTO｜让批量档案迁移工具理解 accountCharacterSlots`。
