# Phase31：宠物主动技能继承契约

## 目标

Phase31 把 Phase29/30 里的“亚种决定主动技能组”接入战斗操作菜单。

本阶段仍然只做 Godot 本地逻辑，不做正式宠物设计器、不接 Node.js、不接 MySQL。

## 本阶段新增

- `PetTemplateCatalog` 增加主动技能查询：
  - `active_skill_ids_for_form(form_id)`
  - `active_skill_ids_for_actor(actor)`
  - `pet_skill_action_for_actor_slot(actor, slot)`
- PET 操作菜单不再直接读取全局技能槽，而是读取当前出战宠物的 `activeSkillIds`。
- 已学技能显示 `技N 技能名`。
- 未学或不存在的槽位只显示 `技N`，并且按钮禁用。
- 新增自动检查 `--auto-pet-template-catalog-check`。

## 第一版技能组

### 普通布伊

当前原型阶段，普通布伊保留已有测试技能，方便继续验证伤害、异常状态和免疫：

```text
技1 攻击
技2 防御
技3 布伊冲撞
技4 催眠粉
技5 迷惑吼
技6 石化凝视
```

`技7` 暂未开放。

### 普通乌力

普通乌力先只保留基础技能：

```text
技1 攻击
技2 防御
```

这样可以证明不同亚种的主动技能组确实不同。

## 手工测试

启动：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-status-rule-test
```

建议检查：

- 人物选择任意行动后进入 PET 菜单。
- 我的布伊应显示 `技1 攻击`、`技2 防御`、`技3 布伊冲撞`、`技4 催眠粉`、`技5 迷惑吼`、`技6 石化凝视`。
- `技7` 只显示槽位，不可点击。
- 技能仍然可以选择敌方目标。

## 自动测试

```sh
node tools/battle_action_catalog_check.mjs
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 300 -- --auto-pet-template-catalog-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1200 -- --auto-battle-pet-command-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-pet-target-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-battle-passive-hover-check
```

自动测试覆盖：

- 宠物模板目录合法。
- 布伊系和乌力系的种系被动合法。
- 普通布伊拥有 1 到 6 技能。
- 普通乌力只有攻击和防御，不能使用布伊冲撞。
- 布伊属性配比能换算异常抗性。
- 高防乌力 10 地能通过种系被动获得石化免疫。
- 战斗 actor 和宠物队伍都带有 `lineName`、`subtypeName`、`formId`、`elements` 等模板字段。

## 后续

下一步可以做宠物详情或图鉴雏形，把 `种系 / 亚种 / 形态 / 属性配比 / 主动技能 / 被动技能` 以玩家能理解的方式展示出来。
