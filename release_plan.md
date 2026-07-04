# Beastbound Odyssey — 发布前迭代计划（release_plan.md）

> 执行者说明：本计划由 Codex 按阶段顺序执行。tasks.md 中 32 条 bug 已全部修复，**不要重复检查它们**。
> 严格遵守 AGENTS.md（小步迭代、每阶段停下等用户确认、性能基线对比、中文 UI、禁止直接复制 StoneAge 资产）。
>
> 每次开新会话时：先看本文件的「进度追踪」和 `git log`，确定当前位置，再继续下一个未完成任务。
> 每完成一个任务：在进度追踪里把 `[ ]` 改成 `[x]`，并附一行完成证据（测试/检查/基线结果摘要）。
> 每完成一个阶段：跑服务端测试 + Godot 全量自动检查 + `--perf-probe` 空闲/移动双基线，给出证据摘要，**停下等用户确认**再进下一阶段。

## 阶段 A：main.gd 拆分（最高优先级技术债）

main.gd 已超过 45,000 行，违反项目规则。渐进拆分，每次一个域、一次提交、行为零变化。

- 先拆纯逻辑域，建议顺序：
  1. 服务器同步（profile sync / hang session / quest record 队列）→ `scripts/net/`
  2. 战斗指令提交与服务器房间状态机 → `scripts/battle/`
  3. 对话 / 任务 UI 流 → `scripts/ui/`
- 每拆一个域，用现有自动检查回归（`--auto-*-check` 全套），确认输出与拆分前一致。
- 拆分期间禁止顺手改逻辑或重命名玩家可见文案。
- 目标：main.gd 降到 15,000 行以下，只保留场景编排和信号接线。
- `auth-service.js`（14,000+ 行）同样拆：battle-room、profile-actions、quest、party、mail/chat 各自成模块，保持 `createAuthService` 对外接口不变，测试全绿。

## 阶段 B：服务端生产化

1. 认证加固：登录/注册按 IP+账号加速率限制与失败退避；密码最短 8 位（老账号登录时提示改密，不强制锁死）；会话 token 过期后支持无感刷新。
2. 存储层：把 http-server.js 默认存储从 JSON 文件切到 mysql-store.js（MySQL 9.7），JSON store 仅保留给测试；写路径改异步，去掉事件循环上的同步整文件写；账号/档案/邮件/聊天持久化，战斗房间/位置保持内存。凭据走环境变量，不进 git。数据库操作通过 MCP server 执行。
3. 崩溃恢复：服务重启后会话与在线状态的恢复策略；客户端收到 session_expired 时引导重登而不是静默失败。
4. 协议版本：客户端请求带 clientVersion，服务端带 protocolVersion，不匹配时返回明确的升级提示；为后续热更留字段。
5. 可观测性：结构化日志（请求耗时、战斗结算、档案写回、skippedProfiles）+ /health 扩展为带存储连通性检查。

## 阶段 C：客户端网络健壮性

1. 断线重连：HTTP 失败统一重试策略（指数退避、幂等请求可重试、非幂等提示玩家）；战斗中断线利用已有 BATTLE_RECONNECT_GRACE 恢复房间，给玩家「重连中」UI。
2. 弱网表现：位置同步/事件流在高延迟下不堆积请求；档案 pull 延迟应用逻辑（面板打开时）补充超时兜底。
3. 客户端错误呈现：所有服务端 fail code 映射为中文玩家文案，杜绝英文 code 或调试字符串上屏。

## 阶段 D：测试与 CI

1. 服务端：把 5,800 行单测试文件按域拆分；补 battle-room 并发（两人同回合提交、超时、离开竞态）与档案 revision 冲突的针对性用例。
2. 客户端：现有 `--auto-*-check` 整理成一个可一键跑全量的脚本（headless），输出汇总表。
3. 建一个最小 CI 脚本（本地可跑）：服务端测试 + 客户端全量自动检查 + 性能基线比对，任何阶段提交前必须绿。

## 阶段 E：发布工程

1. Godot 导出：配置 macOS/Windows/Android 导出预设；当前发版目标优先 PC 桌面版，移动端只保留未来兼容性烟测，不作为当前发版阻塞项；首包体积检查。
2. 版本与更新：客户端显示版本号；服务器兼容窗口策略写进 README。
3. 内容闸门：GM 工具、numeric workbench、qa panel、所有 `--auto`/`--preview` 入口在 release 构建里默认关闭（编译开关或启动参数白名单），玩家构建不可达。
4. 资产审计：按项目规则输出资产清单（来源/所有权/替换路径），标出仍是占位符的项。
5. 首次可玩性走查：新账号从注册→新手引导→草丛→捕捉→组队→切磋→转生的完整链路，记录所有卡点和文案问题成清单。

## 全程红线

- 每阶段小步提交，提交信息说明动机；不要一次巨型 diff。
- 性能：空闲 CPU 个位数、process_total 亚毫秒（ps + 脚本探针双确认），拆分/改造后必须复测。
- 不新增玩家可见的英文/调试文案；不改动 tasks.md 已修复项的行为，除非测试证明有回归。
- 遇到需要产品决策的点（如密码策略对老账号的处理、导出平台优先级），停下来问用户，不要自作主张。

---

## 进度追踪

> 完成一项就打勾并附证据摘要。新会话从第一个未打勾项继续。

### 阶段 A
- [x] A1 拆分服务器同步域 → scripts/net/
  - 证据（2026-07-02）：新增 `client/godot/scripts/net/server_sync_coordinator.gd`，`main.gd` 降至 44,815 行；`godot --headless --path client/godot --quit`、`--auto-server-profile-sync-check`、`--auto-quest-chain-check`、`--auto-quest-reward-choice-check`、`--auto-hang-settings-check`、`--auto-hang-loop-closure-check`、`--auto-hang-supply-closure-check` 均为 `status=ok`。
- [x] A2 拆分战斗指令/房间状态机 → scripts/battle/
  - 证据（2026-07-03）：新增 `client/godot/scripts/battle/server_battle_coordinator.gd`，`main.gd` 降至 43,995 行；`git diff --check`、`godot --headless --path client/godot --quit`、`npm test --prefix server/node`（76/76）通过；`--auto-server-battle-stale-room-check`、`--auto-server-battle-return-check`、`--auto-battle-room-live-check`、`--auto-server-battle-turn-live-check`、`--auto-server-battle-reconnect-live-check`、`--auto-server-battle-close-live-check`、`--auto-server-battle-leave-ui-live-check`、`--auto-server-battle-target-mapping-check`、`--auto-battle-command-timer-check`、`--auto-server-battle-pet-snapshot-live-check`、`--auto-server-battle-pet-command-live-check`、`--auto-server-battle-switch-pet-live-check`、`--auto-server-battle-item-live-check`、`--auto-server-solo-pve-live-check`、`--auto-server-party-pve-sync-live-check` 均为 `status=ok`，turn/reconnect live 覆盖玩家+宠物 4 actor 指令回合。
- [x] A3 拆分对话/任务 UI 流 → scripts/ui/
  - 证据（2026-07-03）：新增 `client/godot/scripts/ui/dialog_quest_coordinator.gd`，`main.gd` 降至 43,439 行；`git diff --check`、`godot --headless --path client/godot --quit` 通过；`--auto-npc-interaction-check`、`--auto-facility-dialog-options-check`、`--auto-quest-ui-check`、`--auto-quest-reward-choice-check`、`--auto-quest-chain-check`、`--auto-quest-equipment-reward-check`、`--auto-task-tracker-route-check`、`--auto-record-point-check`、`--auto-rebirth-task-tracker-check`、`--auto-npc-quest-marker-check`、`--auto-facility-marker-check`、`--auto-player-interaction-live-check` 均为 `status=ok`。
- [x] A4 main.gd 降到 15,000 行以下
  - 证据（2026-07-03）：新增 `client/godot/scripts/ui/panel_flow_coordinator.gd`，搬出 HUD/认证/面板/地图/宠物/队伍/邮箱/自动设置等高体量流，`main.gd` 降至 13,199 行；`git diff --check`、`godot --headless --path client/godot --quit` 通过；`--auto-auth-check`、`--auto-backpack-check`、`--auto-backpack-world-use-check`、`--auto-shop-check`、`--auto-pet-management-check`、`--auto-pet-stable-check`、`--auto-mailbox-check`、`--auto-party-live-check`、`--auto-quest-ui-check`、`--auto-battle-settings-check`、`--auto-capture-settings-check`、`--auto-hang-settings-check`、`--auto-movement-check`、`--auto-mouse-click-check`、`--auto-pathfinding-check`、`--auto-npc-interaction-check`、`--auto-map-transfer-check`、`--auto-encounter-check`、`--auto-battle-check`、`--auto-battle-command-timer-check`、`--auto-pet-drop-pickup-check`、`--auto-pet-codex-detail-check`、`--auto-map-panel-check`、`--auto-qa-panel-check`、`--auto-record-point-check`、`--auto-task-tracker-route-check`、`--auto-training-partner-check` 均退出码 0，路径检查输出 `status=ok`、挂机设置输出 `status=ok`。
- [x] A5 auth-service.js 模块化拆分，测试全绿
  - 证据（2026-07-03）：新增 `server/node/src/auth/profile-actions.js`、`quest.js`、`mail-chat.js`、`party.js`、`battle-room.js` 五个域模块，`createAuthService` 对外方法名保持不变，`server/node/src/auth-service.js` 降至 13,153 行；`git diff --check` 通过；`npm test --prefix server/node` 通过（76/76）。
- [x] 阶段 A 验收：全量自动检查 + 性能双基线 + 用户确认
  - 证据（2026-07-03）：用户已确认继续进入 release_plan 下一项；`npm test --prefix server/node` 通过（76/76），`godot --headless --path client/godot --quit` 与 `git diff --check` 通过；最终全量 Godot 自动检查 `.run/stage_a_godot_auto_checks_full2.log` 覆盖 183/183，汇总 `passed_count=183 failed=null elapsed=1135.03s`；idle `--perf-probe` headless 对照 `ps` 为 1.4/1.5/1.8% 且 `process_total≈0.30-0.38ms`，GUI 窗口对照 `ps≈35.7-36.8%` 但 `process_total≈0.23-0.40ms`（定位为窗口渲染层成本而非脚本热路径）；moving `--movement-perf-check --perf-probe` 通过，`ps` 为 4.3/3.4%，`process_total≈0.26-0.33ms`；真实输入 `--movement-spam-click-check --perf-probe` 通过，360 次点击合并为 19 次路径应用，`avg_input_us=35 max_input_us=204`。

### 阶段 B
- [x] B1 认证速率限制/失败退避/密码策略/会话刷新
  - 证据（2026-07-03）：服务端新增登录/注册按 IP+账号的速率限制与失败退避，新注册密码最短 8 位，旧密码策略账号登录返回 `passwordUpgradeRequired` 提示但不锁号，`POST /auth/refresh` 支持过期宽限期内换新 token；`git diff --check` 通过，`npm test --prefix server/node` 通过（81/81），`godot --headless --path client/godot --quit` 通过；`--auto-auth-server-client-check` 输出 `status=ok refresh=true`，`--auto-server-auth-contract-check` 输出 `status=ok endpoints=true`，本地服务下 `--auto-auth-server-live-check` 输出 `status=ok auth=true sync=true account_panel=true`，复跑 `--auto-auth-check` 输出 `status=ok`。
- [x] B2 默认存储切 MySQL，写路径异步化
  - 证据（2026-07-03）：`createDefaultStore()` 默认切到 MySQL，并用异步写队列包装 `mysql-store.js`；`BEASTBOUND_AUTH_STORE=json` 才启用 JSON 测试存储，JSON store 增加 `saveAsync`；MySQL 保存层强制清空 `playerPositions`、`battleInvites`、`battleRooms`，账号/会话/档案/邮件/聊天/战斗记录/GM/认证事件持久化；README 已更新默认存储与 `/auth/refresh`；`git diff --check`、`node --check server/node/src/mysql-store.js server/node/src/http-server.js server/node/src/auth-service.js` 通过；`npm test --prefix server/node` 通过（83/83，含 fake mysql 默认存储与异步 flush 测试）；`godot --headless --path client/godot --quit`、`--auto-auth-server-client-check`、`--auto-server-auth-contract-check` 均为 `status=ok`。
- [x] B3 崩溃恢复与 session_expired 引导
  - 证据（2026-07-03）：服务端新增进程内活跃 session 集合，重启后持久 token 可通过 `getSession` 恢复并返回 `recovered/requiresPositionResync`，在线位置、战斗邀请、战斗房间仍为运行时态且不会从存储恢复；新增 `server restart recovers sessions without stale online positions` 回归用例；客户端新增 `session_expired/session_refresh_expired/session_revoked/session_missing` 统一判定，profile sync、移动/在线、战斗、队伍、聊天、邮箱、商店、装备、转生等失败分支收到会话失效会切回登录并保留用户名；`git diff --check`、`godot --headless --path client/godot --quit` 通过，`npm test --prefix server/node` 通过（84/84），`--auto-server-profile-sync-check` 输出 `status=ok ... session_expired=true`，`--auto-auth-server-client-check` 输出 `status=ok refresh=true`。
- [x] B4 协议版本协商
  - 证据（2026-07-03）：新增 `server/node/src/protocol.js` 统一 `PROTOCOL_VERSION=1`、客户端协议范围、`serverVersion` 与预留 `hotUpdate` 字段；非 `/health` HTTP 请求缺失或不兼容 `X-Beastbound-Client-Version` / `X-Beastbound-Protocol-Version` 时返回 HTTP 426 与中文升级提示，所有 JSON 响应自动带 `protocolVersion` 等元数据；WebSocket `/events` 也校验 `clientVersion/clientProtocolVersion` query，`events.ready` 带协议元数据；Godot `ServerAuthClientModel` 所有请求统一加版本 header，事件流 URL 加协议 query，并解析不兼容响应；README 已记录协议边界；`git diff --check`、`godot --headless --path client/godot --quit` 通过，`npm test --prefix server/node` 通过（85/85，含 426 mismatch 测试），`--auto-auth-server-client-check` 输出 `status=ok ... protocol=true`，`--auto-server-auth-contract-check` 输出 `status=ok endpoints=true`。
- [x] B5 结构化日志 + /health 扩展
  - 证据（2026-07-03）：`createHttpServer` 新增可注入结构化 logger，`BEASTBOUND_STRUCTURED_LOGS=1` 可输出 JSON lines；记录 `http.request`（method/path/statusCode/durationMs）、`profile.writeback`（profileRevision/storageMode/serverAuthority）和 `battle.settlement`（reason/battleRecordId/profileWritebackCount/skippedProfiles）；`/health` 扩展为协议元数据 + `storage` 轻量 `store.load()` 连通性检查 + `eventStream.clients`，存储失败返回 503；memory/json/mysql/async store 标注 mode；README 已记录日志和 health 字段；`git diff --check`、`node --check server/node/src/http-server.js server/node/src/auth-service.js server/node/src/mysql-store.js server/node/test/auth-service.test.js` 通过，`npm test --prefix server/node` 通过（85/85，含 health storage 与结构化日志断言），`godot --headless --path client/godot --quit`、`--auto-server-auth-contract-check`、`--auto-auth-server-client-check` 均为 `status=ok`。
- [x] 阶段 B 验收：测试全绿 + 用户确认
  - 证据（2026-07-04）：用户确认已完成验收并要求直接打勾；B1-B5 开发项均已有 `npm test --prefix server/node`、Godot headless/自动检查证据。

### 阶段 C
- [x] C1 统一重试策略 + 战斗重连 UI
  - 证据（2026-07-03）：客户端 `_auto_http_request_spec` 接入统一指数退避，默认 GET/幂等请求可重试、POST/非幂等请求不自动重试并返回中文网络失败提示；服务器战斗轮询失败会进入「网络不稳定，重连中。」状态，状态恢复成功后清除 reconnect 标记；`git diff --check`、`godot --headless --path client/godot --quit` 通过；`--auto-auth-server-client-check` 输出 `status=ok retry=true network=true reconnect_ui=true`；本地服务下 `--auto-server-battle-reconnect-live-check` 输出 `status=ok register=true positions=true room=true state=true visible=true actors=true turn=true playback=true hp_sync=true`；`npm test --prefix server/node` 通过（85/85）。
- [x] C2 弱网防请求堆积 + pull 超时兜底
  - 证据（2026-07-03）：在线位置同步在请求 pending 时只保留最新 payload，完成后最多补发最后一次；事件流直接重连遵守 closed/error 冷却，避免重复 connect；服务器档案 pull 结果在面板打开时延后应用，并新增 8 秒超时兜底且不打断商店/装备/任务等写操作；`git diff --check`、`godot --headless --path client/godot --quit` 通过；`--auto-auth-server-client-check` 输出 `status=ok weak_queue=true event_cooldown=true`；`--auto-server-profile-sync-check` 输出 `status=ok panel_defer=true panel_timeout=true`；本地服务下 `--auto-online-position-live-check`、`--auto-server-event-live-check`、`--auto-server-event-replay-live-check` 均为 `status=ok`；`--movement-spam-click-check` 输出 `status=ok coalesced=true settled=true`；`--perf-probe` 稳定段 `process_total` 约 0.25-0.52ms、`server_event` 约 0.01ms、`timed_profile` 约 0.04-0.09ms；`npm test --prefix server/node` 通过（85/85）。
- [x] C3 错误码全量中文文案映射
  - 证据（2026-07-03）：客户端 `ServerAuthClientModel` 新增错误码中文文案兜底，保留服务端中文细节，缺失/英文/debug message 会按 code 或领域前缀映射为中文，覆盖服务端抽取的 159 个 fail code 以及本地网络/session 码；`git diff --check`、`godot --headless --path client/godot --quit` 通过；`--auto-auth-server-client-check` 输出 `status=ok code_map=true`，验证 code-only、英文 `server_error` 与中文动态细节保留；`--auto-server-profile-sync-check` 输出 `status=ok session_expired=true panel_timeout=true`；`npm test --prefix server/node` 通过（85/85）。
- [x] 阶段 C 验收：测试全绿 + 用户确认
  - 证据（2026-07-04）：用户确认已完成验收并要求直接打勾；C1-C3 开发项均已有网络重试/弱网/错误码中文映射自动检查与服务端测试证据。

### 阶段 D
- [x] D1 服务端测试按域拆分 + 并发/冲突用例
  - 证据（2026-07-03）：原 `server/node/test/auth-service.test.js` 拆为 `auth-storage`、`auth-auth-session`、`auth-profile-actions`、`auth-social-world`、`auth-battle-room`、`auth-quest-hang`、`auth-http-server` 7 个域测试文件，并抽出 `server/node/test-support/auth-service-test-context.js`；新增 `profile revision conflicts keep the newer server profile intact`、`duel battle rooms resolve near-concurrent round commands once`、`duel battle room timeout and leave race closes idempotently` 三个冲突/竞态用例；`git diff --check`、`node --check server/node/test-support/auth-service-test-context.js server/node/test/auth-*.test.js` 通过，`npm test --prefix server/node` 通过（88/88）。
- [x] D2 客户端全量自动检查一键脚本
  - 证据（2026-07-03）：新增 `tools/run_godot_auto_checks.mjs`，从 `client/godot/scripts/main.gd` 自动发现 183 个 `--auto-*-check`，支持 `--list`、`--only`、`--exclude`、`--from`、`--max`、`--fail-fast`、`--no-parse`，并对 `--auto-startup-login-check` 自动预注册启动登录账号；`docs/testing.md` 已记录入口；`node --check tools/run_godot_auto_checks.mjs`、`node tools/run_godot_auto_checks.mjs --list`（183 项）通过；全量 `node tools/run_godot_auto_checks.mjs` 通过（184/184，含 `godot-parse` + 183 个自动检查，`failed=0`，耗时 1,217,965ms，summary `.run/godot_auto_checks/2026-07-03T03-45-59-283Z_summary.json`）。
- [x] D3 本地 CI 脚本（测试+检查+基线）
  - 证据（2026-07-03）：新增 `tools/run_local_ci.mjs`，默认串起 `git diff --check`、脚本语法检查、`npm test --prefix server/node`、`tools/run_godot_auto_checks.mjs` 全量客户端检查，以及 idle / moving / movement spam / shop select / player stat spam 性能基线；`docs/testing.md` 已记录入口；为稳定 D3 长跑，将 `--auto-battle-feedback-check` 固定命中反馈目标、`--auto-battle-auto-10v10-check` 改为以实际自动战斗事件覆盖连击/NPC盟友、`--auto-online-position-live-check` 隔离到等级草丛试验场唯一格子，避免随机闪避、预演随机连击和历史在线账号污染；完整 `node tools/run_local_ci.mjs` 通过（10/10，`failed=0`，服务端 88/88，Godot auto 184/184，耗时 1,292s，summary `.run/local_ci/2026-07-03T04-45-59-930Z_summary.json`；idle `process_total` median/p95 `0.31/0.37ms`，moving `0.25/0.30ms`，movement spam `max_input_us=146 coalesced=true settled=true`，shop `item_us=34334 equipment_us=63734`，player stat spam `elapsed_ms=0.58 refresh_count=2`）。
- [x] 阶段 D 验收：CI 全绿 + 用户确认
  - 证据（2026-07-04）：用户确认已完成验收并要求直接打勾；D3 完整 `node tools/run_local_ci.mjs` 已通过 10/10（summary `.run/local_ci/2026-07-03T04-45-59-930Z_summary.json`）。

### 阶段 E
- [x] E1 三平台导出预设 + 移动兼容烟测（非阻塞）
  - 证据（2026-07-03）：新增 Godot `export_presets.cfg`，配置 macOS/Windows Desktop/Android 三个 release 预设，并在 `project.godot` 启用 ETC2/ASTC 导入；新增 `--preview-mobile` 844x390、`--preview-mobile-portrait` 390x844 和 `--qa-viewport=宽x高` 预览尺寸入口，`--auto-mobile-touch-check` 覆盖触屏移动、背包/商店/任务/地图小屏边界、10v10 战斗触摸选敌；为手机横屏压缩面板详情/地图预览最小高度，地图贴图忽略原始尺寸并延迟回写布局，地图标记按钮省略号裁剪；`godot --headless --path client/godot --quit`、`git diff --check` 通过，`node tools/run_godot_auto_checks.mjs --only --auto-mobile-touch-check` 通过（2/2，summary `.run/godot_auto_checks/2026-07-03T07-07-17-435Z_summary.json`），默认视口、390x844、844x390 三条触控检查均 `status=ok phone=true/false panels=true/true/true/true battle_touch=true`；三平台 `--export-pack` 均通过，PCK 包体积均 `2,709,452 bytes`；完整 `--export-release` 已到发布机依赖检查：macOS 缺 `4.7.stable/macos.zip`，Windows 缺 `windows_debug_x86_64.exe`/`windows_release_x86_64.exe`，Android 缺 `android_debug.apk`/`android_release.apk` 以及 Java SDK、Android SDK platform-tools/build-tools、`adb`、`apksigner`。
  - 修正（2026-07-03）：`--preview-mobile` 使用 1280x720，与 PC 主窗口同宽同模板；新增 `--preview-phone-landscape` 保留 844x390 作为极限小屏压力检查，`--preview-mobile-portrait` 390x844 仅用于发现完全不可点/出界/不可读问题，不作为当前 PC 版完整可玩性验收主路径；`godot --headless --path client/godot --quit` 通过，`--preview-mobile --auto-mobile-touch-check` 输出 `status=ok viewport=(1280.0, 720.0)`，`--preview-phone-landscape --auto-mobile-touch-check` 与 `--preview-mobile-portrait --auto-mobile-touch-check` 均为压力检查 `status=ok`，`node tools/run_godot_auto_checks.mjs --only --auto-release-entrypoint-gate-check` 通过（2/2，summary `.run/godot_auto_checks/2026-07-03T09-37-42-599Z_summary.json`）。
  - 发版目标调整（2026-07-03）：当前验收和后续开发优先 PC 桌面版；手机/平板兼容性只做非阻塞烟测和风险记录，除非用户重新指定移动端优先级，否则不再为手机竖屏、超窄横屏、触屏专属流程或移动端打包投入工程任务。
- [x] E2 版本号显示 + 兼容窗口文档
  - 证据（2026-07-03）：客户端登录面板和顶部 HUD 新增 `版本 0.1.0` 显示，文本来自 `ServerAuthClientModel.CLIENT_VERSION`，同一常量继续写入 `X-Beastbound-Client-Version` 与 WebSocket `clientVersion`；新增 `--auto-client-version-check` 覆盖 HUD 标签、登录面板标签、HTTP headers、WS query 和协议号；根 `README.md` 与 `server/node/README.md` 写明构建版本与协议版本分离、当前服务端兼容窗口 `1..1`、破坏 HTTP/WS/存档交互时才提升协议并调整 `MIN_CLIENT_PROTOCOL_VERSION` / `MAX_CLIENT_PROTOCOL_VERSION`、不兼容返回 HTTP `426` 与预留 `hotUpdate`；`godot --headless --path client/godot --quit`、`git diff --check` 通过，`node tools/run_godot_auto_checks.mjs --only --auto-client-version-check` 通过（2/2，summary `.run/godot_auto_checks/2026-07-03T07-15-41-487Z_summary.json`），390x844 竖屏手跑输出 `status=ok hud_label=true auth_label=true text=版本 0.1.0 headers=true query=true protocol=1`。
- [x] E3 GM/调试入口 release 闸门
  - 证据（2026-07-03）：新增 release/dev-tools 统一闸门，普通 release 构建在未显式带 `beastbound_dev_tools` feature 时会忽略 `--auto-*`、`*-check`、`*-preview`、`*-demo`、`*-test`、`--perf-probe`、`--numeric-experiment-report`、`--gm-10v10-map`、`--qa-viewport*`、`--battle-debug-window`、`--server-step-world-move` 等入口，且不触发自动 GM 登录；GM/QA/numeric workbench UI 入口和 GM 命令在 release 锁定下返回不可达，三平台 release preset 维持 `custom_features=""`；`godot --headless --path client/godot --quit` 与 `git diff --check` 通过；`node tools/run_godot_auto_checks.mjs --only --auto-release-entrypoint-gate-check` 通过（2/2，summary `.run/godot_auto_checks/2026-07-03T07-27-29-329Z_summary.json`，输出 `status=ok locked=true parser=true dev_args=true gm_hidden=true qa_blocked=true numeric_blocked=true command_blocked=true presets_locked=true`）；开发态回归 `node tools/run_godot_auto_checks.mjs --only --auto-qa-panel-check,--auto-numeric-workbench-check` 通过（3/3，summary `.run/godot_auto_checks/2026-07-03T07-27-41-744Z_summary.json`，QA/numeric 均 `status=ok`）。
- [x] E4 资产审计清单
  - 证据（2026-07-03）：新增 `docs/asset_audit.md`，按来源/所有权/占位状态/替换路径列出当前运行时资产：跟踪的外部媒体资源为 0，Godot 场景 3 个，地图 JSON 25 个，`pet_templates.json` 中仍有 21 个 `placeholderPalette` 宠物形态占位；清单明确 `.run/`、`.godot/`、导出包和本地截图/录像不属于运行时资产，并记录 StoneAge/SA80 art 目前未进入跟踪运行时资源；`git diff --check`、`godot --headless --path client/godot --quit` 通过，审计统计命令输出 `tracked_external_media=0 scenes=3 map_json=25 placeholder_palettes=21`。
- [x] E5 新手全链路走查报告
  - 证据（2026-07-03）：新增 `docs/release_playability_walkthrough.md`，记录新账号注册/启动登录→新手任务链→草丛遇敌→捕捉与队伍/兽栏反馈→组队邀请/接受/离队→切磋房间与服务端回合→人物转生试炼→宠物 MM 转生的首玩走查；本地 MySQL 服务 `npm run ops --prefix server/node -- status` 为 `ok=true`，`node tools/run_godot_auto_checks.mjs --only --auto-auth-server-live-check,--auto-startup-login-check,--auto-quest-chain-check,--auto-encounter-check,--auto-battle-capture-check,--auto-pet-capture-feedback-check,--auto-party-live-check,--auto-battle-room-live-check,--auto-server-battle-turn-live-check,--auto-player-rebirth-execute-check,--auto-rebirth-trial-execute-check,--auto-pet-rebirth-mm-check` 通过（13/13，summary `.run/godot_auto_checks/2026-07-03T07-32-26-346Z_summary.json`）；报告记录自动链路未发现阻断或英文/调试文案上屏，保留人工验收关注项：本地库历史测试账号噪音、headless 无法替代手感/视觉验收、E4 剩余占位美术是否满足发行定位。
- [x] 阶段 E 验收：可发布判定 + 用户确认
  - 证据（2026-07-04）：用户确认已完成验收并要求直接打勾；阶段 E 开发项完成后已执行 `node tools/run_local_ci.mjs` 全量验证，通过 10/10（summary `.run/local_ci/2026-07-03T07-35-59-454Z_summary.json`，log `.run/local_ci/2026-07-03T07-35-59-454Z.log`）；其中 Godot 自动检查通过 187/187（summary `.run/local_ci/2026-07-03T07-35-59-454Z_godot_auto/2026-07-03T07-36-03-382Z_summary.json`），性能基线 `perf-idle` process_total median=0.410ms p95=0.450ms、`perf-moving` median=0.330ms p95=0.370ms、`perf-movement-spam` max_input_us=171 且 coalesced=true/settled=true，`perf-shop-select` 与 `perf-player-stat-spam` 均通过。
