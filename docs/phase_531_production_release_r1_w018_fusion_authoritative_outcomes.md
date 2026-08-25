# Phase 531：生产发布 R1.W018 融合权威结果态

日期：2026-08-26

## 目标与范围

本阶段关闭 `R1.W018 AUTO｜融合权威成功／失败结果态`。目标是在不改变配方、概率、成长、经济、原子事务、画像像素或生产开关的前提下，为三宠融合补齐可持续核对的服务器权威终点，并继续保持 PC 1280×720、中文、左键完整可用与生产目录关闭。

StoneAge 8.0 本地参考的融合 NPC 在选择材料后由服务器执行，成功刷新宠物、失败立即给出结果。Beastbound 额外存在服务器报价、双确认、三次主动遗传、唯一被动、绑定和终局规则，因此增加一张紧凑结果卡有明确收益：玩家能核对实际成品和消耗，失败有可操作恢复，未知回执不会被误报为零消耗。这是高价值不可逆事务的终点闭环，不扩展玩法规则。

## 实现

新增 focused `PetFusionOutcomeModel`，所有面板结果都先经过精确字段归一化：

- **成功**：只接受 `PetFusionClientModel.normalized_fusion_result` 已严格解析、服务器 profile/revision 已应用且新 `resultInstanceId` 确实存在于当前档案的结果；展示正式结果画像、名称、`一转 Lv1`、基础主动、实际遗传主动、实际被动、绑定／交易、终局／不可骑、独立数值来源和三只材料宠已永久消耗；
- **明确失败**：只有已列入客户端“执行前明确拒绝”集合的服务器 code 才能显示“本次没有消耗任何宠物”，并按 revision/catalog 冲突提供“重新获取报价”，其余明确拒绝提供“返回材料选择”；结果模型只消费既有玩家文案，含下划线的 raw identifier 会回退成安全中文；
- **结果未知**：网络、存储、坏 JSON、通用 server error 和未识别 code 都保留原幂等操作标识，明确写出“当前不能判断材料是否已消耗”，只允许使用同一操作核对结果；
- **档案待同步**：服务器已返回成功但 profile/revision 尚未安全应用时不展示成功；保存严格结果，重新拉取档案，并只在新宠实例和修订同时成立后升级为成功卡。

`PetFusionPanel` 新增全屏 outcome layer。成功、失败、请求中、结果待确认和档案待同步都会遮断材料选择、报价、确认、关闭与重复结果动作；结果动作在首次发出后立即本地锁定。正常协调器只负责服务器请求、profile 应用、幂等恢复和结果动作接线，没有把新领域塞入 `main.gd`。

新增 `--auto-pet-fusion-outcome-check`，并按受保护 QA lane 合同更新 `_apply_preview_window_args`／`_ready` 的精确函数指纹；78 项 lane 正反测试证明隔离合同未被放宽。

## 验证

### 结果模型与 1280×720 面板

- `node tools/run_godot_auto_checks.mjs --only --auto-pet-fusion-outcome-check --fail-fast`
  - 最终当前代码的隔离解析、新结果模型 `2/2 PASS`；既有技能策略已在同阶段扩大回归中通过；
  - 结果模型 `8 cases / errors=[]`；
  - log SHA-256 `f3505431241ac0b4feca486eab3b46bf5a893fc7943b75ca03c30207119b3c10`；
  - summary SHA-256 `6615e9f826b7f37b63989ee1a99af605b9e777c55bb17c4ebc8a743b684a7c58`。
- `godot --headless --path client/godot --script res://scripts/qa/pet_fusion_panel_check.gd`
  - `PASS / errors=[]`；
  - 两条报价路线继续使用正式画像、零占位；
  - 成功结果正式画像、动作只发一次；失败零消耗、未知结果不猜消耗；所有结果态布局均在 1280×720 内。
- `python3 -m unittest tools.test.test_godot_qa_user_data_lane`
  - `78/78 PASS`。

### 既有融合与宠物合同

- `godot --headless --path client/godot --script res://scripts/progression/pet_fusion_client_domain_check.gd`：`PASS / errors=[]`；
- `godot --headless --path client/godot --script res://scripts/progression/pet_fusion_contract_check.gd`：`PASS / errors=[]`；
- `node --test server/node/test/pet-fusion*.test.js`：`89/89 PASS`；
- `node tools/battle_action_catalog_check.mjs`：`34 actions / 10 passives / 36 forms / status=ok`；
- `node .agents/skills/design-beastbound-pets/scripts/inspect_pet_design.mjs --check`：`36 forms / 2 fusion targets / errors=0 / warnings=0`；
- `godot --headless --path client/godot --quit` 与 `git diff --check`：PASS。

### 性能

`node tools/run_godot_auto_checks.mjs --performance-suite --fail-fast` 为 `5/5 PASS`：idle、真实移动、移动点击压力、商店选择和玩家属性压力全部通过。移动段稳定 `60 FPS`、`process_total=0.41–0.58ms`，120 次点击压力为 `accepted=37 / resolved=12 / applied=12 / avg_input_us=2 / max_input_us=4`。结果模型和 overlay 没有进入 `_process`、`_input` 或 `_draw` 热路径。

- log SHA-256 `de9676735ecaec3693a7661449511d5a1c66590d3deb25809560c9d85c10d32b`；
- summary SHA-256 `51caf2377859098a3a0bf6dd3623174e03345e2783fc7f9c2c38c7caeac50a23`。

## 诚实边界与剩余工作

额外执行的完整 36-form portrait catalog 审计没有被包装成 PASS：发布候选 worktree 缺少忽略目录中的 Phase 371 曜冠 owner-review 旧视频，因而曜冠两条历史 identity-reference 重放检查失败；原仓库仍有该 13.5MB 文件。本阶段不复制旧片、不改写历史 attestation，也不把自动完整性检查当作 owner 接受。两张融合运行画像的精确像素、正式目录加载和本阶段 UI 消费均未变化且已通过定向检查。

生产边界保持不变：`portraitReleaseGate=false / releaseApproved=false / runtimeEnabled=false / playerEntryOpened=false`，没有 owner decision、总 owner approval、release attestation 或 promotion。下一任务是 `R1.W019`：在隔离 QA lane、关闭生产目录和零真实网络／档案写入下，从真实 `Main.tscn` 重录两路线、双确认、成功、失败恢复、关闭态和不可骑边界，再做当前精确审片。
