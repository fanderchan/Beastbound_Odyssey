# Phase 610：普通地图入口与候选美术边界核对

日期：2026-09-21。核对基线 `e016aa81170d5d23131fccc4611154e165bddadb`，接续 R1.W025 与 [Phase609](phase_609_current_cave_movies_and_return.md)。本阶段只做隔离访问复现和文档纠正，没有改变运行代码、地图数据或资产状态。

**岩脉四层的候选美术在普通模式下没有启用，但四层地图并未封闭。** 严格服务端位置校验下，新账号正常建角选角后，从村医记录点逐格行走，可以沿现有入口进入四层并返回。旧文档中笼统的“普通玩家不可达”不能作为地图内容已关闭的证据。

这解释了当前代码为什么能出现“网格地面、较小人物”和“有贴图、较大人物”两种画面。没有原截图的启动参数，不能反推那两次进程的精确配置；当前代码和本次服务端复现足以确认两条路径的差别。Phase608～609 的审查画面证明的是显式候选预览，不代表普通启动已交付相同画面。

## 地图内容与美术分别如何生效

| 边界 | 普通模式 | 显式地图审查预览 |
| --- | --- | --- |
| 岩脉四层地图数据、楼梯和返回入口 | 已登记，位置权威允许合法进入 | 使用同一地图数据 |
| 洞穴候选地表与物件 | 不在普通美术 catalog，视觉准备返回空，使用既有网格回退 | 可经 review catalog 加载 pending 候选 |
| 洞穴镜头缩放 | `1.0×` | 候选成功加载时 `1.52×` |
| 首发质量与批准 | 尚未完成，不能把网格回退作为正式交付 | 预览、技术通过和内部审看均不等于所有者批准 |

代码链路已逐项阅读：

- [MapDataCatalog](../client/godot/scripts/world/map_data_catalog.gd) 登记玩法地图；[MapRoutePlanner](../client/godot/scripts/world/map_route_planner.gd) 从这些地图的 warp 构图，不依据美术发布状态过滤。
- [PanelFlowCoordinator](../client/godot/scripts/ui/panel_flow_coordinator.gd) 的 `_transfer_from_warp()` 调用 Main `_load_map()`，再提交位置快照；这条链路没有候选美术发布门。
- [Main](../client/godot/scripts/main.gd) 的 `_load_map()` 在地图 JSON 有效时继续加载；`MapVisualCatalog.prepare_map()` 返回空不使地图加载失败。
- [普通美术目录](../client/godot/data/map_visual_catalog.json) 当前只含 `mistcap_marsh`。[MapVisualCatalog](../client/godot/scripts/world/map_visual_catalog.gd) 仅在显式预览下读取 review catalog；此处限制的是美术资源加载。
- [WorldPresentationProfile](../client/godot/scripts/world/world_presentation_profile.gd) 对空视觉状态使用 `NORMAL_CAMERA_ZOOM=Vector2.ONE`；合格的岩脉预览使用 `EARTH_VEIN_CAMERA_ZOOM=Vector2(1.52,1.52)`。人物屏幕尺寸随镜头一起变化，不是两个人物模型。
- [AuthService](../server/node/src/auth-service.js) 的 `validateClientPositionSnapshot()` 验证记录点、相邻行走、入口接近距离与目标出生格；`mapWarpToMapAllowed()` 不读取美术 manifest。候选关闭不会自动拒绝这些合法传送。

[Phase529](phase_529_production_release_r1_02_firebud_deferred_runtime_enforcement.md) 已明确记录 Firebud 普通模式保留程序化回退和行走／切图。后续历史记录里的 `normalLifecycleAccessValid`、`normalPendingDisabled` 等美术检查不能扩大解释成整个区域不可进入。历史 Phase 和冻结报告保留原样，现行说明在本阶段纠正。

## 隔离服务端复现

直接导入正式 `createAuthService`，使用一次性 memory store；没有使用会自动开启测试捷径的 `auth-service-test-context` 包装。注册、建角、选角均走正式方法，以下四项显式设为 `false`：

`allowPositionTeleport`、`allowFullProfileSave`、`allowInitialPositionSeedForTests`、`autoCreateInitialCharacterForTests`。

先验证两个拒绝对照：未恢复记录点就请求洞穴，返回 `position_initial_not_record`；恢复村医记录点后远距离请求洞穴，返回 `position_transition_invalid`。之后按权威碰撞数据寻找四邻格路线，避开非目标传送格，每一步都经过 `movePlayerStep()` 并核对服务端接受的位置，再从实际 warp 提交目标出生格。

| 路段 | 接受的单步数 | 传送结果 |
| --- | ---: | --- |
| 村医记录点 `[10,17]` → 洞穴入口 `[23,6]` | 24 | 一层 `[4,20]` |
| 一层 → 二层 | 31 | 二层 `[5,20]` |
| 二层 → 三层 | 30 | 三层 `[5,20]` |
| 三层 → 四层 | 30 | 四层 `[5,22]` |
| 四层 → 三层 | 1 | 三层 `[21,7]` |
| 三层 → 二层 | 30 | 二层 `[21,7]` |
| 二层 → 一层 | 30 | 一层 `[21,7]` |
| 一层 → 村口 | 31 | 村口 `[21,6]` |

合计 **207 个接受的单步、8 次合法传送、两个拒绝对照符合预期**。同时确认 bundle 仍为 `owner_review_pending / pending / releaseApproved=false / runtimeEnabled=false`，四层都不在普通美术目录。

服务端注入时钟每步前进 1000 ms，用于确定性补充限速额度；没有等待真实 207 秒，因此不是移动速度或性能证明。本次没有启动 Godot、HTTP 监听或 MySQL，没有读取／改写真实玩家档案，也没有发起遭遇战；**这是内容访问权限复现，不是新手战力通关、正常客户端整段实机或美术验收。**

一次性脚本和脱敏结果保存在本机忽略目录，未提交 Git：

- `.run/phase610-working/access-audit.cjs`，SHA-256 `485dc30f5d39857d8be1a3145a1ddad87511c45c1d34b3aa721fe0f317d83ffc`。
- `.run/phase610-working/access-audit-result.json`，SHA-256 `03637087ff1767465e0071a258be31cfa9b0ff6b3df400e1326d0c4224fb04bb`，含逐步路线、传送结果和 16 项读取源文件摘要；不含账号令牌、密码或完整档案。

## 对后续交付的影响

R1.W025 继续等待所有者对当前具体画面的采用／返工结论，P2.1a 不勾选。R1.10 的执行必须区分以下范围：

1. 若采用当前美术，按批准及提升流程接入普通启动，再从普通入口验证视觉与比例；现有预览证据不能替代这一步。
2. 若洞穴内容首发延期，需先明确相关任务、练级、地之戒／MM2 依赖和已有角色位置的安排，再协调客户端入口／路线与服务端访问规则，证明真正关闭。仅保持 `runtimeEnabled=false` 不满足这项要求。
3. 内部开发可继续保留网格回退；它不等于成品地图，也不能写成首发延期已执行。

本阶段没有自行关闭洞穴或发布素材。地图 Skill 要求项目所有者明确接受冻结画面后才能启用候选美术；现有待选方案和已完成的技术验证不能代替该决定。当前首发画面缺口仍真实存在。

## 验证

```sh
node --check .run/phase610-working/access-audit.cjs
node .run/phase610-working/access-audit.cjs
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
git diff --check
```

前两条是本机一次性复现命令；复跑需另存结果，不能覆盖上述冻结摘要。文档不改运行内容，不重复 Phase608～609 的录片、Godot 解析、性能或完整 CI。本次脚本已退出，没有创建后台服务或测试客户端。
