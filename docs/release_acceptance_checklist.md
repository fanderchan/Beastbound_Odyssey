# 阶段 A-E 人工验收清单

适用版本：`67500fdc847d260f8dd1d378b2452b868d637fea` 或更新

这份清单用于你有空时统一验收 `release_plan.md` 的阶段 A-E。自动检查已经覆盖了大量细节，人工验收重点是：PC 正常玩家流程是否顺、中文文案是否干净、弱网/重登有没有卡死、剩余占位美术是否能接受。手机/平板只做未来兼容性记录，不作为当前 PC 发版阻塞项。

## 验收结论规则

验收通过时，告诉 Codex：

```text
阶段 A-E 统一验收通过，按 release_plan.md 打勾、提交并推送。
```

如果发现问题，尽量记录：

- 当前 commit。
- 你做了哪一步。
- 屏幕上看到的中文提示或异常现象。
- 是否能稳定复现。

阶段 B/C/D/E 在 `release_plan.md` 里仍未由你确认。不要因为本文档存在就直接视为验收通过。

## 0. 准备环境

在仓库根目录执行：

```sh
cd /Users/fander/projects/Beastbound_Odyssey
git status --short --branch
git pull --ff-only
```

期望：

- 当前分支是 `main`。
- 本地没有你不认识的改动。
- `HEAD` 至少是 `c8d38bbb` 或更新。

确认服务端：

```sh
npm run ops --prefix server/node -- status
```

如果没在运行：

```sh
npm run ops --prefix server/node -- start
```

确认健康检查：

```sh
curl -s http://127.0.0.1:8787/health
```

期望：

- `ok` 为 `true`。
- `storage.mode` 是 MySQL 相关模式。
- `protocolVersion` 为 `1`。
- 没有数据库连接错误。

## 1. 可选自动验证

如果你有时间，先跑一次完整本地 CI：

```sh
node tools/run_local_ci.mjs
```

期望：

- `Local CI summary` 显示 `passed=10 failed=0 total=10`。
- Godot 自动检查全过。
- 性能段全过。

如果你暂时不想等完整 CI，可以先参考已记录证据：

- `.run/local_ci/2026-07-03T07-35-59-454Z_summary.json`
- `.run/local_ci/2026-07-03T07-35-59-454Z.log`

## 2. 启动普通客户端

启动正常客户端：

```sh
godot --path client/godot --scene res://scenes/Main.tscn
```

期望：

- 看到登录/注册界面。
- 登录界面能看到 `版本 0.1.0`。
- 正常玩家入口不出现 GM 工具、QA 面板、numeric workbench、自动检查按钮或调试入口。
- 界面上没有英文错误码、raw debug id、agent/QA 专用文字。

注册一个新号：

- 用户名建议：`accept_你的日期_1`，例如 `accept_0703_1`。
- 密码至少 8 位。

期望：

- 注册成功后能进入世界。
- 世界加载后有正常 HUD 和任务提示。
- 如果用短密码注册，应看到中文失败提示，不应看到英文 code。

## 3. 阶段 A 验收：拆分后行为没变

阶段 A 主要是技术债拆分，人工重点不是看源码，而是确认玩家行为没被拆坏。

可快速检查结构：

```sh
wc -l client/godot/scripts/main.gd server/node/src/auth-service.js
ls client/godot/scripts/net/server_sync_coordinator.gd
ls client/godot/scripts/battle/server_battle_coordinator.gd
ls client/godot/scripts/ui/dialog_quest_coordinator.gd
ls client/godot/scripts/ui/panel_flow_coordinator.gd
ls server/node/src/auth/profile-actions.js server/node/src/auth/quest.js server/node/src/auth/mail-chat.js server/node/src/auth/party.js server/node/src/auth/battle-room.js
```

期望：

- `main.gd` 低于 15,000 行。
- 上面列出的拆分模块都存在。

手动检查：

- 在地图上连续点击移动，角色能正常寻路，镜头和跟随宠物不卡住。
- 和村内 NPC 对话，任务面板能打开和关闭。
- 打开背包、商店、地图、宠物、邮件、队伍等面板，布局没有明显错位。
- 进入一次野外遇敌或战斗，战斗能正常开始和结束。

通过标准：

- 拆分没有造成明显 UI/流程回归。
- 移动、NPC、任务、战斗、面板都能正常用。

## 4. 阶段 B 验收：服务端生产化

确认 MySQL 服务状态：

```sh
npm run ops --prefix server/node -- status
```

期望：

- `ok=true`。
- 本地 URL 是 `http://127.0.0.1:8787`。
- 数据库是 `beastbound_odyssey`。

注册/登录检查：

- 用新账号注册并登录。
- 退出客户端，再重新打开客户端。
- 用同一账号登录。

期望：

- 档案能从服务器读取。
- 进度、背包或任务状态不会因为重启客户端丢失。
- 密码不足 8 位时给中文提示。

服务端重启恢复检查：

```sh
npm run ops --prefix server/node -- restart
```

然后重新登录同一账号。

期望：

- 能重新进入游戏。
- 会话过期或需要重登时，客户端给中文引导，不静默失败。
- 服务器重启后不会把旧在线位置、旧战斗房间当成仍然有效的现场。

健康和协议检查：

```sh
curl -s http://127.0.0.1:8787/health
```

期望：

- 返回协议版本、服务端版本、存储检查、事件流摘要。
- 存储检查失败时应该是明确失败，不是玩家端卡死。

通过标准：

- 账号、档案、邮件/聊天等服务端状态能正常持久化。
- 没有把数据库凭据写进仓库。
- 协议不匹配、会话过期、密码策略等都能给玩家中文提示。

## 5. 阶段 C 验收：客户端网络健壮性

普通弱网体验：

1. 客户端登录进世界。
2. 停止服务端：

```sh
npm run ops --prefix server/node -- stop
```

3. 在客户端里尝试打开邮箱、队伍、聊天或触发一次需要服务器的操作。

期望：

- 客户端不会卡死。
- 看到中文网络失败、重连中或需要重登提示。
- 不出现 `session_expired`、`server_error`、`profile_upload_denied` 这类英文 code 上屏。

恢复检查：

```sh
npm run ops --prefix server/node -- start
```

回到客户端继续操作，必要时重新登录。

期望：

- 能恢复到可操作状态。
- 不需要杀掉客户端才能继续。
- 面板不会一直停在加载中。

移动和请求堆积检查：

- 连续快速点击地图不同位置 20-30 次。
- 打开地图、任务、商店、背包，再切回移动。

期望：

- 移动不会明显卡顿。
- UI 切换后没有请求堆积导致的长时间延迟。
- 异常提示仍然是中文。

通过标准：

- 断线、重连、失败提示都能被玩家理解。
- 弱网状态不会把客户端拖进不可恢复状态。

## 6. 阶段 D 验收：测试与 CI

完整验收建议跑：

```sh
node tools/run_local_ci.mjs
```

期望：

- `git-diff-check` 通过。
- 服务端测试通过。
- Godot 全量自动检查通过。
- idle / moving / movement spam / shop select / player stat spam 性能基线通过。

如果只想确认工具是否可用：

```sh
node tools/run_godot_auto_checks.mjs --list
node tools/run_godot_auto_checks.mjs --only --auto-auth-check,--auto-client-version-check,--auto-release-entrypoint-gate-check
```

期望：

- `--list` 能列出当前自动检查。
- 缩小范围的检查全部通过。

通过标准：

- 本地 CI 是一个命令可跑。
- 失败时有 summary/log 路径，方便定位。
- 性能结果没有明显比记录基线差。

## 7. 阶段 E 验收：发布工程

### 7.1 PC 窗口与可选移动兼容烟测

当前发布目标是 PC 版。这里先验收 PC 主窗口，不要求手机竖屏或超窄横屏达到完整可玩状态。

PC 主验收：

```sh
godot --path client/godot --scene res://scenes/Main.tscn
```

期望：

- 默认窗口约 1280x720。
- 登录、HUD、背包、商店、任务、地图、宠物、战斗目标选择在 PC 窗口内不明显重叠。
- 按钮尺寸能用鼠标模拟点击。
- 文字不被裁掉到无法理解。

可选未来兼容烟测，不作为 PC 发版阻塞项：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --preview-mobile
godot --path client/godot --scene res://scenes/Main.tscn -- --preview-phone-landscape
godot --path client/godot --scene res://scenes/Main.tscn -- --preview-mobile-portrait
```

`--preview-mobile` 是 1280x720 横屏兼容预览，`--preview-phone-landscape` 是 844x390，`--preview-mobile-portrait` 是 390x844。它们只用来发现未来移动端的大方向问题；如果整体观感很挤或不适合完整游玩，记录为后续手机适配待办，不阻止当前 PC 版验收。

### 7.2 版本显示和兼容文档

在登录界面和进入世界后的 HUD 看：

- 应显示 `版本 0.1.0`。
- 不应显示协议号、debug id 或内部字段。

可读文档：

- `README.md`
- `server/node/README.md`

期望：

- 版本号和协议兼容窗口有说明。
- 当前协议窗口是 `1..1`。

### 7.3 发布入口闸门

用 `godot --path ...` 从本机直接启动时，窗口标题可能显示 `(DEBUG)`，开发态也可能暴露 `GM` 等调试入口；这不是玩家 release 包。玩家发布入口以 release gate 自动检查和真正导出的 release 构建为准。

玩家 release 构建应满足：

- 不应看到 GM 工具入口。
- 不应看到 QA 面板。
- 不应看到 numeric workbench。
- 不应看到自动检查、性能探针、预览模式按钮。

自动验证可跑：

```sh
node tools/run_godot_auto_checks.mjs --only --auto-release-entrypoint-gate-check
```

期望：

- 输出通过。
- release gate 状态为 locked。

### 7.4 导出预设和包体积探针

快速导出数据包：

```sh
mkdir -p .run/export_probe/macos .run/export_probe/windows .run/export_probe/android
godot --headless --path client/godot --export-pack macOS ../../.run/export_probe/macos/BeastboundOdyssey.pck
godot --headless --path client/godot --export-pack "Windows Desktop" ../../.run/export_probe/windows/BeastboundOdyssey.pck
godot --headless --path client/godot --export-pack Android ../../.run/export_probe/android/BeastboundOdyssey.pck
ls -lh .run/export_probe/macos/BeastboundOdyssey.pck .run/export_probe/windows/BeastboundOdyssey.pck .run/export_probe/android/BeastboundOdyssey.pck
```

期望：

- 三个平台的 `.pck` 能生成。
- 体积在记录附近，之前三平台均约 `2,709,452 bytes`。

注意：完整 `--export-release` 需要本机安装 Godot 4.7 export templates；Android 还需要 Java SDK、Android SDK、`adb`、`apksigner`。如果这里只是缺导出模板或 Android SDK，记录为本机发布环境缺口，不一定是游戏代码验收失败。

### 7.5 资产审计

打开：

- `docs/asset_audit.md`

需要你做产品判断：

- 当前跟踪的外部运行时媒体资源为 0。
- 仍有 21 个 `placeholderPalette` 宠物形态占位。
- 其他玩家、地图、战斗、UI 表现仍以程序化/占位表现为主。

通过标准由你决定：

- 如果这是内部测试版或技术发布候选，可以接受占位美术。
- 如果这是面向玩家的公开首包，需要决定是否先补美术再发布。

## 8. 首次可玩链路验收

这是最重要的人工路线。建议用全新账号完整走一次。

1. 注册新账号并进入世界。
2. 跟随新手任务提示和 NPC 对话。
3. 完成购买、使用肉、装备武器/防具等新手目标。
4. 进入草丛区域触发野外遇敌。
5. 完成一场战斗。
6. 尝试捕捉宠物。
7. 查看捕捉结果：队伍未满时进队伍，队伍满时进兽栏，并且提示是中文。
8. 打开宠物、背包、任务、地图、商店、邮件、聊天、队伍面板，确认都能关闭回到世界。
9. 继续走到人物转生试炼入口，确认转生提示可理解。
10. 如果时间足够，完成一次人物转生和一次宠物 MM 转生。

期望：

- 新账号从注册到可玩没有卡死点。
- 任务引导能让你知道下一步做什么。
- 战斗、捕捉、奖励、转生反馈都是中文。
- 没有英文错误码或调试文案。
- 你觉得操作手感能接受。

## 9. 双客户端联机验收

这一步用于验收组队、聊天、在线位置、切磋房间和服务端回合。

开两个独立 userdata 的客户端，避免两个窗口抢同一份本地登录缓存：

```sh
mkdir -p .run/manual_acceptance/player1 .run/manual_acceptance/player2
godot --path client/godot --user-data-dir .run/manual_acceptance/player1 --scene res://scenes/Main.tscn
godot --path client/godot --user-data-dir .run/manual_acceptance/player2 --scene res://scenes/Main.tscn
```

窗口 1 登录账号 A，窗口 2 登录账号 B。

检查：

- 两个角色都在线。
- A 能搜索或看到 B。
- A 邀请 B 组队，B 能接受。
- 队伍面板显示成员正确。
- 附近聊天或队伍聊天能收发。
- 两人站在合适距离时，发起切磋邀请。
- 接受切磋后进入房间，双方能提交一回合指令。
- 回合结果播放后能返回世界。
- 离队后队伍状态清理正常。

期望：

- 组队、聊天、切磋都不依赖本地假数据。
- 房间关闭、离队、返回世界不残留错误状态。
- 若中途断线，客户端用中文提示重连或重登。

## 10. 最终通过标准

可以判定 A-E 通过的最低标准：

- 本地 CI 通过，或接受已记录的 E 阶段全量 CI 证据。
- 新账号首玩链路能从注册走到战斗、捕捉、基础面板、至少一次服务端保存。
- 弱网/停服/重登不会把客户端卡死。
- 双客户端至少完成组队或切磋其中一条联机链路；完整验收建议两条都测。
- PC 正常窗口没有明显布局阻断；手机/平板预览只作为非阻塞兼容记录。
- 普通玩家看不到 GM/QA/numeric/debug/auto 入口。
- 你接受 `docs/asset_audit.md` 记录的占位资产状态，或者明确决定发布前还要补美术。

如果以上都满足，就可以让我把 `release_plan.md` 的阶段 B/C/D/E 验收项打勾并提交推送。
