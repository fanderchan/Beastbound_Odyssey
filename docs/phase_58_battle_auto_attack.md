# Phase58：战斗自动攻击

本阶段先做战斗内挂的最小可靠闭环：战斗面板标题行新增 `自动` 切换按钮。

- 开启后，人物在可下指令时自动使用 `攻击`。
- 开启后，标题行按钮会变成 `停止`；回合动作播放、指令面板隐藏时，会显示独立浮动 `停止` 按钮。
- 人物自动攻击会选择第一个存活敌人。
- 如果当前有受控出战宠物，进入宠物指令后会自动使用 `技1 攻击`。
- 自动攻击走现有 `_submit_player_battle_command` / `_submit_pet_battle_command`，不绕过速度、合击、状态、浮字、账本和胜负结算。
- 自动开关在本次客户端运行期间跨战斗保留，方便后续和挂机遇敌衔接。
- 玩家打开精灵、物品、捕捉、换宠等菜单时，自动攻击不会抢当前菜单选择。
- 10v10 观察模式中，非受控友方会继续按现有练级 AI 普攻同一目标，进入速度排序和合击折叠。

本阶段不做复杂设置页。后续“自动战斗设置”再扩展：

- 人物技能优先级。
- 宠物技能优先级。
- 人物 / 宠物低血量自动精灵或道具。
- 自动捕捉条件、捕捉道具选择和丢弃策略。

## 手动测试

```sh
godot --path client/godot --scene res://scenes/Main.tscn
```

建议测试路径：

1. 进入 `火芽村入口` 草丛触发战斗，或直接打开战斗预览。
2. 在右上战斗面板点 `自动`。
3. 确认人物会自动攻击第一个存活敌人。
4. 确认进入宠物指令后，宠物会自动使用 `技1 攻击`。
5. 战斗动作播放、右上指令面板隐藏时，确认右上仍有 `停止` 按钮，点它后不会继续自动提交下一轮指令。
6. 再次进入战斗，确认上一次如果保持开启，自动攻击会继续生效。

快速打开战斗预览：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-preview
```

打开 10v10 练级观察预览：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-auto-10v10-preview
```

这个预览会把敌方血量加厚，方便连续观察自动普攻、其他友方 AI 和合击频率。进入后点右上 `自动` 开始。

## 自测命令

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-auto-attack-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-auto-10v10-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3600 -- --auto-battle-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-pet-command-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-passive-hover-check
```
