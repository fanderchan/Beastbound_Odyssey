# Phase 395：正式世界 HUD 与右侧五席组队匹配页

## 参考意图与原创边界

- 本阶段直接回应项目所有者提供的世界界面参考：组队不是另一个灰色工程弹窗，而应成为世界
  HUD 右侧与“任务”并列的正式页签；匹配完成后立刻回到世界，队伍成员持续可见，同时底部
  邮箱、背包、设置、排行榜、家族、烹饪、锻造、图鉴、宠物、角色和收起入口不能消失。
- 参考图只用于确认信息架构、五席纵向阅读顺序、页签关系和世界界面连续性。运行实现继续使用
  Beastbound 原创的深棕木石底、铜金描边、暖色选中态与自有头像／图标，不复制参考游戏的
  人物、宠物、地图、商标、像素、等级或在线人数。
- Phase 394 已完成真人优先、`8s` 后 NPC 软补位、下一场真人替换、取消与停止语义以及服务端
  权威合同。Phase 395 只收口正式世界 HUD 的展示、输入和连续性，不新增服务端 mutation，
  不修改协议版本，也不把这一页冒充 broad P2.2 的全部正式美术完成。

## 玩家可见合同

### 正式世界 HUD

- 世界 HUD 统一由觉醒式顶栏、左侧入口、右侧任务／组队区域、底部消息与完整功能栏组成；
  进入匹配、NPC 补位、真人替换、取消匹配或停止挂机时，均不重建或丢失底部功能栏。
- 进入战斗时，世界顶栏、左侧入口、右侧任务／组队页和底部功能栏统一隐藏，只保留战斗所需
  界面；退出战斗后恢复同一个世界 HUD 实例及原有队伍状态，避免把地图功能带进战斗或回城
  后丢失底栏。
- 右侧“任务／组队”为同一容器内的两个真实左键页签。“任务”继续承载当前任务栏；“组队”
  原位展示队伍，不再把一次页签点击错误地解释为打开旧全屏队伍程序面板。
- 玩家发起匹配后，全屏路线页关闭，世界重新可操作并自动选中“组队”页；之后仍可在任务与
  组队间切换。收起／恢复世界 HUD 继续服从同一正式布局，不留下旧面板占位。

### 五席队伍卡

- 队伍区固定投影五个席位，并以真人、NPC 陪练、空位三种卡片表达当前权威状态：
  - 真人卡只显示状态里确有的名字、等级、头像和元素；参考侧栏本身不展示 HP，
    因此本阶段不额外增加血条；
  - NPC 卡明确标注“NPC 陪练”，使用中性陪练身份，不冒充在线真人或玩家账号；
  - 空位只显示“匹配中／等待队友”，不捏造姓名、头像或人口。
- Phase 394 的真人快照没有转生字段，因此本页不会把等级改写成虚假的“X转X级”；NPC 没有
  权威元素时也不猜元素。缺头像使用本项目正式中性资源，不拉入参考游戏美术。
- `1 真人 + 4 空位`、`1 真人 + 4 NPC`、`2 真人 + 3 NPC` 与五真人满队均有独立投影；当
  真人已加入但当前战斗尚未结束时，状态明确写“下一场替换陪练”，不把延迟替换伪装成已经
  完成。

### 取消与停止

- 右侧组队页的“取消匹配”只停止继续找真人，已有挂机保持运行；取消后完整世界 HUD 与底部
  功能栏继续显示。
- 正式底栏“挂机中”入口仍打开挂机页；挂机页提供可见的“停止挂机”，左键后才同时停止
  挂机、取消匹配并回到世界。停止与取消不借用旧灰色状态条或隐藏 QA 调用。
- 旧 `party_roster_panel` 与旧 `HangMatchmakingWorldStatus` 在构建、布局、刷新和状态事件四条
  路径上均保持隐藏，不能因后续 party／match update 再次出现或遮挡右下功能栏。

## 数据与服务端权威

- 正式队伍页只消费 `HangMatchmakingController.current_state()` 与既有权威 party state；
  presenter 做有界五席投影，view 只负责玩家可见样式和输入，不在每帧热路径重新请求服务器。
- 最终真值门禁覆盖四组易混淆状态：空闲且无普通队伍时不伪造真人；`active + party={}` 与
  `full + party={}` 都把控制器空快照视为权威并拒绝回落到过期普通队伍；正式匹配过滤离线真人，
  同名但不同账号不能获得本地身份，待同步真人、未知真人头像和无权威头像的 NPC 均使用中性
  表达。全屏路线／开始页也消费同一套生产 presenter 真值，不另造“真人队友”或 `Lv0`。
- 匹配 join／cancel、轮询、事件去重、单调 revision、NPC 奖励隔离和队长权限均复用
  Phase 394 的正式实现；本阶段不新增 endpoint、持久化字段、在线人口或协议版本。
- 录像使用确定性注入 controller 只证明玩家界面与交互；录像工具未启动后端、未访问 MySQL、
  禁用档案保存，结束态也没有 HTTP 连接。
  摘要中的 `serverWrites=0` 是捕获合同声明，不是 HTTP 请求计数器或服务端写入计数器；这不
  冒充真实多客户端真人网络匹配验证。

## 资源与来源审计

- `world_hud_awakened_v1` 现有原创资源已补齐为 `33` 组 source/runtime 配对，即 `33` 张来源
  原图、`33` 张透明运行图和 `66` 条 manifest 记录；每条记录锁定尺寸、字节数、SHA-256 与
  `derivedFrom`，图鉴入口只使用本包 `event_codex.png`，不再跨包借图。
- 来源说明、生成提示、权属与替换路径同步覆盖全部 `33` 组；Godot 生成的 `.import`、
  `.gd.uid` 与缓存不进入产品提交。
- 严格资源审计为 `icons=33 / source=33 / runtime=33 / manifest=66`，审计单测 `4/4 PASS`。
  该结果证明来源和运行配对完整，不等于项目所有者已接受视觉。

## 自动验证

- Godot 全项目解析通过；正式 world HUD presenter、view、五席 roster 与挂机面板 focused checks
  全部通过，任务／组队页签、五席三种身份、下一场替换、四组真值门禁、全屏生产真值、取消与
  正式停止均使用跨帧左键或定向断言验证。
- 四组真值与全屏生产真值是进入录像前及状态同步时执行的 check-only 硬门；它们决定不合格
  状态不能产出验收媒体，但不是十章视频中供玩家观看的额外章节或调试叠层。
- `--auto-hang-matchmaking-check` 最新回执
  `.run/godot_auto_checks/2026-08-07T21-53-46-564Z.log` 为 `2/2 PASS`：正式 roster、完整底栏、
  旧 UI 永久隐藏、matching／npc_filled／replacement／full、取消继续挂机及停止隐藏均为真；
  `battle_hud=true` 另证明进战世界 HUD 隐藏、退战恢复。
- 服务端未改代码；复跑 `server/node/test/auth-hang-matchmaking.test.js` 为 `13/13 PASS`，证明
  Phase 394 的权威状态仍兼容本次展示层。
- 资源审计为 `source=33 / runtime=33 / manifest=66`，资源审计单测 `4/4 PASS`；包含审计与
  录像工具在内的 Python 定向单测 `10/10 PASS`。独立代码审查最终为
  `P0=0 / P1=0 / P2=0`；目标 `git diff --check` 通过。
- 独立 idle 探针在真实 `Main.tscn`、`1280×720` 正常 30 FPS 世界空闲路径的后 10 秒保持
  `29.8..30.0 FPS`，`process_total` 平均 `0.355ms`（`0.22..0.43ms`），CPU 平均
  `1.71%`（`0.9..2.1%`）；启动装载峰值 `95.4%` 不计入稳态。
- 真实跨帧移动为 `status=ok / path_len=11`，稳定约 `60 FPS`，`process_total` 平均
  `0.711ms`（`0.49..1.27ms`，唯一 `1.27ms` 样本含 `hud_apply=0.99ms`，其余不高于
  `0.81ms`），后五个 CPU 样本平均 `5.64%`。连续输入为 `35` 次 accepted、`11` 次
  resolved／applied、`screen_matches=35 / mismatches=0`，输入平均／最大 `1/3us`，移动、
  合并、停稳和最终目标均为真；`process_total=0.67→0.52ms`、最终 CPU `4.5%`。
- 三个性能进程均 exit 0、无 ERROR／SCRIPT ERROR／WARNING，也没有遗留本轮启动的 Godot、
  Node、recorder 或 ffmpeg 进程；录制进程 MovieWriter 时钟不冒充上述稳态结论。

## 真实 Main 连续视频

- 视频：
  `.run/evidence/phase395_hang_matchmaking_world_hud_owner_review/phase395-final-owner-review-v5-20260808/hang-matchmaking-world-hud-owner-review-1x.mp4`；
- 联系表：
  `.run/evidence/phase395_hang_matchmaking_world_hud_owner_review/phase395-final-owner-review-v5-20260808/contact-sheet.png`；
- 参考／实机同屏：
  `.run/evidence/phase395_hang_matchmaking_world_hud_owner_review/phase395-final-owner-review-v5-20260808/reference-vs-implementation.png`；
- 结构化摘要：
  `.run/evidence/phase395_hang_matchmaking_world_hud_owner_review/phase395-final-owner-review-v5-20260808/summary.json`。
- 录后源码绑定：
  `.run/evidence/phase395_hang_matchmaking_world_hud_owner_review/phase395-final-owner-review-v5-20260808/source-attestation.json`；
- 外层完整性清单：
  `.run/evidence/phase395_hang_matchmaking_world_hud_owner_review/phase395-final-owner-review-v5-20260808/OUTER-SHA256SUMS`。
- 成片从真实 `res://scenes/Main.tscn` 的正式参数入口运行，不用孤立 SceneTree 拼一套替代 HUD；
  共十章覆盖路线选择、开始二选一、`1真人+4空位`、`1真人+4NPC`、
  `2真人+3NPC+下一场替换`、任务／组队双页签、取消后继续挂机、正式停止和回到完整世界。
- 规格为 `20.933333s / 628` 帧、`1280×720 / 30 FPS / 1.00×`，H.264 `yuv420p` 与 AAC
  48kHz 双声道全片解码通过；共 `9` 次真实跨帧左键、`10` 章。MP4
  SHA-256 为 `7b77751c01e4bb7a8813201c16d55914bd49ef219f9635b53088c7933a5aac06`；
  联系表 SHA-256 为 `c886aad59d0acdd4c6bbc1c59c02b403a5e4f159752726d9e917cde9829bbdf1`；
  参考／实机同屏图 SHA-256 为
  `c3c8c2516d8bb4518000d9e10caaec32c4739f026c44ac31c7cc8a0f4212ae78`。
- Godot 录制日志中 `WARNING`、`ERROR` 与 `leak` 均为零，日志 SHA-256 为
  `57b1b2e92543da2e5aaa93bd09d9f33531e9bf8bb6d7e6b5fb70401221c1b1ae`；`SHA256SUMS`
  文件 SHA-256 为 `644cda7741200e438489d6fc72c52ed99280f19df8a907ab911469aa2596b9e2`。
  清单不包含完成录制校验后才写入的 `summary.json`，因此摘要另以 SHA-256
  `d40ae0560e13e30d43a32df8aa9960a7dc352860077767fe3994eee019422aa9` 单列锁定。
- 摘要中的 `serverWrites=0` 仅为捕获合同声明：工具未启后端、未访问 MySQL、关闭正常
  档案保存且结束态无 HTTP 连接；本轮没有安装请求或服务端写入计数器，不能据此声称已测得
  服务端零写入。
- detached `source-attestation.json` 状态为 `passed_with_explicit_post_run_boundary`，锁定
  录制关键 `93` 条路径（21 个脚本／工具文件及 `world_hud_awakened_v1` 下 72 个非
  `.import`／`.uid` 包文件）及其当前 SHA-256；所有 `93/93` 文件 mtime 均早于最早录制进程
  边界，最短冻结间隔 `138s`。资源树 SHA-256 为
  `bd6c913e7065ac1baf024660c169cf07a5633c4dedf555e44790e0c113fb4a21`；按 HEAD 基线与 scoped dirty
  内容拼接得到的 diff SHA-256 为
  `65b625be47bc5e2acbb647bfd64e51167ec37c82b2970259f99b146ec915b717`；attestation 自身
  SHA-256 为 `cedd453c335c14aab13c7a6ce064df424ca116cfc5388ebc66035974af62bd5d`。
- `OUTER-SHA256SUMS` 将内层清单、摘要、参考同屏和 detached attestation 一并纳入，复核
  `33/33 PASS`，文件 SHA-256 为
  `dc3fb9efe6d242e95c47b2c1229a0d2f469c49339eed44af686e48ab07a3a1bc`。
- `ownerReviewStatus=pending`：本轮项目所有者尚未观看这支纠正版，所以工程与媒体自检不能
  冒充 owner visual approval，也不能勾选 broad P2.2。

## 明确非目标与残余风险

- [P3] 最终视频从真实 `Main.tscn` 进入，但为隔离、确定性的 Main／PFC 流程，使用注入控制器
  且只记录结束态无 HTTP 连接；它证明正式 UI 与输入连续性，不冒充真实多客户端真人匹配。
- [P3] 本阶段未执行真实 MySQL fault injection；发布前仍需专用联机与存储故障演练。
- [P3] detached source attestation 在录像完成后生成，以当前文件 SHA 和 mtime 早于录制窗口
  作为绑定依据，不是录像进程内工件，也没有密码学可信时间戳。内层 `SHA256SUMS` 不包含后写
  `summary.json`；外层 `OUTER-SHA256SUMS` 已覆盖摘要、参考同屏与 attestation，不能把录中与
  录后两种完整性边界混写。
- [P3] 代码审查保留三个非阻断工程债：正式 HUD mount 中途失败时的局部回滚仍可更完整；
  roster 刷新仍依赖 legacy node 存在；同一地图热替换 render-state 时 minimap 不会立即重配。
- 不新增踢人、转让队长、指定申请、聊天招募、跨服、付费加速、虚假在线人口或不存在的
  人物／NPC 信息。
- Design QA 的 P0／P1／P2 均为 `0`；项目所有者观看纠正版前，本阶段保持
  `ownerReviewStatus=pending`。

final result: passed
