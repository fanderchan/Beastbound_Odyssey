# Phase154：GM/QA 工具模块化

## 目标

Phase153 先做了账号角色 + 本地 GM 插件文件的双门禁。本阶段继续把 GM/QA 相关逻辑从 `main.gd` 里拆出更清楚的模块边界，为后续真正的“GM 工具独立包 / 插件化加载”铺路。

## 本阶段拆分

- `scripts/progression/gm_tool_plugin_model.gd`
  - 只负责读取、判断、生成 `user://gm_tools.gmplugin.json`。
  - 提供 `installed()`、`allows_username()`、`install_local_plugin()`。
  - `AccountAuthModel` 不再直接知道 GM 插件文件结构。

- `scripts/ui/qa_panel_presenter.gd`
  - 负责刷新 GM/QA 面板入口按钮。
  - 负责刷新 GM 宠物测试下拉框和升级目标下拉框。
  - 负责 QA 面板滚动复位与布局可用性判断。
  - 不执行任何 GM 命令，具体命令仍由 `main.gd` 分发。

## 当前边界

本阶段还是“低风险模块化”，不是最终安全分包：

- 普通客户端代码里仍然存在 GM 命令实现。
- 玩家正常入口看不到 GM，也打不开 GM/QA 面板。
- 后续需要继续把 GM 命令执行层抽成独立模块，最终正式构建可以不打包 GM 模块。

## 后续建议

下一步可以继续拆：

- `QaCommandDispatcher`
  - 把 `_on_qa_entry_pressed()` 的命令分发从 `main.gd` 移出去。
  - 由主场景提供少量回调接口，如打开背包、跳地图、切变速。

- `GmToolRuntime`
  - 统一 GM 权限检查、插件加载状态、命令白名单。
  - 后续接服务端后，改成服务端返回 GM 会话和命令授权。

- 构建分包
  - 普通客户端不包含 GM 模块。
  - GM 客户端或本地插件包单独分发。
  - 服务端对每个 GM 命令做最终权限校验和审计。

## 自测

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-auth-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-qa-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-panel-registry-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
```
