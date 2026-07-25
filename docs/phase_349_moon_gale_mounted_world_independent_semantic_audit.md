# Phase 349：月岚风狐人物骑乘世界真八向独立语义审核

日期：2026-07-26

## 本阶段结论

Phase343 已获项目所有者 `visual_only` 批准的“成年见习猎人骑月岚风狐”世界真八方向，现完成第二遍去标签技术盲审：

- 八个方向随机编码为 A–H，只显示每组 `idle + walk 1..4`；
- 在读取编码映射前先冻结方向、比例、坐点、身份和连续性判断；
- 揭示后方向预测 `8/8` 命中；
- 当前 40 张 PNG、Godot import 与实际 `Texture2D` canonical RGBA `40/40` 一致；
- 当前文件/decoded RGBA 与 Phase343 冻结 QC、源账本均 `40/40` 一致；
- 40 张 decoded RGBA 全部唯一，完全重复 `0`、跨方向水平镜像对 `0`；
- 成人骑手比例、低位坐点、人物/坐骑同帧共同起伏、两条实体尾巴与八向步态均通过。

本阶段没有修改任何世界帧、战斗帧、产品代码、玩法规则、数值、服务端、玩家档案或运行时开关。单人练级陪练小人的既有逻辑也没有变化。

## 审批边界

项目所有者已在 Phase343 查看 1280×720、60 FPS、全程 `1.00x` 的真实 `Main.tscn` 连续成片，并明确回复“认可，继续”。其批准范围是：

```text
integrated_mounted_world_true8_visual_only
```

对应历史决定：

```text
qa/world/owner-decision.json
SHA-256 9a7739c009f30fa75d03148a50dbe1f87b0658355a3d816a5cf060ef660aea19
```

`owner-decision.json` 保留批准当时“独立审核 pending”的事实，本阶段不回写或冒充新的项目所有者决定。当前状态是：

```text
selfReview=passed
independentBlindSemanticAudit=passed
ownerReview=approved_visual_only
runtimeEnabled=false
```

这不批准：

- Phase348 人物骑乘战斗候选；
- Phase345 高地风狐→月岚风狐进化演出；
- 进化成功路径或玩家路线开放；
- 月岚风狐整宠 formal；
- 两拒两放端到端验收。

## 去标签盲审

临时忽略目录脚本使用系统随机源打乱八方向，并把方向映射写入单独文件。审片板只显示 A–H 与每组五张连续帧，不显示方向名。

冻结文件：

```text
.run/evidence/phase349_moon_gale_mounted_world_blind/
  blind-contact-8x5.png
  blind-code-mapping.json
  blind-predictions-before-reveal.json
```

哈希：

```text
blind-contact-8x5.png
7c414ce3f55f9d3d17aa4bc72b6f8df124945ed75344851103bf1de3561c2f69

blind-code-mapping.json
83a44e62bbd5788b02523153d65d690e7da7162f9ba06de1f3aa9ecd9bf55b8c

blind-predictions-before-reveal.json
28648e47ef51ea9f86d491d4a19353950654063a118885b946160c9a9be5483f
```

揭示前冻结、揭示后核对的结果完全一致：

| 编码 | 冻结预测 | 揭示方向 |
| --- | --- | --- |
| A | west | west |
| B | southwest | southwest |
| C | northwest | northwest |
| D | east | east |
| E | northeast | northeast |
| F | south | south |
| G | north | north |
| H | southeast | southeast |

## 视觉语义结论

### 方向

- A/D 为严格左右侧向；
- F/G 为严格正背向；
- B/H 可由骑手胸面与坐骑头部共同读为前斜向；
- C/E 可由骑手背面与坐骑头部共同读为后斜向；
- 每组 `idle` 与 `walk 1..4` 没有跨方向误帧。

### 人物骑乘整体

- 40 帧都是人物与坐骑同一张完整透明整图；
- 骑手髋部、双腿、坐垫和坐骑身体共同起伏；
- 没有人物/坐骑分层滑动、运动轴分离或运行时叠层；
- 八向均保持成年见习猎人比例与低位稳定落座；
- 可见宽度变化符合正背、斜向、纯侧透视和双尾展开，没有异常小人、坐骑骤缩或坐点漂移。

### 身份与连续性

- 骑手的发型、橙褐服装和成人身体比例稳定；
- 月岚风狐保持成年银白月蓝体态、紫蓝耳尖、月纹、四足和恰好两条实体尾巴；
- 两条尾巴随步态连续，没有并尾、单尾或额外尾巴；
- 四足交替、身体起伏、坐姿随动和脚底基准连续；
- 未观察到跳尺、裁边、脚底断层或方向中途换模。

## 当前像素、导入缓存、冻结 QC 与源账本

先显式刷新 Godot import，再逐帧比较：

1. 当前 PNG；
2. `.import` 记录的 `source_md5`；
3. 当前 PNG canonical RGBA；
4. `ResourceLoader` 实载 `Texture2D.get_image()` canonical RGBA。

结果：

```text
checkedFrames=40
importFreshCount=40
canonicalRgbaMatchCount=40
errors=0
sourceSetSha256=c6f8fb69bfb560fc249a47020867eaac2c3571a795f0e156d1e039bf1ead9054
```

运行时 parity 报告：

```text
.run/evidence/phase349_moon_gale_mounted_world_blind/runtime-parity.json
SHA-256 a97d29424735df5e46df48ce5718ffdb13211ef1e9c3917e5a99243d9bf7d6d9
```

结构审核：

```text
checkedFrames=40
uniqueDecodedRgbaFrameCount=40
trackedQcFileSha256MatchCount=40
trackedQcRgbaSha256MatchCount=40
sourceLedgerFileSha256MatchCount=40
sourceLedgerDecodedRgbaSha256MatchCount=40
minimumEdgeMargin=14
duplicatePairCount=0
mirroredCrossDirectionPairCount=0
currentDecodedRgbaSetSha256=bffde1694378a8d6519759d3441e3d96ee572b453adad0376f1de796043e9b47
```

结构报告：

```text
.run/evidence/phase349_moon_gale_mounted_world_blind/image-structure-audit.json
SHA-256 ac170042e3ba8fcc2dadec74d7f9bf2dee49b9cf7a345d2473ec62b8c5b11b99
```

更新后的跟踪证据：

```text
qa/world/independent-semantic-audit-v1.json
SHA-256 3a4658a4349728d64efeed63eef1df9b699ff0252684c7263791f06ed81fd5f5

qa/world/world-qc.json
SHA-256 357cf7cdb6019af2414f57cf9bd7608f8ef3b5891618f98ea94c0dc66920b0a1

source/world/source-ledger.json
SHA-256 f2210e8c06e4e66dba7351ba53f6451468a7a090dba687b452555960420e21a0
```

## 动态证据

本阶段不重录内容相同的视频，因为世界帧像素为零修改，Phase343 已有项目所有者接受的真实 `Main.tscn` 1× 连续成片：

```text
.run/evidence/phase343_moon_gale_world/main-client-1x/
  Beastbound_Phase343_Moon_Gale_World_1x.mp4
```

录像仍为 1280×720、60 FPS、17.25 秒、有声、全程 `1.00x`，SHA-256：

```text
2f1c0ff82cf5feb334149cc3444820d2f5ba0929f2b87b500594d6bbf1cad19b
```

Phase349 的盲审板和逐帧实载证明补的是第二层技术门禁，不用重复冒充新的 owner 视频验收。

## 定向验证

执行并通过：

- Godot 显式 editor 重导入；
- Phase349 runtime parity：`40/40` import 新鲜，源 PNG 与 Godot 实载 canonical RGBA 一致；
- Phase349 structure audit：冻结 QC、源账本文件/像素各 `40/40` 一致，唯一帧 40、重复 0、跨方向镜像 0；
- 去标签方向审核：`8/8`；
- 月岚风狐显式 `--auto-mounted-action-asset-check --auto-mounted-action-asset-world-only`：
  - `worldDirections=8`；
  - `worldFrameCount=40`；
  - `runtimeBodyLayerCount=1`；
  - `runtimeLayeredComposition=false`；
  - `requireBattle=false`；
  - `errors=[]`、`ok=true`；
- `node tools/run_godot_auto_checks.mjs --only=--auto-character-mount-art-check --fail-fast`：
  - Godot parse 与人物骑乘美术合同 `2/2` 通过；
- JSON parse、归档哈希、`git diff --check` 与窄范围 diff 审核。

没有运行全量本地 CI：本阶段没有产品代码、协议、服务端、数据库、UI、数值或热路径变更；当前像素、Godot 实载、冻结 QC、源账本和世界资产目录门禁覆盖本轮风险。

## 当前门禁与下一步

Phase349 后：

```text
mountedWorldSelfReview=passed
mountedWorldBlindSemanticAudit=passed
mountedWorldOwnerReview=approved_visual_only
mountedWorldRuntimeEnabled=false
mountedBattleOwnerReview=pending
moonGaleEvolutionOwnerReview=pending
routeAssetGate=deferred
globalEvolutionRuntimeEnabled=false
```

P1.3e 继续未勾选。下一步涉及查看 Phase345/Phase348 成片、决定进化成功路径，以及最终路线开放，这些都需要项目所有者醒来后确认；本阶段不擅自推进产品代码。
