# Phase83：世界日志展开面板

本阶段增强左下角战斗 / 系统消息区域，让历史消息更容易查看和清理。

## 内容

- 左下角消息框新增 `展开 / 收起` 按钮。
- 默认仍保持小消息框，不额外占用地图视野。
- 展开后显示更大的可滚动日志区域，方便查看战斗、奖励、任务历史。
- 新消息仍会自动滚动到最新行。
- 新增 `清空` 按钮，只清理当前 UI 日志显示，不改任务、背包、战斗结果等存档数据。

## 暂不做

- 不做持久化聊天记录，本阶段仍是本地运行期消息历史。
- 不做日志分类筛选；分类消息已在聊天面板的系统 / 附近 / 队伍频道里承载。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-world-log-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-quest-ui-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-chat-panel-check
```

## 手动预览

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --world-log-panel-preview
```
