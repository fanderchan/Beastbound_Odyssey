# Phase 350：晶甲乌力独立宠物战斗语义复核

日期：2026-07-26

## 本阶段结论

晶甲乌力当前独立宠物战斗包已完成第二遍运行时语义复核：

- 两套独立斜向、12 个动作、180 张 256×256 运行帧继续齐套；
- 当前源 PNG、Godot 导入缓存和实际 `Texture2D` 像素 `180/180` 一致；
- 发现并修正两次既有倒地/复活修复遗漏的 21 条运行帧 RGBA 与 4 条动作 QC 来源账本指纹，运行像素改动为 0；
- 当前运行帧与来源账本 RGBA `180/180` 一致，32/32 修复链终态文件 SHA 一致；
- 真实 `Main.tscn` 以 `1.00x` 连续跑完 14 个动作导演场景；
- 晶甲身份、普通攻击、技能、防御、受击、回避、反击、击飞、昏厥和复起语义均自审通过；
- 本阶段没有修改动作像素、玩法代码、数值、玩家档案、服务端或路线门禁。

这是 Codex 对最终当前运行资产的第二遍语义自审，不是项目所有者验收。项目所有者正在休息、没有观看本次成片，因此 battle 状态只提升为 `independent_semantic_self_review_passed_owner_pending`；`ownerReviewStatus=pending`、`runtimeEnabled=false` 保持不变。

## 审核边界

本轮只审核：

```text
client/godot/assets/pets/wuli_evolved_crystal_earth8_water2/
  views/front_3quarter_sw/{12 actions}/
  views/back_3quarter_ne/{12 actions}/
  source/battle/source-ledger.json
  source/battle/quality-repair-down-revive-*.json
  qa/battle/
```

不审核或改变：

- Phase326 世界真八向的 owner 状态；
- Phase340 整体骑乘战斗包的 owner 状态；
- Phase341 已单项批准的进化动画范围；
- Phase342 正式进化结果契约、成功回调和服务端事务；
- 材料、石币、P90、成长、技能或玩家档案；
- 全局进化开关、两条路线 asset gate、普通玩家 UI。

## 来源账本根因与最小修正

初次结构门禁没有通过：

```text
checkedFrames=180
ledgerRgbaSha256MatchCount=159
staleRuntimeRgbaEntries=21
```

逐项追溯 `051efeb3b` 和 `574151a11` 后确认：

1. 提交 `051efeb3b` 的单调倒地/复起修复已重排当前 PNG，并新增 v1 manifest；
2. 提交 `574151a11` 的 KO 表情修复又对 12 个帧做批准面部区域内的 RGB 修正，并新增 v2 manifest；
3. 两次提交都更新了运行包 digest、动作 `qa.json`、总 QC 和 manifest 引用，却没有更新 `source-ledger.json` 各动作下的 21 条逐帧 `runtimeFrameRgbaSha256` 与 4 条 `qcSha256`；
4. 当前 12 个 KO 帧文件 SHA 全部吻合 v2 `afterSha256`，另外 9 个重排帧全部吻合 v1 `installedSha256`；
5. 当前 PNG、Godot import 和实载 RGBA 本来就是同一组正确终态。

因此本阶段没有回滚图片，也没有重做动作，只校正 21 条运行帧 RGBA 与 4 条动作 QC 账本指纹：

```text
ledgerSha256Before=4c24de683d5bb74780415c9f350c6ded5ad1e2eed22b5c2e9030c8155fbe5088
ledgerSha256After=5d4ecd66597a26b3646855c761efc4bdb7ffc10703cd3aec9e6ee96b91c8fa05
ledgerRgbaSha256MatchCount=180
sourcePromptPipelineQcHashMatchCount=72/72
runtimePixelChanges=0
```

两份 repair manifest 的自身 SHA 与账本引用均吻合；32 个修复链目标的当前文件 SHA `32/32` 命中最终应有值。

初始 `source/battle/install-manifest.json` 没有被改写成当前清单：它在初次安装提交 `8dc6853dd` 上仍可逐文件证明 `307/307`，当前只有 `231/307` 仍相同，其余 76 项由后续两份 repair manifest 明确取代。因此它被保留为真实的“初始安装历史快照”，当前状态则由更新后的 source ledger、两份 repair manifest、QC 与 Phase350 结构报告共同证明。

## 当前像素、结构与缓存一致性

先显式运行 Godot editor 导入，再用临时、未跟踪的 parity 脚本逐帧比较：

1. 当前 PNG 文件 SHA/MD5；
2. `.import` 对应 imported MD5 的 `source_md5`；
3. 当前源 PNG 的 canonical RGBA；
4. `ResourceLoader` 实际得到的 `Texture2D.get_image()` canonical RGBA。

结果：

```text
checkedFrames=180
importFreshCount=180
canonicalRgbaMatchCount=180
errors=0
sourceSetSha256=13c1b7ffd961c1e446d2c8816200fcc056b47fa3e3654df771cbc20924092485
```

报告位于 `.run/evidence/phase350_crystal_wuli_standalone_battle/runtime-parity.json`，SHA-256 为 `1298d0f129a98ab42bad452dee3a5ec81767339c66e31343858a14af07799ce2`。

进一步逐帧结构检查：

```text
ledgerRgbaSha256MatchCount=180
uniqueDecodedRgbaFrameCount=174
minimumEdgeMargin(alpha>=8)=14
duplicatePairCount=8
unexpectedDuplicatePairCount=0
mirroredCrossViewPairCount=0
down8Revive1ExactRgba=true/true
```

8 组完全重复并非漏画：它们都能由 v1/v2 manifest 证明为倒地末段稳定保持、`down-8` 到 `revive-1` 的无缝交接，或背面复起中明确复用同一姿势的停留帧。保守生产 QC 的最小边距仍为 13px。当前 180 帧运行包 digest 继续为：

```text
fd9d81c177de380cb42124811d0a15962821e5d2626a334c6b923b5aec0db30b
```

结构报告位于 `.run/evidence/phase350_crystal_wuli_standalone_battle/image-structure-audit.json`，SHA-256 为 `ad1ac11e91c0d2c62e9e4df5b88e6fcbff0600d553d8f60a8bf1145486121d1f`。

## 逐动作语义结论

| 动作 | 自审结论 |
| --- | --- |
| `idle` | 重甲低伏待机稳定，呼吸与晶甲轻微起伏不造成体量泵动。 |
| `walk` | 短肢承重步态连续，肩背甲与身体一起移动，循环首尾没有脚底断层。 |
| `attack` | 低头蓄力后以前额晶甲和短角前顶，接触峰值与回收明确。 |
| `skill` | 压低全身、晶甲聚亮并做更重的卷身冲击，与普通顶撞可区分。 |
| `hurt` | 短促后坐和受力恢复清楚，不会提前趴成最终昏厥。 |
| `defend` | 进一步压低重心、用额盾和肩甲承压并出现晶光守势。 |
| `dodge` | 缩身后撤/侧移，实机同时显示回避反馈并回到记录点，没有命中反馈。 |
| `counter` | 受力后快速压身、突进顶撞、接触和回撤，三种反击结果因果连续。 |
| `stagger` | 受创失衡逐步压低身体，没有中途站直或提前稳定成最终昏厥。 |
| `knockaway` | 连续翻滚姿势配合直飞/弹飞轨迹，飞行中不站起。 |
| `down` | 单调进入完全瘫软与失焦/螺旋眼，末段稳定保持；没有死亡或睡眠表达。 |
| `revive` | 两视角首帧均与 `down-8` 逐 RGBA 相同，随后逐步撑起并恢复清醒站姿。 |

两视角全 180 帧持续保持低重心成年乌力、棕色短肢、冰蓝额晶、肩背晶甲、短角和水晶尾锤。敌我继续使用独立正背斜向源资产，经既有展示映射朝向战场中心；没有通过复制或镜像补另一视角，真实 10V10 未见裁切、异常缩放或镜像串位。

## 真实 Main.tscn 1× 动态证据

临时 capture 脚本实例化真实 `res://scenes/Main.tscn`，使用正式 `PetBattleReviewLab`、`BattleModel`、事件 ledger、动作目录、战场绘制与游戏音频管理器。它依次覆盖：

```text
attack
defend_hit
hurt
counter
counter_ko
counter_launch
skill
combo
knockaway_straight
knockaway_bounce
dodge
dodge_counter
down
revive
```

录像事实：

- Apple M5（Apple9）Metal 4.0 Forward Mobile；
- 1280×720、60 FPS、2477 帧、41.283333 秒；
- `speedScale=1.00x`，没有 `setpts`、`atempo` 或其他变速滤镜；
- H.264 + AAC 48kHz 双声道；
- 音量 `mean=-25.6dB / max=-4.0dB`；
- MP4 SHA-256 `ccd0a39ddfc69563bbb2e15207d2cfe698c4518436af7e4a6474b43323d32250`；
- 全片解码零错误，Godot 日志零错误；
- Godot Movie Maker 平均 CPU render `0.06ms/frame`。这是本机离线候选审片数据，不代表多人容量。

成片与抽帧位于：

```text
.run/evidence/phase350_crystal_wuli_standalone_battle/
  Beastbound_Phase350_Crystal_Wuli_Standalone_Battle_1x.mp4
  timeline-contact-7x6.png
  action-midpoint-contact-7x2.png
  down-revive-contact-4x2.png
  godot-movie-mobile.log
  runtime-parity.json
  image-structure-audit.json
```

## 定向验证

执行并通过：

- `python3 tools/audit_pet_battle_catalog.py --form wuli_evolved_crystal_earth8_water2 --require-complete --json`
  - `1/1` 形态完整，`180/180` 帧，`errors=[]`。
- `godot --headless --editor --path client/godot --quit`
  - 显式刷新当前 import。
- `godot --headless --path client/godot --quit -- --auto-pet-action-asset-check --auto-pet-action-asset-form=wuli_evolved_crystal_earth8_water2`
  - `battleActions=12`、`battleViews=2`、`battleFrameCount=180`、`errors=[]`。
- Phase350 runtime parity
  - `180/180` import 新鲜、实际加载 RGBA 一致。
- Phase350 image structure/source ledger audit
  - `180/180` 账本 RGBA、`32/32` 修复链、`72/72` prompt/pipeline/QC 来源文件哈希，意外重复 `0`、跨视图镜像 `0`。
- `node tools/run_godot_auto_checks.mjs --only=--auto-pet-battle-review-lab-check --fail-fast`
  - Godot parse + 动作导演合同 `2/2` 通过，`errors=[]`。
- MP4 `ffprobe`、音频探测与 `ffmpeg -v error ... -f null -`
  - 分辨率、帧率、帧数、音轨和全片解码通过。

没有运行全量本地 CI：本阶段没有产品代码、服务端、数据库、协议、UI、数值或运行像素变更，窄资产目录、Godot 实际加载、来源账本、导演合同和真实成片覆盖本轮风险。

## 保留债务与下一步

当前仍有四项不能被本阶段冒充完成：

1. 项目所有者尚未观看 Phase350 成片，因此不能把 battle 标为 owner approved。
2. 战斗包采用 lean archive，完整 512px 源帧不在仓库；本轮只证明当前 256px runtime 和既有修复链，不能声称补齐完整源归档。
3. 晶甲乌力世界真八向、整体骑乘战斗仍需各自做当前运行时第二层语义审核或 owner 验收。
4. P1.3e 仍缺整宠/骑乘/路线 owner 验收、正式开放讨论与两拒两放端到端验证。

因此当前门禁继续为：

```text
battleSemanticSelfReview=passed
battleOwnerReview=pending
battleRuntimeEnabled=false
routeAssetGate=deferred
globalEvolutionRuntimeEnabled=false
```
