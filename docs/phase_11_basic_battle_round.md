# Phase 11: Basic Battle Round Event Queue

## Goal

Turn Phase 10 target selection into the first local battle-round loop:

- `攻击` builds a basic round event queue.
- Current command flow requires choosing `攻击`, then confirming a living enemy target.
- Living allies attack using the confirmed enemy as the preferred target.
- If the preferred target falls, later events fall back to the next living enemy.
- 后续行动如果因为原目标倒下而转向其他活目标，表现层也必须使用实际命中的目标，不能继续冲向已经倒下的原目标。连续转火也必须成立，例如目标 1 倒下、目标 2 也倒下后，下一次行动要正确打向目标 3。
- Living enemies counterattack after ally events.
- Battle commands stay locked while the round is playing.
- The command panel returns after the round if both sides still have living actors.
- If one side is defeated, battle exits back to the map after the final action beat.

## Current Scope

This phase is still local Godot-only.

The round is intentionally simple:

- No agility or initiative stat yet.
- No skill, item, capture, defense, or escape success formula yet.
- No per-player command submission in 10v10 yet.
- No server-authoritative event list yet, but the local event queue is shaped so it can be replaced by one later.
- Placeholder actors still use simple geometric art and basic hit/attack offsets.

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

- Before choosing `攻击`, no enemy should show a target ring.
- Click `攻击`; mouse hover over a living enemy should show the target ring, and click/tap should confirm it.
- After the target is confirmed, commands should lock while the round plays.
- In normal battle, the player and pet should attack before the enemy counterattack.
- In 10v10 preview, multiple ally and enemy placeholders should take turns moving/hitting.
- After the round finishes, command buttons should become usable again if both sides still have living actors.
- If the last enemy is defeated, battle should close and return to the map.

## Validation Commands

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1200 -- --auto-battle-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --auto-battle-round-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 480 -- --auto-battle-target-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 360 -- --auto-battle-formation-check
```

Expected key lines:

```text
battle check ready: status=ok
battle round check ready: status=ok
battle target check ready: status=ok
battle formation check ready: status=ok
```

## Next Stage

Pause here for user approval before adding battle damage popups, command targeting for `捕捉`, or a formal battle event-list data contract.
