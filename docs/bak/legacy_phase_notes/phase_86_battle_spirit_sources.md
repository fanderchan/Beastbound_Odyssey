# Phase86 战斗精灵菜单增强

本阶段对应长期规划里的 Phase74。

## 已完成

- 战斗中打开 `精灵` 菜单时，精灵按钮显示来源装备，例如 `滋润精灵1（水纹衣）`。
- 内挂设置里，人物动作和回血优先级的精灵选项同样显示来源装备。
- 自动战斗配置会按当前装备可用精灵自动修正：
  - 人物动作如果指向已经不可用的装备精灵，会回退为 `攻击`。
  - 回血优先级会移除已经不可用的装备精灵，保留仍可用的精灵和道具。
  - 装备耐久为 0 时，该装备提供的精灵也视为不可用。

## 设计说明

- 精灵来源仍以装备为准，人物本身不学习精灵。
- 修正逻辑放在 `PlayerProgressModel.normalize_profile()` 路径里，所以换装、卸装、耐久变化、读取旧存档都会走同一套修正。
- 战斗按钮只显示当前可用的装备精灵；没有可用精灵时仍显示 `无精灵`。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-spirit-source-check
```

预览：

```sh
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase86_battle_spirit_sources.png --quit-after 90 -- --battle-spirit-source-preview
```
