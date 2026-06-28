# Phase28：战斗被动提示与指令面板收起

## 目标

Phase28 先把“宠物/怪物亚种被动”接进战斗模型，再做玩家可见的悬停提示。

这阶段同时调整战斗指令面板：右上 `PLAYER` / `PET` 面板只在可下指令阶段出现，回合行动播放时自动隐藏。

## 被动技能数据

新增：

- `client/godot/data/battle_passive_skills.json`
- `client/godot/scripts/battle/battle_passive_catalog.gd`

当前被动目录最小结构：

```json
{
  "id": "stone_immunity",
  "label": "石化免疫",
	  "description": "免疫一切石化状态。",
  "effect": {
    "statusImmune": ["stone"]
  }
}
```

玩家看到的顶部文案格式固定为：

```text
被动技能: [被动技能名] 解释。
```

例如：

```text
被动技能: [石化免疫] 免疫一切石化状态。
```

## 战斗规则接入

战斗单位新增字段：

- `passiveSkillIds`

生成战斗单位时，会读取这些被动并应用效果：

- `statusImmune`：写入单位的状态免疫表。
- `statusResist`：写入单位的状态抗性表。

因此 `高防乌力` 的石化免疫不再是测试脚本临时塞进去的字段，而是来自 `stone_immunity` 被动。

后续宠物设计器或亚种配置只需要维护 `passiveSkillIds`，战斗规则和顶部显示会读取同一份数据。

## 玩家可见行为

- 鼠标悬停到带被动的战斗单位时，顶部中间显示被动说明。
- 触屏没有 hover 时，点选目标也会刷新顶部被动说明。
- 没有被动的单位不显示顶部说明条。
- 目标圈仍然只在攻击、精灵、物品、宠物技能等“需要选目标”阶段出现。
- 回合动作播放时，右上 `PLAYER` / `PET` 操作面板隐藏。
- 回到下一轮人物指令时，右上操作面板重新出现。
- 被动提示条绘制层级低于 `PLAYER` / `PET` 操作面板；重叠时以操作面板为准。
- `PLAYER` 操作面板保持固定 2x4 布局。
- `PET`、精灵、物品、换宠面板使用固定宽度纵向菜单，避免长文字把框体撑到窗口边缘。
- 战斗操作面板和按钮使用轻度半透明，以便继续观察底下的我方单位。

## 手工测试

启动：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-status-rule-test
```

建议检查：

- 鼠标移动到 `高防乌力` 身上，顶部应显示 `被动技能: [石化免疫] 免疫一切石化状态。`
- 鼠标移动到没有被动的普通目标，顶部被动提示应隐藏。
- 人物按 `攻击` 并点敌人后，`PET` 菜单应是纵向技能列表，右侧保留边距，不贴窗口边缘。
- 在 `PET` 菜单按 `返回` 后，`PLAYER` 面板应回到原来的固定 2x4 尺寸，不需要等鼠标再次悬停才恢复。
- 人物选择 `防御`，宠物也选择 `技2 防御` 后，回合开始播放，右上 `PLAYER`/`PET` 面板应隐藏。
- 回合播放结束后，右上操作面板应重新出现。
- 用 PET `技6 石化凝视` 点 `高防乌力`，仍应显示 `免疫`，不会出现 `石`。

## 自动测试

```sh
node tools/battle_action_catalog_check.mjs
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-battle-passive-hover-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-status-rule-check
```

自动测试覆盖：

- 被动技能 JSON 结构校验。
- `高防乌力` 带有 `stone_immunity`。
- 顶部提示文本符合玩家文案格式。
- 被动提示条层级低于操作面板。
- `PET` 菜单纵向布局、固定尺寸、返回后 `PLAYER` 尺寸不变。
- 行动播放时指令面板隐藏。
- 回到命令阶段后指令面板重新出现。

## 后续

下一步可以继续做：

- 宠物 `技7`。
- 捕捉后归属与宠物栏。
- 宠物/怪物亚种设计器。
- 服务端权威战斗事件列表。
