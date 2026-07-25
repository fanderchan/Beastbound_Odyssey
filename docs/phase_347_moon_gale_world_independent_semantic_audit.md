# Phase 347：月岚风狐世界真八向去标签语义复核

日期：2026-07-26

## 本阶段结论

Phase343 已获 `standalone_pet_world_true8_visual_only` 单项批准的月岚风狐独立宠物世界真八向，现补齐第二遍去标签技术语义复核：

- 八个方向随机改为 A–H 编码，先冻结判断、后揭示目录映射，方向命中 `8/8`；
- 当前 40 张源 PNG、Godot import 与实际 `Texture2D` canonical RGBA `40/40` 一致；
- 40 张 decoded RGBA 全部唯一，完全重复帧 `0`、跨方向水平镜像对 `0`；
- 最小安全边 `14px`，与 Phase343 冻结 QC 的文件/像素哈希 `40/40` 一致；
- 成年银白月蓝身份、月纹、长腿、月白颈鬃和两条大尾巴在八向步态中持续成立；
- 本阶段没有修改世界帧、玩法代码、数值、玩家档案、服务端或路线门禁。

这次通过的是 Codex 第二遍去标签技术盲审，不是新的项目所有者决定。项目所有者在 Phase343 已批准独立宠物世界真八向视觉；该批准继续不包含独立战斗、骑乘战斗、进化演出、整宠发布或路线开放，`runtimeEnabled=false` 保持不变。

## 审核边界

本轮只审核：

```text
client/godot/assets/pets/driftfox_evolved_moon_gale_wind7_water3/
  world/directions/{8 directions}/{idle,walk}/
  qa/world/
  source/world/
```

不审核或改变：

- Phase344 月岚风狐整体骑乘战斗候选的 owner 状态；
- Phase345 高地风狐→月岚风狐进化演出的 owner 状态和正式成功路径；
- Phase346 独立宠物战斗包的 owner 状态；
- 服务端进化事务、材料、石币、P90、成长、技能或玩家档案；
- 两条进化路线 asset gate、全局进化开关和普通玩家 UI。

## 去标签方向盲审

临时脚本使用系统随机顺序把八个方向编码为 A–H。审片图只显示每个编码的 `idle + walk 1..4`，真实方向映射单独写入文件；在读取映射前先冻结预测和视觉观察。

冻结预测与揭示结果：

| 编码 | 冻结预测 | 揭示方向 | 结果 |
| --- | --- | --- | --- |
| A | south | south | 通过 |
| B | northwest | northwest | 通过 |
| C | southwest | southwest | 通过 |
| D | southeast | southeast | 通过 |
| E | northeast | northeast | 通过 |
| F | north | north | 通过 |
| G | west | west | 通过 |
| H | east | east | 通过 |

结果为 `8/8`。正面、背面、两个纯侧向和四个斜向均能只凭主体朝向辨认，不依赖目录名。

盲审冻结证据位于：

```text
.run/evidence/phase347_moon_gale_world_blind/
  blind-contact-8x5.png
  blind-code-mapping.json
  blind-predictions-before-reveal.json
```

对应 SHA-256：

```text
blind-contact-8x5.png
a6dc55bd16a909cefd89a88d971db2e5c3fbc96db12ec9e839dd0587881378e2

blind-code-mapping.json
d8ddb3ecb310fd9b1611b867db14f2516eb5f17f5e3a1d6d4a7955dffc430706

blind-predictions-before-reveal.json
7ae126204c768cb1a20612b73bcde6ec90439faef065ef4abc07618ebff7a978
```

## 身份与步态语义

逐方向结论：

- `south` / `north`：正背关系明确；正背遮挡时，两条尾巴仍能在同一 walk 序列中追踪尾根和末梢；
- `west` / `east`：两个相反纯侧向明确，头胸与尾部朝向没有互换；
- `southwest` / `southeast`：两个前斜向明确，脸部、胸鬃与四肢落点保持面向；
- `northwest` / `northeast`：两个背斜向明确，后脑、背线、臀部和尾根关系连续。

八条序列都保持：

- 成年银白月蓝风狐，而非普通风狐换色或幼体；
- 同一尾根发出的两条大尾巴，没有单尾、并尾、三尾或九尾化；
- 肩背毛鳍贴体且克制，没有读成翅膀或脱体风效；
- `idle` 与 `walk 1..4` 朝向一致，前后肢交替和身体起伏连续；
- 没有跨方向跳帧、异常缩放、脚底断层或方向标签与画面相反。

## 当前文件、独立性与 Godot 实载像素

结构复核重新读取当前 40 张 PNG，并与 Phase343 跟踪 QC 逐文件比较：

```text
checkedFrames=40
uniqueDecodedRgbaFrameCount=40
trackedQcFileSha256MatchCount=40
trackedQcRgbaSha256MatchCount=40
minimumEdgeMargin=14
duplicatePairCount=0
mirroredCrossDirectionPairCount=0
```

结构报告位于 `.run/evidence/phase347_moon_gale_world_blind/image-structure-audit.json`，SHA-256 为：

```text
30e66fc7f8de4ed5da8a7abb9d82fa8b25f5c3beba7195371668a1be36e6e6d9
```

随后显式运行 Godot editor 导入，再逐帧比较：

1. 当前源 PNG；
2. `.import` 对应 imported MD5 的 `source_md5`；
3. 当前源 PNG canonical RGBA；
4. `ResourceLoader` 实际得到的 `Texture2D.get_image()` canonical RGBA。

结果：

```text
checkedFrames=40
importFreshCount=40
canonicalRgbaMatchCount=40
errors=0
sourceSetSha256=0e6e34e5c099d6e5efdee727e3adbdc1e8509f71b8bbf0a3cd5ae7cca8bde75c
```

运行时 parity 报告位于 `.run/evidence/phase347_moon_gale_world_blind/runtime-parity.json`，SHA-256 为：

```text
0d3eb06c33d73fa590bc191478da9ad53e7af26d95d2adc5ee951ad617412682
```

## 动态证据与审批快照

本阶段没有改任何世界帧，因此没有重复录制一条内容相同的新视频。继续复用项目所有者在 Phase343 已观看并接受的真实 `Main.tscn` 1× 连续成片：

```text
.run/evidence/phase343_moon_gale_world/main-client-1x/
  Beastbound_Phase343_Moon_Gale_World_1x.mp4

SHA-256
2f1c0ff82cf5feb334149cc3444820d2f5ba0929f2b87b500594d6bbf1cad19b
```

该片为 1280×720、60 FPS、17.25 秒、有声、`speedScale=1.0`，全片解码通过。

`qa/world/owner-decision.json` 保留为批准当时的历史快照，没有被本阶段改写。文件中的 `independentSemanticAuditStatus=pending` 表示作出视觉批准时的事实；当前技术门禁结果记录在新文件 `qa/world/independent-semantic-audit-v1.json`，其 SHA-256 为：

```text
67a0943dc8ae058ffaeeb65ffcd6bab78d48329010fbbd4f70d515921059533f
```

## 定向验证

执行并通过：

- `godot --headless --editor --path client/godot --quit`
  - 显式刷新当前 import，退出码 `0`。
- Phase347 runtime parity
  - `40/40` import 新鲜、源图与 Godot 实载 canonical RGBA 一致。
- Phase347 image structure audit
  - `40/40` 与冻结 QC 文件/像素哈希一致，40 张唯一，重复 `0`、跨方向镜像对 `0`。
- 去标签方向盲审
  - 映射揭示前冻结预测，方向 `8/8`。
- 宠物动作资产检查
  - 世界八方向、40 帧与既有战斗动作合同继续通过，`errors=[]`。
- JSON、SHA 与 `git diff --check`
  - 跟踪证据、账本与 action meta 交叉引用一致。

没有运行全量本地 CI：本阶段没有产品代码、服务端、数据库、协议、UI、热路径或数值变更；当前 PNG、Godot 实载像素、结构独立性和语义盲审覆盖本轮风险。

## 当前门禁与下一步

当前只更新为：

```text
standaloneWorldSelfReview=passed
standaloneWorldIndependentBlindSemanticAudit=passed
standaloneWorldOwnerReview=approved_visual_only
standaloneWorldRuntimeEnabled=false
petBundleOwnerReview=pending
routeAssetGate=deferred
globalEvolutionRuntimeEnabled=false
```

P1.3e 仍不能勾选。后续需要项目所有者本人查看并决定：

1. Phase344 月岚风狐整体骑乘战斗 1× 成片；
2. Phase345 高地风狐→月岚风狐进化 1× 成片；
3. 是否进入进化成功路径接入讨论；
4. 两拒两放端到端开放验收。
