# Phase150-B：背包面板 Presenter

本阶段继续做 Phase150 的 UI 拆分，但保持范围很窄：只把背包筛选页签和筛选匹配规则从 `main.gd` 抽到独立 presenter，不改变背包玩法。

## 改动

- 新增 `client/godot/scripts/ui/backpack_panel_presenter.gd`。
- 背包筛选 ID、页签文案、筛选 ID 列表统一由 presenter 提供。
- 背包槽位是否属于“世界 / 战斗 / 捕捉 / 装备”筛选，也由 presenter 判断。
- `main.gd` 保留 `_backpack_filter_options()`、`_backpack_filter_ids()`、`_backpack_filter_label_for()` 和 `_backpack_slot_matches_filter()` 这几个旧入口，内部转发到 presenter，避免本阶段大范围改调用点。

## 不改内容

- 不改变背包真实容量、锁位、钻石开格费用。
- 不改变道具使用、装备、卸装、世界使用、战斗使用或捕捉道具逻辑。
- 不改变背包满发邮箱、商店交易或任务奖励兜底规则。

## 后续

- 下一刀可以继续把“背包按钮渲染”和“详情文本装配”拆出去。
- 等背包 view/controller 稳定后，再考虑商店面板复用背包道具详情 presenter，减少同类 UI 文案重复。
