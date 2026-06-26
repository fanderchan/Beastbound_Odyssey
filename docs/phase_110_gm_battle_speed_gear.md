# Phase110: GM 变速齿轮

## 目标

- 在 GM/QA 工具项中提供测试速度倍率，方便快速验证自动战斗、10V10、捕捉、击飞和地图移动流程。
- 默认 `x1`，点击按钮后按 `x2 -> x3 -> ... -> x10 -> x1` 循环。
- 倍率仅影响当前客户端会话，不写入玩家存档。

## 规则

- 变速齿轮改变测试用的本地时间推进：
  - 战斗事件动画计时。
  - 战斗飘字生命周期。
  - 自动战斗提交命令前的等待时间。
  - 世界地图角色走路速度。
  - 宠物跟随移动速度。
  - 挂机左右走动的下一步间隔。
- 不改变战斗排序、命中、伤害、捕捉、掉落、经验、任务结算或存档数值。

## 自测

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-qa-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-speed-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-visual-timing-check
```
