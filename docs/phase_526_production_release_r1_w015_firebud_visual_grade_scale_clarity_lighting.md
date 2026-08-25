# Phase 526：生产发布 R1.W015 Firebud v2 角色／地表／物件比例、清晰度与光照统一

日期：2026-08-26

## 目标与结论

本阶段只关闭 `R1.W015 AUTO｜Firebud v2 角色／地表／物件比例、清晰度与光照统一`。W014 训练终点真实路线补图暴露了两个相邻问题：旧镜头门禁只用玩家脚点附近 `68×96px` 探针，未覆盖正式人物约 `66×136px` 的完整透明轮廓，因此头部仍可能靠近小地图；同一套正式角色、NPC、地表和环境物件虽然尺寸数值接近，但真实 `1280×720` Main 中人物与物件仍有偏硬、偏艳、争抢地表层级的观感。

本轮先把镜头安全主体改为正式动作帧完整 alpha 包围盒，再只对玩家、NPC、地图物件分别施加有界的选择性颜色分级和线性采样，保留低对比手绘地表作为锚点。没有缩放人物、整体模糊、全局压暗、隐藏 HUD、放宽安全门禁或改变地图、碰撞、寻路、NPC、warp/spawn 和玩法拓扑。

最终真实 Main 四段视频、完整 alpha 安全门禁、角色／NPC 像素体量、严格 pending preview、目录契约、Godot 定向回归、性能和离线 bundle 审计均通过。候选继续保持 `owner_review_pending / pending / false / false`，本阶段没有生成 owner acceptance、release attestation、promotion 或普通玩家可达状态。

## 玩家完整 alpha 与镜头安全区

### 根因

旧 `_world_camera_landmark_safe_anchor()` 固定加入以角色脚点为中心的 `68×96px` 屏幕探针。Firebud v2 使用 `1.82×` review zoom，正式人物在真实画面中的透明主体约高 `135.6px`；训练终点附近地标拉动镜头时，脚点探针可以通过，但头部仍会钻入顶部小地图／菜单 HUD 的视觉余量。

### 修复

- `Player` 对当前 `appearanceId + direction + action` 的全部正式动作帧计算非透明区域并缓存 alpha union；普通正式角色报告 `formal_action_alpha_union`。
- 镜头求解把该世界矩形按真实 zoom 转成屏幕矩形，与 NPC／关键环境使用同一固定 HUD、安全区和视口边缘门禁；只有没有正式视觉时才保留旧探针回退。
- 骑乘形态使用保守的 mounted frame envelope；占位视觉使用自身几何，不把正式人物错误退回脚点探针。
- 镜头缓存签名新增 appearance、骑乘形态、朝向和动作状态，视觉轮廓变化会重新求解，不在每帧扫描整套动作资产。
- capture 和录片器同时冻结 `playerAlphaBoundsSource`、完整屏幕矩形、safe rect、任务 HUD、固定 HUD 和 viewport edge 五项事实。

端点模型把旧危险锚点 `(120,207)` 收敛到 `(120,253)`；真实 Metal／Main 训练终点补图中完整人物头部已落到小地图下方，截图 SHA-256 为 `b588a87cafec56c48aefcddd7ff19f42be1c35c7e3cd7152859082038604f164`。四段最终录片的 `playerAlphaInsideSafeRect`、`playerAlphaClearOfTaskHud`、`playerAlphaClearOfFixedHud`、`playerAlphaViewportEdgeClear` 均为 `true`。

## 三类素材的选择性视觉分级

Firebud v2 manifest 新增 `firebud_world_subject_grade_v1`。地表不进入 shader，继续作为已有的低对比手绘锚点；玩家、NPC 和物件分别使用以下冻结参数：

| 角色 | saturation | contrast | brightness | tint |
|---|---:|---:|---:|---|
| player | `0.70` | `0.94` | `0.99` | `[1.00,0.98,0.95]` |
| npc | `0.92` | `0.94` | `1.02` | `[1.00,0.99,0.96]` |
| mapObject | `0.80` | `0.92` | `1.06` | `[1.00,0.99,0.96]` |

三类都使用 `linear` texture filter。分级 shader 直接处理 CanvasItem 已采样的 `COLOR`，不二次采样或再次乘 alpha，避免人物轮廓出现暗边；共享材质按完整参数签名缓存。profile 从 catalog 依次传播到 player、NPC world-depth command、地图 world/foreground object command；旧 bundle 没有 `visualGrade` 时保持原 authored rendering，只有显式声明后才对全字段 fail closed。

对 W014 与 W015 的同场景真实 Main 联系表、原生 idle/moving PNG 和完整视频审看结论是：人物和 NPC 的过饱和与硬边下降，环境物件不再先于角色争抢注意力，地表明度和道路层级保持，画面没有洗灰、整体变暗或人物缩小。该结论来自实际画面，不由参数一致或自动分数代替。

## 真实 Main 体量与视频证据

最终 scratch run：

`.run/evidence/r1_w015/video/r1-w015-visual-grade-20260826-a/`

- 真实 `res://scenes/Main.tscn`，村口／训练场 × idle／moving；
- `1280×720 / 30fps / 1.00× / 861 frames / 28.7s`；
- H.264 `yuv420p` + AAC，音视频全流 decode `passed`；
- 视频 SHA-256：`eeb6bcf9e64170ffa179807f7da6d419afbe8a880abbbf8ff24b0b7f5a6a752f`；
- 八帧联系表 SHA-256：`7f06c43c6941fa4b50ea7b62d1321ba2b2bbd4435d561e08b19ec8627830baae`；
- summary SHA-256：`d764c0ed413362ab39c7811d3e03061c6d3663689d3e68fef09e807d895b7008`；
- `SHA256SUMS` SHA-256：`69757bfdaa8b697cb37e1443f93e2b8308bd9aa55786a04679e0ba9b68159e3e`。

体量门禁冻结正式主体高度为 `120..150px`，玩家／NPC 中位高度比例为 `0.88..1.12`：

| 场景 | 玩家高度 | NPC 中位高度 | 比例 | 结果 |
|---|---:|---:|---:|---|
| 村口 idle | `135.626px` | `135.626px` | `1.000000` | PASS |
| 村口 moving | `140.868px` | `135.626px` | `1.038648` | PASS |
| 训练场 idle | `135.626px` | `133.661px` | `1.014706` | PASS |
| 训练场 moving | `135.626px` | `133.661px` | `1.014706` | PASS |

这里没有为通过门禁修改任何角色或 NPC 的显示尺寸；门禁只把当前真实体量固化成以后不能静默漂移的回归事实。

## 性能

最终性能 run：

`.run/evidence/r1_w015/performance/r1-w015-visual-grade-perf-20260826-a/`

`baseline_v1 / candidate_v2_review × 两图 × idle/moving = 8` 次真实 Main 全部通过，所有样本为 `60/60/60fps`；两条 v2 moving 均使用真实跨帧鼠标输入。

| v2 场景 | process_total min/mean/max |
|---|---:|
| 村口 idle | `0.210/0.231/0.260ms` |
| 村口 moving | `0.300/0.320/0.350ms` |
| 训练场 idle | `0.230/0.253/0.300ms` |
| 训练场 moving | `0.220/0.292/0.490ms` |

performance summary SHA-256 为 `3396bf82c75642f898590c74a696c9913df5f481fad9df81ee6f81066673748c`，`SHA256SUMS` SHA-256 为 `2a45883f82844fe687a9b90ad4826515461178a500305d42c1761a26014106d3`。

## 权威哈希与 fail-closed 事实

| 项目 | SHA-256 |
|---|---|
| Firebud v2 manifest | `e4a554ef9e83753cb4e03551ff8e8f7b7d16943c12c8bdd13b5a257ec2c7b66c` |
| catalog contract report | `ee5192125d6f20d756651c000f7b4bee4ebacbd116389161deebe0d8abe5dbdc` |

最终 `map_visual_review_catalog_check.gd` 冻结 profile、三类参数、linear filter、材质创建和 renderer 传播；只读 `--preview-map-visual-catalog-contract` 顶层为 `PASS`，Firebud v2 两图为 `PASS / errors=[]`，训练场 `1224 ground draws / 28 objects / 150 protected cells`、村口 `672 / 21 / 218`。旧 primary v1 因共享 staged 权威地图已经改变而继续按设计失败关闭，本阶段没有覆盖旧报告或把 pending 候选接入普通运行时。

离线 auditor 仍为 `134 files / 102 PNG / 4 JSON / PASS / errors=[] / releaseReady=false`。精确缺口保持九项：`collisionAudit.valid_report`、`computer_use_report`、`dressed_reference`、`layered_preview`、`runtime_screenshot_coverage`、`performanceReport.valid_report`、`owner_acceptance`、`release_attestation`、`lifecycle_released_and_enabled`。

## 验证与 QA 隔离收口

1. `git diff --check`、Godot parse 和 Firebud recorder 单测 `13/13 PASS`。
2. 官方 QA lane 的角色外观、移动、寻路、镜头点击、world presentation、showcase、service layout、NPC interaction、NPC collision、map transfer、encounter、NPC quest marker 与 parse 合计 `13/13 PASS`。
3. `map_visual_review_catalog_check.gd` PASS；`world_camera_safe_area_model_check.gd` PASS，端点安全锚点 y=`253`；严格 pending preview 顶层及 Firebud v2 report PASS。
4. 地图 bundle auditor 单测 `17/17 PASS`；实际只读审计 `134 files / errors=[]`，九个正式证据／生命周期缺口按预期保留。
5. auto-camera 旧夹具仍用零参数调用已改为必须传 `delta` 的 `_queue_world_redraw_if_needed()`；本轮加入固定测试 flush 秒数后脚本异常消失。该普通自动检查仍会因只验证已过期 primary v1 而报告 lifecycle fail closed；候选镜头由端点模型和真实 Main 完整 alpha 证据覆盖，未放宽普通生命周期。
6. 一次手工候选镜头启动漏传 `GODOT_EDITOR_CUSTOM_FEATURES`，Main 在进入游戏前以 `incomplete_lane_markers` 安全拒绝。清理器因真实 user-data inventory hash 变化而保留隔离 lane/lock；文件名与时间戳检查显示近时变化只涉及 Godot 日志和音频设置，没有玩家档案或数据库。确认 owner-bound runner 已 stale 后，使用项目 `inspect -> exact inspection SHA-256 -> recover` 合同清除仅属于本次的隔离 lane/lock；恢复过程中的真实目录哈希保持不变，随后 `inspect-stale` 为 `absent`。其后所有 Main／自动客户端检查都改走官方 runner；三项不加载 Main 的纯 catalog／model `--script` 复验仍在默认 user-data 下生成了三份 Godot 日志，令 inventory hash 再次变化，最终元数据检查仍未发现 profile／数据库文件变化。没有手工删除日志、终止现有独立 Godot 进程或回滚玩家数据；W016 不再直接运行未绑定 QA lane 或未显式重定向日志的 Godot 命令。
7. 本任务不是完整 release/export gate，没有运行昂贵的 `node tools/run_local_ci.mjs`；W016 将基于同一最终候选重建正式证据。

## 生命周期与下一任务

下一任务为 `R1.W016 AUTO｜Firebud v2 第三次返工精确证据重新冻结`：显式 supersede W011，基于 W013–W015 同一最终候选重建两图十动作、真实 Computer Use、完整 `1280×720 / 30fps / 1×` 视频、collision/catalog/performance 原始 runner 与 manifest-bound 离线审计。W016 只能填补前六个正式证据槽；`owner_acceptance`、release attestation 和 released+enabled lifecycle 仍必须留给 W017 的明确发布决定。
