# Node 权威服务端

Node.js 22+、CommonJS、原生 `node:http` / `node:test`。正常运行使用 MySQL 9.7；memory / JSON 仅用于明确隔离的测试和工具。服务端负责账号、角色、档案、经济、宠物、任务、移动接受、社交与战斗结算。

[项目现状](../../docs/project-status.md) · [架构定位](../../docs/architecture.md) · [服务端约束](AGENTS.md) · [测试指南](../../docs/testing.md)

## 本地启动和运维

以下从仓库根目录执行：

```sh
npm --prefix server/node ci
npm --prefix server/node run ops -- status
npm --prefix server/node run ops -- start
```

其余运维动作由 `ops -- backup`、`ops -- stop`、`ops -- restart` 提供。根目录 `start-backend.command` 是双击重启入口；`npm --prefix server/node start` 是前台运行入口。

正常配置位于已忽略的 `.local/mysql.env`；使用已有本地配置，不把凭据放入代码或命令行。建库、迁移、seed 和 live smoke 具有写入副作用，不能作为普通启动或代码检查步骤随手执行。

默认 HTTP 监听 `127.0.0.1:8787`，由 `BEASTBOUND_AUTH_HOST`、`BEASTBOUND_AUTH_PORT` 配置。外部可达部署须先满足网络准入与可信 TLS 代理合同，见 [Phase 467](../../docs/phase_467_trusted_tls_public_edge_contract.md)。

## 代码职责

| 文件/目录 | 职责 |
| --- | --- |
| [src/http-server.js](src/http-server.js) | HTTP/WS 装配、薄路由、生命周期 |
| [src/http-list-options.js](src/http-list-options.js) | URL 分页参数到领域请求的适配 |
| [src/auth-service.js](src/auth-service.js) | 共享权威根、服务组合、领域依赖 |
| [src/auth/](src/auth/) | 按功能组织的业务规则、事务与投影 |
| [src/mysql-store.js](src/mysql-store.js) | 运行时 schema 与增量持久化 |
| [src/protocol.js](src/protocol.js) | 协议号、兼容窗口与响应元数据 |
| [test/](test/)、[test-support/](test-support/) | 行为回归、隔离存储、共享夹具 |
| [scripts/](scripts/) | 启停、备份、迁移、seed 与专项审计 |

双端共享数据在 `client/godot/data/`。早期 `database/mysql/001_auth_schema.sql` 不代表当前数据库结构。

## 接口与权威边界

完整路由以 `http-server.js` 和相应 HTTP 测试为准；阅读接口时先定位领域函数，再看请求/响应契约。主要类别包括认证/角色、档案动作、世界移动、战斗、商店/装备/交易、邮件/奖励仓、队伍/聊天/家族及 GM。

- 非健康请求和 WS 连接按协议合同携带客户端版本；版本常量以 `src/protocol.js` 和客户端 `ServerAuthClientModel` 为准。
- `PUT /profiles/me` 对玩家关闭。成功的领域修改返回权威结果及档案 revision；客户端不能上报奖励、胜负、价格或最终资产数量。
- GM 授权在服务端检查账号角色与命令权限并记审计。隐藏按钮不构成权限控制。
- 资产写入遵守领域的幂等回执和事务规则；存储失败不得报告成功。提交结果不明确时使用精确回执和限定范围重读，不能盲目重试。
- WS 只分发已授权事件，不建立另一套写入权威。跨节点重连、租约和恢复能力须以对应专项证据为准，不能由单机通过推断生产容量。

列表查询适配保留现有差异：收件箱允许无分页的兼容请求，归档和奖励仓必须显式给出合法 limit；重复参数、无效游标等仍由既有规则拒绝。相关代码与回归见 [HTTP 参数模块](src/http-list-options.js) 和 [测试](test/http-list-options.test.js)。

## 验证

```sh
node --check server/node/src/http-server.js
node --test server/node/test/auth-http-server.test.js
node --test server/node/test/http-list-options.test.js
```

按领域选择最窄测试；完整服务端入口是 `npm --prefix server/node test`。普通测试使用 memory/隔离 store，live 数据库检查必须明确使用一次性环境。

HTTP/WS 或存档交互存在真实不兼容变化时才协调升级协议。纯模块提取、UI/文案或资源调整通常不改协议号。

## 存储与运维证据

- 新持久实体必须同时维护 normalization、snapshot、MySQL schema/load/diff/save 与存储测试；保持增量写入。
- 不把运行态位置、邀请、战斗房间和面对面报价意外纳入持久快照。
- MySQL 可能由多个应用共用；连接策略限于 Beastbound 自有连接的 `SET SESSION`。不得修改全局配置或重启数据库作为游戏优化。
- 备份与恢复工具及其限制见 [Phase 473](../../docs/phase_473_mysql_backup_restore_drill.md)、[Phase 474](../../docs/phase_474_backup_freshness_restore_receipt_gate.md)。已有本地证据不等于异地/PITR/生产 RPO/RTO 验证。

旧配置示例、历次接口与子系统说明保留在 [服务端历史手册](../../docs/bak/handbooks_20260917/server-readme.md)。使用前按当前代码和最近 Phase 核实，尤其不要把旧接口列表当作完整合同。
