# Phase159：客户端服务器登录预览

## 目标

把 Phase158 的 Node 账号服务接到 Godot 登录面板，但默认仍然使用本地账号，避免影响现有存档和日常测试。

## 客户端行为

- 登录面板新增通道选择：
  - `本地`：默认模式，继续使用 `user://accounts.json` 和账号独立本地存档。
  - `服务器`：请求 Node 服务的 `/auth/register` 或 `/auth/login`。
- 服务器地址默认：

```text
http://127.0.0.1:8787
```

- 服务器登录成功后，客户端暂时仍使用本地档案文件：

```text
user://server_accounts/<账号>/player_profile.json
```

这样能先联调账号和会话，不会覆盖本地账号存档。真正的服务端档案同步留到下一阶段。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-auth-server-client-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-auth-check
```

服务器联调：

```sh
cd server/node
npm start
```

然后启动客户端，登录页选择 `服务器`。
