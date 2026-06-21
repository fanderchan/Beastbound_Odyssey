# Phase 07: Encounter Zones And Battle Entry Stub

## Goal

Add the first map-driven encounter loop. This phase originally stopped at a battle-entry stub; the current client continues into the Phase 08 battle command skeleton.

- `火芽村入口` contains a visible grass encounter zone.
- Walking into the zone can trigger `发现野生宠物！`.
- Movement stops while the encounter prompt is open.
- `进入战斗` now opens the Phase 08 local battle command skeleton.
- `先撤退` closes the prompt and returns to exploration.

## Data Contract

Maps can define `encounterZones`.

- `id`: Stable zone id.
- `name`: Player-facing zone name.
- `cells`: Optional explicit cell list.
- `rects`: Optional rectangular ranges `[x, y, width, height]`.
- `encounterRate`: Local prototype chance per arrived cell, from `0.0` to `1.0`.
- `encounterGroupId`: Future server/battle group id.
- `previewText`: Player-facing hint shown in the encounter prompt.

Phase07 uses local Godot randomness only. Server authority, encounter tables, pet capture, and battle scene loading are intentionally left for later phases.

## Player Verification

- Start the client and transfer from `火芽训练场` to `火芽村入口`.
- Move through the light-green grass cells near the middle of `火芽村入口`.
- When `发现野生宠物！` appears, confirm movement stops.
- Click `进入战斗`; the Phase 08 battle screen opens.
- Click `逃跑` to close it.
- Move out of the grass and back in to try another encounter.

## Validation Commands

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 180 -- --auto-encounter-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 240 -- --auto-map-transfer-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 180 -- --auto-npc-interaction-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 180 -- --auto-npc-collision-check
```

Expected key line:

```text
encounter check ready: status=ok
```

## Next Stage

Continued in Phase 08: local battle command skeleton.
