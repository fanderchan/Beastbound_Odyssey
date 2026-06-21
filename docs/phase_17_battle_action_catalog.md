# Phase 17: Battle Action Catalog And Target Rules

## Goal

Move the currently playable battle actions into a small data catalog before adding more spirits, pet skills, items, or designer tools.

The immediate target-rule fields are deliberately simple booleans:

- `isAll`: this action affects all living actors on the allowed side.
- `canTargetAlly`: this action can affect the ally side.
- `canTargetEnemy`: this action can affect the enemy side.
- `requiresSelection`: this action asks the player to click/tap one target.
- `selfOnly`: this action targets the actor itself.

This keeps the bottom mechanism visible and testable before later systems add MP cost, item counts, status duration, resist checks, server authority, and animation metadata.

## StoneAge 8.0 Source Findings

The 8.0 source was read only as a reference. No code or assets were copied.

Clear findings:

- `gmsv/src/include/battle.h` defines base battle commands including attack, guard, capture, escape, item, and `BATTLE_COM_JYUJYUTU` for spell-like actions.
- `gmsv/src/include/char_base.h` defines `CHAR_MAXPETSKILLHAVE` as `7`, so Beastbound keeps the pet command panel at `技1` to `技7`.
- `gmsv/src/lssproto_serv.c` documents pet-skill field types: all contexts, battle-only, and map-only.
- The same protocol comments document pet-skill target types such as self, other, all my side, all other side, all, none, other without myself, and without myself and pet.
- `gmsv/src/callfromcli.c` sends `havepetindex`, `havepetskill`, and `toindex` into `PETSKILL_Use`, confirming pet skills are chosen separately from the player's own command.
- `gmsv/src/battle/pet_skill.c` maps normal pet attack to `BATTLE_COM_ATTACK`, normal pet guard to `BATTLE_COM_GUARD`, charge-like skills to a skill battle command, and some spell-like pet skills to `BATTLE_COM_JYUJYUTU`.
- `gmsv/src/magic/magic.c` blocks recovery-style spirits such as 恩惠/滋润 from being used on the enemy side in non-PvP battle.

## Implemented Catalog

Runtime data lives in:

```text
client/godot/data/battle_actions.json
```

Current implemented actions:

- Player: `player_attack`, `player_defend`, `player_capture`.
- Spirit: `spirit_grace_5`, `spirit_moist_5`, `spirit_poison_5`, `spirit_poison_mist_5`.
- Pet skill: `pet_attack`, `pet_defend`, `pet_bui_charge`.
- Item: `item_heal_all_5`, `item_heal_single_5`, `item_poison_single_5`, `item_poison_all_5`.

The current battle menu and battle events now read labels and effect amounts from this catalog. The visible behavior stays the same:

- `恩惠精灵5`: all living allies.
- `滋润精灵5`: one ally.
- `毒精灵5`: one enemy.
- `毒雾精灵5`: all living enemies.
- `技3 布伊冲撞`: one enemy selected during the pet command step.

## Designer / Validator Tool

Use the Node validator from the repo root:

```sh
node tools/battle_action_catalog_check.mjs
```

List current actions:

```sh
node tools/battle_action_catalog_check.mjs --list
```

Print a starter template:

```sh
node tools/battle_action_catalog_check.mjs --template spirit
node tools/battle_action_catalog_check.mjs --template pet_skill
node tools/battle_action_catalog_check.mjs --template item
```

The tool checks:

- action IDs are unique.
- labels exist.
- owner is one of `player`, `spirit`, `pet_skill`, or `item`.
- the target booleans exist and are actually booleans.
- all-target actions do not also require single target selection.
- selection-required actions allow at least one side.
- `selfOnly` is not mixed with enemy or all-target behavior.
- pet skills use unique slots from `1` to `7`.
- the actions required by the current battle client exist.

## Godot Validation

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 300 -- --auto-battle-action-catalog-check
```

This verifies the catalog from inside Godot and checks the currently playable target rules:

- 恩惠 is ally all-target.
- 滋润 is ally single-target.
- 毒 is enemy single-target.
- 毒雾 is enemy all-target.
- 布伊冲撞 is pet `技3` and enemy single-target.
- Test items cover ally all-target, ally single-target, enemy single-target, and enemy all-target.

## Next Progressive Steps

- Add item inventory counts and consume-on-use behavior.
- Add more pet skills to `技4` to `技7`.
- Expand the action event contract so Node.js can become the battle authority later.
