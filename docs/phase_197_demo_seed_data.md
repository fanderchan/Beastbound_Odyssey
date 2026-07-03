# Phase197：干净演示库种子脚本

本阶段补齐 `stoneage_gap_plan.md` 的 G9.3：为外部演示或干净测试库准备一条可重复运行的 demo seed 路径，避免继续依赖本机已有的历史测试账号。

## 原版参考

只做机制级参照，没有复制 StoneAge 8.0 的源码、数值、地图、NPC 脚本或美术：

- `/Users/fander/projects/_local_references/StoneAge/saac/src/db.c`：账号/角色数据由服务端持久化。
- `/Users/fander/projects/_local_references/StoneAge/gmsv/src/char/encount.c`：首玩需要能快速进入野外遇敌。
- `/Users/fander/projects/_local_references/StoneAge/gmsv/src/char/family.c` 与 `saac/src/acfamily.c`：家族是长线社交入口。
- `/Users/fander/projects/_local_references/StoneAge/gmsv/src/npc/npc_manorsman.c` 与 `gmsv/data/npc/family/manorsman.arg1`：庄园入口与战期配置属于服务端权威状态。

## Beastbound 原创规则

新增脚本：

```sh
npm run seed:demo --prefix server/node -- --store mysql
```

新增回归测试：

```sh
server/node/test/demo-seed-script.test.js
```

默认创建或复用 4 个演示账号：

| 账号 | 展示名 | 用途 |
| --- | --- | --- |
| `demo_leader` | 演示族长 | 家族、庄园、战斗强度演示 |
| `demo_member` | 演示队友 | 组队/家族成员视角 |
| `demo_rival` | 演示挑战者 | 对手家族视角 |
| `demo_guest` | 演示旅人 | 普通新手视角 |

默认密码是 `DemoPass123`，可用 `--password` 或 `BEASTBOUND_DEMO_SEED_PASSWORD` 覆盖。脚本通过 `createAuthService` 走同一套账号、档案、家族、庄园规则，不直接写表，不绕过服务端校验。

## 安全边界

- 默认 MySQL 路径会读取 `server/node/.local/mysql.env`，但不会清空数据库。
- 重复运行会登录复用 demo 账号，并把档案补到“至少”演示强度；不会累加刷资源。
- 需要干净演示库时，先指向新的 MySQL database 或用 `--store json --output <file>` 生成独立 JSON store。
- 当前验证没有写入本机历史 MySQL 库，避免污染用户正在验收的环境。

## 常用命令

```sh
# 验证逻辑，不碰 MySQL
npm run seed:demo --prefix server/node -- --store json --output .run/demo_seed/json-auth-store.json --reset-output

# 在干净 MySQL/demo 库执行
BEASTBOUND_MYSQL_DATABASE=beastbound_odyssey_demo \
npm run seed:demo --prefix server/node -- --store mysql

# 只要账号/档案/家族，不预置庄园占领
npm run seed:demo --prefix server/node -- --store mysql --skip-manor
```

## 验证

```sh
node --check server/node/scripts/seed-demo-data.js
node server/node/scripts/seed-demo-data.js --store memory --output .run/demo_seed/memory-auth-store.json --reset-output --report .run/demo_seed/memory-seed-report.json
npm run seed:demo --prefix server/node -- --store json --output .run/demo_seed/json-auth-store.json --reset-output --report .run/demo_seed/json-seed-report-1.json
npm run seed:demo --prefix server/node -- --store json --output .run/demo_seed/json-auth-store.json --report .run/demo_seed/json-seed-report-2.json
npm test --prefix server/node
```

证据：

- 语法检查 exit 0。
- memory seed：`ok=true`，4 accounts / 4 profiles / 2 families / 1 manor / 1 manor battle / 1 manor war。
- JSON seed 第一次：账号 `created`，主家族 2 人，占领 `firebud_manor`。
- JSON seed 第二次：账号 `reused`，家族 `already_joined`，庄园 `already_owned`，counts 保持 4 accounts / 2 families / 1 manor。
- `npm test --prefix server/node`：92/92 pass，包含 `demo seed script creates reusable json seed data`。
