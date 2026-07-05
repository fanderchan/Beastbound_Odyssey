# Beastbound Odyssey — 全面质量整顿计划

> 来源：客户端 `client/godot` 与服务端 `server/node` 两份深度审查。
>
> 方针：针对性整顿，不做整体大重构；质量整顿完成后按 `stoneage_gap_plan.md` 继续内容迭代；全程不碰美术资产。
>
> 执行规则：每阶段小步提交，跑针对性测试和性能基线；阶段结束后停下等用户确认，再进入下一阶段。默认不跑全量 CI，除非用户明确要求或阶段属于真实发布/导出闸门。

## 进度追踪

### [x] 阶段 1：堵服务端权威漏洞（最高危）

- [x] ~~收紧 `POST /players/position`（先做，任务校验依赖它）：位置上报只接受与服务端已知位置相邻/合法的移动，或统一收敛到已有的 `movePlayerStep` 权威路径，拒绝瞬移。涉及 `server/node/src/auth-service.js` 的 1079-1134、14427-14463。~~
- [x] ~~收紧 `POST /quests/record`（`server/node/src/auth/quest.js` 28-74）：`battle_victory` / `capture_pet` 改由服务端战斗结算路径直接推进任务，不再信任客户端上报；`talk` 类事件校验玩家与 NPC 的服务端位置距离。客户端对应上报路径同步调整。~~
- [x] ~~`saveProfile` 整档写入加环境闸门：仅测试、seed、GM 运维可用，生产路径拒绝。~~
- [x] ~~异步 MySQL 写失败不再静默：写队列失败向上冒泡，接口返回 503 中文提示；JSON store 解析损坏不再静默变空档。~~
- [x] ~~新增安全回归测试：任务伪造、瞬移、整档写入、写失败路径。~~

完成证据：最近提交已覆盖阶段 1 服务端权威修复链路，包括 `a3f73439`、`62df7551`、`9b33c75f`、`1ae4eef3`。

### [x] 阶段 2：玩家可见文案与客户端 bug

- [x] ~~所有 `parsed.get("message")` 直出的错误路径统一走 `player_message_for_code(code, message)`，覆盖战斗指令（`client/godot/scripts/battle/server_battle_coordinator.gd:804`）、组队/商店/强化/合成/装备/修理/切磋等（`client/godot/scripts/ui/panel_flow_coordinator.gd:8243,11382,11960,12107,13031,13860,13973,16486` 及同类）。~~
- [x] ~~增加一个自动检查，扫描直接展示原始 `message` 的模式，防止回归。~~

完成证据：新增 `ServerAuthClientModel.player_message_from_parsed()` 与 `--auto-player-message-safety-check`；战斗指令、组队/商店/强化/合成/装备/修理/切磋、聊天/家族/邮箱等错误展示路径已切到统一中文玩家文案映射。`git diff --check` 通过；`node tools/run_godot_auto_checks.mjs --only --auto-player-message-safety-check,--auto-auth-server-client-check --fail-fast --timeout-ms 180000` 通过 3/3（summary `.run/godot_auto_checks/2026-07-04T19-15-51-368Z_summary.json`）；`node tools/run_godot_auto_checks.mjs --only --auto-battle-command-timer-check,--auto-shop-check,--auto-equipment-check,--auto-equipment-synthesis-check,--auto-mailbox-check,--auto-chat-panel-check,--auto-player-rebirth-preview-check --fail-fast --timeout-ms 180000` 通过 8/8（summary `.run/godot_auto_checks/2026-07-04T19-16-15-848Z_summary.json`）。

### [x] 阶段 3：性能热路径治理

- [x] ~~任务标记/追踪器循环内重复 `normalize_profile` 收敛为“归一化一次、循环内复用”：`client/godot/scripts/main.gd` 的 `_refresh_quest_marker_cache_if_needed`（6831-6854）与 `client/godot/scripts/progression/player_progress_model.gd` 的 `quest_available_for_profile` / `quest_state_for_id`（3163、3285）增加接受已归一化档案的路径。~~
- [x] ~~战斗态 HUD 改为与世界态相同的签名 + 节流刷新（`main.gd:6479-6482`）。~~
- [x] ~~删除每帧空调用 `_update_battle_debug_window`。~~
- [x] ~~`_set_world_log_message` 触发的全量 `_layout_hud()` 改为 dirty 标记 + 节流（`panel_flow` 10987-11006）。~~
- [x] ~~验证：idle 与 moving 双基线 `--perf-probe`、`--movement-spam-click-check`，对比整顿前基线不得退化。~~

完成证据：`PlayerProgressModel` 的任务读接口支持 `profile_is_normalized=true`，任务 marker/tracker 热点复用一次归一化档案；战斗态 HUD 改走 `_update_world_hud_if_needed(delta)`，每帧空 `_update_battle_debug_window()` 已从 `_process()` 删除；`_set_world_log_message()` 改为 `world_log_layout_dirty` + `WORLD_HUD_REFRESH_INTERVAL_SECONDS` 合并布局。`git diff --check` 通过；`node tools/run_godot_auto_checks.mjs --only --auto-task-tracker-route-check,--auto-npc-quest-marker-check,--auto-rebirth-task-tracker-check,--auto-world-log-panel-check,--auto-battle-command-timer-check --fail-fast --timeout-ms 180000` 通过 6/6（summary `.run/godot_auto_checks/2026-07-04T19-23-37-813Z_summary.json`）。改前基线：idle 稳定段 `process_total≈0.21-0.33ms`，moving `≈0.12-0.23ms`，movement spam `max_input_us=156 coalesced=true settled=true`；改后：idle `≈0.15-0.30ms`，moving `≈0.11-0.23ms`，movement spam `max_input_us=144 coalesced=true settled=true`。

### [x] 阶段 4：持久化改造（MySQL 增量写）

- [x] ~~`server/node/src/mysql-store.js` 从“全表 `DELETE` + 全量 `INSERT`”改为脏实体跟踪 + 按实体 upsert/delete，事务包裹。~~
- [x] ~~顺带清理只写不读的 dead code（`insertPlayerPositionStatement` 等）。~~
- [x] ~~保持对外 store 接口不变。~~
- [x] ~~`auth-storage.test.js` 扩展增量写断言。~~
- [x] ~~控制 binlog 体积，降低本机磁盘风险。~~

完成证据：`mysql-store.js` 读取端改为从实体表拼回账号、档案、邮件、家族、庄园、战斗记录、battle trace、GM 授权与事件数据，并兼容旧 `server_state` 整档；保存端保留 store API，首次保存前读取现有实体快照，之后只对变化实体发 `ON DUPLICATE KEY UPDATE` / 单行 `DELETE`，`server_state` 仅写小元数据，运行态 `player_positions` / `battle_invites` / `battle_rooms` 不再写入。`node --check server/node/src/mysql-store.js && node --check server/node/test/auth-storage.test.js` 通过；`node --test server/node/test/auth-storage.test.js` 通过 9/9；`git diff --check` 通过；源码扫描未发现旧 `DELETE FROM accounts` / `DELETE FROM sessions` / 运行态 INSERT 语句。

### [x] 阶段 5：针对性结构整顿（不做整体大拆分）

- [x] ~~消灭复制漂移：`MAP_DATA_PATHS`、战斗网格常量提取为共享常量脚本。~~
- [x] ~~任务可接判定合并为 `PlayerProgressModel` 单一实现，`main` 的 marker 版与 `panel_flow` 的 tracker 版全部改为调用它。~~
- [x] ~~战斗/组队状态机稳固：把分散的 `setTimeout` 维护、WebSocket 连接态、各接口被动触发收敛到单一调度入口。~~
- [x] ~~写一页状态机文档：房间状态 × 连接状态 × 计时器。~~
- [x] ~~明确 `markBattleConnection` 的持久化策略。~~
- [x] ~~针对“多人同时掉线”“HTTP 活跃但 WS 断开”两个已知边界补测试。~~
- [x] ~~顺带修：切磋房间入场距离检查改用阶段 1 后的权威位置。~~

完成证据：新增 `MapDataCatalog` 与 `BattleLayoutConstants`，`main.gd` / `panel_flow_coordinator.gd` / `auto_check_coordinator.gd` 的地图与战斗网格常量改为共享来源；`PlayerProgressModel.first_available_unfinished_quest()` / `first_blocked_unfinished_quest()` 成为 marker/tracker 的单一任务判定入口；服务端新增 `applyBattleConnectionState()`，HTTP `getBattleState` 与 WebSocket open/close 统一走运行态连接入口，连接状态只保留在运行态 `battleRooms`，不落 auth store；新增 `docs/battle_party_state_machine.md` 记录房间状态、连接状态、计时器和边界。`node --check server/node/src/auth-service.js && node --check server/node/src/auth/battle-room.js && node --check server/node/test/auth-battle-room.test.js` 通过；`node --test --test-name-pattern "duel battle rooms require nearby settled positions|battle rooms preserve short reconnects|battle rooms close cleanly when both participants miss reconnect grace|party pve battle maintenance removes disconnected" server/node/test/auth-battle-room.test.js` 通过 4/4；`node tools/run_godot_auto_checks.mjs --only --auto-map-region-contract-check,--auto-battle-formation-check,--auto-task-tracker-route-check,--auto-npc-quest-marker-check,--auto-rebirth-task-tracker-check,--auto-pet-skill-training-check --fail-fast --timeout-ms 180000` 通过 7/7（summary `.run/godot_auto_checks/2026-07-04T19-45-20-870Z_summary.json`）；`git diff --check` 通过。

### [x] 阶段 6：回归内容迭代（好玩部分）

- [x] ~~按 `stoneage_gap_plan.md` 从 F1 剩余项继续：G1.3 扩展消耗品/任务道具。~~
- [x] ~~按 `stoneage_gap_plan.md` 从 F1 剩余项继续：G1.4 支线 NPC ×2 类。~~
- [x] ~~进入 F2 经济闭环：玩家交易、银行。~~
- [x] ~~内容与玩法系统均不涉及美术资产替换；宠物新形态沿用现有 `artPlan` 占位机制。~~

完成证据：新增一批原创消耗品、任务道具、福利/说书支线 NPC、仓库 NPC、服务端权威银行；玩家交易按验收反馈改为交易所买卖入口，默认 1% 税并支持 GM 配置默认税率与单物品税率；旧面对面交易接口仅保留兼容，不在普通 UI 展示；未改任何美术资产。`node -e` JSON 解析通过；`node --test server/node/test/auth-economy.test.js server/node/test/auth-storage.test.js server/node/test/auth-http-server.test.js` 通过；`node tools/run_godot_auto_checks.mjs --only --auto-market-panel-check,--auto-stage6-content-check --fail-fast --timeout-ms 180000` 通过；交易所截图 `.run/godot/market_panel00000003.png` 已走查。详见 `docs/phase_200_stage6_content_economy.md`。

## 验证与红线

- 每阶段：针对性服务端测试 + 相关 `--auto-*-check` 子集 + 性能对比基线，不跑全量 CI，除非用户要求。
- 行为保持：整顿阶段不改玩家可见文案语义；阶段 2 只把英文/错误码换成中文。
- 不动 `tasks.md` 已修复行为。
- DB 操作走 MCP server。
- 全程不碰美术资产。
