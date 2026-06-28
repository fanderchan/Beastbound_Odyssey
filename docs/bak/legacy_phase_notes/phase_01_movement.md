# Phase 01: Movement Experiment

## Goal

Create the first playable Godot slice for Beastbound Odyssey: a small actor can move on screen by clicking or tapping the map.

## Done Means

- Godot is upgraded in place to 4.7.
- `client/godot` launches with `res://scenes/Main.tscn`.
- The player actor moves toward a clicked or tapped ground target.
- The player-facing UI does not show a direction pad or joystick.
- The HUD keeps desktop and mobile layouts in mind from the first screen.
- No StoneAge9 or SA80 runtime art is copied into this project.

## Controls

- PC uses left mouse click on the ground.
- Mobile uses finger tap on the ground.
- Both input paths feed the same target movement controller.
- Keyboard movement remains only as a developer fallback while testing.

## Next Stage

Only after user approval, continue to Phase 02: a small 2D isometric or 45-degree starter village map with walk bounds, blocked zones, and simple pathfinding around obstacles.
