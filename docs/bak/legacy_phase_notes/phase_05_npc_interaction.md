# Phase 05: NPC Interaction And Task Trigger

## Goal

Make map interaction feel like an RPG loop:

- Tap or click an NPC/interaction object.
- The player walks to a nearby walkable cell instead of standing on the object.
- A dialog opens only after the player arrives.
- A simple task flag changes after the dialog action is confirmed.

## Player Verification

- Click `训练师阿土`; the player walks beside him, then opens a dialog.
- Click `完成对话`; the task text changes from `和训练师阿土对话` to `已认识训练师阿土`.
- Click `可重叠路人`; the player walks onto the same cell before the dialog opens.
- Click `挡路门卫`; the player stops on a neighboring cell before the dialog opens.
- Click `村口木门`; the player walks beside the gate and sees a short unavailable-map dialog.
- Click normal map tiles; movement still behaves like Phase 03/04.
- On phone-shaped previews, the dialog stays above the bottom action bar.

## NPC Data Contract

NPC and interaction records live in `client/godot/data/*.json` under `interactionPoints`.

- `id`: Stable record id for scripts, saves, and future server authority.
- `name`: Player-facing Chinese display name.
- `kind`: Interaction family, such as `npc`, `gate`, `warp`, `shop`, `healer`, `quest`, or `object`.
- `cell`: Isometric map cell `[x, y]`.
- `movementCollision`: Movement collision policy. The default is `overlap`.
- `action`: Short player-facing action label, such as `对话`, `查看`, `传送`, or `交易`.
- `taskKey`: Optional local task flag key.
- `taskText` / `completedTaskText`: Optional task tracker text.
- `dialog` / `completedDialog`: Dialog lines.
- `option`: Dialog button label.

`movementCollision` values:

- `overlap`: Default. The character has no movement collision; the player can move onto the same cell. This matches StoneAge 8.0 `CHAR_ISOVERED=1`.
- `block`: The character or object occupies the cell; pathfinding treats it as blocked and interaction movement chooses a nearby approach cell. This matches StoneAge 8.0 `CHAR_ISOVERED=0`.

Design defaults:

- Missing `movementCollision` must be treated as `overlap`.
- Other players and optional following pets should stay non-blocking.
- Ordinary static NPCs, shopkeepers, door guards, and closed gates can opt into `block`.
- Warp points, invisible triggers, decoration-only guides, and crowdable player-like characters should usually stay `overlap`.

## Validation Commands

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-npc-collision-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 180 -- --auto-npc-interaction-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-camera-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-pathfinding-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-facing-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 60 -- --auto-pet-follow-check
```

Expected key line:

```text
npc interaction check ready: status=ok trainer_found=true clicked_trainer=true dialog_opened=true task_complete=true player_close=true trainer_blocks=true not_on_trainer=true
```

## Next Stage

Phase 06 continues with multi-map transfer points.
