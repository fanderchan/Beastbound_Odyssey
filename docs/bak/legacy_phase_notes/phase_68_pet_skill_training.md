# Phase68：宠物技能槽 / 宠技训练

本阶段把宠物“已学技能”和“技1-技7槽位”拆开。旧档没有 `petSkillSlots` 时，会按技能目录里的默认 `slot` 自动补齐；学会新技能后，技能先进入第一个空位，之后可以在宠技面板里上移或下移。训练师模式支持遗忘非基础技能，遗忘后对应技位清空，后续战斗和内挂都会按新的技能槽读取。

## 数据约定

- `activeSkillIds`：宠物已经学会的技能。
- `petSkillSlots`：实际技位顺序，固定 7 格。
- `forgottenSkillIds`：已遗忘的模板自带技能，避免读档规范化时又被默认技能补回来。
- 战斗、自动战斗、自动捉宠都按当前出战宠的 `petSkillSlots` 读取技位。
- `battle_actions.json` 新增 `pet_focus_bite`：`技7 集中咬击`。
- `pet_skill_training.json` 定义训练师可教技能、价格和说明。
- `pet_attack` 和 `pet_defend` 是基础技能，不能遗忘。

## 入口

- 宠物面板底部新增短按钮 `宠技`。
- 火芽村入口新增 `宠技训练师阿拓`，对话后打开训练模式。
- 训练模式下显示可学技能和费用，并允许遗忘当前选中的非基础技能；普通模式只整理槽位。

## 自测命令

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-pet-skill-training-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-pet-template-catalog-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-pet-command-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-battle-settings-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-capture-settings-check
```

## 录屏命令

```bash
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase68_pet_skill_frames/frame.png --quit-after 12000 -- --pet-skill-training-preview
ffmpeg -y -framerate 60 -i .run/godot/phase68_pet_skill_frames/frame%08d.png -i .run/godot/phase68_pet_skill_frames/frame.wav -c:v libx264 -pix_fmt yuv420p -shortest .run/godot/phase68_pet_skill_demo.mp4
```
