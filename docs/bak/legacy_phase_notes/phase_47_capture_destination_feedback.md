# Phase47：捕捉去向反馈

这一阶段不设计成长、资质或抓宠概率，只补战斗结算后的玩家反馈。

## 规则

- 捕捉成功后，结算日志显示宠物名、等级、战力和去向。
- 队伍未满时，新宠进入队伍，日志显示 `已加入队伍`。
- 队伍已满时，新宠进入兽栏，日志显示 `队伍已满，已送入兽栏`。
- 队伍已满不会触发交换，也不会自动修改其他队伍宠物状态。

## 手动自测

打开可视预览：

```bash
godot --path client/godot --scene res://scenes/Main.tscn -- --pet-capture-feedback-preview
```

进入后看底部日志，应看到：

```text
战斗胜利，获得 30 经验。
我的布伊获得经验。捕获野生乌力 Lv1，战力84，已加入队伍。
```

## 自动回归

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-capture-feedback-check
```

这个检查覆盖：

- 队伍未满时，捕捉宠物状态为 `待机`，队伍数量增加。
- 队伍已满时，捕捉宠物状态为 `兽栏`，队伍数量不变，兽栏数量增加。
- 两条结算日志都包含宠物等级、战力和去向。
