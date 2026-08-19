# Phase 495：生产发布 R0.F003 骑宠离线夹具 ID 冲突修复

日期：2026-08-20
任务：`R0.F003 AUTO｜消除骑宠离线夹具的派生 ID 截断碰撞`

## 结论

R0.F003 已完成。`auth-battle-riding-authority` 的离线队员骑宠写回测试现在使用经过历史派生与截断后仍然唯一的确定性账号 ID，两个测试账号可以同时注册并进入原有战斗流程。

目标测试由失败恢复为 `1/1 pass`；整个骑宠权威测试文件为 `6 pass / 1 fail`，唯一剩余失败是已分类到 R0.F009 的“骑宠先倒下时不得获得随后击杀经验”，本阶段没有扩大范围修改它。完整服务端套件最终为：

```text
tests       1975
pass        1902
fail        72
cancelled   0
skipped     1
todo        0
duration    81395.178416 ms
```

与 Phase 494 的 `1901 pass / 73 fail / 1 skip` 相比，失败名称差集恰好是 R0.F003 的目标项，新增集为空。服务端发布门禁仍为 `BLOCKED`，下一游标是 R0.F004。

## 根因

该测试通过 `test-support/auth-service-test-context.js` 的历史兼容夹具自动建立角色。夹具从账号 ID 的前 12 个字符派生 `playerId`：

```text
player_<accountId.slice(4, 16)>
```

旧 `randomId` 依次生成 `ride_depart_1`、`ride_depart_2` 等值。账号 ID 在被截取的前 12 个字符内均只保留相同的 `ride_depart_`，最终两个角色都碰撞为 `player_ride_depart_`，第二个账号因此在注册阶段失败。原失败发生在战斗前置状态，不表示离线骑宠权威写回逻辑错误。

## 实施合同

测试夹具改为生成固定格式 `rideNNNN_dep`，把递增序号放进派生逻辑实际保留的前缀。测试同时新增三条显式保护：

- 队长与队员的派生 ID 均必须匹配 `player_rideNNNN_dep`；
- 两个派生 ID 必须不同；
- 生产服务默认值、角色领域、战斗实现和历史测试包装器均不修改。

修复只恢复测试前置状态，原有战斗与写回断言全部保留并实际执行：

- 最多 30 个确定性回合内，敌方必须命中离线前的队员骑手；
- 骑宠承伤后 `rideHpAfter=0` 且 `ridePetKnocked=true`；
- 队员断开 30 秒后被权威战斗房间和 actor 列表移除；
- 队长随后正常离开并关闭房间；
- 已离队成员档案仍写回骑宠 `hp=0`、`state=rest`，并清空 `ridePetInstanceId`。

## 验证

执行命令：

```sh
node --check server/node/test/auth-battle-riding-authority.test.js
git diff --check
node --test \
  --test-name-pattern='offline party removal preserves damaged ride facts' \
  server/node/test/auth-battle-riding-authority.test.js
node --test server/node/test/auth-battle-riding-authority.test.js
npm --prefix server/node test
```

结果：

- 语法检查与 `git diff --check` 均为 exit 0；
- R0.F003 目标测试 `1/1 pass`；
- 骑宠权威测试文件 `7 tests / 6 pass / 1 fail`，剩余失败与 R0.F009 的既有分类一致；
- 完整服务端 `1975 tests / 1902 pass / 72 fail / 1 skip`；相对 R0.F002 精确移除目标失败，新增失败为 0；
- 唯一 skip 仍是需要 `BEASTBOUND_TEST_VALKEY_PORT` 的真实 Valkey 流测试。本阶段未获得隔离端口，保持有理由 skip。

本机原始输出保存在忽略目录：

```text
.run/server_test_classification/r0_f003_before_target.tap
.run/server_test_classification/r0_f003_target.tap
.run/server_test_classification/r0_f003_full_file.tap
.run/server_test_classification/r0_f003_full_server.tap
```

## 非目标与剩余风险

- 本阶段只修复一个离线骑宠测试的 ID 前置夹具，没有修改生产代码、数据、协议、玩家 UI 或数据库；
- 完整服务端仍有 72 个已分类失败：24 个真实回归、47 个测试夹具漂移、1 个已废弃预期；
- 同文件的 R0.F009 战斗经验失败保持原状，留给其稳定任务处理；
- 未连接 MySQL、Valkey、共享后端或真实玩家资料；未运行 Godot、真实客户端、性能探针或完整本地 CI，因为本任务仅改变隔离服务端测试夹具。

下一任务：`R0.F004 AUTO｜发布与当前 81 项目录一致的新 GM QA 资产清单`。
