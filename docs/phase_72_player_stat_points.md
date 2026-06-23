# Phase72：人物升级属性点 / 手动加点

本阶段把人物升级和 `状态` 面板打通：人物升级后获得可分配属性点，玩家可以在状态面板里把点数加到四维上。

## 规则

- 人物每升 1 级获得 3 点可分配属性点。
- 第一版加点收益：
  - 生命：每点 +4 最大生命。
  - 攻击：每点 +1。
  - 防御：每点 +1。
  - 敏捷：每点 +1。
- 加点改变的是人物基础四维，装备加成仍然独立显示。
- 状态面板展示：
  - 当前经验、生命、可分配属性点。
  - 基础值 + 装备值 = 最终值。
  - 四个加点按钮；点数为 0 时按钮禁用但位置不变。
- 人物进入战斗时会读取加点后的基础四维，因此伤害、生命、防御都会跟着变化。

## 暂不处理

- 不做宠物成长公式、人物洗点、职业限制或属性点购买。
- 不做复杂数值平衡；当前收益只是可验证的原型数值。
- 不做自动加点 AI，陪练伙伴继续沿用自己的简化成长。

## 自测

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-player-stat-points-check
```

预览截图入口：

```bash
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase72_player_stat_points.png --quit-after 90 -- --player-stat-points-preview
```
