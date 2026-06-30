# Phase188: Server Battle Items

本阶段把联网切磋的最小战斗道具闭环服务器化：玩家在人物指令选择“物品”，可对我方人物或当前出战宠使用 `回复药5` / `肉`。服务端负责快照、校验、结算、扣数量和 profile 写回，客户端只提交目标并播放服务器事件。

## 修复

- 服务端开战时从 `backpackSlots` 快照 `battleItemBag`，当前只开放 `item_heal_single_5` 和 `item_meat_small`。
- 服务器接受人物 actor 的物品命令，拒绝敌方目标、倒下目标、数量不足和未开放物品。
- 回合结算时产出 `item_heal` 事件，包含 `targetActorId`、`targetKind`、`hpBefore`、`hpAfter`、`remainingItemCount`，避免客户端误把治疗显示到人物上。
- 物品在回合事件真正生效时扣减；房间关闭写回 profile 时同步剩余战斗物品数量。
- Godot 联网战斗 `itemBag` 改用服务器参与者快照；物品菜单在联网切磋中只放行回复药和肉。
- Godot 播放服务器 `item_heal` 时按服务器目标映射本地 actor，并用 `remainingItemCount` 对齐剩余数量，避免提交命令和事件播放之间重复扣道具。
- 保持石器式主动换宠规则：宠物倒下不会自动换宠，玩家需要主动选择换宠。

## 验证

```sh
node --check server/node/src/auth-service.js
cd server/node && npm test
godot --headless --path client/godot --check-only --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --auto-server-battle-item-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --auto-server-battle-switch-pet-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
```

真实联网道具 live check 通过：`item_event=true`、`healed_hp=87`、`local_item=true`，服务器事件目标为宠物 actor，回复药剩余 1。

主动换宠回归通过：`switch_event=true`、`actor=true`、`next_required=true`，旧出战宠不再要求本回合下达宠物指令。

稳定段 perf probe：启动首帧仍有既有 HUD 构建尖峰；稳定后 `process_total` 多数约 `0.20ms - 0.49ms`，`hud_signature` 多数约 `0.03ms - 0.11ms`。

## 下一步

1. 联网切磋战斗回执：展示本局 HP/道具写回、记录点返回、主动离开/失败/超时原因。
2. 继续完善宠物倒地后的提示和主动换宠 UX，但不做宠物 KO 自动换宠。
3. 后续再分阶段开放解状态、群体回复等更复杂战斗物品。
