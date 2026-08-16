# Phase 450：战斗被动说明避让回合与计时器

## 当前结论

1280×720 战斗指令态的被动技能长文案原本使用顶部居中的 `560×64` 面板，会从战场
中央横穿“第 1 回合 / 93 秒”两块持续信息。两层文字互相遮挡，属于发布阻断级布局
缺陷。本阶段把被动说明改为右上限宽两行卡片，并把位置计算纳入战斗安全区模型；
回合、倒计时和右上自动停止按钮现在都有冻结的不可覆盖区域。

修复后真实 `Main.tscn` 画面中，被动说明位于右上，正文左对齐，长中文可读；中央
回合/倒计时完整可见。该变化只调整瞬态说明的位置与文本对齐，不改变被动技能规则、
战斗指令、目标选择、服务器权威状态或结算。

## 参考意图与 Beastbound 原创规则

本轮先检查了本地 StoneAge 8.0 参考库。当前归档只有服务端回合计时实现，没有可验证
的客户端战斗 HUD 截图，因此不声称复刻其具体布局。采用的成熟行为原则仅是：回合与
剩余时间属于战斗中的持续高优先级信息，不应被悬停说明覆盖。

Beastbound 的原创规则如下：

- 被动技能说明是瞬态辅助信息，可以覆盖空战场，但不能覆盖回合、倒计时或自动停止；
- 1280×720 使用冻结矩形 `Rect2(774, 18, 390, 64)`；
- 中央回合和计时矩形分别为 `Rect2(576, 18, 128, 40)`、
  `Rect2(584, 62, 112, 44)`，与被动说明交集为 0；
- 被动说明右边界为 `1164`，与从 `x=1176` 开始的自动停止按钮保持 `12px` 间隔；
- 宽度小于 `980px` 时，面板改为居中并下移到顶部指标栈之后；不把桌面 1280×720
  方案硬缩到窄视口；
- 正文保持最多两行、溢出省略，改为左对齐以提高中文长句的扫读效率。

## 实现合同

- `BattleLayoutSafeAreaModel.battle_passive_panel_rect()` 是唯一布局求解入口；
- `main.gd::_layout_hud()` 只消费求解结果，不再自行维护第二套居中逻辑；
- `reference_transient_overlay_rects()` 登记 `passiveHoverInfo`，明确它是瞬态层而非
  20 个战斗阵位的持续压缩区；
- `--auto-battle-passive-hover-check` 同时读取实际 Control 几何和模型期望值，要求位置、
  尺寸精确匹配，且与回合/计时器零相交；
- GDScript 模型检查冻结 1280×720、右上按钮间距和 800×600 窄视口回退；Python
  合同测试阻止旧居中公式回归。

## 视觉证据

2026-08-16 在同一 1280×720 状态下人工打开并比较修复前后画面：

- 对比图：`.run/art-audit/2026-08-16/05-battle-passive-before-after.png`；
- 修复后静帧：`.run/art-audit/2026-08-16/04-battle-passive-safe.png`；
- 修复后真实 Main 录像：
  `.run/art-audit/2026-08-16/phase450-passive-safe/battle-passive-safe-1x.mp4`；
- 录像 SHA-256：
  `0378fc36a5c9391f664fd29c710a586570dc9ce573d697acc6d03684414d0718`；
- 录像固定 1280×720、30 FPS、正式 20 actor，包含 5 次跨帧真实左键点击；
  `persistentHudCollisions=0`、`serverWrites=0`。

人工审片结论：旧版长条确实遮挡中央两块；新版右上卡片与中央信息、战斗人物和右侧
指令列均形成清楚层级，未产生新的裁切或按钮遮挡。

## 前后性能证据

使用同一 `capture_battle_layout_perf.py` 合同分别在旧 `main@dc17abfd3` 和修复候选上
运行真实 Metal `Main.tscn`：1280×720、正式 10v10、25 次真实左键输入，依次覆盖
idle、指令选择和相邻目标跨帧切换。两次均 `status=passed`，所有性能门槛通过，真实
玩家数据目录哈希保持不变。

| 状态 | 旧版 raw FPS / process median,p95 / draw median,p95 | 修复版 raw FPS / process median,p95 / draw median,p95 |
|---|---|---|
| idle | 59.167 / 0.08,0.09ms / 4.48,4.78ms | 59.722 / 0.08,0.09ms / 4.58,4.71ms |
| 指令选择 | 59.177 / 0.08,0.09ms / 4.50,4.69ms | 59.450 / 0.08,0.09ms / 4.52,4.66ms |
| 目标切换 | 58.609 / 0.07,0.09ms / 4.63,4.83ms | 59.441 / 0.06,0.09ms / 4.63,4.79ms |

完整报告和哈希清单位于：
`.run/art-audit/2026-08-16/phase450-passive-perf/`。

## 验证

```text
/usr/bin/python3 -B -m unittest tools.test.test_battle_layout_safe_area_contract
6/6 PASS

godot --headless --path client/godot --quit
PASS

godot --headless --path client/godot \
  --script res://scripts/battle/battle_layout_safe_area_model_check.gd
ok=true; errors=[]

node tools/run_godot_auto_checks.mjs \
  --only --auto-battle-passive-hover-check --fail-fast
2/2 PASS

python3 tools/record_battle_layout_owner_review.py \
  --run-id phase450-passive-safe-20260816-a \
  --output-root .run/evidence/phase450_battle_passive_safe_zone \
  --timeout-seconds 180
PASS

python3 tools/capture_battle_layout_perf.py \
  --run-id phase450-passive-{baseline|candidate}-20260816-a \
  --output-root .run/evidence/phase450_battle_passive_perf \
  --timeout-seconds 180
baseline PASS; candidate PASS

git diff --check
PASS
```

## 非目标与剩余风险

- 本阶段不重排世界 HUD，也不改变融合面板；这些仍按 1280×720 审计中的 P1 项处理；
- 不用本次性能抽样声称 200 人同图容量；
- 截图与脚本门禁不能单独证明键盘焦点、屏幕阅读器或所有本地化长度，后续新增更长
  文案或新分辨率时仍需补相同状态的可视证据。
