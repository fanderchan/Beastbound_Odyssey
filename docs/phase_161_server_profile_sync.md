# Phase161：服务器档案同步最小闭环

> 当前入口已经在 Phase162 切换为服务器-only。本阶段中“本地账号继续使用原本本地存档”的说明只代表当时的过渡状态。

## 目标

把 Phase160 的“服务器账号 + 档案摘要”推进成可测试的完整档案同步闭环：

- 服务器能保存和读取完整 `profile`。
- 客户端服务器登录后先拉取 `/profiles/me`。
- 服务端没有档案时，客户端上传当前本地影子档案。
- 后续本地保存会通过 `PUT /profiles/me` 上传。
- 使用 `expectedRevision` 防止旧客户端覆盖新档。

## 服务端规则

- 账号数据仍存放在 JSON 原型 store。
- 新增 `profiles` 文档区，以 `playerId` 存完整角色档案。
- `profileBindings[accountId].profileRevision` 是当前档案 revision。
- `PUT /profiles/me` 成功后 revision 加 1。
- 如果客户端传入的 `expectedRevision` 和服务器当前 revision 不一致，返回：

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
  - 有服务器档案：下载并覆盖当前服务器影子存档。
  - 无服务器档案：上传当前服务器影子存档，生成第一个服务器 revision。
- 账号面板显示当前服务器档案 revision 和同步状态。
- revision 冲突时停止继续上传，并在消息栏提示用户重新登录或重新拉取。

## 当前边界

- 这不是最终 MMO 权威服，只是本地 Node JSON-store 同步闭环。
- 暂不做 MySQL、分模块增量同步、断线队列、三方合并或多端自动冲突解决。
- 服务器端仍信任当前登录会话提交的完整 profile，后续需要按模块转为服务端事务。

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
