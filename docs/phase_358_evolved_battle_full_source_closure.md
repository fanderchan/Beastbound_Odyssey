# Phase 358：两只进化宠战斗高清源档完整封口

日期：2026-07-26

## 用户决定与本阶段边界

项目所有者要求把此前为了分阶段验收而保留的精简战斗源档一次补完整，后续不再回头修同类高清美术来源问题。

本阶段只处理以下三套已经存在的战斗美术：

- 晶甲乌力独立宠物战斗包；
- 成年见习猎人骑晶甲乌力的一体整图战斗包；
- 成年见习猎人骑月岚风狐的一体整图战斗包。

没有修改战斗规则、宠物数值、技能、进化/二转/融合规则、服务端、数据库、玩家档案、`main.gd` 或路线开放门禁。三套资源继续保持：

```text
ownerReviewStatus = pending
runtimeEnabled = false
P1.3e = not complete
```

## 来源原则

本次没有把任何 256px 运行图放大成 512px 母版。

三套资源均从各自原始生产档案中的 512px RGBA 源帧与无损原始动作表出发，再统一通过 `tools/build_pet_art_bundle.py::derive_runtime_frame` 生成 256px 运行帧：

```text
formal 512px source frames = 540
canonical 256px runtime frames = 540
lossless raw action sheets = 72
upscaled from runtime = 0
```

每套战斗包现均完整提交：

- 正背双斜向、12 动作、180 张 512px 正式母版；
- 180 张规范派生的 256px 运行帧；
- 24 份无损原始动作表；
- 24 份 prompt、source metadata、pipeline metadata 与动作 QC；
- 完整 source ledger、安装清单和 Phase358 封口清单。

三个安装清单分别为 `531/531` 文件哈希一致。

## 晶甲乌力独立包的历史修复重放

晶甲乌力独立包此前有两次已经验收过的倒地/复起修复，但只完整落在运行资源链：

1. 倒地到复起的单调时序整理；
2. 12 张 KO 帧面部小范围螺旋失焦眼修复。

本次在原始 512px 源帧上重放同一修复，而不是读取或放大 256px 结果：

```text
changed 512px destination frames = 21
local KO eye repair frames = 12
minimum 512px alpha8 edge margin = 30px
minimum 256px alpha8 edge margin = 14px
down-8 == revive-1 at 512px and 256px = true
upscaled from runtime = false
```

眼部修复只改面部局部 RGB，透明度、身体、光照、描边和面部遮罩外像素保持不变。

最终 180 张运行帧全部从封口后的 512px 母版重新经过当前共享派生器生成，因此与历史混合派生的 256px 文件并非逐文件完全相同。逐帧比较的平均 RGBA 误差均值为 `0.215305`，最大值 `0.268188`，最低 alpha IoU 为 `0.99886566`；真实战斗审片未见比例、身份、动作语义或边缘裁切变化。

两套 mounted 包原本已经是规范 512→256 派生，本次只补齐完整归档，运行像素变化均为 `0/180`。

## 防止再次出现精简源档

本阶段把约束落进常规工具，不再依赖人工记忆：

1. `tools/audit_pet_battle_catalog.py`
   - 完整源档审计支持独立宠物与 mounted 两种身份；
   - 同时核对 `kind`、`formId`、`characterId`、source ledger 和 512→256 规范派生。
2. `tools/pet_art_batch_audit.py`
   - 全宠目录日常审计同时检查独立宠物与 mounted 的完整战斗源档；
   - 任意一张 256px 运行图脱离 512px 母版单独覆盖，会以 `invalid_full_source_archive` 失败。
3. `tools/install_pet_battle_bundle.py`
   - 普通重复动作帧继续失败关闭；
   - 只有 `down/revive` 中紧邻前一帧、并在逐帧 metadata 明示 `authored_temporal_hold` 的时间停顿帧才允许通过。

对应测试覆盖 mounted 完整源档通过、单改运行帧被拒绝、明示倒地停顿允许、错误或伪造停顿标记被拒绝。

## 安装保护

三套目标目录采用隔离构建、完整 dry-run、影子安装和原子替换。安装前后确认非战斗文件及世界表现没有被误改：

```text
crystal pet protected non-battle files = 203/203
crystal mounted protected non-battle files = 154/154
moon mounted protected non-battle files = 163/163
world metadata exact = 3/3
```

月岚风狐既有世界真八向 `visual_only` owner 批准记录也保持逐字节一致，没有被本次战斗源档封口扩大或改写。

## Godot 实载与 1× 合并复验

显式 Godot editor 重导入后，对三套资源逐帧核对正式 PNG、import `source_md5`、Godot 实载 `Texture2D` canonical RGBA 与 512px 规范派生：

```text
bundles = 3/3
checkedFrames = 540
importFreshCount = 540
canonicalRgbaMatchCount = 540
errors = 0
combinedSourceSetSha256 =
  bb58dedde1c695e9537ae756448763f0f2ac8f8f2487d9cf8bff4a0cfad64615
```

真实 `Main.tscn` 合并复验片：

```text
.run/evidence/phase358_evolved_battle_full_source_closure/
  Beastbound_Phase358_Evolved_Full_Source_Closure_1x.mp4
```

- SHA-256：`8810a2ec5a3c771bb4634e3c72b483be50dae0f0aaab5df222810fd30aad8b25`；
- 1280×720、60 FPS、2269 帧、37.816667 秒；
- H.264 + AAC 48 kHz 双声道；
- 音频均值 `-29.4dB`、峰值 `-7.3dB`；
- 全程 `speedScale=1.00`，没有 `setpts`、`atempo`、剪帧或倍速；
- 三章依次覆盖晶甲乌力单宠、晶甲人骑宠、月岚人骑宠；
- 每章完整播放进攻、主动技能、后撤回避、倒地与逐帧复起；
- 全片完整解码通过。

自审确认三章身份稳定、整骑比例稳定、进攻/技能/回避可读、倒地/复起连续，未见动作串包、异常小人、边缘裁切或加速。Godot 动作验收场同时确认晶甲乌力与月岚 mounted 的归一化观战高度均为 `91.897344px`。

这仍是 Codex 自审证据，不代替项目所有者的最终视觉批准。

## 验证

执行并通过：

- `python3 -m unittest tools.test.test_install_pet_battle_bundle`：`21/21`；
- `python3 -m unittest tools.test.test_audit_pet_battle_catalog tools.test.test_pet_art_batch_audit`：`15/15`；
- 晶甲乌力独立包定向目录审计：`180 source / 180 runtime / 180 canonical derived`，`errors=[]`；
- 全宠目录审计：`34` 个形态、`failed=0`、`errors=0`、`warnings=0`；其 `pending` 只反映既有未生产项目与进化图片尚未纳入通用战斗合同，不是本次三套完整源档失败；
- Godot parse、Pet Action、Mounted Action、Character Mount Art、Pet Battle Review Lab、Battle Action Catalog：`6/6`；
- Godot 实载同源校验：`540/540`；
- 真实 `Main.tscn` 1× 有声视频、ffprobe 与全片解码；
- 三套目标 JSON 全量解析；
- `git diff --check`。

未运行全量本地 CI；本阶段没有玩法、网络、服务端或数据库改动，定向安装、完整源档、Godot 实载、真实画面和工具回归已覆盖本轮风险。

## 当前结论

```text
target full battle archives = 3/3 complete
tracked 512px masters = 540
tracked lossless raw action sheets = 72
canonical 256px derivations = 540/540
upscaled runtime frames = 0
protected world/non-battle content = exact
owner review = pending
runtime enabled = false
P1.3e = not complete
```
