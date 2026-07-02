## 战斗 / 联网战斗

1. ~~联网战斗「捕捉」按钮被 UI 永久禁用~~（已修复：联网主菜单捕捉入口已启用，并由自动检查覆盖）

`_sync_battle_buttons()` 在 `serverAuthority` 分支里只处理了 attack/defend/item/spirit/switch_pet/run，`capture` 走 `_: button.disabled = true`。
但 `_submit_server_battle_player_command()` 已支持 `capture`（38759-38792）。
→ 玩家看得到捕捉流程文案，主界面却点不了「捕捉」。
证据：`main.gd:40533-40555` vs `38759-38792`

2. ~~联网战斗帮助文案漏写「捕捉」~~（已修复：联网 help 文案已补齐精灵、捕捉，并由自动检查覆盖）

help 提示仍是「攻击、防御、物品、换宠或离开」，与 38642 行实际支持项不一致。
证据：`main.gd:38693-38694`

3. ~~联网战斗结束后不推进击杀类任务~~（已确认当前不存在：服务端战斗结算已写回 `questStates`，客户端结算日志已展示 `profileWriteback.quests.messages`）

服务器战斗走 `_finish_server_battle_from_closed_room()` → 只 `_queue_server_profile_pull()`；本地 `apply_battle_result()` 和 `_quest_messages_for_battle_result()` 被跳过。
证据：`main.gd:29910-29911` vs `29918-29931`

4. ~~内挂「无目标自动逃跑」在联网下等于认输~~（已修复：队伍 PvE 仍按逃跑关闭房间；切磋/非 PvE 不再自动离开判负，而是停止自动战斗）

`_battle_auto_capture_escape_without_target()` 在 server 模式调用 `_leave_server_battle_room()`，不是单机 `_battle_escape()`。
证据：`main.gd:23713-23715`

5. ~~切磋结束有结算面板，队伍 PvE 没有~~（已修复：队伍 PvE 结束也打开“战斗”结算面板，显示经验/掉落/任务日志，不显示切磋对手）

`_finish_server_battle_from_closed_room()` 里 `not is_party_pve` 才 `_open_battle_result_panel()`。
打怪看不到和切磋一样的经验明细面板。
证据：`main.gd:27607-27608`

6. ~~切磋战斗没有挂机回写，只有 party_pve 有~~（已修复：服务端切磋也生成挂机回写，客户端关闭任意服务端战斗房间都会消费 `profileWriteback.hang`）

`_apply_server_party_pve_hang_writeback()` 仅在 `is_party_pve` 时调用。
低血回村、捕宠计数等挂机逻辑在切磋里不生效。
证据：`main.gd:27593` vs `27831`

7. ~~客户端战斗道具全显示，服务端可能拒收~~（已修复/加固：客户端战斗物品菜单和联网提交路径统一限制为服务端支持的 6 种战斗道具，未知 `item_*` 即使有数量也会在客户端拦截）

客户端 `_submit_server_battle_player_command()` 对 item 只检查 `has_item`；
服务端 `auth-service.js` 多处 `battle_command_item_unsupported`（约 6040+）。
→ 点了物品后服务器拒绝，体验像 bug。
证据：`main.gd:38770-38776` + `auth-service.js:6040`

8. ~~宠物状态技客户端可提交，服务端大概率不支持~~（已确认当前不存在：服务端已接受宠物 `activeSkillIds` 中的状态技并结算 `skill_status`，客户端也能回放服务端状态技事件，现有自动检查和服务端用例覆盖 `pet_sleep_powder` 等状态技）

`_submit_server_battle_pet_command()` 允许任意 `skill_id`；
服务端对 sleep_powder / confuse_cry 等无实现时会返回「暂未开放」类错误。
证据：`main.gd:38999` + 服务端无对应技能处理

------

## 遇敌 / 挂机 / 队伍

9. ~~队伍成员走草丛永不遇敌~~（已修复：队员踩草不再在检测层静默早退，会进入统一遇敌触发路径并提示“队伍中只有队长可以触发遇敌”，同时不启动本地战斗或队员侧服务端房间）

`_update_encounter_zone_check()` 对 `_current_player_is_party_member()` 直接 return。
证据：`main.gd:29594-29595`

10. ~~队伍成员可用遇敌石，但定时只弹提示、不战斗~~（已修复：队员使用遇敌石会在扣道具/启动效果前被客户端和服务端拒绝，提示只有队长可用；单人和队长遇敌石流程保持不变）

遇敌石走 `_trigger_encounter()` → 非队长联网时命中「队伍遇敌由队长触发」并 return；
石计时器仍会周期性重置触发。
证据：`main.gd:32455-32457` → `29619-29621`

11. ~~队伍成员可以开挂机走路，但草丛检测被 #9 屏蔽~~（已修复：队员启动走路挂机会在客户端和服务端被拒绝，提示只有队长可以开始挂机；不会进入本地挂机态或写入服务器 hang session）

`_start_hang_walk()` 不检查队伍角色；挂机走格有效但不会自然遇敌。
证据：`main.gd:41753-41777` + `29594-29595`

12. ~~遇敌人数用本地训练伙伴数算，可能和服务端档案不一致~~（已修复：客户端自然遇敌 fallback 数量会在服务端按服务器参战快照重算，避免本地 `trainingPartners` 把联网房间误开成 10 只怪）

`_encounter_enemy_count_fallback()` 依赖 `_effective_battle_team_character_count()`（含本地 `trainingPartners`）；
训练伙伴只本地改、不上传服务器（见 #15）。
→ 客户端发 10 只怪，服务端 profile 可能按 1 只处理。
证据：`main.gd:34288-34289` + `29649-29657`

13. ~~联网队长无队伍时也走服务器遇敌~~（已确认当前不存在：服务端 `startPartyEncounter` 在无队伍时会以当前账号创建单人 `party_pve` 房间，HTTP 单人 PvE 端点和 Godot 联网契约检查均通过）

`_should_start_server_party_encounter()` 在 `party == null` 时 return `true`（单人联网也开 server room）。
若服务端按「必须组队」校验，会偶发失败（需对照服务端 `startPartyEncounter`）。
证据：`main.gd:29630-29636`

14. ~~队伍成员被队长位移时，本地移动会被强停~~（已修复：队伍事件只在刚变成队员时清独立移动；同地图 `party_follow` 位置同步会平滑走向队长轨迹，不再瞬间清掉跟随动画）

`_current_player_is_party_member()` 多处 `_stop_party_member_local_movement()`。
若同步延迟，队员会感觉「点了没反应」。
证据：`main.gd:29076-29077`、`27417-27418`

------

## 档案同步 / 本地 vs 服务器

15. ~~训练伙伴数量只写本地存档，无服务器接口~~（已修复：新增 `training_partner_set_count` 服务器 profile action，客户端服务器会话设置陪练数量时走 `/profile/action` 并用服务器档案刷新）

`_set_training_partner_count()` 只 `_save_player_profile_now()`，不在 `PROFILE_ACTION_IDS` 里。
联网后拉档会覆盖。
证据：`main.gd:35425-35430` + `auth-service.js:206-229`

16. ~~守护兽/转生试炼战仍走本地战斗引擎~~（已修复：联网账号挑战守护兽/转生试炼会走服务器 `party_pve` 房间；服务端保留固定守护怪组、交互来源，并在胜利写回最终转生证明和 1转MM 试炼奖励）

`_start_guardian_battle_from_dialog()` 直接 `_start_battle(guardian_state)`，不检查联网、不走 server room。
证据：`main.gd:29550-29570`

17. ~~联网下本地战斗奖励只存本地 user://，下次 pull 被覆盖~~（已修复：服务器账号若意外进入非 `serverAuthority` 本地战斗，结算层会拒绝本地写回并重新拉取服务器档案，避免假奖励/试炼证明写入 user:// 后被覆盖）

`_finish_battle_and_return_to_world()` 本地路径 `_save_player_profile_now()`；
`_save_player_profile_now()` 不再上传（28370-28381 已是空操作）；
战斗结束 `_queue_server_profile_pull()` 会用服务器档案覆盖本地（28423-28426）。
→ 守护兽胜利、试炼 proof 等可能打完就丢。
证据：`main.gd:29945-29946`、`24318-24320`、`28423-28426`、`27593-27609`

18. ~~`_record_quest_event_and_maybe_claim()` 纯本地，部分路径联网仍可能调用~~（已修复：服务器账号调用该通用入口时不再写本地任务档案，而是把任务事件串行入队提交到 `/quests/record`，避免战斗/误走 UI 路径造成服务器任务进度分叉）

函数无 `_is_server_account_session()` 分支（30095+）。
若某 UI 误走本地任务记录，会和服务器任务进度分叉。
证据：`main.gd:30095-30114`（对比 `40859-40863` 有 server 分支）

19. ~~战斗结束 pull 可能覆盖面板操作中的本地 UI 状态~~（已修复：服务器 profile pull 在背包/商店等资料面板活跃或操作请求进行中时会延迟应用，关闭面板后再按 revision 安全恢复，避免战斗结算后的拉档插入玩家面板操作）

`_finish_server_battle_from_closed_room()` 末尾无条件 `_queue_server_profile_pull()`；
若玩家立刻开背包/商店，可能被 pull 回来的 profile 打断。
证据：`main.gd:27609`

20. ~~世界日志每条都写入本地系统频道~~（已修复：`_set_world_log_message()` 只维护世界/战斗日志，不再隐式追加到聊天 `system` channel；系统聊天仅保留显式聊天消息，避免联网刷新时和世界日志混入或重复）

`_set_world_log_message()` 把每行 append 到 `CHAT_CHANNEL_SYSTEM`（30125）。
系统频道刷新走服务器时，本地历史与服务器消息会混在一起或重复。
证据：`main.gd:30121-30125`

------

## 商店 / 背包 / 装备

21. ~~联网购买「购买并装备」被降级~~（已修复：联网商店购买装备成功后会继续调用服务器装备接口并合并日志/任务消息，按钮语义与单机一致，不再提示“请从背包执行”）

`_submit_server_shop_action()` 成功只提示「联网装备更换请从背包执行」。
单机同按钮可买完直接穿。
证据：`main.gd:33168-33169`

22. ~~联网商店交易成功但无 profile 时只 pull，不阻断 UI~~（已修复：商店权威交易成功但响应缺少 `profile` 时会保持商店 pending，立即拉取服务器档案并刷新面板，等待期间禁用旧数量上的二次操作）

`server_profile == null` 时提示「请重新拉取」但商店面板可能仍显示旧数量。
证据：`main.gd:33171-33173`

23. ~~邮件附件领取按钮明确不可用~~（已修复：服务器邮件支持附件字段和 `/mail/:id/claim` 领取接口，客户端会显示服务器邮件附件并启用领取按钮，领取后合并服务器档案和邮箱剩余附件）

`mailbox_claim_button.tooltip_text = "玩家邮件暂不支持附件。"`
若邮件系统已设计附件，这是功能缺口。
证据：`main.gd:35077`

------

## 任务 / 转生 / 培养

24. ~~转生试炼 proof 主要靠本地战斗写入~~（已确认当前不存在：服务器账号的守护兽/转生试炼挑战已路由到服务器 `party_pve`，胜利由服务端写入 `rebirthTrialProofs.shadow_oath_rebirth_guardian`；服务器账号若误入本地战斗也会拒绝本地档案写回并拉取服务器档案）

`rebirthTrialProofs` 在服务端 `playerRebirth` 会读（auth-service.js:3557+），
但试炼战走本地战斗（#16），proof 可能从未进服务器档案。
证据：`main.gd:29570` + `auth-service.js:233`

25. ~~宠物培养有 server action，训练伙伴/试炼关卡进度没有对称接口~~（已确认当前不存在：训练伙伴数量已通过 `training_partner_set_count` profile action 由服务端落库，客户端服务器账号路径会调用该 action；转生 proof 已由服务器 `party_pve` 胜利写入 `rebirthTrialProofs`，不再依赖本地战斗写回或额外裸 action）

`pet_cultivation_apply` 在 `PROFILE_ACTION_IDS`；
`trainingPartners` 调整、`rebirthTrialProofs` 战斗写入无对应 action。
证据：`auth-service.js:206-229` vs `main.gd:35425`

26. ~~对话可选任务 talk 在联网下 `optional` 的 server record 可能丢 quest_id~~（已确认当前不存在：客户端 optional talk 会把 `quest_id` 写入 `/quests/record` 的 `questId`；服务端 `questRecord` 会优先按 `payload.questId || event.questId` 调 `recordQuestEventByIdToProfile()`，可选任务会按指定任务推进且不会推进 active quest 链）

`_complete_dialog_optional_talk_quest()` server 分支调用 `_run_server_dialog_quest_record(event, quest_id)`；
需确认服务端 `questRecord` 是否靠 `quest_id` 区分 optional——若只认 active quest，可选任务会推进失败。
（客户端传了 quest_id：40890-40894，值得 Codex 对照服务端实现）

------

## 移动 / 位置 / 战斗房间

27. ~~联网战斗「离开」在指令锁定期间仍可点~~（已修复：战斗指令入口在 `_battle_commands_locked()` 时统一拦截所有指令，`run/离开` 不再例外；服务器客户端自检新增 `battle_lock`，覆盖 `server_waiting` 下直接触发离开不会启动 leave 请求）

`_on_battle_command_pressed()`：`command_id != "run"` 才检查 `_battle_commands_locked()`。
`server_waiting` 阶段可点离开，可能和进行中的 command 请求竞态。
证据：`main.gd:38622-38623`

28. ~~战斗房间恢复轮询在队员身上仍可能触发~~（已修复：队员空闲态不再通过 `_process` 自动轮询 `/battle/state` 恢复房间，战斗房间恢复保留登录显式拉取和服务端事件流路径，避免队员误开/闪现战斗 UI）

29. ~~服务端战斗写回可能跳过部分玩家~~（已修复：客户端会读取当前账号的 `profileWriteback.skippedProfiles`，在战斗结果面板和世界日志提示本次战斗结果/宠物状态未写入服务器，避免只看到胜负但奖励或状态静默丢失）

30. ~~`PUT /profiles/me` 已禁止，但冲突处理仍保留 upload 语义~~（已修复：客户端 upload 完成处理不再把 `revision_conflict` 当成可恢复分支，统一提示整档上传已禁用；自检也移除了 upload conflict 契约并覆盖旧冲突响应不会触发拉取）

------

## 体验 / 文案

31. ~~联网非队长遇敌统一提示「队伍遇敌由队长触发」~~（已修复：草丛/自动遇敌的服务器账号拦截会按队伍角色显示“队伍中只有队长可以触发遇敌”或状态未同步提示；遇敌石和挂机入口继续使用各自的专用队长限制文案）

32. ~~单机遭遇被完全封死，只剩 `auth_auto_bypass`~~（已修复：本地/试玩账号只要已认证且不是服务器会话，就能走本地草丛遇敌；未登录仍拦截，服务器账号继续走服务器权威遇敌或队员拦截）

------

## 建议 Codex 修复优先级

| 优先级         | 编号             |
| :------------- | :--------------- |
| P0 玩家必踩    | 1, 9, 10, 16, 17 |
| P1 进度/数据   | 3, 15, 24, 29    |
| P2 体验一致    | 4, 5, 7, 21, 31  |
| P3 清理/技术债 | 20, 30           |

如果你要，我可以下一轮按「P0 一条一个 PR」帮你写成 Codex 任务描述（含复现步骤 + 期望行为）。
