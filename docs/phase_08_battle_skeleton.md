# Phase 08: Local Battle Command Skeleton

## Goal

Turn the Phase 07 encounter prompt into the first local battle screen:

- `进入战斗` opens a local battle scene placeholder.
- Player movement and map clicks are locked while battle is active.
- The battle command panel uses the requested two-row layout:
  - `攻击`、`精灵`、`捕捉`、`help`
  - `防御`、`物品`、`换宠`、`逃跑`
- The command panel is placed at the upper-right in the old StoneAge-style battle HUD direction.
- Enemy placeholders stand in the upper-left; ally placeholders stand in the lower-right.
- Reserved battle slots stay in `slotId` logic only; empty slots are not drawn on the player-facing battlefield.
- `攻击` locally reduces the wild pet HP.
- Defeating all enemies automatically exits battle after the hit feedback.
- `逃跑` closes battle and returns to map exploration.

## Current Scope

This phase is still local Godot-only. It does not connect to Node.js or MySQL yet.

The battle state is intentionally small:

- `见习猎人`: ally player placeholder.
- `小布伊`: ally pet placeholder.
- `野生乌力`: enemy wild pet placeholder.
- Actor side, kind, slot id, HP, max HP, and action state.

The visual scene is code-drawn placeholder art. No StoneAge/SA80 art or source asset is copied.

## Player Verification

Fast battle preview:

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-preview
```

Manual flow:

- Start the client.
- Move from `火芽训练场` to `火芽村入口`.
- Walk into the grass encounter zone.
- When `发现野生宠物！` appears, click `进入战斗`.
- Confirm the battle panel shows:
  `攻击` / `精灵` / `捕捉` / `help`, then `防御` / `物品` / `换宠` / `逃跑`.
- Click `攻击`; the wild pet HP should drop.
- Keep clicking `攻击`; when the wild pet HP reaches 0, battle should close automatically.
- In a separate battle, click `逃跑`; the client should return to map exploration.

## Validation Commands

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 520 -- --auto-battle-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 240 -- --auto-encounter-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 300 -- --auto-map-transfer-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 240 -- --auto-npc-interaction-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 240 -- --auto-npc-collision-check
```

Expected key line:

```text
battle check ready: status=ok
```

## Next Stage

Continued in Phase 09: 10v10 formation and minimal counterattack.
