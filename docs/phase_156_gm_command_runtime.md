# Phase156：GM 命令运行时门控

## 背景

Phase153/154/155 已经做到：

- 普通账号看不到 GM。
- GM 生效需要账号角色 + 本地 GM 插件文件。
- QA 面板刷新逻辑已拆到 Presenter。

但 GM 命令执行入口仍集中在 `main.gd`，只靠面板打开前的权限判断还不够清晰。本阶段补一层运行时模型，把每次 GM 命令执行都过同一套授权和审计。

## 本阶段新增

- `scripts/progression/gm_tool_runtime_model.gd`
  - `session_can_open_tools()`：判断当前会话是否能显示 GM 工具。
  - `authorize_command()`：校验账号角色、本地插件、账号授权、客户端命令白名单、插件命令授权。
  - `audit_command()`：把 GM 命令执行结果写入 `user://gm_tool_audit.jsonl`，保留最近 500 条。

- `scripts/progression/gm_tool_plugin_model.gd`
  - 插件文件支持 `gmCommands`。
  - 缺省或空命令列表写成 `["*"]`，兼容旧本地插件。
  - 支持按命令 ID 限制，例如只允许 `gm_map`。

- `main.gd`
  - `GM` 面板打开走 `GmToolRuntimeModel.session_can_open_tools()`。
  - QA 入口命令走 `_authorize_gm_command()`。
  - GM 宠物发放、GM 宠物升级也走同一个命令授权入口。

## 插件文件格式

```json
{
  "schemaVersion": 1,
  "enabled": true,
  "gmUsernames": ["fander"],
  "gmCommands": ["*"]
}
```

也可以限制命令：

```json
{
  "schemaVersion": 1,
  "enabled": true,
  "gmUsernames": ["fander"],
  "gmCommands": ["gm_map"]
}
```

## 安全边界

这还不是最终生产安全方案：

- GM 代码仍然在普通 Godot 客户端里。
- 本地插件 JSON 仍可能被篡改。
- 审计日志仍在本地。

正式上线前应继续推进：

- 普通客户端导出时不包含 GM 命令模块。
- GM 插件或 GM 客户端单独分发。
- 服务端做 GM 角色、命令白名单、参数合法性和审计的最终裁决。

## 自测

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-auth-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-qa-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-panel-registry-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
```

`--auto-auth-check` 额外覆盖：

- 临时 GM 插件能解锁 GM 面板。
- 限制为 `gmCommands: ["gm_map"]` 时，`open_backpack` 被拒绝。
- 同一限制插件下，`gm_map` 仍能执行。
- 自测前后恢复账号、插件和审计日志本地文件。
