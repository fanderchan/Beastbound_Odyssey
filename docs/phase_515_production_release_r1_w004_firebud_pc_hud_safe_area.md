# Phase 515：生产发布 R1.W004 Firebud v2 PC HUD 安全区与边缘构图返工

日期：2026-08-21

## 目标与结论

本阶段只关闭 `R1.W004 AUTO｜Firebud v2 PC HUD 安全区与边缘构图返工`。在正常 1280×720 中文 PC HUD 下，Firebud v2 现在把玩家基础构图锚点固定在未被右侧任务栏占用的世界画面带 40% 处，并在 blocking/interaction 主地标即将从任务栏后探出时，以缓存的离散安全锚点把地标完整放到任务栏左侧或完整藏到任务栏后方。任务 HUD 始终可见，玩家保持在安全区内，村口相邻的右下圆形 warp 地标不再被屏幕边缘裁切。

本阶段没有移动 warp、spawn、NPC、服务格或视觉物件，没有扩大地图、walkable/blocked/protected cell，也没有修改 binding、地图 JSON、地砖 atlas 或碰撞事实。真实 `Main.tscn` 的 idle、moving、warp 与 occlusion 材料和性能矩阵均已通过；候选仍为 `owner_review_pending`、`ownerReviewStatus=pending`、`releaseApproved=false`、`runtimeEnabled=false`，不构成 OWNER 批准、promotion 或发布启用。

## 参考意图与产品边界

返工前先检查本地 StoneAge 8.0 参考。参考工程把任务栏作为固定界面带，地图构图不能把该区域当成透明的可用画布；本阶段只继承这一成熟行为意图，不复制参考项目的地图、美术、坐标或 UI 资源。Beastbound 继续使用既有中文任务 HUD、左键主交互和 Firebud 自有资产。

这次没有通过以下方式伪造通过：

- 不隐藏、折叠或透明化右侧任务 HUD；
- 不移动村口 `warp_to_training_yard`、训练场 `warp_to_village_gate` 或两个 spawn；
- 不改变相机缩放 1.55、地图尺寸、可走范围和玩法拓扑；
- 不把 QA 数值、物件 ID 或安全区诊断显示给普通玩家；
- 不提前处理 W005 的密度、比例、光照和生活感，也不重冻 W006 正式证据。

## 根因

旧 Phase 400 安全区模型能收集 HUD blocker，却仍以整屏中心作为玩家锚点。Firebud v2 又使用 `Camera2D.zoom=(1.55,1.55)`：玩家虽然在逻辑上跟随镜头，实际构图仍把右侧固定任务栏后的区域算进地标展示空间，训练设施、服务亭和古树会被任务栏压住，村口相邻圆形 warp 也容易贴到屏幕边缘。

同时，旧坐标帮助函数把 Godot 4 `Camera2D.zoom` 的方向写反：屏幕位移换算到世界空间时再次乘 zoom，世界坐标投到屏幕时反而除 zoom。1× 普通地图看不出问题，1.55× Firebud 预览会让安全锚点偏移量失真。数值合同已明确冻结：2× zoom 下，世界目标 `(500,420)` 要落到屏幕锚点 `(390,360)`，相机中心应为 `(625,420)`。

## 实现

### 1. Firebud v2 精确 canary 基础构图

`WorldPresentationProfile` 只对同时满足 `active + qaPreview + reviewCandidate + bundleId=firebud_region_visual_v2` 的精确预览候选启用 HUD 地标构图。1280×720 真实 Main 的安全区为 `[8,8,955,486]`，基础锚点为 `[390,360]`：玩家右侧保留约 60% 的无遮挡世界画面，纵向仍沿用 Phase 400 的既有中心行为。

普通运行时、v1、仅伪造 bundle ID 的字典以及战斗路径继续使用原有中心锚点；正式 Firebud v2 在 OWNER 批准并 promotion 前仍不可达。

### 2. 离散、缓存的主地标避让

Main 只在精确 Firebud v2 预览中读取已经 prepare 完成的 blocking/interaction draw commands，并以右侧任务面板真实 `global_rect` 计算水平候选锚点。求解器按以下顺序选择：

1. 物件与任务栏的相交数量最少；
2. 数量相同时，相交面积最小；
3. 仍相同时，离 `[390,360]` 最近。

候选只来自基础锚点、安全区两端，以及每个物件完整越过任务栏左右边界的临界点，并保留 12px 视觉间隙。近景大地标会完整移到任务栏左侧，远景地标会完整藏到任务栏后方，避免只露出半棵树或半座亭子。

这不是逐帧全量扫描。结果按玩家 grid cell、地图视觉 revision、viewport、zoom、基础锚点与任务栏 rect 缓存；只有这些事件状态变化时才重新求解。性能证据包含 `camera` 和 `process_total` 采样。

### 3. Godot 4 缩放换算修正

安全区模型统一改为：

- 屏幕偏移换算到世界空间时除以 zoom；
- 世界偏移投到屏幕时乘以 zoom；
- 相机 half-view 与 HUD padding 换算到世界空间时除以 zoom；
- screen-to-world 与 world-to-screen 保持可逆。

模型回归覆盖 1×、2×、地图边缘 clamp、近景地标、远景地标和本来不相交的稳定构图。普通地图 zoom 为 1，既有行为不变；目标移动、寻路、NPC 碰撞和 warp/切图另由真实 Main 自动检查覆盖。

### 4. 取证 fail closed

地图视觉 capture report 新增 `cameraComposition`，冻结：安全区、配置/生效锚点、玩家屏幕位置、任务 HUD 可见性与 rect、blocking/interaction 物件重叠 ID，以及最近 warp 的屏幕点和边缘安全状态。物件相交判断使用纹理 alpha 的 `Image.get_used_rect()` 映射到 draw rect，避免把 PNG 透明留白误报为遮挡。

Firebud v2 recorder 现在拒绝以下材料：任务 HUD 被隐藏、玩家离开安全区或锚点、玩家与任务栏相交、任何 blocking/interaction 物件的有效像素被任务栏覆盖、配置锚点不是 `[390,360]`，或村口最近的 `warp_to_training_yard` 被屏幕边缘裁切。对应 Python 负例已经覆盖。

## 真实 Main 视觉证据

### 1. idle / moving 录片

最终证据目录：`.run/evidence/r1_w004/after/r1-w004-safe-area-20260821-i/`

- 正常 `res://scenes/Main.tscn`、1280×720、30fps、1×、中文 HUD；
- 村口/训练场 × idle/moving 共 4 段，840 帧、28 秒；
- moving 段均使用跨帧 `InputEventMouseButton`；
- 四段 `cameraComposition` 均为 `taskHudVisible=true`、玩家在安全区和生效锚点、blocking/interaction overlap `[]`；
- 村口 idle/moving 的相邻 `warp_to_training_yard` 均为 `edgeClear=true`；
- 视频 H.264/yuv420p 与 AAC 音视频流完整解码。

| 证据 | SHA-256 |
|---|---|
| summary.json | `a4a86949a395c50ee0a0dd1d0ec084c734793cc7f43650eee99f1264dfb6faac` |
| SHA256SUMS | `eaed4d8ce84e92ff96f78903d78858e2ab9e21aeb2e8686a596af32ae5898afc` |
| 28 秒视频 | `c02ccfe8385545fb67ad76961df8be46e6188a48d0d27ea16692e06130be67f1` |
| 8 帧 contact sheet | `45883daf7b7bfb3e77f51d90e9d64e6756cdc7ddb31249745ffc5419af01f9bc` |

SHA256SUMS 对 81 个保留文件逐项复验通过。

### 2. warp / occlusion 动作截图

补充动作目录：`.run/evidence/r1_w004/actions/r1-w004-safe-actions-20260821-g/`

村口和训练场各取一张 warp、一张 occlusion，共 `4/4 PASS`；四张均保留正常任务 HUD、真实跨帧移动、空物件遮挡列表和已释放音频。村口 warp 截图的圆形地标完整位于屏幕内；村口 occlusion 场景把生效锚点从 `390` 调到 `519.5`，使远处亭子/古树不再从任务栏后方探出；训练场 occlusion 场景按附近设施把锚点调到 `342.2`。

- summary SHA-256：`bea6e692fadca610f39676b91dd7ae6abfe19f524d05d1dadbdcef2525440b9a`；
- SHA256SUMS SHA-256：`535118d345cb2a2fd4d0d13b34dd5733fc96169297bf9d6f02690bd095e323e8`；
- 清单对 29 个保留文件逐项复验通过。

这些是 W004 scratch 验证，不替代 W006 依赖密度返工完成后生成的两图 × 五动作正式冻结材料。

## 性能与隔离

性能目录：`.run/evidence/r1_w004/performance/r1-w004-safe-area-perf-20260821-a/`

- v1/v2 × 村口/训练场 × idle/moving 共 `8/8 PASS`；
- build identity：`1432e55e0c6440f4343aec2dea54972180bb7e16ab4d02f41bb5fa3ce4fe4832`，已纳入安全区模型源码；
- 8 组均为 `60/60/60 fps`，moving 均有真实跨帧鼠标输入；
- v2 村口 idle/moving 的 `process_total` 为 `0.140/0.262/0.330 ms`、`0.210/0.233/0.250 ms`；
- v2 训练场 idle/moving 为 `0.120/0.236/0.300 ms`、`0.200/0.273/0.380 ms`；
- v2 四组 `camera` 最大值依次为 `0.060/0.050/0.060/0.090 ms`；
- 8 次 QA lane 均 `cleaned`，post-cleanup 均 `inspected`，真实玩家目录均 `realUnchanged=true`。

summary SHA-256 为 `a1d48442270fe6451ca0262dc8603717ee38e144ebe1eddbb3a988ae98da5ae4`，SHA256SUMS SHA-256 为 `ac5bc1cf7c53242c33f436a38daac520e2045bf0146fdd1264fe4699d810434a`；清单对 49 个保留文件逐项复验通过。

## 玩法与资源不变量

本阶段没有修改两份 v2 binding 或两份权威地图 JSON，复验哈希保持：

| 合同 | 训练场 | 村口 |
|---|---|---|
| v2 binding | `2775987fa144e2a7f337a03d871bcd835d176e9af7a5461024997a0e3aaed073` | `0a97650b8a8781f4831881cbf99adbc76d3a2287bdd08ef7aeaf17a15fb33252` |
| 权威 map JSON | `37279c76ff265927ef8eb042ed0b8460e34aa91687070aff14029307adc71c51` | `19bbdcbb7856f47f57d80883cf06bb83efab8abc05315eadf41e23fb2a409eac` |

因此 W001 的 18 个 blocking placement、47 个 footprint cell、spawn、warp、protected cell、寻路、服务交互和冻结 collision/catalog 事实继续有效；W003 的 atlas `a86cb47204e6446f289d7517e623910c92228b40ff5c97dfc4c93a89765cbb85` 也未改变。

## 验证

以下检查均在隔离候选工作树执行：

1. Python recorder、动作取证、性能与 QA lane 合同：`103/103 PASS`；新负例会拒绝隐藏任务栏、玩家越界、物件遮挡和村口 warp 裁切。
2. Godot QA runner 合同：`56/56 PASS`。
3. `world_camera_safe_area_model_check.gd`：`PASS`；2× zoom 相机中心 `(625,420)`，远景/近景安全锚点分别约 `519/150`，无冲突构图保持 `390`。
4. Godot parse 加 movement、pathfinding、world-presentation、showcase-profile、Firebud service layout、NPC collision、map transfer：`8/8 PASS`。
5. 严格 pending runtime：顶层及 `firebud_region_visual_v2` 均 `PASS`、`errors=[]`、frozen validation 未跳过；历史 v1 按设计隔离 fail closed。
6. review catalog：`PASS`、`errors=[]`，道路/广场过渡完整、选择确定且 `strictPendingReviewFreeze=true`。
7. 三套真实 Main 证据的 SHA256SUMS 分别对 `81/81`、`29/29`、`49/49` 文件逐项通过，媒体完整解码、音频/进程与 QA lane 全部收尾。
8. bundle 离线 auditor 保持结构 `PASS`；release readiness 仍只允许由后续 W005/W006/W007 与正式 promotion 关闭。
9. `git diff --check`、Godot headless parse 和 JSON/源码合同均通过；候选工作树没有提交 `.run` 生成物。

本任务不是 release/export 总门禁，按仓库定向验证规则没有重复运行完整 `node tools/run_local_ci.mjs`。

## 生命周期与下一任务

Firebud v2 继续保持：

- `status=owner_review_pending`；
- `ownerReviewStatus=pending`；
- `releaseApproved=false`；
- `runtimeEnabled=false`；
- `releaseAttestation=null`。

W004 只证明正常 PC HUD 下的安全构图、边缘地标和对应性能已经关闭；它不声明物件/NPC 密度、角色与物件比例、清晰度、光照或生活感已通过。下一任务是 `R1.W005 AUTO｜Firebud v2 密度、比例、光照与生活感统一`。
