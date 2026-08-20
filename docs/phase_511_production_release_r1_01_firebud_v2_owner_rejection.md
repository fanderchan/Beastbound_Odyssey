# Phase 511：生产发布 R1.01 Firebud Village v2 OWNER 退回

日期：2026-08-21

## 目标与结论

本阶段只关闭 `R1.01 OWNER｜Firebud Village v2 人眼验收`。验收对象是候选分支提交 `23d0cf178d97c6ea14672a52821c761f8b018c6e` 中仍为 `owner_review_pending` 的 `firebud_region_visual_v2`，不是旧 Phase 481 的已 supersede 证据，也不是普通玩家当前使用的 v1。

项目所有者在看过当前精确候选的真实 `Main.tscn` 村口、移动后画面、训练场、性能与失败证据后明确决定：

> 退回 Firebud Village v2：修正碰撞/哈希与录片收口，重做道路过渡、UI安全区和密度比例后再审

因此 R1.01 的完成含义是“OWNER 已明确退回并建立可执行返工路由”，不是批准、提升或发布。manifest 生命周期保持：

- `status=owner_review_pending`；
- `ownerReviewStatus=pending`；
- `releaseApproved=false`；
- `runtimeEnabled=false`；
- `releaseAttestation=null`；
- `ownerAcceptance=null`。

本阶段不执行 R1.02，不修改 Firebud bundle、地图数据、运行时代码或玩家 UI，也不勾选 `stoneage_gap_plan.md` 父项。

## 本次 OWNER 看到的精确材料

受审提交 `23d0cf178d97c6ea14672a52821c761f8b018c6e` 的临时审核包保存在已忽略目录 `.run/evidence/r1_01_firebud_owner_review/`，其中包括：

- 村口真实 Main 静止帧与移动后帧；
- 村口 `1280×720 / 30fps / H.264 + AAC` 静止短片；
- 训练场真实 Main 静止帧；
- bundle 审计、Godot 解析、目标检查、性能摘要和完整录片失败回执；
- OWNER 三选一决策材料。

这些材料来自显式候选预览和固定 automation QA lane；没有登录、后端、MySQL 或玩家档案写入。旧 Phase 481 图片和 Computer Use 证据仍由当前 manifest 标为 superseded，没有被当成本次可批准材料。

## 退回依据

### 1. 权威碰撞与哈希没有闭合

bundle 文件级离线审计为结构 `PASS`，但 `releaseReady=false`。严格地图 runtime 检查在当前候选复现：

- 训练场 8 个 `blocking footprint` 未绑定到权威 `blockedCells`；
- 村口 5 个 `blocking footprint` 未绑定到权威 `blockedCells`；
- 村口花坛 `(6,18)`、`(7,18)` 同时占用 spawn/warp/NPC approach/主路保护格；
- 两张 Firebud map data 的 frozen hash 已过期；
- repeat prepare I/O 稳定性未通过。

村庄服务布局、移动、寻路、NPC 交互/碰撞、地图切换、遇敌和战斗入口本身 `8/8 PASS`，说明玩法主链可跑；这不能抵消视觉阻挡与权威地图合同不一致。

### 2. 完整录片无法可信收口

当前候选的完整 OWNER 录片在村口 moving native 已经写出移动后 PNG，但未写出最终 capture report，也未正常退出；官方 runner 在 600 秒后按 containment 合同失败关闭。失败后 automation lane 保留 owner lock，随后通过仓库官方 owner-bound cleanup 精确移除 68 个 lane entry；复核结果为 lane/lock/runner 全部 absent，真实玩家目录 inventory hash 前后一致，没有孤儿候选进程。

该现象不证明普通移动主链挂死，因为独立移动与寻路检查通过；它证明正式 Main 证据录制/资源收口链尚不可信，不能用部分截图冒充完整审核片通过。

### 3. 当前视觉没有达到冻结线

人眼材料中的优点是暖色石器时代方向、村口大树/建筑/集市和训练靶具已经建立区域身份，村口与训练场也能区分。但正式冻结仍被以下问题阻塞：

- 道路、草地与广场过渡可见矩形拼块、硬直角和锯齿边；
- 村口同屏 NPC、标记和道具过密，人物/物件比例、清晰度与光照不统一；
- 正常 PC 任务栏压住训练设施和主地标；
- 村口右下环形地标及其他边缘内容被屏幕裁切；
- 视觉层级、留白与主路引导仍像候选展示，而不是正式生活区。

性能不是本次退回根因：R0.07 的同候选 v2 证据保持 60fps，村口 idle/moving `process_total` 均值为 `0.399/0.490ms`，训练场为 `0.390/0.377ms`，两个 moving 段都使用真实跨帧鼠标输入。

## 动态返工路由

依据“一个根因、一个资产、一个风险点一项”，在 `production_release_loop_plan.md` 新增并串行执行：

1. `R1.W001`：权威碰撞、保护格与哈希闭环；
2. `R1.W002`：真实 Main 录片收口与 QA lane 恢复；
3. `R1.W003`：道路、草地与广场过渡返工；
4. `R1.W004`：PC HUD 安全区与边缘构图返工；
5. `R1.W005`：密度、比例、光照与生活感统一；
6. `R1.W006`：精确返工证据重新冻结；
7. `R1.W007`：项目所有者返工后人眼复验。

`R1.02` 改为依赖 `R1.W007`。只有 W007 对新冻结哈希明确批准，R1.02 才能生成 owner acceptance、release attestation 并尝试 promotion；再次退回继续拆新返工项，首发延期则保持 v2 不可达并保留已发布 v1。

## 验收边界与下一任务

本阶段的完成条件只有：OWNER 决策已明确、退回原因可审计、独立返工项已建立、生命周期没有误提升。它不要求也不允许在同一轮开始修复。

下一任务是 `R1.W001 AUTO｜Firebud v2 权威碰撞、保护格与哈希闭环`。
