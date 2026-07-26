# Phase 357：月岚风狐战斗高清母版同源修复

日期：2026-07-26

## 用户决定与本阶段边界

项目所有者明确要求修复月岚风狐独立战斗包的历史高清来源问题，并要求以后正式美术尽量一次完成，不再依赖回头补“来源债务”。

本阶段只处理月岚风狐独立宠物战斗美术的来源、规范派生、完整归档、持续审计和视觉复验。不修改：

- 宠物数值、技能、进化概率或经济规则；
- 战斗玩法、协议、服务端、数据库或真实玩家档案；
- 月岚风狐骑乘战斗、世界真八向或进化演出像素；
- 整宠、路线或全局运行开关。

整包仍为 `ownerReview=pending/runtimeEnabled=false`，没有用本次工程修复代替项目所有者的最终战斗视觉批准。

## 先纠正历史误报

历史临时审核曾报告 48 张 512px 源帧与来源账本全部不一致。追溯后确认源图没有损坏，误报来自两种 SHA-256 域被直接比较：

- 正式账本使用 `tools/build_pet_art_bundle.py::rgba_hash`，哈希内容为尺寸/模式前缀加 RGBA 字节；
- 临时审核只哈希 RGBA 字节。

对同一批 48 张文件重新按两种口径验证：

```text
formal canonical hash matches ledger = 48/48
raw-pixel hash matches historical audit actual = 48/48
classification = hash-domain-mismatch-false-positive
```

因此没有把 256 图放大冒充 512，也没有“修复”本来正确的原始源图。

## 实际问题

真正的问题是后续两轮比例修正只落在 256px 运行图：

- `runtime-proportion-red-flag-repair-v1`：48 张；
- `runtime-motion-scale-followup-v1`：62 张实际变化，另有两张 `revive-1` 只作为 `down-8` 连续性保护记录；
- 去重后实际需要回写 512 母版的帧为 110 张。

这 110 张运行图的视觉已经经过此前自审，但对应 512 母版没有同步调整，所以不能证明当前运行图来自高清母版。

## 修复方案

1. 从 Phase322 完整生产档案读取并校验 180 张原始 512px 源帧，结果 `180/180` 与原来源账本一致。
2. 对 110 张涉及比例修正的帧，在原始 512px 源帧上重放已记录的等比缩放和定位；其余 70 张 512px 母版保持原样，其中包含两张受保护的 `revive-1`。
3. 所有 180 张 256px 运行帧只通过共享函数 `tools/build_pet_art_bundle.py::derive_runtime_frame` 从最终 512 母版生成。
4. 一张正面攻击帧在 512→256 舍入后多占 2px 右边距；将其动作组的 512px 水平定位从机械 `-38px` 校准为 `-39px`，最终维持既有 11px 运行安全边，没有缩小动作或裁切主体。
5. 归档完整正式来源：
   - 180 张 512px 母版；
   - 180 张规范派生 256px 运行帧；
   - 24 份无损原始动作表；
   - 24 份逐字 prompt、pipeline、source metadata 和动作 QC；
   - 完整 source ledger、安装清单、逐帧变换及哈希记录。
6. 历史运行时 QC 另存为 `qa/battle/history/precanonical-runtime-qc-summary-v1.json`，不以新当前 QC 覆盖其历史证据。

本次生成结果：

```text
original 512 ledger match       = 180/180
preserved 512 frames            = 70
transformed from original 512   = 110
formal 512 frames               = 180
canonical derived 256 frames    = 180/180
minimum 512 margin at alpha 8   = 23px
minimum 256 margin at alpha 8   = 11px
512 down-8 == revive-1          = 2/2
256 down-8 == revive-1          = 2/2
upscaled from runtime           = false
```

与修复前已认可运行图相比，70 张保留母版中 23 张运行图逐像素不变；另 47 张只因统一重跑当前规范派生而出现最多 6 个像素的低透明边缘差异，最大 RGBA 平均误差 `0.011738`、最低 alpha IoU `0.9994507`。110 张正式回写动作保持此前认可的比例和动作语义。

## 防止以后再次产生同类债务

正式安装和目录审计新增两层失败关闭：

1. `tools/install_pet_battle_bundle.py`
   - CLI 默认归档模式从 `lean` 改为 `full`；
   - `full` 和 `lean` 都必须生成并引用 source ledger；
   - `full` 账本必须逐动作标记 512 母版和原始无损表受追踪；
   - 安装时仍逐帧重算 512→256，运行图不是规范派生会直接拒绝。
2. `tools/audit_pet_battle_catalog.py`
   - 对 `archiveMode=full/sourceFramesTracked=true` 的正式包持续读取已提交的 512 母版、pipeline、source ledger 和 256 运行图；
   - 逐帧验证 source ledger、pipeline 和共享派生结果；
   - 以后若只覆盖 256 图而不更新 512 母版，常规目录门禁立即失败。

单元测试新增：

- full 安装确实保留 180 张 512 母版、24 份原始表并生成 full ledger；
- CLI 默认 full；
- full 目录 `180/180` 同源时通过；
- 任意一张 256 运行图被单独覆盖时目录门禁失败。

## Godot 实载与 1× 视觉复验

显式 Godot editor 重导入后：

```text
checkedFrames             = 180
importFreshCount          = 180
canonicalRgbaMatchCount   = 180
errors                    = 0
sourceSetSha256           = 0c4a5e105f66b2aa712d1e52cbe12c4f4cb49a8444431e9275df3ff9c2dea07f
```

真实 `Main.tscn` 复验片：

```text
.run/evidence/phase357_moon_gale_canonical_source_reconciliation/
  Beastbound_Phase357_Moon_Gale_Canonical_Source_1x.mp4
```

- SHA-256：`abfcfae6e0cc97aa3e7c65e5815fe7f780f5de16a2fa0d6133da527615acb9d7`；
- 1280×720、60 FPS、2477 帧、41.283333 秒；
- H.264 + AAC 48 kHz 双声道；
- 全程 `speedScale=1.00`，顶部工具显示两秒后收起；
- 连续覆盖普通攻击、防御受击、受伤、三类反击、技能、合击、直飞/弹飞、回避/回避反击、倒地和复起共 14 段；
- 全片完整解码通过；离线 Movie Maker 平均 CPU render `0.09ms/frame`。

自审确认双尾身份、动作区分、比例、因果、击飞不站起以及倒地/复起连续性保持；未见新增裁切或异常缩放。该自审不是 owner 批准。

## 验证

执行并通过：

- `python3 -m unittest tools.test.test_install_pet_battle_bundle tools.test.test_audit_pet_battle_catalog`：`23/23`；
- full installer dry-run、实际隔离安装及第二次幂等安装；
- 隔离安装清单 `531/531` 文件哈希一致；
- 月岚单形态目录审计：180 运行帧、180 追踪母版、180 规范派生全部通过；
- Godot parse、显式 editor 重导入与运行时纹理 parity：`180/180`；
- 真实 `Main.tscn` 1×、1280×720、有声成片与全片解码；
- Pet Design Inspector、Battle Action Catalog、相关 Godot 自动检查与全目录审核；
- `git diff --check`。

未运行全量本地 CI；本阶段没有玩法、网络、服务端或数据库改动，定向来源、安装、目录、Godot 实载和真实画面门禁覆盖本轮风险。

## 当前结论

```text
historical 48-frame mismatch report = false positive
actual 110-frame runtime-only source debt = resolved
battle archive mode = full
tracked 512 masters = 180
tracked lossless raw sheets = 24
canonical derived runtime frames = 180/180
moon gale battle owner review = pending
moon gale battle runtime enabled = false
P1.3e = not complete
```
