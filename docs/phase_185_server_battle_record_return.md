# Phase185: Server Battle Record-Point Return

本阶段把联网切磋结果继续向服务器权威推进：当切磋以 `defeat` 或 `timeout` 关闭时，服务端会把失败/超时方的在线位置移回自己的记录点，并在 `battle.result.battleReturns` 里公开这次回城结果。普通主动离开 `leave` 暂不触发记录点回城，避免把玩家主动退出误判成击飞惩罚。

## 目标

- 服务端根据 profile 的 `recordPoint` 选择回城地图和 spawn。
- 服务端读取 Godot 地图 JSON 的 `spawnPoints`，把 spawn 转成在线位置格子。
- 失败/超时方的 `playerPositions` 持久化为 `authority=battle_result_return`。
- `battle.result.battleReturns[]` 带上 `recordPoint` 和公开 `position`。
- Godot 收到自己的 `battleReturns` 后退出战斗、切到记录点地图，并显示“已回到记录点”。

## 服务端合同

`battle.result` 新增：

```json
{
  "battleReturns": [
    {
      "kind": "record_point_return",
      "accountId": "acc_loser",
      "reason": "defeat",
      "recordPoint": {
        "mapId": "firebud_village_gate",
        "spawnName": "doctor_record",
        "label": "火芽村医旁记录点"
      },
      "position": {
        "mapId": "firebud_village_gate",
        "cellX": 10,
        "cellY": 17,
        "authority": "battle_result_return"
      }
    }
  ]
}
```

当前默认记录点是 `firebud_village_gate / doctor_record`。如果 profile 没有 `recordPoint`，服务端使用这个默认值。

## 客户端行为

- 胜方只看到原有胜利提示，不切图。
- 败方收到自己的 `battleReturns` 后，使用 `recordPoint.mapId + spawnName` 加载地图。
- 地图加载后再用 `position.cellX/cellY` 对齐服务器权威格子。
- 玩家文案保持简短，例如：`切磋落败，已回到记录点。`

## 当前边界

- 本阶段不把主动离开 `leave` 视为记录点回城。
- 本阶段不发经验、石币、道具、捕捉、装备耐久或任务结果。
- 本阶段不实现正式击飞动画，只做服务端结果后果。
- 后续如果引入真正 PvP 击飞规则，应把 `battleReturns.reason` 扩展为更明确的 `knockaway` 或惩罚类型。

## 验证

```sh
cd server/node && npm test
node --check server/node/src/auth-service.js
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 4000 -- --auto-server-battle-return-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-pet-command-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
```

真实服务验证应额外确认：

1. Node 服务重启到当前代码。
2. 两个临时账号进入切磋。
3. 一方连续攻击到对方落败。
4. `battle.result.battleReturns[0].position.authority == "battle_result_return"`。
5. 再查 `/players/online` 或服务端状态，落败方位置为记录点格子。

## 下一步

1. 给联网切磋补最小 battle result receipt，记录 HP 回写和回记录点摘要。
2. 扩展服务端战斗命令到道具、换宠和完整队伍。
3. 再做奖励/惩罚事务，不和记录点回城混在同一阶段。
