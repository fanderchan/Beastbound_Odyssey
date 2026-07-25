# Phase 343：月岚风狐世界真八向与整体骑乘整图候选

日期：2026-07-26

## 用户决定与范围

项目所有者确认当前月岚风狐外形方向可以继续制作。本阶段据此补齐：

- 月岚风狐独立宠物世界八方向；
- 成年见习猎人骑月岚风狐的一体生成世界八方向；
- 来源、失败稿、处理参数、逐帧哈希、Godot 加载门禁和 1× 动态审片证据。

本阶段没有修改 `main.gd`、战斗规则、宠物数值、进化材料、进化事务、骑乘资格、GM 10V10 逻辑或普通玩家路线。两套世界资源继续保持 `runtimeEnabled=false`，不会因为资产目录已经完整就进入正式玩家路径。

## 视觉与动作合同

- 独立宠物与整体骑乘均按 `south / southwest / west / northwest / north / northeast / east / southeast` 八方向分别生产；
- 每方向 `idle 1 + walk 4`，独立宠物 40 帧、整体骑乘 40 帧；
- 512×512 RGBA 源帧确定性派生 256×256 RGBA 运行帧；
- 禁止水平镜像、相邻方向改名、程序重画主体；
- 骑乘每一帧都是见习猎人与月岚风狐一次生成的完整主体，不使用离线或运行时人物/宠物分层拼接；
- 月岚风狐保持成年银白月蓝体态、两条大尾巴和克制的肩背毛鳍；不能退化为单尾、并尾、九尾狐或长出翼状侧鳍；
- 两栏使用同一 256px 画布与底部居中锚，便于直接检查模型体量、脚底和骑乘接触。

## 生产返工与失败留痕

首轮独立宠物南向的两尾合成一团，西北向只剩一条可追踪尾巴；两行全部拒绝。第一次南/西北修复中，西北向通过，但南向长出过大的横向毛鳍，视觉上像翅膀或额外尾巴，因此南向再次拒绝。第二次南向修复才得到严格正面、两尾明确分开且没有翼状毛鳍的序列。

首轮整体骑乘南向也被拒绝：待机双尾不清楚，行走逐帧漂成西南三分之四。专用南向修复保持严格正面、骑手与坐骑同轴、两尾分开，前 5 帧进入候选，第 6 帧只作为审计 hold 留存。

正式来源归档位于两套资产各自的 `source/world/`：

- 独立宠物处理并归档 51 张 512px 源帧，其中 40 张入选、10 张为已处理失败帧、1 张为非运行审计 hold；另有 5 个只存在于 untouched raw 的失败南向单元；
- 整体骑乘处理并归档 46 张 512px 源帧，其中 40 张入选、5 张为已处理失败南向、1 张为非运行审计 hold；
- 每个生成组均保留原始 PNG、逐字 prompt、pipeline metadata、处理联系表、全部已处理 512px 源帧、原生成文件位置与 SHA-256；
- `source-ledger.json` 绑定每个入选源帧、运行帧、文件 SHA-256、解码 RGBA SHA-256、参考身份板和逐行取舍。

所有图像都由 Codex 内置 `image_gen` 基于 Beastbound 自有身份板生成。未使用或切取 StoneAge、SA80、其他游戏、图库或第三方宠物素材。

## 静态质量与 Godot 加载门禁

两套候选分别得到：

```text
runtimeFrameCount=40
uniqueDecodedRgbaFrameCount=40
mirroredCrossDirectionPairCount=0
minimumEdgeMargin=14
transparentRgbLeakPixels=0
residualVisibleMagentaPixels=0
errors=[]
```

Godot 显式导入后，定向门禁通过：

- 月岚风狐独立宠物：`worldDirections=8`、`worldFrameCount=40`、`battleActions=12`、既有双视角战斗 `battleFrameCount=180`、`errors=[]`；
- 月岚风狐整体骑乘：`worldDirections=8`、`worldFrameCount=40`、`runtimeBodyLayerCount=1`、`runtimeLayeredComposition=false`、`requireBattle=false`、`errors=[]`；
- `--auto-character-mount-art-check` 连同 Godot parse 为 `2/2`；
- Pet Design Inspector 为 `errors=0`，保留 1 条既有公开投影 warning；
- Battle Action Catalog 为 `status=ok`。

世界方向原子录制器在录制前、正式录像进程和网格进程中均完成共享人物 40 帧、独立宠物 40 帧、整体骑乘 40 帧的实际加载 parity：

```text
checkedFrames=120
passedFrames=120
sourceSetSha256=5bc7535a2e4adbe3253ca02491087d5c06ec5e205686730dae2093526c7a2fd7
```

对应技术证据位于：

```text
.run/evidence/phase343_moon_gale_world/candidate/phase343-moon-gale-world-v1/
```

该原子审片录像为 1280×720、30 FPS、433 帧、14.433333 秒，完整解码通过。它证明源 PNG、Godot import 与审片场实际纹理一致；不冒充尚未执行的独立方向语义审查或项目所有者终审。

## 真实 Main.tscn 1× 动态证据

临时 QA capture 脚本实例化真实 `res://scenes/Main.tscn`，使用游戏音频管理器和月夜岩台背景，并在同一进程中按八方向连续展示独立宠物与完整骑乘：

```text
.run/evidence/phase343_moon_gale_world/main-client-1x/
  Beastbound_Phase343_Moon_Gale_World_1x.mp4
  direction-1-south.png
  direction-4-northwest.png
  direction-8-southeast.png
```

录像事实：

- Apple M5 Metal 4.0 Forward Mobile；
- 1280×720、60 FPS、1,035 帧、17.250 秒；
- 每方向严格为待机 0.600 秒 + 行走 1.200 秒，八方向均标记 `1×`；
- H.264 + AAC 48kHz 双声道，完整解码零错误；
- 音轨 `mean_volume=-33.6dB`、`max_volume=-17.8dB`；
- 转码没有使用 `setpts`、`atempo` 或其他变速滤镜；
- MP4 大小 2,447,587 bytes；
- MP4 SHA-256：`2f1c0ff82cf5feb334149cc3444820d2f5ba0929f2b87b500594d6bbf1cad19b`；
- Movie Maker 平均 CPU render `0.13ms/frame`。这只是本机离线审片开销，不代表多人同图容量。

当前主审未发现南向偷转西南、单尾/并尾进入运行帧、八向镜像、骑手缩成小人、坐点漂移或骑手与坐骑运动轴分离。正/背向因为两条大尾巴横向或纵向展开，身体可见宽度会变化，但同一 256px 画布、统一锚点和真实加载网格没有出现“小得离谱”的缩放异常。

## 项目所有者复核决定

项目所有者查看上述 1× 连续成片后明确回复“认可，继续”。据此仅登记两个范围明确的视觉批准：

- 月岚风狐独立宠物世界真八方向；
- 成年见习猎人骑月岚风狐的一体整图世界真八方向。

两份决定分别记录于独立宠物与 mounted 目录的 `qa/world/owner-decision.json`。这不是整宠、骑乘战斗 180 帧、进化演出或路线开放批准；两套 `runtimeEnabled` 继续为 `false`，独立方向语义复核仍为 `pending`。

## 当前状态与后续

两套 metadata 当前均为：

```text
selfReview=passed
independentBlindSemanticAudit=pending
ownerReview=approved (world_true8_visual_only)
runtimeEnabled=false
```

本阶段没有生成独立语义批准清单，因为方向复核尚未完成；项目所有者批准已单独记录，不能替代该技术门禁。

P1.3e 继续保持未勾选。月岚风狐仍缺：

1. 成年见习猎人骑月岚风狐的双战斗视角 12 动作、180 帧整图候选；
2. 高地风狐→月岚风狐进化演出及成功路径接入；
3. 世界八向独立语义复核；
4. 两条进化路线的两拒两放端到端开放验收和最终 `formal` 门禁。

因此本阶段结论是“月岚风狐世界真八向与整体骑乘整图视觉已获单项 owner 批准，但独立语义复核、其余正式资产和路线开放仍未完成”，不能记作正式路线开放。
