# Beastbound Odyssey Godot Client

Godot 4.7 standard edition client for Beastbound Odyssey.

## Run

```sh
godot --path .
```

## Check

```sh
godot --headless --path . --quit
```

## Current Slice

Phase 19 contains a minimal isometric exploration, encounter, 10v10 formation, local battle-command, target-selection, speed-order, combo, capture, spirit-targeting, controlled-pet-command, battle action-catalog, battle item-menu, and item-count experiment with:

- Mouse click-to-pathfind on PC.
- Touch tap-to-pathfind on mobile.
- A data-driven 45-degree map.
- Walkable and blocked cells.
- Camera follow.
- 8-direction placeholder facing.
- Player idle/walk placeholder animation.
- Optional pet follow using `驯宠戒`.
- A target marker and automatic movement state.
- Clickable NPC/gate interaction points.
- Arrival-gated dialog and a simple local task flag.
- Clickable walk-on transfer points between `火芽训练场` and `火芽村入口`.
- A visible grass encounter zone on `火芽村入口`.
- A local encounter prompt with `进入战斗` and `先撤退`.
- A local battle scene placeholder after `进入战斗`.
- Battle commands arranged as `攻击` / `精灵` / `捕捉` / `help` and `防御` / `物品` / `换宠` / `逃跑`.
- Upper-right battle command panel with enemy placeholders upper-left and ally placeholders lower-right.
- 10v10 formation slots with two rows of five on each side; full previews use one mobile-first formation template scaled into the current PC/mobile window.
- The controlled human placeholder uses a distinct red/gold color in the ally formation.
- Battle preview uses one continuous ground plane, without a sky/floor split line.
- `--battle-preview-10v10` fills all 20 slots and shows the inspection grid/anchor dots.
- `攻击` and `捕捉` enter enemy target-selection mode; PC hover shows the target ring, and click/tap confirms the target.
- Local `攻击` starts a battle event list ordered by quick/speed, mixing allies and enemies.
- Enemy attacks choose among living allies instead of always focusing the center/player slot.
- Adjacent same-target ally attacks can become `合击`.
- Damage popups, hit reactions, and simple defeated/captured fade states.
- `捕捉` can catch a weakened wild enemy.
- In 10v10, only `见习猎人` and `小布伊` are player-controlled; the other allies use simple attack AI.
- `精灵` opens the player spirit menu: `恩惠精灵5`, `滋润精灵5`, `毒精灵5`, `毒雾精灵5`.
- After the player command, the same command panel switches to `PET`.
- PET mode exposes `技1 攻击`, `技2 防御`, and `技3 布伊冲撞`; PET enemy skills use the same hover/click or tap target-selection flow.
- Current player, spirit, pet-skill, and item labels/effects/target rules are declared in `data/battle_actions.json`.
- The action catalog uses explicit booleans for all-target, ally-target, enemy-target, selection-required, and self-only behavior.
- `物品` opens a test item menu with `群体草药5`, `回复药5`, `毒粉5`, and `毒雾粉5`.
- Battle item buttons show local counts and successful item use consumes one count.
- Item buttons are disabled at `x0`.
- Enemy defeat, successful capture, and `逃跑` return-to-map behavior.
- Responsive HUD placement for desktop and mobile screen shapes.

Open the battle preview directly from this directory:

```sh
godot --path . --scene res://scenes/Main.tscn -- --battle-preview
```

Open the 10v10 formation preview directly from this directory:

```sh
godot --path . --scene res://scenes/Main.tscn -- --battle-preview-10v10
```

Manual 10v10 checks:

- Player target choice: press `攻击`, hover an enemy to show the ring, then click/tap that enemy.
- Pet target choice: after the player target is confirmed, press `技1 攻击` or `技3 布伊冲撞`, hover an enemy to show the ring, then click/tap that enemy.
- Spirit choices: press `精灵`, choose a spirit, then follow its target rule.
- `恩惠精灵5` heals all living allies.
- `滋润精灵5` asks for one ally.
- `毒精灵5` asks for one enemy.
- `毒雾精灵5` poisons all living enemies.
- Item choices: press `物品`, then test `群体草药5`, `回复药5`, `毒粉5`, and `毒雾粉5`.

Check the corrected spirit and pet-command flow:

```sh
node ../../tools/battle_action_catalog_check.mjs
node ../../tools/battle_action_catalog_check.mjs --list
godot --headless --path . --scene res://scenes/Main.tscn --quit-after 300 -- --auto-battle-action-catalog-check
godot --headless --path . --scene res://scenes/Main.tscn --quit-after 3000 -- --auto-battle-item-check
godot --headless --path . --scene res://scenes/Main.tscn --quit-after 3600 -- --auto-battle-item-count-check
godot --headless --path . --scene res://scenes/Main.tscn --quit-after 1200 -- --auto-battle-spirit-check
godot --headless --path . --scene res://scenes/Main.tscn --quit-after 1200 -- --auto-battle-pet-command-check
godot --headless --path . --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-pet-target-check
godot --headless --path . --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-spirit-four-check
```
