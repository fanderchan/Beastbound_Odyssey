# Phase66：村医治疗 / 挂机续航闭环

## 目标

把开发期宠物面板免费治疗改成正式世界入口：玩家低血停止挂机后，可以回火芽村找村医恢复。

## 规则

- 火芽村入口新增 `村医阿萝`。
- 对话按钮为 `治疗队伍`。
- 村医治疗范围：
  - 人物生命。
  - 队伍宠物生命，包括 `战斗`、`待机`、`休息`。
- 村医不治疗兽栏宠物。
- 宠物面板删除旧 `治疗` 按钮。
- 立即恢复保留两条正式路径：
  - 村医：治疗人物和队伍宠物，收费。
  - 背包道具：按道具规则治疗指定队伍宠物。

## 费用

```text
费用 = ceil(总缺失生命 / 20)
最低 1 石币
满血时费用 0
```

石币不足时不治疗，提示：

```text
石币不足，无法治疗。
```

治疗成功提示：

```text
村医治疗完成，恢复X生命，花费Y石币。
```

## 自测命令

```bash
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-village-healer-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-recovery-check
```

## 手测入口

```bash
godot --path client/godot --scene res://scenes/Main.tscn
```

建议路径：

- 从训练场回到火芽村入口。
- 点击 `村医阿萝`。
- 对话中确认预计费用。
- 点击 `治疗队伍`。
- 打开宠物面板，确认旧 `治疗` 按钮不再出现。
