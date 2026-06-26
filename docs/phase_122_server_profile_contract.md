# Phase122 本地存档到服务端预留

## 已实现

- 存档新增 `serverSync`：
  - `profileRevision`
  - `lastServerRevision`
  - `dirtyModules`
  - `lastLocalSaveAtSec`
- 新增服务端迁移契约模型，将本地存档拆成可迁移模块：
  - player
  - pets
  - groundPets
  - backpack
  - equipment
  - mail
  - quests
  - battleResults
  - hang
- 提供迁移预览，能统计当前 profile 各模块数量。

## 保留给后续

- 真实 Node.js / MySQL 持久化。
- 账号、角色、跨端同步。
- 服务端权威战斗和背包事务。
- 本地与服务端冲突解决。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-server-profile-contract-check
```
