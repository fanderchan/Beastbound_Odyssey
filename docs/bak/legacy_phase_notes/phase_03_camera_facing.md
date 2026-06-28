# Phase 03: Camera And Facing

## Goal

Make exploration feel closer to a real 2.5D RPG screen by adding camera follow and visible 8-direction facing.

## Done Means

- The test map is large enough for camera movement to be visible.
- `Camera2D` follows the player and stays inside map limits.
- Mouse/touch screen coordinates are converted into world coordinates before map cell selection.
- The HUD remains fixed on the screen through `CanvasLayer`.
- The player placeholder visibly turns to the nearest of 8 directions while moving.
- Movement still uses click/tap target selection, direct-line preference, and obstacle pathfinding from Phase 02.

## Validation Commands

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-camera-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-camera-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-facing-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-direct-line-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-pathfinding-check
```

## Next Stage

Pause here for user approval before moving into animated player/pet sprites or map art replacement.
