# Phase 219 — 恢复基于实测成长的 Lv140 预测

## 结论

联网宠物成长页恢复“预测140”。Phase213 把“根据已发生升级外推未来属性”错误等同于“读取隐藏成长直接透视最终属性”，因此将该列改成“观察趋势 / 不预判”。这是错误的产品边界：前者正是抓宠后练到约 Lv20 决定去留的核心反馈，后者才是必须禁止的隐藏信息泄露。

## 玩家承诺

- Lv1 立即显示真实四项，但没有任何升级样本，预测列显示“待观察”；
- Lv2 起只根据玩家已经看见的 Lv1、当前四项和已升级次数计算 Lv140 预测；
- Lv10/Lv20 的预测会随实际成长样本变化并逐渐稳定，帮助玩家判断继续练、出售或放弃；
- 预测不是最终保证，不读取服务端 `privateSeed`、`privateRoll`、continuous stats、隐藏品质或未来逐级随机结果；
- Lv140 时预测值自然等于当前值。

## 公式

每项属性独立使用公开事实：

```text
已观察成长/级 = (当前属性 - Lv1属性) / (当前等级 - 1)
预测目标属性 = round(Lv1属性 + 已观察成长/级 × (目标等级 - 1))
```

目标等级当前固定为 Lv140。预测战力使用四项预测值重新代入正式 `PetPowerModel`，不直接用隐藏战力成长。转生页已有的公开转生增量同样允许外推，不再把目标值覆盖成“观察中”。

以用户截图中的蓝人龙为例：Lv10 生命从 65 成长到 147，已观察 `82 / 9 = 9.111/级`，因此生命预测约为 `65 + 9.111 × 139 = 1331`。这只是在陈述已发生的成长趋势，不知道下一次升级会掷出什么。

## 安全边界

预测函数只接收严格公开投影后的：

- `level`
- `growthSpeciesLevel1Stats` / `initialStats`
- 当前 `maxHp / attack / defense / quick`

自动检查向同一公开宠物注入伪造的 `privateSeed` 与 `growthSpeciesRoll` canary，预测表必须逐字节保持相同。Lv1 四项、当前四项或等级资料不足时不猜测，显示“待观察”。服务端权威、公开投影、缓存和存档格式均不改变，因此不迁移、不重滚任何宠物。

## 验证

- 临时 Pet Design Contract：`.run/pet-design/observed_lv140_forecast.json`，schema 校验通过；
- Godot 4.7 parse 通过；
- `--auto-pet-growth-observation-check` 与 `--auto-server-pet-growth-boundary-check`：3/3（含 parse）通过；
- `--auto-balance-catalog-check` 通过；`--auto-qa-panel-check` 中成长、GM 创建/升级等本阶段相关项均为 true，总状态仍被既有 `stable=false` 拖红，本阶段不混修兽栏入口；
- 回归锁定 Lv1 待观察、Lv11 四项精确线性外推、预测战力重算、私密 canary 不影响结果；
- 真实 Metal 窗口检查通过，截图 `.run/evidence/phase219/observed_lv140_forecast.png`，可见“预测140”与数值目标；
- 宠物设计 inspector、battle action catalog、`git diff --check` 均通过；
- headless 空闲 `process_total` 约 `0.29–0.50ms`，低于 Phase205 接受基线 p95 `0.58ms`；移动连点 317 次通过，稳定段 `process_total≈0.35ms @ 60FPS`、`avg/max input=17/407us`。预测只在打开或刷新宠物面板时计算，不进入逐帧热路径。

## 玩家验收

1. 重启客户端，选择一只 Lv1 蓝人龙：预测列应显示“待观察”。
2. 升到 Lv10，手工核算任一属性：`Lv1 + (当前-Lv1)/(10-1)×139`，应与预测140一致（四舍五入为整数）。
3. 再升到 Lv20：预测应根据新样本变化；成长稳定的宠变化趋小，波动大的宠仍会变动。
4. 对比两只 Lv1 四项接近但实际成长不同的蓝人龙：预测、成长/级和评级应能支持不同的去留判断。
5. 页面不得显示隐藏 seed、隐藏 roll、精确真实未来值或“最终保证”文案。

## 涉及文件

- `client/godot/scripts/progression/pet_growth_observation_model.gd`
- `client/godot/scripts/qa/auto_check_coordinator.gd`
- `docs/phase_213_pet_growth_protocol_v2_cutover.md`
- `stoneage_gap_plan.md`
