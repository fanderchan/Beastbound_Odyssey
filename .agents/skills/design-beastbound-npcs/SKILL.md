---
name: design-beastbound-npcs
description: Design, generate, implement, reuse, audit, and validate production NPC visual archetypes for Beastbound Odyssey. Use for NPC world sprites, true-eight-direction facings or animation, dialogue portraits, bank/stable/shop/guard/administrator role sets, male and female NPC rosters, cross-village appearance reuse, appearanceId/facing/portrait catalogs, image-generation provenance, Godot NPC-art integration, or NPC visual QA. Keep named NPC instances and shared occupational appearance packs separate; use the pet skill instead for pet or mounted-pet production.
---

# Design Beastbound NPCs

Build reusable occupational archetypes, not one bespoke model per named NPC. Keep an NPC's identity, dialogue, service and map placement independent from the visual pack shared by the same role across villages.

## Start from repository truth

1. Read repository and `client/godot/AGENTS.md`, the active `stoneage_gap_plan.md` P2.2 section, and the newest relevant phase notes.
2. Run `git status --short --branch` and inspect recent `git log`. Preserve unrelated and generated user work; never rewrite a dirty asset to make a new pack convenient.
3. Inventory current NPC instances, roles, maps, service handlers, renderer, catalogs and art roots before proposing IDs or paths.
4. Inspect `/Users/fander/projects/_local_references/StoneAge` only for mature interaction and reuse patterns. Never copy its code, data, names or art.
5. For formal visual production, also use `$stoneage9-art-director` and `$imagegen`. Keep image generation behind the identity-canary gate below.
6. Read [production-contract.md](references/production-contract.md) before creating or integrating art. Read [bundle-schema.md](references/bundle-schema.md) before authoring manifests or running the audit script.

## Choose the delivery mode

- For “规划、列职业、怎么复用”: return an archetype catalog and production order without creating art or changing runtime files.
- For “做、制作、落地、八方向、人像”: complete one canary archetype through source, processed frames, runtime integration and review evidence before expanding the batch.
- For “替换某个 NPC 外观”: reuse an existing `appearanceId` when its occupational identity matches; otherwise create a separately reviewed variant.
- For “审计、方向对不对、素材齐不齐”: run read-only catalog and bundle checks, inspect original frames and report failures without repairing unrequested assets.
- Stop for the owner when the decision changes the role taxonomy, approved identity/style, regional variants, or batch-expansion scope. Do not hide those product choices in filenames or runtime tinting.

## Separate instances from appearances

Maintain this contract:

```text
npcId -> unique name, map, position, dialogue, service, quest and schedule
appearanceId -> shared occupational world pack, portraits, scale and anchors
facing -> one canonical authored world direction for this placement/state
portraitState -> expression within the appearance pack; default neutral
```

- Reuse one stable `appearanceId` for the same occupational archetype in every village. A different village, name or dialogue is not a reason for another model.
- Keep sex presentation, silhouette, clothing, tools and palette in the archetype identity. Do not double every role into male/female versions merely to fill a quota; balance the roster across distinct roles.
- Give a genuine regional redesign its own versioned `appearanceId`. Never apply untracked runtime recolors, random accessories or per-instance mirroring.
- Store asset paths in one focused appearance catalog/model. Map data references IDs, never texture paths.
- Preserve existing `npcId`, services, collision and interaction behavior when changing art.

## Lock one identity canary

Do not generate a roster-sized matrix from a prose prompt.

1. Choose the highest-value canary role and write its occupational read: service, silhouette, prop, age/sex presentation, palette, body proportions, forbidden drift and target scale.
2. Use `image_gen` to create a lossless identity board on the declared and recorded background. Include a neutral portrait, full-body front/back and scale comparison; never claim generated pixels equal the requested hex without measuring them.
3. Approve the identity board before direction expansion. Rejected face, costume, prop, proportions or palette returns the state to `in_production`.
4. Produce four independently authored cardinal idle poses, then all eight independently authored idle poses.
5. Build a labeled contact sheet and a second blind sheet with labels/filenames hidden. An independent reviewer must map every silhouette to the correct direction. Any north/northeast/northwest or other neighboring-direction error blocks expansion.
6. For a mobile archetype, approve one complete four-frame gait before producing all eight walk rows.
7. Normally expand to another role only after the first archetype passes deterministic checks, real-client evidence and explicit owner review of its representative images/video. If the owner explicitly pre-authorized a named batch in the current task, the batch may continue as review candidates after the canary is shown, but every expanded archetype remains `owner_review_pending`, release-disabled and subject to whole-batch rework until the owner accepts frozen evidence.

Identity approval never proves direction approval; direction approval never proves runtime import parity.

## Produce the required action matrix

Use exactly these canonical screen/travel directions:

```text
south, southwest, west, northwest, north, northeast, east, southeast
```

They are eight independently authored visual directions. Do not derive east from west or any diagonal from another diagonal by `flipH`, canvas transforms, negative scale, shader UV reversal or offline mirroring.

- Static service archetype: `idle-1` in all eight directions, plus `neutral`, `speaking`, `smile` and `concerned` portraits. Required world total: 8 frames.
- Mobile/patrol archetype: `idle-1 + walk-1..4` in all eight directions, plus `neutral`, `speaking`, `smile` and `concerned` portraits. Required world total: 40 frames.
- Optional gestures may be added after the required matrix passes. Do not rename an idle bob or four duplicates as a walk.
- Keep baseline, scale, head/body proportions, prop hand, near/far limb logic and lighting stable across every direction and frame.
- Treat portrait expressions as the same person and costume, not fresh character generations.

See [production-contract.md](references/production-contract.md) for the exact matrix and review rules.

## Preserve generated-source provenance

- Keep the exact image-generation prompt, model/tool identifier, parameters, lossless raw source and generation timestamp.
- Declare each sheet as `opaque-chroma` (`requestedBackground=#FF00FF`) or `genuine-transparent` (`requestedBackground=transparent`); top-level background is derived exactly as `#FF00FF`, `transparent` or `mixed`. `auto` alpha detection never excuses a missing or contradictory ledger declaration.
- For genuine transparency, preserve every alpha-positive source pixel and canonicalize RGB only under alpha zero. For opaque chroma, use `reviewed_chroma_components_v3_1` and archive the automatic border core plus an exact decision for every whole `enclosed-chroma`, <=3px `adjacent-chroma-fringe`, hard `reviewed-outer-background-hole` and 4-connected `residual-key-color-candidate` component. Residual review starts at 1 pixel: `repair-key-spill` applies the frozen soft-matte proposal only to that exact component, while `retain-authored-color` leaves its bytes unchanged. A v2 ledger is stale and fails closed.
- Archive both the full eligibility mask and an exact changed-pixel mask equal to the decoded raw/processed RGBA difference. No source byte may change outside the latter. Missing, mismatched, partial, stale or all-true review artifacts fail closed.
- Record raw, processed and runtime byte-only/full/Godot-canonical RGBA hashes, both mask file/pixel hashes and counts, source mode and canonical resize settings for every frame.
- Preserve authored magenta/purple clothing, hair shadows, green materials, translucent effects, outlines, alpha and silhouette. Hue/S/D/G scans are diagnostic evidence only; they never authorize automatic color deletion.
- Run `static_detached_foreground_v1` on both processed cells and normalized runtime frames. With alpha >=16 and 4-connectivity, the largest component is the principal subject; any other component of at least 128 pixels blocks the build and requires clean regeneration. Record its exact hash/bbox/count descriptor and never auto-delete it.
- Record origin, ownership/licensing basis and a durable replacement/source path. A generated image without this ledger remains `in_production`.

## Integrate through a focused catalog

1. Validate the complete production bundle before copying runtime frames. Keep the immutable production bundle under the archetype's source archive; install byte-identical runtime copies into the project paths declared by the appearance catalog.
2. Add or extend one NPC appearance catalog/model; keep `main.gd` changes to wiring and compatibility only.
3. Resolve `appearanceId`, canonical `facing`, action and frame from cached catalog entries. Never scan directories, parse JSON, resize images or load files in `_process`, `_draw`, HUD signatures or input paths.
4. Cache textures by `(appearanceId, action, facing, frame)` and invalidate only when the catalog or appearance changes. Preload only bounded visible archetypes.
5. Keep authored source pixels and final Godot textures in parity. Verify import settings, dimensions, alpha, filtering, crop/baseline and decoded-RGBA hashes through the actual runtime path.
6. Use a safe, intentional placeholder/fallback for a missing pack. Do not silently substitute another occupation, mirror a frame or expose a broken texture.
7. Keep arrows, direction labels, hashes, source paths, QA state, reviewer notes and debug controls out of normal player UI. Put evidence in isolated review scenes or `.run/` artifacts.

## Prove the result

For every archetype:

- Audit the source bundle without modifying it:

```sh
python3 .agents/skills/design-beastbound-npcs/scripts/audit_npc_bundle.py /absolute/path/to/bundle
```

- Inspect every original runtime PNG at 1:1 or readable zoom; a contact sheet alone is not acceptance.
- Build one row per direction showing `idle-1` and, for mobile actors, `walk-1..4` together.
- Record a continuous real-Godot MP4 showing each direction as an idle hold followed by a complete walk cycle where applicable.
- Capture representative 1280x720 `Main.tscn` screenshots in a real village with the normal UI and at least one interaction portrait.
- Have the producer create the anonymous packet with `tools/prepare_npc_blind_review_packet.py`. Stage A gives the independent reviewer only `<appearance>/blind/` (randomly named 320px PNGs plus reviewer packet) and freezes `review.blindStageAResult` plus `blindStageAResultSha256`: eight exact `presentationIndex, classifiedDirection, status, visualObservation` rows; portraits, Main and private mapping remain hidden. After that file/hash is immutable, Stage B keeps every direction answer/mapping hidden while giving the same reviewer separately hash-bound portrait and Main artifacts. Freeze `review.blindStageBObservation` plus `blindStageBObservationSha256`; portrait rows are exactly `state, reviewerArtifactPath, reviewerArtifactSha256, status, visualObservation`, and Main rows contain the same artifact pair plus scene/map/NPC/visibility/status/observation fields. They must not contain direction, private, mapping, source-runtime or installed fields.
- Only after Stage A and then Stage B are frozen may the producer run `tools/combine_npc_staged_review.py`. The v2 final audit references both original path/hash pairs, copies all reviewer arrays and strings unchanged, privately deblinds Stage A, and puts installed/source hashes only in separate producer bindings. Never hand-edit or overwrite an existing merge output.

```sh
python3 tools/combine_npc_staged_review.py \
  --action-meta /absolute/path/to/action-bundle-meta.json \
  --stage-a-result /absolute/path/to/stage-a-result.json \
  --stage-b-observation /absolute/path/to/stage-b-observation.json \
  --producer-id <producerId> \
  --output /absolute/new/path/to/blind-audit.json
```
- When renderer/catalog/hot paths change, record idle and moving performance evidence; investigate regressions rather than accepting new per-frame work.
- Run the narrowest affected Godot/catalog tests, `godot --headless --path client/godot --quit`, and `git diff --check`.

Automated checks may advance a pack only to `owner_review_pending`; release/runtime flags remain false. The candidate pipeline must not create `release-owner-decision.json`. Only explicit owner acceptance of frozen evidence may create that exact-key record. Its `acceptedEvidence` must exactly equal the release attestation's ten-key `strictEvidence`, including the direct `blindStageAResultSha256` and `blindStageBObservationSha256` bindings; only then may approval and runtime flags become true. A rejected frame returns only the affected pack to `in_production` and blocks batch expansion.

## Finish narrowly

- Report exact archetypes, instance reuse, files, commands, evidence and remaining owner-review state.
- Update the active roadmap only after runtime integration, targeted checks and required visual evidence pass.
- Stage and publish only the issue scope when current repository instructions authorize it. Never include unrelated dirty assets.
