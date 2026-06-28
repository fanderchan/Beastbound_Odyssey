# Phase120 宠物管理最终骨架

## 已实现

- 宠物个体新增 `locked` 锁定字段，旧存档默认未锁定。
- 宠物面板新增：
  - `锁定 / 解锁`
  - `批存`
- 锁定宠物会阻止：
  - 丢弃到地上
  - 清理兽栏
  - 交付给任务
- 当前任务需要的宠物会阻止清理/丢弃，减少误删任务宠。
- 批量存入只处理可安全存入的队伍宠：
  - 不处理出战宠
  - 不处理锁定宠
  - 不处理当前任务需要的宠
  - 不超过兽栏容量

## 保留给后续

- 多选批量 UI。
- 批量解锁、批量改状态、批量放地上。
- 更明确的二次确认弹窗和任务宠高亮。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-management-safety-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-management-check
```
