# Phase 108: 宠物成长一期

## 目标

- 让玩家拥有的宠物数值随等级成长，避免高等级宠物仍停留在 Lv1 四维。
- 先做一版可玩原型，不实现最终复杂成长档、随机档、转生继承。

## 一期规则

- 以宠物图鉴模板 `baseStats` 作为 Lv1 基础四维。
- 根据 `growthProfileId` 选择每级成长：
  - `balanced`：均衡成长。
  - `attack_high`：攻击成长高。
  - `agility_high`：敏捷成长高。
  - `defense_high`：生命、防御成长高。
  - `hp_high`：生命成长高。
- 宠物归一化时按当前等级重算 `maxHp`、`attack`、`defense`、`quick`。
- 旧存档宠物如果原本满血，成长后补到新满血；如果原本受伤，保留已损失生命。
- 战力继续使用 `round(maxHp / 4 + attack + defense + agility)`。

## 范围

- 影响玩家拥有宠物、兽栏宠物、地面宠物、捕获后宠物、宠物面板、战斗入场 actor。
- 不改副本地图里手写的敌方 `battleStats`，避免本阶段把副本怪意外放大。

## 验证

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --auto-pet-growth-check
```

