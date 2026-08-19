# Phase 503：生产发布 R0.F011 selectionEpoch 回执预期

日期：2026-08-20
任务：`R0.F011 AUTO｜更新通用 GM 回执的 selectionEpoch 预期`

## 结论

R0.F011 已完成。`auth-gm-pets.test.js` 的通用 HTTP GM durable 用例已按 Phase 378 的
character-scoped receipt 合同更新：同一选角世代内 refresh 后可以重放；重新登录或重新
选择同一角色都会产生新的 `selectionEpoch`，旧 operation ID 必须返回
`idempotency_key_conflict`。

测试同时锁定首次命令只持久化一次、只生成一条 GM 审计和一份角色作用域回执；refresh
重放、重新登录冲突及同角色重选冲突均不会重复执行 GM 命令或改写原回执。生产会话、
幂等协调器、GM 命令和 HTTP 路由均未修改。

完整服务端套件为：

```text
tests       1978
pass        1971
fail        6
cancelled   0
skipped     1
todo        0
duration    70676.18875 ms
```

相对 R0.F010 的 `1978 tests / 1970 pass / 7 fail / 1 skip`，失败数精确减少 1，
新增失败为 0。服务端发布门禁仍为 `BLOCKED`，下一游标是 R0.F012。

## 根因

旧测试在首次 `gm_map` 提交后直接重新登录，再用相同 operation ID 请求同一命令，并期待
返回首次结果。Phase 378 已把角色资产 mutation receipt 定义为：

```text
scopeKind=character
playerId=<当前角色>
selectionEpoch=<当前选角世代>
```

refresh 只轮换 token，继承同一角色和同一 `selectionEpoch`；重新登录或选角会开启新世代。
因此重新登录后的请求即使仍指向相同 `playerId`，也不能重放上一世代的角色回执，否则旧
响应可能被错误投影到当前会话。现行运行时返回 `idempotency_key_conflict` 是正确的安全
行为，失败来自测试预期已废弃。

## 更新后的验证矩阵

同一个 `bbo_generic_gm_command_0001` 现在依次覆盖：

1. **首次提交**：`gm_map` 成功，`durableCommit.replayed=false`，异步 store 只保存一次；
   回执明确保存账号、当前 `playerId`、`scopeKind=character` 和初始 `selectionEpoch`；
   GM 审计恰好一条。
2. **同世代 refresh**：新 token 与旧 token 不同，但 `playerId` 和 `selectionEpoch` 不变；
   相同 operation ID 成功重放同一 `auditId`，`replayed=true`，不新增持久写和审计。
3. **重新登录**：仍自动选择同一单角色 `playerId`，但 `selectionEpoch` 改变；相同 operation
   ID 返回 `idempotency_key_conflict`，不新增持久写和审计。
4. **同角色重新选择**：使用当前角色 `playerId` 再次选择，token/epoch 再轮换；旧 operation
   ID 仍返回冲突，不新增 GM 审计，原始回执最终逐字段保持不变。

这组断言保留了单角色兼容，同时证明隔离依据是选角世代而不是仅比较账号或 `playerId`。
已有多角色跨角色回执测试继续在相邻回归中通过。

## 验证

执行的核心命令：

```sh
git diff --check
node --check server/node/test/auth-gm-pets.test.js
node --test --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f011_after_target.tap \
  server/node/test/auth-gm-pets.test.js
node --test --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f011_adjacent.tap \
  server/node/test/auth-gm-pets.test.js \
  server/node/test/auth-durable-commit.test.js \
  server/node/test/auth-account-characters.test.js \
  server/node/test/auth-auth-session.test.js \
  server/node/test/durable-mutation-state.test.js \
  server/node/test/auth-http-server.test.js
cd server/node && node --test --test-reporter=tap \
  --test-reporter-destination=../../.run/server_test_classification/r0_f011_full.tap
```

结果：

- 修复前目标文件稳定复现 `7 tests / 6 pass / 1 fail`，失败点是重新登录后错误期待
  `ok=true`；
- JavaScript 语法与 `git diff --check` 通过；
- 目标文件 `7/7 pass`；
- GM、durable commit、角色槽、会话、receipt state 与 HTTP 相邻组合 `127/127 pass`；
- 完整服务端 `1978 tests / 1971 pass / 6 fail / 1 skip`，精确消除 R0.F011 的 1 项失败；
- 剩余 6 个稳定失败全部属于 R0.F012 的启动器测试夹具漂移；
- R0.F013 的间歇性战斗夹具本次没有出现，但仍需独立修复；
- 唯一 skip 仍是未配置 `BEASTBOUND_TEST_VALKEY_PORT` 的真实 Valkey 流测试，有既定理由；
- 测试使用内存 store、异步内存持久包装器与回环 HTTP，没有连接共享或玩家数据库。

本机原始 TAP 输出保存在忽略目录：

```text
.run/server_test_classification/r0_f011_before_target.tap
.run/server_test_classification/r0_f011_after_target.tap
.run/server_test_classification/r0_f011_adjacent.tap
.run/server_test_classification/r0_f011_full.tap
```

## 非目标与剩余风险

- 本阶段不处理 R0.F012–R0.F013，不改启动器依赖或战斗随机夹具；
- 本阶段更新的是已废弃测试预期，不改变 production receipt scope、epoch 生成或 GM 权限；
- 完整服务端仍有 6 个稳定失败，R0.05 零失败门禁尚未通过；
- 没有客户端、玩家可见行为或热路径变化，因此不需要 Godot、Main.tscn 或性能探针；
- TAP 和其他 `.run` 内容是忽略的本地生成物，不进入提交。

下一任务：`R0.F012 AUTO｜补齐启动器隔离夹具的新运维模块依赖`。
