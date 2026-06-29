# Phase178：服务器战斗人物与宠物快照

本阶段把联网切磋 actor 从“每个账号一个轻量人物”扩展为“人物 + 当前战斗宠”的服务器快照。这里的快照不是特殊技术，而是开战时冻结一份本局战斗要用的字段：等级、HP、攻防敏、宠物实例 ID、形态和技能 ID。战斗过程只读这份快照，避免玩家在战斗中改装备、换宠、掉线重连或本地状态变化时影响已经开始的服务器结算。

## 目标

- 接受切磋邀请时，从服务器 profile 文档读取参战人物字段。
- 从 `profile.petInstances` 读取 `activePetInstanceId` 对应的 `state=battle` 宠物。
- 服务端 room battle actors 展开为每方最多 2 个 actor：人物后排、当前战斗宠前排。
- `publicBattleActor` 暴露 `kind`、`level`、`attack`、`defense`、`petId`、`formId`、技能 ID 等快照字段。
- 战斗命令支持 `targetActorId`，避免同一账号的人物和宠物目标歧义。
- Godot 把服务端 `kind=pet` actor 映射到共享 N vs N 模板中的 `ally_pet` / `enemy_pet`。

## 服务端合同

`battleParticipantSnapshot` 现在记录：

- `teamSnapshot.player`
- `teamSnapshot.battlePets`
- `teamSnapshot.battlePetCount`

`battleRoomActors(room)` 会从 participant 展开：

- `duel_{side}_player`
- `duel_{side}_pet_{petId}`

当前每名玩家只取 1 只 active battle pet，保留 N vs N 合同，但不一次性开启完整 5 宠队伍、宠物技能、换宠或道具。

提交命令时可传：

```json
{
  "round": 1,
  "actionId": "attack",
  "targetActorId": "duel_opponent_pet_pet_b_active"
}
```

旧的 `targetUsername` / `targetAccountId` 仍兼容，但会默认指向该账号的人物 actor。

## 客户端行为

`ServerBattleRoomModel` 现在按服务器 actor kind 生成本地 actor：

- 自己人物：`ally_player`
- 自己战斗宠：`ally_pet`
- 敌方人物：`enemy_player`
- 敌方战斗宠：`enemy_pet`

普通玩家 UI 不显示 actor id 或快照 JSON。战斗画面继续使用同一套 PC/移动共享 N vs N 10格容量模板。

## 当前边界

- 宠物暂时只是服务器 actor，可以作为攻击目标；还不能单独下宠物技能命令。
- 服务器不在战斗中实时读取 profile，也不回写宠物受伤到正式 profile。
- 未同步服务器 profile 的账号继续使用 Phase177 的纯人物轻量 actor。
- 完整队伍快照、宠物技能、换宠、道具、逃跑和结算回写留到后续阶段。

## 验证

```sh
cd server/node && npm test
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-pet-snapshot-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-turn-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-reconnect-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-close-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
```

`--auto-server-battle-pet-snapshot-live-check` 走真实 Node 服务完成：

1. 两个账号注册。
2. 双方上传带 active battle pet 的服务器 profile。
3. 双方站到同图相邻格并开切磋。
4. Godot 进入服务器权威战斗，看到 `ally_pet` 和 `enemy_pet`。
5. 挑战方用 `targetActorId` 攻击迎战方宠物，回合播放后迎战方 `ally_pet` HP 下降。

## 下一步

1. Phase179：正式玩家 UI 接入“离开切磋”，同时保留服务端权威关闭。
2. Phase180：服务端宠物命令和基础宠物技能事件。
3. Phase181：逐步把地图碰撞、玩家碰撞和移动速度校验服务端化。
