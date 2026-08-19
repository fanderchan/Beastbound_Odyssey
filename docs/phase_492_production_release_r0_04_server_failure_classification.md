# Phase 492：生产发布 R0.04 服务端失败分类

日期：2026-08-20
任务：`R0.04 AUTO｜重跑并分类完整服务端失败`

## 结论

R0.04 已完成，发布状态仍为 `BLOCKED`。在干净候选分支
`codex/production-release-candidate` 的提交
`caed05ed9c156c455b114016d475f13b8090e7fb` 上重跑完整服务端套件，当前事实为：

```text
tests       1975
pass        1887
fail        87
cancelled   0
skipped     1
todo        0
duration    81389.804833 ms
```

计划中旧的 `89 failure` 快照已经被本次 `87 failure` 结果取代。18 个包含失败的测试文件随后全部单独重跑，失败均可稳定复现，不是完整套件并发造成的偶发红灯。本轮没有改生产代码、测试断言或数据，只完成根因取证、分类和动态任务登记。

87 个失败按 12 个共同根因完整对账：

| 分类 | 数量 |
|---|---:|
| 真实回归 | 26 |
| 测试夹具漂移 | 60 |
| 环境前置缺失 | 0 |
| 已废弃预期 | 1 |
| 合计 | 87 |

## 执行基线

- 分支：`codex/production-release-candidate`；
- HEAD：`caed05ed9c156c455b114016d475f13b8090e7fb`；
- 对照：`origin/main=ddcb4ff770093d0ae1533631f6371b11e1ce4f30`，候选领先 4 个提交；
- Node：`v25.8.1`，满足仓库 `>=22` 合同；
- npm：`11.11.0`；
- 完整命令：`npm --prefix server/node test`；
- 原始输出：`.run/server_test_classification/r0_04_full_server.tap`，属于忽略的本机验证产物，不提交仓库。

完整运行的默认 spec reporter 对四个含嵌套子测试的 MySQL 父测试同时计父级失败，因此
`mysql-shared-transaction-integration.test.js` 的 32 个失败在“failing tests”尾表中只有
28 条叶级记录。本文与 Node 汇总统一按 `32` 计数：28 个失败叶项加 4 个失败父组。

## 根因与动态任务

| ID | 分类 | 失败数 | 受影响测试 | 已确认根因 |
|---|---|---:|---|---|
| R0.F001 | 真实回归 | 2 | `demo-seed-script.test.js` | `seed-demo-data.js` 仍要求注册后立即存在 revision-zero profile；四空槽合同下真实 CLI 在 `new disposable demo account did not have a pristine revision-zero profile` 退出。 |
| R0.F002 | 测试夹具漂移 | 12 | `auth-gm-pet-paid-reset-config` 3、`local-qa-gm-account` 4、`progression-leveling-soak` 1、`runtime-hot-collections-integration` 4 | 严格 `createAuthService` 的直接注册现在只有四个空槽；旧夹具仍立即读 binding/profile 或进入要求活动角色的领域。 |
| R0.F003 | 测试夹具漂移 | 1 | `auth-battle-riding-authority` 的离线队员骑宠写回用例 | 递增 `ride_depart_*` 在当前派生 player ID 截断后都成为 `player_ride_depart_`，第二个账号注册以 `character_profile_invalid` 失败，尚未进入目标战斗路径。 |
| R0.F004 | 真实回归 | 11 | `auth-gm-qa-assets.test.js` | GM 特权 manifest 固定 76 项，当前 bag catalog 为 81 项；缺少 3 个进化材料与 2 个芽耳布伊证书，生产命令统一返回 `gm_qa_assets_manifest_invalid`。 |
| R0.F005 | 真实回归 | 13 | `profile-migration-batch-ops` 6、`mysql-profile-migration-script` 7 | MySQL 根合同已包含 `accountCharacterSlots`，批量迁移工具没有字段分类与不变性/身份图覆盖，真实 dry-run 返回 `batch_root_contract_field_unclassified`。 |
| R0.F006 | 测试夹具漂移 | 32 | `mysql-shared-transaction-integration.test.js` 全文件 32/32 | 旧 fake harness 未建模角色槽 INSERT 和 generation 邮件控制读，所有事务进入 `shared_mysql_unknown_operation`；Phase 425 已有独立真实 MySQL 门禁通过证据。 |
| R0.F007 | 测试夹具漂移 | 1 | `mysql-large-collection-journal.test.js` | 本地提交回执已带 `scopeKind=character`、`playerId`、`selectionEpoch`，fake exact-row 重建时漏掉三字段，正确触发本地/MySQL 回执不一致和 `storage_read_failed`。 |
| R0.F008 | 测试夹具漂移 | 1 | `mysql-multi-store-concurrency.test.js` | fake loader 不返回 `accountCharacterSlots`；第一次所谓 no-op save 实际执行 legacy roster bridge、INSERT slot 并把 store revision 从 0 推到 1。 |
| R0.F009 | 测试夹具漂移 | 3 | 群弓、骑宠倒地经验、毒杀经验各 1 | 三项测试仍把请求中的 `selectedWildPet.battleStats` 当作敌宠最终属性；当前服务端按权威成长物化，输入覆盖已失效，导致固定伤害/一回合击杀前提不成立。 |
| R0.F010 | 测试夹具漂移 | 4 | `auth-social-world` 1、`pet-service-access` 3 | Firebud v2 候选移动了服务 NPC 与碰撞格；旧夹具仍把 `[5,17]`、`[8,17]`、`[11,14]` 当作兽栏、训练师或阻挡格。 |
| R0.F011 | 已废弃预期 | 1 | `auth-gm-pets.test.js` | 旧测试期待重新登录后重放同一 character-scoped GM receipt；Phase 378 已明确新登录产生新 `selectionEpoch`，此时应返回 `idempotency_key_conflict`。 |
| R0.F012 | 测试夹具漂移 | 6 | `start-backend-launcher.test.js` 全文件 6/6 | 临时仓只复制 `server-ops.js`，没有复制其新增的 `src/mysql-backup-artifact.js` 依赖；真实仓库模块存在，隔离启动失败后其余控制器用例超时。 |

计数复核：`2 + 12 + 1 + 11 + 13 + 32 + 1 + 1 + 3 + 4 + 1 + 6 = 87`。

## 关键取证

### 四角色槽切换尚未传播到旧工具与夹具

Phase 379 已确定新账号注册后只有四个空槽，不再隐式创建默认角色。失败表现与这个合同一致：

- paid reset GM 用例先得到 `character_selection_required`，而不是进入后续 GM/配置分支；
- local QA 夹具从不存在的 binding 读取 `playerId`；
- leveling soak 从失败的 `getProfile` 结果读取 `profile.player`；
- runtime hot collection 用例在 party/battle 入口拿到 `ok=false`；
- demo seed 是真实工具回归，不只是断言漂移：命令本身以非零码退出。

修复时必须显式建角与选角，不能把生产 `autoCreateInitialCharacterForTests` 默认重新打开。

### GM QA manifest 与当前目录不一致

当前 catalog 为 81 项，`qa_assets_v1` 仍只列出 76 项。精确缺项为：

```text
pet_evolution_resonance_core
pet_evolution_wuli_crystal_scale
pet_evolution_driftfox_moon_plume
bui_novice_sprout_taming_certificate
bui_novice_sprout_riding_certificate
```

`gm-qa-assets.js` 已明确规定目录新增必须创建新 manifest 版本，不能静默扩大旧特权清单。因此 R0.F004 要修生产运维能力与版本合同，不能只更新数量断言。

### 批量迁移工具真实失配

`mysqlAuthStoreRootContract()` 已把 `accountCharacterSlots` 列为持久字段；
`profile-migration-batch-ops.js` 的 `PERSISTENT_OBJECT_FIELDS` 尚未包含它。由此 plan、验证、回滚和真实 CLI dry-run 都在业务保存前 fail closed。这个保护行为本身正确，但也证明当前迁移工具不能用于现行 schema，属于真实回归。

### MySQL fake harness 与生产 MySQL 结论分开

- shared transaction 全文件单跑仍为 `0/32`，错误统一是 fake harness 不认识现行 SQL；
- Phase 425 已记录真实隔离 MySQL 组合门禁通过，并明确旧 harness 缺角色槽 INSERT 与 generation 邮件控制读；
- large journal 的本地/fake 回执逐字段对照只差 `scopeKind/playerId/selectionEpoch`；
- multi-store 调试证据显示所谓 no-op 实际执行 `INSERT INTO account_character_slots` 并推进 revision。

因此这 34 个 MySQL 红灯不能当作生产数据库失败，也不能通过接受未知 SQL 来“修绿”。必须精确升级测试模型，并继续保留未知操作 fail closed。

### 战斗失败来自不再可信的属性覆盖前提

隔离调试只读取运行事实，没有修改测试源码：

- 骑宠倒地经验夹具请求敌宠 `maxHp=1`，实际权威乌力为 `313`，人物一击后仍有 `284`，房间自然保持 `ready`；
- 毒杀夹具请求 `maxHp=15`，实际权威布伊为 `144`，毒物与首 tick 后仍有 `126`；
- 群弓夹具请求敌宠 `defense=20`，实际十只 Lv140 乌力防御为 `161..190`，九个命中目标各造成最低 `1` 点，不再是固定 `28`。

要保留测试原本验证的十目标唯一性、骑宠最后一击资格与毒来源冻结合同，应重建只能由测试注入的权威遭遇夹具，而不是恢复客户端属性覆盖。

### Firebud v2 坐标漂移

当前候选地图中兽栏 NPC 位于 `[5,20]`，宠技训练师位于 `[7,18]`；旧测试仍使用 `[5,17]` 与 `[8,17]`。同时旧阻挡样本 `[11,14]` 在新地图已经可通行。修复应从权威地图选取服务点及稳定反例，不能为了旧断言回退候选地图。

### selectionEpoch 预期已被正式合同取代

同一选角世代的 refresh 可以重放 character receipt；重新登录或重新选角会生成新
`selectionEpoch`，旧回执必须冲突。通用 GM 测试仍期待 relogin replay，属于已废弃预期，不是生产回归。

## 独立复跑

18 个失败文件均用以下形式单独执行：

```text
node --test test/<file>.test.js
```

单文件失败数：

| 文件 | tests | pass | fail |
|---|---:|---:|---:|
| auth-battle-equipment-authority | 9 | 8 | 1 |
| auth-battle-riding-authority | 7 | 5 | 2 |
| auth-battle-status-lifecycle | 5 | 4 | 1 |
| auth-gm-pet-paid-reset-config | 3 | 0 | 3 |
| auth-gm-pets | 7 | 6 | 1 |
| auth-gm-qa-assets | 13 | 2 | 11 |
| auth-social-world | 38 | 37 | 1 |
| demo-seed-script | 3 | 1 | 2 |
| local-qa-gm-account | 9 | 5 | 4 |
| mysql-large-collection-journal | 4 | 3 | 1 |
| mysql-multi-store-concurrency | 10 | 9 | 1 |
| mysql-profile-migration-script | 10 | 3 | 7 |
| mysql-shared-transaction-integration | 32 | 0 | 32 |
| pet-service-access | 4 | 1 | 3 |
| profile-migration-batch-ops | 8 | 2 | 6 |
| progression-leveling-soak | 2 | 1 | 1 |
| runtime-hot-collections-integration | 5 | 1 | 4 |
| start-backend-launcher | 6 | 0 | 6 |

这些单文件结果用于确定根因稳定性；它们不与完整套件的 1975 项总数相加。

## skip 与环境边界

唯一 skip 为：

```text
real Valkey stream relays across clients, rejects duplicate node leases,
and replays pending delivery
# BEASTBOUND_TEST_VALKEY_PORT is not configured
```

它不是失败，也没有伪装成通过。该用例明确要求隔离 Valkey 实例，本机完整服务端单元/集成套件没有获得该端口；生产相似 Valkey、跨 Node、分区和故障恢复仍由 R7/R9 的外部与 SOAK 门禁覆盖。R0.05 可保留这个有理由的 skip，但必须再次记录；不能用本次 skip 替代后续真实环境证据。

## 非目标与下一步

- 本轮没有修复任何 R0.Fxxx，没有修改断言迎合错误行为；
- 没有连接共享或生产 MySQL、Valkey，也没有读写真实玩家数据；
- 没有运行 Godot、完整本地 CI 或真实客户端，因为 R0.04 只负责服务端失败分类；
- 所有复跑与调试输出都在忽略的 `.run/server_test_classification/`，进程检查未发现本轮遗留的 Node、fake MySQL、launcher 或临时 backend；
- 服务端零失败门禁 R0.05 继续阻塞，必须按顺序完成 R0.F001–R0.F012。

下一任务：`R0.F001 AUTO｜迁移 demo seed 到显式建角与选角合同`。
