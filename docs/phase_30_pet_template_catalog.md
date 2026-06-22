# Phase30：宠物模板数据落地

## 目标

把 Phase29 的宠物分类设计落成第一版 Godot 本地数据和运行时加载逻辑。

本阶段仍然只做 Godot 本地逻辑，不接 Node.js、不接 MySQL、不做正式宠物设计器 UI。

## 本阶段新增

- 新增 `client/godot/data/pet_templates.json`。
- 新增 `client/godot/scripts/battle/pet_template_catalog.gd`。
- 布伊系、乌力系现在通过宠物模板生成战斗单位。
- 宠物模板源数据里，一个种系只能有一个 `passiveSkillId`。
- 形态不允许追加或替换被动，只能通过 `elements` 改变种系被动的实际效果。

## 第一版种系

### 布伊系

种系被动：

```text
被动技能: [抗性皮肤] 根据地水火风属性分别获得石化、中毒、混乱、睡眠抗性。
```

第一版映射：

| 属性 | 抗性 |
| --- | --- |
| 地 | 石化抗性 |
| 水 | 中毒抗性 |
| 火 | 混乱抗性 |
| 风 | 睡眠抗性 |

每 1 点属性等于 1% 对应异常抗性。

### 乌力系

种系被动：

```text
被动技能: [硬壳体质] 根据地属性获得石化抗性；地属性达到10时免疫石化。
```

第一版规则：

```text
石化抗性 = 地属性点数 * 10%
```

因此 `高防乌力` 的 10地 会计算出 100% 石化抗性，并在战斗里表现为石化免疫。

## 和战斗系统的关系

运行时仍然保留 `passiveSkillIds` 数组，兼容现有被动悬停、状态免疫、战斗账本和自动测试。

但源数据规则已经改变：

- `line.passiveSkillId` 是唯一被动来源。
- `form.elements` 是参数化被动的输入。
- `form` 不再允许配置 `extraPassiveSkillIds`。

## 手工测试

启动：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-status-rule-test
```

建议检查：

- 鼠标移动到 `高防乌力` 身上，顶部应显示 `被动技能: [硬壳体质] 根据地属性获得石化抗性；地属性达到10时免疫石化。`
- 用 PET `技6 石化凝视` 点 `高防乌力`，应显示免疫，不会出现 `石`。
- 鼠标移动到 `厚皮布伊` 身上，顶部应显示 `抗性皮肤`。
- 换宠后，新上场的布伊仍应显示布伊系被动，而不是旧的离散被动。

## 自动测试

```sh
node tools/battle_action_catalog_check.mjs
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 300 -- --auto-battle-action-catalog-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 300 -- --auto-pet-template-catalog-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-status-rule-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-battle-passive-hover-check
```

自动测试覆盖：

- 战斗行动目录。
- 被动技能目录。
- 宠物模板目录。
- 亚种主动技能组进入 PET 菜单。
- 种系必须且只能配置一个 `passiveSkillId`。
- 属性四系合计必须为 10。
- `高防乌力` 通过 `硬壳体质` 免疫石化。
- 被动悬停顶部文案显示新种系被动。

## 后续

下一步可以做宠物详情或宠物图鉴雏形，把 `种系 / 亚种 / 形态 / 属性配比 / 种系被动` 做成玩家可查看的信息。
