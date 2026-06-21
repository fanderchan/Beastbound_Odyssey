# Phase 10: Battle Target Selection

## Goal

Add the first target-selection loop on top of Phase 09:

- Current behavior has been revised: battle starts with no selected target ring.
- `攻击` enters target-selection mode.
- In target-selection mode, PC hover over a living enemy shows the target ring; click confirms that enemy.
- On touch screens, tapping a living enemy directly confirms the target.
- PC and phone use the same battle template; PC is the mobile client in a desktop window.

## Current Scope

This phase is still local Godot-only.

The following are intentionally not complete yet:

- Manual target selection for skills, capture, or items.
- Ally target selection.
- Full initiative or agility order.
- Every ally and enemy taking individual turns.
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

- In battle, no target ring should be visible before choosing a target-required command.
- Click `攻击`, move the mouse over a living enemy, and confirm the hover ring appears only under that enemy.
- Click/tap that enemy; it should become the attack target.
- Clicking the command panel should not change target selection.
- In 10v10 preview, grid and anchor dots are visible for layout review only.

## Validation Commands

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 360 -- --auto-battle-target-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 360 -- --preview-mobile --auto-battle-target-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 720 -- --auto-battle-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 240 -- --auto-battle-formation-check
```

Expected key lines:

```text
battle target check ready: status=ok
battle check ready: status=ok
battle formation check ready: status=ok
```

## Next Stage

Pause here for user approval before adding fuller battle turn order or skill/capture targeting.
