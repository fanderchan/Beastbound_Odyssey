# Phase27：状态解除、覆盖与免疫规则

## 目标

Phase27 在 Phase24-26 的异常状态底层上继续补三条基础规则：

- 解除：用行动移除目标身上的异常状态。
- 覆盖：控制类状态互相覆盖，避免一个目标同时睡眠、混乱、石化。
- 免疫：目标可以对某个状态完全免疫。

本阶段仍然只做 Godot 本地战斗模型，不接后端。

## 当前规则

当前状态分两类：

- 持续伤害状态：`poison`。
- 控制状态：`sleep`、`confusion`、`stone`。

覆盖规则：

- `poison` 可以和一个控制状态并存。
- `sleep`、`confusion`、`stone` 互相覆盖。
- 同一个状态再次附加时，刷新持续回合和强度。

免疫规则：

- 战斗单位新增 `statusImmune` 字典。
- 例如 `{ "stone": true }` 表示该单位免疫石化。
- 免疫优先级高于命中率和抗性：免疫时直接 `statusResult = immune`。
- 当前 `高防乌力` 的石化免疫来自 `stone_immunity` 被动技能。
- 正式游戏里，免疫来源应继续来自宠物/怪物模板、被动技能表或装备/状态配置；战斗 HUD 只展示玩家需要理解的被动说明。

## 新物品

`battle_actions.json` 新增：

```json
{
  "id": "item_cleanse_single_5",
  "label": "净化草5",
  "effect": {
    "type": "cleanse",
    "statusIds": ["poison", "sleep", "confusion", "stone"]
  }
}
```

`净化草5` 是我方单体物品，会解除当前四种异常状态。

## 玩家可见行为

- `物品` 面板新增 `净化草5 x2`。
- 选择 `净化草5` 后，需要点击或触摸我方单体。
- 成功解除时目标飘 `净化`。
- 目标没有异常时目标飘 `无异常`。
- 状态免疫时目标飘 `免疫`。

命中率、roll、抗性、免疫字段和“免疫来自哪个被动”这类工程/规则细节，仍然只进入战斗账本、trace、宠物设计器或图鉴/被动技能说明，不显示在普通战斗 HUD。

## 事件账本

净化事件：

```json
{
  "type": "item_cleanse",
  "statusResult": "cleansed",
  "statusChanges": [
    {
      "statusId": "poison",
      "change": "remove_cleanse"
    }
  ]
}
```

覆盖事件会记录：

```json
{
  "statusId": "sleep",
  "change": "remove_overwritten"
}
```

免疫事件会记录：

```json
{
  "statusResult": "immune"
}
```

## 手工测试

启动：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-status-rule-test
```

建议检查：

- `普通猎人` 开局有 `毒` 和 `眠`，用 `物品` -> `净化草5` 点他，应清掉状态。
- `高速乌力` 开局有 `眠`，人物先任意行动，PET 用 `技6 石化凝视` 点它，应从 `眠` 变成 `石`。
- `高防乌力` 带有 `石化免疫` 被动，PET 用 `技6 石化凝视` 点它，应显示 `免疫`，不会出现 `石`。

## 自动测试

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-status-rule-check
```

自动测试覆盖：

- 从 UI 使用 `净化草5`，目标状态被清除，物品数量减少。
- `stone` 覆盖目标已有的 `sleep`。
- 免疫石化的目标不会获得 `stone`。

## 后续

下一步可以继续做：

- 宠物 `技7`。
- 捕捉后归属与宠物栏。
- 服务端权威战斗事件列表。
- 更完整的状态免疫/互斥配置表。
