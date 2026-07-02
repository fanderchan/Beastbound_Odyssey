# Phase161：服务器档案同步最小闭环（历史阶段）

> 当前入口已经切换为服务器权威档案。本文保留为历史记录；“客户端上传影子档案”和 `PUT /profiles/me` 成功保存的说明已经废弃。

## 目标

当时目标是把 Phase160 的“服务器账号 + 档案摘要”推进成可测试的完整档案同步闭环：

- 服务器能保存和读取完整 `profile`。
- 客户端服务器登录后先拉取 `/profiles/me`。
- 服务端没有档案时，客户端曾经上传当前本地影子档案。
- 后续本地保存曾经通过 `PUT /profiles/me` 上传。
- 使用 `expectedRevision` 防止旧客户端覆盖新档。

现在这些写法已经退役：注册、登录、会话刷新和 `GET /profiles/me` 会由服务器确保默认档案存在；公开 HTTP `PUT /profiles/me` 固定返回 `403 profile_upload_denied`。

## 服务端规则

- 账号数据仍存放在 JSON 原型 store。
- 新增 `profiles` 文档区，以 `playerId` 存完整角色档案。
- `profileBindings[accountId].profileRevision` 是当前档案 revision。
- 历史版本中 `PUT /profiles/me` 成功后 revision 加 1。
- 历史版本中如果客户端传入的 `expectedRevision` 和服务器当前 revision 不一致，返回：

```json
{
  "ok": false,
  "code": "revision_conflict"
}
```

## 客户端规则

- 只有 `服务器` 登录通道启用同步。
- 本地账号继续使用原本本地存档，不触发网络同步。
- 登录成功后：
  - 有服务器档案：下载并覆盖当前服务器缓存。
  - 无服务器档案：视为服务端异常，不再上传本地影子档案。
- 账号面板显示当前服务器档案 revision 和连接状态。
- 本地保存只写缓存；玩法进度由服务端专用事务接口写入。

## 当前边界

- 这是历史阶段文档，不代表当前 MMO 权威边界。
- 当前公开 HTTP API 不再信任客户端提交完整 profile。
- 需要改角色数据时，应新增或使用服务端专用事务接口。

## 自测

```sh
cd server/node
npm test
```

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-auth-server-client-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-server-profile-sync-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 180 -- --perf-probe
```
