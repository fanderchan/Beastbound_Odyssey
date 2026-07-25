# Phase 352：晶甲乌力人物骑乘战斗整图语义复核

日期：2026-07-26

## 本阶段结论

Phase340 的成年见习猎人骑晶甲乌力双视角战斗候选已完成第二遍运行时语义自审：

- 两个独立战斗视角、12 个动作、180 张 256×256 整体骑乘运行帧继续齐套；
- 当前 PNG、Godot import 与实际 `Texture2D` canonical RGBA `180/180` 一致；
- 当前 180 帧与冻结源账本 decoded RGBA `180/180` 一致；
- 来源 prompt/pipeline/QA `72/72`、代表性无损源 `2/2`、安装清单 `307/307` 一致；
- 真实 `Main.tscn` 以 `1.00x` 连续覆盖 14 段人物骑乘战斗场景；
- 人物/坐骑比例、整骑连续性、肩堡后坐点、攻击/技能区分、防御/受击区分、回避后撤、反击、负伤归位、直飞/弹飞、倒地与复起均自审通过；
- 本阶段没有修改动作像素、玩法代码、数值、服务端、玩家档案、路线门禁或运行时开关。

这是 Codex 对当前候选的技术与语义自审，不是项目所有者验收。项目所有者正在休息、没有观看本次成片，因此 battle 状态只更新为：

```text
independent_semantic_self_review_passed_owner_pending
```

`ownerReviewStatus=pending`、`runtimeEnabled=false` 和各动作的 `owner_review_pending` 均保持不变。

## 审核边界

本轮只复核：

```text
client/godot/assets/mounted/novice_hunter_v1/
  wuli_evolved_crystal_earth8_water2/
    views/{front_3quarter_sw,back_3quarter_ne}/{12 actions}/
    qa/battle/
    source/battle/source-ledger.json
    source/battle/install-manifest.json
```

不审核或改变：

- 晶甲乌力独立宠物、完整骑乘世界、骑乘战斗或整宠的项目所有者批准状态；
- Phase342 已单项批准的 `evolution_visual_only` 历史范围；
- 高防乌力→晶甲乌力的材料、石币、成长、技能、等级或成功路径规则；
- 两条进化路线 asset gate、全局进化开关与普通玩家 UI；
- 单人练级陪练小人的现有规则。

## 当前像素、导入缓存与来源

显式刷新 Godot import 后，临时未跟踪脚本逐帧比较：

1. 当前 PNG；
2. `.import` 记录的 `source_md5`；
3. 当前 PNG canonical RGBA；
4. `ResourceLoader` 实载 `Texture2D.get_image()` canonical RGBA。

结果：

```text
checkedFrames=180
importFreshCount=180
canonicalRgbaMatchCount=180
errors=0
sourceSetSha256=873e552e6a7b6da18a18e8fa8b94a62d9bc18fcdd5d016a02b750bf773b77ef6
```

报告：

```text
.run/evidence/phase352_crystal_wuli_mounted_battle/runtime-parity.json
SHA-256 ede0aa3ca1250be7cf1d076e6c8c878bbc199807aea8e42b7f66a8b12451f3c3
```

结构与来源账本复核：

```text
checkedFrames=180
ledgerRgbaSha256MatchCount=180
runtimeFrameSizeMatchCount=180
uniqueDecodedRgbaFrameCount=164
minimumEdgeMargin=4
sourceProvenanceFileHashMatchCount=72/72
representativeRawFileHashMatchCount=2/2
representativeRawRgbaHashMatchCount=2/2
installManifestFileHashMatchCount=307/307
duplicatePairCount=16
unexpectedDuplicatePairCount=0
mirroredCrossViewPairCount=0
downReviveReverseExact.front_3quarter_sw=true
downReviveReverseExact.back_3quarter_ne=true
currentDecodedRgbaSetSha256=b8ce1b32ec271bc190891303624f71822c29d6e4c3a32a84b74c970a333a899f
```

164 张唯一像素不表示缺帧。16 组完全重复全部是两视角各 8 组 `down-1..8` 与 `revive-8..1` 的确定性反向配对；这是“从当前倒地姿势连续复起、不瞬间换模”的既定合同。意外重复为 0，跨视角水平镜像为 0。

结构报告：

```text
.run/evidence/phase352_crystal_wuli_mounted_battle/image-structure-audit.json
SHA-256 b6aec937cd780f4b6cbfccfaef2d46a6f745dfa6a4e9d92538e47197b5d49efb
```

冻结证据：

```text
qa/battle/contact-sheet.png
SHA-256 aed3935da5ccfa636c4222c59b015f9b86eb87d4eace4b3aacc834eee98272f9

qa/battle/qc-summary.json
SHA-256 10fb881d1c0cf980d8c2e81e291dee685545850085682f7ed07f611ab528dfc8

source/battle/source-ledger.json
SHA-256 443b011293592ba9be452111f28e1a2b908960cab231431ec85afda387c2ec26

source/battle/install-manifest.json
SHA-256 eaa0ad8022aa3a400252a34e2b5460d99e9f42f6a398e652a15b82707a9f73b5
```

仓库仍采用 Phase340 的 lean 归档：当前运行帧、完整逐帧账本、24 组来源记录和 2 份代表性无损源在库，完整 512px 生产归档仍在忽略目录。本阶段不把代表性源误称为完整源帧归档。

## 真实 Main.tscn 1× 动态复核

临时 capture 脚本实例化真实 `res://scenes/Main.tscn`，启用待审组合的 QA 预览目录，并复用正式：

- `BattleModel`；
- `PetBattleReviewModel`；
- `MountedCharacterAssetCatalog`；
- `MountedBattlePresentationModel`；
- 战场绘制与游戏音频管理器。

连续覆盖：

```text
01 mounted_walk
02 mounted_attack
03 mounted_skill
04 mounted_defend_hit
05 mounted_hurt
06 mounted_counter
07 mounted_counter_ko
08 mounted_combo
09 mounted_dodge
10 mounted_dodge_counter
11 mounted_knockaway_straight
12 mounted_knockaway_bounce
13 mounted_down
14 mounted_revive
```

其中 12 段走正式事件队列；`mounted_walk` 与 `mounted_revive` 因当前没有对应的权威战斗事件，只用正式动作目录逐帧展示，没有冒充服务端事件。

真实事件结果明确得到：

```text
mounted_counter_ko:
  state=down
  hp=0
  launched=false

mounted_knockaway_straight:
  state=launched
  launchMode=straight

mounted_knockaway_bounce:
  state=launched
  launchMode=bounce

mounted_down:
  state=down
  launched=false
```

审核脚本只构造覆盖现有边界的样本，没有修改伤害分摊、击飞公式、角色数值或产品代码。

## 动作语义与比例结论

| 动作/结果 | 自审结论 |
| --- | --- |
| `idle / walk` | 成年骑手维持肩堡后方的稳定低位坐点；人物比例不忽大忽小，四足步态与骑手随动连续。 |
| `attack` | 人物与坐骑共同压身突进、接触和归位，主体始终是一张完整骑乘纹理。 |
| `skill` | 冰蓝晶光与更重的压身爆发能和普通攻击区分，特效没有脱离主体。 |
| `defend / hurt` | 防御使用肩堡与额晶承压，受击是短促后坐；两者不会互相误读。 |
| `dodge` | 命中前有可见后撤/缩身并显示回避反馈；没有伤害数字或命中特效。 |
| `counter` | 受击因果、快速反击和回位成立。 |
| `stagger / counter_ko` | 致死反击后先负伤归位，再原位倒下；没有错误触发击飞。 |
| `combo` | 三名完整骑乘人物错峰突进，人物和坐骑体量与单体动作同档。 |
| `knockaway` | 人骑宠作为一个完整主体翻滚；直飞和场边弹飞轨迹可区分，途中不站起。 |
| `down / revive` | 人骑宠共同伏地并按精确反向帧复起，没有倒地瞬间换模。 |

两个视角均保持：

- 成年见习猎人的完整四肢和稳定比例；
- 晶甲乌力的冰蓝额晶、肩堡、背甲和水晶尾锤身份；
- 人物、坐骑作为同一张整体骑乘纹理移动；
- 没有观察到运行时分层、人物掉骑、晶体穿入人物、跨视角换向或明显裁切。

## 最终无工具遮挡成片

最终录制只在临时 capture 脚本中隐藏顶部状态、指令和计时面板；普通玩家 UI 和产品代码没有变化。

```text
.run/evidence/phase352_crystal_wuli_mounted_battle/
  Beastbound_Phase352_Crystal_Wuli_Mounted_Semantic_1x.mp4
  timeline-contact-7x6.png
  action-midpoint-contact-7x2.png
  godot-movie.log
```

录像事实：

- Apple M5（Apple9）Metal 4.0 Forward Mobile；
- 1280×720、60 FPS、2372 帧、39.533333 秒；
- `speedScale=1.00x`，没有 `setpts`、`atempo` 或其他变速；
- H.264 + AAC 48kHz 双声道；
- 音量 `mean=-26.9dB / max=-3.8dB`；
- MP4 SHA-256 `b195b5a3bd0ebf54967f7c00e591e2faa2cbb60b9387afd946bf14a8f1bd2f85`；
- 全片解码零错误；
- Godot Movie Maker 平均 CPU render `0.07ms/frame`。这是本机离线审片数据，不代表多人容量。

两张时间线证据 SHA-256：

```text
timeline-contact-7x6.png
5de920f3fd8fd4234ed3e6c3b0c95e1c37265c765ef3ffeedd2827ab1d879849

action-midpoint-contact-7x2.png
ec3657b80db9aa61afe8357b4a0d8cb998e711e51b39a00200f1e22548103334
```

跟踪语义报告：

```text
qa/battle/semantic-review-v2.json
SHA-256 6923857e32a44ed92eac4e1888dd53de7ad52b2d75168a4c1165ff44a112de0d
```

## 定向验证

执行并通过：

- Phase352 runtime parity：
  - `180/180` import 新鲜；
  - 当前源 PNG 与 Godot 实载 canonical RGBA 一致。
- Phase352 structure audit：
  - `180/180` 与源账本 RGBA 一致；
  - prompt/pipeline/QA `72/72`、代表性无损源 `2/2`、安装清单 `307/307`；
  - 意外重复 `0`、跨视角镜像 `0`；
  - 两视角 `down ↔ revive` 精确反向。
- 晶甲乌力显式 `--auto-mounted-action-asset-check`：
  - `battleActions=12`；
  - `battleViews=2`；
  - `battleFrameCount=180`；
  - `runtimeBodyLayerCount=1`；
  - `runtimeLayeredComposition=false`；
  - `errors=[]`、`ok=true`。
- `node tools/run_godot_auto_checks.mjs --only=--auto-pet-battle-review-lab-check --fail-fast`：
  - Godot parse 与战斗导演合同 `2/2` 通过。
- MP4 `ffprobe`、音频探测与完整 `ffmpeg` 解码：
  - 分辨率、帧率、时长、音轨和全片解码通过。
- JSON parse、交叉 SHA 与 `git diff --check`。

没有运行全量本地 CI：本阶段没有产品代码、服务端、数据库、协议、UI、热路径或数值变更；当前像素、Godot 实载、正式动作目录、战斗导演合同和真实成片覆盖本轮风险。

## 当前门禁与下一步

当前只更新为：

```text
mountedBattleSemanticSelfReview=passed
mountedBattleOwnerReview=pending
mountedBattleRuntimeEnabled=false
routeAssetGate=deferred
globalEvolutionRuntimeEnabled=false
```

P1.3e 仍不能勾选。后续需要项目所有者本人查看并决定：

1. Phase352 人物骑乘战斗整图 1× 成片；
2. 是否扩大晶甲乌力整宠/骑乘包的批准范围；
3. 两条进化路线 asset gate 与正式开放路径；
4. 两拒两放端到端开放验收。

另有晶甲乌力人物骑乘世界真八方向的第二层去标签语义审核尚未补齐；现有 Phase326 工程自审不等于项目所有者批准或正式运行开放。
