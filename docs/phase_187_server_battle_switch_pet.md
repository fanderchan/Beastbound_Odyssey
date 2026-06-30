# Phase187: Server Battle Pet Switching

本阶段把联网切磋从“只能固定当前出战宠行动”推进到“服务器权威换宠”。玩家在联网切磋的人物指令里选择“换宠”，再选择待机宠物后，Godot 会提交 `switch_pet + petId` 到 Node；服务器确认目标宠物属于当前账号、存活且未出战，再在本回合事件列表里产出 `switch_pet`。

## 修复

- 服务端开战快照现在保留本账号最多 5 只可战斗宠：当前出战宠排在前面，待机宠也进入 `teamSnapshot.battlePets`。
- 服务器 `battle.actors` 仍只放当前出战宠；待机宠只在 team snapshot 里，避免未出战宠变成可攻击 actor。
- 人物提交 `switch_pet` 后，本回合不再要求旧出战宠下达宠物指令；回合结算时旧宠切为待机/休息，新宠成为当前出战宠。
- 房间关闭写回 profile 时，会同时写回已切下场宠物的 HP，避免切下场后丢失本局伤害。
- Godot 联网战斗的人物面板放行“换宠”，换宠菜单复用本地宠物栏按钮逻辑，选择待机宠后提交服务器命令。
- 服务器 `switch_pet` 事件转换为 Godot 现有 `switch_pet` 本地事件，播放完后再用服务器 actor 快照覆盖最终状态。
- 修正联网回合播放时序：收到带 `turn` 的服务器房间快照时，不先覆盖 actor，先播放事件列表，再用权威快照收尾。否则换宠事件会因为待机宠已被提前同步成出战宠而被跳过。
- 保持联网物品命令为显式未开放，不伪造本地物品效果。

## 验证

```sh
cd server/node && npm test
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --auto-battle-switch-pet-check
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --auto-server-battle-switch-pet-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --auto-server-battle-pet-command-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --auto-server-battle-target-mapping-check
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --auto-server-battle-turn-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --perf-probe
```

真实联网换宠 live check 通过：`switch_event=true`、`actor=true`、`next_required=true`、`local_event=true`，旧宠 actor 不再出现在下一回合 requiredActorIds，新宠 actor 成为下一回合可行动宠。

目标映射回归通过：攻击敌方宠物时 `target=enemy_pet`，宠物 HP 下降，人物 HP 不变，文字显示“攻击了 敌方布伊”。

稳定段 perf probe：`process_total` 约 `0.14ms - 0.35ms`，HUD 更新约 `0.03ms - 0.06ms`。

## 下一步

1. 联网切磋道具命令服务器化：先做最小回复药/肉，不允许本地直接改血。已完成，见 `docs/phase_188_server_battle_items.md`。
2. 宠物被击倒后不自动换宠；后续继续完善主动换宠、倒地提示和不可出战状态。
3. 战斗回执：展示本局 HP 写回、记录点返回、主动离开/失败/超时原因。
