# Phase119 自动挂机完整闭环

## 已实现

- 挂机设置新增：
  - `低血停止`
  - `低血动作`：停止 / 回村治疗
  - `治疗后继续`
  - `捕宠目标`：0 表示不限制，>0 表示捕到指定数量后停止
- 左右走挂机和原地遇敌石都会建立同一份 `hangSession`。
- 战斗结算会记录挂机战斗次数和捕获成功数。
- 达到捕宠目标时，自动停止挂机并清掉遇敌石效果。
- 低血动作选择回村治疗时，战斗结束后会回到世界并自动寻路到村医。
- Phase143 后，村医会自动治疗并返回原挂机点；左右走挂机会继续，遇敌石不会免费恢复。

## 保留给后续

- 更细的补给策略，例如肉少于多少、捕捉工具少于多少、石币不足时停下。
- 捕宠目标完成后的奖励/提示面板。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-hang-loop-closure-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-hang-supply-closure-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-hang-settings-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-encounter-loop-check
```
