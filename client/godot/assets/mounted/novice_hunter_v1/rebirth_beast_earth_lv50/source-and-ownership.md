# 来源与权属

- 资产：见习猎人骑地灵转生兽前/背三分之四整图关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；两张输入仅作为 Beastbound 自有的地灵转生兽与见习猎人身份参考。
- 宠物参考：`../../../pets/rebirth_beast_earth_lv50/identity/identity-board-transparent.png`；SHA-256 为 `059184f32a3a17f7b02fe0852f4023523b19faf96644c74b882e17555bfa02e6`。
- 人物参考：`../../../characters/novice_hunter/identity/processed/sheet-transparent.png`；SHA-256 为 `7223ed3f753929e35d1960766da589e49b22bc3188866ab5b3ca87493fdff0f2`。
- 每个骑乘姿势均为一次生成的完整人宠主体，没有离线或运行时人物/宠物分层拼接。
- 原始 PNG SHA-256：`fe8a8f9fa3f5637c391b6dc0e7d4f67746dcee008e8e06e3ab5b4626601dc6a8`。
- 原始 PNG 已转存像素无损 WebP：`source/mounted-keypose-raw.webp`；WebP 文件 SHA-256 为 `c546676f3f2ea022d4b173a3b8272df24fef8e63a920a9e5b05d8f4cca6551ab`，解码 RGB 像素哈希与原 PNG 同为 `1b78297e50e33b95d9e39c45677804c0e5f050834e270d4c746767805576a09c`。
- 去色键采用 `remove_chroma_key.py --auto-key border --soft-matte --despill`，随后由 `tools/build_pet_art_bundle.py` 统一比例、feet 基线和 512px 透明关键姿势。
- 透明关键姿势板 SHA-256：`9be899a7576648630f9b686f8cf2d087c722a3520883565ffb7a2f757a6230ac`。生成合同、原图 SHA、无损归档、处理参数和联系表证据均在本目录或 `.run/art_batch_phase320/rebirth_beast/earth/` 留痕。
- 石器时代 8.0 只作为成熟骑乘构图质量参考，不复制其人物、宠物、鞍具、贴图或动画。
- 当前关键姿势工程自评通过，项目所有者视觉验收为 `pending`；不得宣称正式批准。

## 正式战斗整图来源重建（2026-08-16）

- Phase 458 重新生成并冻结 `front_3quarter_sw` 与 `back_3quarter_ne` 两个独立战斗源视角；每个视角覆盖十二个动作，共 180 张 256×256 运行帧。人物、鞍具、缰绳和地灵转生兽始终由一张完整插画表达，不含离线或运行时分层拼装，也不以镜像伪造另一个源视角。
- 正式展示合同为 `enemy=front_3quarter_sw+flipH=true`、`ally=back_3quarter_ne+flipH=true`；真实 `Main.tscn` 录像确认敌方朝右下、我方朝左上，人物与兽体共同面向战场中心。
- 正面行进母表针对旧版单腿感与上下跳帧重新挑选、归一和复验。八帧均为独立步相，前后肢交替，骑手随躯干做小幅同步起伏；上半身相邻帧对齐后最小 IoU 为 `0.907261`，最大质心位移为 `6.574743px × 1.708007px`，未见突然垂直跳格。
- `down` 为可复起昏厥；两个视角的 `down-8 == revive-1` 在 512px 来源 RGBA 与 256px 运行 RGBA 层均精确成立。直线击飞、弹边击飞、倒地和复起全程保持人骑宠整帧一体。
- 仓库采用 lean 归档：24 份 exact prompt、逐动作流水线/QC、两个代表性无损母表、180 个来源帧哈希、180 个运行帧哈希、联系表/GIF、安装清单与来源账本均被跟踪；完整 24 张无损母表及 512px 中间帧保存在 `.run/art_repair_phase458_rebirth_mounted/formal-production-v1/`。
- 当前来源账本为 `source/battle/source-ledger.json`，安装清单为 `source/battle/install-manifest.json`，生成会话与 24 个 generation ID 绑定在 `source/battle/repairs/phase458-rebirth-mounted-full-source-v1/generation-attestation.json`。bundle digest 为 `bec92dff03c6c279d5e9ef33df85542918a7cf53fa32390d4ae6eca22449e1a7`。
- 真实主场景 1× 有声录像位于 `.run/evidence/phase458_rebirth_mounted_full_source/phase458-rebirth-v1-main-20260816-a/Beastbound_Phase458_Rebirth_Mounted_Actions_v1_Main_1x.mp4`，覆盖行进、攻击、技能、防御、受击、反击、合击、回避、击飞、倒地与复起共十四段；MP4 SHA-256 为 `4d4dc0d16c911517274a81851084be8052d188134f64683653dfddc32a2a138a`。
- 本次只重建战斗包，既有真八向世界整图与 2026-07-21 西北待机语义修复均原样保留。当前仍为 `ownerReviewStatus=pending`、`runtimeEnabled=false`；工程与美术自审不能替代项目所有者批准，也不会开放普通玩家入口。

## 西北待机方向语义修复（2026-07-21）

- 原 `world/directions/northwest/idle/idle-1.png` 实际为宠物头朝屏幕右的东北向；同目录四张 `walk` 均为正确背面左上轴，因此没有重命名或镜像旧图，而是以正确西北行走帧和整图身份板为约束，使用 OpenAI 内置图像生成重绘一张独立西北待机整图。
- 新帧中骑手背部可见，人物与地灵转生兽共同朝左上；宠物头在屏幕左、尾在屏幕右。人物、坐骑、鞍位、缰绳和遮挡为一次生成的单一主体，不含离线或运行时分层拼接。
- 原始 PNG 以像素无损 WebP 保存为 `source/formal-production/world-idle-northwest-repair-v1-raw.webp`；逐字提示为 `prompts/production/mounted-world-idle-northwest-repair-v1.txt`，完整哈希、处理参数、旧新源帧/运行帧和证据路径见 `source/formal-production/world-direction-semantic-repair-v1-manifest.json`。
- 透明处理使用同次色键资格判定与 `edge-contract 1`，随后通过项目统一 builder 生成 512px 源帧和 256px 运行帧。运行帧脚底线为 `241`、高度 `124px`、任意 alpha 最小安全边 `13px`、70 色距洋红残边 `0`，没有另一方向的精确重复或镜像匹配。
- 只替换这一张世界待机帧并重建世界联系表/GIF/QC；战斗 PNG 未改。当前仍为 `ownerReviewStatus=pending`、`runtimeEnabled=false`。
