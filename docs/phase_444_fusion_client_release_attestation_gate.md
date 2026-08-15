# Phase 444：融合客户端发布证明失败关闭门禁

## 结果

本阶段补齐 P1.4 正式开放前的客户端发布安全边界。服务器此前已经要求完整运行发布证明，但正常
客户端只读取 `pet_fusion_recipes.json` 的 `runtimeEnabled`；如果未来有人只误改这个布尔值，界面
可能先显示可用，再由服务器拒绝。现在正常客户端只消费经过发布证明校验的目录投影：目录、项目
所有者决定、两只融合成品画像、世界／战斗整包或四类技术证据任一缺失或漂移，投影都会强制恢复
为关闭态，并显示既有“不会消耗任何宠物”安全文案。

当前生产目录、画像 owner 状态、宠物整包状态和玩家入口均未改为开放；固定路径运行发布证明与
运行发布 owner decision 仍不存在。Phase 443 的苔垒角兽 V3M 头像仍等待项目所有者明确批准，
本阶段没有替代或推定该审美决定。

## 合同与实现

- `PetFusionReleaseAttestationModel` 对齐服务端 P1.4 发布合同，校验固定证明 ID、两条配方、两只
  不可骑成品、Phase 372 历史视觉范围、运行发布 owner decision、专用画像独立创作与精确蒙版
  边界、真八向四帧步行、双视角 180 帧战斗整包和四类发布证据。
- 客户端可直接读取的 `client/godot/` 冻结引用会逐文件核对 SHA-256；仓库外层 `docs/` 技术证据
  在客户端核对安全相对路径、类型、顺序和 SHA-256 形状，实际文件内容仍由权威服务器完整复验。
- `BalanceCatalogModel.pet_fusion_recipes()` 缓存一次生产投影。关闭目录不触发发布文件读取；请求
  开放时才运行门禁，后续读取直接命中缓存，不把 JSON、全目录扫描或哈希计算放进帧循环。
- 正常 `validation_errors()` 永远要求运行发布证明；隔离合同夹具使用名称明确的
  `fixture_validation_errors()`，避免 QA 为测试结构而临时开启目录时伪造生产批准。
- `PetFusionRecipeCatalogModel.production_document()` 只负责基于完整校验结果投影开／关状态，不能
  创建 owner 决定、发布证明或修改原始生产 JSON。

## 回归覆盖

客户端领域检查新增一套内存正向发布夹具，证明完整签署可保持运行态；随后分别篡改运行目录、
owner decision、画像元数据、宠物整包生命周期和技术证据，五类负向样本均失败关闭。测试还直接
模拟当前仓库“只把目录开关改为 true、但没有发布证明”的事故，确认正常目录投影恢复关闭文案。

既有结构夹具、融合材料选择、报价展示、旧报价失效、双确认、幂等标识保留、1280×720 面板边界
和服务端发布证明测试继续作为定向回归。本阶段不需要新增自动检查入口，复用已有可直接执行的融合
领域、合同和面板检查。

## 验证结果

- `git diff --check` 与 `git diff --cached --check`：通过；
- `godot --headless --path client/godot --quit`：Godot 4.7 解析通过；
- `pet_fusion_client_domain_check.gd`：`PASS`，新增
  `clientReleaseAttestationGate=true`，五类漂移与当前缺证明事故均失败关闭；
- `pet_fusion_contract_check.gd`：`PASS`，结构夹具与生产证明边界分离后全部合同通过；
- `pet_fusion_panel_check.gd`：`PASS`，两路线无画像占位，1280×720 边界、一次报价、两段确认、
  一次提交和旧报价拒绝均通过，生产仍为 `runtimeEnabled=false`；
- `--auto-balance-catalog-check`：连同基础解析 `2/2 PASS`，隔离 QA lane 已清理；日志为
  `.run/godot_auto_checks/2026-08-15T12-48-15-532Z.log`；
- Node 发布证明／配方目录定向测试：`45/45 PASS`；
- `verify_pet_fusion_closed_release.py`：`PASS`，`2 forms / 1350 copied / 22 portrait / 2 QA controls`，
  再次证明 release、runtime、玩家入口和画像门均为 `false`；
- Pet Design Inspector：`36 forms / 2 fusion targets / errors=0 / warnings=0`。

第一次自动检查曾与数个直接 Godot 检查并行，QA helper 因真实 `user://` 指纹变化在执行用例前保护性
中止。只读核查显示最近变化仅为 Godot 日志和 83 字节音频设置，没有账号或角色档案修改；带 owner
canary 的隔离目录和外部锁未删除，而是整体保存在
`.run/recovery/qa-lane-automation-real-baseline-drift-20260815Tq5AvUC/`。确认无残留进程后以当前基线
串行重跑通过，最终无 QA lane、外部锁、Godot 或 runner 进程残留。

## 非目标与发布状态

- 不批准 Phase 443 V3M 画像，不写入项目所有者身份或代替其审美判断。
- 不创建真实运行发布 owner decision／attestation，不把 `runtimeEnabled`、`releaseApproved`、
  `playerEntryOpened` 或画像 release gate 改为 `true`。
- 不修改融合概率、成长、技能遗传、绑定、交易、消耗或服务端三宠原子事务。
- 不把测试夹具、QA 文案、原始 ID 或发布诊断显示给玩家。
- 本阶段是可独立发布的安全基础，不代表 P1.4 父项完成；最终开放仍需项目所有者明确通过 V3M、
  真实 Main 入口与性能证据、权威三宠事务证据以及双端可验证的冻结发布证明。
