# Phase150-C：背包详情与动作状态 Presenter

本阶段继续收敛背包 UI 逻辑，把选中道具后的详情文本装配和按钮状态计算迁入 `BackpackPanelPresenter`。

## 改动

- `BackpackPanelPresenter.detail_lines_for_slot()` 统一装配背包基础详情、装备需求提示和换装对比文本。
- `BackpackPanelPresenter.selected_item_actions()` 统一计算选中道具的 UI 动作状态：
  - 是否显示 `使用` 按钮。
  - `使用` 按钮是否可点、文案是否应为 `装备`。
  - 是否显示单独 `装备` 按钮。
  - 是否显示快捷栏绑定按钮。
  - 是否保留宠物/人物目标选择列表。
- `main.gd` 仍负责真正执行道具使用、装备、快捷绑定、目标列表刷新和存档。

## 不改内容

- 不改道具消耗、宠物加血、经验丹、MM 石、宠物蛋、遇敌石、捕捉道具、装备交换等业务规则。
- 不改背包容量、扩展锁位、钻石开格、背包满兜底。
- 不把玩家不可见的测试命令放入普通背包界面。

## 后续

- 背包格子按钮渲染还在 `main.gd`，下一步可以拆成 `BackpackSlotViewFactory` 或同类 presenter。
- 背包详情和商店详情后续可以合并共用，减少装备对比文案重复。
