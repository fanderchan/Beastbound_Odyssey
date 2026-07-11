# Phase 215 — authority-v1 宠物转生成长周期原子重启

## 目标

本阶段完成 `P0.2c-3b`：合法 authority-v1 宠物使用转生 MM 后，必须开启一个完整、可继续练级且仍可验证的 Lv1 成长周期；损坏的目标宠或材料宠必须在开奖、写记录、删除 MM 和增加 revision 前失败关闭。

同时收紧高价值材料选择：客户端预览哪只 MM，确认请求就携带哪只 `helperInstanceId`，服务端只校验并消耗该实例，不再自行替换成另一只“分数更高”的 MM。

## 修复前复现

隔离 memory 服务中，将合法 Lv140 authority-v1 蓝人龙与合法 Lv79 authority-v1 MM1 提交 `pet_cultivation_apply`：

```json
{
  "ok": true,
  "helperStillExists": false,
  "rootLevel": 1,
  "envelopeLevel": 140,
  "publicLevel": 140,
  "responseMarker": "invalid_pet_growth_authority_v1",
  "visibleGrowthBonus": "已增加",
  "privateCultivationGrowthBonus": "仍为 0"
}
```

旧逻辑直接修改根等级与四维、删除 MM，却没有同步 `settledLevel/private.cultivation/continuousStats/public`。因此操作表面成功，实际把宠物存成不可再升级、联网客户端也会拒绝的坏档。损坏的目标宠同样会被继续转生并吞掉材料。

## 成长周期规则

本阶段锁定的 v1 转生语义：

### 永久保留

- 实例、形态、技能、锁定、绑定和来源；
- `growthSpeciesProfileId/profileId/modelVersion`；
- `petGrowth.private.privateSeed` 与由它验证出的 `privateRoll`；
- 原始 `initialStats/growthSpeciesLevel1Stats/levelOneFourV`；
- 旧周期冻结的 `cultivation.initialBonus`；
- 既有培养历史与强化等级。

### 本次新开奖

- 只生成一次 CSPRNG `rebirthRollSeed`；
- 根据目标已观察成长、被确认 MM 的等级/喂石/成长分配，产生本次百分位和四维转生成长加成；
- 本次加成与旧 `rebirthGrowthBonus` 累加，先按 0.001 档位取整，再统一量化为严格六位数值；
- `petCultivation.rebirthGrowthBonus` 与私有 `cultivation.growthBonus` 必须逐轴完全相等。

不重抽 privateSeed、privateRoll 或 Lv1 4V。因此宠物的原始极品底板仍是同一个体，转生运气只改变新周期的转生成长加成。当前 v1 以“seed + 等级”生成逐级噪声，保留 seed 也会保留同等级的噪声序列；若以后要求每转重新抽逐级波动，必须新增周期 ID/新模型版本，不能在兼容修复中暗改。

## 独立成长周期内核

`pet-growth-runtime.js` 新增纯函数 `restartPetGrowthCycle()`：

1. 完整验证旧 authority-v1 状态；
2. API 不接受新 seed，从形状上禁止重抽个体身份；
3. 拒绝修改既有 `initialBonus`；
4. 使用旧 seed/roll/profile、原 initial bonus 和新累计 growth bonus，从 Lv1 重建 continuous/public/root stats；
5. 统一写回 `level/settledLevel/public.level = 1`，按既有转生规则回满 HP；
6. 清除上一周期成长观察，之后从真实升级证据重新积累；
7. 最后再次运行 `validatePetGrowth()`；输入对象始终不变。

新增聚焦包装域 `pet-rebirth-growth-cycle.js`，从严格成长目录解析三种路由：

- `authority_v1`：预检后调用完整周期重启；
- `legacy_existing`：保持旧宠重置路径，不自动升级或重抽；
- `legacy_unlinked`：保持未链接形态的旧兼容行为。

未知模型、半截 envelope、错误根属性、错 settledLevel、可见/私有培养加成不一致，都折叠成玩家安全的 `pet_growth_state_invalid`，不会返回 seed 或内部校验细节。

## 服务端原子顺序与 MM 身份

转生事务顺序固定为：

```text
目标资格
→ 严格预检目标成长状态
→ 按 helperInstanceId 锁定实际材料
→ 材料锁定/任务/等级资格
→ 严格预检材料成长状态
→ 一次 CSPRNG 开奖并量化累计加成
→ 在临时对象完整重建、再次验证目标
→ 替换目标
→ 删除确认的 MM
→ 完成教学、revision +1、保存一次
```

任一步失败都发生在档案克隆上，不修改内部 profile；测试锁定目标、MM、历史、教学和 revision 全部不变。

Godot 预览现在返回 `helperInstanceId`，点击确认时重新读取当前预览并随目标 ID 一起提交。若旧客户端省略 helper ID：只有恰好一只合格 MM 时兼容；有多只时返回 `pet_rebirth_helper_selection_required`，绝不猜选或替换。

## 公开边界与兼容

- 成功响应与随后 `getProfile` 的 marker 继续为 `pet_growth_authority_v1`，settledLevel 为 1。
- 响应不含 `privateSeed/privateRoll/continuousStats/petGrowth.private.cultivation/rebirthRollSeed/helperGrowthWeights/rebirthBonusInternalPower`。
- 内部 profile 不持久化派生的 `growthAuthority`。
- 立即重复请求因目标已回 Lv1 而失败，不增加 revision、不新增历史、不误删 MM2。
- v1 重新练到 Lv20 已由同一 runtime 验证通过，新累计加成真实进入后续升级。
- 新增可选请求字段，不构成 HTTP/WS 破坏性变化，协议继续为 v2。
- 当前代码门槛仍是目标 Lv80、MM Lv79；历史 Phase 135 的 Lv140 设想属于 P1.2 数值/节奏决定，本次不暗改经济规则。最危险回归使用真实 Lv140 目标覆盖。

## 验证

修复前永久回归先稳定失败在：

```text
root level = 1
petGrowth.settledLevel = 140
```

修复后：

```text
pet growth runtime + rebirth cycle + profile action + visibility + EXP
  54/54 passed

30 次真实 CSPRNG 转生连续压力复测
  30/30 passed

npm --prefix server/node test
  229/229 passed
```

Godot 4.7：

```text
godot parse
--auto-pet-rebirth-mm-check
--auto-pet-rebirth-mm-formula-check
--auto-pet-growth-authority-check
--auto-pet-growth-observation-check
--auto-auth-server-client-check
  6/6 passed
```

宠物设计 inspector：

```text
服务端成长档/EXP/v1/新宠factory/转生周期/公开档/v2/客户端不重掷/被动目录
true/true/true/true/true/true/true/true/false
errors=0 warnings=26
```

性能抽样：

- idle：`process_total` 稳定约 `0.27–0.46ms`；
- moving：60 FPS，稳定约 `0.09–0.24ms`，`status=ok`；
- 真实移动连点：317 次，`avg_input_us=7`、`max_input_us=245`、`coalesced=true`、`settled=true`。

确认请求只在玩家点击按钮时额外读取一次预览，不进入 `_process/_input/_draw`。`git diff --check` 与战斗动作目录检查通过。所有服务端测试使用 memory/隔离存储，没有连接 MySQL、没有读取或修改真实玩家数据。

## 非目标与剩余风险

1. 已经由旧逻辑写坏的 authority-v1 实例不会被静默猜测修补；P0.5 需要先做只读报告，再提供显式 GM 恢复/迁移方案。
2. 客户端当前以队伍顺序选择第一只合格 MM 预览；本阶段保证“显示哪只就消耗哪只”，但还没有专门的多 MM 选择器，留给 P1.2 UX。
3. 当前未新增“骑乘/活跃战斗中的 MM 禁止消耗”的专门状态门禁；锁定、任务占用、兽栏和精确身份边界已保留，进一步材料状态保护留给 P1.2/P1.1。
4. Lv80/Lv79 还是 Lv140/Lv79 属于经济和节奏决定；没有在数据完整性修复中改动。
5. async store 的请求确认早于后台持久化失败发现，是全局持久化语义风险，不等同于本阶段内存事务失败吞 MM，需独立处理。
6. 0→1→2 转最终平衡、付费商业宠回 0 转洗点与退款审计仍属于 P1.2/P1.6。

## 涉及文件

- `server/node/src/auth/pet-growth-runtime.js`
- `server/node/src/auth/pet-rebirth-growth-cycle.js`
- `server/node/src/auth-service.js`
- `server/node/test/pet-growth-runtime.test.js`
- `server/node/test/pet-rebirth-growth-cycle.test.js`
- `server/node/test/auth-profile-actions.test.js`
- `client/godot/scripts/progression/player_progress_model.gd`
- `client/godot/scripts/ui/panel_flow_coordinator.gd`
- `client/godot/scripts/qa/auto_check_coordinator.gd`
- `.agents/skills/design-beastbound-pets/`
- `stoneage_gap_plan.md`
