# Phase 396：多跳世界导航与正式 HUD 韧性收口

## 参考意图与阶段边界

- 本阶段继续落实项目所有者已经确认的世界体验：玩家在挂机页或任务栏选择远端目标后，应像
  正常游戏一样沿既有传送点逐图前往；取消匹配后应明确回到可继续操作的挂机页；正式世界
  HUD 必须稳定承载地图、任务、组队和底栏，而不是在异常路径下退回程序式旧控件。
- StoneAge 参考只用于确认“世界内连续前往、取消与停止分离、正式 HUD 不闪回旧界面”的成熟
  行为意图。本阶段没有复制参考游戏的地图、路线、角色、美术或数值，也没有增加传送付费、
  瞬移、虚假队伍、自动接受任务或新的服务端 mutation。
- 这是 Phase 394／395 的窄工程收口：只覆盖多跳挂机／任务路线、失败回滚、取消后的真值归一、
  HUD mount 回滚、同图 minimap 热替换、正式 roster 去 legacy 依赖及 party live QA 迁移。
  不扩大到其他尚未完成 host wiring 的候选，不勾选 broad P2.2。

## 多跳地图路线合同

- 新增独立 `MapRoutePlanner`，从 `MapDataCatalog` 登记的正式地图一次性构建只读有向图；每条边
  必须来自真实 `interactionPoints` warp，目标地图、交互 ID 和格子合同缺失时整图 fail closed，
  不向玩家返回半张图上的猜测路线。
- 路线选择使用 BFS 最短跳数。`next_warp(from, to)` 返回当前地图上的真实 warp 副本，并附带
  完整只读 `routeMapPath`；后续每次换图重新使用目标继续路由，不把跨图任务误判为“本图没有
  直接门，所以不可达”。
- planner 在 `PanelFlowCoordinator` 中按需构建并缓存；构图时每张登记地图只读一次，后续任务、
  挂机及跨图继续查询不再扫描 JSON，也不进入每帧 HUD／移动热路径。
- 正式图门禁覆盖 `37` 张地图、`71` 条有向 warp：火芽村口到地脉洞窟二层为二跳，到玄影洞窟
  四层／五层分别为四跳／五跳；合成夹具另证明 BFS 会选二跳分支而非三跳分支。

## 玩家可见失败回滚

- 挂机路线在写入 pending route／mode、关闭正式页面之前先验证可达性。不可达目标保持当前世界
  与挂机页可操作，并显示简短中文原因，不制造“正在前往”假状态。
- 挂机路线遇到地图加载失败、或换图后下一跳已不存在时，统一清空 pending route、mode 与路线
  计时，清理已消费的导航交互并重新打开正式挂机页；玩家可以立即改选路线，不会被锁在已关闭
  页面或等待一个永远不会完成的目标。普通任务路线没有挂机 pending，不会错误弹出挂机页；它
  保持世界可操作并显示重试／断路原因。
- 任务栏和挂机页共享同一 planner 与 continuation 合同；本阶段不绕过碰撞、移动 ACK、遇敌
  许可或服务端挂机权威，也不允许用客户端路线直接结算经验／掉落。

## 取消匹配后的真值归一

- `HangMatchmakingPresenter` 现在只允许权威 `active=true` 或 `status=full` 占有 matching 页面。
  如果取消／idle 回包到达时控件仍保留旧 `viewMode=matching`，展示会归一为 browse，而不是继续
  显示“挂机匹配中”“持续匹配真人中”或取消按钮。
- 取消后的“匹配已取消，挂机继续。”说明与“停止挂机”入口仍保留；因此取消只结束找真人，
  停止才结束挂机，延续 Phase 394／395 的玩家合同。

## 正式 HUD 韧性

### Mount 原子回滚

- `WorldHudAwakenedView` 在接管旧顶栏、侧栏、消息区、底栏及 16 个真实入口前冻结完整 mount
  快照；失败时恢复父级、同父索引、名称、可见性、锚点／offset／位置／尺寸、最小尺寸、层级、
  mouse／focus、文本与图标、按钮状态、metadata 及 theme overrides，并移除本次 mount 新建的
  正式表面。
- `PanelFlowCoordinator` 只在 mount 与 roster mount point 都成功后发布正式 view 引用；失败先
  回滚再释放候选 view。若回滚自身失败，候选 view 只隐藏而不释放，避免把仍被它持有的真实
  玩家控件一起销毁。focused fixture 对 `29` 个真实控件执行了完整恢复断言。

### Minimap 热替换与 roster 去 legacy 依赖

- 每次 `_load_map` 更新 `map_visual_render_revision`；正式 HUD 同时记住 map ID 与已配置 revision。
  即使地图 ID 未变，只要 render state 热替换，minimap 也会先重新 configure，再应用 view state，
  不继续展示旧地表缩略图。
- 正式 roster 刷新只依赖 `world_hud_party_roster_view` 是否存在，不再要求旧
  `party_roster_panel`／container 仍在。旧 roster 可以为 `null`，任务／组队页仍投影固定五席；
  legacy 面板若存在仍强制隐藏。
- party live QA 已从旧灰色 roster 的 child count／头像符号迁移到正式五席 view：检查真实名字、
  离线文字标记、固定五席，以及进战时正式 roster 和旧 panel 同时隐藏。该 live 检查需要本地
  QA 后端，本阶段不把未执行的真实联机门禁写成通过。

## 自动验证

- `MapRoutePlanner` standalone：`ok=true`，`mapCount=37`、`directedEdgeCount=71`、
  `catalogLoadCount=37`；二／四／五跳正式路线、合成最短路、未知地图、不可达 GM 地图和损坏图
  fail-closed 全部通过。
- 最终串行 Godot auto `4/4` 回执统一为
  `.run/godot_auto_checks/2026-08-08T05-36-33-386Z.log`；其中 `--auto-task-tracker-route-check`
  为 `status=ok`，原本同图任务、跨图银行
  continuation 继续通过，新增 `multi_hop_contract`、planner cache、首跳启动、五次真实 warp
  到达、每跳 pending／continuation、最终练级区移动、不可达清理、中断清理、挂机加载失败清理
  和普通任务加载失败文案均为 `true`。
- 同一最终串行回执中的 `--auto-hang-matchmaking-check` 为 `status=ok`，新增
  `formal_without_legacy=true`、`minimap_hot_replace=true`；原有取消继续挂机、停止、NPC 补位、
  真人替换及战斗 HUD 边界保持通过。
- focused UI 门禁覆盖取消后旧 matching 归一、正式五席离线标记和 mount rollback `29` 控件；
  最终 mount check 为 `PASS / rollbackRestored=true / rollbackRestoredCount=29`，Godot 全项目解析
  与 scoped `git diff --check` 均通过。路线／挂机 auto checks 只引用上述通过回执，不引用并行
  导入产生的中间失败日志。
- 最终性能证据位于 `.run/evidence/phase396_final_perf-tYiwl0/`。固定 60 FPS 的 idle `12` 组
  `process_total=0.03..0.10ms / avg=0.042ms`，HUD signature／update 均为 `0.01ms`；真实跨帧移动
  `9` 组 `process_total=0.11..0.17ms / avg=0.147ms`、`hud_apply avg=0.108ms`，最终
  `status=ok / path_len=11`。连续点击门为 `accepted=36 / resolved=11 / applied=11 /`
  `screen mismatch=0`、输入平均／最大 `0/1us`，停稳及最终 `(20,8)` 命中均为真；其
  `process_total=0.18..0.19ms / avg=0.185ms`。
- 额外真实 Metal `1280x720` idle 在设计上限 `30 FPS` 下首组 `27.4` 后稳定 `30`，
  `process_total avg=0.355ms`、`hud_signature avg=0.037ms`、`hud_update avg=0.043ms`，最后六个
  稳态 OS CPU 样本平均 `3.83%`。四轮均 `exit 0`，无 `ERROR`／`WARNING`／脚本解析错误／
  ObjectDB leak，结束后本 worktree 无相关 Godot／Node／ffmpeg 残留。证据包中的
  `source-after.sha256` 已知被截断，因此不作为全源码树前后 hash 一致证明，也不支持任何这类
  声明。
- 未跑完整 local CI；本阶段只声明窄路线、挂机与 HUD 门禁通过，不把它扩写为全客户端发布门禁。

## Design QA 与非目标

- 本窄范围未新增玩家可见布局或素材；正常正式 HUD 视觉沿用 Phase 395。新行为只在远端路线、
  取消竞态、同图地图资源更新或 mount 异常时出现，不应在正常玩家画面展示 QA 字段、地图图
  结构、revision、account ID 或失败栈。
- 本轮全局玩家流程审片仍发现战斗画面使用灰色默认地面和圆形宠物占位；新鲜真实 Main 审片帧为
  `.run/evidence/phase396_player_flow_audit/phase396-audit-battle-20260808/03-battle-preview-1280x720.png`。
  这是明确的正式发布视觉阻断，但不在 Phase 396 的安全修复范围；当前 review 战场素材尚未获
  运行发布许可，宠物正式战斗形态也未全量 runtime-enabled，因此不能为了录像把候选图偷渡进
  普通运行。待正式 battle arena 与 actor 资产完成 release attestation 后单独接入并验收。
- 不新增瞬移、路线选择器、路线费用、自动接任务、踢人／转让队长、队伍权限、跨服或新的服务端
  数据字段；未执行真实多客户端 party live 或 MySQL fault injection。
- `ownerReviewStatus=pending`。工程门禁不能替代项目所有者对正式画面与交互的审美验收，也不
  代表 P2.2 已完成。
