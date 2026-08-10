# Phase 387：觉醒式地图层级、原创世界图与真实跨图寻路

## 目标与参考边界

旧地图页只是居中的深色原型框、程序网格缩略图、坐标文字和一列寻路按钮，既没有成熟
地图层级，也无法承担区域浏览。项目所有者要求直接研究《石器时代：觉醒》的实机地图
流程后开发，而不是继续猜交互。

本阶段通过 iPhone 镜像实际检查并冻结了当前楼层、洞窟小地图、岛屿地图、世界地图、
岛屿放大、地点列表、楼层切换、目的地自动寻路与关闭返回。参考只用于成熟的信息层级、
密度和操作意图；未复制其地图像素、岛屿轮廓、地名、角色、图标、数值、商标或源码。
完整 current-run 审计见
`.run/evidence/phase387_map_awakened_ui/reference-audit.md`。

## Beastbound 原创实现

### 当前地图

- 地图页改为占满 `1280x720` 的世界阻塞页，顶部固定 `当前地图 / 世界地图 / 关闭`；
- 左侧保留当前地图全部真实交互、设施、遇敌区和区域地点，点击后立即关闭地图并自动
  寻路；长名称使用滚动区与截断，不挤出面板；
- 中部不再画程序方格：优先复用 `MapVisualCatalog` 已准备的真实地表与场景对象，使用
  一次更新的 `SubViewport` 显示；没有正式视觉包的地图才退回原有示意图；
- 地图上只显示当前位置、正在前往的目标与最多六个主要设施。火芽村入口实际有 37 个
  可寻路目标，其中二十多个传送点集中在相邻格，全部画出会形成无法操作的图标墙；完整
  功能仍在左侧目录中；
- 蓝色当前位置与金色目标使用不同外框和提示，不依赖颜色作为唯一信息。

### 世界地图

- 新增九区原创无字世界图底板：火芽村、村外训练区、九大庄园、四大洞穴、玄影洞窟、
  等级草丛试验场、雾帽湿地、裂日荒原与风镜高地分别由地貌表达；
- 地名、图标、当前区域高亮和点击热区由 Godot 叠加，不把文字烘进图片；
- 世界页只读取 `map_regions.json` 的玩家区域，明确排除 `gm_training_ground`；
- 点击区域后右侧显示真实入口、地图／楼层、推荐等级和当前所在状态；点击入口或地点即
  进入自动寻路；
- 原创图、逐字 ImageGen 提示、尺寸、SHA-256、授权边界与替换规则记录在
  `client/godot/assets/ui/map_awakened_v1/asset-manifest.json`。该图运行时启用，但主观
  美术状态保持 `owner_review_pending`。

### 跨地图寻路

- 新的 `MapRoutePlanner` 对 37 张登记地图的真实 warp 图执行 BFS，返回最短 mapId 路径
  和当前地图的第一道真实传送点；
- 每次地图传送后复用既有 `routeContinuationTarget` 继续下一段，直到目标地图或目标设施；
- 从 `earth_vein_cave_f4` 到 `mistcap_marsh` 的检查会先返回
  `earth_vein_cave_f3`，证明不是只支持村口直达；
- 目标无真实通路时保留既有玩家提示，不伪造瞬移或可达状态。

## 输入、性能与安全

- 聚焦检查使用真实 `InputEventMouseButton`，按下与释放跨帧，连续完成
  `世界地图 -> 雾帽湿地 -> 当前地图 -> 村医`；结果为
  `real_left=true isolated=true doctor=true`，没有穿透为地图移动；
- 世界与当前地图的运行时数据只在显式打开／切换／权威地图变化时构建；37 张地图名称
  首次打开后缓存，世界图是静态纹理，当前地图 `SubViewport` 为 `UPDATE_ONCE`；
- 当前地图打开 600 帧稳定 `60 FPS`、`process_total=0.03–0.04ms`；世界地图打开
  360 帧稳定 `60 FPS`、`process_total=0.03–0.04ms`；
- 真实跨帧移动检查 `status=ok`、`process_total=0.05–0.07ms`；鼠标压力检查
  `status=ok`、36/36 输入命中、`screen_roundtrip/coalesced/settled/final_match=true`、
  `max_input_us=6`、`process_total=0.07–0.09ms`；
- 玩家页不显示地图 ID、schema、路由图、QA、ImageGen、资源路径或内部调试字段；
- 既有战斗全屏状态继续隐藏世界地图入口，本阶段没有把地图带入战斗 HUD。

## 验证

- `godot --headless --path client/godot --quit`：通过；
- `node tools/run_godot_auto_checks.mjs --only --auto-map-panel-check --fail-fast --timeout-ms 180000`：
  parse 与地图专项 `2/2` 通过，最终日志
  `.run/godot_auto_checks/2026-08-02T08-24-27-035Z.log`；
- 专项结果锁定真实地图纹理、37 个目录目标、九个玩家区域、GM 区隐藏、原创世界图加载、
  真实左键、输入隔离、跨地图最短路径、村医设施与遇敌区路线；
- `asset-manifest.json` 由 Node JSON 解析通过；
- 正常 `Main.tscn`、Metal、`1280x720` 当前地图与世界地图录帧通过，CPU render 分别约
  `0.18ms/frame`；
- Movie Maker 短录帧退出会报告仓库既有的 4 个 ObjectDB／2 个 resource 残留；同一
  警告已用无地图的 `--quest-ui-preview` 复现，普通非 Movie Maker 地图启动退出无残留
  警告或脚本错误；
- `git diff --check` 在最终收口时执行。

## 视觉证据

- 当前地图：
  `.run/evidence/phase387_map_awakened_ui/implementation/iteration3/local/frame00000079.png`；
- 世界地图：
  `.run/evidence/phase387_map_awakened_ui/implementation/iteration4/world/frame00000079.png`；
- 参考与实现同屏比较：
  `.run/evidence/phase387_map_awakened_ui/comparison/final-reference-vs-beastbound.png`；
- 外部参考原始捕获保存在
  `.run/evidence/phase387_map_awakened_ui/reference/`，只作本阶段审计证据。

## 非目标与剩余边界

- 没有修改地图 IDs、格子、阻挡、出生点、NPC、传送点、遇敌区、奖励或世界拓扑；
- 没有把九区世界图宣称为服务器地理坐标；它是 `map_regions.json` 真实区域目录的视觉
  投影，路由仍以 warp 图为准；
- 没有因一个地图 UI 和一张世界图宣称 P2.1 世界内容或 P2.2 全量正式美术完成；
- 原创世界图等待项目所有者观看冻结截图后决定接受、修改或替换。
