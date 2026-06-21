# StoneAge9 Reuse Audit

## Verdict

For Phase 01, reuse StoneAge9 as a reference only. Do not copy runtime art, scenes, or the full client.

## Useful To Reuse As Ideas

- Godot-first project layout under a self-contained client folder.
- Chinese player-facing UI by default.
- Data-driven thinking for maps, pets, combat, and future server authority.
- Clear separation between runtime assets, manifests, generated evidence, and replacement contracts.
- Visual QA through actual Godot launch and screenshots.
- Guardrail that default player UI should not show agent-only diagnostics.

## Not Reused In Phase 01

- SA80 temporary reference assets.
- StoneAge9 Godot scenes and large `main.gd` orchestration.
- StoneAge9 pet roster and 119-species catalog data.
- Existing pet, NPC, map, UI, and battle images.
- Legacy C server sources and MySQL schema.

## Candidate Future Reuse, Requires User Approval

- StoneAge9 `owned_generated` UI frame/fill or icon concepts as temporary style references.
- StoneAge9 generated pet action bundle workflow and contact sheet requirements.
- StoneAge9 map data contract shape: base image, walk bounds, blocked zones, spawn points, interaction points, route hints, and battle background.
- StoneAge9 validation style: headless Godot checks plus visual proof for player-facing changes.

## Current Phase Asset Policy

Phase 01 uses code-drawn placeholders only. Any later asset import must identify source, ownership, replacement path, and validation evidence before it becomes runtime art.
