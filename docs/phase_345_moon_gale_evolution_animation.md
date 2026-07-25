# Phase 345：高地风狐→月岚风狐进化演出候选

日期：2026-07-26

## 用户授权与本阶段边界

项目所有者表示正在休息、无法检查核对，并授权在自审无问题的前提下继续推进项目。本阶段据此完成高地风狐到月岚风狐的正面进化动画候选、确定性归档和真实客户端 1× 动态证据。

无法实时验收不等于项目所有者批准。本阶段最高状态固定为 `self_review_passed_owner_pending`，没有代替所有者签署视觉决定。

遵照此前“代码修改先讨论”的要求，本阶段没有修改：

- 服务端进化事务、P90 门槛、掉落、材料、石币或成长/技能规则；
- 玩家确认、GM 样本、玩家档案或 MySQL；
- `main.gd`、正式进化成功回调、播放器或普通玩家 UI；
- 月岚风狐、进化视觉、路线 asset gate 或全局进化的 `runtimeEnabled=false` 门禁。

录像脚本只存在于忽略目录 `.run/evidence/phase345_moon_gale_evolution/`，用于实例化真实 `Main.tscn` 做候选审片，不属于产品代码。

## 演出合同

- 源形态：`driftfox_highland_wind9_earth1`（高地风狐）。
- 目标形态：`driftfox_evolved_moon_gale_wind7_water3`（月岚风狐）。
- 固定视角：`front_3quarter_sw`。
- 12 帧、12 FPS、1.000 秒、不循环。
- 512×512 源帧；256×256 运行帧。
- 第 1–4 帧保留沙金长腿、单条风带尾、每耳两枚耳羽、三角额纹和侧风楔。
- 第 4–6 帧从同一尾根连续形成上下两条实体尾；不使用双宠交叉淡化、浓雾、巨型光效或瞬间换模跳过解剖变化。
- 第 7–11 帧完成成年深胸长背、月白颈鬃、银白月蓝毛色、深青眼、新月纹、每耳两枚附着毛鳍和双尾开放月牙负形。
- 第 12 帧落稳为月岚风狐正式正面 ready pose。

全程每格只有一只四足风狐；不得出现三尾/九尾、翼状毛鳍、脱离身体的风带、跨格、缩放泵动或脚底跳动。

## 原创生产与确定性处理

两张 2×3 原始 sheet 均由 Codex 内置 `image_gen` 原创生成。输入只包含 Beastbound 自有的高地风狐/月岚风狐身份板、正式正面 idle 和纯几何排版参考；未使用 StoneAge、SA80、其他游戏或第三方宠物素材，也未使用 CLI/API 降级生成。

完整记录位于：

```text
client/godot/assets/pets/driftfox_evolved_moon_gale_wind7_water3/
  prompts/evolution-animation-contract.md
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
  qa/evolution/owner-decision.json
```

第一张原稿是 1536×1024，第二张为 1537×1023。合并前只在第二张远离主体的色键边界裁去最右 1px、底部补 1px `#FF00FF` 色键行，再按时间顺序纵向合成 1536×2048 的 4×3 grid。之后由 `tools/build_pet_art_bundle.py` 做色键、切格、全序列共同比例、脚底锚定、透明清理与 512→256 派生；没有程序重画身体。

确定性指标：

- 12/12 张 512px 源帧与 12/12 张 256px 运行帧已归档；
- 全序列共同比例 `0.6005847327`；
- 最大可见尺寸漂移 `0.085308`；
- 运行帧最小安全边距 6px；
- 最大脱体组件比为 0；
- 源帧与运行帧残余洋红像素最大值均为 0；
- 运行包 RGBA digest 为 `daba0e310c76c165ccac511d15366b3db40a792c80b52cbbd44dee7402549187`。

## 真实 Main.tscn 1× 动态证据

Godot 4.7 显式导入 12 张新运行图后，由临时 QA capture 脚本实例化真实 `res://scenes/Main.tscn`，使用游戏音频管理器和月夜岩台战场背景录制：

```text
.run/evidence/phase345_moon_gale_evolution/
  Beastbound_Phase345_Moon_Gale_Evolution_1x.mp4
  phase345-evolution-start.png
  phase345-evolution-mid.png
  phase345-evolution-final-video.png
  godot-movie.log
```

录像事实：

- Apple M5（Apple9）Metal 4.0 Forward Mobile；
- 1280×720、60 FPS、480 帧、8.000 秒；
- 两次完整进化均为 12 帧 × 每帧 5 个视频帧，即严格 12 FPS / `1.00x`；
- 转码未使用 `setpts`、`atempo` 或其他变速滤镜；
- H.264 + AAC 48kHz 双声道，音轨 `mean=-30.8dB / max=-10.3dB`；
- MP4 大小 1,209,309 bytes，SHA-256 `2e371c0105d330202430e4162af2c4b925cd49969e1c6ac281cac347c4f2f633`；
- `ffprobe` 得到 480/480 帧，`ffmpeg -v error ... -f null -` 全片解码零错误；
- Movie Maker 报告平均 CPU render `0.14ms/frame`。这是本机离线候选审片数据，不代表正式运行开销或多人容量。

关键画面自审确认：开始态为单尾沙金高地风狐，第 5 帧已能从同一臀部追踪上下两尾，中后段始终保持两尾且无第三尾，结束态的成年银白体量、月白颈鬃和开放月牙负形清楚可读；没有画布裁切、脚底漂移、双宠重影或毛鳍长成翅膀。

## 定向验证与当前结论

执行并通过：

- JSON 解析、12 张源帧/12 张运行帧计数、RGBA digest 和全部记录 SHA 复核；
- Godot 编辑器显式导入 12 张运行图；
- `godot --headless --path client/godot --quit`；
- 月岚风狐单形态 Pet Design Inspector；
- Pet Design Contract 校验；
- `node tools/battle_action_catalog_check.mjs`；
- `node tools/pet_evolution_route_audit.mjs --samples 10000`；
- 真实 `Main.tscn` 1× 录像、视频/音频探测与全片解码。

未运行全量本地 CI：本阶段没有服务端、数据库、协议、玩家 UI或正式运行路径代码变化，窄范围资产、目录、路线和 Godot 门禁覆盖本轮风险。

当前只可登记：

```text
selfReview=passed
ownerReview=pending
runtimeEnabled=false
approvalScope=none
```

P1.3e 不能勾选。月岚风狐仍缺项目所有者对 mounted battle 和本进化候选的视觉验收、独立宠物战斗语义复核、正式成功路径的讨论与接入，以及两条路线的两拒两放端到端开放验收。任何代码接入将在与项目所有者讨论后单列实施。
