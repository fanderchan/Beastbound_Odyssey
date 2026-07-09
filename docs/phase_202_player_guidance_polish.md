# Phase202 玩家目标与空状态体验加固

本阶段来自一次 PC 玩家流程实机审计，目标不是扩新系统，而是先修正会影响首次游玩的明显信息问题：玩家进入世界后不知道为什么要做当前任务，空背包和空交易所缺少清晰反馈，战斗指令中仍混有英文。

## 审计证据

本轮按 1280×720 PC 窗口检查了世界、任务、背包、10v10 战斗、交易所和银行。截图保存在 `.run/product_audit_20260710/`，其中：

- `01-world-start.png`：旧任务追踪只显示任务名与“寻路”，目标和奖励层级偏弱。
- `02-quest-panel.png`：完整任务面板信息清楚，可继续保留。
- `03-backpack-panel.png`：空格显示 `-`，不如银行中的“空”直观。
- `04-battle-10v10.png`：人物指令中的 `help` 破坏中文界面一致性。
- `05-market-panel.png`：没有挂单时仍提示“请选择左侧挂单”，给出了无法执行的动作。
- `06-bank-panel.png`：功能完整，但信息密度仍偏高，留作后续独立整理。

完成后的 `07-world-after.png`、`08-backpack-after.png`、`09-battle-after.png`、`10-market-after.png` 与对应 `compare-*.png` 用于同视口前后对照。

## 设计与实现

### 世界目标

- 右上任务追踪改为四层信息：目标进度、下一步行动、完成奖励、位置与伙伴数量。
- 主按钮统一为“自动寻路”，明确点击后的结果。
- 新增 `scripts/ui/adventure_goal_presenter.gd`，负责玩家可见文本的组合；没有把任务展示逻辑继续塞回 `main.gd`。
- 任务标题、行动与奖励只在任务缓存失效时重新计算。移动过程中只拼接缓存前缀、坐标和伙伴数量，避免把任务扫描或 profile 规范化带回 HUD 热路径。

### 空状态与中文一致性

- 背包空格由 `-` 改为“空”，与仓库语义一致。
- 交易所空列表改为“暂无可购买商品”，并根据登录状态告诉玩家登录刷新或切换出售上架物品。
- 内部战斗命令 ID 仍保持 `help`，只把玩家可见按钮改为“帮助”，不改变战斗协议或命令分发。

## 验证

针对性自动检查：

```bash
node tools/run_godot_auto_checks.mjs --only=--auto-task-tracker-route-check,--auto-backpack-check,--auto-market-panel-check,--auto-battle-check,--auto-battle-label-check --fail-fast --timeout-ms=180000
```

结果：6/6 通过；日志 `.run/godot_auto_checks/2026-07-09T18-25-19-328Z.log`，摘要 `.run/godot_auto_checks/2026-07-09T18-25-19-328Z_summary.json`。

性能与输入压力：

- 改前 idle：`process_total` 约 0.18–0.42ms，`hud_signature` 约 0.03–0.08ms。
- 改后 idle：`process_total` 约 0.19–0.45ms，`hud_signature` 约 0.03–0.08ms。
- 改后 moving：60 FPS，`process_total` 约 0.32–0.46ms，`hud_text_build` 约 0.00–0.01ms；`movement perf check` 为 `status=ok`。
- 改后移动连点：`status=ok clicks=317 avg_input_us=15 max_input_us=201 coalesced=true settled=true`。

结论：新增任务信息没有引入持续 HUD 热路径尖峰，移动和连点合并行为保持正常。

## 本阶段不做

- 不改变任务奖励、任务顺序或服务器存档。
- 不重做银行的信息架构；其密度问题需要独立阶段和真实存取数据验证。
- 不处理占位角色、宠物和地图美术；继续由 G8 资产阶段承接。
- 不启动 G2.7 物品兑换 NPC，避免在没有确认兑换配方与经济回收目标前擅自定数值。
