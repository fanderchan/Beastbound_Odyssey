# 项目现状与下一步

核对日期：2026-09-20。日常开发统一使用 **`/Users/fander/projects/Beastbound_Odyssey`**。老板只需要从这个目录打开项目和本文；版本整理、实现、测试和文档同步由开发者负责。

## 游戏已经有什么

万兽纪元是 PC 优先、中文、始终在线的原创 2.5D 回合制宠物 MMORPG。核心体验是抓宠、练宠、观察隐藏成长，再通过转生、进化和融合追求稀有结果。

仓库已经实现账号和四角色槽、地图移动与任务、背包和装备、商店和资产交易、战斗与捕捉、挂机、宠物成长与转生/进化、队伍/聊天/邮件、家族庄园的基础系统。Node 服务端承担玩法权威，MySQL 是正常运行存储；客户端负责输入、表现和同步。这些是代码能力，具体功能是否开放、是否达到首发质量仍由发布计划和运行时开关决定。

目前是有完整系统基础的开发版，**尚未达到可收费上线的成品标准**。剩余方向包括正式视听与首发内容、核心循环和长期经济、Boss/PvP、社交/新手体验、真实支付、生产运维、200 人同图容量证据、桌面正式包和封测。不能用已关闭 Bug 数量或测试通过数量计算“上线完成率”。

## 版本已经统一

过去的多个目录是同一个 Git 仓库的多个工作区，用于隔离开发和发布验证。先前“多 60 个提交”指两个版本之间的历史差距，不是多出 60 份游戏。

本次已逐项核对并保留原有成果，把较新的 60 个提交、候选目录的 133 个未提交文件，以及本次文档整理合入原来的主目录。整合起点是 `0bd9ea705`；后续提交和未提交修改以实时 Git 状态为准。没有另建第四个开发目录。

| 目录 | 当前用途 |
| --- | --- |
| `Beastbound_Odyssey` | 唯一日常开发入口，包含统一后的代码、数据、工具和文档 |
| `Beastbound_Odyssey_release_candidate` | 整合前的历史现场，保留并加 Git worktree 保护锁，不再继续开发 |
| `_codex_worktrees/Beastbound_Odyssey_p14_release` | 旧融合专项历史现场；补丁比对未发现候选主线缺少的独有实现，保留并加保护锁 |

保护锁用于阻止 Git 自动清理或移动旧工作区，不是文件只读权限。后续任务不要在旧目录继续写入，也不要自行删除它们。

整合前两边共 390 个文件的原始字节、状态、SHA-256、补丁和分类决定保存在本机忽略目录 `.run/workspace-unification-20260917/`。原主目录还保留完整 Git stash 和 `refs/backup/workspace-unification-20260917/` 恢复引用。历史来源、资产原稿、冻结证据和玩家资料均保留。

```sh
node tools/repository_guide.mjs status
git status --short --branch
git log -5 --oneline
```

`status` 只读本地状态，不拉取、切分支、合并或启动服务。本次整合前已另行执行远端 fetch 并确认基线；未提交文件数不是未完成任务数，也不代表可发布。

## 当前开发顺序

产品范围由 [总路线图](../stoneage_gap_plan.md) 负责，逐步交付由 [生产发布计划](../production_release_loop_plan.md) 负责。两者现在都以主目录为准，旧目录的游标不再驱动开发。

1. **统一基线已恢复**：历史成果和文档导航已核对；完整服务端 1984 项通过、0 失败、1 项因未配置独立 Valkey 环境跳过，客户端定向 8/8 通过。
2. **洞穴与五人守护战已有可试玩候选，最新自动通关联机稳定**：四层／地标／战斗预览及启动命令见 [Phase 569](phase_569_current_four_floor_review.md)。[Phase 581](phase_581_cave_journey_visuals_and_result_input.md) 已修复换层退回网格、人物比例变化和结算点击穿透；[Phase 582](phase_582_battle_response_ownership.md)、[Phase 583](phase_583_event_stream_monotonic_clock.md) 与 [Phase 585](phase_585_battle_event_receive_capacity.md) 分别修复结算等待、重连计时与大消息断连。最新一名真实 Main 加四个 HTTP 测试队友完成 10 回合胜利，五账号奖励到账，全程单连接、零拒绝／重试；这不是五真人或平衡验收。历史鼠标通关见 [Phase 580](phase_580_current_guardian_mouse_review.md)，当前源码的双倒地与连续出洞操作仍需复验。正式四层性能与美术接受尚未完成，发布游标保持 `R1.W024`。
3. **首次切战卡顿已明显改善，代码已同步 GitHub**：[Phase 548](phase_548_battle_hotpaths_and_authoritative_completion.md) 修复了人物击飞后提前胜利并减少绘制开销；[Phase 549](phase_549_battle_texture_prefetch_and_github_sync.md) 增加有界后台贴图预取，同一五人守护战的新进程首次准备由约 1002 ms 降到两轮约 10 ms。两场权威胜利与五账号奖励到账通过，严格原生前台性能两次通过，最终世界性能探针 `5/5`。此前各阶段已按功能提交推送 GitHub main；107 项待重冻地图证据继续在本地保留。未知形态或立即开战仍可能走同步加载，不能把这个场景的结果推广成全游戏无卡顿。
4. **依次推进成品门槛**：继续 R1.W024 的当前源码精确地图证据、真实操作、集中式重复移动性能和路线/战斗转换验证，再推进剩余视听验收、首发内容、玩法/经济、运营基础设施、正式构建和封测；每次交付都带具体效果或可复现结果。

下面按当前问题汇总证据。详细测试数字和当时失败记录保留在 Phase 文档；旧记录中的“下一步”不再作为当前游标。

| 当前事项 | 已有证据 | 仍需完成 |
| --- | --- | --- |
| 人物比例、遮挡与地标构图 | [Phase 555](phase_555_world_prop_player_visibility.md) 修复前景物件挡人；[Phase 556](phase_556_guardian_navigation_camera.md) 修复守护者到达格和消息窗裁切；[Phase 571](phase_571_current_cave_input_and_performance.md) 已用当前源码实测四层岩墙前后遮挡、守护导航与消息面板，人物完整 alpha 高度 `121.478–125.856px` | 正式证据配对及所有者接受仍待完成；外围环境物件不能冒充全部无遮挡 |
| 四层路线与五人守护战 | [Phase 581](phase_581_cave_journey_visuals_and_result_input.md) 修复换层美术／比例、结算点击和队友续战；真实 F4→F3→F2 与两次遭遇逃离通过。[Phase 582](phase_582_battle_response_ownership.md) 修复结算等待；[Phase 585](phase_585_battle_event_receive_capacity.md) 当前自动通关全程单连接，五账号奖励到账 | 当前真实鼠标双倒地、完整一层／出洞、正式截图配对和性能；107 项本地候选文件保留 |
| 同屏队友外观与持续可见性 | [Phase 563](phase_563_remote_player_appearance.md) 接通权威外观、八向动画、相同比例、点击范围和提交后骑乘通知；[Phase 564](phase_564_idle_online_presence_refresh.md) 修复静止定时刷新误隐藏人物，真实 HTTP/WS 旁观回归通过，服务端 `48/48`、客户端 `5/5` | 补做当前联网客户端点击、上下骑和切图的人工视觉复核；自动回归及展示片不代表五真人联机或 200 人容量 |
| 四套战斗人物与首场加载 | [Phase 566](phase_566_authoritative_battle_appearances.md) 修复权威外观丢失；[Phase 567](phase_567_nearby_character_battle_prefetch.md) 补齐同图人物预取，首次准备 `430.989→9.700ms`，客户端 `4/4`，完整原生五账号奖励再次通过；录制休眠中断已处理 | 立刻开战或尚未进入预取的人物仍可能同步加载；原生鼠标、正常前台性能和所有者接受继续待完成 |
| 关闭客户端的资源回收 | [Phase 570](phase_570_prefetch_request_cleanup.md) 修复退出及加载失败时未回收后台贴图请求，提前退出由四个泄漏变为零；定向 `4/4`、原生请求回收和完整五账号胜利通过，五人各获地之戒、人物倒下后的宠物指令再次验证 | 当前自动试玩不替代真实鼠标、前台性能或所有者接受 |
| 原生地图性能 | [Phase 579](phase_579_current_cave_evidence.md) 已补齐 Phase 572–578 优化后的当前完整 48 组，零失焦／零不可绘制；四层绝对静止 `0.313–0.339ms`、移动 `0.368–0.461ms` 及移动增量全部达标 | 当前静止增量 `0.165–0.188ms` 超过 `0.100ms`，总评 **FAIL**；尚未安装正式性能证据，不能把跨轮次差值直接归因为代码收益 |
| 运行优化 | [Phase 559](phase_559_world_depth_and_bounds_hotpaths.md) 精简范围／排序；[Phase 561](phase_561_camera_score_pruning.md) 剪去无效镜头评分；[Phase 565](phase_565_retained_world_ground.md) 缓存静态地面；[Phase 568](phase_568_cached_ground_geometry.md) 合并保留地面几何，十对画面逐像素一致，原生录片渲染器 CPU 均值 `0.08→0.04–0.05ms`，当前五账号奖励和地图恢复再次通过 | 正式静止增量问题尚未解决；脚本处理基本不变，局部收益不是 FPS 提升，也不代替当前前台矩阵 |
| 相机与外观的重复计算 | [Phase 577](phase_577_player_appearance_selection_cache.md) 复用未变化的外观选择；[Phase 578](phase_578_camera_policy_dispatch.md) 合并相机资格判断，384 种状态、定向 `4/4` 及跨帧移动通过。该源码单次原生静止 600/600 帧有效，约 `7.816% CPU`；Phase 579 已补完整地图矩阵 | 局部及单次数据不能证明整体性能改善；修改前后正常时钟 CPU 对照仍未完成 |
| 取证可靠性与时间口径 | [Phase 551](phase_551_map_evidence_commit_provenance.md) 绑定运行内容和祖先提交；[Phase 558](phase_558_native_performance_visibility.md) 验证前台绘制；[Phase 562](phase_562_runtime_probe_wall_clock.md) 区分模拟／实际时间；Phase 576 正常 30 FPS 下美术约 `7.784% CPU`、网格约 `22.366%`；[Phase 580](phase_580_current_guardian_mouse_review.md) 关闭详细计时并明确运行时 VSync 后仍测得约 `0.150ms` 静止增量，未采用无收益的调用方式微调 | 同版渲染路径对照不是修改前后收益；脚本区段增量不等于整进程 CPU 增量。普通启动会覆盖命令行 VSync 设置，不能混用不同条件的数据或据此放宽性能门 |

**接下来的顺序**：战斗结算、重连计时、大事件断连和后台绘制已修复；最新 [Phase 586](phase_586_guardian_recording_integrity.md) 又修复损坏录像被误报通过的问题，整场自动守护战、五账号奖励和严格完整录像均通过。继续真实鼠标双倒地和连续返回／出洞，再处理正式静止性能增量与当前精确证据配对，完整通过 R1.W024 后进入 R1.W025 受委托复审。候选显示不代表素材正式发布，原有 107 项候选文件保留。

其他地图如潮回洞穴仍有网格占位，不在岩脉四层完成范围内。Firebud v2、融合、环境声和 Bui VFX 已有返工或延期决定，不从旧主目录的 `R1.01` 重做。Earth Vein 仍为待验收候选；测试和内部审查不等于老板亲自批准精确美术资产。

全局发布结论仍为 **BLOCKED**。R0 曾有完整候选验证历史，但不能把历史通过、当前开发目录和正式发布混为一谈。

## 老板与开发者怎么配合

老板给方向和最终效果反馈；开发者负责构思、拆解、实现、验证、整理和持续推进。常规技术选择、可逆修复与既定路线内工作直接执行，不再把 Git、目录或工具细节交给老板决策。

2026-09-18 老板已授权设定目标后连续自主开发，并要求已完成的工作提交 GitHub。持续目标是推进到可完整试玩的 PC 成品候选；当前先收口岩脉洞穴和五人守护战，再按既定路线推进。开发者连续执行实现、实机验证、文档和分批提交，不再逐阶段询问是否继续。该授权不等于最终美术验收或生产发布批准。

涉及尚未确定的收费/经济规则、重大产品取舍、外部账号与资源，以及最终视觉和封测接受时，先准备具体可看的结果，再说明推荐方案和影响，请老板决定。没有这些门槛时继续完成后续已授权工作。

开发方法见 [开发指南](development.md)，代码位置见 [架构说明](architecture.md)，整理过程见 [Phase 543](phase_543_repository_navigation_and_http_boundaries.md)，统一过程见 [Phase 544](phase_544_unified_development_workspace.md)。
