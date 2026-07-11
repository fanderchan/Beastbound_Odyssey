# Phase 220 — 宠物列表状态徽章与首行信息层级

## 目标

宠物队伍列表不再把“出战 / 骑乘 / 待机”等状态混在第二行普通文本中，也不使用字面量 `[战斗]`。状态改为第一行最前方的独立视觉徽章，后接宠物名；第二行只保留等级与战力。

## 玩家可见结构

```text
黄色异形徽章「战斗」  四灵幼兽       新
Lv1    战力129

青色异形徽章「骑乘」  新手老虎       新
Lv1    战力52
```

选中箭头仍位于条目最左侧；“游 / 新 / 锁”是辅助标记，放在名称行末尾。战斗宠不再额外显示重复的“主”，因为“战斗”徽章已经表达唯一出战状态。

## 组件与美术替换边界

新增两个聚焦 UI 组件：

- `PetStateBadgeControl`：负责状态文案、特殊切角轮廓、双层底色、描边和铆点；
- `PetListEntryButton`：继续继承 `Button`，负责选中箭头、徽章、宠物名、辅助标记以及第二行等级/战力。

当前没有生成或提交正式美术。程序化底板只用于建立正确信息层级和替换接口。组件会自动检查以下未来纹理：

```text
res://assets/ui/pet_state_badges/battle.png
res://assets/ui/pet_state_badges/riding.png
res://assets/ui/pet_state_badges/standby.png
res://assets/ui/pet_state_badges/rest.png
res://assets/ui/pet_state_badges/storage.png
```

纹理存在时自动替换程序化底板，中文仍由真实 Label 绘制，便于本地化和清晰缩放。当前颜色意图：战斗为高识别金黄、骑乘为青色、待机为蓝灰、休息为紫色、兽栏为棕金。正式美术可改造型和材质，但必须保持状态间快速可辨识。

## 交互与兼容

- 条目仍是完整 Button，左键选择、右键辅助菜单、排序、筛选与滚动行为不变；
- 子级徽章和标签使用 `MOUSE_FILTER_IGNORE`，不会截断整行点击；
- 宠物状态、存档、服务器契约和战力计算均未改变；
- 列表只在打开/刷新宠物面板时重建，不进入 `_process / _input / _draw` 热路径；
- 宠物改名检查改为读取条目名称标签，不再依赖旧的多行 `Button.text`。

## 验证

- Godot 4.7 parse 通过；
- `--auto-pet-management-check` 通过，覆盖战斗/骑乘徽章、第一行无方括号、第二行无状态、黄色战斗色、未来纹理路径及整行点击选宠；
- 宠物改名、队伍排序与驯宠跟随定向检查通过；管理安全检查当前仍有与本 UI 切片无关的既有规则断言失败，本阶段未混改玩法保护规则；
- 真实 Metal 1280×720 截图：`.run/evidence/phase220/pet_state_badges.png`；
- 宠物设计 inspector、battle action catalog、`git diff --check` 通过；
- 空闲 `process_total=0.22–0.32ms`；移动稳定段 `process_total≈0.31ms @ 60FPS`。317 次跨帧连点通过，`avg/max input=16/495us`；徽章布局未进入逐帧热路径。

## 玩家验收

1. 打开宠物面板，确认出战宠第一行以黄色异形“战斗”徽章开头，名称紧随其后。
2. 确认新手老虎第一行以青色“骑乘”徽章开头。
3. 确认第二行只有 `Lv等级` 与 `战力数值`，不再重复“出战 / 骑乘 / 待机”。
4. 点击名称、徽章或条目空白处都应选中同一只宠物；右键仍打开原辅助菜单。
5. 在待机、休息、兽栏之间切换，徽章文字和颜色应立即对应变化。

## 涉及文件

- `client/godot/scripts/ui/pet_state_badge_control.gd`
- `client/godot/scripts/ui/pet_list_entry_button.gd`
- `client/godot/scripts/ui/panel_flow_coordinator.gd`
- `client/godot/scripts/qa/auto_check_coordinator.gd`
- `stoneage_gap_plan.md`
