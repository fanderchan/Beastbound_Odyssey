# Phase 346：月岚风狐独立宠物战斗语义复核

日期：2026-07-26

## 本阶段结论

月岚风狐当前独立宠物战斗包已完成第二遍运行时语义复核：

- 两套独立斜向、12 个动作、180 张 256×256 运行帧继续齐套；
- 当前源 PNG、Godot 导入缓存和实际 `Texture2D` 像素 `180/180` 一致；
- 真实 `Main.tscn` 以 `1.00x` 连续跑完 14 个动作导演场景；
- 双尾身份、普通攻击、技能、防御、受击、回避、反击、击飞、昏厥和复起语义均自审通过；
- 本阶段没有修改动作像素、玩法代码、数值、玩家档案、服务端或路线门禁。

这是 Codex 对最终当前运行资产的第二遍语义自审，不是项目所有者验收。项目所有者正在休息、没有观看本次成片，因此 battle 状态只提升为 `independent_semantic_self_review_passed_owner_pending`；`ownerReviewStatus=pending`、`runtimeEnabled=false` 保持不变。

## 审核边界

本轮只审核：

```text
client/godot/assets/pets/driftfox_evolved_moon_gale_wind7_water3/
  views/front_3quarter_sw/{12 actions}/
  views/back_3quarter_ne/{12 actions}/
  qa/battle/
```

不审核或改变：

- Phase343 世界真八向的独立盲审状态；
- Phase344 整体骑乘战斗包的 owner 状态；
- Phase345 进化演出的 owner 状态和正式成功路径；
- 服务端进化事务、材料、石币、P90、成长、技能或玩家档案；
- 全局进化开关、两条路线 asset gate、普通玩家 UI。

## 当前像素与缓存一致性

Phase324 曾暴露过“源 PNG 已更新、Godot 仍读取旧 import 缓存”的风险，因此本轮没有只凭文件存在或旧录像下结论。

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
sourceSetSha256=44c6d77803ea700036fb88028cd893089a67513efc59ffaa1e8203233b19b015
```

报告位于 `.run/evidence/phase346_moon_gale_standalone_battle/runtime-parity.json`，SHA-256 为 `37d9ded8ab0491307d4777d3c09025cb91bb4572b2956223af1c96d064248e67`。

当前 180 帧运行包 digest 继续为：

```text
8417eff751c825c1a177ca5697f0db797cbf638b533d3dc7a31396b4dd84aa9f
```

## 逐动作语义结论

两视角全 180 帧均能追踪同一臀部发出的上下两条大型绒尾；没有一尾、三尾、九尾。技能中的白蓝月牙风弧与身体相连的毛流可与实体尾区分，颈背毛流没有长成翅膀。

| 动作 | 自审结论 |
| --- | --- |
| `idle` | 警戒站姿、呼吸和尾部随动稳定，无体量泵动。 |
| `walk` | 四足步态和双尾随动连续，循环首尾没有换视角或脚底断层。 |
| `attack` | 压身、低位扑击、接触峰值、回收完整；普通攻击轮廓明确。 |
| `skill` | 双尾开合与贴体月牙风弧形成专属技能语言，与普通扑击可区分。 |
| `hurt` | 短促受力、后坐和恢复明确，不会误读为防御或倒地。 |
| `defend` | 压低重心、前肢承压并保持守势，与 `hurt` 的冲击恢复不同。 |
| `dodge` | 先缩身再后撤/侧移，实机同时出现回避反馈并回到记录点；没有命中效果。 |
| `counter` | 受力后快速压身、突进、接触和回撤，三种反击结果的因果连续。 |
| `stagger` | 负伤归位阶段持续失衡、压低重心，没有中途站直或提前完全昏厥。 |
| `knockaway` | 帧内连续翻滚配合直飞/弹飞轨迹，动作中途不站起。 |
| `down` | 单调进入伏地与螺旋眼昏厥，没有血迹、死亡或微笑睡眠表达。 |
| `revive` | 两视角首帧均与 `down-8` 逐 RGBA 相同，随后逐步撑起并站稳。 |

最小运行安全边仍为 11px，真实 10V10 导演未见裁切或异常缩放。敌我继续使用独立正背斜向源资产，经既有展示映射朝向战场中心；本阶段没有通过复制或镜像补帧。

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
- 音量 `mean=-25.6dB / max=-3.9dB`；
- MP4 SHA-256 `4cda9076605f80eb2b514425004ccf02e3ac7bf2aa95a0a93ec9d27aa6ea8c7b`；
- 全片解码零错误；
- Godot Movie Maker 平均 CPU render `0.06ms/frame`。这是本机离线候选审片数据，不代表多人容量。

成片与抽帧位于：

```text
.run/evidence/phase346_moon_gale_standalone_battle/
  Beastbound_Phase346_Moon_Gale_Standalone_Battle_1x.mp4
  action-sequence-contact-14x3.png
  action-midpoint-contact-4x4.png
  godot-movie.log
  runtime-parity.json
```

## 定向验证

执行并通过：

- `python3 tools/audit_pet_battle_catalog.py --form driftfox_evolved_moon_gale_wind7_water3 --require-complete --json`
  - `1/1` 形态完整，`180/180` 帧，`errors=[]`。
- `godot --headless --editor --path client/godot --quit`
  - 显式刷新当前 import。
- `godot --headless --path client/godot --quit -- --auto-pet-action-asset-check --auto-pet-action-asset-form=driftfox_evolved_moon_gale_wind7_water3`
  - `battleActions=12`、`battleFrameCount=180`、`errors=[]`。
- Phase346 runtime parity
  - `180/180` import 新鲜、实际加载 RGBA 一致。
- `node tools/run_godot_auto_checks.mjs --only=--auto-pet-battle-review-lab-check --fail-fast`
  - Godot parse + 动作导演合同 `2/2` 通过；导演覆盖普通攻击、技能、防御、反击、合击、回避、直飞、弹飞、倒地和复起，`errors=[]`。
- MP4 `ffprobe`、音频探测与 `ffmpeg -v error ... -f null -`
  - 帧率、帧数、音轨和全片解码通过。

没有运行全量本地 CI：本阶段没有产品代码、服务端、数据库、协议、UI 或数值变更，窄资产目录、Godot 实际加载、导演合同和真实成片覆盖本轮风险。

## 保留债务与下一步

当前仍有三项不能被本阶段冒充完成：

1. 项目所有者尚未观看 Phase346 成片，因此不能把 battle 标为 owner approved。
2. 历史 48 帧的 512px canonical 与当前 lean ledger RGBA 不一致债务仍在；本轮只证明当前 256px runtime 可用，不能声称重建了新鲜 512px canonical。
3. P1.3e 仍缺月岚风狐世界真八向独立盲审、mounted battle/进化演出的 owner 验收、正式成功路径讨论与两拒两放端到端开放。

因此当前门禁继续为：

```text
battleSemanticSelfReview=passed
battleOwnerReview=pending
battleRuntimeEnabled=false
routeAssetGate=deferred
globalEvolutionRuntimeEnabled=false
```
