# Phase316：本人权威位置与在线隐私投影分离

## 玩家问题

- 真实 GM 账号登录后，点击可通行地面会出现黄色目标标记，但人物完全不移动，也没有玩家可理解的失败提示。
- Phase315 的自动检查从医旁记录点主动播种位置，因此没有覆盖“账号已有地图级在线位置后重新登录”的真实路径。

## 根因与边界

- 同地图在线列表允许只公开地图、不公开精确格子；服务端以 `publicPrecision=map` 保存这项对其他玩家的投影策略，同时仍保留账号内部精确移动锚点。
- 旧代码把同一隐私投影也用于登录 `runtimePosition`、请求者自己的位置回包和移动纠偏。`auth1373` 收到 `position_desync` 时只有地图、没有本人精确格子，客户端无法建立服务端移动 authority，目标路线因此停住。
- 本阶段不放松服务端位置校验、不公开其他玩家精确格子、不允许瞬移，也不改变碰撞、移动速度、队伍带队或遇敌规则。

## 实现

- 新增仅用于当前账号私有响应的精确位置投影：内部位置确有格子时，登录恢复、本人位置更新和移动失败纠偏始终返回 `hasCell=true / precision=cell`。
- 在线名册、位置事件、战斗观察者和其他账号看到的位置继续使用原有地图/AOI 隐私投影；`scope=map` 仍不会向旁观者泄露格子。
- 无精确锚点的地图级在线记录仍保持 `hasCell=false`，不会把占位 `(0,0)` 误当成权威位置。

## 验证

- `node --check server/node/src/auth-service.js`
- `node --test server/node/test/auth-social-world.test.js server/node/test/auth-http-server.test.js`
  - `68/68` 通过；覆盖本人 map-only 回包、重登恢复、`position_desync` 精确纠偏以及旁观者仍为地图级隐私。
- `node --test server/node/test/auth-auth-session.test.js server/node/test/auth-battle-room.test.js`
  - `83/83` 通过；覆盖登录替换、服务重启、战斗位置恢复与回记录点边界。
- `node tools/run_godot_auto_checks.mjs --only --auto-server-click-move-live-check --fail-fast --timeout-ms 180000`
  - Godot parse 与真实服务逐格移动 `2/2` 通过；日志 `.run/godot_auto_checks/2026-07-19T05-02-15-249Z.log`。
- 真实本地 MySQL 后端重启后，使用 Computer Use 登录 `auth1373`：
  - 登录恢复 `(10,17)`；
  - 第一次点击到 `(13,18)`，3 次逐格请求全部 HTTP 200；
  - 第二次点击到 `(14,21)`，另 3 次逐格请求全部 HTTP 200；
  - 无重试、无坐标拉回、无失败提示。
- 截图：`.run/evidence/phase316_owner_position_authority/01_login_10_17.png`、`02_move_13_18.png`、`03_move_14_21.png`。

## 玩家复验

无需再改账号或清理档案。关闭旧客户端后重新登录，连续点击两处可通行地面；人物应逐格抵达，右上角位置随移动更新。其他玩家的同地图列表仍只能知道地图，不会得到你的精确格子。
