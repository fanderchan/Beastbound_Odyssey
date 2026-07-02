# Phase160：服务器账号档案摘要

> 当前入口已经切换为服务器权威档案，`storageMode=local_shadow` 只代表历史过渡阶段。

## 目标

Phase159 已经能在 Godot 登录面板选择 `服务器` 通道。本阶段把服务器账号从“只有 token”推进到“有角色档案绑定摘要”，但仍不接管完整本地大存档，避免影响当前可玩客户端。

## 行为

- Node 账号服务在以下响应中返回 `profileSummary`：
  - `POST /auth/register`
  - `POST /auth/login`
  - `GET /auth/session`
  - `GET /profiles/me`
- `profileSummary` 当前只描述服务器档案绑定：

```json
{
  "playerId": "player_xxx",
  "profileRevision": 0,
  "storageMode": "server_document",
  "serverAuthority": "profile_document",
  "hasProfile": true
}
```

- Godot 客户端会把该摘要保存到当前会话，并在账号面板显示：

```text
通道：服务器
档案：player_xxx r0
```

## 边界

- 历史阶段的 `storageMode=local_shadow` 表示完整角色档案仍在客户端本地影子存档。
- 当前阶段应返回 `storageMode=server_document` 和 `serverAuthority=profile_document`。
- 公开 HTTP `PUT /profiles/me` 已退役；角色数据写入必须走服务端专用事务接口。

## 自测

```sh
cd server/node
npm test
```

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-auth-server-client-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-auth-check
```
