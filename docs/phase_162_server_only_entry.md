# Phase162：服务器-only 入口

本阶段把账号入口从“本地 / 服务器可选”切成服务器-only：

- 玩家登录页不再显示本地账号通道。
- 登录和注册按钮始终请求本机 Node 服务。
- 正常游玩默认连接 `http://127.0.0.1:8787`。
- 账号面板以服务器通道和服务器档案 revision 为准。
- 服务器没有角色档案时，客户端会创建第一份服务器档案。

保留少量本地模型只用于内部兼容、自测和 GM 插件开发期检查；它们不再是玩家可见入口。后续功能开发默认按联网客户端处理，可以用两个账号启动两个 Godot 客户端验证交互。

## 当前边界

- Node 服务仍使用 JSON-store，适合本机联调账号、会话和档案 revision。
- MySQL 9.7 权威存储是下一阶段服务端正轨化任务。
- 邮件、组队、家族、PK 等玩家交互功能应先落服务端 API 和持久化，再接 Godot UI。

## 验证重点

- 登录页没有本地通道选择。
- 即使内部调用本地模式切换函数，也会被强制回服务器模式。
- 两个账号可以在同一个本机 Node 服务上分别注册、登录、读取和保存各自档案。

## 自动化入口

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-auth-server-client-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 5000 -- --auto-auth-server-live-check
```

`--auto-auth-server-live-check` 会通过 Godot 登录 UI 请求本机 Node 服务，注册一个临时服务器账号，并等待服务器档案创建完成。要验证多开基础，可以同时启动两个该检查进程。
