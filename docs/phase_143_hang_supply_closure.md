# Phase143 自动挂机补给闭环

## 目标

把 Phase119 留下的补给断点补齐：自动挂机低血后不只会走到村医，还会自动治疗、返回原挂机点，并在可恢复的模式下继续挂机。

## 已实现

- 战斗结算触发低血动作 `回村治疗` 时，会保留 `hangSession` 的原始地图和格子，并设置 `pendingResume`。
- 到达村医后，如果检测到 `pendingResume`，会自动执行治疗，不需要玩家再点一次。
- 治疗成功后：
  - 清掉 `pendingResume`。
  - 返回原挂机地图和原格子。
  - 原模式为左右走挂机时，回到遇敌区域后自动继续挂机。
- 石币不足或治疗失败时：
  - 停止挂机。
  - 清掉待恢复状态。
  - 在消息栏提示 `挂机补给失败，已停止。`
- 原地遇敌石低血停止后不会免费恢复效果；治疗后会回到原点并提示需要重新使用。

## 边界

- 当前回挂机点沿用已有自动寻路能力：如果当前地图找不到通往目标地图的直接传送点，会停止并提示。
- 第一版不做自动买肉、自动买捕捉工具、自动修装备；这些留给后续更完整的补给策略。
- `_process` 中只增加 `hang_heal_resume_active` 的轻量状态检查，避免把完整任务/背包/宠物扫描放进移动热路径。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-hang-supply-closure-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-hang-loop-closure-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-hang-settings-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --movement-spam-click-check
```
