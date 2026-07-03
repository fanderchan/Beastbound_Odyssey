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

1. Godot 导出：配置 macOS/Windows/Android 导出预设；移动端验证触控 UI（PC=移动同模板）；首包体积检查。
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
- [ ] 阶段 B 验收：测试全绿 + 用户确认

### 阶段 C
- [ ] C1 统一重试策略 + 战斗重连 UI
- [ ] C2 弱网防请求堆积 + pull 超时兜底
- [ ] C3 错误码全量中文文案映射
- [ ] 阶段 C 验收：测试全绿 + 用户确认

### 阶段 D
- [ ] D1 服务端测试按域拆分 + 并发/冲突用例
- [ ] D2 客户端全量自动检查一键脚本
- [ ] D3 本地 CI 脚本（测试+检查+基线）
- [ ] 阶段 D 验收：CI 全绿 + 用户确认

### 阶段 E
- [ ] E1 三平台导出预设 + 移动端触控走查
- [ ] E2 版本号显示 + 兼容窗口文档
- [ ] E3 GM/调试入口 release 闸门
- [ ] E4 资产审计清单
- [ ] E5 新手全链路走查报告
- [ ] 阶段 E 验收：可发布判定 + 用户确认
