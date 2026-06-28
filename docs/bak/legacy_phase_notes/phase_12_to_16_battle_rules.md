# Phase 12-16: Battle Rule Prototype Bundle

## Goal

Implement the next five local Godot-only battle slices so they can be tested together:

- Phase 12: quick/speed-based action ordering.
- Phase 13: damage popups, hit feedback, and simple defeated/captured fade states.
- Phase 14: first combo attack prototype.
- Phase 15: first capture command prototype.
- Phase 16: corrected player `精灵` targeting plus a separate controlled-pet command step.

## StoneAge 8.0 Reference Notes

The 8.0 source was used only as a behavior reference, not copied.

Relevant source concepts:

- `gmsv/src/battle/battle.c` builds a `BATTLE_CHARLIST` for both sides.
- `BATTLE_DexCalc` derives action speed mainly from `CHAR_WORKQUICK`.
- `EntrySort` sorts battle entries by calculated `dex`.
- `ComboCheck` marks compatible same-side, same-target normal attacks as combo candidates.
- `magic.c` keeps recovery-style spirit effects on same-side targets in non-PvP battle.
- Pet skills use a separate pet-skill path with up to seven pet skill slots; normal attack and guard remain pet commands.

Beastbound keeps the same broad idea for now:

- Every battle actor has `quick`.
- Event lists are sorted by effective speed.
- The current prototype is deterministic for testing; StoneAge-style random speed variance can come later.
- Combo is currently limited to adjacent ally normal attacks against the same target.

## Phase 12: Quick Order

`攻击` now builds a local battle event list ordered by speed instead of batching all allies before all enemies.

Manual check:

- Open 10v10 battle preview.
- Select a target and press `攻击`.
- Enemy and ally units should take turns in mixed order.

Validation:

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 600 -- --auto-battle-speed-check
```

## Phase 13: Feedback

Attack, combo, pet skill, spirit heal, and capture events can create floating text over the target. Hit targets shake briefly; defeated and captured targets fade down.

Manual check:

- Press `攻击`.
- Damage text should float above the target.
- Low-HP defeated targets should fade instead of behaving like healthy actors.

Validation:

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 800 -- --auto-battle-feedback-check
```

## Phase 14: Combo Prototype

When two adjacent speed-ordered ally normal attacks target the same enemy, they fold into one `合击` event.

Current scope:

- Local deterministic ally combo only.
- No enemy combo probability yet.
- No special combo art yet.

Validation:

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 800 -- --auto-battle-combo-check
```

## Phase 15: Capture Prototype

`捕捉` attempts to catch the selected wild enemy. The current deterministic rule succeeds when the target is weakened enough.

Manual check:

- Fight normally until the wild enemy is low HP.
- Press `捕捉`.
- If successful, battle returns to the map.

Validation:

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 800 -- --auto-battle-capture-check
```

## Phase 16: Spirit And Pet Command Correction

`精灵` is a player equipment/spirit command, not a pet skill shortcut. It opens a spirit menu in the same upper-right command panel:

- `恩惠精灵5`: heals all living allies.
- `滋润精灵5`: asks for one living ally target.
- `毒精灵5`: asks for one living enemy target.
- `毒雾精灵5`: poisons all living enemies.
- Invalid side taps are rejected for single-target spirits.

After the player's command is chosen, the same upper-right command panel switches to `PET` if the controlled pet is alive:

- `技1 攻击`
- `技2 防御`
- `技3 布伊冲撞`, which asks for one living enemy target.
- `技4` to `技7` are visible but disabled placeholders.
- `返回` cancels the pending player command and returns to `PLAYER`.

Only `见习猎人` and `小布伊` are player-controlled in the 10v10 preview. Other allied placeholders are treated as friendly NPCs and use simple AI attacks.

Manual 10v10 check:

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-preview-10v10
```

- Pet target choice: select one enemy, press `攻击`, press `技3 布伊冲撞`, then click a different enemy. The pet skill should hit the newly clicked target.
- Spirit target rules: press `精灵`, choose each spirit, and confirm single-target skills only accept the proper side while all-target skills affect the whole side.

Validation:

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 800 -- --auto-battle-spirit-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 800 -- --auto-battle-pet-command-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-pet-target-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-spirit-four-check
```

## Full Regression

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1400 -- --auto-battle-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3600 -- --auto-battle-round-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1200 -- --auto-battle-target-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 360 -- --auto-battle-formation-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 300 -- --auto-battle-action-catalog-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1200 -- --auto-battle-pet-command-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-pet-target-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-spirit-four-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --auto-battle-item-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3600 -- --auto-battle-item-count-check
```

## Next Stage

Pause after user testing. Recommended next choices:

- Item counts and consume-on-use behavior for the new battle item menu.
- More pet skills with individual target rules.
- Formal battle event-list JSON contract for a future Node.js authority.
- Real pet/character battle action assets replacing placeholder geometry.
