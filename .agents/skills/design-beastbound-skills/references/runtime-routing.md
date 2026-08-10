# Runtime Routing

## Canonical Sources

- Active mechanics: `client/godot/data/battle_actions.json`
- Passive mechanics: `client/godot/data/battle_passive_skills.json`
- Trainer supply/prices: `client/godot/data/pet_skill_training.json`
- Form defaults: `client/godot/data/pet_templates.json`
- Evolution skill mutations: `client/godot/data/pet_evolution_routes.json`
- Fusion/inheritance: `client/godot/data/pet_fusion_recipes.json`

## Godot

- Active catalog: `client/godot/scripts/battle/battle_action_catalog.gd`
- Passive catalog: `client/godot/scripts/battle/battle_passive_catalog.gd`
- Training model: `client/godot/scripts/progression/pet_skill_training_model.gd`
- Instance slots/profile behavior:
  `client/godot/scripts/progression/player_progress_model.gd`
- Pet management host:
  `client/godot/scripts/ui/panel_flow_coordinator.gd`

Add focused presentation/UI modules instead of growing the host coordinator:

- `pet_skill_presentation_model.gd`
- `pet_skill_icon_catalog.gd`
- `pet_skill_card.gd`
- `pet_skill_overview_panel.gd`
- `pet_skill_visual_skin.gd`

The host should only mount, refresh, and connect authoritative mutations.

## Node

The Node service loads shared active/passive catalogs and owns profile mutations,
target validation, random rolls, settlement, and battle events. Audit current
consumers before every new effect type.

Current warning: generic client validation accepts more effect kinds than the Node
pet-skill settlement path implements. In particular, ally healing/cleanse,
multi-target, multi-hit, field effects, cooldowns, and combat resources must not be
declared complete from JSON alone.

The skill inspector enforces this current pet-owner support matrix:

| Effect | Command | Target |
| --- | --- | --- |
| `damage` | `attack` or `pet_skill` | single enemy |
| `defend` | `defend` | self only |
| `status` | `pet_skill` | selected single enemy |

`heal`, `cleanse`, and every other owner/effect/target combination must fail
inspection until Node settlement, target validation, authoritative events, Godot
replay, production AI/auto-battle behavior, and tests land together. Never change an
unknown effect to the damage fallback merely to make it executable.

## AI Routing

- Node production AI, player auto-battle, human commands, and the isolated
  spectator lab are separate runtime contexts.
- Human selection does not prove either AI path.
- The spectator lab is presentation-only and cannot prove production targeting,
  authority, balance, or performance.
- Record the applicable contexts and stable target tie-break in the design
  contract, then test each implemented context independently.

## Presentation Placement

Add `presentation` beside each canonical active/passive entry. Typical fields:

```json
{
  "description": "玩家可读的技能说明。",
  "role": "control",
  "source": "trainer",
  "iconPath": "res://assets/skills/pet_skill_icons_v1/runtime/active/example.png"
}
```

Keep numbers in the mechanical `effect` and derive UI summaries from them. Trainer
data must not duplicate mechanical descriptions.

## Compatibility

- Keep stable IDs across catalogs, saves, network payloads, tests, and art paths.
- Coordinate client/server changes for an incompatible network contract.
- Do not bump protocol versions for presentation-only metadata.
- Unknown legacy skills must fail safely in UI without being silently executable.
- Never make client presentation metadata authoritative for settlement.
