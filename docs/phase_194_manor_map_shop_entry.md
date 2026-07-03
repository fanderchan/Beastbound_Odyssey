# Phase 194 Manor Map Shop Entry

## Goal

Move nine manors from a family-panel-only concept toward real world locations:

- every manor in `data/manors.json` has a `mapId` and `spawnName`;
- Firebud Village Gate has a visible warp entry for all nine manor maps;
- every manor map has a return warp and a matching manor item-field NPC;
- manor item fields still use the existing `shopId` and `access.familyManorId` server authority gate.

## Scope

This slice keeps manor maps as functional placeholder maps. It does not add final art, indoor layouts, manor guards, manor war terrain rules, or NPC schedules.

## Validation

Primary check:

```bash
node tools/run_godot_auto_checks.mjs --only --auto-manor-map-shop-check
```

Expected evidence:

- `manor map shop check ready: status=ok`
- count is 9;
- the first manor shop NPC opens the correct shop panel;
- each manor map has a village entrance, return warp, shop NPC, and shop access contract.
