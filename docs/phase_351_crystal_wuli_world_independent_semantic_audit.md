# Phase 351：晶甲乌力世界真八向独立语义审核

日期：2026-07-26

## 本阶段结论

在不修改任何世界图片或玩法代码的前提下，完成晶甲乌力独立宠物世界真八向的第二遍去标签技术审核：

- 八方向随机编码为 A–H，只显示每组 `idle + walk 1..4`；
- 在读取随机映射前冻结方向、身份、比例与步态判断；
- 揭示后方向预测 `8/8` 命中；
- 当前 40 张 PNG、Godot import 与实际 `Texture2D` canonical RGBA `40/40` 一致；
- 当前文件/decoded RGBA 与 Phase326 冻结 QC、运行帧来源账本和入选 512px 源帧账本均 `40/40` 一致；
- 当前文件与 Phase326 方向语义批准清单 `40/40` 一致，因此像素仍对应原动态证据；
- 40 张 decoded RGBA 全部唯一，完全重复 `0`、跨方向水平镜像对 `0`，最小安全边 `14px`；
- 主人待审和运行关闭状态在 metadata、QC、来源账本及方向清单中保持一致。

这次通过的是 Codex 的第二遍技术盲审，不是项目所有者决定。晶甲乌力独立世界与完整骑乘世界仍为 `ownerReview=pending`，整宠和路线仍为 `runtimeEnabled=false`。

## 审核边界

本轮只审核：

```text
client/godot/assets/pets/wuli_evolved_crystal_earth8_water2/
  world/directions/{8 directions}/{idle,walk}/
  qa/world/
  source/world/
```

没有改变：

- 40 张世界 PNG 或 50 张归档源帧；
- Phase350 独立宠物战斗包及其 owner 状态；
- Phase340 整体骑乘战斗包及其 owner 状态；
- Phase341/342 已单项批准的进化视觉范围；
- 进化成功规则、服务端事务、材料、数值、玩家档案或路线开关；
- 单人练级陪练小人的现有行为。

## 去标签方向盲审

临时忽略目录脚本使用系统随机顺序把八方向改为 A–H。审片板只显示五张连续帧，真实方向映射写在单独文件；在读取映射前先冻结预测和观察。

| 编码 | 冻结预测 | 揭示方向 | 结果 |
| --- | --- | --- | --- |
| A | west | west | 通过 |
| B | northwest | northwest | 通过 |
| C | southeast | southeast | 通过 |
| D | southwest | southwest | 通过 |
| E | south | south | 通过 |
| F | north | north | 通过 |
| G | east | east | 通过 |
| H | northeast | northeast | 通过 |

冻结证据：

```text
.run/evidence/phase351_crystal_wuli_world_blind/
  blind-contact-8x5.png
  blind-code-mapping.json
  blind-predictions-before-reveal.json
```

SHA-256：

```text
blind-contact-8x5.png
23f9811d142c5d5ef4fcdf442efde67005b7bea4846e8c645559868a5fdc5770

blind-code-mapping.json
9d88e4d5947de3204760f6e85f274bb070636d6983cc4fa133539a5f34a7a20b

blind-predictions-before-reveal.json
92cc39873d0588a7f911e886afa851439dbac59baec6ba5e3b9cbd484ff8c699
```

## 视觉语义结论

- `south` / `north`：正面额盾、双肩晶堡与背面分层甲壳关系明确；
- `west` / `east`：口鼻、尾巴和身体运动轴严格相反；
- `southwest` / `southeast`：两个前斜向可由脸侧、口鼻偏置、前足落点和肩晶透视区分；
- `northwest` / `northeast`：两个后斜向可由后脑、背甲、臀部和尾部位置区分；
- 八方向均保持低重心野猪体型、巨型额盾、双肩晶堡、青蓝裂隙、蓝眼和尾端晶芽；
- 每组 `idle` 与 `walk 1..4` 朝向一致，四足交替和身体起伏连续；
- 没有相邻方向改名、跨方向误帧、静止复制、异常缩小、跳尺、裁边或身份退化。

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
currentDecodedRgbaSetSha256=b7edbbbfb416d2f4378277d3999ad2eb29c2f3b4edcbe756cb85676b97750c49
```

结构报告：

```text
.run/evidence/phase351_crystal_wuli_world_blind/image-structure-audit.json
SHA-256 74ab0c0821ed6bcfe875481f53e7b3080aa0202b4103772e27d03afafcd33fb3
```

显式刷新 Godot import 后，逐帧比较当前 PNG、import 新鲜度及 `ResourceLoader` 实载 `Texture2D.get_image()`：

```text
checkedFrames=40
importFreshCount=40
canonicalRgbaMatchCount=40
errors=0
sourceSetSha256=9be353662a83f84d805ac5b5bdcfffe047b08d4658b99c2f72cc49b3ae3860a4
```

运行时报告：

```text
.run/evidence/phase351_crystal_wuli_world_blind/runtime-parity.json
SHA-256 a37025454d50fcc36b44c6620ae53b5dcf4b4a9d77490d914f92ad82360c8dc4
```

跟踪审核文件：

```text
client/godot/assets/pets/wuli_evolved_crystal_earth8_water2/qa/world/independent-semantic-audit-v1.json
SHA-256 d134f2c73e20de1e2a7d8f4e215198a086c35e3ca187a21a26bd40d501b6b0d6
```

## 动态证据与主人状态

本阶段没有改世界像素，因此不重复生成内容相同的新录像。当前 40 张文件逐一吻合 Phase326 冻结方向清单，继续复用当时的 Godot 动态审片：

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

- `godot --headless --path client/godot --import`
  - 显式刷新 import，退出码 `0`；
- Phase351 runtime parity
  - `40/40` import 新鲜，源 PNG 与 Godot 实载 canonical RGBA 一致；
- Phase351 image structure audit
  - QC、运行/源账本和 Phase326 清单全部 `40/40`；
  - 唯一帧 40、重复 0、跨方向镜像 0；
- 去标签方向审核
  - 映射读取前冻结判断，揭示后 `8/8`；
- 晶甲乌力显式 `--auto-pet-action-asset-check`
  - `worldDirections=8`、`worldFrameCount=40`、`runtimeMirroring=false`、`errors=[]`；
- Phase326 MP4 哈希、媒体探测与完整解码；
- JSON parse、SHA 交叉引用、`git diff --check` 与窄范围 diff 审核。

没有运行全量本地 CI：本阶段没有产品代码、协议、服务端、数据库、UI、数值或热路径变更；当前像素、Godot 实载、冻结 QC/账本和去标签语义覆盖本轮风险。

## 当前门禁与下一步

Phase351 后保持：

```text
standaloneWorldSelfReview=passed
standaloneWorldSecondPassBlindSemanticAudit=passed
standaloneWorldOwnerReview=pending
standaloneWorldRuntimeEnabled=false
petBundleOwnerReview=pending
routeAssetGate=deferred
globalEvolutionRuntimeEnabled=false
```

P1.3e 仍不能勾选。项目所有者醒来后仍需本人决定独立世界、整体骑乘世界、Phase340 骑乘战斗及 Phase350 独立战斗的视觉验收；任何正式开放继续先讨论。
