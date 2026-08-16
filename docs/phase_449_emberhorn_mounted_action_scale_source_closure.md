# Phase 449：赤角兽整体骑乘动作比例返工与来源闭环

## 当前结论

项目所有者连续指出整体骑乘战斗存在双方朝向错误、关键动作忽大忽小，以及动作虽然存在却不流畅的问题。
朝向已经统一为敌方 `front_3quarter_sw + flipH=true`、我方 `back_3quarter_ne + flipH=true`，两边最终都朝向
战场中心。本阶段继续修复素材侧的真实比例问题：旧核心动作母板在接触／蓄力帧把完整人骑宠主体压得过小，
并非 Godot 统一缩放或阵型几何造成。

现已重制并安装 9 组核心动作、64 张运行帧：

| 视角 | 重制动作 | 帧数 |
|---|---|---:|
| `back_3quarter_ne` | attack、skill、counter、hurt、defend | 36 |
| `front_3quarter_sw` | attack、skill、hurt、defend | 28 |

攻击改成配合引擎位移的原地短促角顶，技能通过身体蓄力和短距离上挑表达强度，防御、受击和反击保持
脚点与镜头尺度稳定。击飞、倒地、复起等后半段动作没有被误判为缩小：逐帧复核确认其高度下降来自翻滚、
伏地和恢复姿态，方向、身份和物理因果连续，因此没有为追求静态等高而破坏动作语义。

这套候选已经达到技术发布门槛，但尚未获得项目所有者对最终成片的明确视觉批准。当前继续保持
`ownerReviewStatus=pending / runtimeEnabled=false`，不生成 owner decision，不开放普通玩家运行路径，也不据此
勾选 P2.2b。

## 正式来源与可重放合同

九组新动作不再依赖临时生成缓存：

- 每个动作目录保存 exact `prompt-used.txt`；
- ImageGen 原始 PNG 与当前生成缓存逐字节相同；
- 原始生成表以 `raw-sheet-lossless.webp` 归档，解码 RGBA 与 PNG 精确相同；
- 实际切帧输入另存 `pipeline-input-lossless.webp`，避免把重排／补边输入伪装成原始生成图；
- `pipeline-meta.json` 完整记录网格、色键、组件选择、共享比例、feet anchor、安全边与重采样参数；
- 从仓库内无损输入重新执行 `build_pet_art_bundle.py`，9/9 组的 512px 源帧与 256px 运行帧均与验收构建逐文件、逐 RGBA 相同；
- 当前安装运行帧又与重放结果 64/64 相同，未用运行图放大冒充高清源图。

来源证明目录：
`client/godot/assets/mounted/novice_hunter_v1/emberhorn_red_fire8_earth2/source/battle/repairs/phase449-mounted-action-scale-source-repair-v1/`。

当前 180 帧统一 digest：
`86a400fa0629c7d75a9a1e258c1fa1ceea724fe29d855232ae1413a2dd162136`。

安装清单现登记 300 个已安装文件、506 个完整来源验证条目，逐文件复核漂移为 0。

## 实机语义与审美判断

最终真实 `Main.tscn` 连续片覆盖 14 段：行进、攻击、技能、防御、受击、反击、致死反击负伤归位、
三骑合击、回避、回避反击、直飞、弹飞、倒地和复起。两侧始终面向战场中心；骑手没有掉鞍、变成小人、
与坐骑分层滑动或在动作中切换视角。

美术判断：

- 体量已回到能支撑“厚重幼年火山角兽”的水平，人与宠的主次关系清楚；
- 普攻、技能、反击不再依赖横向飞扑，避免与引擎接近位移叠加成滑行；
- 防御的低重心、受击的脊背压缩、技能的抬角释放能在小尺寸战场里直接读懂；
- 后半段翻滚与倒地高度变化明显但合理，强行拉成待机等高反而会失去重量和地面接触；
- 当前仍是偏暖、偏厚涂的早期 Beastbound 人物骑乘风格，精细度不是全项目最终天花板，但已是自洽且可运营扩产的正式候选。

## 精确审片证据

- 视频：`.run/evidence/phase449_ember_mounted_battle_owner_review/phase449-ember-actions-v3-main-20260816-e/Beastbound_Phase449_Ember_Actions_v3_Main_1x.mp4`
- 规格：1280×720、60 FPS、2372 帧、39.533333 秒、H.264 + 48 kHz 双声道 AAC、全程 `1.00×`；
- SHA-256：`c4f8e9680ed79fd44238a07ab6c057f977825d13b2dcd63f0a98c8d2559c853c`；
- FFmpeg 全片解码：0 error；
- 后半段静帧与五组完整运行帧联系表位于同目录 `late-review/`；
- 仓库内九组返工联系表：`qa/battle/repairs/phase449-mounted-action-scale-source-repair-v1-contact.png`。

## 验证

```text
Phase449 formal replay
9/9 action bundles exact
64/64 repaired runtime frames exact
180 total runtime frames inventoried
bundle digest 86a400fa0629c7d75a9a1e258c1fa1ceea724fe29d855232ae1413a2dd162136

tools/pet_art_batch_audit.py
mounted errors=[]
mounted pending=[]
mounted battle sourceReadiness=verified
24/24 exact prompts
180/180 validated source-frame hashes
300 installed files / 506 validated source entries

godot --headless --path client/godot --quit
PASS

mounted action asset check, explicit emberhorn_red_fire8_earth2
12 actions / 180 frames / 2 views / errors=[]
enemy front_3quarter_sw + flipH=true
ally back_3quarter_ne + flipH=true
both matchesBattlePet=true

QA user-data lane
attestation=passed
real player inventory hash unchanged
lane cleanup=passed

ffmpeg full decode
PASS
```

全库宠物审计仍会显示同名 standalone pet 的少量历史洋红边提示；这些路径位于
`assets/pets/emberhorn_red_fire8_earth2/`，不属于本次
`assets/mounted/novice_hunter_v1/emberhorn_red_fire8_earth2/` 候选，本 mounted 包自身无 pending 或 error。

## 发布边界

项目所有者确认上述精确视频前，本轮只可视为技术闭环的 owner-review 候选。明确批准后，才可把批准范围
写入独立 owner decision／release attestation，重新验证绑定 SHA，并讨论是否启用普通运行；不能把工程门禁
通过自动解释为审美批准。
