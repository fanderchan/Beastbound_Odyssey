# 项目现状与下一步

核对日期：2026-09-22。日常开发统一使用 **`/Users/fander/projects/Beastbound_Odyssey`**。老板只需要从这个目录打开项目和本文；版本整理、实现、测试和文档同步由开发者负责。

## 游戏已经有什么

万兽纪元是 PC 优先、中文、始终在线的原创 2.5D 回合制宠物 MMORPG。核心体验是抓宠、练宠、观察隐藏成长，再通过转生、进化和融合追求稀有结果。

仓库已经实现账号和四角色槽、地图移动与任务、背包和装备、商店和资产交易、战斗与捕捉、挂机、宠物成长与转生/进化、队伍/聊天/邮件、家族庄园的基础系统。Node 服务端承担玩法权威，MySQL 是正常运行存储；客户端负责输入、表现和同步。这些是代码能力，具体功能是否开放、是否达到首发质量仍由发布计划和运行时开关决定。

目前是有完整系统基础的开发版，**尚未达到可收费上线的成品标准**。剩余方向包括正式视听与首发内容、核心循环和长期经济、Boss/PvP、社交/新手体验、真实支付、生产运维、200 人同图容量证据、桌面正式包和封测。不能用已关闭 Bug 数量或测试通过数量计算“上线完成率”。

**普通启动与审查预览目前仍有画面差异。** 岩脉四层入口已可正常进入，但候选美术只在显式审查预览加载：普通模式仍是网格地面和 `1.0×` 镜头，预览才有洞穴贴图和 `1.52×` 镜头，人物屏幕尺寸也随之改变。Phase610 在严格位置规则下复现 207 步、8 次传送的四层往返，纠正旧记录里笼统的“普通玩家不可达”。现有影片不代表普通启动已交付同样效果，详见 [地图入口与美术边界](phase_610_map_content_and_art_access.md)。

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
2. **洞穴守护战到村口已有自动与真实鼠标返程证明**：[Phase 592](phase_592_cave_return_playthrough.md) 完成守护战、三场普通遭遇全胜及返村，55 个权威回合完整播放；[Phase 596](phase_596_manual_cave_return_completed.md) 用真实鼠标完成守护战后返村，实际为一胜、一超时、五逃跑，15 个回合完整播放。两轮均为旧后端、高生命 QA 队伍。[Phase 602](phase_602_current_cave_evidence.md) 完成当前后端的四层鼠标往返、20 组画面／动作和 48 组性能配对；[Phase 603](phase_603_cave_journey_wait_budget.md) 补齐同一运行内容的守护战、两场普通遭遇全胜及逐层返村，52 个回合完整播放。R1.W024 完成；所有者已选择继续打磨洞穴，当前返工进展见 Phase611，正常难度与所有者美术接受仍待完成。
3. **首次切战卡顿已明显改善，代码已同步 GitHub**：[Phase 548](phase_548_battle_hotpaths_and_authoritative_completion.md) 修复了人物击飞后提前胜利并减少绘制开销；[Phase 549](phase_549_battle_texture_prefetch_and_github_sync.md) 增加有界后台贴图预取，同一五人守护战的新进程首次准备由约 1002 ms 降到两轮约 10 ms。两场权威胜利与五账号奖励到账通过，严格原生前台性能两次通过，最终世界性能探针 `5/5`。此前各阶段已按功能提交推送 GitHub main；107 项旧本地地图证据已在 Phase602 完整备份并更新为当前配对。未知形态或立即开战仍可能走同步加载，不能把这个场景的结果推广成全游戏无卡顿。
4. **依次推进成品门槛**：[Phase604](phase_604_battle_outcome_lifecycle.md)～[Phase607](phase_607_cave_review_and_capture_capacity.md) 已修复旧奖励残留、双台名称混淆、名称挡人及捕捉容量提示的误显示和布局。[Phase608](phase_608_current_cave_evidence_refreeze.md) 冻结最终代码的 20 组画面／动作、48 组性能与碰撞证据；[Phase609](phase_609_current_cave_movies_and_return.md) 补齐同运行版本的四层／地标影片与七战全胜返村，并完成受委托审看。老板现已选择继续打磨洞穴；R1.W025 记录返工结论，[Phase611](phase_611_natural_cave_visual_revision.md) 已接入十二块新地表与两种原创斜向岩壁，四层 20 项自动实机检查通过；四层真实鼠标 20 项与新影片已通过；完整性能配对因原生窗口停止绘制仍待补测；之后推进剩余视听验收、首发内容、玩法／经济、运营基础设施、正式构建和封测。

下面按当前问题汇总证据。详细测试数字和当时失败记录保留在 Phase 文档；旧记录中的“下一步”不再作为当前游标。

| 当前事项 | 已有证据 | 仍需完成 |
| --- | --- | --- |
| 人物比例、遮挡与地标构图 | [Phase 555](phase_555_world_prop_player_visibility.md)／[Phase 556](phase_556_guardian_navigation_camera.md) 修复挡人与裁切；[Phase 602](phase_602_current_cave_evidence.md) 用当前 Compatibility 路径重新实测四层墙前后、石柱阻挡、上下楼和守护对话，20 组正式截图／动作已配对；[Phase 605](phase_605_cave_landmark_identity.md) 修复双台名称混淆；[Phase 606](phase_606_world_marker_player_visibility.md) 使名称避让人物，原生接近与对话画面不再重叠；[Phase608](phase_608_current_cave_evidence_refreeze.md) 已在最终代码上重冻四层 20 项真实动作／画面 | 所有者接受仍待完成；外围环境物件不能冒充全部无遮挡 |
| 四层路线与五人守护战 | [Phase609](phase_609_current_cave_movies_and_return.md) 在与 Phase608 相同运行内容上完成守护战＋六场普通遭遇全胜返村；114 个回合完整播放，五账号各地之戒 +1／石币 +2507，1048.467 秒原速录像完整解码，171 张关键帧已审看 | 当前严格全胜门 **PASS**，Phase607 失败原件仍保留；高生命 QA、自动操作及关键帧审查不替代正常难度、五真人联机或所有者接受 |
| 同屏队友外观与持续可见性 | [Phase 563](phase_563_remote_player_appearance.md) 接通权威外观、八向动画、相同比例、点击范围和提交后骑乘通知；[Phase 564](phase_564_idle_online_presence_refresh.md) 修复静止定时刷新误隐藏人物，真实 HTTP/WS 旁观回归通过，服务端 `48/48`、客户端 `5/5` | 补做当前联网客户端点击、上下骑和切图的人工视觉复核；自动回归及展示片不代表五真人联机或 200 人容量 |
| 四套战斗人物与首场加载 | [Phase 566](phase_566_authoritative_battle_appearances.md) 修复权威外观丢失；[Phase 567](phase_567_nearby_character_battle_prefetch.md) 补齐同图人物预取，首次准备 `430.989→9.700ms`，客户端 `4/4`，完整原生五账号奖励再次通过；录制休眠中断已处理 | 立刻开战或尚未进入预取的人物仍可能同步加载；原生鼠标、正常前台性能和所有者接受继续待完成 |
| 关闭客户端的资源回收 | [Phase 570](phase_570_prefetch_request_cleanup.md) 修复退出及加载失败时未回收后台贴图请求，提前退出由四个泄漏变为零；定向 `4/4`、原生请求回收和完整五账号胜利通过，五人各获地之戒、人物倒下后的宠物指令再次验证 | 当前自动试玩不替代真实鼠标、前台性能或所有者接受 |
| 原生地图性能 | [Phase608](phase_608_current_cave_evidence_refreeze.md) 对最终源码新测 48/48 组、36,768 个焦点／绘制观察帧，失焦和不可绘制均为 0，绝对／增量门槛全部 **PASS**；[Phase601](phase_601_compatibility_renderer.md) 保留切换后端时的正常时钟 CPU 对照 | 当前探针不是整进程 CPU 或 FPS；只验证本机，Windows 与多人容量未测；老板美术接受仍待完成 |
| 运行优化 | [Phase 559](phase_559_world_depth_and_bounds_hotpaths.md) 精简范围／排序；[Phase 561](phase_561_camera_score_pruning.md) 剪去无效镜头评分；[Phase 565](phase_565_retained_world_ground.md) 缓存静态地面；[Phase 568](phase_568_cached_ground_geometry.md) 合并保留地面几何，十对画面逐像素一致，原生录片渲染器 CPU 均值 `0.08→0.04–0.05ms`，当前五账号奖励和地图恢复再次通过 | 最新地图性能结论见 Phase608；各阶段局部收益不能分别当作 FPS 提升或多人容量证明 |
| 相机与外观的重复计算 | [Phase 577](phase_577_player_appearance_selection_cache.md) 复用未变化的外观选择；[Phase 578](phase_578_camera_policy_dispatch.md) 合并相机资格判断，384 种状态及定向回归通过；[Phase 598](phase_598_world_idle_rendering.md) 已补相机休眠的正常时钟 CPU 对照及 19 项／1050 帧相机与坐标换算回归 | 本轮对照只验证相机休眠与按需绘制的收益，不能归因给早期缓存，也不证明整体性能或 200 人容量 |
| 取证可靠性与时间口径 | [Phase 551](phase_551_map_evidence_commit_provenance.md) 绑定运行内容和祖先提交；[Phase 558](phase_558_native_performance_visibility.md) 验证前台绘制；[Phase 562](phase_562_runtime_probe_wall_clock.md) 区分模拟／实际时间；Phase 576 正常 30 FPS 下美术约 `7.784% CPU`、网格约 `22.366%`；[Phase 580](phase_580_current_guardian_mouse_review.md) 关闭详细计时并明确运行时 VSync 后仍测得约 `0.150ms` 静止增量，未采用无收益的调用方式微调 | 同版渲染路径对照不是修改前后收益；脚本区段增量不等于整进程 CPU 增量。普通启动会覆盖命令行 VSync 设置，不能混用不同条件的数据或据此放宽性能门 |

[Phase 595](phase_595_manual_recording_clock.md) 修复了人工录制的时钟加速，并验证最小化／恢复／关闭地图。[Phase 596](phase_596_manual_cave_return_completed.md) 在该条件下完成完整鼠标返村：56 次工具调用／54 张图零错误，2028 次窗口采样均可绘制，本轮未再停画。限速仅用于人工录制，未改变游戏性能或阈值；一次成功长流程不代表所有系统窗口条件都已覆盖。

**接下来的顺序**：老板选择选项 2 后，[Phase611](phase_611_natural_cave_visual_revision.md) 已重做十二块地表、两种斜向岩壁和四层围合，保留全部玩法地图字节。二十组原生动作、二十项真实鼠标、碰撞、四层与双台影片均已保存，提供 [前后对比页](../.run/phase611-working/review/index.html)。当前只缺稳定可绘制前台环境下的完整 48 组性能：三次尝试未通过，不能拼接或借用旧报告。游标保留 R1.W026，W026–W028 不提前勾选；补完后进入 W029 外观验收，P2.1a 继续 pending。下一次不要重做素材、重复有效动作或恢复旧游标。

普通启动的岩脉四层以及潮回等地图仍有网格占位，不能把岩脉候选预览当作正式画面已完成。Firebud v2、融合、环境声和 Bui VFX 已有返工或延期决定，不从旧主目录的 `R1.01` 重做；其中 Firebud v2 的美术延期保留既有地图玩法回退，不代表村庄关闭。Earth Vein 仍为待验收候选；若选择洞穴内容首发延期，R1.10 还需处理入口、关联玩法与权威访问，当前未执行关闭。测试和内部审查不等于老板亲自批准精确美术资产。

全局发布结论仍为 **BLOCKED**。R0 曾有完整候选验证历史，但不能把历史通过、当前开发目录和正式发布混为一谈。

## 老板与开发者怎么配合

老板给方向和最终效果反馈；开发者负责构思、拆解、实现、验证、整理和持续推进。常规技术选择、可逆修复与既定路线内工作直接执行，不再把 Git、目录或工具细节交给老板决策。

2026-09-18 老板已授权设定目标后连续自主开发，并要求已完成的工作提交 GitHub。持续目标是推进到可完整试玩的 PC 成品候选；当前先收口岩脉洞穴和五人守护战，再按既定路线推进。开发者连续执行实现、实机验证、文档和分批提交，不再逐阶段询问是否继续。该授权不等于最终美术验收或生产发布批准。

涉及尚未确定的收费/经济规则、重大产品取舍、外部账号与资源，以及最终视觉和封测接受时，先准备具体可看的结果，再说明推荐方案和影响，请老板决定。没有这些门槛时继续完成后续已授权工作。

开发方法见 [开发指南](development.md)，代码位置见 [架构说明](architecture.md)，整理过程见 [Phase 543](phase_543_repository_navigation_and_http_boundaries.md)，统一过程见 [Phase 544](phase_544_unified_development_workspace.md)。
