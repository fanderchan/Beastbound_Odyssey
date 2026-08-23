# Phase 516：生产发布 R1.W005 Firebud v2 密度、比例、光照与生活感统一

日期：2026-08-23

## 目标与结论

本阶段只关闭 `R1.W005 AUTO｜Firebud v2 密度、比例、光照与生活感统一`。返工后的正常 `1280×720` 中文 PC 画面不再让村口服务 NPC、任务标记和高亮道具同时争抢注意力：初始安全画幅内的 NPC 脚点由 `7` 个降到 `4` 个，基础服务留在到达区，三项进阶／商业服务移入东侧服务台地；任务标记保留关键状态和玩家正在操作的目标，并把普通环境提示限制为至多两个。训练靶、陶罐、围栏、矿石、花草和服务物件统一缩小并压低过亮度，角色重新成为主要阅读层，中央通行带和训练层级保持清楚。

NPC 继续由 actor catalog 独立渲染，没有任何人物被烘焙进地图；本阶段也没有改写 81 张 PNG、atlas、binding、warp、spawn、`blockedCells`、collision footprint、任务状态、服务类型或服务权限。真实 `Main.tscn` 四段视频、v1/v2 八格性能矩阵、客户端／服务端交互回归和 bundle 审计均通过。候选仍为 `owner_review_pending`、普通玩家不可达；W006 的正式十动作证据冻结、W007 的 OWNER 复验以及 R1.02 promotion 均未提前执行。

## 参考意图与 Beastbound 原则

本阶段继续采用本地 StoneAge 8.0 参考所体现的成熟阅读原则：到达区先读玩家、主路和基础服务，进阶商业服务沿支路自然展开；场景道具建立生活感，但不能比人物和交互目标更亮、更大。只继承空间与信息层级意图，不复制参考地图、坐标、人物、美术或数值。

Beastbound 的具体规则为：

- 玩家、可交互 NPC 和当前关键目标优先于装饰物；
- 生活感来自服务簇、训练设施、摊位和植被之间的关系，不靠继续堆满同屏内容；
- 命名 NPC 的 `npcId`、身份、服务、对白和 appearance 合同与其地图位置分离；
- 视觉缩放和中性调光不得改变权威网格碰撞或服务接近距离；
- 所有普通提示状态继续计算，显示密度收敛不得偷偷改变任务拓扑。

## 实现

### 1. 村口 NPC 密度与服务层级

本阶段只移动以下三名既有命名 NPC：

| NPC | 服务 | 旧格 | 新格 | 保持不变 |
|---|---|---:|---:|---|
| `firebud_welfare_clerk`／福利员阿檀 | `welfare`／登记 | `[7,10]` | `[7,8]` | `npcId`、对白、`npc_welfare_clerk_f_v1`、south、block |
| `firebud_equipment_keeper`／装备商阿石 | `equipment_shop`／`firebud_equipment_shop` | `[6,12]` | `[8,10]` | `npcId`、商店、对白、`npc_equipment_artisan_m_v1`、south、block |
| `firebud_diamond_keeper`／钻石商阿璨 | `diamond_shop`／`firebud_diamond_shop` | `[9,13]` | `[10,12]` | `npcId`、商店、对白、`npc_diamond_merchant_m_v1`、south、block |

三者从初始安全画幅移到东侧服务台地，没有删除服务或改变玩家功能拓扑。村口仍有 `14` 名 NPC，最小投影脚点间距保持 `72.11px`，遇敌区 NPC 为 `0`，中央主路继续无 NPC，占位与所有 NPC approach 均可达。初始安全画幅内保留的四名 NPC 为：

- `village_guard`；
- `firebud_shopkeeper`；
- `firebud_riding_trainer`；
- `firebud_bank_keeper`。

`firebud_village_service_layout_check.gd` 冻结了真实 W004 构图参数：zoom `1.55`、玩家锚点 `[390,360]`、安全矩形 `[8,8,955,486]`，并把初始安全画幅 NPC 上限定为 `5`；当前实际为 `4`。服务端仍按权威 NPC 身份和精确位置验证服务距离，Node 回归证明三项服务没有因移动而变成远程权限或不可接近。

### 2. 任务标记只收敛显示，不收敛状态

新增的 `QuestMarkerVisibilityModel` 只决定哪些已经计算出的标记进入 world overlay：

- `ready`、`rebirth_ready`、`in_progress` 始终显示；
- 当前选中或对话中的 item 始终显示；
- 其他环境标记按状态优先级、玩家格距离、稳定 item ID 排序，至多显示两个；
- `blocked` 只在切比雪夫距离不超过两格时作为环境提示显示，但选中目标不受该距离限制。

任务状态、自动寻路、对话和服务 item 仍全部存在。overlay 只在玩家跨越 grid cell、任务／选择／对话或 foreground revision 改变时更新；没有把完整任务扫描放入逐帧 draw 热路径。自动检查覆盖关键状态常显、近邻两个保留、第三个环境标记隐藏、远端 blocked 隐藏和选中远端 blocked 可见。

### 3. 物件比例与中性场景调光

manifest 新增可选 `colorModulate=[r,g,b,a]` 合同。四通道必须是有限的 `(0,1]`，缺省为白色；catalog、immediate renderer、world depth layer 和 foreground overlay 使用同一值。它用于运行时场景层级校正，不允许隐藏未完成或来源不明资产。

最终冻结的 15 类物件合同如下：

| objectId | displaySize | 中性调光 | 角色 |
|---|---:|---:|---|
| `firebud_training_target` | `96×88` | `0.82` | blocking |
| `firebud_supply_pots` | `98×84` | `0.80` | blocking |
| `firebud_low_planter` | `102×82` | `0.84` | blocking |
| `firebud_low_fence` | `112×97` | `0.88` | blocking |
| `firebud_service_pavilion` | `204×205` | `0.82` | blocking |
| `firebud_ancient_tree` | `340×274` | `0.85` | blocking |
| `firebud_ancient_tree_scenery` | `288×232` | `0.85` | decorative |
| `firebud_ember_shrub` | `100×77` | `0.76` | blocking |
| `firebud_honey_rock_cluster` | `100×89` | `0.74` | blocking |
| `firebud_flower_meadow_decal` | `88×57` | `0.72` | decorative |
| `firebud_stone_totem` | `66×72` | `0.86` | interaction |
| `firebud_training_rack` | `108×115` | `0.82` | blocking |
| `firebud_practice_cluster` | `102×120` | `0.80` | blocking |
| `firebud_trade_counter` | `112×96` | `0.84` | blocking |
| `firebud_grass_scatter_decal` | `92×60` | `0.74` | decorative |

这些调整只改变 display size 和 runtime modulate；源 PNG、asset SHA、alpha、anchor、sort point、render layer、collision role、collision polygon 和 binding placement 均保持。`map_visual_review_catalog_check.gd` 精确冻结全部 15 项，并验证 `source.bakedActors=false` 及调光跨 renderer/layer 传播。

### 4. 性能探针的相机启动竞态

第一次和第二次八格性能运行分别保留在：

- `.run/evidence/r1_w005/performance/r1-w005-density-perf-20260823-a/`；
- `.run/evidence/r1_w005/performance/r1-w005-density-perf-20260823-b/`。

两次都在 v2 村口 moving 稳定复现同一 QA 探针根因：deferred movement spam 在 `Camera2D` 发布有效 screen center 前立即投影 120 个候选；没有可点目标时循环不产生 `await`，因此同一帧得到 `clicks=0 / ui_skipped=116 / interaction_skipped=4`，只有一份 perf sample 后正确失败关闭。这不是地图移动 PASS，也没有被重跑掩盖。

探针现在最多等待 8 个 process frame，并要求玩家 screen point 连续两帧位于 viewport 且变化不超过 `0.25px`，之后才发送真实鼠标事件；最终各 moving 运行实际等待 `2–3` 帧，均输出 `projection_ready=true`。这个等待只在显式 `--movement-spam-click-check` QA 路径生效，不进入普通玩家运行时。

## 权威合同与冻结哈希

| 合同 | 训练场 | 村口 |
|---|---|---|
| v2 binding | `2775987fa144e2a7f337a03d871bcd835d176e9af7a5461024997a0e3aaed073` | `0a97650b8a8781f4831881cbf99adbc76d3a2287bdd08ef7aeaf17a15fb33252` |
| 权威 map JSON | `37279c76ff265927ef8eb042ed0b8460e34aa91687070aff14029307adc71c51` | `c27d3aff3791ececc7e0cf9ec952dd37361e23a358fa8b111d6939bc88f0fe05` |

训练场 map 与两份 binding 未改；村口 map hash 只因上表三名 NPC 坐标显式改变。最终冻结证据为：

| 证据 | SHA-256 |
|---|---|
| catalog contract | `3f09be532a8fd9df7c43fda803af4b2a3530fa5e8ba1e3e0eac700bd4440a6eb` |
| collision runner receipt | `cce452f9ecdf0fd7d75c59f05b3f447e01d1bcd52f21bc884e1158270f46382a` |
| collision audit | `583113fbaa9c99abf6dfe0a74955ee58762c566bcdb3a8e585d47fdb0d78f670` |

collision build identity：

`git:d94e95e9d2d0910ad525c8ed9f59ea09507338b6+beastbound-map-runtime-surface-v2:113c6955df37a42f9c7765b129bc25403c25f2f9fa2b15e1b8f6430090a043e4`

严格 pending preview 顶层与 v2 bundle report 均为 `PASS`、`errors=[]`、冻结报告校验未跳过；primary v1 与 staged 权威地图不一致仍只在 v1 自己的报告中按设计 fail closed。18 个 blocking placement、47 个 footprint cell、warp、spawn、protected cell 和寻路合同继续成立。

## 真实 Main 视觉证据

最终 W005 复审目录：

`.run/evidence/r1_w005/after/r1-w005-density-20260823-d/`

- 正常 `res://scenes/Main.tscn`；
- `1280×720 / 30fps / 1.00×`，村口／训练场 × idle／moving 四段；
- `840` 帧、`28.0s`，H.264 `yuv420p` 与 AAC 双流完整解码；
- 两段 moving 均以 process frame `9` 按下、frame `11` 抬起的真实 `InputEventMouseButton` 改变玩家格；
- 四段任务 HUD 可见、玩家位于安全区和生效锚点，blocking/interaction overlap 为空；
- 每段 16 个音频流均停止并 detached，manager 已释放；每段 QA lane 均清理，普通玩家目录逐段 `realUnchanged=true`。

| 证据 | SHA-256 |
|---|---|
| `summary.json` | `dd2e05c6ffb80fd9abfe668371811f5b1b6bcebff2583742783f0d6679aebb0c` |
| `SHA256SUMS` | `7198306fa669c0d6d5b8e218bea7bcbbff80136913ba468452406e74970ebef7` |
| 28 秒视频 | `f745df017c43aeed1107e1f87174d2826040ad3931e80ccef09f5d9437441435` |
| 8 帧 contact sheet | `41ff16d88ede107eb480aa32d3a2ab8adc187ee8445362cf49ae17ce83ad999e` |

该材料证明 W005 的真实画面结果，但不会写入 manifest 的正式 evidence slots，也不替代 W006 要求的两图各五动作独立 pair、Computer Use receipt 和同一精确候选的正式冻结。

## 性能证据

最终目录：

`.run/evidence/r1_w005/performance/r1-w005-density-perf-20260823-d/`

性能 build identity 为 `b00958bdd8daee1e6dabc71d387128304d6c22cd2751067a8bc4df248a157937`。v1/v2 × 两图 × idle/moving 共 `8/8 PASS`，全部 `60/60/60fps`；最终 QA lane 每轮均 `cleaned`、普通玩家目录均未改变。

| v2 场景 | process_total min/mean/max | camera min/mean/max | 真实跨帧点击 |
|---|---:|---:|---:|
| 村口 idle | `0.230/0.258/0.300ms` | `0.040/0.046/0.050ms` | 不适用 |
| 村口 moving | `0.240/0.302/0.350ms` | `0.040/0.062/0.090ms` | `22` |
| 训练场 idle | `0.230/0.249/0.260ms` | `0.040/0.049/0.050ms` | 不适用 |
| 训练场 moving | `0.240/0.325/0.510ms` | `0.040/0.045/0.050ms` | `35` |

两组 v2 moving 均为 `moved=true / coalesced=true / settled=true / final_match=true / screen_roundtrip=true`。summary SHA-256 为 `b2aef25ce93a638351fe5794ba74207a7431c5dc4d32106f4a6c3befbb460e4c`，SHA256SUMS SHA-256 为 `2536c1c97df915b190168e3e762742275f211b747c66e3707173aa096631ef3e`。

## 验证

以下检查均在隔离候选工作树执行：

1. 最终 Godot parse 加 movement、pathfinding、showcase profile、Firebud service layout、NPC interaction/collision、map transfer、encounter 和 quest marker 共 `10/10 PASS`。
2. 服务端共享地图／服务权限回归 `42/42 PASS`；三名 NPC 仍需权威身份与当前接近距离，不能由 service metadata 或远端请求越权。
3. 严格 pending runtime 顶层与 v2 均 `PASS / errors=[]`；review catalog 为 `PASS`，含 `firebudVisualHierarchyFrozen=true` 和 `strictPendingReviewFreeze=true`。
4. bundle auditor 单元测试 `17/17`、collision builder `16/16`、性能 runner `6/6` 均通过。
5. 最终 bundle 离线审计检查 `112` 文件、`81` PNG、`5` JSON，结构 `PASS / errors=[]`。
6. 最终真实 Main 四段录片、媒体全流解码、SHA256SUMS、音频释放、QA lane 清理和普通玩家资料不变均通过。
7. Python compile、JSON parse、manifest 证据引用、`git diff --check` 均通过；`.run` 生成物未进入版本控制。

本任务不是阶段 GATE 或正式 release/export 门禁，按仓库定向验证规则没有重复运行完整 `node tools/run_local_ci.mjs`。

## 生命周期、非目标与下一任务

Firebud v2 继续保持：

- `status=owner_review_pending`；
- `ownerReviewStatus=pending`；
- `releaseApproved=false`；
- `runtimeEnabled=false`；
- `ownerAcceptance=null`；
- `releaseAttestation=null`。

离线 auditor 的 `releaseReady=false` 是正确结果：当前仍缺 W006 负责的 dressed/layered preview、正式 runtime screenshot coverage、Computer Use report 和 manifest-bound performance report，以及 W007/R1.02 之后才能产生的 OWNER acceptance、release attestation 与 released/enabled lifecycle。下一任务是 `R1.W006 AUTO｜Firebud v2 精确返工证据重新冻结`。
