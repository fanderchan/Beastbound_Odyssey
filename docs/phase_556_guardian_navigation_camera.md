# Phase 556：守护兽寻路到达与消息窗构图

日期：2026-09-19。主目录基线 `5a349cc1a`，承接 Phase 555 的 F4 `(20,8)` 实机裁切问题。

## 结果与边界

从四层地图列表导航到岩脉守护兽后，人物及两座交互共鸣台保持完整可见；打开／关闭对话、展开／收起世界消息窗均已用真实鼠标复核。没有调整人物、地图物件或相机缩放，没有移动交互点、改变碰撞／寻路／地图拓扑，也没有修改服务端、奖励或美术资源。

本阶段修复既有 Phase 541 的交互优先构图合同，没有新增玩家操作或产品规则。普通边缘岩柱仍可能被视口截断，岩石可能位于消息窗背后；专项结果不表示所有周边环境物件都无覆盖，也不替代正式候选验收。原有静态场景和正式证据门槛没有放宽。

## 两处根因

### 普通物件意外取得交互优先级

最初按实际停格 `(20,8)` 静态放置，四层 11 个场景全部通过，八方向复查也通过。真实寻路会产生世界消息；在相同 Main 中复现该流程后，共鸣台顶部落在视口上方约 29 像素。强制刷新相机及缓存不能恢复，隐藏消息窗后恢复，排除了单纯方向或缓存失效问题。

`subject_rects = priority_subjects` 共享同一个 GDScript 数组；随后追加普通物件，也增大了 `priority_subjects.size()`。F4 实际需要优先保护人物和两座交互地标共三个主体，却传入五个主体，把岩柱和岩石一并提为优先目标。现于追加前冻结优先主体数量，没有新增数组复制、逐帧扫描或缓存。

该修复使默认消息窗下的守护兽地标顶部由约 `-29.34px` 回到 `16.36px`；相机锚点由 `(330,120)` 调整到约 `(495.786,165.706)`。

### 展开消息窗后，减少重叠面积错误地优先于保住完整轮廓

第一轮原生鼠标复核在展开消息窗时再次发现裁切，失败画面原样保留。展开后的安全世界带左边界为 `620px`，可实现的人物锚点从 `732px` 开始；交互地标能避开实际 HUD，但无法同时满足所有物件与 HUD 的 `12px` 预留间距。

旧评分在优先对象的 HUD 重叠数量相同时，先比较重叠面积，再比较完整可见性。把地标顶部裁掉会减少预留间距的交叠面积，因此错误获胜。现在在相同优先重叠数量下，先保住完整轮廓，再比较面积；其他分数、候选生成、边界和缓存保持原样。展开消息窗后的锚点由 `(732,120)` 变为约 `(732,165.706)`，两座交互地标完整可见且不触碰实际 HUD。

## 回归与实机

`earth_vein_camera_composition_check.gd` 保留原十个静态端点，增加实际停格的静态场景，以及从 `(9,25)` 调用正式导航、自然移动到 `(20,8)` 的 Main 流程。后者在对话打开、关闭、消息窗展开、收起四种状态检查完整人物与两座交互地标，并保留全部外围物件的裁切／遮挡数据。检查没有用强制定位或瞬移代替到达过程；起点仅作为隔离 QA 夹具设置。退出时复用音频收口。

- 第一轮红灯：`11/12`，对话开／关各检出一次守护台裁切和共鸣台 HUD 遮挡，共四条错误。
- 扩展消息窗后的第二轮红灯：`11/12`，检出展开状态的守护台裁切；纯模型回归同样失败。
- 最终纯模型回归通过；真实 Metal `Main.tscn / 1280×720` 为 `12/12 PASS`，包括导航场景中的四种状态。
- 正式 runner 的解析、相机、点击和地图视觉定向检查为 `4/4 PASS`。

```sh
node tools/run_godot_auto_checks.mjs \
  --only=--auto-camera-check,--auto-camera-click-check,--auto-map-visual-runtime-check \
  --fail-fast --output-dir .run/godot_auto_checks/phase556-camera-final \
  --timeout-ms 180000
```

模型入口为 `res://scripts/world/world_camera_safe_area_model_check.gd`。原生矩阵入口为 `res://scripts/qa/earth_vein_camera_composition_check.gd`，只接受 `--map-art-review-preview=earth_vein_cave` 和 `--beastbound-qa-user-data-lane=automation`，通过官方 automation lane 包装器启动／验证／清理；本机复测包装器为 `.run/phase556_run_native.py`。不应将裸 Godot 检查指向真实玩家目录。

最终原生矩阵报告位于 `.run/phase556-camera-native-final/camera-report.json`，SHA-256：
`923904c744afa7f30042705c816a94a901d87925bde02cde14b5e782ea87d088`。

实际鼠标复核另启动隔离离线 Main，使用地图列表选择守护兽、等待正常寻路到达、点击“离开”、展开再收起消息窗。最终九次 Computer Use 调用、18 条原始事件、八张原图，无工具错误；保存在 `.run/phase556-guardian-camera-manual-final/`。原始回执 SHA-256：
`933454a9e9204099a80ba09ce7850298570d3621d216bdc3691cbdaca6d69fff`。

中间版本的展开失败位于 `.run/phase556-guardian-camera-manual/`，原始回执 SHA-256：
`0267c62f8a7f3966878b058b406b2a7b82b9a74ee85d231d604fed381239341b`。最终与中间画面均直接复制原始工具图片至 `.run/phase556-camera-visual/`，没有裁剪、重画或改写像素。最终展开图 SHA-256：
`9baf245e86a0292c640e82e984272a3e25f8a8e0a64a79a9a3b2df3d7d786a83`。

## 性能与交付状态

修改前后官方隔离性能套件均为 `5/5 PASS`，包括跨帧移动、连续点击、商店和加点压力。命令为 `node tools/run_godot_auto_checks.mjs --performance-suite --output-dir <下述目录> --timeout-ms 180000`，分别记录于 `.run/godot_auto_checks/phase556-camera-before-performance/` 与 `phase556-camera-after-performance/`。

| headless Main `process_total` | 修改前中位数 / P95 | 修改后中位数 / P95 |
| --- | --- | --- |
| 静止 | `0.364 / 0.410ms` | `0.442 / 0.484ms` |
| 移动 | `0.533 / 0.576ms` | `0.490 / 0.524ms` |

连续点击前后均送达 70 个鼠标事件，合并、停稳和最终目标匹配均通过，最大输入耗时 `6 → 2μs`。静止单轮数据有所上升，移动有所下降；不据此宣称整体性能提升。这是通用 headless 对比，不替代四层原生重复矩阵。汇总位于 `.run/phase556-camera-performance-comparison.json`。

正式动作配对、当前源码四层连续片和 48 样本前台性能仍需重冻，不能重标旧画面。107 项原有地图资产／证据修改保持原字节；本阶段基线清单为 `.run/phase556-camera-baseline/inventory.json`。真实玩家目录 SHA-256 始终为 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`，本阶段 QA 进程组及 lane 均已清理。文档索引刷新／检查、`git diff --check` 通过。没有运行全量 CI，也不把 headless 数字换算为原生 FPS。

`R1.W024` 继续未勾选；候选仍为 `owner_review_pending / pending / runtimeEnabled=false / releaseApproved=false`。本阶段不生成所有者接受或发布批准。
