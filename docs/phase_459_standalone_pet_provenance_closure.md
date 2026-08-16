# Phase 459：三套独立宠物世界修复来源与 QC 账本收口

日期：2026-08-16

## 结论

赤角兽、地灵转生兽和新手老虎三套独立宠物候选的世界方向／尺度修复已经补回当前仓库可验证的来源清单、QA 路径与运行帧摘要。本阶段只修正 7 份 JSON；没有修改任何 PNG、GIF、WebP、Godot 脚本、战斗规则或玩家数据。

这不是三只宠物的美术批准或运行开放。三套资产继续保持 `ownerReviewStatus=pending`、`runtimeEnabled=false`；全量审计仍如实保留既有洋红边缘候选项，不用自动去色、宽松阈值或元数据文字掩盖画面债务。

## 变更范围

### 赤角兽

- 把已跟踪的 `source/world-direction-repair-v2/manifest.json` 纳入正式修复清单。
- 将世界联系表哈希更新为当前仓库文件，并登记当前方向修复前后对照图及哈希。
- 14 项 metadata 证据／manifest 路径与 SHA-256 均逐文件命中。

### 新手老虎

- 将世界尺度规范化、后向斜角修复和东向行走修复三份已跟踪 manifest 纳入来源清单与 ledger。
- 补齐 `qa/world/world-qc.json` 的正式路径；联系表、循环 GIF、世界 QC 与战斗 QC 的路径／哈希均指向当前仓库文件。
- 修复战斗 QC 中 4 条过期的 `east/walk` 运行帧哈希；220 条 `runtimeSha256` 现在逐文件等于当前 40 张世界帧加 180 张战斗帧。
- 全运行树摘要为 `4cde4024dbb8bab962b852a24e86670bdf4f2833eb3a91009da2fd04471a12f5`；180 张战斗帧未变化，既有 battle-only digest `0246149b3239d1872ca1e888b839e2eb36990543a08df46d22d6650a0d140903` 继续保留。
- 不把 Phase 324 已撤销的 `.run` 录像／对照图复制进正式证据。当前运行像素一致性结论仍以 Phase 325 的完整重导入、源 PNG／Godot import／`Texture2D` 三方一致性和 v2 方向清单为准。

### 地灵转生兽

- 将已跟踪的 `world-scale-normalization-v1-manifest.json` 纳入 metadata 与来源 ledger。
- 联系表、循环 GIF、世界 QC 和战斗 QC 的哈希更新到当前仓库文件。
- 220 张独立宠物运行帧的摘要为 `dd4379c2edcecbb8fc06bf9279ec7724047e19175c060fa4e88589f297e4bb8e`，QC 与 ledger 一致。
- 本阶段不触碰 Phase 458 已完成并推送的整体骑乘包；独立宠物与整体骑乘仍是两个隔离资产根。

## 被拒绝的本地漂移

蓝人龙 metadata 曾出现三条仅改变哈希、但路径仍指向已不存在 `.run/art_batch_phase320/...` 文件的本地差异。新旧哈希都无法由当前文件验证，因此本阶段已撤回这三条差异，不把不可复现的数字提交到 `main`。蓝人龙历史世界证据的远端可恢复性作为独立债务保留，后续应从当前受跟踪源帧重新生成正式 QA，而不是猜测旧工作档哈希。

## 审计结果与保留债务

全量 `pet_art_batch_audit.py` 结果为 36 个形态、3 个已启用运行形态、`errors=0`、`warnings=0`；全局 `status=pending` 和 7686 条 pending 来自仍未正式开放的美术生产范围。

本阶段三套独立宠物均为 `220/220` PNG：

- 赤角兽：`errors=[]`、`warnings=[]`，既有 pet pending 32 条，主要为世界／战斗透明边缘的疑似洋红像素。
- 新手老虎：`errors=[]`、`warnings=[]`，既有 pet pending 1 条，为背视角 `hurt-4` 的 1 个疑似洋红边缘像素。
- 地灵转生兽：`errors=[]`、`warnings=[]`，既有 pet pending 114 条，主要为独立宠物世界／战斗旧包的疑似洋红边缘像素。

这些 pending 在本阶段前已经存在；本阶段无二进制差异，没有把它们声明为通过。正式清边必须回到对应来源与颜色语义逐项处理，并重新生成证据，不得对整包执行无来源的自动 despill。

## 验证

- 三套 metadata 证据／manifest 精确校验：赤角兽 14 项、新手老虎 16 项、地灵转生兽 16 项，全部路径存在且 SHA-256 命中。
- 新手老虎：220 条运行帧哈希逐文件命中，QC 与 ledger 摘要均为 `4cde4024...`，6 份 ledger repair manifest 均命中。
- 地灵转生兽：220 张运行帧摘要与 QC／ledger 的 `dd4379c2...` 一致，5 份 ledger repair manifest 均命中。
- `python3 tools/pet_art_batch_audit.py --json-out .run/evidence/phase459_standalone_pet_provenance_closure/pet-art-audit.json --markdown-out .run/evidence/phase459_standalone_pet_provenance_closure/pet-art-audit.md`：退出码 0，`errors=0`、`warnings=0`。
- `godot --headless --path client/godot --quit`：Godot 4.7 解析通过。
- 七份变更 JSON 均通过 `python3 -m json.tool`。
- `git diff --check`：通过；`git diff --name-only -- '*.png' '*.gif' '*.webp'`：空输出。

## 发布边界

本阶段可发布的是“来源／QC 账本与当前文件一致”这一工程修复，不是“美术已经达到正式服标准”。项目所有者明确验收之前，不得把三套独立宠物改为 approved 或 runtime enabled，也不得据此勾选 P2.2/P2.3。
