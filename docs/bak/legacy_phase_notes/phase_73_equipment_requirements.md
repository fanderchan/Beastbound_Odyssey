# Phase73：装备等级需求

本阶段给装备系统补上第一版需求判断。装备可以配置等级需求，玩家低于需求等级时可以持有和购买，但不能装备。

## 规则

- 装备目录新增 `requiredLevel` 字段，默认 `1`。
- 背包选中装备时：
  - 显示装备需求和当前等级是否满足。
  - 等级不足时 `装备` 按钮保持显示但禁用，按钮位置不跳。
- 商店选中装备时：
  - 显示装备需求和当前等级是否满足。
  - 购买不因等级不足被拦截，方便提前购买和后续交易设计。
- 真正装备时会再次校验需求，避免绕过 UI。
- 新增测试装备 `骨刃`：
  - 右手武器。
  - 需求 `Lv3`。
  - 攻击 +16，敏捷 +1。

## 暂不处理

- 不做职业、称号、性别、阵营、双手武器、副手限制等复杂需求。
- 不做装备绑定、耐久、强化等级需求。
- 不阻止购买，仅阻止装备。

转生次数需求已在 Phase95 追加为 `requiredRebirth`。

## 自测

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-equipment-requirement-check
```

预览截图入口：

```bash
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase73_equipment_requirement.png --quit-after 80 -- --equipment-requirement-preview
```
