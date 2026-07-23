# Runtime Cue Contract

Keep stable semantic cue IDs independent from filenames. One asset may serve several cue IDs when their acoustic role matches.

## Music contexts

| Context | Cue | Rule |
|---|---|---|
| Town/village | `music.town` | calm high-level world context |
| Wilderness/route | `music.wilderness` | exploration context |
| Cave/dungeon | `music.cave` | enclosed or underground context |
| Ordinary battle | `music.battle_normal` | overrides map context until battle ends |
| Boss battle | `music.battle_boss` | only with authoritative boss classification |

## Action phases

| Phase | Meaning | Typical cues |
|---|---|---|
| `action_start` | visible windup, swing, launch, or cast begins | `combat.motion_*`, `combat.cast_*` |
| `contact` | attacker visibly reaches target or projectile lands | `combat.hit_*`, `combat.block`, `combat.evade` |
| `reaction` | target reacts after contact | `combat.counter_ready`, `combat.launch`, `combat.knockback`, `combat.down` |
| `outcome` | battle or capture result becomes visible | `outcome.victory`, `outcome.defeat`, `outcome.capture` |

Do not emit all phases for every action. A cue plays only when the corresponding visible event exists.

## Canonical first-pass cues

```text
combat.motion_character
combat.motion_pet
combat.cast_skill
combat.hit_light
combat.hit_heavy
combat.block
combat.evade
combat.critical
combat.counter
combat.launch
combat.knockback
combat.down
combat.revive
creature.pet_effort
creature.pet_hurt
outcome.victory
outcome.defeat
ui.confirm
ui.cancel
ui.error
world.encounter
world.warp
```

## Selection rules

- `attack`: action-start motion, then light/heavy contact.
- `skill_attack`: cast or pet motion, then contact; add element/status families only when declared.
- `dodge`/miss: motion + `combat.evade`; no solid hit.
- `defend`/block: motion + `combat.block`; do not also play ordinary contact at full weight.
- `critical`: normal action family + short `combat.critical` emphasis at contact.
- `counter_attack`: use `combat.counter` at its own action start, then its own contact cue.
- `launch`/knockaway: contact first, then `combat.launch` or `combat.knockback` during target travel.
- `down`: use an explicit visual timeline marker such as `downSoundProgress`; play only after the target reaches its own slot/ground or the down animation becomes visible. Do not guess one universal post-contact delay, because counter-KO and launch paths have different return phases.
- `revive`: play when the revive animation/state begins, not when the server packet arrives.

## Priority and de-duplication

Default priority, high to low:

```text
outcome > counter/launch/down/revive > critical/block > contact > motion/cast > creature voice > UI ambience
```

- A pool at capacity steals the oldest lowest-priority voice, never a higher-priority voice for a lower one.
- Identical cue requests inside their cooldown collapse to one.
- Separate events in a combo may repeat after cooldown; same-frame fan-out should share a bounded representative contact sound rather than emit one full-volume hit per target.
- Music does not consume an SFX pool voice.

## Acoustic profiles

Use declared, reusable profiles such as:

```text
character_light
character_heavy
pet_furry_small
pet_furry_large
pet_armored
pet_aquatic
pet_draconic
```

A profile selects variants and pitch/gain ranges. It never changes authoritative combat results. Use deterministic event seeds for subtle variation so playback remains reproducible in QA.
