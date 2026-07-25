# Phase 348：月岚风狐人物骑乘战斗整图语义复核

日期：2026-07-26

## 本阶段结论

Phase344 的见习猎人骑月岚风狐双视角战斗候选已完成第二遍运行时语义自审：

- 两个独立战斗视角、12 个动作、180 张 256×256 整体骑乘运行帧继续齐套；
- 当前 PNG、Godot import 与实际 `Texture2D` canonical RGBA `180/180` 一致；
- 当前 180 帧与冻结源账本 decoded RGBA `180/180` 一致；
- 真实 `Main.tscn` 以 `1.00x` 连续覆盖 14 段人物骑乘战斗场景；
- 人物/坐骑比例、整骑连续性、两条实体尾巴、攻击/技能区分、防御/受击区分、回避后撤、反击、负伤归位、直飞/弹飞、倒地与复起均自审通过；
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
  driftfox_evolved_moon_gale_wind7_water3/
    views/{front_3quarter_sw,back_3quarter_ne}/{12 actions}/
    qa/battle/
    source/battle/source-ledger.json
```

不审核或改变：

- Phase343 已有的世界真八方向 `visual_only` 项目所有者批准；
- Phase345 高地风狐→月岚风狐进化演出的项目所有者状态；
- 月岚风狐进化成功路径、材料、石币、成长、技能或等级规则；
- 两条进化路线 asset gate、全局进化开关与普通玩家 UI；
- 单人练级陪练小人的现有规则。

## 当前像素、导入缓存与源账本

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
sourceSetSha256=34b22b2f2818ea26bf6e51064a54545c97edc6561e718895abd5950c5e0a7e63
```

报告：

```text
.run/evidence/phase348_moon_gale_mounted_battle/runtime-parity.json
SHA-256 30c6806f6e0ee1b5009dc8862182fc40e9c57a07d14370ebfdc419d96569763c
```

结构与源账本复核结果：

```text
checkedFrames=180
ledgerRgbaSha256MatchCount=180
uniqueDecodedRgbaFrameCount=164
minimumEdgeMargin=4
duplicatePairCount=16
unexpectedDuplicatePairCount=0
mirroredCrossViewPairCount=0
downReviveReverseExact.front_3quarter_sw=true
downReviveReverseExact.back_3quarter_ne=true
currentDecodedRgbaSetSha256=a65f4b3c32ee79a2357ad19fae86b75fb366028f49ca4cd090c7e7e3ba7a6639
```

164 张唯一像素并不表示缺帧。16 组完全重复全部是两视角各 8 组 `down-1..8` 与 `revive-8..1` 的确定性反向配对；这是“倒地最后一帧与复起第一帧不换模”的既定合同。意外重复为 0，跨视角水平镜像为 0。

结构报告：

```text
.run/evidence/phase348_moon_gale_mounted_battle/image-structure-audit.json
SHA-256 c0d694bd7f77d18a4b5b2ded66c10848e2e95b43a866306c35e79a39c5f61c90
```

冻结证据继续为：

```text
qa/battle/contact-sheet.png
SHA-256 473096a570312306fa47aebb3d92025ac39f7e01d3229f0155323ce42edec0e1

qa/battle/qc-summary.json
SHA-256 83f8a56d69ac25743cf41a377e029e140586431173e76c8b08d2b0b52d83b9f2

source/battle/source-ledger.json
SHA-256 c9a986ef1bd1b179aefbf12648ec1b8c7cebc5275e8f812242525efec9b7cb26
```

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

击飞样本最初使用 96 点审核伤害，但骑乘规则会把 50% 伤害分给坐骑，人物溢出伤害没有达到 18% 最大生命的击飞阈值。只在忽略目录的审核脚本中把样本提高到 180 点后，真实事件链明确得到：

```text
mounted_knockaway_straight:
  actionState=launched
  launchMode=straight

mounted_knockaway_bounce:
  actionState=launched
  launchMode=bounce

mounted_down:
  actionState=down
  launched=false

mounted_counter_ko:
  actionState=down
  launched=false
```

这只是使审核样本跨过现有阈值，没有修改伤害分摊、击飞公式、角色数值或产品代码。

## 动作语义与比例结论

| 动作/结果 | 自审结论 |
| --- | --- |
| `idle / walk` | 成年骑手维持低位稳定落座，人物比例没有忽大忽小；四足步态、骑手随动和两尾随动连续。 |
| `attack` | 人物与坐骑共同压身突进，接触和归位完整，没有拆成两张独立身体。 |
| `skill` | 白蓝贴体风弧与普通攻击轮廓可区分，特效没有脱离主体变成第三条尾巴。 |
| `defend / hurt` | 防御保持承压重心，受击是短促后坐；两者不会互相误读。 |
| `dodge` | 命中前有可见后撤/缩身，并显示回避反馈；没有伤害数字或命中特效。 |
| `counter` | 受击因果、快速反击和回位成立。 |
| `stagger / counter_ko` | 致死反击后先负伤归位，再原位倒下；没有错误触发击飞。 |
| `combo` | 三名完整骑乘人物错峰突进，体量与单体动作保持同档。 |
| `knockaway` | 人骑宠作为一个完整主体翻滚；直飞和场边弹飞轨迹可区分，途中不站起。 |
| `down / revive` | 人骑宠共同伏地并按精确反向帧复起，没有倒地瞬间换模。 |

两个视角均保持：

- 成年见习猎人的人体比例和完整四肢；
- 月岚风狐的珍珠银白、月蓝纹理、长耳毛鳍与恰好两条实体尾巴；
- 人物、坐骑和两尾作为同一张整体骑乘纹理移动；
- 没有观察到运行时分层、人物掉骑、明显穿模、异常小人、跨视角换向或裁切。

## 最终无工具遮挡成片

第一遍大图复核发现空闲展示阶段会重新出现人物指令框和 99 秒计时。它们不是 GM 工具，也不是素材缺陷，但会遮挡审片。因此最终录制仅在临时 capture 脚本中把顶部状态、指令和计时面板设为透明；普通玩家 UI 和产品代码没有变化。

最终成片：

```text
.run/evidence/phase348_moon_gale_mounted_battle/
  Beastbound_Phase348_Moon_Gale_Mounted_Semantic_1x.mp4
  contact-actions-01-07.png
  contact-actions-08-14.png
  godot-movie-final.log
```

录像事实：

- Apple M5（Apple9）Metal 4.0 Forward Mobile；
- 1280×720、60 FPS、2372 帧、39.533333 秒；
- `speedScale=1.00x`，没有 `setpts`、`atempo` 或其他变速；
- H.264 + AAC 48kHz 双声道；
- 音量 `mean=-26.9dB / max=-3.8dB`；
- MP4 SHA-256 `edfb2e1975b6b97091600327d2aea6db4048018aa53e730691ff3ebf8963a390`；
- 全片解码零错误；
- Godot Movie Maker 平均 CPU render `0.06ms/frame`。这是本机离线审片数据，不代表多人容量。

两张逐动作接触表 SHA-256：

```text
contact-actions-01-07.png
82e96291d3509e7cb8a6f151490cde5343494c4801fe7f7184d161381b28dcb2

contact-actions-08-14.png
b6527c71882a8ac64e1f1fb2cb67ce386fc484a81dcec8d62af5637c829e2ebf
```

跟踪语义报告：

```text
qa/battle/semantic-review-v2.json
SHA-256 d73a3e3ad987b50bed5afc65032dceef5936475deeee36ca14feecb6a5df7fc2
```

## 定向验证

执行并通过：

- Phase348 runtime parity：
  - `180/180` import 新鲜；
  - 当前源 PNG 与 Godot 实载 canonical RGBA 一致。
- Phase348 structure audit：
  - `180/180` 与源账本 RGBA 一致；
  - 意外重复 `0`、跨视角镜像 `0`；
  - 两视角 `down ↔ revive` 精确反向。
- 月岚风狐显式 `--auto-mounted-action-asset-check`：
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

1. Phase348 人物骑乘战斗整图 1× 成片；
2. Phase345 高地风狐→月岚风狐进化 1× 成片；
3. 是否进入月岚风狐进化成功路径接入讨论；
4. 两拒两放端到端开放验收。

另有月岚风狐人物骑乘世界真八方向的第二层去标签语义审核尚未补齐；现有 Phase343 `visual_only` 批准不等于正式运行开放。
