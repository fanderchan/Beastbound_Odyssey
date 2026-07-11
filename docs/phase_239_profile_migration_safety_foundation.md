# Phase239：档案迁移安全地基

## 问题复现

P0.5 审计确认旧的 `migrate-local-userdata-to-mysql.js` 会先把 MySQL 快照投影成一份手写桶列表。该列表落后于当前持久化结构，遗漏市场、离线挂机配置、家族、庄园、庄园战、战斗记录与战斗 trace。随后把这份不完整快照交给 MySQL 增量 store 时，遗漏实体会被解释成删除。

旧脚本还存在三个风险：启动即写、写前无完整备份、写后不校验非目标资产。它因此不能继续作为真实库迁移入口。

## 本阶段规则

### 1. 默认只读预演

- 不传 `--apply` 时只加载并生成报告，不调用 `save`。
- dry-run 使用只读 MySQL store：不执行 `CREATE DATABASE`、`CREATE TABLE` 或事务写入；任何代码误调 `save/saveAsync` 都会失败关闭。
- 未识别命令行参数直接拒绝，避免拼错参数后落入意外默认值。

### 2. 保留完整持久化快照

- 迁移从 store 返回的完整文档深拷贝，只修改目标账号、目标 binding、目标 profile、目标会话、目标 GM grant 和一条迁移审计。
- 市场、离线挂机配置、家族、庄园、庄园战、战斗记录、trace 以及未来未知桶保持原样。
- 迁移计划对“去掉允许变化路径后的快照”计算稳定 SHA-256；计划生成和写后重读都必须匹配。

### 3. 备份、验证与失败回滚

- `--apply` 写入前先输出完整 JSON 备份到忽略目录，文件权限固定为 `0600`。
- 写后重新读取 MySQL，核对目标账号/档案/revision/GM grant/审计、非目标快照摘要与资产计数。
- 任一核对失败或写入结果不确定时，先重读当前库，再只恢复目标账号的 before image；其他玩家、市场和家族的并发写入不会被整库回退。错误中保留目标回滚结果与备份路径。
- 未显式提供新密码时，已有账号保留密码 salt/hash；新账号仍必须提供密码。
- 密码只能通过环境变量提供，命令行 `--password` 会直接拒绝，避免密码出现在进程列表。
- 写前校验 username→accountId→binding→profile 的唯一双向关系；重复 ID、反向归属不一致、已存在但类型错误的持久化桶都失败关闭。

### 4. 显式玩家档案版本

新增纯函数迁移 registry，当前声明玩家档案版本 2：

- 缺失版本和版本 1 可迁移到版本 2。
- 版本 2 重跑完全幂等。
- 非法版本或未来版本失败关闭；批量计划中任一坏档会使整批不可应用，不允许部分迁移。
- 当前 `v1 -> v2` 只建立显式版本边界，除根 `schemaVersion` 外不改任何内容；货币、背包、银行、宠物完整事实和装备资产摘要必须一致。

## 非目标与后续

- 本阶段没有连接或写入真实玩家 MySQL，也没有把客户端/服务端默认档案切到版本 2。
- 本阶段没有补造旧宠种子、恢复历史 `lostCapturedPets` 或改任何宠物成长结果。
- 旧装备实例映射仍需先修复所有 writer，避免迁移后再次漂移；它会作为 P0.5 后续独立版本步骤处理。
- 全面 GM QA seed/refresh 仍是 P0.5 后续切片；不会复用这个会整档导入的运维入口。

## 验证

```text
node --check server/node/src/mysql-store.js
node --check server/node/src/auth/profile-migrations.js
node --check server/node/scripts/migrate-local-userdata-to-mysql.js
node --test server/node/test/profile-migrations.test.js server/node/test/local-userdata-migration-script.test.js server/node/test/auth-storage.test.js
```

结果：28/28 通过。覆盖真实 CLI 只读 MySQL 无 DDL、默认 dry-run、仅有配置且实体表为空的 MySQL 快照、完整桶保留、未来桶保留、坏桶/ID 冲突拒绝、0600 不覆盖备份、目标写后核对、并发非目标写保留、模糊写入失败的目标级回滚、版本迁移幂等与未来版本失败关闭。
