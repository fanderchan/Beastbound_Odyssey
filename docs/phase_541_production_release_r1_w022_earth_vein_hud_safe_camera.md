# Phase 541：R1.W022 岩脉洞穴四层 HUD 安全相机与端点构图

## 结论

R1.W022 已完成。岩脉洞穴四层在真实 `Main.tscn / 1280×720` 中，不再把出生点、出口、上下楼或
F4 双共鸣台交给地图边缘 clamp 和固定 HUD 碰运气。10 个可达端点场景全部通过：玩家完整动作
alpha 位于安全世界带且不碰固定 HUD，指定楼梯／出口／共鸣台进入真实视口且不裁边，所有可见
blocking／interaction 物件均不被任务栏或其他固定 HUD 覆盖。

本阶段没有修改任何权威地图 JSON、`blockedCells`、warp、interaction cell、遭遇或玩法拓扑，也没有
改候选生命周期。Earth Vein 继续为
`owner_review_pending / pending / releaseApproved=false / runtimeEnabled=false`；没有生成 owner
acceptance、decision、digest、attestation，也没有执行 promotion。R1.W022 的工程通过不等于地图 v1
最终美术接受。

## 实现边界

### 精确候选相机档案

- 只对精确 `earth_vein_cave_visual_v1` 的 released 状态，或显式 QA preview 的精确
  `owner_review_pending` 候选启用 Earth Vein 相机档案；普通未授权候选继续失败关闭。
- 采用 `1.52×` zoom。它是端点安全构图的必要条件：原 `1.0×` 下左／右端点无法同时避开顶栏与任务栏；
  当前完整玩家 alpha 为 `121.478..125.856px`，进入 PC 世界 `120..150px` 基线。R1.W023 仍负责地图
  物件相对比例、密度和逐层视觉层级，不因本阶段提前完成。
- camera limits 在当前地图原边界上只扩展到正式 spawn 与 interaction focus point 可达到配置安全锚点
  的最小范围；不改格子、碰撞或可达性。扩展结果按地图、视觉 revision、视口、zoom、HUD 安全区和
  endpoint 档案精确缓存，避免每帧重复求解。

### HUD 与地标构图

- 顶栏阻挡使用正式 HUD 当前真正可见控件的并集，不再把透明 `330×145` 容器空白误判成不可用区域；
  折叠与展开状态分别受测试约束，空集合才回退到根容器。
- 地标 solver 对 Earth Vein 允许从 HUD 两侧寻找确定性候选，同时把玩家和 interaction 物件设为优先
  主体；优先主体若被完全推出视口或裁边，会先于普通装饰物计入失败分数。F4 双柱因此不会出现“保住
  一根、把另一根推出画面”的假通过。
- composition 只扫描当前 prepared visual 的 opaque alpha rect，subject 集合按地图／revision 缓存；
  未把完整地图每帧扫描带回 `_process` 热路径。

### 相机移动期间的真实点击

性能压力复证暴露出一个同根因输入缺陷：repath debounce 原来缓存屏幕像素，等待期间相机移动后，同一
像素会解析到邻格。现在输入当帧冻结 world point，延迟解析仍可合并路径，但最终目标不会随相机漂移；
NPC alpha hit 也改为从冻结 world point 解析。`--auto-camera-click-check` 新增“排队后移动相机仍命中原格”
回归门。

性能证据解析器同时与既有运行时合同对齐：burst 可以出现 `0 < applied <= resolved < accepted`，因为
已解析目标仍可能在应用前被下一目标覆盖；仍严格拒绝零应用、未接受点击、`applied > resolved`、未停稳
或最终目标不一致。

## 端点矩阵

每个 focus cell 都先从权威 default spawn 用 `IsoMapModel.find_path` 证明可达，再在真实 Main 中放置
玩家并等待渲染稳定。所有场景均为 `PASS`：

| 场景 | 地图 / focus cell | 必须完整可见 | 生效锚点 |
|---|---|---|---|
| f1_exit | F1 `(4,20)` | `f1_exit_arch` | `(640.000,369.922)` |
| f1_upper_stair | F1 `(21,7)` | `f1_upper_arch` | `(640.000,360.000)` |
| f2_lower_stair | F2 `(5,20)` | `f2_lower_arch` | `(481.600,369.922)` |
| f2_upper_stair | F2 `(21,7)` | `f2_upper_arch` | `(486.600,360.000)` |
| f3_lower_stair | F3 `(5,20)` | `f3_lower_arch` | `(542.400,369.922)` |
| f3_upper_stair | F3 `(21,7)` | `f3_upper_arch` | `(640.000,360.000)` |
| f4_lower_stair | F4 `(5,22)` | `f4_lower_arch` | `(640.000,369.922)` |
| f4_guardian | F4 `(21,8)` | `f4_guardian_plinth` | `(450.200,360.000)` |
| f4_lineage | F4 `(25,13)` | `f4_lineage_plinth` | `(495.786,360.000)` |
| f4_dual_resonance | F4 `(22,11)` | 两座 plinth | `(434.986,317.706)` |

最终回执为 `scenarioCount=10 / passedScenarioCount=10 / errors=[]`。固定 automation lane 每轮清理，真实
玩家目录前后 SHA-256 均为
`d6b1961ed53be04c8b8f1c398e5f5daec4d361a3c69033aee66dbb306e1310f0`。

## 性能

最终矩阵覆盖四图 `baseline/candidate × idle/moving` 共 16 个真实 Metal Main 进程。moving 均通过真实
跨帧 `Input.parse_input_event`、路径合并、停稳和最终目标精确命中；所有进程独立使用并清理 automation
lane。

| 地图 | baseline idle / moving mean | candidate idle / moving mean | idle / moving delta | 四门 |
|---|---:|---:|---:|---|
| F1 | `0.205 / 0.145ms` | `0.284 / 0.285ms` | `+0.079 / +0.140ms` | PASS |
| F2 | `0.223 / 0.155ms` | `0.306 / 0.415ms` | `+0.083 / +0.260ms` | PASS |
| F3 | `0.242 / 0.210ms` | `0.300 / 0.365ms` | `+0.058 / +0.155ms` | PASS |
| F4 | `0.263 / 0.145ms` | `0.326 / 0.385ms` | `+0.063 / +0.240ms` | PASS |

门槛保持原值：candidate idle `<=0.5ms`、moving `<=0.6ms`，idle regression `<=0.1ms`、moving
regression `<=0.35ms`。最终矩阵规范化摘要 SHA-256 为
`dab9362ebe6ac24a3fab1f3239b2dca23099d24e90ae4d016aa551b7010c5572`。

## 最终录片与视觉判断

`r1-w022-camera-final2` 使用当前最终源码重录四层 idle/moving：

- MP4：`64.4s / 1932 frames / 1280×720 / 30 FPS / 1×`，完整音视频 decode PASS，SHA-256
  `bab4fb5c1761713113c2436623bea7a99d450a3ed03b1a1831bc792b6657c6e2`；
- contact sheet：8 个样本，SHA-256
  `9412b131664c0652e2cba2169c1ba12c9ad0624ea65ab3279ee6191e22d2f999`；
- summary：8/8 capture 与 native 回执 PASS、每段资源收口 PASS、HUD overlap 均为空，SHA-256
  `6a041988ab2c364947171648a7e864a4489987b9f650fe71a87a440d57be34fe`；
- `ownerReviewStatus` 仍为 `pending`。

受委托目视检查确认：四层入口构图不再像 Phase 539 那样把人物压到 `82px` 或让右侧物件钻入任务栏；
F4 `(22,11)` 实帧中人物和两座共鸣台均完整、上下层次清楚，任务栏与底栏没有切主体。当前仍能看到一至
三层 kit 重复、路线密度和视觉节奏偏同质，这是 R1.W023 的明确输入，不在本阶段伪装为完成。

F4 专项控制器 `r1-w022-f4-landmarks-final1` 仍如实返回
`runtimeCleanup.status=failed / reason=audio_playback_not_disabled`，回执 SHA-256
`3eba407302a11647bf31671e8980d459c137d98e405887b173e9303a2e23990f`。该帧只用于定位构图，不算通过
证据；AudioManager 停播、解绑和专项片重录仍由已规划的 R1.W024 负责。

## 自动验证

- 最终 Godot parse + camera/click/profile/map runtime/movement/pathfinding/map transfer/task route/panel：
  `10/10 PASS`，摘要 SHA-256
  `03a5169cf402164ab95826779633f60cde34a1711cf93f4f811f3a9f674eb4cd`；
- `world_camera_safe_area_model_check.gd`：`errors=[]`，endpoint focus 精确投影到 `(640,360)`；
- `world_hud_awakened_view_check.gd`：`errors=[] / rollbackRestored=true / restoredCount=31`；
- `earth_vein_camera_composition_check.gd`：真实 Main 10/10；
- Python map evidence/performance/owner-review 工具：`37/37 PASS`；
- QA user-data lane source contract：PASS；
- `git diff --check`：PASS；
- 未运行完整 `node tools/run_local_ci.mjs`：本阶段按仓库规则使用覆盖改动面的定向门，没有把未运行的
  全量 CI 写成通过。

## 下一步

游标进入 R1.W023：在保留本阶段相机、点击、HUD 与权威拓扑合同的前提下，重做一至三层密度／地标
节奏和四层物件相对比例，并把“洞穴无常驻 NPC”作为明确 non-applicable 规则或走正式 NPC 管线。
R1.W024 再统一收口四层与 F4 录片 AudioManager 生命周期并重冻精确证据。
