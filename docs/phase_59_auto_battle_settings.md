# Phase59：内挂设置 V1

本阶段把 Phase58 的“只会普通攻击”的自动战斗，扩展成可保存的第一版内挂设置。

## 已做

- 动作栏新增 `内挂` 入口。
- `内挂设置` 面板使用滚动内容区，适合后续继续堆策略项。
- 人物动作区分：
  - `首回合`
  - `一般回合`
- 人物动作 V1 可选：
  - `攻击`
  - `防御`
  - `恩惠精灵5`
  - `滋润精灵5`
  - `毒精灵5`
  - `毒雾精灵5`
  - `肉`
  - `回复药5`
  - `群体草药5`
  - `毒粉5`
  - `毒雾粉5`
  - `净化草5`
- 宠物动作区分：
  - `首回合`
  - `一般回合`
- 宠物动作只按 `技1` 到 `技7` 选择，不把“防御”写成独立宠物动作。
- 当前技槽标签来自战斗行动目录；例如现在是 `技1 攻击`、`技2 防御`、`技3 布伊冲撞`。
- 目标策略 V1：
  - 第一个活着
  - 生命比例最低
  - 当前生命最低
- 自动回血 V1：
  - 可开关。
  - 人物血线百分比。
  - 宠物血线百分比。
  - 5 个回血来源优先级。
- 回血来源 V1：
  - `滋润精灵5`
  - `肉`
  - `回复药5`
  - `恩惠精灵5`
  - `群体草药5`
- 回血会覆盖当前人物动作；没有触发回血时，才执行首回合/一般回合动作。
- 道具来源会检查战斗物品数量；例如肉为 0 时，会跳到下一个可用来源。
- 设置保存到玩家 profile 的 `autoBattleSettings`，旧存档会自动补默认值。
- 自动执行仍走现有 `_submit_player_battle_command` / `_submit_spirit_player_command` / `_submit_item_player_command` / `_submit_pet_battle_command`，不绕过速度、合击、状态、道具消耗、账本和结算。

## 手动测试

打开内挂设置页：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --auto-battle-settings-preview
```

打开 10v10 自动战斗观察：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-auto-10v10-preview
```

建议检查：

1. 打开 `内挂`，设置人物首回合为 `毒雾精灵5`，一般回合为 `攻击`。
2. 设置宠物首回合为 `技3 布伊冲撞`，一般回合为 `技1 攻击`。
3. 进入 10v10 预览，它会直接开启自动；右上按钮应显示 `停止`。
4. 确认首回合按配置出手，后续一般回合回到普通攻击。
5. 将人物/宠物血线调高，优先级里把 `肉` 放前面，确认低血时优先使用道具；道具没有时应继续尝试后续来源。

## 自动测试

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3600 -- --auto-battle-settings-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-auto-attack-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --auto-battle-auto-10v10-check
```

覆盖：

- 默认设置归一化。
- 设置面板打开和关键控件存在。
- 人物首回合可自动使用 `毒雾精灵5`。
- 宠物首回合可按 `技3` 自动使用 `布伊冲撞`。
- 一般回合会继续自动提交人物和宠物指令。
- 人物 `首回合` 动作只会在第一回合触发一次；例如 `恩惠精灵5` 后，第二回合会改用 `一般回合` 动作。
- 回血优先级会在 `肉` 数量为 0 时跳到 `回复药5`，并正常消耗道具。
