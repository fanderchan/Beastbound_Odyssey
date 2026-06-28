# Phase153：账号登录与GM门禁原型

## 背景

当前客户端里的 GM/QA 面板是开发阶段为了快速测试地图、战斗、成长、背包、数值实验而做的工具。如果直接把这个入口发布给所有玩家，即便只是隐藏按钮，也存在风险：客户端代码仍然在包内，普通用户可能通过改包、脚本调用或后续漏洞触发这些能力。

本阶段先做本地原型门禁，让普通注册账号看不到 GM 功能，并且不能通过 UI 入口打开 GM/QA 面板。真正上线前还必须把 GM 权限放到服务端校验，客户端只负责展示服务端授权后的入口。

## 本阶段规则

- 普通注册账号只能得到 `player` 角色。
- GM 生效需要同时满足两个条件：
  - 账号角色是 `gm`。
  - 本地存在 GM 插件描述文件 `user://gm_tools.gmplugin.json`，并且该文件允许当前账号。
- 普通玩家没有 GM 按钮，也无法打开 GM/QA 面板或数值实验工作台。
- `--auto-*` 自测命令继续使用开发 GM 会话，避免自动回归少功能。
- 首个本地注册账号会迁移旧的 `user://player_profile.json` 到账号独立存档，避免登录系统导致旧宠物、背包、任务像是丢失。

## GM 插件文件原型

当前先用 JSON 文件模拟“独立插件存在才加载”的门槛：

```json
{
  "schemaVersion": 1,
  "enabled": true,
  "gmUsernames": ["fander"]
}
```

后续如果要做成真正类似 `.so` / `.dylib` 的原生插件，应拆成独立导出或动态加载包，并且仍然不能只靠客户端判断权限。

## 登录注册界面

正常启动：

```sh
godot --path client/godot --scene res://scenes/Main.tscn
```

会先进入登录/注册界面。注册页只创建普通玩家账号；登录后按账号独立读取存档：

```text
user://accounts/<账号>/player_profile.json
```

## 安全边界

本阶段能防止“普通玩家正常入口看到或误用 GM 功能”，但不能当成最终反作弊或权限系统：

- 客户端本地文件可以被玩家篡改。
- 客户端里的 GM 代码仍然可能被逆向发现。
- 最终生产服必须由服务端判断账号角色、GM 会话、命令白名单和操作审计。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-auth-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-qa-panel-check
```

`--auto-auth-check` 覆盖：

- 普通账号注册成功。
- 普通账号不是 GM。
- 普通账号看不到 GM 按钮。
- 普通账号不能打开 QA 面板。
- 临时 GM 插件 + GM 角色可以解锁 GM 面板。
