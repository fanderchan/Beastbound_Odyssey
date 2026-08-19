# Phase 505：生产发布 R0.F013 宠物经验战斗随机夹具

日期：2026-08-20
任务：`R0.F013 AUTO｜固定宠物经验战斗测试的随机权威夹具`

## 结论

R0.F013 已完成。`pet-exp-service-integration.test.js` 的两项战斗经验结算用例现在显式注入
仅存在于测试文件的确定性 `battleRandomAuthority`，不再把生产私密随机反应误当成固定命令
时序。生产随机实现、宠物属性、敌宠属性、伤害公式、PVE 目标选择与经验结算逻辑均未修改。

最终完整服务端套件为：

```text
tests       1978
pass        1977
fail        0
cancelled   0
skipped     1
todo        0
duration    56443.471875 ms
```

所有 R0.Fxxx 动态修复项至此完成，但本轮严格只交付 R0.F013。R0.05 零失败门禁仍保持未
勾选，下一轮将独立复核门禁证据与当前仓库状态。

## 根因与复现

单宠用例会让玩家持续防御、authority-v1 战斗宠持续攻击，直到敌宠倒下。旧夹具使用生产
`battleRandomAuthority`；敌宠连续命中测试宠时，宠物可能在敌宠之前倒地。此后玩家
`defend` 已是该回合最后一个必需命令，服务端会正确立即结算回合，而旧测试仍固定期待
`.turn === null`。

当前候选修复前的重复运行在第 4 轮复现：

- authority-v1 测试宠 `maxHp=56`，在第 10 回合前已变为 `hp=0`；
- 敌宠仍为 `45/165 HP`；
- 玩家提交 `defend` 后返回真实 `battle_event_list`，旧断言因期待 `null` 而失败。

首次只修单宠用例后，整文件重复运行又在第 40 轮暴露多人经验结算用例的同根问题。加入
公开错误码诊断后，第 8 轮再次精确复现 `battle_command_round_mismatch`：生产随机反应先
击倒了仍在固定命令清单中的 actor，上一条命令已推进回合，下一条命令自然落到旧回合。
这不是第二个产品回归，而是同一文件的第二处生产随机夹具漂移，因此与 R0.F013 一并收口。

## 实施

测试文件新增 `petExpBattleRandomAuthority()`，完整实现当前非集群战斗夹具需要的
`openRoom`、`closeRoom`、`hasRoom`、`roll` 与 `index` 生命周期：

- 敌方 PVE actor 对仍需提交命令的玩家或宠物发起可闪避攻击时，固定返回成功闪避的 roll；
- 其余反应固定返回 `0.9999`，使友方攻击命中且不产生随机暴击或反击；
- room 未打开时继续通过断言失败，不静默接受错误生命周期；
- 服务端 `partyPveAiTargetForActor`、`stableBattleIndex` 与真实 `wild_random` 目标选择没有被
  替换，随机权威只控制命中后的反应结果；
- 单宠成长和多人 legacy/authority-v1 写回用例各自持有独立 authority 实例。

`seededProductionService` 只增加可选测试 service options，并在最终服务创建时强制保留原
store 与 `allowFullProfileSave=false`。测试没有增强宠物 HP、攻击或防御，也没有修改请求中
敌宠数值来绕过服务端权威成长。

多人命令断言保留 `resolved.ok === true`，只增加公开 `code/message` 作为失败诊断，不放宽
原断言。既有断言继续覆盖：

- 服务端真实 PVE 命令、目标选择和战斗关闭；
- authority-v1 与 legacy 宠物经验写回；
- 骑宠经验、退役训练伙伴冻结和双档案写回；
- 私有成长 seed、连续属性和内部成长字段不进入公开响应、战斗记录或写回投影。

## 验证

执行的核心命令：

```sh
git diff --check
node --check server/node/test/pet-exp-service-integration.test.js
node --test --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f013_after_target_final.tap \
  server/node/test/pet-exp-service-integration.test.js
for run in $(seq 1 100); do
  node --test --test-reporter=tap \
    --test-reporter-destination=.run/server_test_classification/r0_f013_after_repeat_final.tap \
    server/node/test/pet-exp-service-integration.test.js || exit 1
done
node --test --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f013_adjacent.tap \
  server/node/test/pet-exp-service-integration.test.js \
  server/node/test/pet-exp-settlement.test.js \
  server/node/test/battle-random-authority.test.js \
  server/node/test/auth-battle-riding-authority.test.js \
  server/node/test/auth-battle-room.test.js
cd server/node && node --test --test-reporter=tap \
  --test-reporter-destination=../../.run/server_test_classification/r0_f013_full.tap
```

结果：

- 修复前目标重复在 `3 pass` 后第 4 次复现单宠提前倒地；
- 最终目标文件 `5/5 pass`；
- 最终完整文件连续 `100/100` 轮通过，共执行 `500/500` 个测试实例；
- 宠物经验纯结算、随机权威、骑宠权威与完整 battle-room 相邻组合 `94/94 pass`；
- 完整服务端 `1978 tests / 1977 pass / 0 fail / 1 skip`；
- 唯一 skip 仍是未配置 `BEASTBOUND_TEST_VALKEY_PORT` 的真实 Valkey 流测试，有既定理由；
- 目标及相邻测试使用 memory store，没有连接共享或玩家 MySQL，也没有修改真实玩家数据。

本机原始 TAP 输出保存在忽略目录：

```text
.run/server_test_classification/r0_f013_before_repeat.tap
.run/server_test_classification/r0_f013_after_target_final.tap
.run/server_test_classification/r0_f013_after_repeat_final.tap
.run/server_test_classification/r0_f013_adjacent.tap
.run/server_test_classification/r0_f013_full.tap
```

## 非目标与剩余风险

- 本阶段不改生产随机性、宠物成长、战斗公式、权威遭遇或玩家可见内容；
- 本阶段不提前完成 R0.05；下一轮仍需按 GATE 合同独立复核当前零失败证据；
- Valkey 真集成环境 skip 仍需在后续对应环境门禁中处理，本项不伪造外部依赖；
- 没有客户端、玩家可见行为或热路径变化，因此不需要 Godot、`Main.tscn` 或性能探针；
- TAP 和其他 `.run` 内容是忽略的本地生成物，不进入提交。

下一任务：`R0.05 GATE｜服务端零失败门禁`。
