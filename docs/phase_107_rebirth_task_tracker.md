# Phase107: 转生试炼任务追踪

## 目标

- 没有活动任务时，右上角任务栏显示第一个可接主线任务，并支持“寻路”到接任务 NPC。
- 一转资格等转生资格已记录后，继续显示转生试炼下一步：
  - 缺元素戒指时，提示对应戒指和四大洞穴入口。
  - 缺转生兽时，提示去玄影洞窟前三层捕捉。
  - 缺玄影守护证明时，提示去玄影洞窟顶层挑战。
  - 全部满足后，提示回转生导师执行转生。

## 自测命令

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-rebirth-task-tracker-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-task-tracker-route-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-quest-ui-check
```

