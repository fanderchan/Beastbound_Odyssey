# Phase 518：生产发布 R1.W007 Firebud v2 OWNER 二次退回

日期：2026-08-23

## 目标与结论

本阶段只关闭 `R1.W007 OWNER｜Firebud v2 返工后人眼复验`。验收对象是候选分支提交 `2bbdf8418606f1d7b02cd698ec9abe0ce4ce2e24` 中由 Phase 517 精确冻结的 `firebud_region_visual_v2`，不是 Phase 481、Phase 511 或 W003–W005 的已 supersede／阶段性材料，也不是普通玩家当前使用的旧正式地图。

项目所有者已经看过当前候选的 1280×720 真实 `Main.tscn` 地图视频、道路返工前后对照、训练场正式动作帧、工程门禁与审美复核结论。美术总监给出的明确建议是“再次退回 Firebud v2”；项目所有者回复：

> 按你的建议来啊

该回复是对紧邻三选一决策材料中“退回 Firebud v2（建议）”的明确采纳，规范化 OWNER 结论为：

> 退回 Firebud v2 当前精确候选；继续返工后再次审图。

因此本阶段的完成含义是“OWNER 已再次退回、退回根因可审计、后续返工已按独立问题拆分”，不是批准、提升或发布。`R1.02` 不执行，候选仍不可被普通玩家访问。

## 本次 OWNER 审核对象

Phase 517 的精确证据保持：

- Computer Use report SHA-256：`5e293878cf70f121f0e6c3e694c246f9a362b1acaeaca9d30e3190f94e92c613`；
- collision audit SHA-256：`ec794b32b75599b00caadb48f117b0222c2442e3925f27815abe6bab2dd1a889`；
- performance report SHA-256：`b9ae1c47590e5e231d2e533c85de0807b16342b07c2fb6d88ee10e2f7d5ba5b2`；
- 28 秒真实 Main 视频 SHA-256：`f745df017c43aeed1107e1f87174d2826040ad3931e80ccef09f5d9437441435`；
- 两图各 `pointer / movement_path / warp / collision / occlusion` 共十组正式 Main pair；
- 真实 Computer Use `2 × 5` 动作矩阵、20 张原始前后帧和十份独立 action receipt；
- `legacy_fallback / map_visual_candidate × 两图 × idle / moving` 性能矩阵 `8/8 @ 60fps`；
- Godot encounter 检查确认村口遇敌区可达并实际得到 `battle_started=true`。

另有当前精确 HEAD 的普通 10v10 Main 战斗布局复核片，证明战斗画面可进入并保持既有 20 席合同；它只用于说明 Firebud 路径后的战斗承接，不把战场、人物或宠物候选美术一并视为 OWNER 通过。Firebud 的本次退回也不替代后续独立战斗美术验收。

自动证据本身是可信的：十动作、权威碰撞、双向 warp、NPC approach、遇敌、视频解码、性能和隔离收口均已通过。本次退回只说明这些工程证据不能替代 1280×720 实机画面的商业审美冻结线。

## 二次退回依据

### 1. 道路、广场与草地过渡仍有明显格块感

W003 的 v3 atlas 把草地 mask 覆盖和羽化做成了可量化、可重复的 15 组合实现，但当前训练场和村口的正常 1280×720 画面仍能直接读出红土路、石板广场与草地之间的方格边界、硬直角和阶梯式拼接。W003 同机位前后图在最终游戏尺寸下差异很弱，说明数值覆盖率上升没有转化成足够明显的玩家视觉改善。

下一版必须以真实 Main 画面为目标重新创作边缘轮廓和材质衔接，不能继续只调膨胀／羽化参数或用自动 mask 指标宣称完成。`80×40` 语义格、15 组合选择、道路连通、碰撞、寻路、warp、protected 与权威地图事实仍必须保持不变。

### 2. 村口右下服务区与 HUD 边缘构图仍偏拥挤

W005 已把初始安全画幅 NPC 脚点从 `7` 降到 `4`，中央通行带也比旧稿清楚；但实际移动、碰撞和遮挡帧中，村口右下仍有 NPC、服务物件、底栏入口和屏幕边缘同时争抢注意力，部分人物／环境轮廓进入底栏或任务栏周边，画面依然更像展示候选而不是稳定生活区。

现有 W004 安全区检查主要证明玩家、warp 与 `blocking|interaction` 物件没有被任务栏几何遮挡，不能代替对完整 NPC alpha 轮廓、底栏遮挡和整幅留白的审美判断。后续必须保留 14 名 NPC 的身份、服务、对白、appearance、权威 approach 与中央主路，不能靠删除功能对象或隐藏 HUD 解决密度问题。

### 3. 正式动作帧的 HUD 字形呈现不稳定

W006 冻结的部分 `warp`／`occlusion` PNG 及对应 Computer Use 后帧中，右侧任务栏虽然几何上 `taskHudVisible=true`，但页签、任务条目或“自动寻路”按钮出现整段空白／只剩部分字形。当前证据不能区分这是截图时机、Metal／字体 atlas 重绘、Computer Use 增量帧合成，还是玩家运行时的真实短暂缺字。

在根因明确前，不能把“Control 节点可见”冒充“玩家看见了完整稳定 HUD”。后续必须在同一真实 Main 运行中冻结连续帧与视频，证明任务栏标题、正文和按钮字形在移动、warp、遮挡及镜头重定位后完整稳定；如果只是取证合成缺陷，也必须修正取证链并重冻干净材料。

## 动态返工路由

依据“一项只处理一个根因、一个资产或一个风险点”，本次再次退回拆成：

1. `R1.W008 AUTO｜Firebud v2 道路、广场与草地过渡二次美术重制`：以正常 1280×720 Main 画面消除明显方格、硬直角和阶梯拼接，保持全部玩法拓扑；
2. `R1.W009 AUTO｜Firebud v2 村口右下服务区与 HUD 边缘构图二次收敛`：保留 14 名 NPC 与服务合同，收敛右下密度、人物／物件层级及底栏／任务栏边缘遮挡；
3. `R1.W010 AUTO｜Firebud v2 正式动作帧 HUD 字形稳定性根因与修复`：复现并判定缺字属于 runtime 还是取证链，修复根因并增加连续帧门禁；
4. `R1.W011 AUTO｜Firebud v2 二次返工精确证据重新冻结`：在同一最终候选上 supersede W006，重建十动作、Computer Use、视频、collision/catalog/performance 与离线审计；
5. `R1.W012 OWNER｜Firebud v2 二次返工后人眼复验`：再次向项目所有者展示精确材料并取得批准、退回或首发延期决定。

`R1.02` 改为依赖 `R1.W012`。W008–W010 不得各自改写 owner 接受；W011 只重新冻结自动证据；只有 W012 的新明确批准才能进入 promotion。

## 生命周期与验证

本阶段不修改 map bundle、atlas、binding、权威地图 JSON、NPC、HUD 代码、运行时 catalog 或任何玩家数据。受审候选继续保持：

- `status=owner_review_pending`；
- `ownerReviewStatus=pending`；
- `releaseApproved=false`；
- `runtimeEnabled=false`；
- `ownerAcceptance=null`；
- `releaseAttestation=null`。

只读离线 auditor 对当前精确 bundle 再次检查 `165 files / 91 PNG / 17 JSON`，结果为 `status=PASS / errors=[] / releaseReady=false`；缺口仍精确是 `lifecycle_released_and_enabled`、`owner_acceptance`、`release_attestation`。该结果证明拒绝记录没有误改候选字节，也明确证明它仍不可发布。

本阶段只改发布计划和本 phase note。验证包括 Markdown／计划结构检查、稳定任务 ID／依赖检查、`git diff --check`、bundle 生命周期只读复核和精确路径 diff；没有运行完整本地 CI，因为没有代码、数据、资源或运行时行为变更。

## 下一任务

下一任务是 `R1.W008 AUTO｜Firebud v2 道路、广场与草地过渡二次美术重制`。本阶段到此结束，不在同一轮开始修改地图像素。
