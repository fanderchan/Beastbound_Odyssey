# Phase33：战斗结算 / 经验成长 / 捕捉入队 / 宠物实例

## 目标

本阶段把战斗从“单场演示”接成一个最小游戏闭环：

- 战斗胜利、失败、逃跑后先退出战斗画面，回到地图。
- 地图左下角显示结算文字，例如获得经验、捕捉成功、升级。
- 捕捉成功的野生宠物不只是在战斗里消失，而是生成一只宠物实例。
- 出战宠物和人物获得经验，支持最小等级成长。
- 第一版使用 Godot 本地玩家档案，不接 Node.js/MySQL。

## 结算表现

按石器时代方向，本阶段不做战斗内大结算面板：

```text
战斗画面结束 -> 回到地图 -> 左下角日志显示结果
```

示例：

```text
战斗胜利，获得 54 经验。
小布伊获得经验。捕捉了野生乌力。
```

玩家界面只显示这类自然文本，不显示工程字段、roll 值、内部 ID。

## 宠物实例字段

宠物模板仍然来自 `pet_templates.json`，但玩家持有的是实例。

第一版实例字段：

- `instanceId`：玩家持有宠物的唯一 ID。
- `formId`：来自模板的形态 ID。
- `name`：显示名，可后续改名。
- `level`：等级。
- `exp`：当前等级内经验。
- `nextExp`：升下一级需要的经验。
- `state`：`battle`、`standby`、`rest`、`storage`。
- `hp`、`maxHp`、`quick`、`attack`、`defense`：当前数值。
- `activeSkillIds`、`passiveSkillIds`：从模板继承后写入实例快照，方便战斗读取。

## 本地玩家档案

第一版玩家档案保存在 Godot `user://player_profile.json`：

```json
{
  "schemaVersion": 1,
  "player": {
    "name": "见习猎人",
    "level": 1,
    "exp": 0,
    "nextExp": 120
  },
  "activePetInstanceId": "pet_bui_main",
  "nextPetInstanceSerial": 5,
  "petInstances": []
}
```

后续接服务器时，这个结构可以迁移为账号存档、宠物栏、兽栏和战斗服务器快照。

## 经验规则

第一版只做可验证的简单公式：

- 胜利时获得经验。
- 失败、逃跑不获得经验。
- 人物获得本场经验。
- 当前出战宠物获得本场经验。
- 每级需要经验：`80 + level * 40`。

经验奖励暂时由敌方宠物的血量、攻击、防御、敏捷估算，后续可移到遭遇表或怪物配置表。

## 捕捉规则

- 捕捉成功的敌方 actor 会在战斗结束时生成宠物实例。
- 如果玩家队伍不足 5 只，新宠物进入 `standby`。
- 如果队伍已满，新宠物进入 `storage`，后续兽栏阶段再显示和管理。
- 捕捉实例继承目标的 `formId`、属性、主动技能、被动技能和战斗数值。

## 自动验证

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-result-check
```

验证内容：

- 捕捉一只乌力并触发胜利结算。
- 战斗退出，回到地图。
- 左下角显示世界结算日志。
- 玩家经验增加。
- 宠物实例数量增加。
- 新捕捉宠物拥有 `formId` 和 `instanceId`。

## 后续

- 宠物列表/兽栏 UI。
- 经验公式和等级成长表数据化。
- 捕捉成功后的命名、放生、存入兽栏。
- 本地存档迁移到 Node.js + MySQL。
