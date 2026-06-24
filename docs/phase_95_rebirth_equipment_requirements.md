# Phase95：转生装备需求

本阶段把人物转生次数接入装备需求系统，让一转后有明确可验证的装备解锁。

## 规则

- 装备目录新增 `requiredRebirth` 字段，默认 `0`。
- `requiredLevel` 和 `requiredRebirth` 可以同时存在。
- 背包选中装备时：
  - 显示装备需求，例如 `需求: 1转`。
  - 显示当前状态，例如 `当前 0转：未满足`。
  - 未满足时 `装备` 按钮保持原位置但禁用。
- 商店选中装备时：
  - 显示同一套需求状态。
  - 购买不因转生次数不足被拦截，方便提前购买、交易和仓库设计。
  - `购买后装备` 会在未满足时禁用。
- 真正执行装备时会再次校验，避免绕过 UI。

## 新增测试装备

- `转纹骨斧`
  - 右手武器。
  - 需求 `1转`。
  - 攻击 +18，敏捷 -1。
  - 耐久上限 36。
  - 火芽装备铺售价 180 石币。

## 暂不处理

- 不做二转以上正式装备阶梯。
- 不做转生装备外观变化。
- 不做转生后自动卸下低转人物无法装备的高转装备；当前只校验装备动作。
- 不改转生数值公式。

## 自测

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-equipment-requirement-check
```

本阶段验证结果：

- `--auto-equipment-requirement-check`：`status=ok`，覆盖 Lv3 骨刃和 1转转纹骨斧。
- `--auto-equipment-check`：`status=ok`。
- `--auto-equipment-shop-preview-check`：`status=ok`。
- `--auto-qa-panel-check`：`status=ok`。
- `--movement-spam-click-check`：`status=ok`，120 次点击仍合并为 2 次实际寻路。
- `--shop-select-perf-check`：
  - 开发前：`item_us=494887`，`equipment_us=749111`，装备项 16。
  - 转生需求首次接入后曾升到 `equipment_us=1340844`，原因是 UI 选中装备时调用了会规范化整个档案的 `PlayerProgressModel.rebirth_count()`。
  - 修复后：`item_us=519608`，`equipment_us=829446`，装备项 17。

预览截图入口：

```sh
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase95_rebirth_equipment_requirement.png --quit-after 90 -- --equipment-rebirth-requirement-preview
```

截图证据：

`/Users/fander/projects/Beastbound_Odyssey/.run/godot/phase95_rebirth_equipment_requirement00000119.png`
