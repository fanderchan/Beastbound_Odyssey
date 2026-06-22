# Phase46：战斗名称 / 等级显示

这一阶段只补战斗表现层的基本信息，不设计宠物成长、资质或个体差异。

## 规则

- 战斗单位标签统一显示为 `名字 LvN`。
- 玩家角色从玩家存档同步名称和等级。
- 出战宠物从宠物实例同步名称和等级。
- 野生宠物从遭遇表同步名称和等级。
- 10v10 大阵型仍使用紧凑标签，避免满屏文字互相遮挡。

## 手动自测

打开战斗标签预览：

```bash
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-label-preview
```

进入后应能看到：

- `见习猎人 Lv1`
- `我的布伊 Lv1`
- `高速乌力 Lv3`

## 自动回归

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-label-check
```

这个检查覆盖：

- 玩家 actor 继承玩家存档等级。
- 宠物 actor 继承宠物实例等级。
- 野怪 actor 继承遭遇表选中等级。
- 绘制标签使用 `名字 LvN` 格式。
