# Phase77：聊天 / 系统频道面板

本阶段加入第一版本地聊天面板，为后续附近聊天、队伍聊天和服务端频道打底。

## 内容

- 底部行动栏新增 `聊天`。
- 聊天面板包含三个频道：
  - `系统`：自动收集左下角日志、战斗结算、任务、商店等系统提示，不允许手动输入。
  - `附近`：第一版本地输入消息，后续可接地图附近广播。
  - `队伍`：第一版本地输入消息，后续可接组队频道。
- 聊天面板与背包、装备、宠物、图鉴、任务、地图、内挂等面板互斥，不挤占地图常驻画面。
- 消息最多保留 120 条，超出后从最旧消息开始移除。

## 暂不做

- 不接服务器、账号、跨客户端广播。
- 不做私聊、世界频道、表情、屏蔽词和聊天记录持久化。
- 不改变战斗内自动流程，战斗中不打开世界聊天面板。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-chat-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-map-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-quest-reward-choice-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-equipment-durability-check
```

## 手动预览

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --chat-panel-preview
```
