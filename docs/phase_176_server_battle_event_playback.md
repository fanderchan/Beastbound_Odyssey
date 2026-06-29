# Phase176：服务器战斗事件接入共享 N vs N 播放

本阶段把服务器 `battle_event_list` 接入 Godot 现有战斗事件队列。客户端不再只静态同步联网切磋 HP，而是把服务器结算出的 `basic_attack` / `defend` / `target_missing` 转换成同一套本地播放事件，沿用 PC/移动共享战斗模板。

## 目标

- 以 N vs N 为唯一战斗模型：1v1 只是最小联网烟测，10v10 是满编压力/布局验证。
- `ServerBattleRoomModel` 根据当前账号所在服务器阵营，把 server actors 映射到本地 ally/enemy 阵营和 10 格容量站位。
- 服务器 `battle_event_list` 转换为本地 `attack` / `defend` / `target_missing` 事件。
- 播放前按 `hpBefore` 回到事件起点，播放后按服务器 actor 快照校准 HP。
- HTTP 指令响应和 WebSocket `battle.turn_resolved` 都能触发播放，并用 turn key 去重，避免同一回合播放两次。
- 播放中收到同房间 room 更新时只刷新隐藏服务器快照，不打断当前动画。

## 客户端契约

`client/godot/scripts/battle/server_battle_room_model.gd` 新增：

- `battle_events_from_server_event_list(state, event_list)`：把服务器事件列表转换成本地播放事件。
- `state_at_server_event_list_start(state, event_list)`：将战斗状态回退到服务器事件的动画起点。
- `state_with_server_event_actor_snapshot(state, event_list)`：播放结束时用服务器 actor 快照校准。

`main.gd` 新增服务器回合播放入口：

- `_play_server_battle_event_list(event_list)`
- `_server_battle_turn_key(event_list)`
- `_server_battle_event_playback_active()`

## 玩家可见行为

- 联网切磋双方提交后，会看到攻击/防御按共享战斗模板播放。
- 播放结束后进入服务器下一回合指令阶段。
- 普通 UI 不显示 room id、event seq、turn key 或调试字段。

## 当前边界

- 服务端仍只生成轻量人物 actor；宠物、完整队伍、道具、精灵、换宠、逃跑还未服务器权威化。
- 战斗结果、奖励、惩罚、击飞/记录点回写还未接入。
- `formationTemplate` 仍复用现有 10v10 容量模板；本阶段明确它是 N vs N 的容量模板，不代表只测 10v10。
- MySQL 归一化战斗表还未落地；当前仍随 room JSON 文档保存。

## 验证

```sh
cd server/node && npm test
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 5000 -- --auto-server-battle-turn-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 5000 -- --auto-server-battle-reconnect-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-battle-auto-10v10-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
```

## 下一步

1. Phase177 已完成：切磋房间离开、取消、超时和战斗结果回写。
2. Phase178：服务端战斗 actor 扩展到玩家队伍/宠物快照，继续沿用 N vs N 模型。
3. Phase179：正式玩家 UI 接入“离开切磋”，同时保留服务端权威关闭。
4. Phase180：逐步把地图碰撞、玩家碰撞和移动速度校验服务端化。
