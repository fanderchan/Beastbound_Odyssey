# Beastbound Odyssey Asset Audit

Date: 2026-07-03
Scope: tracked runtime/client files under `client/godot`; `.run/`, `.godot/`, exported packs, screenshots, movies, and local validation artifacts are excluded.

## Summary

- Tracked external runtime media: 0 files. No tracked PNG/JPG/WebP/GIF/SVG/audio/font/3D/source-art files are currently shipped.
- Tracked Godot scenes: 3 files: `Main.tscn`, `Player.tscn`, `Pet.tscn`.
- Tracked map JSON files: 25 files under `client/godot/data/*_map.json`.
- Pet template placeholder palettes: 21 `placeholderPalette` declarations in `client/godot/data/pet_templates.json`.
- StoneAge/SA80 art reuse: none in tracked runtime assets. Existing references are design/behavior reference only.

## Runtime Asset Inventory

| Area | Runtime path(s) | Source | Ownership / license status | Placeholder status | Replacement path |
| --- | --- | --- | --- | --- | --- |
| Player scene geometry | `client/godot/scenes/player/Player.tscn`, `client/godot/scripts/player/player.gd` | Original in-repo Godot Polygon2D shapes and script animation cues | Project-owned code/scene data | Placeholder. Uses simple body, feet, shadow, and facing marker for 8-direction state | Replace with original player sprite sheets or skeletal 2D animations; keep the current movement/facing API and add asset source metadata before import |
| Pet follower scene geometry | `client/godot/scenes/pet/Pet.tscn`, `client/godot/scripts/pet/pet.gd` | Original in-repo Godot Polygon2D shapes and script animation cues | Project-owned code/scene data | Placeholder. Uses simple body, feet, and facing marker | Replace with original pet follower sprite sheets keyed by template/form; keep `idle`/`walk` state contract and add source/license metadata |
| World terrain rendering | `client/godot/scripts/main.gd`, `client/godot/data/*_map.json` | Original structured map data and code-drawn isometric tiles | Project-owned map data and rendering code | Placeholder. Terrain, decor, zones, markers, and interaction points are drawn procedurally | Introduce original tilesets/props; bind them from map JSON or a map asset manifest while preserving collision, transfer, encounter, and marker contracts |
| Battle scene rendering | `client/godot/scripts/main.gd`, `client/godot/data/pet_templates.json` | Original code-drawn battle actors, formation slots, effects, labels, and data palettes | Project-owned code/data | Placeholder. Actors, mounts, melee/contact, launch, floor noise, HP bars, and status visuals are procedural | Replace actor and effect drawing with original sprite/effect assets; maintain shared PC/mobile formation coordinates and 10v10 slot contract |
| Pet forms and palettes | `client/godot/data/pet_templates.json` | Original template data; visual identity currently represented by `placeholderPalette` | Project-owned data | Placeholder. 21 forms still point to palette tags rather than art assets | Add `assetId` or manifest references for each form; keep palette tags only as fallback/dev diagnostics, not final release art |
| Maps and regions | `client/godot/data/*_map.json`, `client/godot/data/map_regions.json`, `client/godot/data/rebirth_trials.json` | Original structured gameplay/map contracts | Project-owned data | Partially placeholder. Layouts are functional, but visual dressing is procedural and sparse | Attach terrain/prop asset manifests per region; validate walkability, transfers, NPC facilities, encounters, and task-route markers after art replacement |
| UI and HUD | `client/godot/scripts/ui/*.gd`, `client/godot/scripts/main.gd` | Original Godot Control tree built in code | Project-owned code | Mostly production-functional but visually plain; no external icon/font pack is shipped | Add an original UI icon/font/style pack with documented license/ownership; keep Chinese player-facing text and mobile-first layout rules |
| Numeric/QA/dev panels | `client/godot/scripts/ui/panel_flow_coordinator.gd`, `client/godot/scripts/ui/qa_panel_*.gd` | Original tool UI code | Project-owned code | Developer-only tools, now gated from release by E3 | Do not ship as player-facing content; any future internal assets must live behind the dev-tools feature gate |
| Generated validation captures | `.run/godot/*.png`, `.run/godot/*.wav`, `.run/godot_auto_checks/*` | Local generated evidence | Not tracked runtime content | Not runtime assets | Keep excluded from release packages and source ownership accounting |

## Placeholder Items To Replace Before Art-Complete Release

- Player character visual: replace Polygon2D body/facing/feet placeholders.
- Pet follower visual: replace Polygon2D pet body/facing/feet placeholders.
- Battle actors: replace procedural player/pet/wild/mount bodies, shadows, contact, launch, float feedback, and floor/noise drawings.
- World tiles and decor: replace procedural isometric tile fills, decor cells, encounter-zone tinting, and marker-only facilities.
- Pet forms: replace all 21 `placeholderPalette` pet form tags with explicit original art asset references.
- UI visual system: add owned icons/fonts/style resources if the product target requires a finished non-placeholder presentation.

## Future Import Rules

Every new non-placeholder runtime asset must be accompanied by:

- Runtime path and owning feature.
- Source or generation workflow.
- Copyright owner and license/permission status.
- Whether it is final, temporary, or replacement candidate.
- Replacement path if temporary.
- Validation evidence: import check, in-client screenshot/check, and affected auto-check/performance probe when relevant.

No StoneAge9 or SA80 art asset may be copied into this project without explicit user approval for that exact file or asset set.
