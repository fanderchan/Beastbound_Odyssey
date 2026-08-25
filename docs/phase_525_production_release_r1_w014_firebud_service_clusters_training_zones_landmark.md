# Phase 525：生产发布 R1.W014 Firebud v2 服务簇、训练分区与路线终点围合

日期：2026-08-26

## 目标与结论

本阶段只关闭 `R1.W014 AUTO｜Firebud v2 服务簇、训练分区与地标围合重做`。W012 的受委托审片指出：村口仍像角色展板，生活服务关系没有空间分组；训练场仍是十字路加散件，入口、练习区和返回村口的路线终点缺少层级。

本轮保留 14 名 NPC 的身份、服务、对白、appearance、碰撞语义与可接近性，保留中央主路、两块遇敌区和双向 warp；只重新组织 NPC cell、正式物件、广场／道路连接和与物件一一对应的 `blockedCells`。最终村口形成 `5 / 4 / 5` 三个服务簇，训练场形成入口基础练习、中央训练、路线练习和返回村口终点四段；两图真实 Main 十动作、四段录片、双向传送、权威 collision/catalog、性能和离线 bundle 审计均通过。

候选继续保持 `owner_review_pending / pending / false / false`。W014 没有创建 owner acceptance、release attestation、promotion 或玩家可达状态，也没有把 scratch 截图冒充正式冻结证据。

## 参考边界与运行时结构

StoneAge 8.0 只作为成熟村落“按功能分区、沿路线逐步揭示”的行为参考；没有复制其坐标、地图、NPC、数值或美术。Beastbound 继续使用现有 Firebud 原创正式素材与以下运行时结构：

- `tile_mode` 地表和道路／广场过渡；
- NPC、环境物件分别运行时绘制，不把角色烘焙进地图；
- 项目原生 JSON 作为地图、交互和碰撞权威；
- 每个 blocking placement 的 `collisionFootprint` 与同一地图 `blockedCells` 精确对应；
- 角色身份、服务、对白、appearance、warp、spawn、遇敌区和主路合同独立于视觉 binding。

## 村口服务簇

### 三个功能区

| 分区 | 范围 | NPC | 数量 |
|---|---|---|---:|
| 入口／民生／引导 | `Rect2i(2,11,5,8)` | 守望者、福利员、银行、杂货、说书 | 5 |
| 宠物照料 | `Rect2i(6,17,7,6)` | 骑宠、村医、兽栏、宠技 | 4 |
| 高阶成长／试炼 | `Rect2i(11,8,8,6)` | 装备、钻石、转生、1转MM、2转MM | 5 |

首屏完整进入安全世界带的 NPC 精确冻结为守望者、福利员、银行和杂货四名；最小脚点间距为 `72.11px`，不是靠缩小人物或把 14 人重新塞回同一镜头获得通过。

### NPC cell 逐项变化

| NPC | W013 | W014 | 其余合同 |
|---|---:|---:|---|
| 村口守望者 | `[3,11]` | `[3,11]` | 不变 |
| 福利员阿檀 | `[6,9]` | `[5,12]` | 身份／服务／对白／appearance／碰撞不变 |
| 银行管理员阿衡 | `[5,14]` | `[5,14]` | 不变 |
| 杂货商阿芸 | `[5,16] / south` | `[5,16] / north` | cell 不变；朝向改为面向服务区内部 |
| 说书人阿舟 | `[8,17]` | `[5,18]` | 其余不变 |
| 骑宠导师阿越 | `[3,18]` | `[7,18]` | 其余不变 |
| 村医阿萝 | `[9,19]` | `[9,19]` | 不变 |
| 兽栏管理员阿牧 | `[5,20]` | `[7,21]` | 其余不变 |
| 宠技训练师阿拓 | `[7,18]` | `[11,20]` | 其余不变 |
| 装备商阿石 | `[8,10]` | `[12,9]` | 其余不变 |
| 钻石商阿璨 | `[10,12]` | `[14,9]` | 其余不变 |
| 转生导师阿岚 | `[9,14]` | `[13,12]` | 其余不变 |
| 1转MM试炼师阿澄 | `[8,12]` | `[15,11]` | 其余不变 |
| 2转MM守护员阿岚 | `[11,14]` | `[17,12]` | 其余不变 |

试验中曾把杂货商移到 `[3,16]`，真实左键传送回归发现其 alpha 会吞掉相邻 `[2,15]` warp 点击，因此该试验被拒绝，最终恢复 `[5,16]` 并由真实 map-transfer 再证明通过。

### 村口正式物件与 blockedCells

村口 placement 从 `18` 调整为 `21`，权威 blocked cell 从 `15` 调整为 `22`：

- 过大的村内 service pavilion 改为成长训练架：`grid=[11,7]`，footprint=`[[10,6],[11,7]]`；亭保留在训练场路线终点，不再挤压村内服务区。
- 过大的 blocking ancient tree 改为高阶区低花台：`grid=[11,8]`，footprint=`[[10,8],[11,8]]`；地图边缘的纯景观树仍保留。
- 围栏移至 `grid=[24,12]`，footprint=`[[22,11],[23,11],[24,12]]`。
- 宠物区花台移至 `grid=[13,21]`，footprint=`[[12,21],[13,21]]`。
- 交易柜台移至高阶商业区 `grid=[11,10]`，footprint=`[[10,10],[11,10]]`。
- 新增宠物照料补给 `grid=[9,22]`，footprint=`[[8,21],[9,21],[9,22]]`。
- 新增高阶练习架 `grid=[13,8]`，footprint=`[[13,7],[14,7],[13,8]]`。
- 新增高阶靶位 `grid=[19,14]`，footprint=`[[18,14],[19,13],[19,14]]`。
- 蜂蜜岩、记录图腾、边缘景观树和无碰撞草花 decal 保持原合同。

入口、宠物照料和高阶成长广场分别扩展，最终高阶广场为 `[9,9,10,5]`。中央主路 `[3..10,15]` 保持可走，两块遇敌区没有 NPC，14 名 NPC 的所有 approach 均可从 spawn 到达。

## 训练场分区与路线终点

训练场 placement 从 `22` 调整为 `28`，权威 blocked cell 从 `32` 调整为 `46`：

- 中央训练广场由 `[18,15,3,3]` 扩展为 `[18,15,6,4]`。
- 路线分支起点由 `[19,16]` 调整为 `[21,17]`，目标仍为 `[13,20]`；返回村口主路线仍到 `[30,28]`。
- 新增西侧围栏 `grid=[10,13]`，footprint=`[[9,13],[10,13]]`。
- 新增中央围栏 `grid=[19,13]`，footprint=`[[19,12],[19,13]]`。
- 新增路线靶位 `grid=[23,16]`，footprint=`[[22,15],[23,15],[23,16]]`。
- 新增路线训练架 `grid=[26,18]`，footprint=`[[25,17],[26,18]]`。
- 原巨树从路线终点移到西侧前景 `grid=[7,20]`，footprint=`[[5,19],[6,19],[7,20]]`，避免压住任务栏并形成前景层。
- 原花台移到终点 `grid=[31,26]`，footprint=`[[30,25],[31,25],[31,26]]`。
- 新增终点 service pavilion `grid=[34,25]`，footprint=`[[32,24],[33,24],[34,25]]`。
- 新增终点围栏 `grid=[34,29]`，footprint=`[[33,28],[34,29]]`。
- 新增终点广场 `[27,25,7,5]`，把 `from_village_gate=[29,27]`、`warp_to_village_gate=[30,28]`、亭、花台和围栏组织成可读围合。

真实 map-transfer 从 `[14,12]` 用三段跨帧左键路线走到 `[25,23]`，再点击 `[30,28]` 进入村口并回到训练场；双向传送、两个目标 spawn、地图 payload、相机 limits 和 HUD 所有权均通过。终点截图 SHA-256 为 `e5a3c4ebdffba30a23f67c8864027d4d0351803577b8881f9a539f0ec8dd2ad5`。

该补充截图同时让人工审片发现：接近终点时玩家上半身仍靠近小地图 alpha。它不影响 W014 的路线、碰撞和终点围合闭包，但不能进入 W016 最终证据；已作为 W015 的首个比例／安全构图问题继续修正。

## 权威哈希与 fail-closed 事实

最终只读 pending preview 顶层和 v2 bundle report 均为 `PASS / errors=[]`，且 `frozenReportValidationSkippedForGeneration=false`：

| 项目 | SHA-256 |
|---|---|
| `firebud_training_map.json` | `d713e75774335c5c1dba27bf55cc7c903289fa05597ee808f8cd67b75e5cbd91` |
| `firebud_village_gate_map.json` | `88c3684c87e513ec93f0cd7c769524c38325bfbc2aecb5786a88538a6346d9e7` |
| 训练场 binding | `8210409fe8974d7e8c0d56d1b3a550adae26a728251edae930bcca42eb4f7753` |
| 村口 binding | `66f9afe1cf13563fa59fe34b63aa4c3374cbdb7adbaf222e34a1ce2bf1816052` |
| catalog contract report | `ae37c2288765922b99ea94c37775419e1427e576a235c3f63d32b6dbf692b61e` |

运行时复验精确得到：训练场 `1224 ground draws / 28 objects / 150 protected cells`；村口 `672 / 21 / 218`。普通 primary v1 因共享权威地图已经改变而继续按设计 fail closed；W014 没有覆盖、删除或伪造旧 v1 报告。

## 真实 Main 视觉与动作证据

最终四段 scratch run：

`.run/evidence/r1_w014/r1-w014-service-zones-landmark-20260826-d/`

- 真实 `res://scenes/Main.tscn`；
- 村口／训练场 × idle／moving；
- `1280×720 / 30fps / 1.00× / 861 frames / 28.7s`；
- H.264 `yuv420p` + AAC，全流 decode `passed`；
- 视频 SHA-256：`a4a9e89773f7b7f3e301fcdd9d4ab01ace7062bbb51949a95e8ffd3c6170736f`；
- 八帧联系表 SHA-256：`696db82efd3d603e13fab5a713f7b986fe667e211b882ede0856f64244b34b89`；
- 村口 idle/moving 安全 NPC 为 `4/5`，关键环境分别可见 `3/4` 个；四段 task HUD blocking overlap 均为空。

最终十动作 scratch matrix：

`.run/evidence/map_visual_action_captures/firebud_region_visual_v2/r1-w014-service-zones-landmark-actions-20260826-h/`

- 两图各 `pointer / movement_path / warp / collision / occlusion`；
- `10/10 PASS`、十张独立 `1280×720` PNG、HUD 字形 `10/10` 自包含；
- 四种移动动作都是真实跨帧左键输入；
- 十份 capture 的玩家均避开固定 HUD 和任务栏，task HUD blocking overlap 均为 `0`；
- matrix SHA-256：`6adb7f7f737362eb1171e6a6447f13817b2267ef457bf60a219fdf530ae1c8d4`。

失败 run `a..g` 均保留在 `.run`：它们分别真实拒绝了柜台压任务栏、巨树把玩家挤进小地图、巨树／练习架压任务栏、亭压任务栏以及成长架边缘交叠。最终布局来自这些失败证据逐项收敛，不是放宽 capture 门禁。

## 性能

最终性能 run：

`.run/evidence/r1_w014/performance/r1-w014-service-zones-landmark-perf-20260826-a/`

`baseline_v1 / candidate_v2_review × 两图 × idle/moving = 8` 次真实 Main 全部通过，所有样本为 `60/60/60fps`；两条 v2 moving 均为真实跨帧鼠标输入。

| v2 场景 | process_total min/mean/max |
|---|---:|
| 村口 idle | `0.200/0.251/0.290ms` |
| 村口 moving | `0.260/0.347/0.450ms` |
| 训练场 idle | `0.200/0.344/1.060ms` |
| 训练场 moving | `0.270/0.302/0.360ms` |

performance summary SHA-256 为 `a76421597d9fe483a939d38106d88e770dfbb1fc510ae68d085e2e766bcc3cf5`，`SHA256SUMS` SHA-256 为 `74b3a531d74f4b3f7957906c7585df84d811f804b1d2104580379e66d6823f46`，`49/49` 项清单通过。

## 验证

1. `git diff --check`、六份目标 JSON parse、manifest binding/catalog 哈希重算与 pending 生命周期精确断言通过。
2. pending review catalog 生成与最终只读 preview 均通过；v2 `errors=[]`，两图 collision/protected/path 检查完整。
3. Godot parse、movement、pathfinding、world presentation、showcase、NPC interaction、Firebud service layout、NPC collision、map transfer、encounter、NPC quest marker：`11/11 PASS`。
4. Firebud service layout：`14 NPC / 15 layout objects / 5-4-5 zones / 22 village blocked / 46 training blocked / 21-28 placements / all approaches reachable / promenade clear / route reachable`。
5. Node `auth-social-world + auth-http-server`：`72/72 PASS`。
6. Firebud recorder 单测：`13/13 PASS`；地图 bundle auditor 单测：`17/17 PASS`。
7. 最终真实 Main 十动作：`10/10 PASS`；四段视频、媒体全流解码和真实双向传送路线通过。
8. 离线 bundle 审计：`134 files / 102 PNG / 4 JSON / PASS / errors=[] / releaseReady=false`。
9. 性能：`8/8 @ 60fps`；验证结束后没有 Godot、录片器、性能 runner 或本地服务残留进程。
10. 本任务不是完整 release/export gate，没有运行昂贵的全量 `run_local_ci.mjs`；W016 才重建正式证据。

## 生命周期与下一任务

离线 auditor 的九个缺口精确为：`collisionAudit.valid_report`、`computer_use_report`、`dressed_reference`、`layered_preview`、`runtime_screenshot_coverage`、`performanceReport.valid_report`、`owner_acceptance`、`release_attestation`、`lifecycle_released_and_enabled`。前六项由 W016 基于 W013–W015 同一最终候选重建，后三项仍需 W017 明确发布决定。

下一任务为 `R1.W015 AUTO｜Firebud v2 角色／地表／物件比例、清晰度与光照统一`。除三类素材的视觉权重、边缘锐度、体量和明暗关系外，先修复本轮终点补图暴露的玩家完整 alpha 靠近小地图问题，再用同机位真实 Main idle/moving 画面复验；不能用整体模糊、全局压暗、缩小人物或放宽 HUD 门禁冒充完成。
