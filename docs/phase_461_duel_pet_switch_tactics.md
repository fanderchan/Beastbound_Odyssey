# Phase 461：切磋换宠元素预判

## 玩家承诺与参考边界

本阶段把 Phase 460 已经公开的切磋元素读牌延伸到“换哪只宠”这一层：玩家在服务端权威 `duel`
房间打开换宠菜单时，仍可出战的待机宠会根据当前唯一一只敌方出战宠，显示换上后的 `克制 +N%`、
`受制 -N%` 或 `均势`。玩家因此能在提交换宠前做一次可读选择，不必背诵四元素矩阵，也不会看到
对手未出战宠或其他私有信息。

本地 StoneAge 8.0 参考只用于确认成熟战斗应当有明确的宠物换入／换出动作与状态区分；元素预判是
Beastbound 基于自身公开元素合同补出的原创信息层，不复制参考项目的数据、界面或素材。普通 PvE、自动
战斗、人物命令、伤害结算和宠物养成均不改变。

## 权威、数据与实例合同

| 项目 | 合同 |
| --- | --- |
| 敌方信息 | 只读取服务端已公开的当前存活敌方出战宠 actor `elements`；不读取或推断敌方后备宠 |
| 我方信息 | 只读取本账号 `teamSnapshot.battlePets` 中已有的宠物实例元素和战斗状态 |
| 公式来源 | 复用 `data/balance/combat_formulas.json.elementMatchup` 与既有 `BattleElementTacticsModel` |
| 生效范围 | 仅服务端权威 `duel`，且场上恰好一只存活敌方宠；普通 PvE 和多敌宠场景隐藏预判 |
| 实例影响 | 全程只读；不创建、不改写、不持久化宠物实例，不改变出战／待机／休息状态 |
| 动作与事件 | 继续提交既有 `switch_pet` 指令并消费既有换宠事件；无新 HTTP／WS 字段或事件 |
| 失败回退 | 任一方元素缺失、非法或不满十点时显示普通 `待机`，不猜测、不显示错误倍率 |
| 协议 | 没有不兼容改动，不提升客户端／服务端协议版本 |

## 交互与视觉合同

- 每个真实宠物槽固定两行：首行为最长六个显示字符的宠物名，超长名以省略号收口；第二行为
  `出战中`、`休息`、`待机` 或元素预判。完整名字和当前敌宠只放在鼠标提示中。
- 克制沿用绿金、受制沿用珊瑚红、均势使用骨金；普通状态保持原有奶油白。颜色只强化换宠候选条目的
  决策含义，不增加闪烁、粒子、弹窗或第三行说明。
- 换宠条目统一使用召唤图标，`返回` 使用返回图标；不再继承攻击、精灵、物品等无关图标。
- 菜单只显示实际存在的宠物槽和 `返回`，空槽不占位；五宠夹具由固定四行空面板收紧为三行、
  220 px 高，并保持底边对齐。
- 标签启用裁切与省略，1280×720 下所有文字都在按钮和面板边框内。没有新增位图、动画或音效资产，
  因而本阶段不产生新的美术 owner-approval 门。

## 实机视觉与性能证据

隔离 `automation` QA lane 的正常 `Main.tscn`、macOS／Metal Mobile、1280×720 实机已生成换宅读牌静帧：

```text
.run/evidence/phase461_duel_pet_switch_tactics/
  duel-pet-switch-tactics-1280x720.png
```

静帧 SHA-256 为 `2366572bad4bdeb9925825f61a7271520330b3528b7f21699325da9340d4b9af`。人工复核确认五只
宠与返回共六个按钮，无空槽；长名字安全省略，克制／受制／均势三种颜色层级清楚，图标语义统一，三行
面板没有遮挡右侧命令或越过屏幕。该确定性战斗夹具仍使用普通战斗的现有灰色回退背景，只证明本阶段的
换宠 UI 密度、层级和边界，不把它冒充正式竞技场美术。

正式 20 actor 真实输入性能门以同一正常客户端路径复测，结果为
`status=passed / finalStatusAuthority=true / 21/21 gates`：

| 状态 | 最低／raw FPS | 帧间隔 P95 | `process_total` P95 | `draw_battle` P95 |
| --- | ---: | ---: | ---: | ---: |
| idle | 59.4／59.718 | 17.273 ms | 0.08 ms | 4.38 ms |
| command selection | 57.0／58.343 | 17.097 ms | 0.09 ms | 4.70 ms |
| target switch | 53.1／57.513 | 18.859 ms | 0.09 ms | 4.81 ms |

其中完成 25 次真实跨帧左键、8/8 相邻目标命中，HUD passthrough 为 `0`；起止窗口均在前台，VSync／
60 FPS／1280×720 条件一致。相较 Phase 460 的 `draw_battle` P95 `4.06/4.13/4.15 ms` 有小幅波动，
但仍远低于既有门槛，不宣称零回归。最终报告：

```text
.run/evidence/phase461_duel_pet_switch_tactics/performance/
  phase461-duel-pet-switch-tactics-after/summary.json
```

报告 SHA-256 为 `624ee79efd3d2b35c17bdbdddb82b5d96906658d9aaaa7c9816011370c829621`。性能与定向检查结束后
QA lane 均已清理，真实玩家目录 inventory SHA-256 前后保持
`7449c42df1c39fb6adf41797c7a6c5652f5bd10d2233055f526ff87275795ce4`。

## 验证结果与已知测试债

- `node tools/run_godot_auto_checks.mjs
  --only=--auto-battle-switch-pet-check,--auto-server-battle-target-mapping-check --fail-fast
  --timeout-ms=180000`：Godot parse、普通换宠回归和切磋目标／换宅读牌共 `3/3` 通过；最终状态包含
  `pve_hidden=true / labels=true / switch_model=true / switch_ui=true / switch_capture=true`。汇总为
  `.run/godot_auto_checks/2026-08-16T14-56-03-285Z_summary.json`。
- `node --test server/node/test/battle-element-rules.test.js
  server/node/test/auth-character-element-battle-integration.test.js`：`11/11` 通过，证明客户端预判读取的公开
  元素与服务端权威伤害使用同一公式合同。
- `git diff --check` 与 `godot --headless --path client/godot --quit`：通过。
- 既有 `--auto-server-battle-switch-pet-live-check` 在进入房间前失败：注册成功后直接取 profile 的旧夹具没有
  适配“新账号先创建并选择角色”的当前账号合同，因此 `profile/positions/stream/menu=false`，随后 WebSocket
  得到 401。失败发生在本阶段模型和菜单执行之前，不是换宠预判断言失败；本次没有用重复注册掩盖问题。
  该尝试在本地开发库留下两条隔离 QA 账号记录，未修改真实玩家文件，随后已停止本地 QA 后端。修复所有
  同类旧 live 夹具属于独立测试基础设施债，不在本切片扩散修改。

## 非目标与后续门禁

本阶段不预测最终伤害、暴击、闪避、速度或对手命令，不显示敌方后备阵容，不改变换宠消耗／回合规则，
也不开放新的竞技场背景。P1.5 父项继续保持未完成：换宅读牌补强了单宠切磋的阵容判断，但完整 PvP
阵容、长期换宠博弈与 P1.5c 焰压画面 owner 批准仍需后续证据。P1.4 融合 runtime 与苔垒角兽 V4E
头像 owner-review 也不因本阶段自动通过。
