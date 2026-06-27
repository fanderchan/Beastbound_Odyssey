# Phase134 数值快照指纹契约

Phase133 解决了“战斗结果记录哪个版本号”，Phase134 补上“同一个版本号对应的表内容到底是不是同一份”。这是为了避免以后调表时忘记改版本号，导致旧战斗回执被新表误解释。

## 本轮结论

- `BalanceCatalogModel.balance_snapshot_summary()` 会对核心数值源文件计算 SHA-256 摘要。
- 战斗回执里的 `balance` 现在包含：
  - `sourceDigest`
  - `sourceDigestShort`
  - `sourceCount`
- `NumericExperimentModel` 和 `NumericBalanceGateModel` 会把快照指纹写进报告。
- `BattleResultReceiptModel.server_projection()` 会带出 `balanceSourceDigest` 和 `balanceSourceDigestShort`。
- 当前快照覆盖 11 个核心源文件。

## 快照覆盖范围

当前参与 digest 的文件：

```text
client/godot/data/balance/balance_sets.json
client/godot/data/balance/level_curves.json
client/godot/data/balance/player_growth.json
client/godot/data/balance/pet_growth_profiles.json
client/godot/data/balance/combat_formulas.json
client/godot/data/balance/capture_formula.json
client/godot/data/balance/reward_economy.json
client/godot/data/balance/progression_zones.json
client/godot/data/balance/battle_simulation_scenarios.json
client/godot/data/balance/economy_ledger_scenarios.json
client/godot/data/battle_rewards.json
```

覆盖原则：

- 直接影响等级、成长、战力、战斗公式、捕捉、奖励、区域收益、经济账本的文件必须进入 digest。
- 只影响 UI 文案、GM 面板、调试命令的文件不进入 digest。
- 以后如果商店、装备强化、合成、任务奖励继续表驱动化，应把对应核心经济表加入 digest。

## 为什么需要 digest

只有 `balanceVersion=phase123_core_v1` 不够，因为版本号是人维护的。digest 可以发现这些问题：

- 表内容改了，但版本号没改。
- 本地客户端和未来服务端的数值文件不一致。
- 回放某场旧战斗时，用了新表解释旧奖励。
- QA 报告和玩家存档记录的版本号一样，但实际内容不同。

这不是反作弊最终方案，但它是服务端权威前最重要的审计骨架。

## 自测结果

当前窄测：

```text
--auto-balance-version-receipt-check: status=ok version=true receipt=true projection=true receipts=1 formula=combat_v1 digest=cc7388f7d3a1 sources=11 driver=table errors=
--auto-balance-snapshot-digest-check: status=ok digest=cc7388f7d3a1 sources=11 repeatable=true report=true paths=true errors=
```

含义：

- `version=true`：active balance set 和版本字段完整。
- `receipt=true`：战斗回执写入 profile，并带同一份 digest。
- `projection=true`：服务端投影能拿到 digest 和奖励摘要。
- `sources=11`：当前 11 个核心源文件参与指纹。
- `repeatable=true`：同一套数值源重复计算 digest 结果一致。
- `report=true`：数值实验报告内的 digest 和 active balance set 的 digest 一致。
- `paths=true`：核心源文件集合覆盖等级曲线、成长、战斗公式、捕捉、经济、区域、模拟、账本与战斗奖励。

## 性能边界

快照 digest 不在 `_process`、HUD 刷新、移动寻路、战斗逐帧动画里计算。

当前调用位置：

- 数值实验报告。
- 数值晋升门禁。
- 战斗结算生成回执。
- 专用自测命令。

这些都是低频路径。后续不要把 `balance_snapshot_summary()` 放到热路径里。

## 后续规则

1. 改核心数值表时，如果要保持旧版本含义，必须能解释 digest 变化。
2. 若 digest 变化代表新平衡，应新增或晋升 `balanceVersion`。
3. 服务端接入后，战斗结果应保存 `balanceVersion + sourceDigest`。
4. 客户端只能预览数值，最终奖励、捕捉、战斗结果应由服务端根据相同 digest 的表校验。
