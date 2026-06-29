# Phase180：联网切磋宠物指令

本阶段把联网切磋的回合命令从“每个账号提交一次”推进到“每个可行动 actor 提交一次”。当一名玩家带着出战宠物进入切磋时，人物和宠物都是本回合需要服务器确认的行动单位；服务器只有在双方所有存活必填 actor 都提交后，才会生成权威事件列表。

## 目标

- 服务端 battle state 暴露 `requiredActorIds` 和 `submittedActorIds`。
- `POST /battle/rooms/:roomId/commands` 支持 `actorId`，人物和宠物可分别提交动作。
- 服务器在同一账号的人物、宠物都提交后才判定该账号本回合完整提交。
- 宠物基础动作支持 `pet_attack`、`pet_defend` 和当前技能槽里的 `pet_bui_charge`。
- Godot 在人物指令提交后，如果自己的出战宠仍需指令，会自动切到宠物指令菜单。
- 服务端 `pet_skill` 事件映射到客户端现有 `skill_attack` 播放，不向普通 UI 暴露 actor id 或原始 JSON。

## 服务端合同

房间 battle 快照新增：

```json
{
  "requiredActorIds": ["duel_challenger_player", "duel_challenger_pet_pet_cmd_a"],
  "submittedActorIds": ["duel_challenger_player"]
}
```

提交宠物技能示例：

```json
{
  "round": 1,
  "actorId": "duel_opponent_pet_pet_cmd_b",
  "actionId": "pet_bui_charge",
  "targetActorId": "duel_challenger_pet_pet_cmd_a"
}
```

当前兼容旧的纯人物切磋：如果本局没有出战宠，`requiredActorIds` 只包含双方人物，旧 1v1 检查仍按两名人物结算。带宠切磋则是同一个 N vs N 模板里的 2 actor vs 2 actor。

## 客户端行为

联网切磋中：

- 人物按钮暂时开放攻击、防御、离开。
- 人物提交后，如果服务端仍要求本账号的宠物 actor 提交，按钮区标题切换为“宠物”。
- 宠物按钮沿用本地战斗技能槽显示，空槽不可点。
- 宠物第 3 格 `布伊冲撞` 进入敌方目标选择，点目标后提交宠物技能命令。
- 宠物防御直接提交 `pet_defend`。

## 双开手测

Phase180 完成后，已经可以双开测试第一条“人 + 宠”联网切磋闭环：

1. 确认 Node 服务启动在 `http://127.0.0.1:8787`。
2. 开两个终端，各运行一次：

```sh
godot --path client/godot --scene res://scenes/Main.tscn
```

3. 两个窗口分别注册或登录不同服务器账号。
4. 两个角色走到同一地图相邻格，保持停稳。
5. 一方点另一方发起切磋，另一方接受。
6. 双方各自先选人物攻击或防御，再给宠物选防御或布伊冲撞。
7. 观察回合是否只在双方人物和宠物都提交后播放，且宠物技能会造成伤害。
8. 点“离开”确认双方都退出切磋。

暂时不要把下面内容当成已完成的网游验收：战斗后 HP 回写正式 profile、完整 5 宠队伍、换宠、道具、捕捉、长时间地图碰撞和玩家碰撞权威化。这些需要后续阶段继续补服务端合同。

## 验证

```sh
cd server/node && npm test
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-pet-command-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-pet-snapshot-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-turn-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-reconnect-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-close-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-leave-ui-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-battle-auto-10v10-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
```

`--auto-server-battle-pet-command-live-check` 会走真实 Node 服务：

1. 注册两个临时账号。
2. 双方上传带出战宠和宠物技能槽的服务器 profile。
3. 双方进入切磋，服务端生成 4 个 required actor。
4. 远端人物、远端宠物先提交防御。
5. 本地通过玩家 UI 提交人物防御，确认按钮切到“宠物”。
6. 本地点宠物第 3 格布伊冲撞并选择敌方宠物。
7. 服务端生成 `pet_skill` 事件，客户端按 `skill_attack` 播放，敌方宠物 HP 同步下降。

## 下一步

1. Phase181：把玩家移动碰撞和速度校验继续服务端化，减少本地可篡改空间。
2. Phase182：把服务端战斗命令扩展到换宠、道具和战斗结束后的 profile 回写。
