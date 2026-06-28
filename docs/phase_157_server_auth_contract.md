# Phase157：账号 / GM 服务端契约预留

## 目标

这阶段不改玩家可见 UI，也不把 GM 工具继续塞进普通客户端逻辑里，而是先把未来服务端接管账号、会话、GM 授权和审计时需要的契约写清楚。

## 新增契约

新增 `ServerAuthContractModel`，覆盖：

- `accounts`：账号、展示名、角色和创建时间。
- `account_sessions`：登录会话、过期时间和撤销状态。
- `player_profile_bindings`：账号和玩家档案的绑定关系。
- `gm_user_grants`：GM 用户授权。
- `gm_command_grants`：GM 命令授权。
- `gm_command_audit`：GM 命令执行审计。
- `auth_events`：注册、登录、登出、权限拒绝等安全事件。

## 安全规则

- 正式服 GM 权限必须由服务端授予，客户端本地插件只作为开发期入口。
- 服务端重新计算 `effectiveRole`，客户端只负责隐藏入口，不能作为授权来源。
- GM 命令必须同时满足账号角色、命令授权和审计写入。
- 账号密码哈希在迁移后只留在服务端。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-server-auth-contract-check
```

预期输出包含：

```text
server auth contract check ready: status=ok
```
