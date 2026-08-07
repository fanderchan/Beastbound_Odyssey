# Phase 394：挂机匹配、真人优先与陪练 NPC 软补位

## 参考意图与范围

- 本阶段承接项目所有者同轮提供的挂机选区、便捷组队、开始方式、匹配席位与世界挂机状态
  参考，只提炼“选正式练级区 → 立即挂机或匹配挂机 → 真人优先成队 → 空位透明补位 →
  继续自动战斗”的成熟流程；不复制参考游戏的角色、宠物、地图、商标、数值或像素。
- Beastbound 的正式规则是服务端权威挂机会话与组队 PvE 上的软补位，不是客户端伪造在线
  玩家，也不是恢复旧版可手工增删、加满或清空的本地陪练伙伴。
- Phase 394 收口挂机匹配这一窄切片；首发世界的全部页面、美术、NPC、动画与其他 P2.2
  内容仍未完成，因此本阶段不勾选 broad P2.2。

## 玩家承诺

- 玩家从全屏“挂机匹配”页选择已登记的可重复练级路线；非当前地图会先走既有真实跨图
  寻路，抵达后再进入对应挂机会话，不能伪造 map、zone 或 encounter group。
- 主动作明确给出“立即挂机／匹配挂机”二选一。立即挂机沿用单人权威挂机；匹配挂机先保持
  挂机战斗，再按同一正式目标寻找真人队友。
- 匹配始终真人优先。相同路线的真人队伍按进入时间合并，正式队伍上限为五人；已有队伍
  只能由队长发起或取消匹配，非队长不能替队伍做权威决定。
- 等待达到 `8s` 后仍有空位，服务器才以成对人物／宠物的临时陪练 NPC 补齐到五个席位。
  玩家界面始终把它们标为“陪练 NPC”，不会伪装成在线真人或抬高在线人数。
- 匹配继续在后台寻找真人。真人加入时权威队列立即减少相应 NPC 数量；已经开始的战斗不被
  硬切断，替换从下一场战斗生效。满真人后进入 `full`，队员离开又以更高 revision 恢复匹配。
- 非队长掉线时，其真人席位在下一场由 NPC 软补；队长掉线则取消本队匹配。这是服务端明确
  的领导权规则，不让无在线队长的队伍继续被后台修改。
- 取消匹配只停止找队友，原挂机继续；“停止挂机”才同时停止挂机、清除匹配并隐藏世界状态。

## 服务端权威匹配合同

- 正式入口为 `GET /hang/match/state`、`POST /hang/match/join` 与
  `POST /hang/match/cancel`。join／cancel 使用意图绑定的稳定幂等键；客户端以 `2s` 有界轮询、
  inflight 去重和 revision 去重消费状态，同时接收 `hang.match_update`、
  `hang.match_cancelled` 与队伍更新事件。
- join 目标必须能从当前账号的权威挂机 session、地图、进度区和 encounter group 反推到同一
  已登记路线；伪造路线、跨路线合并、离线队员或非队长控制均失败关闭。
- 对外状态只投影 `matching / npc_filled / full / idle / cancelled`、真人／NPC／空位数、
  补位倒计时、公开队伍摘要和单调 `stateRevision`。NPC 内部模板、账号字段与持久化细节不进入
  玩家 UI。
- join 的 durable receipt 只冻结最小的 party 与 target 证明，不持久化 queue ID、NPC、
  listings 或运行队列。普通提交失败不发布幽灵队列；GET 清理与延迟提交交错时使用 delta
  rebase，不能复活过期队列或让 revision 回退。
- 对 MySQL 式模糊 COMMIT，exact receipt 可在同进程或重启后重建唯一、receipt-bound 的
  party＋target 队列；单人 join 和并入既有队伍都不会二次推进任务、重复提高档案 revision，
  或恢复一份陈旧 NPC 快照。

## NPC 软补位与奖励隔离

- 每个临时 NPC 快照均带 `matchmakingNpc=true`、`controller=server_ai`、
  `rewardEligible=false`，且 `accountId / ownerAccountId / partnerId` 为空；其人物和宠物仅作为
  当前战斗的服务器 AI actor 注入。
- NPC 不进入 party participant account IDs，不计在线真人、队伍真人奖励倍率或等待真人数，
  也不创建账号、玩家档案、宠物实例或服务快照实体。
- 战斗 EXP、物品、捕捉和 profile writeback 只面向真实 participant account IDs；NPC actor
  即使实际参战也不能成为经验／经济接收者。对外结算与 durable join receipt 中均不出现
  `matchmakingNpc`、NPC 列表或旧陪练 ID。
- 本阶段只复用既有组队 PvE 结算公式，没有为 NPC 新增奖励、成本、掉落、捕捉、耐久或
  商业化规则。

## 旧手工陪练退役与只读兼容

- 旧“陪练伙伴”面板、入口、按钮、手工增删／加满／清空包装函数、演示和自动检查 flag 已从
  正常玩家路径移除；原入口统一打开“挂机匹配”。
- 服务端 `training_partner_set_count` 已成为退役 tombstone：返回中文提示并引导“匹配挂机”，
  不写档案、不增加 revision，也不推进旧 `training_partner_count` 目标。
- 已有存档里的 `profile.trainingPartners` 和稳定任务 ID `quest_training_partner_intro` 不做
  破坏性迁移或静默删除，仍能被加载、归一化和只读查看；新任务改用
  `hang_matchmaking_join`，旧目标模板只为历史档案解析保留。
- 新创建的本地或服务端战斗都不再把 `profile.trainingPartners` 注入战斗。已经冻结在旧房间
  快照里的旧 actor 仍可只读渲染／回放，但被标记为 legacy 且 `rewardEligible=false`，不会再
  结算人物或宠物 EXP；因此兼容旧战报不等于复活旧成长系统。

## 客户端页面与运行状态

- `HangMatchmakingAwakenedPanel` 负责 `1280×720` 全屏路线卡、便捷组队、五席位状态和二选一
  弹层；`HangMatchmakingClientModel` 负责严格协议投影，controller 负责请求、轮询与事件去重，
  `HangMatchmakingWorldStatus` 只显示当前挂机／匹配摘要和停止入口。
- 页面沿用 Beastbound 的深色木框、羊皮纸卡片与铜金主操作；路线、真人、临时 NPC 和空位有
  不同标签，正常玩家界面不显示 account ID、queue ID、schema、接口名、测试标志或 agent／QA
  文案。
- PanelRegistry 将该全屏页纳入世界菜单输入阻挡；路线、页签、队伍、二选一、取消、停止与
  关闭均可用真实跨帧左键完成。挂机遭遇开始时继续使用既有人物／宠物自动策略。

## 验证

- 服务端最终独立审计为 P0／P1／P2 均无：四个受影响 Node 文件语法检查通过；
  `auth-hang-matchmaking`、`auth-profile-actions`、`auth-quest-hang` 与 `auth-battle-room` 合计
  `142/142` 通过，目标 `git diff --check` 通过。
- 服务端专项覆盖正式目标、真人合并、偏好队列、路线隔离、恰好 `8s` 补位、下一场真人替换、
  队长权限、join／cancel 幂等、任务推进、满员后恢复、保存失败零幽灵队列、GET prune 与
  revision 单调、单人／合并队员模糊 COMMIT 重启恢复、离线席位、HTTP envelope、NPC 战斗注入
  和奖励隔离。
- `node tools/run_godot_auto_checks.mjs --only=--auto-hang-matchmaking-check --fail-fast`
  为 `2/2 PASS`；`choice / matching / dedupe / npc_filled / replacement / full /
  party_update_refresh / matching_resumed / auto_strategies / cancel_keeps_hang /
  stop_hides` 均为 `true`。
- 网络模型独立检查 `16/16` 通过；觉醒面板 focused check 通过真实左键、二选一、非当前图
  引导、匹配、取消和关闭；任务目标 standalone 通过，Godot 解析加任务模板／任务链／任务 UI
  自动检查为 `4/4 PASS`。旧手工陪练 UI、flag 与包装函数的精确残留审计零命中。
- 独立 PC 性能探针：fixed idle 为 `60 FPS / process_total=0.03..0.04ms`，真实跨帧移动为
  `status=ok / path_len=11 / 60 FPS / 0.04..0.05ms`；112 次真实点击合并成 33 次寻路并正确
  停稳，`process_total=0.05..0.07ms`。Metal 实时时钟下，低处理器 idle 为 `30 FPS`、CPU
  中位 `4.8%`、process 中位 `0.285ms`；移动为 `60 FPS`、CPU 中位 `11.8%`、process 中位
  `0.29ms`。这些数据不是 200 人同图或服务端并发容量证明。

## 连续视频证据

- 视频：
  `.run/evidence/phase394_hang_matchmaking_owner_review/phase394-final/hang-matchmaking-owner-review-1x.mp4`；
- 联系表：
  `.run/evidence/phase394_hang_matchmaking_owner_review/phase394-final/contact-sheet.png`；
- 摘要：
  `.run/evidence/phase394_hang_matchmaking_owner_review/phase394-final/summary.json`。
- 成片由 SceneTree 录像脚本实例化真实 `res://scenes/Main.tscn`，使用 Metal Forward Mobile；
  十章连续覆盖世界上下文、路线卡、便捷组队、开始二选一、真人优先等待、NPC 补位、真人在
  下一场替换、世界状态、取消后继续挂机和停止挂机。
- 最终规格为 `23.833333s / 715` 帧、`1280×720 / 30 FPS / 1.00×`、H.264
  `yuv420p`、AAC 48kHz 双声道，音视频双流完整解码通过；MP4 SHA-256：
  `9074a94aa54458c6aeae20277cf0151412d7d5f312139fd74f6860e6c6955f0c`。
- 脚本发送 `9` 次真实跨帧左键；所有流程覆盖项为 `true`，且玩家画面无 QA 文案。录像使用
  新鲜隔离 user-data，没有启动后端、访问 MySQL、声称真实在线人数或产生服务器／档案写入。
- 录像内单次采样峰值 `maxProcessMilliseconds=42.602` 只记录录制过程中的最坏帧，不冒充
  稳态性能；性能结论以上述独立 idle／movement／mouse 与 Metal 实时时钟探针为准。
- `ownerReviewStatus=pending`：工程、交互、媒体与 Design QA 门禁已通过，但项目所有者尚未
  观看并接受本支最终视频，因此不扩大为视觉 owner approval，也不勾选 P2.2。

## 明确非目标与 P3 残余

- 未执行真实 MySQL 故障注入或完整 `npm test`；模糊 COMMIT 已由 typed async store 覆盖，
  但上线前仍应在 MySQL 专用环境补真实断连／确认丢失演练。
- 为旧 frozen room 读取兼容保留的内部 training-partner helper／switch 已无玩家入口且不能写
  奖励，可在后续专门清理；本阶段不把删除兼容代码混进功能收口。
- 不新增指定队伍申请、跨路线匹配、跨服、聊天招募、踢人、队长迁移、付费加速、排行榜、
  世界首领或虚假在线人口；也不宣称挂机匹配等同于完整社交／组队系统。
- `ownerReviewStatus=pending`、真实 MySQL fault injection 与 broad P2.2 仍是明确未完成边界。
