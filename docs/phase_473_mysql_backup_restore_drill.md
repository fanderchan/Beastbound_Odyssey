# Phase 473：MySQL 单事务备份与隔离恢复演练

## 结果与范围

本阶段完成 `P3.2a`：本地/生产运维入口不再把“`mysqldump` 退出码为 0”当成备份可用证明。
`npm --prefix server/node run ops -- backup` 现生成单事务逻辑备份和不可覆盖的 SHA-256 清单；
`npm --prefix server/node run ops -- restore-drill` 则只在随机非 3306 回环端口的一次性 MySQL 中
恢复该文件，并用当前 Beastbound 存储读取器和真实 HTTP 服务完成启动验证。

本阶段没有向来源数据库执行恢复，也没有修改 MySQL `GLOBAL/PERSIST/PERSIST_ONLY`。真实复跑只对当前
本地玩家库执行了一次 InnoDB 一致性只读导出；导入、schema 检查、服务启动和所有验证写均发生在演练
自有的临时 datadir 中，结束后进程、端口和目录全部移除。

这项证据证明当前逻辑备份可以在同机隔离 MySQL 9.7 中恢复并被当前版本读取；它不证明异机/跨区域灾备、
binlog PITR、对象存储副本、密钥轮换、保留策略或生产 RPO/RTO，`P3.2` 父项继续保持未完成。

## 备份产物合同

`server-ops.js backup` 保留流式写入、临时 `0600` option file、`0600` partial 和成功后原子改名，并补齐：

- `--single-transaction --quick --skip-lock-tables`，让全 InnoDB 业务表来自同一一致性快照且不长时间锁表；
- dump 成功后按 1 MiB 分块计算 SHA-256，不把完整备份读入 Node 堆；
- 同目录发布 `<dump>.manifest.json`，清单只含版本、创建时间、数据库名、文件名、字节数、摘要和一致性
  合同，不含主机、用户名、密码、账号或玩家正文；
- SQL 和 manifest 均要求 owner-only 普通文件且拒绝 symlink；manifest 通过 create-once hard link 发布，
  不能被后一次命令静默覆盖；
- “最新备份”若摘要/权限/清单损坏会直接失败，不会悄悄退回更旧文件制造假绿灯。

旧的无 manifest 备份仍可人工保留，但不再被正式恢复演练当作已认证产物。

## 隔离恢复与应用验证

`tools/run_mysql_backup_restore_drill.mjs` 的固定步骤为：

1. 校验 dump 与 create-once manifest 的文件名、权限、字节数、SHA-256 和单事务合同；
2. 启动测试自有 MySQL `9.7.0-er2`，随机分配非 3306 回环端口和临时 datadir；
3. 以显式 `commands=FALSE / named-commands off / system-command=FALSE / binary-mode` 流式导入 SQL，
   禁止备份文本借 MySQL 客户端命令执行本机操作；随后要求全部业务表为 InnoDB 并运行 `CHECK TABLE`；
4. 在任何自动修表前，用当前 `createMysqlAuthStore` 的 read-only、strict-row-identity 与邮箱 lifecycle
   schema audit 完整读取权威根；
5. 对 table/column/index 生成 schema digest，对 MySQL store persistent fields 生成稳定权威 digest；
6. 使用正式 `server/node/src/http-server.js`、mysql2 pool 和当前启动围栏进入 `/health/ready` 与
   `/health/live`；子进程环境会先清除继承的全部 `BEASTBOUND_*` 和 MySQL 密码变量，只注入演练实例；
7. 优雅停止服务，再次读取 schema 与持久权威根；任何自动补 schema 或玩家持久数据变化都使演练失败；
8. 停止一次性 MySQL，确认 datadir 删除且 HTTP 临时端口不可连接。

服务启动允许按既有合同清理 runtime-only 位置/邀请/战斗房间，但这类字段不进入持久权威对比；账号、档案、
邮件、装备墓碑、市场、队伍、家族、战绩、审计和服务事件等持久字段必须逐摘要不变。

## 当前真实证据

2026-08-17 对当前本地玩家库执行新备份：

- dump：`14,973,952` bytes；
- SHA-256：`871184ac28f037e8910aa901d98c1f9aa443ce442a1352ecc891ccd5a4aeb353`；
- consistency：`mysql_innodb_single_transaction_v1`；
- dump 与 manifest 均为 `0600`，凭据 option file 在命令返回前删除。

同一产物的最终恢复演练：

- MySQL `9.7.0-er2`，随机非 3306 loopback；
- `33/33` 业务表导入并通过 `CHECK TABLE`；
- schema digest `cfc7f5f9b4c6879ee976ec52d4ae89cad70d81e99330bcb19f9c217adae0c709`；
- persistent authority digest `24158ee5b69cb42a6696156eb5726ad31db99457e2ad9fbd64d822c62be99fc9`；
- 连续正式复跑的 SQL import `366–402ms`，完整导入、严格读取、真实 HTTP ready、二次对账与清理
  `5,564–5,621ms`；
- strict store load、HTTP ready/live、schema unchanged、persistent authority unchanged 全部为 `true`；
- 临时服务、mysqld、端口和目录全部清理，来源数据库恢复写为 0。

首轮演练虽业务工作 `5.7s` 完成，但两个未取消的退出 timeout 令 shell 墙钟达到 `24.5s`。本阶段没有把假等待
算成恢复成本，而是修复恢复工具及共享 isolated-MySQL helper 的已结算 timer；最终多次 shell 墙钟为
`5.72–5.79s`，
与报告一致。

## 自动验证

- `node --check`：backup artifact、server ops、restore drill 与 isolated MySQL helper 全部通过；
- manifest/CLI/摘要/isolated helper/生命周期定向测试：`16/16`；
- 扩大存储、邮箱 schema 与 server ops 相邻组合：`70/70`；
- `git diff --check`：通过；
- 当前真实备份：`PASS`；
- 同一产物真实恢复演练最终复跑：`PASS`。

测试覆盖清单字段/版本/一致性、dump/manifest 篡改、create-once、最新损坏不得回退、权限/symlink、CLI
冲突参数、只公开计数摘要、runtime-only 不污染持久 digest，以及既有 server start/stop/restart 不误杀
外部进程。测试和真实演练均未连接共享外部玩家数据库作为恢复目标。

## 后续边界

`P3.2` 后续至少仍需：

1. 加密的异机/对象存储副本、保留和过期策略、定时调度、失败告警与定期抽样恢复；
2. binlog/PITR 和“全量备份 + 增量日志”在明确时间点的恢复门槛；
3. 在生产候选 Linux/容器/云盘上测量真实备份窗口、恢复吞吐、RPO/RTO 与容量余量；
4. 与实际 TLS 反代、Valkey、Node owner 租约和部署编排共同执行整机/节点/区域故障恢复；
5. 形成操作员 runbook、双人确认和演练记录留存，禁止把本机 5.6 秒外推为生产承诺。
