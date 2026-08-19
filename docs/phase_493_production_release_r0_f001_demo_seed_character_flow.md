# Phase 493：生产发布 R0.F001 demo seed 显式建角与选角

日期：2026-08-20
任务：`R0.F001 AUTO｜迁移 demo seed 到显式建角与选角合同`

## 结论

R0.F001 已完成。隔离的 memory/JSON demo seed 不再假定注册会隐式创建档案，而是严格执行：

```text
注册账号 -> 验证四个空槽 -> 在 0 号槽显式创建角色
         -> 验证仍停留在选角门 -> 显式选角并接收新 token
         -> 从选中角色的 revision-zero 档案造演示数据
```

目标测试由 `1 pass / 2 fail` 恢复为 `3 pass / 0 fail`。完整服务端复跑最终为：

```text
tests       1975
pass        1889
fail        85
cancelled   0
skipped     1
todo        0
duration    81730.393708 ms
```

与 Phase 492 的 `1887 pass / 87 fail / 1 skip` 相比，失败集合只移除了两项 demo seed 用例，没有新增失败。服务端发布门禁仍为 `BLOCKED`，下一游标是 R0.F002。

## 根因

Phase 379 已把正式账号合同改为“注册后四个空槽、无活动角色、无档案绑定”。旧 seed 脚本仍在注册后立即读取 `profileBindings` 和 revision-zero profile，因此真实 CLI 在首个账号处以以下错误退出：

```text
new disposable demo account did not have a pristine revision-zero profile
```

这不是断言漂移，而是运维工具无法生成演示夹具的真实回归。修复不能重新打开生产隐式建角，也不能用测试包装器掩盖正式流程。

## 实施合同

`server/node/scripts/seed-demo-data.js` 现在对每个一次性演示账号执行并验证：

- 注册后必须返回四个未占用角色槽，且要求玩家选角；
- 用正式 `createCharacter` 领域接口在 0 号槽创建 `novice_hunter_v1`，元素为合法的地 6、水 4、火 0、风 0；
- 建角成功后必须仍停留在选角门，不能隐式进入角色；
- 用正式 `selectCharacter` 接口同时提交槽位与 `playerId`，并使用轮换后的新 session token；
- 造数前确认 0 号槽、活动 binding、session、角色和档案指向同一 `playerId`，其余三槽为空，binding 与档案 revision 均为 0；
- 造数前仍检查宠物、地面掉落、训练伙伴及成长私密状态为空，再通过已有受限 `saveProfile` seed 闸门一次写入演示档案。

没有改动生产注册默认值、角色领域、HTTP 协议、MySQL schema 或玩家端 UI。

## 安全与隐私

- 脚本仍只允许隔离 memory/JSON store；`--store mysql` 在连接前拒绝；
- 既有输出没有 `--reset-output` 时仍拒绝覆盖，失败后原文件字节不变且不生成第二份报告；
- JSON store 内部保留服务端权威宠物成长私密种子，这是可继续运行的权威夹具所需状态；
- 标准输出和可选报告只含演示摘要。回归测试明确拒绝 `privateSeed`、`privateRoll`、`growthSpeciesSeed` 和 `private` 成长对象进入报告；
- 本阶段没有连接 MySQL、Valkey、共享后端或真实玩家资料。

## 验证

执行命令：

```sh
node --check server/node/scripts/seed-demo-data.js
node --check server/node/test/demo-seed-script.test.js
git diff --check
node --test server/node/test/demo-seed-script.test.js
node --test server/node/test/pet-exp-service-integration.test.js
npm --prefix server/node test
```

结果：

- 两项语法检查与 `git diff --check` 均为 exit 0；
- demo seed 目标测试 `3/3 pass`，覆盖 JSON 一次性生成/拒绝复用/显式 reset、MySQL 预连接拒绝、memory 不覆盖、四槽绑定、合法外观与元素、权威私密成长留存及报告脱敏；
- 第一次完整服务端运行得到 `1888 pass / 86 fail / 1 skip`：两项 demo seed 失败均已消失，但未修改的 `pet-exp-service-integration` 战斗轮次用例出现一项新红灯；
- 该文件随即隔离复跑 `5/5 pass`，证明新红灯不可复现；第二次完整套件得到 `1889 pass / 85 fail / 1 skip`，相对 Phase 492 的失败名称差集恰好是两项 demo seed，用例新增集为空；
- 唯一 skip 仍是需要 `BEASTBOUND_TEST_VALKEY_PORT` 的真实 Valkey 流测试。本阶段未获得隔离 Valkey 端口，保持有理由 skip，不能替代后续生产相似门禁。

本机原始输出保存在忽略目录：

```text
.run/server_test_classification/r0_f001_before_target.tap
.run/server_test_classification/r0_f001_after_target.tap
.run/server_test_classification/r0_f001_final_target.tap
.run/server_test_classification/r0_f001_pet_exp_isolated.tap
.run/server_test_classification/r0_f001_full_server.tap
.run/server_test_classification/r0_f001_full_server_rerun.tap
```

## 非目标与剩余风险

- 本阶段不修 R0.F002–R0.F012，也没有修改其生产逻辑或测试夹具；
- 完整服务端仍有 85 个已分类失败：24 个真实回归、60 个测试夹具漂移、1 个已废弃预期；
- 未运行 Godot、真实客户端、性能探针或完整本地 CI，因为本任务仅改变隔离服务端 seed 工具及其回归测试；
- Phase 197 记录的是早期可复用/MySQL seed 方案，现行安全合同以本阶段的一次性 memory/JSON、拒绝 MySQL 方案为准。

下一任务：`R0.F002 AUTO｜迁移严格注册测试夹具到四角色槽合同`。
