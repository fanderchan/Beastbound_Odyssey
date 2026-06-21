# Beastbound Odyssey / 万兽纪元

Beastbound Odyssey is an original StoneAge-inspired 2.5D turn-based pet MMORPG prototype.

## Current Stage

Phase 19 is a Godot 4.7 local battle item-count slice:

- 45-degree/isometric starter map.
- Second map: `火芽村入口`.
- Walkable cells and blocked cells from structured map data.
- Mouse/touch click-to-pathfind around blockers.
- Camera follow on a larger test map.
- Visible 8-direction placeholder facing.
- Visible idle/walk placeholder animation cues.
- Optional pet follow through `驯宠戒`.
- Clickable NPC and gate interaction points.
- Clickable walk-on transfer points between maps.
- Visible encounter zone on `火芽村入口`.
- Local random encounter prompt with `进入战斗` / `先撤退`.
- Local battle scene placeholder after entering combat.
- Battle command panel in the requested layout:
  `攻击` / `精灵` / `捕捉` / `help`, then `防御` / `物品` / `换宠` / `逃跑`.
- Old StoneAge-style battle direction: commands at upper-right, enemies upper-left, allies lower-right.
- 10v10 formation slots: two rows of five for each side; full previews use one mobile-first formation template scaled into the current PC/mobile window.
- The controlled human placeholder uses a distinct red/gold color so it can be recognized inside the 10v10 ally formation.
- Battle preview uses one continuous ground plane, without a sky/floor split line.
- `--battle-preview-10v10` fills all 20 slots and shows the inspection grid/anchor dots.
- `攻击` and `捕捉` enter enemy target-selection mode; PC hover shows the target ring, and click/tap confirms the target.
- `攻击` starts a local battle event list ordered by actor quick/speed after the player and controlled pet have both chosen commands.
- `攻击` hits the selected living enemy; the player must choose an enemy before the controlled pet command step opens.
- Living allies and enemies act in mixed speed order instead of side-by-side batches.
- Enemy attacks choose among living allies instead of always focusing the center/player slot.
- Adjacent same-target ally attacks can fold into a visible `合击` event.
- Damage numbers float above hit targets, and defeated/captured placeholders fade down.
- `捕捉` can catch a weakened wild enemy and return to the map.
- In 10v10, only `见习猎人` and `小布伊` are player-controlled; other allies use simple attack AI.
- `精灵` opens the player spirit menu: `恩惠精灵5`, `滋润精灵5`, `毒精灵5`, `毒雾精灵5`.
- After the player command, the same upper-right panel switches to `PET` for the controlled pet.
- PET mode exposes `技1 攻击`, `技2 防御`, and `技3 布伊冲撞`; PET enemy skills enter the same hover/click or tap target-selection flow.
- Current player, spirit, pet-skill, and item labels/effects/target rules are declared in `client/godot/data/battle_actions.json`.
- Spirit target rules use explicit booleans for all-target, ally-target, enemy-target, and selection-required behavior.
- `物品` opens a test item menu driven by the same action catalog.
- Test items currently cover all four target-rule shapes: ally all, ally single, enemy single, enemy all.
- Battle item buttons show local counts such as `群体草药5 x2`; successful item use consumes one count.
- Item buttons are disabled when the local battle count reaches `0`.
- A Node validator checks the battle action catalog and can print starter templates for future spirit, pet-skill, and item designs.
- Enemy defeat, successful capture, and `逃跑` return to the map.
- Dialog opens after walking to a nearby interaction cell.
- First local task flag: `和训练师阿土对话`.
- A responsive HUD that accounts for desktop and phone layouts.
- No backend dependency yet.

## Run

```sh
godot --path client/godot
```

Direct 2-unit battle preview:

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-preview
```

10v10 formation preview:

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-preview-10v10
```

Manual 10v10 checks:

- Player target choice: press `攻击`, hover an enemy to show the ring, then click/tap that enemy.
- Pet target choice: after the player target is confirmed, press `技1 攻击` or `技3 布伊冲撞`, hover an enemy to show the ring, then click/tap that enemy.
- Spirit choices: press `精灵`, choose one of the four spirits, then follow its target rule.
- `恩惠精灵5`: heals all living allies.
- `滋润精灵5`: asks for one ally.
- `毒精灵5`: asks for one enemy.
- `毒雾精灵5`: poisons all living enemies.
- Item choices: press `物品`, then test `群体草药5`, `回复药5`, `毒粉5`, and `毒雾粉5`.

Quick parse check:

```sh
godot --headless --path client/godot --quit
```

Battle command correction checks:

```sh
node tools/battle_action_catalog_check.mjs
node tools/battle_action_catalog_check.mjs --list
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 300 -- --auto-battle-action-catalog-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --auto-battle-item-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3600 -- --auto-battle-item-count-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1200 -- --auto-battle-spirit-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1200 -- --auto-battle-pet-command-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-pet-target-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-spirit-four-check
```

## Stage Gate

After Phase 19, the next user-facing stage should add a small item bag UI, more pet skills, or a battle event JSON contract for future Node.js authority.
