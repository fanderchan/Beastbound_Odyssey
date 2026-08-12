# Design QA：宠物技能页玩家化重制

## Findings

- 原 Phase 374 证据存在一项由项目所有者发现的 P2：中段滚动时，下一张技能卡
  描边越过木框底边。根因是滚动裁切区使用 16px 底部边距，只对齐木框外沿，
  而没有避开木框的可见内边界。
  - Fix：详情底部安全边距调整为 32px，并显式启用 `ScrollContainer` 裁切。
  - Verification：自动回归实测滚动视口与底部宠物栏间距 34px；修复后
    `frame-02.png` 覆盖原问题的中段滚动状态，不再有卡片描边残留。
- 修复后的当前证据没有剩余 P0、P1 或 P2 工程差异；仍等待项目所有者观看新
  视频完成视觉验收。
- [P3] 实机技能卡的描边、类型徽章和图标对比度比参考图更强。
  - Location：右侧技能列表。
  - Evidence：参考图偏低对比的棕色长卡；实机用紫色被动、橙色主动和精确技能图标强化快速识别。
  - Impact：不改变布局与操作，1280×720 下更易区分技能类型。
  - Fix：本轮保留；若后续整套宠物 UI 统一降噪，再同步降低描边亮度，不单独改技能页。
- [P3] 实机在同一视口内展示三条被动和主动技能，单卡略矮于参考图。
  - Location：右侧技能列表密度。
  - Evidence：参考图首屏约两张大卡；实机首屏能看到三条被动和第一条主动，展开后显示完整说明。
  - Impact：信息密度更高，但名称、来源、类型和图标均清晰，没有截断或误触。
  - Fix：保持当前密度；它适配项目“被动在前、固定七个主动槽”的真实数据合同。

## Comparison target

- Source visual truth：`/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-a9f37067-c082-4531-bb37-b6f2fc356cab.jpg`
- Normalized source：`.run/visual-review/pet-skill-page-v1/comparison/source-normalized-1280x720.png`
- Implementation screenshot：`.run/evidence/phase375_pet_skill_clip_fix/phase373-20260729T195349.615151Z-6b635470/screenshots/frame-02.png`
- Viewport：`1280×720`
- Source pixels：原图 `2622×1206`，居中裁切至 `2144×1206` 后等比归一化为 `1280×720`
- Implementation pixels：`1280×720`，真实 `Main.tscn`、`1×` 内容像素
- State：宠物技能页、晶甲乌力、三条被动、七个主动槽、第一张主动技能卡
- Data safety：隔离内存档案；未连接后端或 MySQL，未写正常玩家存档

## Comparison evidence

- 全视口同屏：`.run/visual-review/pet-skill-page-v1/comparison/reference-vs-runtime-final.png`
- 技能面板聚焦：`.run/visual-review/pet-skill-page-v1/comparison/reference-vs-runtime-panel-final.png`
- 实机与参考图均保留左侧完整宠物、底部宠物卡带、右侧嵌入式技能卡和纵向页签；实机没有独立程序员弹窗、内部 ID、测试字段或石币常驻调试文本。
- 实机没有虚构“技能等级”。当前权威技能系统没有升级机制，因此卡片显示真实来源、类型、目标与效果。

## Required fidelity surfaces

- Typography：暖白正文、金色标题、紫色被动和橙色主动层级清楚；技能名、来源和类型均无截断。
- Layout：技能页嵌入既有宠物大页；左侧主宠与底栏不被遮挡；右侧滚动列表按“被动技能 → 主动技能”排列。
- Cards：普通卡 `396×90`，展开卡 `396×162`；图标框 `68×68`，正式图标 `56×56`；卡片间距和点击区域一致。
- Icons：12 个主动、10 个被动均按精确技能 ID 使用原创图标；空技能位使用独立石骨加号，不用字符、emoji、宠物头像或通用占位块。
- Copy：说明来自 canonical 技能数据；`quick_instinct` 明确显示“效果尚未开放”，没有把表现占位冒充为已生效机制。
- Controls：普通模式只读；训练师模式沿用同一套卡片视觉，显示“已学”或真实价格，并保留覆盖与清空二次确认。

## Primary interactions tested

- 点击“技能”页签进入嵌入式技能页；
- 点击技能卡展开／收起详情；
- 点击底栏切换宠物并刷新被动、七个主动槽和图标；
- 训练师状态显示候选技能、已学状态和石币价格；
- 选择技能槽、选择训练技能、弹出覆盖确认并成功学习；
- 选择“清空技能槽”、弹出“确认清空”并恢复真实空槽；
- 普通槽位、被动卡和训练候选的点击信号互不串扰；
- 正常玩家路径不显示训练价格或学习按钮。

## Comparison history

| 轮次 | 发现 | 修复 | 复核证据 |
| --- | --- | --- | --- |
| 旧实现 | P1：独立半透明程序员弹窗、纯文字按钮、无技能图标，宠物主舞台和底栏被割裂 | 重做为宠物大页内嵌技能卡；接入原创精确 ID 图标和玩家文案 | 最终全视口同屏 |
| Pass 1 | P2：“血脉被动”错误缩窄语义；清空技能槽功能遗漏；空槽重复“技能槽3·技能槽3”；清空弹窗标题仍为“确认覆盖” | 改为“被动技能”；补同款清空卡与二次确认；空槽改为“等待学习”；标题改为“确认清空” | 最终视频 `00:42–00:53` |
| Pass 2 | 工程复核未发现 P0、P1、P2 差异，但未覆盖中段滚动木框边界 | 无修改 | 原 Phase 374 视频 |
| Owner review | P2：下一张技能卡在中段滚动时越过木框底边 | 滚动区底部安全边距 `16 → 32px`，显式开启裁切，并新增 `>=32px` 自动断言 | Phase 375 `frame-02.png`、`clip=true`、`clearance=34.0` |

## Implementation checklist

- [x] 嵌入式玩家技能页替代旧程序员弹窗。
- [x] 12 主动 + 10 被动 canonical 展示字段与精确技能图标齐全。
- [x] 被动在前、固定七个主动槽、真实空槽和展开详情齐全。
- [x] 普通只读与训练师学习／覆盖／清空流程齐全。
- [x] 修复后同视口全图、问题中段状态和 `1×` 实机视频已生成。
- [x] 剩余差异仅为 P3 风格密度取舍。

final result: engineering_passed; owner_review_pending

# Phase 377 Design QA：觉醒风格背包与装备对比

## Result

- P0：无。
- P1：无。
- P2：无。最终 `1280×720` 画面中的概览、扩容、拆分、宠物目标、回血、
  五类筛选、装备对比、宠物蛋和骑宠证均没有越界、裁切、假图标或程序员字段。
- 这是基于参考层级和材质语言的 Beastbound 原创适配，不宣称像素级复制。
- 工程 Design QA 已通过；项目所有者的视觉验收仍保持 `owner_review_pending`，
  等待观看最终 1× 视频。

## Comparison target

- 概览参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-4849fe4f-2d51-410e-9f9e-6e53e48e3619.jpg`
- 装备比较参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-e63d479d-4446-4a24-bbe2-32a3c430b48a.jpg`
- 实机概览：Phase377 v5 `frame-02.png`，`4.703125s`；
- 实机红绿比较：Phase377 v5 `frame-11.png`，`32.921875s`；
- 参考和实机均归一化为 `1280×720` 后同屏判断。

## Comparison evidence

- 概览同屏：
  `.run/evidence/phase377_backpack_awakened_owner_review/design-qa-final-v5/overview-reference-vs-runtime.png`
- 装备比较同屏：
  `.run/evidence/phase377_backpack_awakened_owner_review/design-qa-final-v5/compare-reference-vs-runtime.png`
- 最终视频：
  `.run/evidence/phase377_backpack_awakened_owner_review/phase377-backpack-final-v5/backpack-awakened-owner-review-1x.mp4`
- 联系表：
  `.run/evidence/phase377_backpack_awakened_owner_review/phase377-backpack-final-v5/contact-sheet.png`

## Required fidelity surfaces

- Layout：左装备／完整人物、右背包、顶部货币与关闭入口；九装备位和五列背包
  不相互遮挡。
- Material：深色石木背景、暖金框线、木质按钮和橙色关闭按钮保持与近期宠物页
  一致。
- Icons：81/81 物品有真实纹理；货币、装备、消耗、材料、宠物蛋和许可证均无
  emoji、文字图标或截图裁片。
- Controls：筛选、详情、装备、卸下、使用、拆分、丢弃、扩容、宠物目标和取消
  都是可操作控件，并接入真实现有流程。
- Comparison：当前／候选并列，强化与耐久可见，正属性为绿色、负属性为红色，
  同模板不同强化实例不会串选。
- Safety：普通玩家界面不显示实例 ID、schema、测试标志、来源、hash 或 QA
  说明。

## Intentional differences and P3 observations

- 参考图使用蓝／紫／橙品质色块；Beastbound 当前没有权威物品品质字段，因此
  使用统一黑金物品卡。这是避免伪造玩法的合同差异，不是遗漏。
- 物品格为了容纳 `5×4` 与 `15+5` 容量，长名称会省略；点击后详情显示完整名称
  和说明。后续如建立权威品质系统，可同时重新评估卡片密度与颜色。
- 装备比较下半部和按钮列比参考图留白更多，换取 1280×720 下稳定的并排阅读，
  不影响红绿差值和主操作。
- 本轮没有宣称完整屏幕阅读器或 GPU 单帧分析；左键主流程、真实跨帧鼠标压力和
  当前性能探针均已通过。

## Interaction and visual verification

- 22 个连续章节在真实 `Main.tscn`、`1.00x` 中完成；
- 拆分弹窗最终实测 `420×246`，居中且无底部溢出；
- 宠物目标显示芽耳布伊 `281/351`，使用后显示绿色 `+70` 并成为
  `351/351`；
- 三种目标层关闭路径均恰好取消一次，不会重新弹出；
- 装备实例比较先展示同模板 `+1 → +4`，再展示攻击 `+1`、敏捷 `-2`；
- 视频为 `50.166667s / 1505` 帧、H.264/AAC、`1280×720 / 30 FPS`，完整音
  视频解码通过。

final result: engineering_passed; owner_review_pending

---

# Phase 378 Design QA：固定四角色槽与登录后角色入口

## Result

- P0：无。
- P1：无。
- P2：无。最终 `1280×720` 画面没有槽位越界、文字裁切、假加号、程序员字段或
  输入穿透；四张角色卡、返回、创建弹窗与进入按钮均可通过左键完成。
- 本轮按参考图的信息层级重建，但背景、人物、独立头像、槽框和图标均为
  Beastbound 原创 ImageGen 美术；不复制参考角色、像素或商标。
- 工程 Design QA 已通过；正式素材 `ownerReviewStatus` 仍为
  `owner_review_pending`，等待项目所有者观看最终视频。

## Comparison target

- 参考图：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-adee60c3-7c14-489d-8417-9fa7a5c0347d.png`；
- 实机主画面：`.run/character_entry/character_entry_final_1280x720.png`；
- 创建弹窗：`.run/character_entry/character_entry_create_final.png`；
- 同屏比较：`.run/character_entry/character_entry_reference_comparison.png`；
- 视口：参考与实机均按 `1280×720` 判断；实机来自真实 `Main.tscn`。

## Required fidelity surfaces

- Layout：左侧原创完整人物，右侧固定四槽纵排，左上返回，右下进入；树冠、篝火
  和海岸背景提供与参考一致的视觉重心，但不照搬其资产。
- Material：暖砂岩、深木、金色高光和半透明暗槽与近期宠物／背包 UI 统一。
- Cards：选中卡 `420×132`，空卡 `420×132`；空槽加号为正式绘制图标，不是字符。
- Portrait：角色卡使用独立绘制大头照，不从全身像裁切。
- Controls：主角色、副角色、空槽、创建弹窗、输入、取消、恢复主角色均由真实跨帧
  鼠标／键盘事件驱动；右键不是必需输入。
- Safety：玩家界面不显示 `playerId`、slot index、epoch、raw code、QA 说明或后端状态。

## Interaction and evidence

- 角色流自动检查覆盖固定四槽、选择、创建、取消、返回与状态隔离；
- 隔离 QA 后端真实 HTTP 链路覆盖 register、entry、create、select 与 profile sync；
- 预览 CPU render 平均 `0.16ms/frame`；
- idle／真实跨帧 movement 探针均为 `60 FPS`、`process_total=0.04ms`，移动检查
  `status=ok`；
- 最终视频：
  `.run/evidence/phase378_character_entry_owner_review/phase378-character-entry-final-v2/character-entry-owner-review-1x.mp4`；
- 联系表：
  `.run/evidence/phase378_character_entry_owner_review/phase378-character-entry-final-v2/contact-sheet.png`；
- 视频为 `17.966667s / 539` 帧、`1280×720 / 30 FPS / 1.00×`、H.264/AAC，
  完整音视频解码通过；共展示主角色、切换副角色、打开创建、输入名字、取消和恢复
  主角色六个连续状态。

final result: passed

---

# Phase 398 Design QA：觉醒式正式宠物图鉴与获取途径内嵌页

## Result

- P0：无。
- P1：无。项目所有者未批准的宠物画像无法经 family／form／showcase／portrait／route／skill
  原始纹理绕过门禁；共享画像 API 不变，不使 Phase 396 HUD 或宠物管理页退化。
- P2：无。最终 `1280×720` 画面保留参考的左种族、中展示、右成长／属性三栏层级和暖木金材质，
  “获取途径”是同页内嵌层，不是程序式系统弹窗；“鉴”字、按钮、页签、形态卡、自然占位文案
  均无乱码、越界、裁切或 QA／工程话术。
- `5302406ab` 基线上的工程、媒体与参考同屏 Design QA 已通过；项目所有者的主观视觉验收仍为
  `ownerReviewStatus=pending`，broad P2.2 不勾选。录后 current main 已推进到 Phase 399
  `3c0e811aa`，所以本结果不冒充当前 main 发布通过；迁移、冲突审计、相邻回归及可能重录仍是
  独立阻断门。

## Comparison targets

- 概览参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-be26f056-fcc1-4415-b2ee-2d5edf314ace.png`；
- 获取途径参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-bb5a1c7e-4b8b-4f4c-a504-fa11ec0215a3.png`；
- 实机概览：Phase398 final-v3 `keyframes/frame-04.png`；
- 实机获取途径：Phase398 final-v3 `keyframes/frame-09.png`；
- 四状态同屏：
  `.run/evidence/phase398_pet_codex_reference_comparison/phase398-pet-codex-final-v3-20260808/reference-vs-implementation.png`，
  SHA-256 `250b49263ab8e3c922ca768f7b8201a2008a50dd318786651b5452858b57f14b`。

## Required fidelity surfaces

- Layout：左侧 11 种族纵列、中部种族／形态与展示区、右侧成长／属性页签；关闭后恢复 Phase 396
  顶栏、任务／组队栏和右下固定栏，不把地图功能留在图鉴之上。
- Material：仅借鉴参考的暗木、暖金、兽骨／石纹层次，使用 Beastbound 原创底板、既有正式按钮
  primitives 与正式爪印图标；不复制参考宠物、图标、文字、数值或 UI 像素。
- Truth：未遇见形态匿名；已遇见形态显示真实名称；未获批准画像显示“形象尚未收录”；成长页
  只公开 Lv1 四维与“成长倾向”，不泄露隐藏总成长或伪造拥有数量。
- Modal：点击“获取途径”显示 `(418,148) / 365×402` 内嵌页，阻断种族、形态、页签和世界输入；
  顶部关闭第一次只折叠内嵌页，第二次才退出图鉴。
- Controls：正式右下图鉴入口、种族、形态、成长／属性、获取途径、两级关闭均由真实跨帧左键完成；
  右键不是必需输入。
- Safety：玩家 UI 不显示 form ID、资源路径、画像审核状态、缓存计数、性能值、测试标志或 agent
  文案；帮助爪印为装饰，不保留无反馈的死按钮。

## Engineering and media evidence

- focused 面板检查通过：11 个种族、4 个同族形态、10 张获取途径卡；72 次热切换
  `maxBuild=0.002ms / maxApply=1.978ms / maxRefresh=1.979ms`，路线读取 `38→38`。
- Godot 专项 parse＋auto `2/2 PASS`；字形、匿名／pending 画像、伪造纹理、modal 不穿透、顶部
  关闭顺序、正式 HUD 恢复、菜单／静止／战斗 `60/30/60 FPS` 均为 true。
- native visible Main 不含 `--fixed-fps`／Movie Maker，前后都在前台；自身 ticks 为
  `process_total max=3.909ms / 654 samples`，selection `2.996ms`、input dispatch `0.020ms`、
  detail tab `6.886ms`。built-in delayed monitor 不用于逐帧 CPU 放行。
- 最终真实 `Main.tscn` 有声视频位于
  `.run/evidence/phase398_pet_codex_awakened_owner_review/phase398-pet-codex-final-v3-20260808/`，
  为 `17.466667s / 524` 帧、`1280×720 / 30 FPS / 1.00×`、H.264 `yuv420p`／AAC 48kHz
  双声道；9 章、15 次跨帧真实左键，完整解码通过。
- MP4 SHA-256 `62f6d9bb61312b6362660eceed8968f0e354e3cc14c0ae81e9e907050756ca76`；
  联系表 SHA-256 `6f068149f4396b486791e3a66a85e6d690b0d888f4b545e67e80655b46b7c428`；
  `SHA256SUMS` 覆盖 45 个保留证据文件并逐项通过，两份 Godot 日志无 ERROR、WARNING、
  leak、POINTER 或失败 marker。
- 捕获使用隔离 user-data，未启动后端、访问 MySQL 或走普通玩家 save path；`serverWrites=0`
  只是隔离捕获合同，不是联网 HTTP／MySQL 写入计数器。

## Intentional differences and P3 observations

- 参考图展示商业产品宠物与技能美术；本阶段不以项目所有者未批准的候选画像填满画面。自然占位
  是发布边界，不是素材丢失。批准正式画像后可沿同一 approved-only API 逐只补齐。
- 参考右栏含具体成长区间和技能图；Beastbound 只显示当前权威允许公开的 Lv1 四维、成长倾向和
  已登记技能，不为了视觉密度伪造隐藏成长或未登记能力。
- native visible Main 的自身 ticks 负责性能结论；30 FPS Movie 的 delayed monitor 只作诊断。
  两类证据不能互换。
- detached source attestation 已将 19 个录制关键路径绑定到 `5302406ab` 基线媒体；Phase 文档、
  本 Design QA 和路线图作为三份 post-run docs 明确排除。它没有可信时间戳，也不证明
  `3c0e811aa` current main 兼容。
- 宠物管理、任务路线、挂机、地图、battle-command 相邻回归须在安全迁移后重新串行执行；
  失败会阻断发布，不以本 Design QA 结果覆盖。录制相关源码或玩家可见状态变化时必须重录。
- `ownerReviewStatus=pending`；本结论不代表项目所有者已接受底板审美或 broad P2.2 完成。

final result: baseline_engineering_media_passed; main_migration_pending; owner_review_pending

---

# Phase 394 Design QA：挂机匹配、真人优先与陪练 NPC 软补位

## Findings

- P0：无。
- P1：无。服务端独立审计最终确认真人队伍、`8s` 软补位、下一场真人替换、掉线席位、
  幂等／模糊提交恢复和 NPC 奖励隔离均没有阻断问题；不存在幽灵队列、revision 回退、NPC
  冒充真人或旧手工陪练继续写档。
- P2：无。真实 `Main.tscn` 的路线卡、便捷组队、开始二选一、真人等待、陪练 NPC、下一场
  替换和世界状态均完整落在 `1280×720`；路线／真人／临时 NPC／空位层级可读，主动作、
  取消、停止与关闭均可左键完成，正常画面无队列 ID、接口、测试或 agent／QA 文案。

## Comparison target

- 比较目标为项目所有者同轮提供的挂机选区、便捷组队、立即／匹配挂机、真人等待、NPC
  补位及回到世界状态参考截图；Phase 393 已单独处理同轮的战后奖励图。
- 比较范围是页面层级、选择顺序、真人优先、补位透明度、下一场替换语义和世界挂机连续性；
  不要求复制参考游戏的角色、宠物、地图、商标、在线人数、数值或像素。

## Comparison evidence

- 连续视频：
  `.run/evidence/phase394_hang_matchmaking_owner_review/phase394-final/hang-matchmaking-owner-review-1x.mp4`；
- 15 帧联系表：
  `.run/evidence/phase394_hang_matchmaking_owner_review/phase394-final/contact-sheet.png`；
- 结构化摘要：
  `.run/evidence/phase394_hang_matchmaking_owner_review/phase394-final/summary.json`；
- 成片为真实 `Main.tscn`、Metal、`1280×720 / 30 FPS / 1.00×`，共
  `23.833333s / 715` 帧；MP4 SHA-256：
  `9074a94aa54458c6aeae20277cf0151412d7d5f312139fd74f6860e6c6955f0c`。

## Required fidelity surfaces

- Layout：顶部标题与关闭、路线／便捷组队页签、左侧六条正式路线、中部规则与席位、底部
  主动作形成固定阅读顺序；开始二选一作为同页模态层，不让背景误触。
- Hierarchy：当前路线、可立即挂机状态、真人数、陪练 NPC 数和空位明确分层；队伍卡不会把
  NPC 画成在线玩家，世界状态条只保留当前挂机／匹配摘要和停止入口。
- Truth：服务器等待满 `8s` 才软补位；真人加入立即缩减 NPC，已开战不被强切而在下一场
  替换。取消匹配继续挂机，停止挂机才隐藏状态；队长掉线取消匹配，非队长掉线由 NPC 补席。
- Controls：路线、页签、队伍、立即挂机、匹配挂机、取消、停止和关闭均可真实跨帧左键完成；
  非当前地图使用正式跨图寻路，不提供服务端不存在的指定队伍申请按钮。
- Safety：NPC 不计在线人口、不进入 participant IDs、奖励、捕捉、档案或 receipt；旧手工陪练
  无入口、无 mutation，新战斗不注入，旧 frozen actor 只读显示且不可再获得 EXP。
- Continuity：匹配在挂机中进行，关闭面板或取消匹配不会中断已经选择的挂机；登入／重连、
  满员后 party update 和队员离开都按单调 revision 有界刷新。

## Interaction, regression and performance evidence

- 服务端 Node 语法检查与四个定向套件合计 `142/142 PASS`，独立审计 P0／P1／P2 均无；
  保存失败、GET prune 交错、单人／合并队员模糊 COMMIT、重启 exact replay、离线席位、NPC
  战斗注入与奖励隔离均有回归。
- 客户端 `--auto-hang-matchmaking-check` 为 `2/2 PASS`，choice、matching、dedupe、
  npc_filled、replacement、full、party update refresh、matching resumed、人物／宠物自动策略、
  取消继续挂机和停止隐藏全为 `true`。
- 网络模型 focused check `16/16`；面板 focused check、挂机任务 standalone、Godot 解析和任务
  模板／任务链／任务 UI `4/4` 均通过；旧手工陪练 UI、flag、按钮和包装函数精确残留为零。
- fixed idle／movement 均保持 `60 FPS`，`process_total` 分别为 `0.03..0.04ms` 与
  `0.04..0.05ms`；112 次跨帧点击合并为 33 次寻路并停稳，`0.05..0.07ms`。Metal 实时时钟
  idle 为 CPU 中位 `4.8% / process 0.285ms`，movement 为 `11.8% / 0.29ms / 60 FPS`。
- 录像共 9 次真实左键，十章 flow coverage 全为 true；隔离 user-data、无后端／MySQL／服务端
  写入。录像采样峰值 `42.602ms` 不作为稳态性能结论。

## Intentional differences and P3 observations

- [P3] Beastbound 明示“陪练 NPC”，不把补位角色混入真人在线数。参考流程的高人口观感不能
  覆盖本项目的数据真实性原则；这项差异保留。
- [P3] 当前只有统一自动匹配，不提供参考中可能存在的指定队伍申请、聊天招募、跨服或付费
  加速入口，因为服务端尚无这些权威合同。
- [P3] 未做真实 MySQL fault injection 或完整 `npm test`；typed async store 已覆盖模糊
  COMMIT，发布前仍需 MySQL 专用演练。旧 frozen room 的无入口 internal helper／switch 只为
  只读兼容保留，可另阶段清理。
- [P3] 本轮工程与媒体 Design QA 通过，但项目所有者尚未观看最终视频；
  `ownerReviewStatus=pending`，不能冒充 owner visual approval 或 broad P2.2 完成。

## Comparison history

| 轮次 | 发现 | 修复 | 复核证据 |
| --- | --- | --- | --- |
| 合同审计 | P1：旧路径让玩家手工增删本地陪练，既不是真人匹配，也会把本地对象混进战斗与奖励 | 退役全部玩家入口和 mutation，改为正式路线的服务端权威真人优先／NPC 软补位；旧档只读兼容 | 旧 UI／flag／wrapper 零残留；profile action 与 frozen room 回归通过 |
| Server Pass 1 | P0：延迟 join 的整表快照可覆盖 GET prune，复活过期队列并回退 revision | 改为提交后 delta rebase 与单调 revision | delayed durable join／GET prune 交错回归通过 |
| Server Pass 2 | P1：模糊 COMMIT 重启与合并入队缺少最小 exact receipt；离线成员仍可能占真人席位 | receipt 冻结 party＋target 最小证明；重启重建唯一队列；只按在线真人计席，队长掉线取消 | single＋merged ack-lost、restart、offline seat 回归通过 |
| Client Pass | P2：需要同时证明二选一、软补位、下一场替换、取消继续和停止隐藏，而不能靠静态截图 | 真实 Main 十章连续录像、9 次跨帧左键与专项状态机断言 | 客户端 2/2、focused checks、23.833333 秒视频 |
| Final | 未发现剩余 P0、P1、P2；保留三项明确 P3 边界 | 无进一步改动 | Node 142/142、客户端专项全绿、完整媒体解码与独立 PC 性能探针 |

`ownerReviewStatus=pending`；本结论只代表工程 Design QA 通过，不替代项目所有者观看与审美接受。

final result: passed

# Phase 393 Design QA：PvE 胜利后的世界奖励上漂

## Result

- P0：无。
- P1：无。
- P2：无。最终 `1280×720` 世界画面保持可见，胜利标题与最多五条奖励卡位于中央安全区；
  人物、骑宠、战宠、伙伴经验、人物／宠物升级、石币、背包物品与邮箱物品依次出现，
  没有越界、截字、程序员字段、通用“确定”弹窗或点击阻断。
- 工程 Design QA 与动态媒体门禁已通过；项目所有者尚未观看最终 `1×` 视频，因此
  `ownerReviewStatus=pending`，本结果不代替主观视觉接受。

## Comparison target

- 主要参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-8732b753-37bc-483b-a0ae-4cc94977e89c.jpg`；
- 最终视频：
  `.run/evidence/phase393_battle_outcome_owner_review/phase393-video-foundation-smoke-v2/battle-outcome-owner-review-1x.mp4`；
- 动态联系表：
  `.run/evidence/phase393_battle_outcome_owner_review/phase393-video-foundation-smoke-v2/contact-sheet.png`；
- 代表性满队列帧：
  `.run/evidence/phase393_battle_outcome_owner_review/phase393-video-foundation-smoke-v2/keyframes/frame-06.png`。
- 参考图的“新功能开启：世界首领”按项目所有者说明属于干扰项，不纳入 fidelity surface；
  比较只关注回到世界、奖励文字居中出现、逐条上移与自动收敛。

## Required fidelity surfaces

- Hierarchy：金色“战斗胜利”先建立结算语义，奖励行在中央下方形成稳定纵向队列；背景
  世界、任务栏和 HUD 仍可辨认，不把结算改成遮满全屏的程序式报表。
- Motion：行以固定间隔进入，已有行同步上移，队列完成后整体上漂并淡出；脚本实测
  `upwardMotionObserved=true / fadeObserved=true / queueCompleted=true`。
- Typography：经验、普通奖励、升级和警告有独立明度层级，暗褐半透明卡与描边保证在
  明亮草地上仍可读；最终帧未见中文乱码、裁切或文字碰撞。
- Truth：所有行从当前账号的权威 `profileWriteback` 投影；同一骑宠／战宠实例去重，升级
  只认 `levelsGained/level`，物品显示玩家名称而非 raw item ID。
- Controls：浮层为 `MOUSE_FILTER_IGNORE`，自动结束且不要求点击；正常世界左键与挂机流
  不因结果展示增加新的强制步骤。
- Viewport：正式目标是 PC `1280×720`；没有把移动端、竖屏或触控专属布局冒充已完成。

## Intentional differences and P3 observations

- [P3] 参考图把奖励字叠在“新功能开启”大遮罩上；Beastbound 按明确需求移除该干扰项，
  使用独立胜利标题和暗褐奖励卡，优先保证不同地图亮度下的可读性。
- [P3] 参考画面同时只露出少量细条；实机为覆盖人物、骑宠、战宠、伙伴与物品，将队列
  上限设为五行，旧行上移退出，避免十一项一次性铺满屏幕。
- [P3] 本阶段只改服务端组队 PvE 胜利；失败、逃跑、超时、切磋和庄园战仍保留既有结果
  框，因为这些流程还可能需要损失或对手信息，不能凭一张胜利参考图一并改写。

## Comparison history

| 轮次 | 发现 | 修复 | 复核证据 |
| --- | --- | --- | --- |
| 合同审计 | P1：原组队 PvE 胜利在清掉战斗场景后打开固定 `420×184` 通用确认框；actor 战斗漂字又随 `_end_battle` 清空，不能承担世界结算 | 在清场前冻结权威 view-state，清场回世界后交给独立鼠标穿透浮层 | `--auto-server-battle-target-mapping-check`：`pve_overlay=true` |
| Pass 1 | P1：服务器 `reason="defeat"` 也可能代表敌方被击败，按 reason 会把队友胜利误判为本人失败 | 保留敌方存活与本人 loser 判定，并增加存活队友成为 winner 的回归 | `teammate_victory=true` |
| Pass 1 | P2：关闭房间或重复事件可能重放同一组文字；同宠同时作为骑宠与战宠会重复经验 | 使用 `battleRecordId:accountId` 去重 outcome，并按宠物稳定实例 ID 去重经验 | `pve_dedupe=true`、Presenter 自检通过 |
| Final | 未发现剩余 P0、P1、P2；保留三项有产品边界依据的 P3 差异 | 无进一步改动 | 9.533333 秒真实 Main 视频、12 帧联系表、17/17 SHA |

final result: passed

---

# Phase 392 Design QA：觉醒式交易所全屏三态

## Findings

- P0：无。
- P1：无。
- P2：无。真实 `Main.tscn` 的购买、出售、我的挂单三态均完整落在 `1280×720`；标题、
  货币、关闭、页签、分类、商品／背包卡、详情、上架表单、确认层和主动作没有越界、截断、
  相互遮挡或输入穿透。商品和装备均使用正式 item icon，没有 emoji、字符画、截图裁片、
  假图标或玩家不可理解的程序字段。
- [P3] 第三页签和左侧分类少于参考图。
  - Location：顶部第三页签、购买／我的挂单左侧导航。
  - Evidence：同屏图上排是“购买／出售／公示”及装备、宠物、宠物装备、宠技等分类；
    下排实机只显示“购买／出售／我的挂单”和“全部／装备／道具”。
  - Impact：视觉密度更低，但每个入口都有真实服务合同，不会把宠物交易、公示、预购、
    竞价或收藏伪装成已实现功能。
  - Fix：本轮保留。只有服务端建立对应权威合同后才增加页签或分类。
- [P3] Beastbound 的外框比参考图更深、更具丛林集市质感。
  - Location：全屏外框、底部货车／货箱和中央羊皮纸四周。
  - Evidence：参考图为轻薄木架与大面积浅灰纸张；实机为原创竹木梁、藤叶、暗色货摊和
    暖白羊皮纸，三态结构仍保持同样的顶部页签、左导航、中央列表和右详情顺序。
  - Impact：材质对比更强但阅读区仍明亮，形成 Beastbound 自有视觉身份，不复制商业参考
    像素。
  - Fix：保留原创 `market_awakened_v1`；若所有者反馈长期阅读过暗，再只调整外框亮度，
    不更换真实控件层级。
- [P3] 出售页没有照搬“背包 + 六个挂单槽”的双栏密度。
  - Location：出售态中央和右侧。
  - Evidence：参考图用左侧物品格和右侧六个空挂单槽；实机用“可上架物品／上架预览／
    填写上架信息”三段，并在同屏显示数量、币种、单价、合计、动态预计税费和预计到手。
  - Impact：一次只编辑一个真实挂单，信息密度较低，但精确装备实例、最大 999 堆叠和
    成交邮件回款都能在提交前读清。
  - Fix：保持当前单挂单确认流；本项目没有批量挂单合同，不为填满六个槽伪造状态。

## Comparison target

- 购买参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-c9ab28e4-e0fd-4d92-823f-a0e44307915d.jpg`；
- 出售参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-e3eaa49f-8604-4f7e-8d09-83756b7d1c2f.jpg`；
- 公示参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-7d80efd8-7b88-43c8-9d2b-a2557d42b0a6.jpg`；
- 三张源图均为 `2622×1206`，按宽等比缩放为约 `640×294` 后置于 `640×360` 比较格，
  没有拉伸成 `16:9`；下排三张实现均来自真实 `Main.tscn`、Metal、原生
  `1280×720 / 1.00×` 内容像素，再等比缩到 `640×360` 组成同屏图。
- 比较范围是页面层级、阅读顺序、控件密度、材质与三态一致性；不要求复制参考资产、
  商标、宠物交易、公示机制、数值或货币系统。

## Comparison evidence

- 三参考／三实机状态同屏：
  `.run/evidence/phase392_market_design_qa/reference-vs-real-main-3state.png`；
- 同屏图为 `1920×720`，上排依次是购买／出售／公示参考，下排依次是购买／出售／我的
  挂单实机；SHA-256：
  `8484d1cceb633a3097d2011397ec003623b67b75547acabd2e0b0804b041c3f7`。
- 最终视频：
  `.run/evidence/phase392_market_awakened_owner_review/phase392-market-awakened-final/market-awakened-owner-review-1x.mp4`；
- 联系表：
  `.run/evidence/phase392_market_awakened_owner_review/phase392-market-awakened-final/contact-sheet.png`。

## Required fidelity surfaces

- Layout：顶部标题／货币／关闭，纸面内三页签，左侧分类，中部卡片列表，右侧详情或表单，
  底部状态与主动作形成稳定阅读顺序；三态切换不移动整个页面框架。
- Typography：中文页签、分类、商品名称、价格、税费、数量和玩家提示清楚可读；没有乱码、
  系统内部字段或过量调试说明。
- Materials：原创竹木、藤叶、羊皮纸、货车与货箱保持统一；底板无烘焙文字、商品、按钮或
  商标，全部交互由 Godot 真控件渲染。
- Icons：商品卡和详情使用仓库正式 item icon；装备实例仍显示精确强化、耐久和属性摘要，
  不按同 `itemId` 折叠为假同一件。
- Truth：只显示购买、出售、我的挂单、全部、装备和道具；石币／钻石、动态税费、预计到手
  与邮件回款均来自既有真实合同，不硬编码参考图的固定 15% 或三种货币。
- Controls：分类、搜索、排序、页签、商品／背包卡、数量、币种、单价、购买、上架、下架、
  确认、取消和关闭均可左键完成；确认层在同一页面内，背景状态不会误触。
- Safety：正常玩家界面不显示 `listingId`、`itemId`、`instanceId`、schema、接口名、测试标志
  或 agent／QA 文案；客户端不在权威成功回执前乐观改钱包、背包或挂单。

## Interaction and evidence

- 聚焦面板检查 `PASS`；三态、分类／搜索／排序、正式图标、税费预览、确认层、空状态、
  全视口边界和真实左键事件均通过。
- Godot 最终定向组合 `4/4`：解析、装备实例、市场和 PanelRegistry；市场回归继续覆盖普通
  物与精确装备上架、公开装备安全投影、重复／旧版信封拦截及 buy/cancel 只提交
  `listingId`。
- 真实 `Main.tscn` 九章视频为 `23.133333s / 694` 帧、`1280×720 / 30 FPS / 1.00×`、
  H.264 `yuv420p`、AAC 48kHz 双声道，完整音视频解码通过；MP4 SHA-256：
  `8e670e9d3f0777ad74c57c000ade0efd5ecad9a817a1eb19d7c9410b6d586654`。
- 录像使用隔离档案，不连接后端／MySQL、不提交资产写入；它证明页面和交互，不冒充生产
  成交。
- 同一九章流程的 22 个性能样本为 `process_total=0.06..0.11ms`；独立跨帧移动和 37 次鼠标
  连点检查均为 `status=ok`，移动热身后保持 `60 FPS`，未出现 UI 穿透或目标不收敛。

项目所有者观看本轮视频后反馈“勉强还可以吧”，本阶段记为
`ownerReviewStatus=owner_accepted_with_reservation`；当前工程比较无 P0、P1、P2。

final result: passed

---

# Phase 391 Design QA：商业服务身份与连续验收片

## Findings

- P0：无。
- P1：无。
- P2：无。杂货商、装备商和银行管理员的正式头像、姓名、职业与职责在 `1280×720`
  均清楚可读；身份区没有压住商品页签、银行标题、仓库格或关闭按钮。
- P3：商店和银行继续复用统一觉醒底板，尚无各自专属场景背景；当前材质统一且不影响
  阅读，待项目所有者确认视频后再决定是否扩展，不在本阶段虚构新资产。

## Evidence reviewed

- 视频：
  `.run/evidence/phase391_commerce_identity_owner_review/phase391-commerce-final-v2/commerce-awakened-owner-review-1x.mp4`；
- 联系表：
  `.run/evidence/phase391_commerce_identity_owner_review/phase391-commerce-final-v2/contact-sheet.png`；
- 人工复核代表帧：`frame-02` 杂货身份、`frame-05` 装备商身份、`frame-06` 银行身份、
  `frame-08` 拖放数量页、`frame-09` 锻造、`frame-11` 内嵌确认。
- 视频来自真实 `Main.tscn` 与 Metal MovieWriter，为 `22.833333s / 685` 帧、H.264/AAC、
  `1280×720 / 30 FPS / 1.00×`；完整音视频解码、九章顺序和隔离档案检查通过。

## Required surfaces

- Identity：真实对话实例优先；远程无实例入口不伪造具名 NPC；切换／关闭不残留旧头像。
- Assets：只复用已批准 NPC 职业人像并经 `NpcArtCatalog` 加载，不直接载入路径，不从用户
  参考图裁片。
- Layout：商店三行身份卡、银行三行管理员条均在安全边界内；银行数量页和锻造确认页继续
  是同屏内嵌层。
- Truth：不显示 itemId、appearanceId、接口、schema、QA 文案，也不增加未实现商业功能。
- Controls：出售、关闭、配方选择、开始合成、取消和返回均由真实跨帧左键完成；银行
  拖放数量页使用正式控件合同且不提交资产写入。

`ownerReviewStatus=pending`，等待项目所有者观看本轮视频。

final result: passed

---

# Phase 390 Design QA：觉醒式商店、银行与装备合成

## Findings

- P0：无。
- P1：无。
- P2：无。最终三页均完整落在 `1280×720`，标题、关闭、列表、详情、主动作与持久
  反馈区没有越界或互相遮挡；装备合成的产物、真实材料、石币、成功率、属性和提交动作
  在一个视野内完成。
- P3：商店和银行当前复用统一觉醒底板，尚未加入各自 NPC 的小型身份头像；这不影响
  购买、出售、修理、拖放、精确实例存取、分页和币额操作，可在所有者确认主布局后再做
  不改变信息密度的视觉精修。

## Comparison target

- source visual truth：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-a9125da2-b792-4708-8bba-654258fd7cc3.jpg`
  （`2622×1206`，约 `2.174:1`）；
- implementation screenshot：
  `.run/evidence/phase390_commerce_awakened_ui/synthesis-final/frame00000059.png`
  （`1280×720`，Godot 原生视口，density `1×`）；
- full-view comparison：
  `.run/evidence/phase390_commerce_awakened_ui/design-qa/synthesis-source-vs-implementation.png`；
- focused workbench comparison：
  `.run/evidence/phase390_commerce_awakened_ui/design-qa/synthesis-workbench-source-vs-implementation.png`；
- confirmation state：
  `.run/evidence/phase390_commerce_awakened_ui/check/equipment-synthesis-confirm-1280x720.png`；
- shop implementation：
  `.run/evidence/phase390_commerce_awakened_ui/shop/frame00000089.png`；
- bank implementation：
  `.run/evidence/phase390_commerce_awakened_ui/bank/frame00000109.png`。

源图按宽等比缩放到 `1280×589`，在 `1280×720` 黑底中上下居中；实现保持原生
`1280×720`，没有把 `2.174:1` 源图拉伸成 `16:9`。比较状态均为选中第一项武器方案、
材料准备完毕、尚未提交。参考图属于另一套宝石镶嵌语义，实现按 Beastbound 的真实装备
配方合同重排，因此只比较页面层级、木牌列表、中央工作台、右侧功能导航与动作位置，
不要求复制其素材、文字或不存在的功能。

## Required fidelity surfaces

- Fonts and typography：延续项目中文展示字体和正文字体；29px 标题、20–22px 分区标题、
  12–17px 正文形成清晰层级，没有系统默认字体、乱码、过度描边或截断。
- Spacing and layout rhythm：统一 72px 顶栏；左侧挂板、中央工作台和右侧功能区形成与参考
  相同的三段式阅读顺序。商店与银行沿用同一边距和主动作高度。
- Colors and visual tokens：暗木、玄武岩黑、暖金描边、浅木主按钮、绿色充足状态和红色不足
  状态均复用现有觉醒 token；没有为三页另造一套颜色系统。
- Image quality and asset fidelity：背景、关闭、页签、正式物品图标和标题图标均为仓库真实
  PNG/纹理；没有 emoji、手绘 SVG、文字占位图或从用户参考图裁取运行素材。全部图标保持
  等比缩放且无拉伸、透明边和压缩块。
- Copy and content：只显示真实的“装备合成”和“装备强化”；不显示宝石、乐器、宠技、
  分解、宠装、珊瑚等未实现入口。商店与银行不显示 itemId、instanceId、schema、接口名、
  QA 或 agent 文案。
- Interaction and safety：主流程全程可左键操作；合成必须经过内嵌确认页，预览阶段不会
  发出提交事件，确认后只发一次；银行保留拖放与精确实例语义，商店保留双击快速交易。

## Comparison history

1. 初版实现证据
   `.run/evidence/phase390_commerce_awakened_ui/synthesis/frame00000089.png` 发现两个 P2：
   固定显示三个材料槽导致当前单材料配方出现两个无意义的“无需材料”；右侧当前页签因
   disabled 状态过暗，视觉上反而像未选中。
2. 修复
   材料槽改为按真实配方数量动态居中，仅渲染实际材料；当前“装备合成”页签改用可读的
   选中态并屏蔽鼠标，而不是 disabled 灰态。同时移除作为装饰的文本符号。
3. 复核
   最终同屏和工作台聚焦比较确认上述 P2 均已消失；真实单材料合同比照搬三个加号槽更
   清楚，且保留了参考图的“产物在上、材料在中、属性在下”层级。无新增 P0/P1/P2。

## Implementation checklist

- [x] 三个专用全屏 Panel 接入原 PanelRegistry 身份和正式入口。
- [x] 复用真实商店、银行、合成与强化合同，不增加商品、配方或经济规则。
- [x] 装备合成增加预览与内嵌二次确认。
- [x] 真实左键、提交次数、全视口边界和正式图标专项检查通过。
- [x] 真实 `Main.tscn` 商店、银行、合成截图完成并人工检查。

final result: passed

---

# Phase 389 Design QA：设置页与自动战斗默认策略

## Result

- P0：无。
- P1：无。
- P2：无。最终 `1280×720` 设置页完整覆盖世界，左侧木牌导航、人物／宠物动作卡、
  首回合／一般回合切换、生命恢复、攻击目标和恢复顺序均在主框内，没有裁切或点击穿透。
- 自动战斗仍从战斗右下角“自动”直接开始，设置页只调整策略；页面明确告诉玩家默认值
  可以直接使用，并保留随时“取消”接管的战斗合同。
- 最终工程 Design QA 通过；参考产品的角色、宠物、商标、专属像素和未实现功能没有进入
  Beastbound 运行时。

## Comparison target

- 参考视觉真相：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-5e5f160c-7118-4a00-9619-d15b19d6a8cc.jpg`；
- 最终实机：
  `.run/evidence/phase389_auto_settings_awakened_ui/implementation/final/auto-settings.png`；
- 交互内嵌页：
  `.run/evidence/phase389_auto_settings_awakened_ui/interaction/auto-settings-heal-priority-1280x720.png`；
- 参考原图为 `2622×1206`。为避免裁掉左右导航，按宽度等比缩到 `1280×589`，上下补入
  暗色留白后得到 `1280×720` 比较帧；实现像素与 CSS 视口均为 `1280×720`，密度 `1×`。
- 状态：参考为“自动战斗／普通战斗／生命恢复开启”；实现为“自动战斗／一般回合／自动
  恢复开启”。两者都是默认战斗策略状态，但产品可用功能名称不同。

## Comparison evidence

- 全视口同一比较输入：
  `.run/evidence/phase389_auto_settings_awakened_ui/comparison/reference-vs-implementation-final.jpg`；
- 右侧设置主体聚焦比较：
  `.run/evidence/phase389_auto_settings_awakened_ui/comparison/content-focus-final.jpg`；
- 聚焦比较是必要的：全视口缩放后，开／关复选框、动作选择、生命阈值和底部目标文字
  太小，不能可靠判断控件状态与裁切。

## Required fidelity surfaces

- Fonts and typography：标题、木牌页签和分区标题使用项目粗体中文显示字体；说明、等级、
  阈值和下拉项使用清晰正文体。最终没有乱码、截断、错误字形或溢出，参考的粗体层级
  被保留，但不复制其字体文件。
- Spacing and layout rhythm：保留参考的全屏木顶栏、左导航、右主框、顶部模式切换、双出战
  单位、恢复分区和底部策略区；在 PC `16:9` 中压缩纵向留白，没有隐藏持久关闭按钮。
- Colors and visual tokens：使用项目既有暗木、暖金描边、羊皮纸选中态、橙色生命阈值与
  绿色可用状态；正文对比度和选中状态清楚。
- Image quality and asset fidelity：人物、宠物大头照及攻击、宠物技能、自动战斗图标均来自
  正式项目目录，缩放后边缘清晰；没有 emoji、字符图标、手绘 SVG、截图裁片或参考产品
  资产冒充正式素材。
- Copy and content：只展示现有权威设置：首回合／一般回合人物动作、宠物技能、目标、
  自动恢复、人物／宠物血线和五级恢复顺序。不伪造百人道场、逆境迷宫、录像大厅或攻略。
- Controls and affordance：页签、模式、复选框、滑杆、下拉项、恢复顺序、完成和关闭均是
  正常 Godot 控件；真实跨帧左键检查覆盖回合切换、三页导航、关闭恢复和内嵌页开关。

## Intentional differences and P3 observations

- [P3] 参考为约 `2.17:1` 的移动横屏，项目正式目标为 PC `1280×720`；实现保留核心比例
  与信息层级，但没有把 PC 画面横向压扁成参考宽高比。
- [P3] 参考左侧还有基础、画面、消息、语音、其他和隐私设置，右侧还有录像大厅／攻略；
  当前项目没有对应完整功能，因此只呈现自动战斗、在线挂机和自动捕捉三项真实入口。
- [P3] 参考用纯图标选择动作，实现同时显示正式图标和文字下拉项，以便玩家确认真实技能
  名称；卡片式人物／宠物并排结构仍与参考一致。
- [P3] 参考顶部“自动巡逻”属于其产品入口；Beastbound 已有世界挂机按钮和战斗内一键
  自动，因此改为短提示，避免玩家误以为必须先进入设置。

## Comparison history

| 轮次 | 发现 | 修复 | 复核证据 |
| --- | --- | --- | --- |
| Iteration 1 | P2：旧默认预览没有人物形象和出战宠物，双单位卡变成空框 | 预览改用真实见习猎人与正式蓝人龙大头照；运行时仍从当前权威档案取头像 | `implementation/iteration2/auto-settings.png` |
| Iteration 2 | P2：自动恢复使用现代滑动开关，与参考明确的“开／关”游戏复选框不一致 | 改为互斥的“开／关”复选框并保持同一布尔设置合同 | `comparison/reference-vs-implementation-final.jpg` |
| Interaction pass | P2：恢复顺序弹层的“完成”按钮在首张交互帧中过窄 | 在应用木质按钮皮肤后固定 `104×42` 最小尺寸，并增加真实左键关闭断言 | `interaction/auto-settings-heal-priority-1280x720.png` |
| Final | 未发现剩余 P0、P1、P2；四项产品约束差异归为 P3 | 全屏锚点改为无告警布局，画面复核无漂移 | 全视口与主体聚焦的 final 比较输入 |

final result: passed

---

# Phase 388 Design QA：觉醒式任务目录与多任务追踪

## Result

- P0：无。
- P1：无。任务目录、选择、介绍、真实奖励预览、立即前往、权威领取和 HUD 多任务入口
  均可操作；未来主线不会误标为全部可接。
- P2：无。最终 `1280×720` 画面没有列表越界、说明裁切、奖励卡溢出、乱码、调试字段
  或输入穿透；参考图与实机图已组合为单一比较输入检查。
- 工程与视觉 Design QA 通过。本阶段复用 Beastbound 原创木石背景、按钮和真实物品／
  货币图标，不复制参考图像素或任务内容。

## Comparison target

- 用户参考图：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-29d82dfa-428d-4a97-945f-513e9e12841f.jpg`；
- 实机任务页：
  `.run/evidence/phase388_quest_awakened_ui/implementation/iteration2/quest-page.png`；
- 实机多任务 HUD：
  `.run/evidence/phase388_quest_awakened_ui/implementation/iteration2/task-tracker.png`；
- 最终同屏比较：
  `.run/evidence/phase388_quest_awakened_ui/comparison/reference-vs-implementation.png`。

## Required fidelity surfaces

- Hierarchy：全屏木质标题栏、左侧滚动任务牌、右侧任务标题／说明／目标、下半奖励预览和
  底部主操作；世界 HUD 只保留最多四条可扫读追踪项。
- States：当前、可领取、可接取、已完成和未开放状态均来自权威档案；选中态使用正式木牌
  纹理，主线／经典／经验／支线使用稳定语义色。
- Assets：标题、帮助、关闭、任务、物品和货币均使用仓库正式 PNG；界面不使用 emoji、
  手绘 SVG、参考裁片或占位框。
- Controls：任务牌选择、HUD 任务卡、帮助、关闭、立即前往、自选奖励和领取奖励均保留
  左键主流程；战斗中打开任务页时导航／领取保持只读。
- Safety：不显示 `questId`、raw status、schema、服务端字段、QA 或 agent 文案。

## Validation and performance

- `godot --headless --path client/godot --quit`：通过；
- `--auto-quest-ui-check`：通过，完整任务教学链、目录选择、四条 HUD 追踪、跨图寻路、
  奖励装备说明和日志滚动均为 `ok`；
- `--auto-quest-reward-choice-check` 与 `--auto-task-tracker-route-check`：均通过；
- `--auto-battle-label-check` 中本任务相关的 `quest=true`、`quest_readonly=true`、
  `command_after=true/true` 均通过；该复合检查仍因既有 `large_visible=false` 失败，与任务
  页面无关；
- idle `--perf-probe`：稳定 `60 FPS`，`process_total=0.10–0.16ms`，
  `hud_signature=0.02–0.03ms`；
- 真实跨帧 movement：`status=ok`、`60 FPS`，稳定 `process_total=0.17–0.27ms`。

## Product boundary

- 未伪造参考图中的“任务券快速完成”。当前仓库没有权威任务券物品、消耗经济和服务端
  完成动作；确定这些产品规则后应作为独立服务端权威功能实现。

final result: passed

---

# Phase 387 Design QA：觉醒式当前地图与原创九区世界地图

## Result

- P0：无。
- P1：无。
- P2：无。最终 `1280x720` 当前地图没有回退成程序网格，世界地图不是目录占满的假页；
  地名、入口、推荐等级、当前区域、楼层与关闭按钮均在容器内，九个区域热区没有重叠。
- 当前-run 参考图与实现图已按同一尺寸组成单一比较输入检查。实现保留大地图、左侧地点
  目录、世界／本地切换和点击寻路层级，但使用 Beastbound 原创世界图、真实地图视觉包、
  真实 `map_regions.json` 与 warp 图，不复制参考地图或图标。
- 工程 Design QA 通过；原创世界图保持 `owner_review_pending`，等待项目所有者确认主观
  美术结果。

## Comparison target

- 本地地图参考：
  `.run/evidence/phase387_map_awakened_ui/reference/02-local-map-overview.jpeg`；
- 世界地图参考：
  `.run/evidence/phase387_map_awakened_ui/reference/05-world-map-overview.jpeg`；
- 当前地图实现：
  `.run/evidence/phase387_map_awakened_ui/implementation/iteration3/local/frame00000079.png`；
- 世界地图实现：
  `.run/evidence/phase387_map_awakened_ui/implementation/iteration4/world/frame00000079.png`；
- 最终同屏比较：
  `.run/evidence/phase387_map_awakened_ui/comparison/final-reference-vs-beastbound.png`。

## Required fidelity surfaces

- Hierarchy：全屏地图、固定标题／关闭、左侧目的地、本地／世界切换、区域详情与楼层；
- Assets：当前地图使用真实 prepared visual，世界图使用原创九区无字 PNG；文字与热区由
  Godot 叠加，没有参考裁片、手写 SVG、emoji 或程序假地图；
- Density：37 个真实本地目标全部保留在目录，地图画面只显示玩家、当前目标和六个主要
  设施，避免图标墙；
- Controls：真实左键跨帧完成世界页、区域、返回本地和设施寻路，关闭和所有主要 CTA
  可点，点击不会穿透到世界移动；
- Safety：不显示 mapId、路由图、资源路径、schema、raw code、QA、agent 或生成提示词。

## Runtime evidence

- 地图专项检查与 Godot parse `2/2` 通过，日志
  `.run/godot_auto_checks/2026-08-02T08-24-27-035Z.log`；
- 当前／世界地图打开时 `60 FPS`、`process_total=0.03–0.04ms`；移动与点击压力均
  `status=ok`；
- 正常 `Main.tscn` Metal 截图来自真实 `1280x720` 客户端路径；完整参考审计见
  `.run/evidence/phase387_map_awakened_ui/reference-audit.md`。

final result: passed

---

# Phase 386 Design QA：觉醒风格战斗指令与功能收纳

## Result

- P0：无。
- P1：无。
- P2：无。人物、宠物与自动三态都保持在右下安全区内；战斗顶部世界功能和小地图已经
  隐藏，回合／倒计时居中，左侧 `功能` 默认收起并能展开四列抽屉。圆章、标签、抽屉和
  策略内嵌页没有越界、裁切或重叠；所有主指令与抽屉入口均为至少 `60×60` 的真实左键目标。
- 三张参考截图与三张 `Main.tscn` 实机帧分别按 `720px` 高等比归一化，截取同一右下
  `620×360` 区域后放进同一个比较输入。实现保留参考的右侧纵向动作、底部同基线横排、人物／
  宠物差异和自动 `宠 / 主 / 取消` 层级，同时只使用 Beastbound 原创图标和战场。

## Comparison targets

- 人物参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-3549ea99-5dbb-451f-be55-a5b3380c2961.jpg`；
- 自动参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-bed86578-3f09-468d-8484-7867213a2c30.jpg`；
- 宠物参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-b7461c27-5063-472c-870b-d4f20f83e679.jpg`；
- 人物实现：
  `.run/evidence/phase386_battle_command_ui/final_v3_aligned/player/frame00000034.png`；
- 自动实现：
  `.run/evidence/phase386_battle_command_ui/final_v3_aligned/auto/frame00000034.png`；
- 宠物实现：
  `.run/evidence/phase386_battle_command_ui/final_v3_aligned/pet/frame00000034.png`；
- 全屏同屏输入：
  `.run/evidence/phase386_battle_command_ui/design_qa_comparison_v3_aligned.png`，`2568×2176`；
- 右下聚焦输入：
  `.run/evidence/phase386_battle_command_ui/design_qa_focused_v3_aligned.png`，`1248×1096`；
- 三个聚焦单态输入：
  `.run/evidence/phase386_battle_command_ui/design_qa_focused_v3_aligned_player.png`、
  `design_qa_focused_v3_aligned_auto.png`、`design_qa_focused_v3_aligned_pet.png`，各 `1248×360`。
- 战斗 HUD 收起参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-43cc1ff4-69b5-4c17-9747-fa4c9366d672.png`；
- 战斗 HUD 展开参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-e0787fff-cd83-445f-a066-b3de1d9401c5.jpg`；
- 战斗 HUD 收起实机：
  `.run/evidence/phase386_battle_command_ui/final_v4_battle_functions/player/frame00000041.png`；
- 战斗 HUD 展开实机：
  `.run/evidence/phase386_battle_command_ui/final_v4_battle_functions/functions/frame00000041.png`；
- “鉴”字形修复后展开实机：
  `.run/evidence/phase386_battle_command_ui/glyph_fix/after_runtime/frame00000041.png`；
- 收起／展开单一比较输入：
  `.run/evidence/phase386_battle_command_ui/final_v4_battle_functions/design-qa/reference-vs-implementation-v4.png`，
  `2560×1440`。两张 `2622×1206` 参考按宽度等比缩到 `1280×589`，上下用暗色补到
  `1280×720`；实机保持原生 `1280×720`，没有非等比拉伸。

## Required fidelity surfaces

- Layout：人物三枚右侧纵向主动作加七枚底部同基线横排；宠物两枚纵向主动作加六枚底部同基线横排；
  自动态收束为右下三枚按钮，不保留旧矩形菜单或独立悬浮停止按钮。
- State：人物精确显示 10 个类别，宠物精确显示 8 个类别；自动期间点击 `主` 或 `宠`
  打开各自的首回合／一般回合内嵌设置，动作锁定时仍能点击 `取消`。
- Material：深石圆章、双层暖金描边、赭金图标、米白标签及深色描边延续当前觉醒 UI，
  危险取消态用红铜色区分但不改变按钮位置。
- Assets：16 个图标均为独立透明 PNG，不使用 emoji、字符、SVG、参考截图裁片或运行时
  占位框；生成源、提示、清单和替换路径都保存在项目资产目录。
- Input：透明画布间隙不阻断战场，只有可见按钮和内嵌页消费输入；跨帧鼠标按下／释放
  已验证，没有用同帧 helper 调用冒充真实交互。
- Battle HUD hierarchy：世界顶部两排功能与小地图在战斗中不再渲染；左侧只常驻一个
  `功能`，展开后显示 `4×3` 整齐网格。地图没有代理按钮，旧地图入口同时保持禁用。
- Drawer states：`图鉴 / 任务 / 内挂 / 设置` 使用亮金可用态并代理既有页面；当前战斗
  合同不允许的入口保留清楚但收敛的禁用态，避免用假页面换取截图相似度。
- Safety：尚无权威实现的托管位和援助技只给出不可用提示，不伪造结算；正常 UI 不显示
  raw code、内部 ID、策略字段、QA 或 agent 文案。

## Comparison history

| 轮次 | 发现 | 修复 | 复核证据 |
| --- | --- | --- | --- |
| 初始接线 | P1：旧战斗指令是右上矩形按钮，自动停止另有悬浮入口，人物／宠物状态缺少参考的右侧与底部双层级 | 建立独立 Presenter／View／Skin，复用原有权威按钮并切换三种精确布局 | 三张 `final_v2` 实机图 |
| Pass 1 | P2：首版实机标签相较参考偏小、偏轻，在复杂战场上辨识度不足 | 主圆章标签改为 `17px`，增加 3px 深色描边和阴影；内嵌菜单保持 `15px` | `design_qa_comparison_v2.png` |
| Pass 2 | 未发现剩余 P0、P1、P2；原创图标、触控尺寸、间距、自动策略和取消入口均清晰 | 无进一步改动 | 三张聚焦单态比较输入、定向真实输入检查 `status=ok` |
| Pass 3 所有者反馈 | P1：底部按钮使用大幅高低起伏的圆弧，视觉凌乱，偏离所有者所指的觉醒式整齐排列 | 人物 7 项、宠物 6 项、自动 3 项全部统一为 `y=228` 横排基线；右侧纵列保持不变，并加入 Presenter 自检 | 四张 `final_v3_aligned` 实机图 |
| Pass 4 | 未发现剩余 P0、P1、P2；全屏和右下聚焦比较都显示标签基线、图标中心及横向节奏整齐 | 无进一步改动 | `design_qa_comparison_v3_aligned.png`、`design_qa_focused_v3_aligned.png` |
| Pass 5 所有者反馈 | P1：战斗仍显示世界小地图和顶部两排功能，信息层级混乱，地图甚至还能在战斗入口中出现 | 战斗隐藏整个世界顶部面；回合／倒计时改为顶部居中；新增左侧 `功能` 与四列抽屉；地图不创建代理且旧入口禁用 | `final_v4_battle_functions/player`、`functions` 两张实机图 |
| Pass 6 | P2：首张展开实机里禁用入口的文字过暗，虽然状态正确但扫描成本偏高 | 提高禁用图标和标题不透明度，保留无金圈的禁用层级；复核无碰撞、截断或假可用态 | `reference-vs-implementation-v4.png`、真实点击检查 `status=ok` |
| Pass 7 所有者反馈 | P1：功能抽屉“图鉴”的“鉴”显示成缺字方框 | Godot 在 macOS 选中的 `PingFang SC` 不含简体“鉴”，且不会按字形继续尝试第二字体；正文中文字体改为完整简体字库优先，并加入实际标签字形断言 | `glyph_fix/after_runtime/frame00000041.png`、定向自动检查 2/2 通过 |

## Intentional P3 differences

- [P3] 只复用参考的战斗 HUD 层级和交互意图；战场、角色、宠物、按钮美术和消息区继续
  使用 Beastbound 原创实现，不扩大为整张参考截图的一对一复制。
- [P3] 参考抽屉中的世界功能大多可点；Beastbound 当前战斗安全合同只开放图鉴、任务、
  内挂与设置，其余入口显示明确禁用态，地图完全排除，避免绕过既有战斗锁定规则。
- [P3] 自动态增加一行 `主：…  宠：…` 的当前策略摘要，减少玩家误开自动的风险；它不
  暴露内部字段，并且不改变参考三按钮的主层级。
- [P3] `援助` 和 `托管` 先保留成熟界面的可发现入口，但在服务端规则落地前不消耗回合，
  只显示通用不可用提示。

final result: passed

---

# Phase 385 Design QA：觉醒风格家族页

## Result

- P0：无。
- P1：无。
- P2：无。最终 `1280×720` 的家族大厅、创建家族内嵌页、已加入信息页和庄园页均
  完整落在画布内；关闭、刷新、创建、加入、退出、四个页签、宣战、参战、入场和
  道具场入口保持正常 Godot 控件与左键路径。
- 参考与实现已按同一 `1280×720` 比较画布归一化并放入同一张比较输入。实现保留
  《石器时代：觉醒》家族页的左侧家徽资料、中央公告／成员舞台、右侧竖页签，以及
  未加入状态的家族列表和浅色创建页，同时只使用 Beastbound 原创资产和真实家族／
  庄园字段。

## Comparison target

- 未加入／创建参考：`.run/reference/phase385_family_awakened/family-01.jpg`；
- 已加入／信息参考：`.run/reference/phase385_family_awakened/family-02.jpg`；
- 创建页实机：`.run/screenshots/phase385_family_awakened/family-create-1280x720.png`；
- 信息页实机：`.run/screenshots/phase385_family_awakened/family-info-1280x720.png`；
- 庄园页实机：`.run/screenshots/phase385_family_awakened/family-manors-1280x720.png`；
- 视口：实现 `1280×720 CSS px / 1×`；参考原图均为 `600×270`。参考按等比适配
  到 `1280×576`，再以暗色上下留白补到 `1280×720`；实现保持原生 `1280×720`，
  未做非等比拉伸。

## Comparison evidence

- 创建状态全视口：
  `.run/screenshots/phase385_family_awakened/reference-vs-family-create.png`；
- 已加入信息状态全视口：
  `.run/screenshots/phase385_family_awakened/reference-vs-family-info.png`；
- 源图仅有 `600×270`，放大后的按钮、文字和人物细节已接近源信息上限；两张全视口
  同屏在原始尺寸下仍能辨认主要文字、页签、边界和图标，因此未制作会制造虚假精度的
  局部放大比较。

## Required fidelity surfaces

- Fonts and typography：标题使用项目觉醒界面的中文展示字体，正文使用中文系统字体；
  家族名、公告、角色、在线状态和庄园战状态形成明确字重层级，长公告允许换行，按钮
  文案不再被压缩或截断。
- Spacing and layout rhythm：左栏、主内容框、右侧竖页签与参考层级一致；卡片间距、暖金
  边框和底部主按钮在 `1280×720` 下不碰撞。源图 `20:9` 与项目正式 `16:9` 的比例差异
  通过增加纵向留白吸收，没有把参考图横向压扁。
- Colors and tokens：暗木、黑褐内嵌面、暖金高亮、绿色在线／占领状态和浅色创建页均来自
  现有觉醒界面色彩语义；禁用态、选中页签和遮罩层对比清楚。
- Image quality and asset fidelity：底板、家族图腾、按钮、页签和关闭图标均为项目已有原创
  位图；没有复制参考截图、使用 emoji、文本图标、手绘 SVG 或代码形状冒充家徽与装饰。
- Copy and content：只展示服务端已有的族长、成员、声望、公告、庄园归属、休战与庄园战
  数据；不展示尚未实现的捐献、科技、工资或福利数值，也不暴露内部 `familyId`、接口名、
  QA 文案或 raw code。
- States and interactions：未加入、创建弹层、已加入信息、成员、活动、庄园和从庄园管事
  直达指定庄园均已覆盖。自动检查以跨帧鼠标移动、按下、释放验证创建页、加入、页签和
  道具场事件；原有庄园管事入口回归通过。
- Accessibility and viewport：主要按钮高度为 `36–48px`，焦点／选中／禁用状态可辨；
  本阶段产品目标是 PC `1280×720`，没有把移动端、竖屏或触屏布局冒充已完成。

## Intentional differences and P3 observations

- [P3] 参考已加入页含“福利”页签和捐献／科技入口；当前服务端没有这些权威合同，因此
  实现只保留 `信息 / 成员 / 活动 / 庄园`，避免用假数值补齐外观。
- [P3] 参考中央舞台展示玩家实时人物模型；当前家族成员 payload 没有公开外观标识，
  实现以同一原创家族图腾和真实姓名牌表达族长／族员，避免猜测或错配玩家形象。
- [P3] 参考顶部重复展示多种货币；实现保留家族同步状态和刷新入口，不在家族域中复制
  与家族操作无关的全局货币栏。

## Comparison history

| 轮次 | 发现 | 修复 | 复核证据 |
| --- | --- | --- | --- |
| Pass 1 | P1：从庄园管事打开时，无家族访客被强制带回大厅，无法看到指定庄园 | 新增只读访客庄园态；保留创建入口并直接聚焦庄园 | `--auto-manor-map-shop-check`：`tab=manors`、`first_steward_layout=true` |
| Pass 1 | P2：庄园操作按钮的皮肤覆盖了最小宽度，导致“宣战／参战／入场／道具场”文字压缩 | 先应用皮肤再设置 `78×36` 交互尺寸，并隐藏己方庄园无意义的禁用宣战按钮 | `family-manors-1280x720.png` |
| Pass 1 | P2：左栏曾显示内部字符串形式的家族编号 | 改为玩家语义副标题“并肩冒险 · 共守庄园” | `family-info-1280x720.png` |
| Final | 未发现剩余 P0、P1、P2；三项差异均由真实数据合同或项目画幅约束产生 | 无进一步改动 | 两张最终参考／实现同屏与三张独立实机帧 |

final result: passed

---

# Phase 384 Design QA：觉醒风格宠物图鉴与获取途径

## Result

- P0：无。
- P1：无。
- P2：无。最终 `1280×720` 的三栏图鉴、同族形态带、成长／属性页签和获取途径弹层
  没有越界、裁切、文字碰撞、外部截图裁片、假图标或程序员字段。
- 两张参考图分别与同状态实机帧归一化后放在同一个比较输入中检查。实现保留种族栏、
  宠物主舞台、右侧资料与中央内嵌获取页的核心层级，同时使用 Beastbound 原创底板、
  项目宠物美术和权威运行时数据。
- 工程 Design QA 已通过；底板的主观美术接受仍保持 `owner_review_pending`，等待项目
  所有者查看最终实机图。

## Comparison target

- 正常参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-be26f056-fcc1-4415-b2ee-2d5edf314ace.png`；
- 获取页参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-bb5a1c7e-4b8b-4f4c-a504-fa11ec0215a3.png`；
- 正常实机：
  `.run/evidence/phase384_pet_codex_awakened_ui/preview-final/pet-codex00000044.png`；
- 获取页实机：
  `.run/evidence/phase384_pet_codex_awakened_ui/acquisition-final/pet-codex-acquisition00000049.png`；
- 视口：实机 `1280×720`；参考原图 `2622×1206`，居中裁切为 `2144×1206` 后归一化到
  `1280×720`。

## Comparison evidence

- 全视口正常态：
  `.run/evidence/phase384_pet_codex_awakened_ui/design-qa/normal-reference-vs-implementation.png`；
- 全视口获取态：
  `.run/evidence/phase384_pet_codex_awakened_ui/design-qa/acquisition-reference-vs-implementation.png`。

## Required fidelity surfaces

- Typography：标题、页签、四维区间和路线主次层级清楚；“获取途径”标题不再与关闭按钮
  碰撞，中文文字没有截断或错误字形。
- Layout：左侧种族栏约占四分之一，中部保留最大宠物视觉，右侧资料约占四分之一；底部
  形态带和右下主按钮位置延续参考，获取页嵌在图鉴内部且不遮掉右侧资料。
- Material：原创暗木、暖金雕边、羊皮纸按钮与叶片边角延续近期 Beastbound 玩家界面；
  没有把参考 UI 贴图直接作为运行时背景。
- Imagery and icons：宠物主图、种族头像、技能和捕捉网均来自项目正式目录；未遇见形态
  不显示身份或画像，也不用 emoji、字符锁、手画 SVG 或截图裁片冒充图标。
- Copy and truth：成长页只显示公开 Lv1 四维；属性页显示真实形态资料；获取页由权威地图
  遭遇表生成地图、区域、等级和遭遇池占比，没有虚构付费、成就或活动来源。
- Controls：种族、形态、成长、属性、获取途径、滚动与关闭都是正常 Godot 控件；获取按钮
  已由跨帧真实左键事件打开，过程中世界移动和寻路计数保持不变。
- Viewport：本阶段正式目标为 PC `1280×720`；没有把移动端、竖屏或触屏布局冒充已完成。

## Intentional differences and P3 observations

- [P3] 参考图使用较宽的右侧成长表，实机改为四张公开 Lv1 四维卡，目的是匹配 Beastbound
  “可见 4V、隐藏成长靠训练判断”的既定玩法合同，不公开参考产品式转生前后区间。
- [P3] 参考弹层只给出单一“捉宠”入口，实机展示可滚动的真实地图路线和遭遇占比；信息
  更密，但在 1280×720 下标题、路线和关闭入口均保持清晰。
- [P3] 未遇见形态使用“未遇见”文字而不是参考图锁图标，避免凭未解锁轮廓泄露身份；
  已遇见形态仍有金色选中框和独立画像。

## Comparison history

| 轮次 | 发现 | 修复 | 复核证据 |
| --- | --- | --- | --- |
| 初始接线 | P1：仓库中已有觉醒图鉴草稿，但没有接入主界面；运行时仍显示旧通用两栏图鉴 | 新增 Presenter，接入三栏正式 Panel，并沿用宿主信号与档案入口 | 最终主界面同屏 |
| Pass 1 | P1：新底板尚未导入；`Button.icon_max_width` 在 Godot 4.7 无效；全屏容器仍沿用旧宽高 | 导入 1280×720 原创底板，改用主题常量，图鉴改为全视口 | 5/5 Godot 回归 |
| Pass 2 | P2：弹层标题包含宠物名时与关闭按钮拥挤；获取预览直接开页不能证明真实点击 | 标题固定为“获取途径”，预览与自动检查改为跨帧鼠标移动／按下／释放 | 最终获取页同屏、自动检查 `acquisition_open=true` |
| Final | 未发现剩余 P0、P1、P2；保留三项有玩法依据的 P3 差异 | 无进一步改动 | 两张最终参考／实机比较输入 |

final result: passed

---

# Phase 381 Design QA：世界“角色”入口与角色管理三页

## Result

- P0：无。
- P1：无。
- P2：无。最终 `1280×720` 角色页完整覆盖世界并阻断点击穿透，标题、关闭键、九个
  装备槽、人物全身图、两张宠物大头照、右侧页签、加点行和骑证卡片均未越界。
- 四张参考截图与四个同状态实机帧均按等比适配后分别放入同一个比较输入中检查。实现
  保留参考的全屏木石框架、人物主视觉、右侧纵向分页、属性条、先草稿后确认的加点节奏
  以及“全部／种族”骑证筛选，同时只使用 Beastbound 原创或项目内正式资产。
- 工程 Design QA 已通过；项目所有者的主观画面验收仍以本阶段最终 `1×` 视频为准。

## Comparison targets

- 属性页：
  `.run/evidence/phase381_player_character_owner_review/phase381-20260801T100106.122089Z-8fd4568f/design-qa/attributes_reference_vs_implementation.jpg`；
- 加点页：
  `.run/evidence/phase381_player_character_owner_review/phase381-20260801T100106.122089Z-8fd4568f/design-qa/stat_points_reference_vs_implementation.jpg`；
- 骑证全部：
  `.run/evidence/phase381_player_character_owner_review/phase381-20260801T100106.122089Z-8fd4568f/design-qa/ride_all_reference_vs_implementation.jpg`；
- 骑证种族：
  `.run/evidence/phase381_player_character_owner_review/phase381-20260801T100106.122089Z-8fd4568f/design-qa/ride_species_reference_vs_implementation.jpg`；
- 四状态总览：
  `.run/evidence/phase381_player_character_owner_review/phase381-20260801T100106.122089Z-8fd4568f/design-qa/all_states_reference_vs_implementation.jpg`。

## Required fidelity surfaces

- Layout：世界右下“角色”真实入口，全屏角色页，左装备／中人物／右资料，以及右侧
  `属性 / 加点 / 骑证` 三页结构与参考一致；关闭后恢复世界和右下操作栏。
- Truth：属性页展示项目真实九装备槽，不为匹配参考的六槽外观删槽；骑证页严格只展示
  当前三种真实可骑形态，不用虚构九卡填满版面。
- Controls：四维 `+ / -`、清空本次、一次确认、全部／种族／真实族系筛选都由左键
  工作；加点请求进行中即使关闭再打开也保持禁用，避免旧响应清掉新草稿。
- Assets：加减、锁定和拥有状态使用项目原创透明位图，不再用文字符号或 emoji 冒充
  图标；人物、宠物大头照、装备图标与木质皮肤均来自项目批准目录。
- Safety：不显示虚构称号、家族、气力、怒气、战力、固定百分比或免费洗点；不显示
  raw code、资源路径、schema、接口名、QA 和 agent 文案。

## Runtime and video evidence

- 最终视频：
  `.run/evidence/phase381_player_character_owner_review/phase381-20260801T100106.122089Z-8fd4568f/player-character-owner-review-1x.mp4`；
- 联系表：
  `.run/evidence/phase381_player_character_owner_review/phase381-20260801T100106.122089Z-8fd4568f/contact-sheet.png`；
- 验证摘要：
  `.run/evidence/phase381_player_character_owner_review/phase381-20260801T100106.122089Z-8fd4568f/summary.json`；
- 视频来自真实 `Main.tscn`，为 `33.933333s / 1018` 帧、H.264/AAC、
  `1280×720 / 30 FPS / 1.00×`，完整音视频解码通过；连续展示世界入口、属性、九装备槽、
  加点草稿、减点撤回、清空本次、原子确认、三种真实骑宠、缺证锁定、种族展开、老虎系
  筛选和关闭返回世界。
- 录制使用全新隔离 user-data，未启动后端、未连接 MySQL、未写正常玩家存档。

final result: passed

---

# Phase 379 Design QA：一步到位的人物创建配置与元素配点

## Result

- P0：无。
- P1：无。
- P2：无。最终 `1280×720` 页面没有人物、头像、配点格、名字输入或创建按钮
  越界；四个形象、十点配完、非法状态拦截、随机名、键盘改名和创建回槽均可由真实
  左键／键盘连续完成。
- 参考图与实现图已归一化后放在同一个比较输入中检查。实现保留参考的左侧圆形人物
  列表、中部完整人物和右侧元素木框结构，同时使用 Beastbound 原创背景、人物与 UI
  资产，不复制参考角色、像素或商标。
- 工程 Design QA 已通过；四套人物正式美术仍保持 `owner_review_pending`，等待项目
  所有者观看本阶段最终 `1×` 视频后确认主观视觉结果。

## Comparison target

- 参考图：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-201f4819-096e-4738-80e0-036f6c76109a.jpg`；
- 同状态实现图：`.run/character_creation/character_creation_final00000009.png`；
- 同屏比较：`.run/character_creation/design_qa/reference-vs-implementation.png`；
- 比较状态均为曜石斥候、水元素 10 点、剩余 0 点、名字已填写；实现视口为
  `1280×720`。

## Required fidelity surfaces

- Layout：左上返回、左侧四个独立圆形头像、中部全身展示、右侧四行减号／十格／加号、
  下部名字与创建按钮，视觉层级与参考一致。
- Material：森林海岸背景、半透明深木面板、暖金描边与木质按钮延续当前宠物／背包界面
  的统一材质语言。
- Assets：四个头像和四张全身展示图均为独立正式图片，不从全身像裁头，不使用文字、
  emoji、手绘 SVG、占位框或参考图裁片。
- Controls：四形象切换、元素加减、冲突禁配、剩余点提示、随机名字、真实键盘输入、返回
  与创建均为可操作控件；右键不是必需输入。
- Safety：玩家界面不显示 `appearanceId`、`playerId`、slot index、schema、raw code、
  后端状态、QA 或 agent 文案。

## Runtime and video evidence

- 最终视频：
  `.run/evidence/phase379_character_creation_owner_review/phase379-character-creation-main-final-v5/character-entry-owner-review-1x.mp4`；
- 联系表：
  `.run/evidence/phase379_character_creation_owner_review/phase379-character-creation-main-final-v5/contact-sheet.png`；
- 验证摘要：
  `.run/evidence/phase379_character_creation_owner_review/phase379-character-creation-main-final-v5/summary.json`；
- 真实 `Main.tscn` 依次展示四空槽、打开创建页、四人物切换、剩余 1 点禁止创建、
  地 6 水 4 合法完成、随机名、键盘改名、捕获一次性创建 payload 和权威返回后的新角色
  槽，共 12 个连续章节；
- 视频为 `19.466667s / 584` 帧、H.264/AAC、`1280×720 / 30 FPS / 1.00×`，
  完整音视频解码通过；录制使用全新隔离 user-data，未连接后端且未写玩家存档。

final result: passed

---

# Phase 380 Design QA：随机名按钮边界、名字安全与地属性绿色

## Result

- P0：无。
- P1：无。
- P2：无。最终 `1280×720` 创建页中，“换一个”按钮完整位于右侧配置板内，与姓名
  输入框保持间距且不重叠；地属性文字和六个已点亮格均为绿色。
- 用户问题截图与同状态实机帧已统一为 `1280×720` 后放在同一个比较输入中检查；对比
  状态均为焰芽斗士、地 6／水 3、剩余 1 点、名字为空。
- 玩家可连续左键随机换名；混淆敏感名只显示通用提示并禁用创建，安全随机名可恢复。

## Comparison target

- 用户问题截图：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-16d1ba64-be73-4d8d-adcf-86a79f5741b0.png`；
- 同状态实现图：
  `.run/evidence/phase380_character_name_safety_owner_review/phase380-character-name-safety-final-v1/design-qa/frame-08.png`；
- 同屏比较：
  `.run/evidence/phase380_character_name_safety_owner_review/phase380-character-name-safety-final-v1/design-qa/reference-vs-implementation.png`。

## Required fidelity surfaces

- Boundary：通用次级按钮原有 `150px` 最小宽度不再撑破当前名字行；此处独立使用
  `94×50`，右侧保留 42px 配置板内边距。
- Alignment：姓名输入为 `262×50`，与随机按钮间隔 10px，文字基线、按钮高度和输入框
  高度一致。
- Color：地属性语义统一为绿色；水、火、风继续使用蓝、红、黄，不修改元素数值规则。
- Feedback：受限名字显示“这个名字不能使用，请换一个。”；界面不显示命中词、分类、
  raw code、服务端字段或 QA 文案。

## Runtime and video evidence

- 最终视频：
  `.run/evidence/phase380_character_name_safety_owner_review/phase380-character-name-safety-final-v1/character-name-safety-owner-review-1x.mp4`；
- 联系表：
  `.run/evidence/phase380_character_name_safety_owner_review/phase380-character-name-safety-final-v1/contact-sheet.png`；
- 视频来自真实 `Main.tscn`，为 `22.900s`、`687` 帧、H.264/AAC、
  `1280×720 / 30 FPS / 1.00×`，完整音视频解码通过；
- 连续流程覆盖配置板边界、绿色地元素、三次不同安全随机名、混淆名 `Ｇ · M` 拦截、
  随机名恢复、键盘输入“林岚”和一次性创建 payload；录制使用隔离 user-data，未连接
  后端且未写玩家存档。

final result: passed

---

# Phase 395 Design QA：正式世界 HUD 与右侧五席组队页

## Findings

- 结论：`P0=0 / P1=0 / P2=0`。
- P0：无。
- P1：无。组队页只消费 Phase 394 的权威匹配／party state；真人、NPC 陪练与空位分离，
  不制造账号、在线人口、奖励资格或额外服务端 mutation，协议版本不变。
- P2：无。参考图要求的右侧“任务／组队”双页签、五张纵向卡、匹配后回世界和完整底部
  功能栏均进入真实 `Main.tscn`；战斗时世界 HUD 隐藏、退战后恢复；旧灰色 roster／status
  永久隐藏，正常画面无 QA、接口、account ID 或工程计数器。

## Comparison target and result

- 比较目标为项目所有者提供的世界场景右侧五席组队参考图：正式页签与纵向队员卡应处于世界
  HUD 内，底部邮箱、背包和功能入口必须保留；不是把匹配页或程序面板盖在世界上。
- Beastbound 保留原创深棕／铜金视觉和自有图标，只借鉴信息架构。真人只显示权威名字、等级、
  头像和存在的元素；参考侧栏本身不展示 HP，因此本阶段不额外增加血条；缺失的转生、
  NPC 元素与在线数均不伪造。
- 参考／实机同屏图：
  `.run/evidence/phase395_hang_matchmaking_world_hud_owner_review/phase395-final-owner-review-v5-20260808/reference-vs-implementation.png`，
  SHA-256 `c3c8c2516d8bb4518000d9e10caaec32c4739f026c44ac31c7cc8a0f4212ae78`。

## Required fidelity surfaces

- Layout：右侧固定“任务／组队”双页签；组队页五席纵排；完整底部功能栏持续贴底且不被旧
  状态块覆盖。
- Hierarchy：真人、明确标注的 NPC 陪练、等待空位和“下一场替换陪练”形成真实层级；NPC
  不能靠真人头像或虚假转生／元素伪装。
- Flow：选路线与匹配前置页结束后自动回世界并选中组队；任务／组队可左键切换；取消匹配
  继续挂机，正式停止后才结束挂机并回世界。
- Continuity：普通 party update、matching、npc_filled、replacement、full、cancelled 和 stop
  均刷新同一个正式 roster 实例；底栏、邮箱、背包与收起入口不丢失。
- Battle boundary：进入战斗统一隐藏世界顶栏、左侧入口、右栏和底栏，退出战斗恢复同一个
  世界 HUD 与队伍投影，不允许战斗继续显示地图功能。
- Cleanup：旧 `party_roster_panel` 与 `HangMatchmakingWorldStatus` 在所有刷新路径保持隐藏，
  不允许事件回调重新显示。
- Truth：空闲空队不伪造真人；active/full 的空控制器快照均压过过期普通队伍；匹配过滤离线
  真人并按账号判本地身份；待同步真人与无权威头像成员保持中性。全屏路线／开始页使用同一
  生产真值，不另造“真人队友”或 `Lv0`。这些是录前与同步阶段的 check-only 硬门，不是
  十章成片中的玩家可见章节或 QA 叠层。

## Engineering and media evidence

- Godot 解析、world HUD presenter／view、五席 roster、挂机面板 focused checks 全部通过；
  最新 `.run/godot_auto_checks/2026-08-07T21-53-46-564Z.log` 的
  `--auto-hang-matchmaking-check` 为 `2/2 PASS`，其中 `battle_hud=true`。
- `auth-hang-matchmaking.test.js` 为 `13/13 PASS`；本阶段不改服务端或协议。
- world HUD 资源严格审计为 `source=33 / runtime=33 / manifest=66`；审计单测 `4/4 PASS`，
  审计与录像工具 Python 定向单测合计 `10/10 PASS`。
- 代码审查最终为 `P0=0 / P1=0 / P2=0`。最终真实 `Main.tscn` 视频为
  `20.933333s / 628` 帧、
  `1280×720 / 30 FPS / 1.00×`，H.264 `yuv420p`／AAC 48kHz 双声道且全片解码；十章
  共 9 次跨帧左键。MP4 SHA-256：
  `7b77751c01e4bb7a8813201c16d55914bd49ef219f9635b53088c7933a5aac06`；联系表 SHA-256：
  `c886aad59d0acdd4c6bbc1c59c02b403a5e4f159752726d9e917cde9829bbdf1`。
- `godot-recording.log` 的 `WARNING`、`ERROR` 与 `leak` 均为零，SHA-256
  `57b1b2e92543da2e5aaa93bd09d9f33531e9bf8bb6d7e6b5fb70401221c1b1ae`；`SHA256SUMS`
  SHA-256 为 `644cda7741200e438489d6fc72c52ed99280f19df8a907ab911469aa2596b9e2`。清单不含后写
  `summary.json`，摘要另以 SHA-256
  `d40ae0560e13e30d43a32df8aa9960a7dc352860077767fe3994eee019422aa9` 单列。
- `serverWrites=0` 只是摘要的捕获合同声明：工具未启后端、未访问 MySQL、禁用正常档案保存，
  结束态无 HTTP 连接；它不是 HTTP 请求或服务端写入计数器，不能作为真实服务端零写入证明。
- detached source attestation：
  `.run/evidence/phase395_hang_matchmaking_world_hud_owner_review/phase395-final-owner-review-v5-20260808/source-attestation.json`，
  SHA-256 `cedd453c335c14aab13c7a6ce064df424ca116cfc5388ebc66035974af62bd5d`。
  它锁定 `93` 条录制关键路径（21 个脚本／工具及 72 个非 `.import`／`.uid` 资源包文件）；
  `93/93` mtime 均早于录制边界，资源树 SHA-256
  `bd6c913e7065ac1baf024660c169cf07a5633c4dedf555e44790e0c113fb4a21`，scoped diff SHA-256
  `65b625be47bc5e2acbb647bfd64e51167ec37c82b2970259f99b146ec915b717`，状态为
  `passed_with_explicit_post_run_boundary`。
- 外层清单：
  `.run/evidence/phase395_hang_matchmaking_world_hud_owner_review/phase395-final-owner-review-v5-20260808/OUTER-SHA256SUMS`，
  `33/33 PASS`，SHA-256
  `dc3fb9efe6d242e95c47b2c1229a0d2f469c49339eed44af686e48ab07a3a1bc`；它补充覆盖后写摘要、
  参考同屏和 detached attestation。
- 独立 idle 在正常 30 FPS 世界空闲路径稳定 `29.8..30.0 FPS`，后 10 秒
  `process_total` 平均 `0.355ms`（`0.22..0.43ms`）、CPU 平均 `1.71%`；真实跨帧移动
  `status=ok / path_len=11`，稳定约 60 FPS，`process_total` 平均 `0.711ms`
  （`0.49..1.27ms`）、CPU 平均 `5.64%`。
- 连续点击为 `accepted=35 / resolved=11 / applied=11 / screen_matches=35 / mismatches=0`，
  输入平均／最大 `1/3us`，移动、合并、停稳、最终目标均为真；三个性能进程无
  ERROR／SCRIPT ERROR／WARNING 或进程残留。MovieWriter 不冒充稳态性能证明。

## P3 observations

- [P3] 最终录像是隔离、确定性的真实 Main／PFC 流程，注入 controller 且只记录结束态无
  HTTP 连接；不冒充真实多客户端真人匹配。真实 MySQL fault injection 未在本阶段做。
- [P3] detached source attestation 是录后 SHA／mtime 绑定，不是录制进程内工件，也没有密码学
  可信时间戳；内层 `SHA256SUMS` 不含后写 `summary.json`，外层清单已补充覆盖，两种边界保持
  分开陈述。
- [P3] 非阻断代码债：正式 HUD mount 中途失败时局部回滚仍可更完整；roster 刷新仍依赖
  legacy node 存在；同图热替换 render-state 时 minimap 不会立即重配。
- [P3] 项目所有者尚未观看纠正版，`ownerReviewStatus=pending`；不能冒充视觉批准或 broad
  P2.2 完成。

## Comparison history

| 轮次 | 发现 | 修复 | 复核证据 |
| --- | --- | --- | --- |
| 用户反馈 | P2：旧录屏用灰色程序 roster，匹配后未展示正式世界 HUD，底部右侧既有功能栏看似丢失 | 将组队作为正式世界 HUD 内嵌页签，匹配后回世界；旧 roster／status 永久隐藏 | 真实 Main 十章视频、五席和完整底栏断言 |
| Truth pass | P2：空闲／active／full 空快照、离线成员、同名异账号和待同步资料可能被旧缓存或 UI fallback 伪装成真人 | 空闲不补人；active/full 控制器快照优先；匹配过滤离线真人并按账号判身份；缺资料与头像保持中性，全屏页复用生产真值 | 四组 truth gates 与 fullscreen production truth 的录前／同步 check-only 硬门全过，不作为视频章节 |
| Flow pass | P2：取消匹配与停止挂机若共用旧状态按钮会继续暴露工程 UI | 右栏正式取消只结束匹配；底栏进入正式挂机页后再停止 | 9 次跨帧左键、auto `2/2` |
| Battle pass | P2：世界地图 HUD 曾可能留在战斗中 | 进入战斗隐藏世界 HUD，退出后恢复同一实例与状态 | auto `battle_hud=true` |
| Evidence binding | P2：原始内层清单未覆盖后写摘要、参考同屏，也未绑定录制关键源码 | 增加 detached 93 路径 source attestation 与 33 项外层清单，保留录后／无可信时间戳边界 | source tree、scoped diff、attestation 与 outer manifest SHA 固定，外层 `33/33 PASS` |
| Final | 未发现剩余 P0、P1、P2；保留真实联机／MySQL、录后 attestation 边界与三项非阻断工程债 | 无进一步产品改动 | Godot、Node、资源、Python、录制、性能和媒体门禁通过 |

`ownerReviewStatus=pending`；本结论只代表工程与媒体 Design QA 通过，等待项目所有者观看纠正版。

final result: passed

---

# Phase 396 Design QA：多跳世界导航与正式 HUD 韧性

## Findings

- 本窄范围修复后未发现剩余 P0／P1／P2；多跳路线、失败回滚、取消真值与正式 HUD 生命周期均
  有独立门禁，不把内部图结构、revision、旧 panel 或 QA 文案暴露给玩家。
- 全局玩家流程仍有一项明确的视觉发布阻断：战斗画面继续使用灰色默认地面和圆形宠物占位。
  Phase 396 没有伪装成已经修复；候选战场和宠物素材在 owner approval／release
  attestation 前不能进入普通运行。新鲜真实 Main 审片帧：
  `.run/evidence/phase396_player_flow_audit/phase396-audit-battle-20260808/03-battle-preview-1280x720.png`。

## Required experience surfaces

- Flow：任务栏或挂机页选中跨越多张地图的目标后，沿真实 warp 最短路逐图继续；不可达与中断
  会清空 pending 并回到可选择页面，不留下假的“前往中”。
- Truth：只有权威 active／full 匹配可显示 matching；取消／idle 即使携带旧本地 viewMode 也回到
  browse，同时保留“挂机继续”和正式停止入口。
- Continuity：同图 render state 更新会立即重配 minimap；party update 在旧 roster 为 `null` 时
  仍刷新正式五席，离线真人显示文字状态，进战时正式／旧 roster 都隐藏。
- Recovery：正式 HUD mount 失败恢复 `29` 个真实控件的父级、顺序、几何、内容、交互状态、
  metadata 与主题覆盖；回滚失败时不释放仍持有真实控件的候选 view。
- Cleanup：正常画面不显示 BFS 路径、map revision、测试账号、错误栈或 legacy 工程 UI。

## Evidence

- planner standalone：`37` 张正式地图、`71` 条有向边、构图加载 `37` 次，正式二／四／五跳、
  合成最短路和损坏图 fail-closed 均通过。
- 最终串行 Godot auto `4/4` 回执
  `.run/godot_auto_checks/2026-08-08T05-36-33-386Z.log` 中，`--auto-task-tracker-route-check`
  为 `status=ok`，多跳合同、cache、首跳、
  五次真实 warp 到达、每跳 pending／continuation、最终练级区移动、不可达清理和中断清理均
  为 `true`；挂机加载失败清理与普通任务加载失败文案也都为 `true`。
- 同一最终串行回执中的 `--auto-hang-matchmaking-check` 为 `status=ok`，其中
  `formal_without_legacy=true`、`minimap_hot_replace=true`。
- focused checks 覆盖取消后的 stale matching、正式五席离线标记与 mount rollback `29` 控件；
  mount 最终回执为 `PASS / rollbackRestored=true / rollbackRestoredCount=29`，Godot 全项目解析与
  scoped diff-check 通过；不把未执行的真实多客户端 `--auto-party-live-check` 冒充 passed。
- 最终性能包 `.run/evidence/phase396_final_perf-tYiwl0/`：固定 60 FPS idle `process_total`
  平均 `0.042ms`；真实跨帧移动平均 `0.147ms`、`hud_apply` 平均 `0.108ms` 且
  `status=ok / path_len=11`；连续点击 `36` 次有效输入，`accepted=36 / applied=11 /`
  `screen mismatch=0`，停稳和最终格精确命中均为真。真实 Metal `1280x720` idle 首组 `27.4`
  后稳定设计上限 `30 FPS`，`process_total` 平均 `0.355ms`，稳态 OS CPU 平均 `3.83%`。四轮
  `exit 0`、无 `ERROR`／`WARNING`／解析错误／leak，且无本 worktree 相关进程残留；截断的
  `source-after.sha256` 不作为全树 hash 证据。
- 未运行完整 local CI；本结论限定于本阶段定向门禁。

## Comparison history

| 轮次 | 发现 | 修复 | 复核证据 |
| --- | --- | --- | --- |
| Route pass | P1：任务／挂机只能找当前图或直达 warp，深层洞窟目标会误报不可达 | 独立缓存有向图与 BFS，continuation 每图继续 | 37 图／71 边、二／四／五跳；实际完成五次 warp 并移动到终点练级区 |
| Recovery pass | P1：传送失败或路线中断会遗留 pending，页面已关但目标永远不到 | 写 pending 前预检；失败统一清空并重开正式挂机页 | unreachable／interrupted cleanup 均为真 |
| Truth pass | P2：取消回包可携带旧 matching view，使玩家误以为仍在排队 | 只有 active／full 可拥有 matching，idle 归一 browse | focused stale-cancel fixture |
| HUD pass | P1：mount 中途失败可能丢真实控件；正式 roster 仍依赖旧节点；同图热替换不刷新 minimap | 完整 mount snapshot／rollback、正式 roster 独立刷新、map render revision | rollback 29、formal-without-legacy、minimap hot replace |
| Visual audit | 发布阻断：灰色战斗地面与圆形宠物占位仍像程序 | 本阶段不偷渡未批准候选资产，转入正式 battle arena／actor release 后续 | 新鲜真实 Main 战斗审片；本项保持 outstanding |

`ownerReviewStatus=pending`；不勾选 broad P2.2。

final result: passed

---

# Phase 399 Design QA：觉醒式正式地图页与跨图路线

## Findings

- 结论：Phase399 地图窄范围 `P0=0 / P1=0 / P2=0`。
- P0：无。地图只消费既有地图、interaction、区域和 `MapRoutePlanner` 路线事实；无路线时操作
  fail-closed 并保留页面供重选，战斗中拒绝打开，不修改服务端、地图权威或玩家档案合同。
- P1：无。当前地点、世界区域、楼层、真实 route path／continuation、成功关闭、HUD 恢复和
  battle 隐藏均有正式 Main 门禁；UI 左键不会穿透成世界移动。
- P2：无。真实 `1280×720` 页面完整覆盖世界、右上为项目既有正式橙色 X；当前地图使用
  prepared visual，世界地图显示原创 atlas 的精确 9 区，正常玩家画面无 QA、raw ID、接口或
  agent 文案。工程通过不替代项目所有者审美接受。

## Comparison target and evidence

- 参考输入为项目所有者提供的《石器时代：觉醒》地图流程，以及冻结的当前地图、世界概览和
  区域放大三张参考图；只比较入口层级、全屏关系、当前／世界切换、地点目录、区域选择、楼层
  路线和关闭恢复，不复制参考像素、地名、图标、商标或数值。
- 三行参考／实机同屏：
  `.run/evidence/phase399_map_awakened_owner_review/phase399-final-20260808-c/reference-vs-implementation.png`，
  SHA-256 `707e3dac82cefca498ca5c953daf1235eb960709686ca491ab5f6774f1dc73f1`。
- 真实 Main 八章有声视频：
  `.run/evidence/phase399_map_awakened_owner_review/phase399-final-20260808-c/map-awakened-owner-review-1x.mp4`，
  `22.933333s / 688` 帧、`1280×720 / 30 FPS / 1.00×`、H.264 `yuv420p`／AAC 48kHz 双声道，
  SHA-256 `b1b56f8fe3eafb2ed3cc9af46a40ef31a7a73af03042872eb62970a2572417ac`。
- 12 帧联系表 SHA-256 为
  `cb91fbe999a3aa49fdcc822f18032236a06dd416dc10d071ff0b7aede57e1426`；媒体双流完整解码，
  内层 `SHA256SUMS` 为 `45/45 PASS`。

## Required fidelity surfaces

- Layout：世界 HUD 中保留可发现的地图入口；页面覆盖完整视口，顶部标题／坐标／当前与世界
  页签／橙色 X 固定，当前地图的地点目录与大图、世界地图的 atlas 与区域详情形成稳定双栏。
- Map truth：当前地图消费真实 prepared render state；世界 atlas 只显示 9 个非 GM 权威区域；
  玄影洞窟展示真实入口与一至五层，不补画不存在的区域、楼层或传送。
- Route truth：村医点击形成真实 pending interaction 与目标格；火芽村到玄影二层保留
  `firebud_village_gate → shadow_oath_cavern → shadow_oath_cavern_f2` 的完整 path 和
  continuation。只有有效路线成功提交才关闭页面。
- Controls：入口、当前／世界页签、地点、区域、楼层、关闭均可左键完成；按下与释放必须跨帧，
  UI 点击不得落到世界移动。开页每次复位当前地图，成功路线或 X 关闭后恢复原 HUD。
- Battle boundary：进入战斗隐藏地图页与世界入口；战斗中拒绝开页，不允许地图、任务或世界
  菜单继续覆盖战场。
- Originality：atlas、棕金框、文字、区域热点和图标为 Beastbound 原创／项目既有资产；参考图
  只提供成熟信息架构，未复制商业游戏美术。

## Interaction, regression and performance evidence

- 正式录像共 6 次主左键，`6/6` 按下／释放跨帧；八章连续覆盖 HUD 入口、prepared local、
  当前目标、九区世界、玄影详情、二层跨图、HUD 恢复和 battle 隐藏。
- 最终 Godot auto 回执 `.run/godot_auto_checks/2026-08-08T06-49-27-894Z.log` 为 `2/2 PASS`；
  focused check 另锁定开页复位、prepared visual、atlas、9 区、稳定 getter、route path、
  continuation、关闭恢复和战斗隐藏。
- 独立真实 Main 性能包：
  `.run/evidence/phase399_map_awakened_perf/phase399-final-perf-20260808-b/`。后半稳态 idle 为
  `28.5..30.0 FPS / process_total median 0.170ms / p95 0.180ms`；持续跨帧移动为
  `45.8..52.8 FPS / 3.575ms / 7.720ms`；12 轮地图页压力为
  `29.5..31.5 FPS / 0.255ms / 0.280ms`。
- 性能流程执行 12 轮“打开 → 世界 → 玄影 → 当前 → 关闭”，加移动共 `69/69` 次跨帧左键；
  移动接受 `9/9`、累计 `583.40px`，面板 60 次点击穿透世界 `0`，每轮 prepared visual、9 区与
  HUD 恢复都为真。摘要 `12/12` 门禁和清单 `2/2` 通过，日志无 warning／error／leak。

## Intentional differences and P3 boundaries

- [P3] Beastbound 使用原创九区 atlas 和已有 37 图／71 warp 路网，不复制参考游戏的岛屿轮廓、
  地名、角色、图标或任务入口；这是版权与本项目世界合同要求，不是 fidelity 缺失。
- [P3] 录像与性能包均用隔离 user data、禁档案保存、未启动后端并确认结束态 HTTP 断开；
  `httpRequests=false / serverWrites=0` 或对应性能字段只是配置／结束态声明，没有请求或服务端
  写入计数器，不冒充生产联网证明。
- [P3] 灰色战斗地面和简化战斗 actor 仍是地图范围外的独立视觉发布阻断；本阶段没有偷渡未批准
  战场／宠物候选，也没有据此勾选 broad P2.2。
- [P3] `ownerReviewStatus=pending`；项目所有者尚未观看最终地图视频。本结论只代表工程、交互、
  性能与媒体 Design QA 通过，不等于 owner visual approval。

final result: passed
