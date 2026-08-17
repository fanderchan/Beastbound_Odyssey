# Phase 474：备份新鲜度与恢复回执门禁

## 结果与范围

本阶段完成 `P3.2b`：Phase 473 已证明当前逻辑备份能够恢复，但成功结果此前只存在于终端输出，定时任务
无法可靠区分“今天产生了 dump”和“这份精确 dump 最近真的恢复过”。现在每次正式 `restore-drill` 成功后
都会发布一份本地恢复回执；`backup-status` 则重新校验最新 dump、manifest 与最新匹配回执，并按操作员
显式输入的两个时间门槛返回结构化状态和进程退出码。

本阶段没有自行决定生产 RPO/RTO，没有删除或过期任何备份，没有增加定时任务、告警接收方、对象存储、
加密密钥、binlog/PITR 或异机副本。`P3.2` 父项继续保持未完成。

## 恢复回执合同

`restore-drill` 只有在以下事实全部成立后才允许写回执：

1. dump 与 manifest 的文件名、权限、字节数、SHA-256 和单事务合同通过；
2. SQL 已在随机非 3306 的一次性 MySQL 中恢复，全部 InnoDB 表通过 `CHECK TABLE`；
3. 当前 strict store 成功读取，真实 HTTP 服务进入 ready/live；
4. 服务启动前后 schema digest、持久权威 digest 与有界计数摘要不变；
5. 临时 HTTP 服务、MySQL、端口和 datadir 均已清理。

回执写入前会再次重算 dump SHA-256；临时回执完成 `fsync` 后，在发布边界再重算一次 dump 摘要，然后以
create-once hard link 原子发布。目录固定 `0700`、文件固定 `0600`，符号链接、宽权限、非普通文件、超大
回执和重复目标均失败关闭。文件名同时包含精确备份 SHA 前缀和完整回执正文 SHA-256，内容被意外改写后
不能继续通过验证；最新匹配回执损坏时不会悄悄回退较旧绿灯。

回执只包含备份标识、字节数/摘要、MySQL 版本、表数量、schema/持久权威摘要、计数、耗时和通过布尔值，
不包含账号名、角色名、邮件正文、密码、连接串或绝对路径。它是 owner-only 本地运维证据，不是由独立
信任根签名的防伪凭证；能写入该账号备份目录的同权限攻击者仍能伪造新文件，因此异机不可变存储和独立
签名仍属于后续生产灾备设计。

## 新鲜度门禁

命令示例：

```bash
npm --prefix server/node run ops -- backup-status \
  --max-backup-age-hours 26 \
  --max-restore-age-hours 168
```

两个小时值均为必填正数，代码没有默认值。上述 `26/168` 只用于本次本地演示，不代表项目已批准“每日
备份、每周恢复”或任何生产 RPO/RTO。

门禁固定检查：

- 只认目录中按 mtime 最新的 `.sql`，重新验证其 manifest 和完整 SHA-256；最新损坏不回退；
- 只认与该 dump 文件名和 SHA 精确绑定的最新回执，重新验证权限、正文摘要和严格字段；
- 用 manifest `createdAt` 和 receipt `completedAt` 计算年龄，不信任可被 `touch` 改写的 mtime；
- 缺失、损坏、未来时间或超过任一显式时限时输出 `ok=false` 并以非零退出；
- 输出只有文件基名、摘要、版本、年龄和失败码，不暴露备份绝对路径或数据库凭据；
- 命令在读取 `.local/mysql.env` 之前执行，既不连接也不读取来源玩家库凭据。

## 当前真实证据

2026-08-17 对 Phase 473 的同一正式备份重新执行完整恢复：

- dump `14,973,952` bytes，SHA-256 `871184ac28f037e8910aa901d98c1f9aa443ce442a1352ecc891ccd5a4aeb353`；
- 隔离 MySQL `9.7.0-er2`，`33/33` InnoDB 表通过；
- schema digest `cfc7f5f9b4c6879ee976ec52d4ae89cad70d81e99330bcb19f9c217adae0c709`；
- persistent authority digest `24158ee5b69cb42a6696156eb5726ad31db99457e2ad9fbd64d822c62be99fc9`；
- import `378ms`，完整演练与清理 `5,590ms`；
- strict store、HTTP ready/live、schema unchanged、persistent authority unchanged 与四项 cleanup 全为 `true`；
- owner-only 回执正文摘要 `d9c814cb277defd341d5ea68e1478d926e3d86fe9621f51a7554caa60f2fe9c9`。

随后以本次演示阈值 `26h/168h` 执行 `backup-status`：备份年龄 `2,650s`、恢复回执年龄 `30s`，两项
`fresh=true`、`failures=[]`、`ok=true`。进程检查只看到检查命令本身，没有遗留专用 HTTP、mysqld 或
恢复演练进程；回执目录/文件权限实测为 `0700/0600`。

## 自动验证

- 新回执/新鲜度单元回归 `7/7`；
- manifest、恢复 CLI、isolated helper、server ops 组合 `24/24`；
- 扩大存储与邮箱 schema 相邻组合 `78/78`；
- 真实 `restore-drill`：`PASS`；
- 真实 `backup-status`：`PASS`；
- Node 语法与 `git diff --check`：通过。

负向测试覆盖回执缺失/过期/损坏、最新损坏不得回退、create-once、dump 变化、清理布尔未全绿、文件权限、
参数缺失/重复/零值，以及在 `mysql.env` 被替换为不可读目录时仍不读取来源凭据。

## 后续边界

`P3.2` 后续仍需由真实部署环境决定并验证：

1. 备份/恢复周期、保留与过期策略，以及不会误删最后可用恢复链的自动化；
2. 加密异机或对象存储副本、不可变/版本化存储、密钥轮换和失败告警接收方；
3. binlog/PITR、时间点选择、跨机恢复及全量加增量链路；
4. 生产候选 Linux/容器/云盘上的真实容量、备份窗口、RPO/RTO 和定期抽样恢复；
5. 与 TLS 入口、Valkey、Node owner 租约及部署编排共同完成节点/区域故障 runbook。
