# Phase 341：高防乌力→晶甲乌力进化演出候选

日期：2026-07-26

## 用户决定与本阶段边界

项目所有者确认现有晶甲乌力外形适合继续制作。本阶段据此完成高防乌力到晶甲乌力的正面进化动画候选，并提供真实客户端 1× 动态证据。

本阶段只增加美术、来源记录、质量记录与本地审片证据，不修改：

- 服务端进化事务、P90 门槛、掉落、材料或石币数量；
- 玩家确认流程、GM 样本或玩家档案；
- `main.gd`、正式进化成功回调或普通玩家 UI；
- 晶甲乌力与进化路线的 `runtimeEnabled=false` 门禁。

因为项目所有者要求后续代码修改先讨论，本轮没有自行接入正式成功路径。录像脚本只存在于忽略目录 `.run/evidence/phase341_crystal_wuli_evolution/`，实例化真实 `Main.tscn` 做候选审片，不属于产品代码。

## 演出合同

- 源形态：`wuli_normal_tough_earth10`（高防乌力）。
- 目标形态：`wuli_evolved_crystal_earth8_water2`（晶甲乌力）。
- 视角：`front_3quarter_sw`。
- 帧数与节奏：12 帧、12 FPS、单次 1.000 秒、不循环。
- 运行帧：256×256；源帧：512×512。
- 演出语义：
  1. 高防乌力岩甲裂隙亮起，地脉能量汇聚；
  2. 青蓝晶簇从额盾、肩堡、背甲与尾端实体长出；
  3. 琥珀眼逐步转为冰蓝眼，晶核定型并收光落稳。
- 连续性：每格只有一只宠物，不用两个形态交叉淡化；低重心、四足落点、耳朵、獠牙和乌力血统保持连续。

该演出不加入现有 battle action 列表，也不冒充 `idle / walk / attack / defend / skill / hurt / defeat`；正式成功路径的接入方式需要另行讨论。

## 原创生产与确定性处理

动画由 Codex 内置 `image_gen` 分两张 2×3 sheet 生成。输入只包含 Beastbound 自有的高防乌力、晶甲乌力身份板、晶甲乌力正式正面 idle 和纯几何排版参考；未使用 StoneAge/SA80、其他游戏或第三方宠物素材，也未使用 CLI/API 降级生成。

完整记录位于：

```text
client/godot/assets/pets/wuli_evolved_crystal_earth8_water2/
  prompts/evolution-phase-a.txt
  prompts/evolution-phase-b.txt
  source/evolution/raw/
  source/evolution/frames/
  source/evolution/source-ledger.json
  source/evolution/pipeline-meta.json
  views/front_3quarter_sw/evolution/
  qa/evolution/contact-sheet.png
  qa/evolution/evolution.gif
  qa/evolution/qc-summary.json
```

两张原始 sheet 只按时间顺序无损纵向拼为 4×3，再由 `tools/build_pet_art_bundle.py` 做色键清理、切格、共同比例、脚底锚定和统一的 512→256 派生；没有程序重画身体或把两只宠物拼成一帧。

确定性指标：

- 12/12 张 512px 源帧与 12/12 张 256px 运行帧已归档；
- 全序列共同比例 `0.787530196`；
- 最大可见尺寸漂移 `0.091364`；
- 运行帧最小安全边距 6px；
- 源帧与运行帧残留洋红像素最大值均为 0；
- 运行包 RGBA digest：`bc7a51868b2b9753e7fd6a42bf8bec2be569a2d6248948dc0ba8f21d50f5c8cb`。

## 真实 Main.tscn 1× 动态证据

Godot 4.7 先显式导入 12 张新运行图，再由临时 QA capture 脚本实例化真实 `res://scenes/Main.tscn`，使用游戏音频管理器和月夜岩台战场背景录制：

```text
.run/evidence/phase341_crystal_wuli_evolution/
  Beastbound_Phase341_Crystal_Wuli_Evolution_1x.mp4
  phase341-evolution-start.png
  phase341-evolution-mid.png
  phase341-evolution-final-video.png
  godot-movie.log
```

录像事实：

- Apple M5（Apple9）Metal 4.0 Forward Mobile；
- 1280×720、60 FPS、480 帧、8.000 秒；
- 两次完整进化均为 12 帧 × 每帧 5 个视频帧，即严格 12 FPS / `1.00x`；
- 转码未使用 `setpts`、`atempo` 或其他变速滤镜；
- H.264 + AAC 48kHz 双声道，音轨 `mean=-30.8dB / max=-10.3dB`；
- MP4 大小 1,397,490 bytes，SHA-256 `5199e8f84d1f75ace6d26d9bfe7b9b02a45be69f41517ff5d9f4d0e1da84e276`；
- `ffprobe` 得到 480/480 帧，`ffmpeg -v error ... -f null -` 全片解码零错误；
- Movie Maker 报告平均 CPU render `0.12ms/frame`；这只是本机离线候选审片数据，不代表正式运行开销或多人容量。

关键画面自审确认：开始、中段、完成态均没有画布裁切、突然缩放、脚底跳动或双宠重影；高防乌力到晶甲乌力的身份变化可连续辨认。

## 定向验证

执行并通过：

- JSON 解析、12 张源帧/12 张运行帧计数及本地/全局 `runtimeEnabled=false` 静态门禁；
- `node .agents/skills/design-beastbound-pets/scripts/inspect_pet_design.mjs --check`：`errors=0`，保留 1 条既有公开投影 warning；
- 晶甲乌力单形态 inspector；
- `validate_pet_design_spec.mjs .run/pet-design/p1_3b_crystal_wuli_evolution.json`；
- `node tools/battle_action_catalog_check.mjs`；
- `node tools/pet_evolution_route_audit.mjs --samples 10000`：两路线 `errors=0`；
- `godot --headless --path client/godot --quit`；
- 显式晶甲乌力 `--auto-pet-action-asset-check`：`battleActions=12`、`battleFrameCount=180`、`errors=[]`。

未运行全量本地 CI：本阶段没有服务端、数据库、协议、玩家 UI 或正式运行路径代码变化，窄范围资产/目录/路线/Godot 门禁足以覆盖本轮风险。

## 当前结论与后续

项目所有者查看上述 1× 成片后确认“看起来很好”并同意继续开发。该反馈现记录为进化视觉单项批准：

```text
selfReview=passed
ownerReview=approved
runtimeEnabled=false
approvalScope=evolution_visual_only
```

P1.3e 不能勾选，原因仍包括：

- 单项视觉批准不代表整只晶甲乌力动作包、骑乘包或正式进化路线批准；
- 正式成功路径仍须独立实现并通过“服务端成功且权威档案已应用才播放”的运行门禁；
- 月岚风狐的正式全套资产与进化演出尚未完成；
- 两条路线仍未完成两拒两放端到端开放验收；
- P1.3e 要求的两只进化宠完整动作、manifest、实机可读性与正式开放门禁尚未全部收口。

后续 Phase342 已在不开放路线的前提下，把这段单项批准动画接入“明确服务端成功且权威档案已应用后”的通用演出播放器；运行合同与新的 1× 实机证据见 `docs/phase_342_crystal_wuli_evolution_runtime_presentation.md`。
