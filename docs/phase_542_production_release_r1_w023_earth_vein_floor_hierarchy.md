# Phase 542：R1.W023 岩脉洞穴主体比例、密度与逐层层级重做

## 结论

R1.W023 已完成。岩脉洞穴四层不再复用同一组五件小装饰形成近似克隆画面，而是建立了可从真实
`Main.tscn / 1280×720` 实帧辨认的四段节奏：一层稀疏门厅、二层潮湿菌缝、三层压缩晶脉、四层双
共鸣圣所。四层物件总数变为 `14 / 17 / 19 / 14`，其中小型装饰为 `4 / 7 / 9 / 4`；一至三层密度
逐层增加，四层主动收空，让两座正式共鸣台成为终局焦点。

真实像素门证明玩家完整动作 alpha 为约 `124.762px`，处于 PC 世界 `120..150px` 目标区间；小型物件
与玩家高度比为 `0.846..1.023`，建筑物为 `1.328..2.558`，F4 共鸣台为 `1.340`。四个层级场景、十个
出生／楼梯／出口／共鸣台端点、十项相邻客户端回归和十六格性能矩阵全部通过。

本阶段没有修改权威地图 JSON、`blockedCells`、warp、interaction cell、遭遇、战斗或玩法拓扑，也没有
提升候选生命周期。Earth Vein 继续为
`owner_review_pending / pending / releaseApproved=false / runtimeEnabled=false`，普通玩家不可达；工程
通过不等于 owner acceptance 或生产发布。

## 参考与原创边界

- 先只读检查本地 StoneAge 8.0 的多层洞窟样本。成熟样本会改变各层物件占用和地标节奏，而不是逐层
  克隆；对应样本没有为每层强塞常驻 NPC。
- 本阶段只采用“逐层密度变化、终层主动留白”的行为与布局意图，没有复制 StoneAge 的地图、坐标、
  数值、脚本、音频或美术。
- 继续复用项目已有、来源与替换路径齐全的原创 cave kit；当前素材足以解决层级问题，因此没有为了
  数量重新生成另一套风格不稳定的资产。

## 四层层级合同

| 楼层 | 角色 | 小型装饰 | 主导母题 | 总物件 | 视觉目的 |
|---|---|---:|---|---:|---|
| F1 | `threshold_gallery` | `4` | 石堆 `3` | `14` | 稀疏入口，保留一簇晶体作为向下预告 |
| F2 | `damp_fungus_seam` | `7` | 苔菌 `4` | `17` | 潮湿口袋和菌缝形成中段变化 |
| F3 | `compressed_crystal_vein` | `9` | 晶簇 `6` | `19` | 密度峰值，形成被晶脉压缩的推进感 |
| F4 | `dual_resonance_sanctum` | `4` | 共鸣台 `2` | `14` | 密度重置，让两座交互地标而非杂物主导 |

每个 binding 都声明精确 `presentationProfile`，新
`earth_vein_floor_hierarchy_check.gd` 同时校验 profile、manifest binding SHA-256、对象数量、主导母题、
逐层密度关系与真实 Main 可见性。静态四层与以下四个运行场景全部 `PASS`：

- F1 出口：可见小型物件 `1`，指定晶簇完整可见；
- F2 中段：可见小型物件 `4`，两处指定苔菌完整可见；
- F3 中段：可见小型物件 `4`，两处指定晶簇完整可见；
- F4 双共鸣区：可见小型物件 `1`，两座共鸣台同时完整可见。

层级回执为 `errors=[]`，日志 SHA-256 为
`49bab1c5d105ce33a643b81d78cc2b6b1fc5f88185fc9e67988a1233a6f344ca`。

## 主体相对比例与 NPC 边界

比例门直接读取真实 `MapVisualRenderer` command 和纹理 opaque alpha，不依赖 manifest 标称尺寸：

- 玩家完整动作 alpha：`124.762px`，目标 `120..150px`；
- cairn／crystal／fungus／rock 等小型物件：玩家的 `0.846..1.023×`，门限 `0.80..1.10×`；
- ridge／buttress／pillar／stair arch：玩家的 `1.328..2.558×`，门限 `1.25..2.75×`；
- F4 两座 resonance plinth：玩家的 `1.340×`，门限 `1.25..1.45×`。

洞穴常驻 NPC 明确为
`not_applicable_environmental_interactions`。这是孤立训练／挑战洞窟，没有商店、对话或常驻服务角色；
上下层引导由正式 stair arch，终层守护／血脉选择由两座正式 interaction plinth 承担。真实场景的 NPC
subject 和 NPC depth command 均为 `0`。因此不为了满足一项通用比例字段塞入占位人形；以后若产品增加
常驻角色，必须复用正式 appearance 或走 NPC 真八向生产管线。

比例报告对 Earth Vein 显式返回 `npcRatioStatus=not_applicable`，而不是把零 NPC 写成假失败；其他地图原有
行为不变。

## 相机、HUD 与权威合同复证

- `earth_vein_camera_composition_check.gd` 重新覆盖四层十个可达端点，结果
  `scenarioCount=10 / passedScenarioCount=10 / errors=[]`；玩家、指定地标、固定 HUD 和任务栏合同保持通过，
  日志 SHA-256 为 `af4e27a3b7f98f1e3af4da8df4a370b796f5b53150307049df527a9fd39c83fd`。
- 当前 catalog contract 对四层对象数冻结为 `14 / 17 / 19 / 14`，SHA-256 为
  `c63e0f1575636dcb2600a0e8c1fd38504899bedca75d91565e257fd28611d04f`。
- 只读 pending preview 的碰撞回执和报告分别为
  `45971774af9908a4cdf6547bb7c4e22095bd4bc1bcdcb49dda090b71a8f2180c`、
  `5083ae79e2be71e52d3b634c4a862456e6612fd1ec76fe3f0619b51e250e1f0d`；权威 blockedCells、物件 footprint、
  spawn／warp／interaction 保护、遭遇格、精确路径和 binding／map-data hash 全部通过。

## 性能

最终矩阵覆盖四图 `baseline/candidate × idle/moving` 共 16 个真实 Metal Main 进程。moving 使用真实跨帧
输入、合并、停稳和最终目标命中；每个进程独立创建、验证并清理 automation lane。

| 地图 | baseline idle / moving mean | candidate idle / moving mean | idle / moving delta | 四门 |
|---|---:|---:|---:|---|
| F1 | `0.200 / 0.175ms` | `0.279 / 0.300ms` | `+0.079 / +0.125ms` | PASS |
| F2 | `0.223 / 0.155ms` | `0.315 / 0.430ms` | `+0.092 / +0.275ms` | PASS |
| F3 | `0.246 / 0.180ms` | `0.304 / 0.370ms` | `+0.058 / +0.190ms` | PASS |
| F4 | `0.237 / 0.145ms` | `0.304 / 0.365ms` | `+0.067 / +0.220ms` | PASS |

所有 candidate idle／moving 均低于 `0.5 / 0.6ms`，回归均低于 `0.1 / 0.35ms`。原始 16-run 回执
SHA-256 为 `c232d86ef31fdf37315e1436f57de9f8c2c4ecdd3508e1825a3cf1ec89b256c3`，报告 SHA-256 为
`8fb55fa5b094c16f1eaa99f18a64e4f9c68a9b2be58ad082fab5006f05898ee2`。

性能实跑还复现了健康合并：F1／F4 candidate moving 为
`0 < applied=3 <= resolved=4 < accepted=6`。运行时解析器已经接受“目标已解析但在应用前被下一目标覆盖”，
地图 bundle 审计器仍要求 `applied == resolved`。本阶段把审计合同同步为
`0 < applied <= resolved < accepted`，并新增“允许覆盖、拒绝无解析应用、必须发生 burst collapse”三项
回归；没有放宽停稳、最终目标、真实移动或输入门槛。

## 最终录片与视觉判断

`r1-w023-floor-hierarchy-final1` 使用当前源码录制四层 idle/moving 共八段：

- MP4：`64.4s / 1932 frames / 1280×720 / 30 FPS / 1×`，完整音视频 decode PASS，SHA-256
  `a6d12ef29f968b29042242ef7817ea3c32bd19e83b685f25deb7c21e960cce44`；
- contact sheet：八个样本，SHA-256
  `bd6ac4829f2f9571a753b72ca8cad7a1f491ac2e126f636cfd1e31d77b96ec5f`；
- summary：八段 native capture、资源清理、lane 和玩家目录回执均通过，SHA-256
  `ac1a0a67b3de32c0320a951c39e9205ec6ccd6af698e5d02dd1e787a04e347bd`；
- `ownerReviewStatus` 仍为 `pending`。

受委托目视检查确认：F1 入口留白与单晶预告清楚，F2 苔菌团形成潮湿段落，F3 晶簇数量和亮色节奏明显
达到峰值，F4 重新收空，没有让普通杂物抢走共鸣台层级。现有 kit 的整体棕灰色调仍保持同一洞窟家族，
变化来自布局节奏而不是四套互不相干的皮肤。

这次完整四层 recorder 已收口，但不替代 R1.W024：历史 F4 专项控制器仍有
`audio_playback_not_disabled`，且 manifest 内完整路线、入口／出口、遮挡、碰撞、交互边界、遭遇、战斗切换
等正式 action evidence 仍需在同一最终候选统一重冻。

## 自动验证

- Godot parse + camera/click/profile/map runtime/movement/pathfinding/map transfer/task route/panel：
  `10/10 PASS`，摘要 SHA-256
  `54b18207a4914b8041493df84cbcbac034a9ac5f948f6c7b0a650537caf23cf4`；
- Earth Vein 层级真实 Main：`4/4 PASS`；端点相机真实 Main：`10/10 PASS`；
- map evidence／performance／owner-review／release 工具：`48/48 PASS`；
- map bundle auditor 专项：`20/20 PASS`；
- 严格 bundle 审计：`158 files / 29 JSON / 47 PNG / errors=[]`；未发布缺口精确为
  lifecycle、owner acceptance、release attestation；
- `git diff --check` 与所有改动 JSON 解析：PASS；
- 每轮 automation lane 均清理，真实玩家目录 SHA-256 前后保持
  `d6b1961ed53be04c8b8f1c398e5f5daec4d361a3c69033aee66dbb306e1310f0`；仅保留用户已有 Godot editor；
- 未运行完整 `node tools/run_local_ci.mjs`：本阶段按仓库规则使用覆盖改动面的定向门，没有把未运行的全量
  CI 写成通过。

## 下一步

游标进入 R1.W024：修正四层与 F4 专项录片控制器的 AudioManager 停播、解绑和播放器清理，再以当前
精确候选重冻完整动作、碰撞、交互、遭遇、战斗切换、性能、lane 与玩家目录证据。R1.W025 才进行受
委托逐帧复验；没有项目所有者亲签时仍不得生成 owner acceptance。
