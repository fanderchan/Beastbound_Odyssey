# Beastbound NPC Art Production Contract

Use this reference for formal NPC world art, portraits, runtime installation or visual approval.

## Contents

1. Completion states
2. Archetype and instance boundary
3. Identity and canary gate
4. Static and mobile matrices
5. Direction semantics
6. Portrait contract
7. Image-generation and chroma provenance
8. Godot installation and performance
9. Evidence and approval

## Completion states

| State | Meaning |
| --- | --- |
| `planned` | Role, reuse boundary and required matrix are specified. |
| `in_production` | Some generated or processed art exists; no completeness claim. |
| `owner_review_pending` | Deterministic audits and real-client evidence pass; owner has not accepted the look. |
| `approved` | Deterministic, runtime, blind-direction and explicit owner-review gates pass. |

Never infer `approved` from a successful generator, complete frame count, contact sheet, hash audit or agent self-review. A rejection sends the affected archetype or expression back to `in_production`.

## Archetype and instance boundary

An occupational archetype is a reusable visual subject. A named NPC is a gameplay/data instance.

Shared by `appearanceId`:

- body, face, costume, props, palette and sex presentation;
- eight-direction world frames and portrait expressions;
- canvas size, scale, baseline, interaction/label anchors and import settings.

Unique by `npcId`:

- displayed name, map, position, default facing and schedule;
- dialogue, shop/service target, quest/event links and permissions;
- collision and interaction configuration.

All villages should point their same-role instances to the same `appearanceId`. Create a separate appearance only when players must read a genuinely different occupation, rank, faction, age group or approved regional variant. A new name or village alone does not qualify.

Recommended stable ID shape:

```text
npc_<role>_<presentation>_v<major>
```

Examples are structural only: `npc_stable_keeper_m_v1`, `npc_bank_keeper_f_v1`. Do not encode village or individual name in a shared archetype ID. Never change the pixels behind an approved ID incompatibly; issue a new major version.

## Identity and canary gate

Write an identity lock before bulk generation:

- player-readable occupation and service;
- silhouette and signature prop readable at actual 1280x720 game scale;
- age and sex presentation without stereotypes that make roles interchangeable;
- face, hair, clothing layers, palette, materials and asymmetry;
- body proportions, hand/foot count, prop hand and near/far limb rules;
- canvas size, scale against the protagonist, baseline and shadow policy;
- forbidden drift, forbidden props and known generation risks.

Generate one lossless identity board with `image_gen`. It must show neutral portrait, full-body front/back, signature prop and a target-scale comparison. Treat it as a reference, not a runtime sprite sheet.

Canary gates, in order:

1. Owner accepts identity board and occupational readability.
2. Cardinal `south`, `west`, `north`, `east` idle poses retain identity and scale.
3. All eight idle directions pass a blind label assignment. The reviewer sees shuffled images without filenames, arrows or requested answers.
4. A mobile actor's single-direction four-frame walk shows a real gait with stable ground contact.
5. Full required matrix, portraits, runtime evidence and performance checks pass.
6. Owner accepts representative runtime screenshot/video before another archetype is normally expanded. A specifically named batch that the owner pre-authorized in the current task may continue only as release-disabled review candidates after the canary is shown; this exception never counts as visual acceptance and leaves the whole expanded batch open to rework.

Do not use a generated sheet's printed compass, prompt label or file name as proof. Freeze reviewed file paths and decoded-RGBA hashes in the direction approval record.

## Static and mobile matrices

Canonical direction order:

| Index | ID | Screen/travel vector |
| ---: | --- | --- |
| 1 | `south` | down |
| 2 | `southwest` | down-left |
| 3 | `west` | left |
| 4 | `northwest` | up-left |
| 5 | `north` | up |
| 6 | `northeast` | up-right |
| 7 | `east` | right |
| 8 | `southeast` | down-right |

Required frames:

| Mobility | Per direction | Total world frames | Required portraits |
| --- | --- | ---: | --- |
| `static` | `idle-1` | 8 | `neutral`, `speaking`, `smile`, `concerned` |
| `mobile` | `idle-1`, `walk-1..4` | 40 | `neutral`, `speaking`, `smile`, `concerned` |

Static NPCs still need all eight idle views so placement changes do not trigger runtime mirroring or neighboring-direction substitutions. Do not spend four-frame walk production on a service NPC that cannot move. If it later gains movement, upgrade the same identity through a separately reviewed mobile bundle version.

Optional `gesture-*`, `work-*` or additional portrait expressions follow the required matrix. They never replace an idle or walk requirement.

## Direction semantics

Every direction must be independently authored. The following all violate true-eight production:

- duplicated decoded pixels under different filenames;
- horizontal or vertical mirror equality;
- Godot `flip_h`, negative node scale or UV/shader reversal;
- offline canvas transforms of an opposite direction;
- one diagonal relabeled as a neighboring diagonal;
- a correct idle paired with walk frames on another axis.

Review `idle-1` beside the complete walk row. Check face/chest/back exposure, prop hand, feet, near/far limbs and travel axis across all frames. North is back-facing and vertically up; northwest exposes the appropriate side while traveling up-left; northeast exposes the opposite side while traveling up-right. Apply the analogous distinction to south and its diagonals.

The exact-mirror hash audit is a deterministic rejection check, not semantic proof. Non-identical pixels can still face the wrong way; blind visual review remains mandatory.

## Portrait contract

- `neutral` is the default dialogue bust.
- `speaking` must be the same identity, costume, crop, lighting and camera with a readable speaking expression.
- `smile` and `concerned` must preserve that same identity and crop; they are expression states, not new character generations.
- Keep portrait background transparent unless a separate UI frame owns the backdrop.
- Store portrait paths behind the `appearanceId` catalog. Dialogue data may request `portraitState`; it may not name files.
- Fall back intentionally from an unavailable optional expression to `neutral`. Never fall back to another occupation or individual.
- Do not generate a unique portrait for every named instance that shares an archetype.

## Image-generation and chroma provenance

Use `image_gen` for the authored identity board and source art. Preserve:

- exact prompt and negative constraints;
- tool/model identifier and settings exposed by the tool;
- generation timestamp and lossless raw output;
- requested background and source mode for each sheet, plus measured raw corner/background samples for opaque chroma sources;
- every processing operation in deterministic order.

The builder accepts two real source contracts, selected independently for world and portrait sheets with `--world-source-mode` and `--portrait-source-mode`:

- `opaque-chroma`: the entire raw sheet is alpha 255. The generation ledger source entry declares `sourceMode=opaque-chroma` and `requestedBackground=#FF00FF`.
- `genuine-transparent`: the raw sheet contains both alpha-zero background and alpha-positive subject pixels. The source entry must explicitly declare `sourceMode=genuine-transparent` and `requestedBackground=transparent`.

`auto` only resolves one of those two from the frozen alpha distribution; it does not weaken either contract. A fully transparent sheet, a partial-alpha-only sheet with no alpha-zero background, or a non-opaque chroma sheet fails. The generation ledger top-level `requestedBackground` is `#FF00FF`, `transparent`, or `mixed` according to its two declared sheet modes.

For a genuine-transparent source, preserve every source pixel with alpha greater than zero byte-for-byte. Only RGB hidden under source alpha zero may be canonicalized to zero. Required-safe edges must be fully transparent. The visible subject may contain 1 through 8 alpha-positive 8-connected components, but every component must contain at least 8 pixels; tiny islands and a ninth component fail closed. A genuine-transparent sheet never accepts an explicit chroma review mask.

Image generation does not guarantee that a requested `#FF00FF` backdrop will decode as exact `#FF00FF`. Never pre-clean or silently rewrite the raw input to make that claim true. Opaque-background removal must derive an eligibility mask from the same untouched raw frame and deterministic classifier. Store it as a lossless per-pixel artifact with matching dimensions. Record measured samples, estimator thresholds, connectivity, mask hash and selected-pixel count.

For an opaque generated sheet, `recorded_border_connected_chroma_v1` creates the automatic border core. Any RGB/alpha repair must remain inside the final reviewed eligibility domain. The v3.1 classifier exposes four exact whole-component types outside the automatic core:

- `enclosed-chroma`: keyed candidate disconnected from the border core; decision is `background-hole` or `retain-subject`.
- `adjacent-chroma-fringe`: soft-matte proposal pixels no farther than 3 four-neighbour steps from the automatic core; decision is `background-fringe` or `retain-subject`.
- `reviewed-outer-background-hole`: connected soft-matte background beyond that 3px fringe band; decision is `background-hole` or `retain-subject`. It is hard-zeroed when accepted and is never treated as soft fringe.
- `residual-key-color-candidate`: every remaining pixel changed by the frozen global soft-matte proposal after subtracting automatic, enclosed, fringe and outer scopes. Split it into exact 4-connected components with `connected-4-v1`; even a 1px component requires `repair-key-spill` or `retain-authored-color`.

Every such component requires an exact ledger decision. `repair-key-spill` authorizes the frozen proposal only on every pixel of that exact residual component; `retain-authored-color` authorizes no mask pixel and preserves its bytes. Partial selection, an unreviewed 1px component or a decision/mask contradiction fails closed. An `enclosed-chroma` component larger than 1024 pixels sets `requiresLargeComponentAttention=true`; that enclosed-hole size is a mandatory human-attention marker, not an automatic rejection. Other component types keep this field false. Never solve ambiguity by a later whole-image hue, S/D/G or color-distance deletion: those scans can match intentional hair, costume and shadow colors.

Source-edge policy is group-specific and immutable:

- World cells use `all-edges-safe-v1`: top, bottom, left and right must all be safe generated chroma. Subject or residue touching any edge fails.
- Portrait cells use `portrait-bust-crop-v1`: top plus the sheet-outer side are the only background measurement and flood-seed edges. A bust may touch the bottom and its inner 2x2 grid seam only in the lower crop zone (`y >= 65%` for the inner seam). Top, the sheet-outer side, or the inner seam above that zone still fails. This exception does not apply to world art.
- A drawn white/non-chroma divider, label, ruler or guide is not a crop boundary. A divider that contaminates a required-safe edge or the upper inner seam fails; do not retain it as subject and do not silently trim or rewrite the raw sheet.

Reviewed components may be resolved only by supplying a same-size, non-interlaced 8-bit grayscale binary sheet mask together with its authoring ledger. The explicit mask must contain every automatic border-core pixel. Beyond that subset it may select only a complete classified component with the matching background decision: a residual component is selected only for `repair-key-spill` and must be absent for `retain-authored-color`. Selecting a non-candidate pixel, omitting an automatic pixel, splitting a component, or selecting a retain decision fails. Missing, duplicate, stale or contradictory decisions fail.

The authoring ledger uses `operation=reviewed_chroma_components_v3_1`, `reviewMethod=visual-inspection`, and binds all three raw decoded hash forms, mask file/pixel hashes and dimensions. Its classifier record binds `recorded_border_connected_chroma_v1`, connectivity `4`, edge policy, `fringeMaximumFourNeighbourDistance=3`, `fringeReviewGrouping=gap-bridged-8-v1`, `residualKeyReviewGrouping=connected-4-v1`, and `largeEnclosedComponentReviewThreshold=1024`. Each component binds its type, canonical slot, exact pixel hash, cell/sheet bounding boxes, pixel count, exact `requiresLargeComponentAttention`, decision, reviewer and timezone-aware `reviewedAt`. Older review-operation values are not migrated implicitly and fail closed.

Soft-matte behavior is the project-local vectorized adaptation `imagegen-soft-matte-bounded-v1`, frozen to reference-helper SHA-256 `3f7b9b14ad5c90f37618bc1c16a039a2076abca12ddc41b3ae470e2b1cad6c0e` and parameters transparent threshold 12, opaque threshold 220, key dominance 16 and alpha noise floor 8. The reference helper is not shell-executed during production. A portable golden differential proves the full global proposal; production never applies that proposal globally. It applies only to reviewed `adjacent-chroma-fringe` pixels within the 3px four-neighbour band and residual components decided `repair-key-spill`. Accepted core, enclosed holes and outer holes are hard transparent; `retain-authored-color` remains byte-identical. Despill affects proposed alpha 1 through 251 only; alpha 252 through 255 preserves source RGB.

After source processing and again after runtime normalization, `static_detached_foreground_v1` inspects alpha >=16 with 4-connectivity. The largest alpha-qualified component is the principal subject. Every other component is described by exact pixel SHA-256, half-open bbox and pixel count; any detached component with at least 128 pixels blocks the static-NPC bundle and requires regeneration. The gate records `automaticDeletionApplied=false` and must never crop, erase or reconnect a fragment automatically. This narrow structural gate catches cross-cell shield/prop strips while tolerating sub-threshold interpolation dust; it does not replace visual direction or silhouette review.

Archive two different binary masks per frame:

- `eligibilityMaskPath`: the entire automatic plus reviewed background-eligible domain (or all source alpha-zero pixels for genuine transparency).
- `changedPixelMaskPath`: exactly those decoded source pixels whose RGBA bytes changed. This is not an eligibility alias; for a clean genuine-transparent alpha-zero region it may contain fewer pixels.

No source RGBA byte may change outside the exact changed-pixel mask. Never infer either mask later from RGB, hue, saturation, an all-true mask or visual suspicion. If a required mask is absent, corrupt, dimensionally different or bound to another raw hash, fail closed.

For each frame record:

- raw source path/hash;
- eligibility mask path/file/pixel hash and eligible-pixel count;
- exact changed-pixel mask path/file/pixel hash and changed-pixel count;
- processed transparent path and decoded-RGBA hash;
- runtime path, canonical resize settings and decoded-RGBA hash;
- prompt ID, background color, processing tool version and replacement path.

Record three hashes with their exact meanings: `*DecodedRgbaByteSha256` is SHA-256 over decoded RGBA bytes only; `*RgbaSha256` is the full `WxH:RGBA\n`-prefixed decoded stream; `*GodotCanonicalRgbaSha256` uses that prefix after zeroing RGB wherever alpha is less than 255. They are not interchangeable. Transparent runtime pixels must have alpha zero and normalized zero RGB. At least one transparent and one visible pixel must exist. Preserve intentional authored magenta/purple/green colors and all alpha-positive source pixels under the relevant source contract.

## Godot installation and performance

Install through one focused appearance catalog. Recommended lookup shape:

```text
(appearanceId, action, facing, frame) -> Texture2D
(appearanceId, portraitState) -> Texture2D
```

Map/instance data supplies `appearanceId` and `facing`. Validate both against the catalog; never infer direction from a filename substring in a hot path.

Runtime rules:

- import every PNG with one documented filtering/mipmap/compression policy appropriate to the pixel-art/2.5D presentation;
- preserve exact dimensions, alpha, crop, baseline and interaction/label anchors;
- compare installed runtime files and Godot-loaded texture output to the reviewed bundle;
- prohibit `flip_h`, negative X scale and shader mirroring for NPC direction selection;
- cache catalog parsing and textures; never call directory scans, JSON parsing, file reads, image resize or full NPC scans from `_process`, `_draw`, input or HUD signatures;
- update animation only on bounded frame ticks; update facing only when movement/placement changes;
- invalidate caches on catalog/version change, not every frame;
- keep missing-art fallback explicit, player-safe and visually distinguishable from an approved occupation without revealing QA details.

When renderer/catalog logic changes, measure idle and moving/input performance. A visual upgrade is not accepted if it creates repeated file I/O, unbounded texture growth or per-frame normalization.

Normal player UI must not expose arrows, direction names, frame counters, hashes, asset paths, import warnings, review states, prompts, audit controls or agent text. Place those in isolated QA scenes, command flags, logs or ignored evidence folders.

## Evidence and approval

Required evidence per archetype:

1. Identity board and current owner-review state; an owner decision exists only after explicit owner acceptance and is forbidden for a pending candidate.
2. Eight-direction contact sheet with every required frame in each row.
3. Original runtime PNG inspection at 1:1 or readable zoom.
4. Blind direction report from anonymous shuffled 320px wrappers, followed by private producer unblinding and frozen hashes.
5. Continuous real-Godot MP4: idle hold per direction and full walk cycle for mobile actors.
6. Real `Main.tscn` 1280x720 screenshots in context, including interaction portrait.
7. Bundle audit, Godot parse/catalog checks and performance evidence when relevant.
8. Source, prompt, provenance, ownership/license basis and durable replacement paths.

The runtime evidence is a frozen, hash-bound chain. `review.runtimeEvidenceIndex` plus its SHA-256 must bind the 12 installed frames, all three Godot parity runs and the decoded 1280x720 review video. Prepare the blind packet with `python3 tools/prepare_npc_blind_review_packet.py --run-id ... --appearance-id ... --evidence-index ... --producer-id ...`.

Review happens in two sealed stages. Stage A gives the reviewer only `<appearance>/blind/`: the reviewer packet and randomly named 320x320 anonymous PNG wrappers. Its original file has exact top-level fields `schemaVersion, resultType, status, appearanceId, reviewerId, reviewPacketSha256, frozenAtUtc, directionResults`; all eight rows contain only `presentationIndex, classifiedDirection, status, visualObservation`. They do not see portraits, Main artifacts or the private mapping. Stage B begins only after the Stage A file/hash is immutable, references that exact SHA-256 and uses the same reviewer with a strictly later timestamp. Its original top-level fields are `schemaVersion, observationType, status, appearanceId, reviewerId, stageAResultSha256, frozenAtUtc, portraitInspections, mainSceneObservations`. Portrait rows contain only `state, reviewerArtifactPath, reviewerArtifactSha256, status, visualObservation`; Main rows contain the artifact path/hash plus scene, map, NPC, appearance, visibility, status and observation fields. Direction answers and private/mapping/source-runtime/installed fields are forbidden throughout Stage B.

Record distinct non-empty `producerId` and `reviewerId`; one agent may not produce and independently approve the same presentation. Never disclose the private producer mapping, repository direction/hash index, direction-bearing installed/source paths or requested answers before both reviewer stages are frozen. Final blind-audit schema v2 must bind both original path/hash pairs and deep-copy all three reviewer arrays without rewriting any string; source/installed/file/RGBA bindings remain in a separate producer section. Create it only with `python3 tools/combine_npc_staged_review.py --action-meta ... --stage-a-result ... --stage-b-observation ... --producer-id ... --output <new path>`; the helper refuses overwrite and privately deblinds only after Stage B is frozen.

Every real `Main.tscn` screenshot must be frozen by path/hash and have a matching observation that records `mapId`, `npcId`, exact `appearanceId`, `worldVisible=true` and `portraitVisible=true`. A screenshot without those bindings, a filename-derived direction answer, an identity-order "shuffle", or an audit that merely repeats requested labels does not satisfy runtime review.

Contact sheets are indices and consistency overviews, not sufficient acceptance. A video from a fake animation player or a blank/undecodable MP4 fails. Verify metadata and decode the full recording.

Set `artStatus=owner_review_pending`, `ownerReviewStatus=pending`, `releaseApproved=false` and `runtimeEnabled=false` after automated and in-engine gates pass. The candidate pipeline must never pre-create `release-owner-decision.json` or manufacture owner approval. Only after the project owner explicitly accepts the frozen evidence may a human-created exact-key owner decision be added. Its `acceptedEvidence` must exactly equal the release attestation's ten-key `strictEvidence`: `sourceSetSha256`, `runtimeEvidenceIndexSha256`, `blindStageAResultSha256`, `blindStageBObservationSha256`, `blindAuditSha256`, `blindReviewPacketSha256`, `blindProducerMappingSha256`, `runtimeVideoSha256`, `mainCaptureReportSha256s`, `runtimeScreenshotSha256s`. Only a matching owner decision plus full 12-frame `release-attestation.json` may set approval and runtime flags true; any hash drift fails closed.
