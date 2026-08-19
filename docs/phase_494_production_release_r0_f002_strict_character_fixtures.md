# Phase 494：生产发布 R0.F002 严格角色测试夹具迁移

日期：2026-08-20
任务：`R0.F002 AUTO｜迁移严格注册测试夹具到四角色槽合同`

## 结论

R0.F002 已完成。四个直接使用生产严格 `createAuthService` 的测试文件不再把注册成功误当成已有活动角色，也没有打开 `autoCreateInitialCharacterForTests`。共享测试夹具现在完整执行：

```text
注册 -> 验证四个空槽 -> 显式建角 -> 验证仍需选角
     -> 以 slotIndex + playerId 显式选角 -> 验证新 token 与活动角色
```

四个目标文件由 `7 pass / 12 fail` 恢复为 `19 pass / 0 fail`。完整服务端套件最终为：

```text
tests       1975
pass        1901
fail        73
cancelled   0
skipped     1
todo        0
duration    81850.543834 ms
```

与 Phase 493 的 `1889 pass / 85 fail / 1 skip` 相比，失败名称差集恰好是 R0.F002 的 12 项，新增集为空。服务端发布门禁仍为 `BLOCKED`，下一游标是 R0.F003。

## 根因

Phase 379 已确定新账号注册后只有四个空槽，必须显式创建并选择角色。以下旧夹具仍直接读取 profile/binding，或立即进入要求活动角色的领域：

- `auth-gm-pet-paid-reset-config.test.js`：普通玩家与 GM 都在未选角 session 上访问配置领域；
- `local-qa-gm-account.test.js`：`existingAccountFixture` 从不存在的 binding 读取 `playerId`；
- `progression-leveling-soak.test.js`：从失败的 `getProfile` 结果读取 `profile.player`；
- `runtime-hot-collections-integration.test.js`：未选角账号直接进入位置、组队、战斗与事件回放。

因此原始失败是测试前置状态漂移，不是生产角色门应被放宽。

## 实施合同

新增测试专用 `server/node/test-support/selected-character-fixture.js`。它接收真实服务实例，但不修改服务选项，并强制验证：

- 注册响应必须是四个未占用槽、`selectionRequired=true`、无选中角色；
- 0 号槽通过正式 `createCharacter` 创建 `novice_hunter_v1`，默认元素为地 6、水 4、火 0、风 0；
- 建角响应仍必须停留在选角门，且产生明确 `playerId`；
- 选角同时提交 `slotIndex` 与 `playerId`，返回 token 必须与注册 token 不同；
- 新 session、选中角色与创建角色必须指向同一 `playerId`。

四个目标文件分别复用这一夹具：

- GM 配置测试继续验证命令级授权、revision、审计、档案中立和持久化失败回滚；账号展示名可以含 `GM`，角色名使用合法的“重置猎人”，没有绕过角色名安全策略；
- 本地 QA GM 测试从真实选中角色快照开始，继续证明 profile/password 保留、租约替换、撤销和精确回滚；
- 练级 soak 从显式创建的 Lv1 权威角色开始，仍走原有 Lv140 路线模拟；
- 热集合测试使用活动角色 session 进入位置、组队、战斗和事件回放，并继续覆盖重复登录的八条 session 历史上限。

没有修改生产注册默认值、角色领域、服务端入口、协议、数据文件或玩家 UI。

## 被遮蔽的目录断言

角色夹具修复后，GM 配置首项测试继续执行并暴露一个此前被前置失败遮蔽的旧数字：测试写死 `34` 个付费重置形态，而当前权威 `pet_paid_reset_policy.json` 与专用目录测试均已锁定 `36` 个形态。

本阶段没有直接把断言改成另一个裸数字，而是与现有 HTTP 测试相同，从权威 policy 的 `formPolicies.length` 取得期望值。相邻 `pet-paid-reset-policy-catalog.test.js` 继续明确验证 36 个 policy 与 36 个模板一一对应、进化/融合终局不可重置，所以没有放松目录完整性。

## 验证

执行命令：

```sh
node --check server/node/test-support/selected-character-fixture.js
node --check server/node/test/auth-gm-pet-paid-reset-config.test.js
node --check server/node/test/local-qa-gm-account.test.js
node --check server/node/test/progression-leveling-soak.test.js
node --check server/node/test/runtime-hot-collections-integration.test.js
git diff --check
node --test \
  server/node/test/auth-gm-pet-paid-reset-config.test.js \
  server/node/test/local-qa-gm-account.test.js \
  server/node/test/progression-leveling-soak.test.js \
  server/node/test/runtime-hot-collections-integration.test.js
node --test \
  server/node/test/auth-account-characters.test.js \
  server/node/test/pet-paid-reset-policy-catalog.test.js
npm --prefix server/node test
```

结果：

- 五项语法检查与 `git diff --check` 均为 exit 0；
- 四个目标文件 `19/19 pass`；
- 角色创建与付费重置目录相邻合同 `19/19 pass`；
- 完整服务端 `1975 tests / 1901 pass / 73 fail / 1 skip`；相对 R0.F001 精确移除 12 个原失败，新增失败为 0；
- 唯一 skip 仍是需要 `BEASTBOUND_TEST_VALKEY_PORT` 的真实 Valkey 流测试。本阶段未获得隔离端口，保持有理由 skip。

本机原始输出保存在忽略目录：

```text
.run/server_test_classification/r0_f002_before_targets.tap
.run/server_test_classification/r0_f002_after_targets.tap
.run/server_test_classification/r0_f002_final_targets.tap
.run/server_test_classification/r0_f002_adjacent_contracts.tap
.run/server_test_classification/r0_f002_full_server.tap
```

## 非目标与剩余风险

- 本阶段只修严格测试前置状态，没有把生产隐式建角重新打开，也没有迁移其他历史测试到共享夹具；
- 完整服务端仍有 73 个已分类失败：24 个真实回归、48 个测试夹具漂移、1 个已废弃预期；
- 未连接 MySQL、Valkey、共享后端或真实玩家资料；全部角色和档案仅存在于隔离 memory 测试；
- 未运行 Godot、真实客户端、性能探针或完整本地 CI，因为本任务仅改变服务端测试夹具和断言来源。

下一任务：`R0.F003 AUTO｜消除骑宠离线夹具的派生 ID 截断碰撞`。
