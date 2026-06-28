# Phase155：账号体验补全

## 目标

Phase153/154 已经有账号登录、账号独立存档、GM 角色 + 本地插件双门禁。本阶段补普通玩家实际会用到的账号体验：

- 登录页支持记住账号。
- 登录后底部行动栏显示 `账号` 入口。
- 账号面板可查看当前账号并切换账号。
- 第一次注册迁移旧本地存档时给出明确提示。
- `--auto-auth-check` 覆盖账号面板与切换账号闭环。

## 玩家侧规则

- `记住账号` 只保存账号名，不保存密码。
- 点击 `账号` 打开小面板，显示当前角色与账号名。
- 点击 `切换账号` 会保存当前进度，然后回到登录页。
- 未登录时世界输入会被挡住，玩家必须先登录或注册。

## GM 安全边界

本阶段没有放松 GM 门禁：

- 普通账号仍然看不到 `GM`。
- 普通账号仍然打不开 GM/QA 面板。
- GM 仍需要账号角色为 `gm`，且本地存在允许该账号的 `user://gm_tools.gmplugin.json`。

这仍然只是本地原型门禁。上线前需要服务端校验 GM 会话、命令白名单和审计日志。

## 自测

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-auth-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-panel-registry-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase155_account_ux.png --quit-after 60 -- --auth-ux-preview
```

`--auto-auth-check` 覆盖：

- 普通账号注册成功。
- 记住账号写入 `lastUsername`。
- 普通账号看不到 GM。
- 普通账号不能打开 QA。
- 登录后 `账号` 按钮可见。
- 账号面板可打开并显示账号。
- 切换账号后回到登录页。
- 临时 GM 插件 + GM 角色仍可解锁 GM 面板。
