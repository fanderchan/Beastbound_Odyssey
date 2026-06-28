# Phase61：挂机设置 / 低血停止闭环

本阶段把世界挂机补成一个可配置闭环，但不做常驻展示面板。

## 设计

- `内挂设置` 面板新增 `挂机` 页签。
- 挂机页第一版只保留 `低血停止`。
- 不提供 `遇敌方式`：普通挂机就是草丛内来回走动。
- 不提供 `自动战斗`：战斗内仍然用右上 `自动` / `停止` 控制。
- 不提供 `道具耗尽停止`：第一版只用人物生命线判断是否停止。

## 低血停止

- 默认值是 `0%`。
- `0%` 表示只要人物在战斗中倒下过，就在战斗结束回地图时停止挂机。
- `不停止` 表示战斗结束后不会因为人物倒下或低血自动停止。
- `10%` / `20%` / `30%` / `50%` 表示战斗结束时，如果人物当前生命比例低于阈值，就停止挂机。
- 只判断人物生命，不判断宠物生命。

人物在战斗中如果变成 `0` 血，回到世界和写入 profile 时会保底成 `1` 血，避免下一次遇敌刚进战斗就再次按 0 血开局。

## 停止范围

统一的挂机停止会清掉：

- 草丛来回走动。
- 当前自动移动目标。
- 原地遇敌石效果。

所以手动点 `停`、低血停止或死亡停止，都会取消可能正在生效的遇敌石。

## 手工测试

完整客户端验收入口：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --full-client-preview
```

打开挂机设置页：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --hang-settings-preview
```

`--hang-settings-preview` 只是局部预览入口，用来快速打开本阶段面板；整体验收优先用 `--full-client-preview` 或不带参数的正常启动。

建议手工看这些点：

1. 点动作栏 `内挂`，切到 `挂机`，只看到 `低血停止` 和底部按钮。
2. 战斗自动相关选项仍在 `战斗` 页签，不挤占地图画面。
3. 站在草丛使用遇敌石后，动作栏 `挂机` 按钮显示为 `停`；点 `停` 后遇敌石效果取消。
4. 低血停止设为 `0%` 时，人物战斗中倒下过，回地图后停止挂机。
5. 宠物低血或倒下不触发挂机停止。

## 自动测试

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-hang-settings-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-encounter-loop-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-settings-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-result-check
```

自动测试覆盖：

- 默认 `低血停止 = 0%`。
- 设置值可保存到 profile。
- 挂机页签不混入战斗自动选项。
- 人物倒下过会停止挂机并清除遇敌石。
- 人物回世界后保底 `1` 血。
- 低血阈值只看人物，不看宠物。
- `不停止` 不会取消遇敌石。
- 手动 `停` 会清除遇敌石。
