# Phase21：防御、近战合击与击飞占位

## 目标

这一阶段修正三类战斗底层行为：

- `防御` 不是一个等待速度轮到自己才生效的动作，而是提交后本回合立即进入防御状态。
- 普通攻击、宠物近战技能、合击要有冲向目标再返回的占位表现，不再只是远程扣血。
- 击飞由两个条件共同决定：行动本身允许击飞，并且伤害击倒目标时溢出足够多。

## 防御规则

石器 8.0 源码里，攻击结算会检查目标本回合指令是否为 `BATTLE_COM_GUARD`。所以本项目采用：

- 防御不再使用 `+6` 速度修正。
- 回合事件生成时，先记录本回合防御者 `guardingActorIds`。
- 即使敌人速度更快，只要目标本回合选择了防御，伤害结算就按防御状态处理。
- 回合结束回到指令阶段时清空 `guardingActorIds`，防止跨回合残留。

## 近战与合击表现

当前先做占位动画：

- `attack`、`skill_attack`、`combo_attack` 标记为近战表现。
- 攻击者会按当前事件进度冲到目标身前的接触距离，再回到原位。
- 近战事件会保留事件开始前的目标快照。命中帧前，目标血条、死亡态和击飞态仍按旧状态显示；到命中帧后才显示扣血、倒下、击飞和伤害浮字，避免“攻击还没打到，血已经先掉”的观感。
- 合击不是排队式“一个打完再下一个打”。参与者会错峰启动：打手 1 先冲到目标身前，打手 2 在打手 1 的击打窗口中途冲入，后续打手继续按短间隔加入，最后各自退回。
- 当前占位参数：每个打手的冲刺/击打/返回窗口约 `0.92` 秒，打手之间错峰约 `0.24` 秒；两人合击总时长约 `1.32` 秒，多人合击会随参与人数自然拉长。
- 精灵、毒、治疗、物品暂时不走近战冲刺。

为了更接近石器时代的战斗观感，10v10 阵型前排会比早期版本展开得更宽。这样后排目标被近战攻击时，画面上会留出冲刺通道，避免角色看起来从前排宠物身体中间穿过去。

后续正式美术接入后，需要为每个宠物动作补正式起手、冲刺、命中、返回和受击动作。

## 击飞规则

当前先做底层事件和占位表现：

- 只有 `canLaunch=true` 的物理近战事件可以击飞。
- 毒、治疗、精灵、物品默认不能击飞。
- 目标被击倒时，如果 `damage - hpBefore` 大于阈值，就进入 `launched` 状态。
- 被击飞目标标记 `revivable=false`，并把宠物战斗状态 `petBattleState` 改为 `rest`，表示进入休息状态，不能在本场战斗内再次放出。
- 击飞播放期间，目标仍按受击前的正常身体显示；攻击者先冲到接触距离并命中，目标随后才开始飞离，避免“还没打到就自己飞走”的观感。
- 合击造成击飞时，目标要等最后一个合击参与者进入命中窗口后才开始飞离，不沿用普通单人攻击的较早击飞起点。
- 击飞伤害浮字跟随命中点延后出现，不在近战接触前提前跳字。
- 播放结束后目标从战场画面消失，不再留一个半透明的死亡影子。
- 击飞表现先分为两种占位模式：
  - `straight`：沿受击反方向直线飞出屏幕外，时间较短。
  - `bounce`：先到屏幕区域边缘附近弹一下，再沿边缘带旋转地滚/飞出去，视觉时间略长。
- 预览录制可以显式指定 `launchMode`，正式战斗没指定时仍按稳定种子分配两种击飞表现。

## 验证命令

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1200 -- --auto-battle-defense-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1200 -- --auto-battle-launch-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1200 -- --auto-battle-melee-motion-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1200 -- --auto-battle-combo-motion-check
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/battle_combo_motion.png --quit-after 50 -- --battle-combo-motion-preview
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/battle_launch_straight.png --quit-after 100 -- --battle-launch-straight-preview
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/battle_launch_bounce.png --quit-after 100 -- --battle-launch-bounce-preview
```

## 目前不做

- 不做正式近战路径曲线和体型避障；当前只保证冲刺终点、返回节奏和阵型通道。
- 不做正式宠物动作资源。
- 不做复活/换宠完整流程。
- 不做所有技能的击飞白名单表；当前只把普通物理近战和宠物近战技能标为可击飞。
