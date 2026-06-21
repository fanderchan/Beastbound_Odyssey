# Phase 02: Isometric Starter Map

## Goal

Build the first 45-degree/isometric exploration slice for Beastbound Odyssey: a small structured map with walkable cells, blocked cells, click/tap pathfinding, and a visible route marker.

## Done Means

- The map is defined as data in `client/godot/data/firebud_training_map.json`.
- Godot renders the map as diamond-shaped isometric cells.
- Click or tap selects a map cell, not an arbitrary screen coordinate.
- Clicking a blocked cell redirects to the nearest walkable cell.
- Simple 8-direction BFS pathfinding avoids blocked cells.
- Clear direct movement is preferred before obstacle pathfinding.
- Screen-left and screen-right movement can travel directly in one straight line instead of zig-zagging through two 4-direction steps.
- When multiple routes have the same step count, route selection favors staying close to the direct line.
- The same input path works for PC mouse and mobile touch.
- The visible HUD stays player-facing and Chinese; debug evidence stays in command output or `.run` screenshots.

## Current Prototype Map

- Map name: `火芽训练场`
- Grid size: `12 x 10`
- Tile size: `80 x 40`
- Spawn cell: `5,4`
- Includes walkable terrain, dark blocked cells, small decor marks, and two interaction markers.

## Validation Commands

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-pathfinding-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-direct-line-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-eight-direction-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-mouse-click-check
```

## Next Stage

Pause here for user approval before moving into the next slice, such as camera follow, map scrolling, or replacing placeholder terrain with real art-direction assets.
