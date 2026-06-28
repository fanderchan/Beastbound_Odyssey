# Phase 18: Battle Item Menu Prototype

## Goal

Make `物品` testable in the same battle command flow as `精灵`:

1. Player chooses a command.
2. If the command needs a single target, the player clicks/taps a valid target.
3. The controlled pet command panel opens.
4. The round resolves through the same speed-ordered event list.

This is not a full inventory or backpack system yet. Phase 19 adds local battle counts and consume-on-use for testing, but item ownership, stack limits, world bag UI, and server authority are still deferred.

## Implemented Test Items

The items are declared in `client/godot/data/battle_actions.json` and reuse the same target-rule booleans as spirits:

- `群体草药5`: all living allies, heal.
- `回复药5`: one living ally, heal.
- `毒粉5`: one living enemy, poison/damage.
- `毒雾粉5`: all living enemies, poison/damage.

Current player-facing menu:

- Press `物品`.
- Top row: `群体草药5`, `回复药5`, `毒粉5`, `返回`.
- Bottom row: `毒雾粉5`, disabled, disabled, disabled.

Single-target item rules reject the wrong side:

- `回复药5` only accepts an ally.
- `毒粉5` only accepts an enemy.

## Source Reference

StoneAge 8.0 has separate item use paths such as recovery and status-change item functions. Beastbound only uses that as a directional reference here: battle items should be data-driven actions with explicit target rules, not hardcoded UI shortcuts.

## Validation

Run from the repo root:

```sh
node tools/battle_action_catalog_check.mjs
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 300 -- --auto-battle-action-catalog-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --auto-battle-item-check
```

Manual check:

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-preview-10v10
```

- Press `物品`.
- Use `回复药5` and click an ally.
- Use `毒粉5` and click an enemy.
- Use `群体草药5` and confirm all living allies can receive the item effect.
- Use `毒雾粉5` and confirm all living enemies receive the item effect.
- After each player item choice, confirm the panel switches to `PET`.

## Next Steps

- Add item counts and consume-on-use.
- Add a small item bag data file separate from the action catalog.
- Decide whether battle item speed should match spirits permanently or use an item-specific speed rule from source/server design.
