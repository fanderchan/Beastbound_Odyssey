# Phase107: 转生试炼任务追踪

## 目标

- 没有活动任务时，右上角任务栏显示第一个可接主线任务，并支持“寻路”到接任务 NPC。
- 一转资格等转生资格已记录后，继续显示转生试炼下一步：
  - 缺元素戒指时，洞外提示对应四大洞穴入口；已经在洞内时，寻路逐层指向上层楼梯；到顶层后指向守护草丛。
  - 缺转生兽时，洞外提示玄影洞窟入口；已经在捕捉层时，寻路指向当前层可捕捉区域。
  - 缺玄影守护证明时，洞外提示玄影洞窟入口；已经在洞内时，寻路逐层指向顶层；到顶层后指向守护草丛。
  - 全部满足后，提示回转生导师执行转生。

## 自测命令

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3200 -- --auto-rebirth-task-tracker-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-task-tracker-route-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-quest-ui-check
```
