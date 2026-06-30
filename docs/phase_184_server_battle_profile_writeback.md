# Phase184: Server Battle Profile HP Writeback

本阶段把联网切磋从“服务端只结算房间内临时 actor HP”推进到“房间关闭时把人物和出战宠 HP 写回服务器 profile”。这仍然是 N vs N 战斗合同的一部分：1v1、人 + 宠 2v2、后续更多 actor 都沿用同一套 actor 快照和账号 profile 回写边界。

## 目标

- 服务端关闭 battle room 时读取最终 `battle.actors`。
- 按 `accountId` 把 player actor 的 `hp` 写回 `profile.player.hp`。
- 按 pet actor 的 `petId` 匹配 `profile.petInstances[].instanceId/petId/id`，把出战宠 `hp` 写回对应宠物实例。
- 只有 HP 实际变化的 profile 才递增 `profileRevision`，避免无意义制造版本冲突。
- Godot 收到服务器切磋关闭后退出战斗，并后台拉取一次 `/profiles/me`，让本地缓存和 HUD 使用服务器结果。

## 服务端行为

触发点：

- `POST /battle/rooms/{roomId}/leave`
- 回合结算导致 `reason=defeat`
- 命令超时导致 `reason=timeout`

房间关闭后，服务端在内部 battle 快照记录：

```json
{
  "profileWriteback": {
    "kind": "battle_profile_writeback",
    "roomId": "battle_room_x",
    "reason": "leave",
    "profiles": [
      {
        "accountId": "acc_x",
        "playerId": "player_x",
        "profileRevision": 2,
        "playerHp": {"hp": 120, "maxHp": 120},
        "petHps": [{"petId": "pet_b_active", "hp": 42, "maxHp": 72}]
      }
    ]
  }
}
```

这个摘要用于服务端调试和回归测试；普通客户端不需要把它显示给玩家。

## 客户端行为

- `battle.room_closed` 仍然只显示现有玩家提示，例如“切磋胜利。”、“切磋落败。”或“你已离开切磋。”。
- 关闭服务器权威战斗后，客户端排队执行一次 profile pull。
- 如果 profile HTTPRequest 正在上传或读取，先排队，等当前请求结束后再读取。
- 如果上传时碰到 revision conflict 且有战斗结束后的读取在等待，客户端自动转为拉取服务器 profile。

## 当前边界

- 本阶段只回写 HP。
- 不发经验、石币、道具、任务进度、捕宠、击飞、记录点或装备耐久变化。
- 只回写进入切磋时快照里的 player 和当前出战宠。
- 完整 5 宠队伍、换宠、道具、捕捉和战斗奖励仍需要后续阶段继续服务器化。

## 验证

```sh
cd server/node && npm test
node --check server/node/src/auth-service.js
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-pet-command-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-leave-ui-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
```

新增 Node 回归覆盖：

1. 两个账号上传带出战宠 profile。
2. 联网切磋中攻击敌方宠物。
3. 房间关闭。
4. 重新读取敌方 profile，确认对应宠物 HP 等于 battle actor 最终 HP。
5. 只有被实际改 HP 的 profile revision 递增。

## 下一步

1. Phase185 已补：联网切磋 `defeat/timeout` 后，失败方由服务端移回记录点。
2. 把换宠、道具和完整队伍写入服务器战斗命令合同。
3. 为 MySQL inspection 表增加战斗结果/HP 写回摘要，方便后续运维排查。
