# Phase186: MySQL Stdin Save And Pet Command Live Stability

本阶段修复真实 MySQL 联网服在数据增长后注册失败的问题，并把宠物快照/宠物指令 live check 调整为更贴近真实客户端的接房流程。

## 背景

真实 Godot 联网自测一度出现 `register=false`。进一步用 Godot POST 探针确认，请求已经打到 Node，但服务端返回 `server_error: MySQL 命令执行失败。`

根因是 MySQL store 把整份状态拼成一条很长的 SQL 后，通过 `mysql -e` 命令行参数传入。随着 `service_events`、battle room、profile 等文档变多，命令参数达到边界后，保存失败。

## 修复

- `server/node/src/mysql-store.js` 改为把 SQL 通过 stdin 传给 `mysql`，不再把大 SQL 放在 `-e` 参数里。
- MySQL 保存失败时增加只在失败路径触发的语句定位诊断，方便看到失败落在哪个表。
- 新增 Node 回归测试，用假的 `mysql` 可执行文件确认生成 SQL 走 stdin，且 argv 中没有 `-e`。
- `--auto-server-battle-pet-snapshot-live-check` 和 `--auto-server-battle-pet-command-live-check` 在 accept HTTP 返回 `room` 后，直接调用 `_apply_server_battle_room_state(room, true)`，避免只等 WebSocket 事件造成误判。
- 两个宠物 live check 结束时都会请求 `battle_room_leave`，避免自动测试留下 open 房间。

## 验证

```sh
cd server/node && npm test
node --check server/node/src/mysql-store.js
node --check server/node/test/auth-service.test.js
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-pet-command-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-pet-snapshot-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-return-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-online-position-live-check
```

真实 MySQL 服验证结果：

- Node 服务重启后运行在 `http://127.0.0.1:8787` 和局域网地址。
- Godot 注册 POST 恢复 HTTP 200。
- 宠物指令 live check 通过，宠物技能命中敌方宠物，宠物 HP 从 96 降到 73。
- 宠物快照 live check 通过，敌方攻击命中本方宠物，宠物 HP 从 70 降到 57。
- `battle_rooms` 当前没有 open 房间，最新 live check 房间以 `leave` 关闭。

## 下一步

1. 继续把道具、换宠、完整队伍 actor 命令服务器化。
2. 给 battle result 增加玩家可查的战斗回执，显示 HP 回写、记录点返回和后续奖励/惩罚摘要。
3. 给 MySQL 运维补一个只读检查脚本，避免手动 SQL 暴露密码或查错列名。
