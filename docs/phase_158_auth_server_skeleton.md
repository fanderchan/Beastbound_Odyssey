# Phase158：账号服务端最小骨架

## 目标

Phase157 先把 Godot 侧账号 / GM 服务端契约写清楚。本阶段开始落 Node.js 骨架，但不强行替换现有客户端登录：

- 先让后端能独立跑注册、登录、会话查询。
- GM 权限由服务端计算，不相信客户端隐藏按钮。
- GM 命令按命令 ID 授权，并写审计。
- MySQL 先有 schema，实际运行先用内存或 JSON store，避免现在就引入数据库依赖。

## 后端入口

```sh
cd server/node
npm test
npm start
```

默认本地服务：

```text
http://127.0.0.1:8787
```

## 接口

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/session`
- `GET /profiles/me`
- `GET /gm/tools`
- `POST /gm/commands/{commandId}`

## 数据表

SQL 位于：

```text
database/mysql/001_auth_schema.sql
```

包含：

- `accounts`
- `account_sessions`
- `player_profile_bindings`
- `gm_user_grants`
- `gm_command_grants`
- `gm_command_audit`
- `auth_events`

## 当前边界

- 还没有接 MySQL adapter。
- 还没有让 Godot 客户端切到远程登录。
- 还没有做运营后台授予 GM 权限的 UI。
- 本阶段先保证后端规则能被测试固定下来，后续再接客户端和数据库。
