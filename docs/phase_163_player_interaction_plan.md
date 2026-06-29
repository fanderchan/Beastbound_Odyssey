# Phase163：玩家交互 4 小时纵切

目标：在服务器-only 入口之后，做第一个可以用两个客户端验证的玩家交互纵切。优先选择“文本邮件 + MySQL 持久化”，因为它风险低、闭环清楚，并且会沉淀后续组队、家族、PK 都要复用的账号查找、玩家身份、服务端持久化和双客户端验证流程。

## 已落地内容

1. MySQL 持久化起步
   - 新增 `server/node/src/mysql-store.js`。
   - 用环境变量配置 MySQL 连接，默认仍回退 JSON-store 便于自测。
   - 建表：`accounts`、`sessions`、`profiles`、`mail_messages`、`server_state`。
   - 现阶段 MySQL store 镜像服务端文档和关键表，后续再拆成真正事务模型。

2. 邮件服务端 API
   - `GET /players/search?username=...`：按账号名查找收件人。
   - `POST /mail/send`：发送文本邮件，服务端写入发件人、收件人、标题、正文、时间。
   - `GET /mail/inbox`：读取当前账号收件箱。
   - `POST /mail/{mailId}/read`：标记已读。
   - 本阶段不做物品附件，避免先碰背包经济安全边界。

3. Godot 邮件 UI
   - 复用现有 `邮箱` 入口，接服务器收件箱。
   - 新增“写信”区：收件账号、标题、正文、发送。
   - 收件箱支持刷新、查看详情、标记已读。
   - 系统奖励附件仍在本地 profile 邮箱领取；玩家邮件第一版只支持文本。

4. 双账号验证
   - 启动 Node 服务。
   - A 给 B 发邮件。
   - B 刷新收件箱看到邮件并标记已读。
   - `--auto-server-mail-live-check` 覆盖 Godot 端真实联网收件箱 UI。

## 验证入口

```sh
cd server/node
npm test

godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3200 -- --auto-auth-server-client-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 6000 -- --auto-server-mail-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3200 -- --auto-mailbox-check
```

## 后续顺序

- Phase164：在线名册和组队邀请，先做邀请/接受/离队/队长，不急着接战斗同步。
- Phase165：家族创建、加入、成员列表、公告，先做社交壳和权限。
- Phase166：PK 邀请和切磋房间，先做双方同意、服务器生成战斗房间和战斗种子，再接完整战斗权威。

## 验收口径

- 所有玩家交互都必须经过 Node 服务。
- 两个客户端不能通过本地文件互相影响。
- 普通玩家 UI 不显示调试字段、原始 token 或测试说明。
- 自动化至少覆盖服务端 API、Godot HTTP 解析、双账号不串数据。
