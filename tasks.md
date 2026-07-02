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

6. 切磋战斗没有挂机回写，只有 party_pve 有

`_apply_server_party_pve_hang_writeback()` 仅在 `is_party_pve` 时调用。
低血回村、捕宠计数等挂机逻辑在切磋里不生效。
证据：`main.gd:27593` vs `27831`

7. 客户端战斗道具全显示，服务端可能拒收

客户端 `_submit_server_battle_player_command()` 对 item 只检查 `has_item`；
服务端 `auth-service.js` 多处 `battle_command_item_unsupported`（约 6040+）。
→ 点了物品后服务器拒绝，体验像 bug。
证据：`main.gd:38770-38776` + `auth-service.js:6040`

8. 宠物状态技客户端可提交，服务端大概率不支持

`_submit_server_battle_pet_command()` 允许任意 `skill_id`；
服务端对 sleep_powder / confuse_cry 等无实现时会返回「暂未开放」类错误。
证据：`main.gd:38999` + 服务端无对应技能处理

------

## 遇敌 / 挂机 / 队伍

9. 队伍成员走草丛永不遇敌

`_update_encounter_zone_check()` 对 `_current_player_is_party_member()` 直接 return。
证据：`main.gd:29594-29595`

10. 队伍成员可用遇敌石，但定时只弹提示、不战斗

遇敌石走 `_trigger_encounter()` → 非队长联网时命中「队伍遇敌由队长触发」并 return；
石计时器仍会周期性重置触发。
证据：`main.gd:32455-32457` → `29619-29621`

11. 队伍成员可以开挂机走路，但草丛检测被 #9 屏蔽

`_start_hang_walk()` 不检查队伍角色；挂机走格有效但不会自然遇敌。
证据：`main.gd:41753-41777` + `29594-29595`

12. 遇敌人数用本地训练伙伴数算，可能和服务端档案不一致

`_encounter_enemy_count_fallback()` 依赖 `_effective_battle_team_character_count()`（含本地 `trainingPartners`）；
训练伙伴只本地改、不上传服务器（见 #15）。
→ 客户端发 10 只怪，服务端 profile 可能按 1 只处理。
证据：`main.gd:34288-34289` + `29649-29657`

13. 联网队长无队伍时也走服务器遇敌

`_should_start_server_party_encounter()` 在 `party == null` 时 return `true`（单人联网也开 server room）。
若服务端按「必须组队」校验，会偶发失败（需对照服务端 `startPartyEncounter`）。
证据：`main.gd:29630-29636`

14. 队伍成员被队长位移时，本地移动会被强停

`_current_player_is_party_member()` 多处 `_stop_party_member_local_movement()`。
若同步延迟，队员会感觉「点了没反应」。
证据：`main.gd:29076-29077`、`27417-27418`

------

## 档案同步 / 本地 vs 服务器

15. 训练伙伴数量只写本地存档，无服务器接口

`_set_training_partner_count()` 只 `_save_player_profile_now()`，不在 `PROFILE_ACTION_IDS` 里。
联网后拉档会覆盖。
证据：`main.gd:35425-35430` + `auth-service.js:206-229`

16. 守护兽/转生试炼战仍走本地战斗引擎

`_start_guardian_battle_from_dialog()` 直接 `_start_battle(guardian_state)`，不检查联网、不走 server room。
证据：`main.gd:29550-29570`

17. 联网下本地战斗奖励只存本地 user://，下次 pull 被覆盖

`_finish_battle_and_return_to_world()` 本地路径 `_save_player_profile_now()`；
`_save_player_profile_now()` 不再上传（28370-28381 已是空操作）；
战斗结束 `_queue_server_profile_pull()` 会用服务器档案覆盖本地（28423-28426）。
→ 守护兽胜利、试炼 proof 等可能打完就丢。
证据：`main.gd:29945-29946`、`24318-24320`、`28423-28426`、`27593-27609`

18. `_record_quest_event_and_maybe_claim()` 纯本地，部分路径联网仍可能调用

函数无 `_is_server_account_session()` 分支（30095+）。
若某 UI 误走本地任务记录，会和服务器任务进度分叉。
证据：`main.gd:30095-30114`（对比 `40859-40863` 有 server 分支）

19. 战斗结束 pull 可能覆盖面板操作中的本地 UI 状态

`_finish_server_battle_from_closed_room()` 末尾无条件 `_queue_server_profile_pull()`；
若玩家立刻开背包/商店，可能被 pull 回来的 profile 打断。
证据：`main.gd:27609`

20. 世界日志每条都写入本地系统频道

`_set_world_log_message()` 把每行 append 到 `CHAT_CHANNEL_SYSTEM`（30125）。
系统频道刷新走服务器时，本地历史与服务器消息会混在一起或重复。
证据：`main.gd:30121-30125`

------

## 商店 / 背包 / 装备

21. 联网购买「购买并装备」被降级

`_submit_server_shop_action()` 成功只提示「联网装备更换请从背包执行」。
单机同按钮可买完直接穿。
证据：`main.gd:33168-33169`

22. 联网商店交易成功但无 profile 时只 pull，不阻断 UI

`server_profile == null` 时提示「请重新拉取」但商店面板可能仍显示旧数量。
证据：`main.gd:33171-33173`

23. 邮件附件领取按钮明确不可用

`mailbox_claim_button.tooltip_text = "玩家邮件暂不支持附件。"`
若邮件系统已设计附件，这是功能缺口。
证据：`main.gd:35077`

------

## 任务 / 转生 / 培养

24. 转生试炼 proof 主要靠本地战斗写入

`rebirthTrialProofs` 在服务端 `playerRebirth` 会读（auth-service.js:3557+），
但试炼战走本地战斗（#16），proof 可能从未进服务器档案。
证据：`main.gd:29570` + `auth-service.js:233`

25. 宠物培养有 server action，训练伙伴/试炼关卡进度没有对称接口

`pet_cultivation_apply` 在 `PROFILE_ACTION_IDS`；
`trainingPartners` 调整、`rebirthTrialProofs` 战斗写入无对应 action。
证据：`auth-service.js:206-229` vs `main.gd:35425`

26. 对话可选任务 talk 在联网下 `optional` 的 server record 可能丢 quest_id

`_complete_dialog_optional_talk_quest()` server 分支调用 `_run_server_dialog_quest_record(event, quest_id)`；
需确认服务端 `questRecord` 是否靠 `quest_id` 区分 optional——若只认 active quest，可选任务会推进失败。
（客户端传了 quest_id：40890-40894，值得 Codex 对照服务端实现）

------

## 移动 / 位置 / 战斗房间

27. 联网战斗「离开」在指令锁定期间仍可点

`_on_battle_command_pressed()`：`command_id != "run"` 才检查 `_battle_commands_locked()`。
`server_waiting` 阶段可点离开，可能和进行中的 command 请求竞态。
证据：`main.gd:38622-38623`

28. 战斗房间恢复轮询在队员身上仍可能触发

`_server_battle_should_poll_room_restore()` 要求 `_current_player_is_party_member()`（27115 附近），
队员也会 poll restore——若队长已开战而队员 UI 未同步，可能闪一下战斗界面或 log 混乱。
证据：`main.gd:27115`（grep 结果）

29. 服务端战斗写回可能跳过部分玩家

`applyBattleExpRewardToProfile` 路径里 `skippedProfiles` 收集 `profile_binding_missing` 等（auth-service.js:7466+）。
客户端 pull 后看不到经验，但战斗已结束——无明确玩家提示。
证据：`auth-service.js:7466-7531`

30. `PUT /profiles/me` 已禁止，但冲突处理仍保留 upload 语义

`_apply_server_profile_upload_result()` 仍处理 `revision_conflict`（28446+）；
正常游戏不会再 upload，冲突恢复路径可能永远走不到或误导调试。
证据：`http-server.js:81-87` + `main.gd:28443-28455`

------

## 体验 / 文案

31. 联网非队长遇敌统一提示「队伍遇敌由队长触发」

包括单人误触遇敌石、挂机走到草丛边缘等，文案不区分「你是队员」vs「你根本不该在这触发」。
证据：`main.gd:29619-29621`

32. 单机遭遇被完全封死，只剩 `auth_auto_bypass`

`_can_start_local_encounter_model()` 仅 dev bypass 为 true（29639-29643）。
离线/demo 账号无法草丛练级，只能登录服务器。
证据：`main.gd:29622-29624`

------

## 建议 Codex 修复优先级

| 优先级         | 编号             |
| :------------- | :--------------- |
| P0 玩家必踩    | 1, 9, 10, 16, 17 |
| P1 进度/数据   | 3, 15, 24, 29    |
| P2 体验一致    | 4, 5, 7, 21, 31  |
| P3 清理/技术债 | 20, 30           |

如果你要，我可以下一轮按「P0 一条一个 PR」帮你写成 Codex 任务描述（含复现步骤 + 期望行为）。
