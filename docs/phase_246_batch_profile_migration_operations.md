# Phase246：批量档案迁移的备份、预演、应用与单调回滚

## 问题复现

Phase239/241 已有确定性的纯档案 registry，但 `migrateProfilesSnapshot()` 只被测试调用，没有真实的全量运维入口。原有 `migrate-local-userdata-to-mysql.js` 是单账号 userdata 导入器，会改账号、密码、会话、GM 权限和审计，不适合扩成全服 schema 迁移工具。

本阶段进一步复现了四个发布阻断：

- 纯 planner 可以在内存中保留 `unknownFutureBucket`，但 MySQL entity store 只往返固定实体表和 `server_state` 配置；未知根字段在真实 load/save 后会消失。
- MySQL 的 profile 行只往返 `playerId/accountId/profileRevision/updatedAt/profile`。内存测试中保留的额外 wrapper metadata 不能证明数据库会保留。
- 原批量 planner 不校验 username map、accountId、binding、playerId、owner 和 revision 的全局一致性。坏身份图进入增量 diff 后可能折叠或写错 SQL 行。
- 单账号脚本在 apply 模式先创建 `ensureSchema:true` store，再读取并备份；首次 `load()` 可能在逻辑备份前执行 DDL。它也没有把一次已评审 dry-run 与之后 apply 的源快照和计划绑定。

因此不能把现有纯函数或单账号导入器直接称为“可上线的全服迁移”。

## 原创 Beastbound 运维规则

### 1. 显式 MySQL 根字段合同

`mysqlAuthStoreRootContract()` 从真实 store 空快照派生字段库存，并固定三类边界：

- Phase246 建立时为 25 个持久字段；Phase247 新增同事务 `mutationReceipts` 后，当前合同为 26 个；
- `tradeOffers/playerPositions/battleInvites/battleRooms` 四个运行时字段；
- MySQL profile wrapper 允许的五个字段。

批量入口要求每个当前持久字段存在且类型正确。未知根字段、未知 wrapper 字段、缺失持久字段、非空运行时状态和残留 `battle.*` service event 全部失败关闭。纯 registry 仍可证明未知字段在内存中不变，但运维入口不会把这种证明误报为 MySQL round-trip 安全。

### 2. 全局账号身份图先于迁移

应用前统一审计：

- account map key 必须等于 document username，accountId 非空且全局唯一；
- binding map key、内部 accountId、playerId 和 revision 必须规范；
- profile map key、内部 playerId/accountId、binding owner 和 revision 必须双向一致；
- 一个 playerId 不能多绑，一个 accountId 不能拥有多份 profile；
- profile payload 必须是对象，wrapper 只能包含 MySQL 可往返字段。
- sessions、mail、market、party、family、manor、GM grant、battle/audit/auth/service event 等每个持久实体都必须有规范且唯一的内部 SQL identity；object map key 必须与内部 ID 一致，`serviceEventSeq` 不得落后于已有事件。
- 批量专用 MySQL loader 还会直接比对物理 SQL row key 与 JSON 内部 ID，避免普通 loader 重键后丢失坏行证据。

任一坏档或坏身份图都会使整批 `applySafe=false`，候选回到完整 source，不做部分迁移。

### 3. 默认只读预演同时完成回滚演练

新增命令：

```text
npm --prefix server/node run profiles:migrate
```

默认只创建 read-only store，不执行建库、建表或事务。它会在内存中完整执行：

```text
source → batch plan → candidate → reload verification
       → monotonic rollback → rollback verification
```

报告只输出计数、错误 code/path、changed playerId 和 SHA-256 摘要，不输出密码、session token、profile 内容或私有装备来源。预演给出 `sourceDigest` 与 `planDigest`，二者共同绑定随后可应用的唯一快照和候选。

### 4. 应用必须绑定预演并处于维护窗口

正式应用必须显式提供：

```text
npm --prefix server/node run profiles:migrate -- \
  --apply \
  --maintenance-confirmed \
  --expect-source-digest <dry-run sourceDigest> \
  --expect-plan-digest <dry-run planDigest>
```

工具不会代替运维人员停止服务器；`--maintenance-confirmed` 表示后端已经停止、没有在线写入。缺任一门槛会在创建 store 前拒绝。

应用顺序固定为：

```text
read-only load + plan/rehearsal
→ 核对 expected source/plan digest
→ 写 0600、create-once、带完整 snapshot 与三重摘要的逻辑备份
→ 写后回读备份并验摘要
→ 才创建 writer/执行可能的 DDL
→ writer 再 load、重算 source/plan 并防漂移
→ save(candidate) 一次
→ reload 并核对目标档案和完整非目标持久投影
```

备份默认进入忽略目录 `server/node/.local/backups/`，也可显式 `--backup-path`。若计划为 no-op，不创建备份或 writer。

### 5. 模糊提交与单调回滚

- `save()` 抛错后必须重载。只有重载快照完整等于候选时，才把它识别为“已提交但响应丢失”的成功。
- 候选未完整落地时，从当前数据库构造回滚；每个 changed profile 只有等于 source 或 candidate 才可处理。出现第三种状态时停止，不覆盖并发档案。
- 回滚只恢复 changed profile before image；市场、邮件、家族、配置、事件等全部继承回滚前 current，不做整库旧快照覆盖。
- `consumedEquipmentEnvelopes` 是永久只增墓碑。回滚保留当前墓碑，并补齐 candidate 必需墓碑，绝不删除或改写已有记录。
- 回滚后再次 reload，核对 before image、非目标 current 和墓碑单调超集。核验失败时保留备份路径并要求人工处理。

这不是“把整个数据库恢复到旧字节”。它是不会覆盖其他新事实的 profile 级单调回滚。

## 涉及文件

- `server/node/src/mysql-store.js`：真实根字段与 profile wrapper 合同。
- `server/node/src/auth/profile-migration-batch-ops.js`：根/身份审计、计划、验证和单调回滚。
- `server/node/src/auth/profile-migration-backup.js`：完整逻辑备份、摘要、0600 和回读验证。
- `server/node/scripts/migrate-mysql-profiles.js`：默认 dry-run 与受控 apply 运维入口。
- `server/node/package.json`：`profiles:migrate` 命令。
- 对应 focused Node tests。

## 非目标与残余风险

- 本阶段没有连接、备份、迁移或回滚真实 MySQL/玩家数据；全部应用路径使用 fake/in-memory store。
- 逻辑 JSON 备份不是 `mysqldump` 物理备份，也不恢复表结构。正式运维仍应在维护窗口先执行既有数据库备份流程。
- 不提供“服务器继续运营一段时间后，用旧备份强推整根回退”的命令；那会覆盖新资产。当前回滚只属于同一次 apply 的失败路径，并由每次 dry-run 做零写演练。
- MySQL store 仍没有 CAS。维护窗口和写前二次摘要是本阶段门槛；多 Node/在线迁移属于 P0.6。
- Phase246 当时普通请求仍可能早于 async MySQL durable commit 返回；该历史风险已由 Phase247/P0.5c-2 的请求私有 candidate、COMMIT gate 与 operation receipt 修复。
- 全面 GM QA 档案属于 P0.5d。

## 验证证据

```text
node --check server/node/src/mysql-store.js
node --check server/node/src/auth/profile-migrations.js
node --check server/node/src/auth/profile-migration-backup.js
node --check server/node/src/auth/profile-migration-batch-ops.js
node --check server/node/scripts/migrate-mysql-profiles.js
node --test server/node/test/profile-migrations.test.js server/node/test/profile-migration-backup.test.js server/node/test/profile-migration-batch-ops.test.js server/node/test/mysql-profile-migration-script.test.js server/node/test/auth-storage.test.js
node -e 'JSON.parse(require("node:fs").readFileSync("server/node/package.json", "utf8"))'
git diff --check
```

结果：五个聚焦测试文件共 `52/52` 通过。覆盖真实 CLI 默认只读无 DDL/DML、根字段合同、unknown/wrapper/runtime 拒绝、全持久实体 identity/碰撞、物理 SQL row key 漂移、账号身份图冲突、确定性摘要、0600 不覆盖备份、备份先于 writer、writer 初始化失败仍返回备份路径、写前漂移与篡改计划零保存、一次候选提交、凭据脱敏、模糊提交完整命中、非目标并发保留、第三状态拒绝覆盖和永久墓碑单调回滚。未运行无关完整服务端套件或本地全 CI。

## 玩家验收建议

本阶段没有玩家画面、手感或数值变化，不需要试玩。验收对象是运维 JSON 报告与自动测试；正式库首次执行只应先做默认 dry-run，由维护人员审阅两个摘要和冲突清单，不能直接复制示例进入 apply。
