# Phase113：宠物个体成长骨架

## 目标

- 先建立宠物实例级成长字段，不在本阶段敲定最终数值。
- 同种、同等级宠物在捕捉或生成时可以有四维差异。
- 后续数值策划可以基于这些字段扩展极品、平均、垃圾、转生继承和成长洗练。

## 字段

- `growthTierId` / `growthTierLabel`：成长档标识和显示名，例如均衡、攻击、敏捷。
- `individualSeed`：个体随机种子。捕捉宠物使用战斗来源、形态、等级、捕捉序号组合生成，保证同种同级也能不同。
- `individualVariance`：个体差异，包含 `initialBonus` 和 `growthBonus`。
- `initialStats`：带个体初始加成后的 Lv1 四维。
- `growthRecord`：成长记录快照，包含基础四维、成长率、个体差异、等级成长量和最终四维。
- `combatPowerBreakdown`：战力来源，沿用 `round(maxHp / 4 + attack + defense + agility)`。

## 规则

- 宠物归一化时按 `growthRecord.finalStats` 写回 `maxHp`、`attack`、`defense`、`quick`。
- 旧存档没有 `individualSeed` 时，使用实例 ID 作为稳定种子，避免每次打开游戏随机变数值。
- 捕捉生成时使用捕捉场景生成 `individualSeed`，同种同级多次捕捉会有不同个体。
- 战斗 actor、换宠、战斗结算会保留个体成长字段，避免入场或结算后把字段洗掉。
- 宠物图鉴仍显示物种模板信息，不展示个体字段；宠物栏详情展示个体成长和战力来源。

## 暂定随机范围

- 初始生命：`-3` 到 `+3`
- 初始攻击、防御：`-1` 到 `+1`
- 初始敏捷：`-2` 到 `+2`
- 每级生命成长浮动：`-0.45` 到 `+0.45`
- 每级攻击成长浮动：`-0.12` 到 `+0.12`
- 每级防御成长浮动：`-0.10` 到 `+0.10`
- 每级敏捷成长浮动：`-0.12` 到 `+0.12`

这些数值只是骨架期原型，后续正式成长系统可以整体替换。

## 自测命令

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-individual-growth-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-growth-check
```
