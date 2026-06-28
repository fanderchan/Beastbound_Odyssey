# Phase141：骑宠战斗完整闭环

本阶段把骑宠从“世界状态和属性加成”收口到完整战斗闭环。骑乘宠物不再只是隐藏属性来源，而是会进入战斗角色数据、参与表现、承受伤害，并在战斗结算时把状态写回宠物实例。

## 状态契约

宠物状态新增并使用 `riding`：

- `战斗`：作为出战宠进入前排。
- `骑乘`：作为人物骑宠进入战斗，不再占用出战宠位置。
- `待机`：在队伍中可被设为战斗或骑乘。
- `休息`：不可出战、不可骑乘。

同一只宠物不能同时是出战宠和骑宠。设置骑乘时会清掉它的出战位置；骑乘宠物也不能存入兽栏、丢弃或作为普通出战宠切换。

## 战斗数据

`PlayerProgressModel.apply_profile_to_battle_state()` 会把骑宠信息写入人物战斗角色：

- `ridePetInstanceId`
- `ridePetName`
- `ridePetFormId`
- `ridePetLevel`
- `ridePetHp`
- `ridePetMaxHp`
- `ridePetBattleState`
- `rideBaseStats`
- `rideStatSummary`

人物战斗攻、防、敏会使用 `riding_stat_summary()` 的骑乘合成值。人物自身血量仍使用人物血量；骑宠血量单独保留。

## 战斗表现

战斗绘制层会识别人物角色是否有有效骑宠：

- 有骑宠时绘制骑宠身体和骑手。
- 新手老虎使用虎形占位绘制。
- 雷龙使用龙形占位绘制。
- 人物血条和骑宠血条同时显示。
- 骑宠血条使用蓝色，人物血条沿用原来的绿色。

当前仍是无美术占位形象，后续可直接替换为正式骑宠战斗 sprite。

## 伤害分摊

攻击命中骑乘人物时，`BattleModel` 会先执行骑宠伤害分摊：

- `RIDE_DAMAGE_TO_MOUNT_RATIO` 控制骑宠承伤比例。
- 骑宠承受的伤害写入 `lastRideDamagePerTarget`。
- 人物实际承受的伤害写入 `lastActorDamagePerTarget`。
- 战斗消息会展示“骑宠承受多少、人物承受多少”。
- 浮字会额外显示骑宠承受的伤害。

如果骑宠血量不足，溢出的伤害回到人物身上。

## 倒下和结算

骑宠在战斗中血量降到 0 时：

- 战斗角色标记 `ridePetKnocked = true`。
- 人物战斗属性回落到未骑乘基础值。
- 战斗结算回写宠物实例血量为 0。
- 宠物状态强制变为 `休息`。
- 玩家档案清空 `ridePetInstanceId`，解除骑乘。

普通人物 0 血仍不等于自动回村；回村逻辑继续只由击飞 / 记录点规则处理。

## 自测命令

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-riding-system-check
```

`--auto-riding-system-check` 会验证：

- 未学骑宠术不能骑乘。
- 宠物可进入 `骑乘` 状态。
- `待机 -> 骑乘 -> 战斗` 状态轮转正常。
- 骑宠不进入普通出战宠队列。
- 骑宠不能被存入兽栏、丢弃或设为出战宠。
- 骑乘属性公式写入战斗角色。
- 战斗中骑宠和人物分摊伤害。
- 战斗结算回写骑宠 HP。
- 骑宠倒下后解除骑乘并进入休息。

## 后续

Phase141 收口的是规则和占位表现。后续可以继续做：

- 正式骑宠战斗 sprite 和骑乘动作。
- 骑宠受击、倒下、下骑的动画。
- 不同骑宠类型的承伤、出手、技能限制差异。
- PVP 中的骑宠战斗规则校验。
