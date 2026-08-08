# Phase 398：正式宠物图鉴宿主接线

## 1. 目标、基线与边界

本阶段在 `origin/main=5302406ab5bcc3ea3f2aee4a8670acb3dff05a8a`（Phase 396
多跳地图与正式 HUD 韧性）之上，把原创 1280×720 宠物图鉴接入真实 `Main.tscn`，替换旧
程序式图鉴。Phase 396 的顶部入口、右侧任务／组队栏、右下固定栏和地图路线均继续存在；关闭
图鉴后同调用与下一帧恢复正式 HUD，并可再次用真实左键打开图鉴。

石器时代参考只用于三栏层级、暗木暖金材质和“获取途径”内嵌页的交互方向。运行时没有复制
参考产品的宠物、图标、文字、数值或 UI 贴图。本阶段不改宠物、地图、捕捉、成长、图鉴存档、
服务端协议或权威写入规则，也不把项目所有者尚未批准的宠物画像发布给普通玩家。

底板与本轮视觉仍是 `ownerReviewStatus=pending`。自动检查、Codex 自审、视频或性能通过都不
等于项目所有者已经接受审美，因此 broad P2.2 保持未勾选。

录制完成后 `origin/main` 已推进到
`3c0e811aad7054c5a446eaac21be21f6b3d07af5`（Phase 399 正式地图页）。因此本页 v3
只证明 `5302406ab` 基线候选，不能冒充当前 main 的最终发布证据；Phase 398 在完成迁移、冲突
审计和重验证前保持 `mainMigrationStatus=pending`，是否需要重录由迁移后的玩家可见与源码身份
变化决定。

## 2. 玩家合同与权威数据

- `PetCodexPresenter` 消费 `PlayerProgressModel.codex_entries` 和既有宠物模板；
  `seen/captured/ownedCount` 仍是唯一图鉴事实来源。没有新增客户端假图鉴档案。
- 未遇见形态只显示匿名占位，不泄露名称、form ID、画像或隐藏成长；已遇见但没有获准画像的
  形态显示真实名称与自然文案“形象尚未收录”。成长页只显示 `Lv1 公开四维` 与“成长倾向”，
  不把隐藏总成长伪装为公开数值。
- 正式图鉴不信任调用方注入的 family/form/showcase/portrait/route/skill 原始贴图。宠物画像只
  走图鉴局部 `approved_*` API，并同时要求 `PetArtCatalog.status=approved` 与
  `runtimeEnabled=true`；共享旧画像 API 行为不变，Phase 396 HUD 与宠物管理页不被全局降级。
- “获取途径”只在已遇见形态可用。路线来自一次性预载的 37 张正式地图
  `encounterZones/wildPetPool` 与进化路线；打开后在同一图鉴内显示 `(418,148)`、
  `365×402` 的内嵌页。内嵌页会阻断底层种族、形态、页签和世界输入；顶部关闭先折叠内嵌页，
  再次关闭才退出图鉴。
- 正式入口使用 Phase 396 `WorldHudFixedEntries` 中的图鉴按钮。标题字体显式检查“鉴”字字形，
  玩家画面不出现 QA、验收、调试、账号或性能文案。

## 3. 性能与宿主实现

- 获取途径目录只在 prepare/open 阶段读取一次；形态切换只查内存索引，不在输入、`_process`
  或 `_draw` 热路径读 JSON。
- `PanelFlowCoordinator` 按一次 normalized profile 建 family/form 分组与 formId→state 惰性缓存；
  面板复用种族／形态按钮与成长／属性节点，不在每次选择时全量 normalize、全目录扫描或销毁
  11 个种族节点。
- 图鉴、背包等正式全屏世界菜单属于活跃交互面；打开时 `ACTIVE_TARGET_FPS=60`，关闭且世界
  静止时回 `IDLE_TARGET_FPS=30`，战斗继续保持 60。这个产品合同有自动与真实 Main 三态门禁。
- native 性能不用 Godot 最多可延迟约一秒的 built-in `Performance.TIME_PROCESS` 作逐帧结论。
  只在 QA `perf_probe_enabled` 时，`Main._process` 用 `Time.get_ticks_usec()` 记录
  `process_total` 每帧最大值和样本数；正常玩家运行没有新增每帧探针工作。
- GUI signal 不在 `Main._process` 内，因此录像 harness 另以 ticks 包围真实
  `Input.parse_input_event`，并分别门禁 input dispatch、族／形态选择和页签处理 `<8ms`。
  Movie Maker 的 delayed monitor 数值只保留为诊断，不冒充 CPU 或卡顿证据。

## 4. 原创资产、来源与替换路径

本阶段新增的 `pet_codex_awakened_v1` 只有一张原创空底板及其 source/runtime 记录：

- source：`client/godot/assets/ui/pet_codex_awakened_v1/source/generated/pet_codex_backdrop_raw.png`，
  SHA-256 `4bca05805e5f15264fcfd89487c4d7f33747c003b269a0c0ae1237e7aa3a6e86`；
- runtime：`client/godot/assets/ui/pet_codex_awakened_v1/runtime/pet_codex_backdrop_1280x720.png`，
  SHA-256 `863e7c86b5f8f8219d971a6db6bd12f537a5884c4628dc86e56a19010bc17470`；
- provenance、generation ID、尺寸、处理方式与替换路径在同包
  `asset-manifest.json`、`generation-prompt.md`、`source-and-ownership.md` 中冻结。

运行时还复用 `5302406ab` 基线已发布的原创 Beastbound 组件，不把它们重复计入新增资产：

- `backpack_awakened_v1` 的 tab／button／item-slot primitives；其来源、哈希与替换路径仍以该包
  `asset-manifest.json` 和 `source-and-ownership.md` 为准；
- `world_hud_awakened_v1/runtime/icons/top_pet.png` 作为正式爪印图标，SHA-256
  `7d6dcdabe40947a4abfa24f7112a16f33330dadf280f81254f0afd42fdf49145`；来源为该包
  `top_pet_source`，运行图授权为 `inherits_top_pet_source`。本阶段没有用物品槽边框或程序图形
  冒充爪印。

新增底板不含烘焙文字、按钮、宠物或商标。项目所有者若退回视觉，只需按同一三栏安全区替换
source/runtime PNG、更新 manifest/hash 并重录，不需改变权威数据或交互合同。

## 5. 冻结闭包

当前提交候选为 22 个非生成路径：19 个录制前冻结的运行时／资产／录像工具路径，以及录制后
补写的 Phase 文档、`design-qa.md` 和 `stoneage_gap_plan.md`。三份录制后文档不参与“录制源码
早于媒体”的身份断言，detached attestation 会把它们单列为 post-run documentation；`.uid`、
`.import`、`.run`、Godot user-data、日志和媒体均是生成证据，不进入提交。闭包不包含任何
owner-pending 宠物画像，也不包含根脏树的大文件。

## 6. 验证与最终证据

在独立 worktree 上已完成：

1. `godot --headless --path client/godot --quit`：exit 0。
2. `pet_codex_awakened_panel_check.gd`：`PASS`；11 个种族、4 个同族形态、10 张获取途径卡；
   `openProjection=3.764ms`，72 次热选择 `maxBuild=0.002ms / maxApply=1.978ms /
   maxRefresh=1.979ms`，路线读取 `38→38`。
3. `--auto-pet-codex-list-check`：parse＋专项 `2/2 PASS`；`glyph`、pending 画像阻断、modal
   不穿透、顶部先折叠、正式 HUD 恢复、菜单 60／静止 30／战斗 60 全为 true。
4. recorder Python 单测 `5/5 PASS`，覆盖 native 命令不含 `--fixed-fps/--write-movie`、
   native/movie 口径混用、前台、样本、16.7ms／8ms、路线缓存与 Movie main 样本必须为 0 的
   正负门禁。

`5302406ab` 基线冻结双证据目录：
`.run/evidence/phase398_pet_codex_awakened_owner_review/phase398-pet-codex-final-v3-20260808/`。

- native visible Main（无 fixed fps、无 Movie Maker）：前后 foreground=true，wall
  `22.573s`，`main process_total max=3.909ms / 654 samples`；selection `2.996ms`、input
  dispatch `0.020ms`、detail tab `6.886ms`；menu60／idle30／battle60、路线 `38→38`、HUD
  同调用／下一帧恢复和真实入口重开全部通过。
- 30fps Movie 只证明视觉、音频、真实点击与 handler：`17.466667s / 524` 帧，
  `1280×720 / 30fps / 1.00×`，H.264 `yuv420p`＋AAC 48kHz 双声道；9 章、15 次跨帧真实
  左键，selection `5.021ms`、input `0.007ms`、detail tab `2.009ms`。delayed monitor
  `26.472ms` 明确只作诊断，不用于性能放行。
- MP4 SHA-256：`62f6d9bb61312b6362660eceed8968f0e354e3cc14c0ae81e9e907050756ca76`；
  contact sheet：`6f068149f4396b486791e3a66a85e6d690b0d888f4b545e67e80655b46b7c428`；
  native log：`4ab9443401461d58f847dfa0ea35631c309dad8e54e5581ef000753fafd51898`；
  Movie log：`ec55d03ed62800ff6672cd9735b6a71c9423a690b4c716335cfa989d1822a896`；
  summary：`dc21771f05880a72ae7261204cb4bd5adabc9738f1e1e5fa249c3fbd2aa93113`；
  `SHA256SUMS`：`39e90d45311566d2aaee58cc959bf8befa829d355fd227580b2958c767cd2e39`。
  清单覆盖 45 个保留证据文件并逐项复验通过；两份 Godot 日志无 ERROR、WARNING、leak、
  POINTER 或失败 marker。
- 参考／实现同屏：
  `.run/evidence/phase398_pet_codex_reference_comparison/phase398-pet-codex-final-v3-20260808/reference-vs-implementation.png`，
  SHA-256 `250b49263ab8e3c922ca768f7b8201a2008a50dd318786651b5452858b57f14b`。

录像工具没有启动后端、访问 MySQL 或使用普通玩家 save path。`server_writes=0` 是隔离捕获合同，
不是联网 HTTP/MySQL 计数器；本阶段不把它冒充真实联网零写入证明。

## 7. 录后绑定与当前 main 迁移门

detached attestation 位于
`.run/evidence/phase398_pet_codex_source_attestation/phase398-pet-codex-final-v3-20260808/source-attestation.json`：
19 个录制关键路径按 path 排序的 `sha256␠␠path\n` 聚合 SHA-256 为
`db0d83e4490e2615e04b7b860581782c734085121c78129555fd0081794c398c`，最大 mtime 为
`2026-08-08T08:03:17.193889Z`，早于首个绑定 native 日志
`2026-08-08T08:07:37.115734Z`；三份录制后文档只作为明确排除的 post-run documentation。
attestation 是录后 SHA／mtime 绑定，没有密码学可信时间戳；其自身 SHA-256 以同目录
`SHA256SUMS` 为准：attestation SHA-256
`4756258713176c97c02934493448ccb15acd59afd136324170e5e5395f209218`，清单 SHA-256
`00f06b98e2377e43bfd6722ed2573e3122119bba4e81a53bb4c74a8a51cea29b`，复验通过。

由于 current main 已推进到 `3c0e811aa`，原计划的宠物管理、任务路线、挂机、地图和
battle-command awakened UI 相邻回归暂缓。下一步应先把 22 路径候选安全迁移到新 main，审计
Phase 399 地图页与 Phase 398 对共享 `main.gd`／PFC／auto／roadmap 的合并，再在无并发 Godot
窗口重新跑窄门；若录制相关源码、正式 HUD／地图可见状态或交互身份变化，则 v3 只保留为历史
基线证据并必须重录。任何迁移或相邻回归失败都阻断发布。
