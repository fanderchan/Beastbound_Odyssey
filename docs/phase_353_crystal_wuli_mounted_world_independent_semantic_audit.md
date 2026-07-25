# Phase 353：晶甲乌力人物骑乘世界真八向独立语义审核

日期：2026-07-26

## 本阶段结论

在不修改任何世界图片或玩法代码的前提下，完成“成年见习猎人骑晶甲乌力”世界真八方向的第二遍去标签技术审核：

- 八方向随机编码为 A–H，只显示每组 `idle + walk 1..4`；
- 在读取随机映射前冻结方向、身份、比例、坐点与步态判断；
- 揭示后方向预测 `8/8` 命中；
- 当前 40 张 PNG、Godot import 与实际 `Texture2D` canonical RGBA `40/40` 一致；
- 当前文件/decoded RGBA 与 Phase326 冻结 QC、运行帧来源账本和入选 512px 源帧账本均 `40/40` 一致；
- 当前文件与 Phase326 方向语义批准清单 `40/40` 一致，因此像素仍对应原动态证据；
- 40 张 decoded RGBA 全部唯一，完全重复 `0`、跨方向水平镜像对 `0`，最小安全边 `14px`；
- 成年骑手比例、肩堡后方坐点、人物/坐骑同帧共同起伏、晶甲身份和八向步态均通过。

本次通过的是 Codex 的第二遍技术盲审，不是项目所有者决定。晶甲乌力完整骑乘世界仍为 `ownerReview=pending`，整宠、路线和运行时仍为 `runtimeEnabled=false`。

## 审核边界

本轮只审核：

```text
client/godot/assets/mounted/novice_hunter_v1/
  wuli_evolved_crystal_earth8_water2/
    world/directions/{8 directions}/{idle,walk}/
    qa/world/
    source/world/
```

没有改变：

- 40 张完整骑乘世界 PNG 或 40 张归档源帧；
- Phase352 完整骑乘战斗包及其 owner 状态；
- Phase350 独立宠物战斗包及其 owner 状态；
- Phase342 已单项批准的 `evolution_visual_only` 历史范围；
- 进化成功规则、服务端事务、材料、数值、玩家档案或路线开关；
- 单人练级陪练小人的现有行为。

## 去标签方向盲审

临时忽略目录脚本使用系统随机顺序把八方向改为 A–H。审片板只显示五张连续帧，真实方向映射写在单独文件；在读取映射前先冻结预测和观察。

| 编码 | 冻结预测 | 揭示方向 | 结果 |
| --- | --- | --- | --- |
| A | northwest | northwest | 通过 |
| B | north | north | 通过 |
| C | northeast | northeast | 通过 |
| D | south | south | 通过 |
| E | southwest | southwest | 通过 |
| F | southeast | southeast | 通过 |
| G | east | east | 通过 |
| H | west | west | 通过 |

冻结证据：

```text
.run/evidence/phase353_crystal_wuli_mounted_world_blind/
  blind-contact-8x5.png
  blind-code-mapping.json
  blind-predictions-before-reveal.json
```

SHA-256：

```text
blind-contact-8x5.png
957782f2be7fbd6350a4ae25bea5c11d304be93f6da433827aabdd395dadbafb

blind-code-mapping.json
d9102f09ef3d8a507565e2dce1de11ab2765da3ffde131c079803067776b1306

blind-predictions-before-reveal.json
88971309a54704b591d5cd79cb6ec7df4156471870932f84e5006fdb8fc38ec4
```

## 视觉语义结论

### 方向

- D/B 分别是严格正面与背面；
- G/H 是方向相反的两个纯侧向；
- E/F 由骑手胸面、坐骑脸部、前足与肩堡透视读为两个前斜向；
- A/C 由骑手背面、坐骑头轴、肩堡遮挡与后足透视读为两个后斜向；
- 每组 `idle` 与 `walk 1..4` 没有跨方向误帧。

### 人物骑乘整体

- 40 帧都是人物与坐骑同一张完整透明整图；
- 骑手髋部、双腿、坐点和坐骑身体共同起伏；
- 没有人物/坐骑分层滑动、运动轴分离或运行时叠层；
- 八向均保持成年见习猎人比例，稳定坐在双肩晶堡之后；
- 可见宽度变化符合正背、斜向和纯侧透视，没有异常小人、坐骑骤缩、人物浮起或坐点漂移。

### 身份与连续性

- 骑手的发型、橙褐服装和成人身体比例稳定；
- 晶甲乌力保持巨型额盾、双肩晶堡、分层背甲、青蓝裂隙、蓝眼和尾端晶芽；
- 四足交替、身体起伏、坐姿随动和脚底基准连续；
- 未观察到跳尺、裁边、脚底断层、晶体穿入人物或方向中途换模。

## 当前像素、冻结账本与 Godot 实载

结构审核重新解码当前 40 张 PNG，并交叉比较 QC、运行来源账本、512px 入选源帧账本和 Phase326 方向清单：

```text
checkedFrames=40
uniqueDecodedRgbaFrameCount=40
trackedQcFileSha256MatchCount=40
trackedQcRgbaSha256MatchCount=40
trackedLedgerRuntimeFileSha256MatchCount=40
trackedLedgerRuntimeRgbaSha256MatchCount=40
trackedLedgerSourceFileSha256MatchCount=40
trackedLedgerSourceRgbaSha256MatchCount=40
trackedPhase326ApprovalFileSha256MatchCount=40
runtimeFrameSizeMatchCount=40
reviewEvidenceSha256MatchCount=3/3
minimumEdgeMargin=14
transparentRgbLeakPixelCount=0
duplicatePairCount=0
mirroredCrossDirectionPairCount=0
ownerRuntimeGatePreserved=true
currentDecodedRgbaSetSha256=2f1724ac4ab7eede4b2af2b05e80b46dcebc51321b72fd1fd2faed84c9974024
```

结构报告：

```text
.run/evidence/phase353_crystal_wuli_mounted_world_blind/image-structure-audit.json
SHA-256 8ec62e6215980f33c9b6a8341deee8924089e23d458a4bc87a61fa0bb017f0dc
```

Godot 逐帧比较当前 PNG、import 新鲜度及 `ResourceLoader` 实载 `Texture2D.get_image()`：

```text
checkedFrames=40
importFreshCount=40
canonicalRgbaMatchCount=40
errors=0
sourceSetSha256=557ceeb91a1aee0c9d670589d4d9950d9193dce3c707029eebd65173199aa570
```

运行时报告：

```text
.run/evidence/phase353_crystal_wuli_mounted_world_blind/runtime-parity.json
SHA-256 fe8fa0c2197b7e117e33a39bd8021eff6d052db0d19bc17014bdda111f376c72
```

跟踪审核文件：

```text
qa/world/independent-semantic-audit-v1.json
SHA-256 e22a0e23a010b6e23c18f07080dcd3ec2fc5980d7956f44514e2f7b42b0dcfde
```

冻结来源：

```text
qa/world/world-qc.json
SHA-256 2daddf6388fe700c73b76060afb44442f2659a1e50480094e59e5257db68c7e6

source/world/source-ledger.json
SHA-256 a292b6b2056bee9c7cdf04befef6eee0231f112cdc003d2315253cb2bbc56855

client/godot/data/world_semantic_direction_approval_crystal_wuli_v1.json
SHA-256 a2f9e80841ffa3c547691afb53220d51dd82fb6b6c5f25cdca0b2c71aad475ed
```

## 动态证据与主人状态

本阶段没有改世界像素，因此不生成内容相同的新录像。当前 mounted 40 张文件逐一吻合 Phase326 冻结方向清单，继续复用当时同屏展示人物、独立宠物与完整骑乘三包的 Godot 动态审片：

```text
.run/evidence/phase326_crystal_wuli_world/candidate/phase326-crystal-wuli-world-v3/
  wuli_evolved_crystal_earth8_water2/review.mp4

SHA-256
c42f95b68e11ffad2496373f5e53ab50d37ff1af5b2bcde43a5b4bf6a349628b
```

本轮重新确认该文件为 H.264、1280×720、30 FPS、14.433333 秒，AAC 48 kHz 双声道，并完成全片解码。

该录像和 Phase326 的 `semanticDirectionReview=passed_by_visual_audit` 都只证明候选方向与运行像素，不表示项目所有者已批准。主人没有查看本阶段结果，`ownerReview=pending` 不得改为 approved。

## 定向验证

执行并通过：

- Phase353 runtime parity：
  - `40/40` import 新鲜，源 PNG 与 Godot 实载 canonical RGBA 一致；
- Phase353 image structure audit：
  - QC、运行/源账本和 Phase326 清单全部 `40/40`；
  - 唯一帧 40、重复 0、跨方向镜像 0；
- 去标签方向审核：
  - 映射读取前冻结判断，揭示后 `8/8`；
- 晶甲乌力显式 `--auto-mounted-action-asset-check --auto-mounted-action-asset-world-only`：
  - `worldDirections=8`、`worldFrameCount=40`；
  - `runtimeBodyLayerCount=1`、`runtimeLayeredComposition=false`；
  - `requireBattle=false`、`errors=[]`；
- `node tools/run_godot_auto_checks.mjs --only=--auto-character-mount-art-check --fail-fast`：
  - Godot parse 与人物骑乘美术合同 `2/2` 通过；
- Phase326 MP4 哈希、媒体探测与完整解码；
- JSON parse、SHA 交叉引用、`git diff --check` 与窄范围 diff 审核。

没有运行全量本地 CI：本阶段没有产品代码、协议、服务端、数据库、UI、数值或热路径变更；当前像素、Godot 实载、冻结 QC/账本和去标签语义覆盖本轮风险。

## 当前门禁与下一步

Phase353 后保持：

```text
mountedWorldSelfReview=passed
mountedWorldSecondPassBlindSemanticAudit=passed
mountedWorldOwnerReview=pending
mountedWorldRuntimeEnabled=false
mountedBattleOwnerReview=pending
routeAssetGate=deferred
globalEvolutionRuntimeEnabled=false
```

P1.3e 仍不能勾选。项目所有者醒来后仍需本人决定独立世界、完整骑乘世界、Phase352 骑乘战斗及 Phase350 独立战斗的视觉验收；任何正式开放继续先讨论。
