---
name: design-beastbound-maps
description: Design, generate, implement, reuse, audit, and validate production town, wilderness, dungeon, interior, and route visuals for Beastbound Odyssey. Use for map styles, isometric ground tiles, terrain atlases, roads, encounter-ground readability, separate environmental props, buildings, gates, map visual catalogs, Godot world rendering, collision-safe placement, map screenshots, movement/performance QA, or replacing the current procedural grid. Keep map gameplay data authoritative and separate from reusable visual styles; use NPC, pet, or sprite skills for actors.
---

# Design Beastbound Maps

Build playable map visuals around the existing authoritative grid, not a flat illustration. Preserve every map's IDs, movement, blockers, interactions, encounters, spawns and warps while replacing the procedural presentation with reusable original art.

## Start from repository truth

1. Read repository and `client/godot/AGENTS.md`, `stoneage_gap_plan.md` P2.1/P2.2, and the newest relevant `docs/phase_*.md` notes.
2. Run `git status --short --branch` and inspect recent `git log`. Never absorb unrelated pet, NPC, server, generated import or user work into the map change.
3. Inventory `MapDataCatalog`, `IsoMapModel`, the current renderer, map JSON, `map_regions.json`, the player path, camera bounds, collision, interactions, encounter zones, spawns and warps before choosing art or data changes.
4. Inspect `/Users/fander/projects/_local_references/StoneAge` only for mature world hierarchy, route legibility and interaction intent. Never copy maps, layouts, code, names, numbers, tiles or props.
5. Use `$generate2dmap`, `$imagegen`, `$godot-2d-client` and `$stoneage9-art-director` for formal visual work. Use `$computer-use` for the final real-client interaction pass when available.
6. Read [production-contract.md](references/production-contract.md) before generating or integrating art. Read [bundle-schema.md](references/bundle-schema.md) before authoring or auditing a formal bundle.

## Choose the delivery mode

- For planning, style exploration or a map backlog: produce map roles, biome/style reuse, production order and acceptance gates without changing runtime art.
- For “做、生成、实装、城镇、野外”: complete one connected canary slice through visual assets, runtime wiring, movement/collision checks and real-client evidence before broad batch expansion.
- For replacing or repairing a map: keep the gameplay map contract stable unless the user explicitly requests a gameplay/layout change. A visual task does not authorize moving warps, NPCs, encounter zones or rewards.
- For audit or review: inspect source assets, bundle declarations, runtime captures and critical paths read-only. Do not silently regenerate rejected art.
- Stop for the owner when a choice changes world topology, progression, economy, regional identity, interaction placement, or an already accepted visual style.

## Separate gameplay maps from visual styles

Maintain this contract:

```text
mapId        -> grid, spawns, blockers, interactions, NPCs, warps, encounters and rewards
mapStyleId   -> reusable terrain atlas, palette, ground rules, prop library, scale and lighting
mapBinding   -> a mapId's terrain assignments and independently placed scene objects
sceneObject  -> asset, anchor, display size, sort base, collision role and interaction linkage
```

- Reuse one stable `mapStyleId` across maps in the same region/biome. A different map name or quest is not a reason to duplicate a tileset.
- Give a genuinely different biome, climate, settlement culture or dungeon material its own versioned style.
- Store visual paths in one focused catalog/model. Gameplay map data should reference stable visual IDs rather than scattering texture paths.
- Keep `80x40` as the authoritative logical isometric footprint unless a separately approved migration changes the whole coordinate contract.
- Do not derive blockers from image alpha or painted pixels. Existing grid collision remains authoritative; new object blockers must be explicit and regression-tested.

## Freeze a canary contract before image generation

Choose one connected town-and-field slice on the real player path. Record:

1. each map's player purpose, level band, entry/exit, landmark, encounter readability and reason to stay;
2. selected `map_mode`, visual model, runtime object model, collision model and engine target;
3. camera/perspective, logical tile size, source art scale, palette, lighting, texture density and actor-to-prop scale;
4. ground tile IDs and where each may appear;
5. a bounded scene-object list with asset strategy, cell/world anchor, display size, render layer, sort base and collision role;
6. protected critical cells: every spawn, warp, NPC approach, main route and encounter access point;
7. forbidden drift, including baked actors, unreadable routes, copied reference art, runtime mirrors, excessive noise and decorative blockers.

For Beastbound exploration, default to `tile_mode + layered_tilemap/project-native objects + tile collision/trigger zones`. A generated full-map painting may be a concept or review image, never the authoritative playable map.

## Generate separated visual assets

1. Write every creative prompt manually and save it byte-for-byte next to the generated source.
2. Generate ground/terrain art first. It may contain stable ground, paths, water, mud, cliffs and low markings, but no buildings, trees, signs, gates, actors, NPCs, pets, UI or text.
3. Inspect the ground art before producing objects. If a reference mockup is needed, make the actual base visible, generate a sparse in-world dressed reference, and keep it out of runtime.
4. Classify every object before generation. Compact rocks/plants/crates may share a reviewed pack; buildings, large trees, gates, bridges and collision-aligned objects are generated one-by-one or with explicit non-square strategies.
5. Keep each runtime object transparent, fully in-frame and separately placeable. Record center-bottom or declared anchors, intended display size and footprint.
6. Preserve raw generation, prompt, tool/model, timestamp, processing commands, source hashes, runtime hashes, ownership basis and replacement path. Deterministic cropping, chroma removal, resizing and atlas assembly may process generated art but must not invent replacement art.
7. Never bake characters, NPCs, pets, enemies, quest icons or readable labels into map art. Actor art remains owned by the relevant actor skill/catalog.

Use the bundled deterministic helpers only after reviewing the generated source. Run
from the repository root and choose a fresh, non-symlink output directory under
`.run/`; do not point either helper at an installed runtime directory:

```bash
python3 .agents/skills/design-beastbound-maps/scripts/build_isometric_tile_atlas.py \
  client/godot/assets/maps/firebud_region_visual_v1/source/processed/firebud-ground-sheet-v2-alpha.png \
  --rows 2 --columns 2 \
  --labels firebud_meadow firebud_ochre_path firebud_honey_stone firebud_dark_root_soil \
  --output-dir "$PWD/.run/map-build/firebud-ground-fresh" \
  --atlas-columns 2 --alpha-threshold 0 \
  --atlas-name atlas.png --manifest-name build-manifest.json

python3 .agents/skills/design-beastbound-maps/scripts/extract_object_sheet.py \
  client/godot/assets/maps/firebud_region_visual_v1/source/processed/firebud-low-props-sheet-v2-alpha.png \
  --rows 2 --columns 2 \
  --labels firebud_training_target firebud_supply_pots firebud_low_planter firebud_low_fence \
  --output-dir "$PWD/.run/map-build/firebud-low-props-fresh" \
  --padding 8 --max-dimension 256 --alpha-threshold 0 \
  --anchor 0.5 1.0 --manifest-name objects-manifest.json
```

Before either command, the source must be a reviewed, exact-RGBA/alpha PNG whose
dimensions divide evenly by the declared grid, every row-major label must match a
non-empty cell, and the chosen output directory must not already contain any target
file. The atlas helper accepts `--overwrite` only for an explicitly reviewed rebuild
whose `tiles/` directory is empty or contains exactly the expected tile PNG names;
the object helper never overwrites. Visible object alpha touching a source-cell edge
fails closed unless `--allow-cell-edge-touch` is deliberately supplied and the
recorded override is reviewed. The atlas helper only assembles declared `80x40`
terrain cells. The object helper only crops reviewed cells into independent
transparent assets; neither helper may invent art, mirror content or decide
collision. See the runnable contract and output rules in
[production-contract.md](references/production-contract.md).

## Integrate through focused world models

1. Audit the formal bundle before installing runtime copies.
2. Add or extend a focused map visual catalog/renderer under `client/godot/scripts/world/`; keep `main.gd` changes to cached wiring and draw dispatch.
3. Resolve and cache `mapStyleId`, tile textures and object textures on map load. Never scan directories, parse JSON, load images, resize textures or build large signatures in `_draw`, `_process` or input hot paths.
4. Draw ground by the authoritative grid and visual assignments. Draw independently placed objects through the declared render order; use y-sort/foreground layers only where the object contract requires them.
5. Keep interaction markers, NPCs, pets, player, remote players, drops, target/path overlays and HUD in their established semantic layers. Visual art must not hide required click targets or player-facing feedback.
6. A missing, invalid or unapproved visual bundle fails closed to the intentional existing fallback; it must not substitute another biome or read production evidence at runtime.

## Prove gameplay and presentation together

For every integrated canary slice:

- Run `python3 .agents/skills/design-beastbound-maps/scripts/audit_map_bundle.py <bundle.json>`.
- Run the project-owned external-authority check (for the current Godot client: `godot --headless --path client/godot --script res://scripts/qa/map_visual_runtime_check.gd`). Its report must be produced from the real `MapDataCatalog`, bindings and hashes, then frozen in the bundle; never hand-author a passing report. To generate missing reports, add `-- --generate-map-visual-catalog-contract`; generation refuses an existing report unless `--overwrite-map-visual-catalog-contract` is also supplied. Each bundle is written to a temporary file and atomically installed, but a multi-bundle run is not a cross-bundle transaction. Copy each printed generated SHA into that bundle's `catalogContractCheck.sha256`, then rerun the default strict command without generation flags.
- Parse every changed JSON and run `git diff --check`.
- Run `godot --headless --path client/godot --quit` and the narrowest map/warp/interaction/encounter checks.
- Exercise spawn-to-warp, return warp, NPC approach, encounter access and at least one blocked-object edge with real multi-frame input.
- Record same-build idle and moving performance; investigate draw/import/cache regressions instead of accepting them.
- Launch the normal `res://scenes/Main.tscn` at 1280x720. Use Computer Use to move through the town, cross into the field, inspect landmarks/route readability, test hover/click interaction and return.
- Capture representative 1280x720 town and field screenshots; use a short video when movement, y-sort or transition readability matters.
- Inspect the final rendered board for actor scale, tile seams, texture noise, clipping, blank edges, route clarity, collision truth, prop layering and UI obstruction.

The formal Computer Use report is not a prose note or a Godot-driven capture. For
every manifest map it must contain the complete five-kind action matrix:
`pointer`, `movement_path`, `warp`, `collision`, and `occlusion`. Every action must
PASS and point by exact path/SHA to exactly one same-map frozen 1280x720 runtime
screenshot/capture-report pair; that pair cannot be reused by another action.
Modes are fixed: pointer=`idle`, movement_path=`moving`, warp=`moving|transition`,
collision=`moving`, and occlusion=`moving`. The occlusion action/receipt must
describe and prove the live pass in front of/behind a tall object; do not invent an
unsupported handwritten `occlusion` capture. Every action also owns a unique,
non-empty, in-bundle hashed `.log`/`.txt`/`.jsonl` `actionReceipt`. Missing Computer
Use capability, a transport failure, reused or wrong-mode evidence, a missing raw
receipt, evidence from another bundle/map, or an incomplete matrix is a formal
release blocker; keep `computerUseReport: null` rather than manufacturing PASS.
Distinct entries may share a mapId/mode where the action contract requires it
(movement, collision, and occlusion are all `moving`), but their image refs, capture-report
refs, concrete pairs, and receipts must all remain unique.

Automated and independent checks may advance new map pixels only to
`owner_review_pending`. Keep `releaseApproved=false` and `runtimeEnabled=false` for
normal players until the project owner explicitly accepts the frozen visual
evidence. `approved` records that acceptance but still keeps both runtime flags
false; only `released` may set both flags true. QA preview may show pending art only
behind an explicit debug/review path. A rejected tile or prop returns the affected
bundle to production without rewriting old evidence.

Treat provenance and runner identity as release gates, not optional commentary.
The manifest and provenance must freeze the exact raw sources and intermediate
`buildArtifacts`; provenance must also declare the non-empty toolchain, complete
processing commands and byte-exact reproducibility preconditions. An unvendored
external helper (`externalToolVendored=false`), a non-empty provenance
`releaseBlocker`, missing collision/performance `runnerIdentity` (whose runner must
be the literal `godot`), or missing non-empty hashed `.log`/`.txt`/`.jsonl`
`rawRunnerReceipt` keeps the bundle pending and makes approved/released auditing
fail. If provenance declares `externalChromaKeyTool.repositoryOwned=true` or
`externalToolVendored=true`, its tool path must be a readable, hash-matching
bundle-relative file reference; an absolute `/Users/`, `/home/`, or drive-letter
path in any `processing` command remains a separate release gate.

The runtime does not import `source/` or `evidence/`, so lifecycle fields alone are
not proof of release. Before any lifecycle flip or export, run the offline auditor
on the exact bundle and have the pre-export gate parse both `status` and
`releaseReady`; an exit-zero structural PASS with `releaseReady=false` is still not
releasable. Never hand-edit a pending bundle to `released` or rely on runtime code
to reconstruct ignored evidence.

## Finish narrowly

- Document the map roles, style reuse, data/runtime contract, visual evidence, exact validation commands and residual owner-review state in a new phase note.
- Do not mark P2.1 or P2.2 complete from one town-and-field canary.
- Stage and publish only the map skill, map visuals, focused runtime wiring, tests and phase evidence belonging to the completed slice.
