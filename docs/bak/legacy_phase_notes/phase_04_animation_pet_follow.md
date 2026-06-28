# Phase 04: Placeholder Animation And Pet Follow

## Goal

Make the square placeholders visibly communicate character state before real art is ready.

## Player Verification

- `idle`: the body slowly breathes, foot markers are hidden.
- `walk`: the body bobs and left/right foot markers alternate.
- The facing triangle still points to the nearest of 8 movement directions.
- When movement stops, the player returns to `idle` while keeping the last facing direction.
- The automated animation slot keys are `idle_south`, `walk_east`, and `idle_east` in the current test path. These keys are the placeholders that later real 8-direction sprite animations should replace.

## Pet Verification

- The pet is hidden by default.
- Pressing `驯宠戒` shows the pet and starts delayed follow.
- Pressing `收宠` hides the pet again.
- The pet uses the same visible `idle` and `walk` placeholder cues.
- The automated pet check also verifies that the pet uses a `walk_*` animation slot while following.

## Validation Commands

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-animation-state-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-pet-follow-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-camera-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-facing-check
```

Expected key lines:

```text
animation state check ready: status=ok initial_idle=true switched_to_walk=true returned_to_idle=true initial_clip=idle_south walk_clip=walk_east final_clip=idle_east
pet follow check ready: status=ok hidden_by_default=true visible_after_ring=true pet_moved=true pet_walking=true pet_clip=walk_* follows_player=true
```

## Next Stage

Pause here for user approval before replacing placeholders with real generated or evaluated art assets.
