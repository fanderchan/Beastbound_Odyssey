# Phase133 数值版本与战斗回执契约

本阶段补的是“以后数值调参、服务端权威、战斗回放能对上账”的骨架。它不是直接改战斗强弱，而是让每一次战斗结果都能知道自己用了哪一套数值。

## 本轮结论

- 新增 `balance_sets.json`，把分散的等级曲线、人物成长、宠物成长、战斗公式、捕捉公式、奖励经济、仿真套件统一收束到一个 active balance set。
- 当前 active set 是 `phase123_core_v1`，状态为 `prototype_locked`，表示 Phase123-133 的核心数值骨架已经可以作为后续调参基线。
- `PlayerProgressModel.apply_battle_result()` 会为战斗结算追加 `battleResultReceipts`。
- 回执会记录 `balanceVersion`、`formulaVersion`、`captureFormulaVersion`、`rewardEconomyVersion`、`targetSeed`、战斗结果、奖励、捕获、击飞摘要。
- 新增 `BattleResultReceiptModel.server_projection()`，预留以后写入 MySQL `battle_result_receipts` 的最小字段。
- Phase134 后，回执还会带核心数值源文件的 SHA-256 指纹，详见 [Phase134 数值快照指纹契约](/Users/fander/projects/Beastbound_Odyssey/docs/phase_134_numeric_snapshot_digest_contract.md)。

## Active Balance Set

当前数据：

```text
balanceSetId = phase123_core_v1
balanceVersion = phase123_core_v1
formulaVersion = combat_v1
captureFormulaVersion = capture_v1
rewardEconomyVersion = battle_exp_v1
progressionVersion = progression_v1
levelCurveId = default_1_140
battleSimulationSuiteId = phase127_core
economyLedgerId = phase128_core
petPowerFormulaId = stoneage_like_v1
```

设计口径：

- `balanceVersion` 是一整套数值包，不等于单个战斗公式。
- `formulaVersion` 只代表战斗公式版本。
- `captureFormulaVersion` 只代表捕捉公式版本。
- `rewardEconomyVersion` 代表战斗经验、掉落、商店出售、修理、经济账本相关口径。
- 如果以后要调战斗手感，应新增 `combat_v2`，不要直接改 `combat_v1`。
- 如果以后只调商店、修理、掉落，应该更新经济版本，不应该假装战斗公式变了。

## 战斗回执字段

回执由 `BattleResultReceiptModel.build_receipt()` 生成，存入 profile 的 `battleResultReceipts`，默认最多保留 50 条。

核心字段：

| 字段 | 用途 |
|---|---|
| `receiptId` | 单场战斗结算 ID |
| `playerId` | 未来服务端 owner |
| `battleId` | 战斗 ID |
| `result` | `victory` / `defeat` / `escape` / `running` |
| `createdAtSec` | 生成时间 |
| `targetSeed` | 固定回放或来源 seed |
| `combatFormulaDriver` | `legacy` 或 `table` |
| `balance` | 当前数值版本摘要 |
| `rewards` | 经验、石币、道具、邮件兜底道具 |
| `capture` | 保留、丢失、自动丢弃的宠物实例 ID |
| `knockaway` | 人物、出战宠、双方 actor 击飞摘要 |

## 服务端预留

未来服务端不应该信任客户端“我获得了什么”，而应该接收或重算一份可审计结果。

第一版服务端投影字段：

```text
playerId
receiptId
battleId
result
createdAtSec
balanceVersion
formulaVersion
captureFormulaVersion
rewardEconomyVersion
balanceSourceDigest
targetSeed
sourceEncounterGroupId
expReward
stoneCoinsReward
playerKnockedAway
```

后续接 Node.js / MySQL 时建议：

- `battle_result_receipts` 只做追加，不做覆盖。
- `receiptId` 和 `playerId` 做联合唯一键。
- 服务端保存 active balance set 快照或版本号，避免旧战斗被新表解释。
- 真正发奖励时由服务端按版本重算或校验客户端回执。

## 门禁变化

`BalanceCatalogModel.validation_errors()` 现在会校验 `balance_sets.json`：

- active set 必须存在。
- active set 引用的公式、曲线、仿真套件、经济账本必须和当前 active catalog 一致。
- `serverAuthorityPolicy` 明确当前策略：客户端可预览，服务端最终拥有奖励和捕捉结果。

`NumericExperimentModel` 和 `NumericBalanceGateModel` 报告会带：

- `balanceSetId`
- `balanceVersion`
- `formulaVersion`
- `captureFormulaVersion`
- `rewardEconomyVersion`

## 自测命令

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-balance-version-receipt-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-balance-catalog-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-server-profile-contract-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-reward-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-numeric-experiment-report-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-numeric-balance-gate-check
```

当前 Phase133 窄测结果：

```text
--auto-balance-version-receipt-check: status=ok version=true receipt=true projection=true receipts=1 formula=combat_v1 driver=table errors=
```

## 后续规则

以后每次准备“核心数值晋升”时，必须回答三个问题：

1. 这次改的是整套 balance set，还是只改某个子版本。
2. 旧战斗回执用旧版本解释，新战斗用新版本解释，是否都能回放。
3. `--auto-numeric-balance-gate-check` 是否没有 fail，经济 watch 是否有解释。

如果这三个问题答不清楚，就不应该把新数值切成 active。
