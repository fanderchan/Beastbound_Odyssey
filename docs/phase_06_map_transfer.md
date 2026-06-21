# Phase 06: Multi-Map Transfer Points

## Goal

Add a small multi-map loop without introducing backend state yet:

- Start in `火芽训练场`.
- Click the blue-gold transfer point at `村口木门`.
- Walk onto it and switch to `火芽村入口`.
- Click `返回训练场` on the second map.
- Return to `火芽训练场` near the village gate.

## Map Data Contract

Maps still live in `client/godot/data/*.json`.

- `id`: Stable map id.
- `name`: Player-facing Chinese map name.
- `spawnCell`: Default spawn cell.
- `spawnPoints`: Optional named spawn cells used by transfer points.
- `blockedCells`: Static blocked map cells.
- `decorCells`: Lightweight visual decoration cells.
- `interactionPoints`: NPCs, gates, warp points, and other click/tap interactions.

Warp interaction fields:

- `kind: "warp"` marks a transfer point.
- `movementCollision: "overlap"` keeps the point walkable, matching StoneAge-style warp points.
- `trigger: "arrive"` means click/tap the point, walk onto its cell, then transfer.
- `toMap`: Target map id.
- `toSpawn`: Target named spawn point.

## Player Verification

- Start the client.
- Click the blue-gold ring at the lower-right village gate on `火芽训练场`.
- Confirm the HUD map name changes to `火芽村入口`.
- Click the blue-gold `返回训练场` ring on the second map.
- Confirm the HUD map name returns to `火芽训练场`.
- Verify normal NPC dialog and `overlap/block` NPC collision examples still work on the training map.

## Validation Commands

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 240 -- --auto-map-transfer-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 180 -- --auto-npc-interaction-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 180 -- --auto-npc-collision-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-pathfinding-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-direct-line-check
```

Expected key line:

```text
map transfer check ready: status=ok
```

## Next Stage

Phase 07 continues with map encounter zones; Phase 08 continues with the local battle command skeleton.
