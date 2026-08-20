# Phase 512：生产发布 R1.W001 Firebud v2 权威碰撞与哈希闭环

日期：2026-08-21

## 目标与结论

本阶段只关闭 `R1.W001 AUTO｜Firebud v2 权威碰撞、保护格与哈希闭环`，不开始 R1.W002 的真实 Main 录片收口，也不改变 Firebud v2 的视觉像素、地图拓扑、玩家运行时或 OWNER 生命周期。

Phase 511 的严格默认 runtime 报告确实复现了 13 个 footprint 错误、村口 `(6,18)`／`(7,18)` 保护格错误、map data frozen hash 漂移和 repeat prepare I/O 失败。逐文件追踪后确认：这些错误全部来自仍在 primary catalog 的已发布 `firebud_region_visual_v1` binding 被拿去和 staged v2 的权威 map JSON 比较；它们不是当前 `firebud_region_visual_v2` binding 的 13 个缺陷。当前 v2 村口花坛在本阶段开始前已经是：

- `grid=[12,20]`；
- `collisionFootprint=[[11,20],[12,20]]`；
- v2 所有 `collisionRole=blocking` footprint 均属于对应权威地图的 `blockedCells`；
- `(6,18)`、`(7,18)` 没有出现在任何 v2 blocking footprint 中。

因此本阶段没有为了迎合旧报告而修改权威 map JSON 或 v2 binding，也没有重写 v1 的 binding、OWNER acceptance 或 release attestation。后者会让已发布 v1 的历史验收不再指向原冻结候选，属于伪造证据。正确闭环是让 pending v2 预览严格复验自身冻结报告，同时把预期中的 primary v1 fail-closed 结果保留在 v1 自己的 bundle report 内，不再污染 v2 候选的顶层结论。

最终结果：严格 pending preview 顶层与 `firebud_region_visual_v2` 均为 `PASS`、`errors=[]`，两层 `checks.frozenReportValidationSkippedForGeneration=false`；v1 仍在自己的报告中明确 `FAIL` 并标记 staged fail-closed。Firebud v2 继续 pending，不提升、不启用。

## 实现

### 1. 严格区分 runtime 四种运行模式

`client/godot/scripts/qa/map_visual_runtime_check.gd` 现在显式计算四种模式：

| 模式 | 校验冻结报告 | pending preview |
|---|---:|---:|
| 默认 strict | 是 | 否 |
| `--preview-map-visual-catalog-contract` | 是 | 是 |
| primary catalog 生成 | 否 | 否 |
| review catalog 生成 | 否 | 是 |

旧逻辑把 pending preview 当成生成路径，跳过 frozen catalog report 校验。本次修复后，只有真正的生成模式可跳过该校验。`map_visual_review_catalog_check.gd` 新增四模式合同回归，防止以后再把 strict preview 退化成“只重新算一次但不对冻结值”的宽松检查。

### 2. 隔离已发布 primary 与 staged candidate 的失败归属

当同一权威 map JSON 存在 staged review candidate 时，primary bundle 的 frozen contract 漂移写入 `stagedPrimaryErrors` 和 primary bundle 自己的报告；候选顶层只由 staged v2 的严格结果决定。普通 primary strict、没有 staged candidate 的路径及 promotion/pre-export 门禁均保持原来的 fail-closed 行为。

这不是放宽发布门禁：R1.02 promotion 后仍必须让 primary strict runtime/pre-export gate 通过。当前只是让尚未推广的 v2 可以用自身精确冻结报告生成可信 collision receipt，同时保留 v1 与 staged map data 不兼容的可见事实。

### 3. 证据构建器拒绝伪严格 pending receipt

`tools/map_visual_evidence_builder.py` 在 `--allow-pending-catalog-preview` 下新增双层硬门槛：runner 顶层及目标 bundle report 的 `frozenReportValidationSkippedForGeneration` 必须都精确等于 `false`。任何缺字段、`true` 或非布尔值均拒绝写入 collision receipt。

地图生产合同同步记录该要求；冻结报告文件本身继续保留生成时的事实字段 `true`，严格 preview 的 `false` 表示本次运行实际对它做了复验，两者语义不混淆。

## 权威事实与新冻结哈希

本阶段确认 map data 与 binding 文件字节未改，以下哈希保持不变：

| 对象 | SHA-256 |
|---|---|
| `bindings/firebud_training_yard.json` | `2775987fa144e2a7f337a03d871bcd835d176e9af7a5461024997a0e3aaed073` |
| `bindings/firebud_village_gate.json` | `0a97650b8a8781f4831881cbf99adbc76d3a2287bdd08ef7aeaf17a15fb33252` |
| `data/firebud_training_map.json` | `37279c76ff265927ef8eb042ed0b8460e34aa91687070aff14029307adc71c51` |
| `data/firebud_village_gate_map.json` | `19bbdcbb7856f47f57d80883cf06bb83efab8abc05315eadf41e23fb2a409eac` |

基于修正后的严格 pending runner 重新冻结：

| 证据 | SHA-256 |
|---|---|
| `evidence/catalog-contract-check.json` | `092a9ba229efab36ff03888cd164f1d55972c052371684733adcb3e08239e90c` |
| `evidence/collision-runner-receipt.log` | `e0cd7f950b838ce5654131486950691910ab5f30214f4efbfa7b8851c5cf2c2d` |
| `evidence/collision-audit.json` | `df20cd944c4b72717ec06ccbb129f9892fae3bd8c349736aa616a4b1ae786e76` |

collision build identity 为：

`git:36a85217b8d6da1f49facc14fb4fe10e84b594c4+beastbound-map-runtime-surface-v2:78a6232908b40e82d6f12b02758e35b8fb3c137713d53e478fd8c2eff2c4fbd8`

只读不变量检查覆盖两个 manifest binding、两份权威 map JSON 和对象角色目录，结果为 `PASS`：18 个 blocking placement、47 个 blocking footprint cell 全部命中权威 `blockedCells`；花坛位置与 footprint 精确匹配上述值，两个旧保护格均不存在；catalog/collision 引用与实际文件哈希一致。

## 验证

以下检查均在隔离候选工作树执行：

1. 严格 pending catalog preview：

   ```text
   godot --headless --path client/godot --script res://scripts/qa/map_visual_runtime_check.gd -- --preview-map-visual-catalog-contract
   ```

   结果：顶层 `PASS`、v2 `PASS`、两层 `errors=[]`、两层 frozen validation 均未跳过；v1 失败只保留在自己的报告。

2. review catalog 合同：

   ```text
   godot --headless --path client/godot --script res://scripts/qa/map_visual_review_catalog_check.gd
   ```

   结果：`PASS`，包括新增 `strictPendingReviewFreeze=true`。

3. 重新生成严格证据：

   ```text
   python3 tools/map_visual_evidence_builder.py collision-receipt --bundle-id firebud_region_visual_v2 --allow-pending-catalog-preview
   python3 tools/map_visual_evidence_builder.py collision --bundle-id firebud_region_visual_v2 --build-identity <精确 build identity> --update-manifest-ref
   ```

   结果：receipt、audit 及 manifest 引用逐字节闭合。

4. 证据构建器与 bundle auditor 单元测试：

   ```text
   python3 -m unittest tools.test.test_map_visual_evidence_builder
   python3 -m unittest discover -s .agents/skills/design-beastbound-maps/tests -p 'test_audit_map_bundle.py'
   ```

   结果分别为 `16/16 PASS`、`17/17 PASS`；新增负例证明跳过 frozen validation 的 pending receipt 会被拒绝。

5. Godot 目标回归：

   ```text
   node tools/run_godot_auto_checks.mjs --only --auto-movement-check,--auto-pathfinding-check,--auto-map-visual-review-showcase-profile-check,--auto-npc-interaction-check,--auto-firebud-village-service-layout-check,--auto-npc-collision-check,--auto-map-transfer-check,--auto-encounter-check --fail-fast --timeout-ms 180000 --output-dir .run/godot_auto_checks/r1_w001
   ```

   结果：解析加 8 个目标检查 `9/9 PASS`，覆盖移动、寻路、展示档案、NPC 交互/碰撞、村庄服务布局、warp/切图和遇敌。

6. 服务点权威与距离：

   ```text
   node --test server/node/test/auth-social-world.test.js server/node/test/pet-service-access.test.js
   ```

   结果：`42/42 PASS`。

7. bundle 离线审计与基础检查：

   ```text
   python3 .agents/skills/design-beastbound-maps/scripts/audit_map_bundle.py client/godot/assets/maps/firebud_region_visual_v2
   python3 -m py_compile tools/map_visual_evidence_builder.py tools/test/test_map_visual_evidence_builder.py
   git diff --check
   ```

   结果：bundle 结构 `PASS`、Python parse `PASS`、补丁格式 `PASS`。map data 与 binding 的定向 `git diff --exit-code` 也通过。

本阶段没有修改地图像素、binding、权威地图数据、renderer 热路径、移动、输入或 HUD，因此没有伪造一组“改后性能提升”；已有玩法性能基线不受影响，道路/UI/密度返工后的新 idle/moving 性能证据仍由后续 W003–W006 生成。

## 失败尝试的分类

- 第一次 Godot 严格 runner 在引擎初始化阶段以 `SIGSEGV`／exit 134 退出；相同官方命令重试后稳定产出 Phase 511 所述产品报告，故前者分类为本机工具初始化失败，不当作产品 PASS 或 FAIL。
- 第一次目标 auto-check 调用给了 runner 不接受的输出目录形式，在启动 Godot 前被参数门禁拒绝；改用仓库相对 `.run/godot_auto_checks/r1_w001` 后 `9/9 PASS`。
- 额外只读 Node 断言首版把 `collisionRole=interaction` 的记录图腾也误算作 blocking，于 `(10,16)` 正确触发断言；按 bundle 合同收窄为 blocking 后通过，图腾交互与占位由已通过的 NPC/交互目标检查覆盖。

这些尝试均未写入产品源文件或玩家资料，也没有遗留候选 Godot/runner 进程。

## 生命周期、缺口与下一任务

manifest 生命周期保持：

- `status=owner_review_pending`；
- `ownerReviewStatus=pending`；
- `releaseApproved=false`；
- `runtimeEnabled=false`；
- `releaseAttestation=null`；
- `ownerAcceptance=null`。

离线 auditor 仍为 `releaseReady=false`，缺口是 `dressed_reference`、`layered_preview`、`runtime_screenshot_coverage`、`computer_use_report`、有效 `performanceReport`、OWNER acceptance、release attestation 和 released/enabled lifecycle。这些缺口属于后续 W002–W007，不在本阶段冒充关闭。

普通 primary strict 仍会因 v1 与 staged v2 map data 不兼容而 fail closed，直至受批准候选在 R1.02 正式 promotion 后重新通过 primary/pre-export 门禁。下一任务是 `R1.W002 AUTO｜Firebud v2 真实 Main 录片收口与 QA lane 恢复`。
