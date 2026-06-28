# Phase147：旧文档归档与代码架构审计

本阶段先做保守整理，不删除历史资料，不做大规模重构。目标是让生产级文档入口更清楚，同时记录当前代码架构的主要风险和后续局部优化顺序。

## 文档归档

已新增：

- `docs/bak/legacy_phase_notes/`
- `docs/bak/legacy_phase_notes/README.md`

已移动：

- Phase01-Phase122 的历史阶段记录，共 113 份。

保留在 `docs/` 根目录的主线文档：

- Phase123-134：数值表、仿真、战斗公式、数值快照和晋升门禁。
- Phase135-136：宠物成长与 MM 转生公式。
- Phase137 起：当前收口阶段的生产级契约和验证记录。
- `stoneage9_reuse_audit.md`：外部结构参考审计，暂时保留在根目录，避免和项目历史阶段记录混在一起。

同时更新了 GM/QA 面板里 Phase92 文档路径：

- 旧：`docs/phase_92_gm_qa_panel.md`
- 新：`docs/bak/legacy_phase_notes/phase_92_gm_qa_panel.md`

## 当前代码规模

当前最大文件：

| 文件 | 行数级别 | 风险 |
| --- | ---: | --- |
| `client/godot/scripts/main.gd` | 约 31k 行 | 世界、战斗、UI、GM、自测、任务寻路混在一起，后续改动容易互相影响 |
| `client/godot/scripts/progression/player_progress_model.gd` | 约 7.8k 行 | profile 默认值、迁移、背包、装备、宠物、任务、转生入口都在同一模型里 |
| `client/godot/scripts/battle/battle_model.gd` | 约 3.5k 行 | 战斗流程、事件、结算继续增长后需要拆出更多规则模型 |

## 热路径审计

需要继续保护的热路径：

- `_process`
- `_world_hud_signature`
- `_world_draw_signature`
- `_current_task_text`
- `_update_world_hud_if_needed`
- `_refresh_task_route_button`
- 移动点击、自动寻路、任务追踪、地图绘制

当前观察：

- 世界 HUD 已有 signature/cache 机制，正常稳态 `process_total` 仍在低毫秒级。
- `_refresh_task_route_button()` 会在 route signature 改变时构造完整任务导航目标；现在有缓存门槛，不是每帧无脑执行，但后续任务系统继续复杂化时应把导航目标缓存下沉为低频状态。
- `_current_task_text()` 已有 `current_task_text_signature_cache`，但它仍依赖 `_first_available_unfinished_quest_for_tracker()`、MM 引导、转生试炼等逻辑。后续新增任务模板时应避免在 HUD 文本构造里扩大扫描范围。
- Phase146 的服务端契约模型是低频路径，不应被 `_process`、HUD signature、移动或绘制路径直接调用。

## 建议的局部重构顺序

不建议一次性拆 `main.gd`。建议按低风险、可自测的顺序逐步搬：

1. **GM/QA 面板模型化**
   - 把 GM 面板按钮、说明文本、测试入口列表整理到独立脚本。
   - `main.gd` 只负责创建按钮和调用回调。
   - 风险低，因为主要是开发者工具，不影响核心战斗。

2. **世界 HUD / 任务追踪缓存**
   - 把任务文本、任务寻路目标、路线按钮可用性做成一个轻量缓存对象。
   - 仅在 profile 变更、地图变更、任务变更、面板打开、点击寻路时重算。
   - 目标是让 HUD 不再直接调用完整任务导航目标构造。

3. **宠物面板 UI 拆分**
   - 宠物列表、详情、成长 tab、GM 增长工具、批量操作拆到 UI helper。
   - 保留 `PlayerProgressModel` 作为数据入口，不把 UI 文本塞进 model。

4. **背包 / 商店 UI 拆分**
   - 商店和背包现在经常被性能测试点名，后续适合先拆“列表数据构造”和“按钮渲染”。
   - 目标是减少切换、选中、批量购买时的重复控件重建。

5. **PlayerProgressModel 分层**
   - 第一层先拆默认 profile / 迁移 / server contract wrapper。
   - 第二层再考虑宠物、背包、装备、任务的 mutation API 分文件。
   - 不建议在数值策划前大拆所有 mutation，避免破坏现有测试闭环。

## 本阶段不做的大改

- 不移动当前生产级数值文档。
- 不移动 Phase123-146 文档。
- 不改战斗、任务、背包、宠物、装备的运行逻辑。
- 不拆 `main.gd` 主流程。
- 不把服务端契约接入真实网络。

## 后续验收建议

文档归档类改动也要跑基础验证：

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-qa-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-server-profile-contract-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
```

如果后续真的开始拆 HUD/任务寻路，还要额外跑可见客户端 `--perf-probe`，并记录 idle CPU 和移动压力结果。
