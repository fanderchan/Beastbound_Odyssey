# Phase64：宠物管理增强

## 目标

这一阶段补强宠物面板的整理能力，并把自动捉宠成功后的逃跑提示说清楚。

## 宠物面板

- 列表项显示名称、等级、状态、战力。
- 新捕获且保留下来的宠物会带 `新` 标记；玩家点选该宠物后标记清除。
- 左侧列表支持筛选：
  - 全部
  - 队伍
  - 兽栏
  - Lv1
  - 低战力
  - 新
- 左侧列表支持排序：
  - 默认
  - 等级
  - 战力
  - 种类
  - 捕获
- 排序框右侧提供短按钮切换方向：
  - `降`：等级、战力、捕获顺序从高到低或新到旧。
  - `升`：等级、战力、捕获顺序从低到高或旧到新。
- 个体详情显示同一套战力公式：

```text
战力 = round(maxHp / 4 + attack + defense + agility)
```

代码里 `quick` 作为 `agility` 的同义字段。

## 清理规则

- 队伍宠的 `丢弃` 仍沿用 Phase42 的地面掉落规则：丢到人物周围格子，可拾回，保留原 `instanceId`。
- 兽栏宠不走地面掉落；兽栏宠底部按钮显示 `清理`，需要二次确认。
- 第一版只做单只兽栏宠清理，不提供低战力批量清理。
- 清理是本地存档删除，不生成地面掉落。

## 自动捉宠提示

当自动捉宠已经成功捕获过目标，随后场上没有符合条件的捕捉目标并按设置自动逃跑时，战斗信息会显示：

```text
捕获成功。没有符合条件的捕捉目标，自动逃跑。
```

如果本场没有成功捕获过，仍显示普通无目标逃跑提示。

## 自测命令

```bash
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-management-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-capture-settings-check
```

## 手动测试建议

```bash
godot --path client/godot --scene res://scenes/Main.tscn -- --gm-10v10-map
```

建议检查：

- 打开 `宠物`，切换筛选和排序，列表不应挤压右侧按钮区。
- 捕捉新宠后打开宠物面板，应能看到 `新` 标记和战力。
- 点选新宠后，`新` 标记消失。
- 排序选 `等级` 或 `战力` 后，点右侧 `降/升` 按钮，列表顺序应反转。
- 兽栏宠显示 `清理`，第一次点击变为确认，第二次才删除。
