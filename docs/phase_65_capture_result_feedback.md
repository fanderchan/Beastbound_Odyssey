# Phase65：捕捉结果反馈增强

## 目标

这一阶段不做成长、资质、四维筛选或正式弹窗，只把捕捉结果在左下战斗信息栏里说清楚。

## 规则

- 捕获成功并保留下来的宠物，结算日志显示：

```text
捕获野生乌力 Lv1，战力84，已加入队伍。
捕获野生乌力 Lv1，战力84，队伍已满，已送入兽栏。
```

- 队伍和兽栏都满时，不做交换，也不自动停止捉宠；结算日志显示具体宠物信息：

```text
捕获野生乌力 Lv1，战力84，但兽栏和宠物栏满，请清理。
```

- 自动低战力丢弃时，结算日志显示战力和阈值：

```text
捕获野生乌力 Lv1，战力84，低于9999，已自动丢弃。
```

- 自动捉宠成功后选择逃跑时，逃跑结算也会列出本场捕获或丢弃的宠物，不只显示 `成功逃跑。`
- 战力沿用 Phase63/64 公式：

```text
战力 = round(maxHp / 4 + attack + defense + agility)
```

代码里 `quick` 作为 `agility` 的同义字段。

## 自测命令

```bash
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-capture-feedback-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-capture-settings-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-result-check
```

## 手测入口

```bash
godot --path client/godot --scene res://scenes/Main.tscn -- --gm-10v10-map
```

建议检查：

- 开自动捉宠后抓到符合条件目标，战斗结束日志应显示 `Lv / 战力 / 去向`。
- 队伍满时，日志应明确送入兽栏。
- 队伍和兽栏都满时，日志应提示清理，并保留具体宠物名、等级、战力。
