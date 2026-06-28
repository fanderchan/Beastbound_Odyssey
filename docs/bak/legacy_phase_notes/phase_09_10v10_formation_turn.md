# Phase 09: 10v10 Formation And Minimal Counterattack

## Goal

Add the first real 10v10 battle foundation without implementing the full combat rules yet:

- Battle actors use formal `slotId` values: `ally.front.1` to `ally.front.5`, `ally.back.1` to `ally.back.5`, `enemy.front.1` to `enemy.front.5`, and `enemy.back.1` to `enemy.back.5`.
- `--battle-preview-10v10` fills all 20 slots with placeholders so formation spacing can be inspected.
- Full 10v10 preview hides actor names and keeps HP bars visible to avoid clutter.
- Full 10v10 preview slots are arranged as parallel diagonal rows on one mobile-first StoneAge-style formation template that scales into PC and mobile windows.
- Full 10v10 preview draws the same grid used by the slot formula, plus small anchor dots, so visual alignment can be reviewed.
- `--preview-mobile` no longer creates a separate smaller logical battle canvas; PC and phone use the same viewport-driven template.
- The battle preview background is one continuous ground plane, not separate sky and floor bands.
- Empty slots are still not drawn in normal battles.
- `攻击` is now the player character action under the `PLAYER` command panel.
- After the player attacks, one living enemy performs a simple counterattack against the player.
- Defeating the enemy still exits battle after hit feedback.

## Current Scope

This phase is still local Godot-only.

The following are intentionally not complete yet:

- Manual target selection.
- Full initiative or agility order.
- Every ally and enemy taking individual turns.
- Pet command selection.
- Skill formulas, defense, capture, item use, swap pet, and run chance.
- Server-authoritative battle event lists.

## Player Verification

Normal battle preview:

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-preview
```

10v10 formation preview:

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-preview-10v10
```

Manual checks:

- In normal battle, click `攻击`; the player character should attack the wild pet.
- After the hit feedback, the wild pet should counterattack the player and reduce player HP.
- In 10v10 preview, all 20 occupied slots should appear in two parallel diagonal rows per side, following the same slanted battle grid direction and the same PC/mobile template.
- The 10v10 preview grid lines should pass through the visible anchor dots.
- The battlefield background should not show a horizontal sky/floor split line.
- The player-facing battlefield should not show slot ids, debug text, or empty slot markers.

## Validation Commands

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 720 -- --auto-battle-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 240 -- --auto-battle-formation-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 300 -- --auto-map-transfer-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 240 -- --auto-npc-interaction-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 240 -- --auto-npc-collision-check
```

Expected key lines:

```text
battle check ready: status=ok
battle formation check ready: status=ok
```

## Next Stage

Pause here for user approval before adding target selection and fuller turn order.
