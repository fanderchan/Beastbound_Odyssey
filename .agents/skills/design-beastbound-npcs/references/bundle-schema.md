# NPC Production Bundle Schema

Use this reference when creating or auditing an NPC archetype bundle. Paths are relative to the bundle root.

## Directory layout

```text
<bundle>/
├── npc-bundle.json
├── identity/
│   └── identity-board.png
├── source/
│   ├── prompts.json
│   ├── provenance.json
│   ├── raw/                 # lossless image_gen outputs or frame crops
│   ├── masks/               # full per-pixel background eligibility masks
│   ├── changed-masks/       # exact source-RGBA changed-pixel masks
│   ├── processed/           # source cells after bounded background processing
│   └── reviewed-masks/      # optional frozen sheet mask + authoring ledger
├── runtime/
│   ├── world/
│   │   ├── south/
│   │   │   ├── idle-1.png
│   │   │   └── walk-1.png ... walk-4.png (mobile only)
│   │   ├── southwest/
│   │   ├── west/
│   │   ├── northwest/
│   │   ├── north/
│   │   ├── northeast/
│   │   ├── east/
│   │   └── southeast/
│   └── portraits/
│       ├── neutral.png
│       ├── speaking.png
│       ├── smile.png
│       └── concerned.png
└── evidence/
    ├── contact-sheets/
    ├── blind-audit/
    ├── screenshots/
    └── videos/
```

The read-only auditor requires `npc-bundle.json`, the exact eight `runtime/world` direction folders and required runtime PNGs. It does not modify the bundle.

## Minimal manifest

```json
{
  "schemaVersion": 1,
  "archetypeId": "stable_keeper_m_v1",
  "appearanceId": "npc_stable_keeper_m_v1",
  "displayName": "兽栏管理员（男）",
  "mobility": "static",
  "directions": [
    "south", "southwest", "west", "northwest",
    "north", "northeast", "east", "southeast"
  ],
  "world": {
    "runtimeSize": [256, 256],
    "idleFrames": 1,
    "walkFrames": 0,
    "runtimeMirroring": false
  },
  "portraits": {
    "states": ["neutral", "speaking", "smile", "concerned"],
    "runtimeSize": [512, 512]
  },
  "generation": {
    "tool": "image_gen",
    "requestedBackground": "#FF00FF",
    "sourceModes": {
      "world": "opaque-chroma",
      "portrait": "opaque-chroma"
    },
    "backgroundOperations": {
      "opaqueChroma": "recorded_border_connected_chroma_v1",
      "genuineTransparent": "genuine_transparent_alpha_preservation_v1",
      "reviewedComponents": "reviewed_chroma_components_v3_1"
    },
    "promptLedger": "source/prompts.json",
    "provenanceLedger": "source/provenance.json",
    "pipelineMetadata": "pipeline-meta.json",
    "qcSummary": "evidence/qc/qc-summary.json"
  },
  "ownership": {
    "origin": "AI-generated original",
    "owner": "Beastbound Odyssey project",
    "licenseBasis": "project-owned generated output",
    "replacementPath": "/absolute/durable/source/archive/path"
  },
  "review": {
    "artStatus": "in_production",
    "ownerReviewStatus": "pending",
    "contactSheet": "evidence/contact-sheets/contact-sheet-transparent.png",
    "blindDirectionAudit": "required",
    "automaticDirectionApproval": false
  },
  "release": {
    "runtimeEnabled": false,
    "releaseApproved": false
  }
}
```

For `mobility: "mobile"`, set `world.walkFrames` to `4` and provide `walk-1.png` through `walk-4.png` in every direction. For `static`, set it to `0`; optional gestures are outside this minimum audit schema.

The deterministic builder always emits `in_production`, `ownerReviewStatus=pending`, `releaseApproved=false` and `runtimeEnabled=false`. Promotion records are authored later; the builder must never manufacture approval. `review.artStatus` may eventually become `owner_review_pending` or `approved`, but `approved` is valid only after the exact owner decision and runtime release attestation described below.

## Prompt ledger

`source/prompts.json` should be a JSON object with `schemaVersion` and `prompts`. Each prompt entry should record a stable ID, exact prompt text, negative constraints, tool/model details when available, parameters and generation timestamp. Do not reconstruct prompts from memory after generation.

## Provenance ledger

`source/provenance.json` should contain one entry per independently authored output/frame. Recommended fields:

```json
{
  "schemaVersion": 1,
  "frames": [
    {
      "runtimePath": "runtime/world/south/idle-1.png",
      "promptId": "stable-identity-south-idle-v1",
      "sourceMode": "opaque-chroma",
      "rawPath": "source/raw/cells/world/south-idle-1.png",
      "rawFileSha256": "...",
      "rawDecodedRgbaByteSha256": "...",
      "rawGodotCanonicalRgbaSha256": "...",
      "rawRgbaSha256": "...",
      "eligibilityMaskPath": "source/masks/world/south/idle-1.png",
      "maskFileSha256": "...",
      "maskPixelSha256": "...",
      "maskWidth": 512,
      "maskHeight": 512,
      "eligiblePixelCount": 12345,
      "changedPixelMaskPath": "source/changed-masks/world/south/idle-1.png",
      "changedPixelMaskFileSha256": "...",
      "changedPixelMaskSha256": "...",
      "changedPixelCount": 12340,
      "classifierResidualKeyColorCandidatePixels": 2,
      "classifierResidualKeyColorComponentCount": 1,
      "classifierResidualKeyColorReviewGrouping": "connected-4-v1",
      "classifierResidualKeyColorMaskPixelSha256": "...",
      "processedPath": "source/processed/world/south/idle-1.png",
      "processedDecodedRgbaByteSha256": "...",
      "processedGodotCanonicalRgbaSha256": "...",
      "processedRgbaSha256": "...",
      "runtimeDecodedRgbaByteSha256": "...",
      "runtimeGodotCanonicalRgbaSha256": "...",
      "runtimeRgbaSha256": "...",
      "processedDetachedForegroundGate": {
        "operation": "static_detached_foreground_v1",
        "stage": "processed-cell",
        "connectivity": 4,
        "alphaThresholdInclusive": 16,
        "minimumBlockingDetachedPixelCount": 128,
        "blockingComponents": [],
        "automaticDeletionApplied": false
      },
      "runtimeDetachedForegroundGate": {
        "operation": "static_detached_foreground_v1",
        "stage": "runtime",
        "connectivity": 4,
        "alphaThresholdInclusive": 16,
        "minimumBlockingDetachedPixelCount": 128,
        "blockingComponents": [],
        "automaticDeletionApplied": false
      },
      "requestedBackground": "#FF00FF",
      "measuredBackgroundSamples": [[247, 2, 245], [246, 3, 245]],
      "eligibilityOperation": "recorded_border_connected_chroma_v1",
      "operations": [
        "exact chroma eligibility mask",
        "mask-bounded despill",
        "canonical premultiplied-alpha resize"
      ]
    }
  ]
}
```

The eligibility and changed masks are intentionally different domains. Eligibility records every pixel authorized as background. The changed mask must equal the bytewise decoded-RGBA difference between `rawPath` and `processedPath`, pixel for pixel; no source RGBA change is allowed outside it. For `genuine-transparent`, eligibility is exactly source alpha zero, while changed pixels are only alpha-zero pixels whose hidden RGB required canonicalization. For opaque chroma, the residual candidate mask is the exact global-proposal-changed set minus automatic, enclosed, fringe and outer scopes; its hash/count/grouping are replay inputs, not permission to mutate it.

Hash suffixes are normative:

- `DecodedRgbaByteSha256`: decoded RGBA bytes only;
- `RgbaSha256`: `WxH:RGBA\n` prefix followed by all decoded RGBA bytes;
- `GodotCanonicalRgbaSha256`: the same prefixed stream after zeroing RGB wherever alpha is below 255.

Do not compare or substitute one hash domain for another.

If full raw and mask artifacts are stored in a durable external production archive, keep their absolute replacement path and immutable hashes in the tracked ledger. Do not claim provenance validation unless the complete source archive was actually checked before installation.

## Source mode and explicit reviewed-component mask

Choose each sheet mode explicitly when possible:

```sh
python3 tools/build_npc_art_bundle.py \
  ... \
  --world-source-mode opaque-chroma \
  --portrait-source-mode genuine-transparent
```

For `genuine-transparent`, the generation-ledger source entry must declare `sourceMode=genuine-transparent` and `requestedBackground=transparent`; no explicit review mask is accepted. For `opaque-chroma`, the sheet must be fully opaque and its source entry declares `sourceMode=opaque-chroma` and `requestedBackground=#FF00FF`.

If the opaque classifier finds any reviewed component, the build remains closed unless both group inputs are supplied:

```sh
python3 tools/build_npc_art_bundle.py \
  ... \
  --world-explicit-mask /absolute/path/world-sheet-mask.png \
  --world-mask-authoring-ledger /absolute/path/world-mask-authoring-ledger.json
```

Use `--portrait-explicit-mask` and `--portrait-mask-authoring-ledger` for portraits. A mask without its paired ledger, or a ledger without its mask, is invalid.

The sheet mask must be a non-interlaced, native 8-bit grayscale PNG containing only `0` and `255`, with the exact raw-sheet dimensions. `255` means eligible background. It must include the full automatic border-connected core and may add only complete classifier components whose exact ledger decision is the matching background decision.

Minimal authoring ledger shape:

```json
{
  "schemaVersion": 1,
  "operation": "reviewed_chroma_components_v3_1",
  "group": "world",
  "reviewMethod": "visual-inspection",
  "source": {
    "rawSheetFileSha256": "...",
    "rawSheetDecodedRgbaByteSha256": "...",
    "rawSheetGodotCanonicalRgbaSha256": "...",
    "rawSheetDecodedRgbaSha256": "...",
    "explicitMaskFileSha256": "...",
    "explicitMaskPixelSha256": "...",
    "width": 1254,
    "height": 1254
  },
  "classifier": {
    "operation": "recorded_border_connected_chroma_v1",
    "connectivity": 4,
    "edgePolicy": "all-edges-safe-v1",
    "fringeMaximumFourNeighbourDistance": 3,
    "fringeReviewGrouping": "gap-bridged-8-v1",
    "residualKeyReviewGrouping": "connected-4-v1",
    "largeEnclosedComponentReviewThreshold": 1024
  },
  "components": [
    {
      "slot": "south",
      "componentType": "enclosed-chroma",
      "componentPixelSha256": "...",
      "cellBbox": [10, 20, 30, 40],
      "sheetBbox": [10, 20, 30, 40],
      "pixelCount": 123,
      "requiresLargeComponentAttention": false,
      "decision": "background-hole",
      "reviewer": "reviewer identity",
      "reviewedAt": "2026-07-21T15:30:00+08:00"
    }
  ]
}
```

For portrait ledgers use `group=portrait` and `edgePolicy=portrait-bust-crop-v1`. Exact component types and decisions are:

| `componentType` | Background decision | Alternative |
| --- | --- | --- |
| `enclosed-chroma` | `background-hole` | `retain-subject` |
| `adjacent-chroma-fringe` | `background-fringe` | `retain-subject` |
| `reviewed-outer-background-hole` | `background-hole` | `retain-subject` |
| `residual-key-color-candidate` | `repair-key-spill` | `retain-authored-color` |

An accepted `adjacent-chroma-fringe` component receives soft matte/despill, and every one of its pixels must be within 3 four-neighbour steps of the automatic core. A `residual-key-color-candidate` is every remaining global-proposal-changed pixel, split with `connected-4-v1`; there is no size exemption, so a 1px component needs a full descriptor and reviewer decision. `repair-key-spill` selects the complete component and applies the exact frozen proposal; `retain-authored-color` selects none of it and preserves its bytes. `reviewed-outer-background-hole` is a manually reviewed hard-zero hole beyond the fringe band. An enclosed component over 1024 pixels is allowed only with its exact descriptor field `requiresLargeComponentAttention=true`; changing that flag is a stale/tampered descriptor.

Each opaque provenance frame binds `classifierResidualKeyColorCandidatePixels`, `classifierResidualKeyColorComponentCount`, `classifierResidualKeyColorReviewGrouping` and `classifierResidualKeyColorMaskPixelSha256`. Its `maskReview` binds the exact reviewed component descriptors plus `reviewedResidualKeySpillPixelCount` and `reviewedRetainedAuthoredColorPixelCount`; source processing binds `softMatteResidualKeyRepairPixelCount` and `unreviewedResidualKeyColorCandidatePixels=0`. The pipeline-level `sourceProcessing.residualKeyColorCandidates` repeats the component type, grouping, subtraction definition, minimum pixel count, both decisions and `unreviewedBehavior=fail_closed`. These are auditor replay fields, not optional commentary.

The soft proposal is the project-local vectorized `imagegen-soft-matte-bounded-v1` adaptation frozen to reference-helper SHA-256 `3f7b9b14ad5c90f37618bc1c16a039a2076abca12ddc41b3ae470e2b1cad6c0e` and thresholds 12/220, dominance 16, noise floor 8. A portable golden fixture validates the full proposal; production applies it only inside reviewed fringe and `repair-key-spill` masks and never shell-executes the reference helper. `globalProposalApplied` remains false. A hue or S/D/G diagnostic can match real costume/hair shadows and is never an automatic deletion mask.

Non-candidate additions, partial components, omitted automatic pixels, unreviewed components (including 1px residuals), decision/mask contradictions, old review-operation values, stale descriptors and any raw/mask/hash/size mismatch fail. The immutable bundle archives the sheet mask, authoring ledger, per-cell eligibility masks, residual classifier hash/count metadata and per-cell exact changed masks for self-contained replay.

## Static detached-foreground gate

`static_detached_foreground_v1` runs on every processed cell and every normalized runtime frame. It forms exact 4-connected components from alpha >=16, treats the largest as the principal subject and records every descriptor as `componentPixelSha256`, half-open `bbox` and `pixelCount`. Any other component with at least 128 pixels is blocking; the bundle must regenerate from clean source. Reports must bind `operation`, `stage`, connectivity, both thresholds, principal/detached summaries, `blockingComponents` and `automaticDeletionApplied=false`. Never delete, crop or reconnect a fragment to satisfy this gate.

## Runtime instance contract

The repository's focused NPC instance/catalog implementation may use different JSON filenames, but it must preserve these semantics:

```json
{
  "npcId": "firebud_stable_keeper",
  "appearanceId": "npc_stable_keeper_m_v1",
  "facing": "southwest",
  "portraitState": "neutral"
}
```

- `npcId` remains the unique gameplay instance.
- `appearanceId` resolves a shared visual archetype.
- `facing` is one of the eight canonical authored directions.
- `portraitState` is optional and defaults to `neutral`.
- Dialogue/service/map data must not contain asset paths.

## Runtime and blind-review evidence

Promotion from `in_production` to `owner_review_pending` requires the strict evidence documents validated by `NpcArtReleaseEvidence`, not only a contact sheet or agent assertion:

- `review.runtimeEvidenceIndex` is an absolute frozen evidence-index path and `review.runtimeEvidenceIndexSha256` binds its bytes. The index binds the 12-frame source set, three Godot parity reports, a decodable 1280x720/30fps review video and its hash.
- `review.blindAudit` and `review.blindAuditSha256` bind a passing blind audit. The audit binds the current appearance, evidence-index hash, runtime-video hash, Main scene, screenshot hashes and all eight canonical directions.
- `review.blindStageAResult` / `blindStageAResultSha256` and `review.blindStageBObservation` / `blindStageBObservationSha256` bind the current bytes of two distinct original reviewer files. Both pairs are mandatory in strict catalog validation and remain direct members of the later ten-key owner evidence summary.
- The producer creates the anonymous packet with:

```sh
python3 tools/prepare_npc_blind_review_packet.py \
  --run-id <runId> \
  --appearance-id <appearanceId> \
  --evidence-index /absolute/path/evidence-index.json \
  --producer-id <producerId>
```

- Stage A gives the independent reviewer only `<appearance>/blind/`: the reviewer packet and its randomly named 320x320 anonymous PNG wrappers. Its exact top-level fields are `schemaVersion, resultType, status, appearanceId, reviewerId, reviewPacketSha256, frozenAtUtc, directionResults`; the eight rows contain only `presentationIndex, classifiedDirection, status, visualObservation`. The reviewer does not see portraits, Main artifacts or private mapping. Never provide `<appearance>/private/producer-mapping.json`, the repository direction/hash index, direction-bearing installed/source paths or requested answers.
- Stage B begins only after the Stage A result file/hash is immutable, references that exact Stage A SHA-256, uses the same reviewer and a strictly later `frozenAtUtc`. Its exact top-level fields are `schemaVersion, observationType, status, appearanceId, reviewerId, stageAResultSha256, frozenAtUtc, portraitInspections, mainSceneObservations`. Portrait rows contain only `state, reviewerArtifactPath, reviewerArtifactSha256, status, visualObservation`; Main rows contain `reviewerArtifactPath, reviewerArtifactSha256, scene, mapId, npcId, appearanceId, worldVisible, portraitVisible, status, visualObservation`. No Stage B key, artifact label or observation may reveal a direction answer, private mapping, source-runtime path or installed binding.
- `producerId` and `reviewerId` are both non-empty and different. Only after both reviewer files are frozen may the producer privately unblind and create final audit schema v2. It directly binds both original path/hash pairs; `directionResults`, `portraitInspections` and `mainSceneObservations` must deep-equal the originals without any rewritten string. Current source/installed/file/RGBA values live only in separate `portraitBindings` and the private producer mapping. A filename-order, identity-order, reversed Stage A/B order or answer-bearing review is invalid.
- Every final `portraitInspections` array contains exactly `neutral`, `speaking`, `smile` and `concerned`; `portraitBindings` separately bind each reviewer artifact to the current installed/source frame hashes. Every `review.runtimeScreenshots` entry has a corresponding hash and one unchanged Stage B Main observation bound to its real Main capture report.

Create the producer-only merge through the fail-closed helper; it refuses overwrite and prints the `review.blindAudit` path/hash binding:

```sh
python3 tools/combine_npc_staged_review.py \
  --action-meta /absolute/path/to/action-bundle-meta.json \
  --stage-a-result /absolute/path/to/stage-a-result.json \
  --stage-b-observation /absolute/path/to/stage-b-observation.json \
  --producer-id <producerId> \
  --output /absolute/new/path/to/blind-audit.json
```

Passing runtime and blind evidence moves the appearance only to `owner_review_pending`; release flags remain false. The candidate pipeline must not create a placeholder, proxy-signed or self-approved owner record. After the project owner explicitly accepts the exact frozen evidence, create `client/godot/assets/npcs/<appearanceId>/release-owner-decision.json` with exact top-level keys:

```text
schemaVersion, decisionType, appearanceId, decision, ownerReviewStatus,
ownerId, releaseApproved, runtimeEnabled, approvedAtUtc, sourceSetSha256,
runtimeEvidenceIndexSha256, acceptedEvidence
```

`decisionType` is `beastbound_npc_owner_release_decision`; the approved record uses `decision=approved`, `ownerReviewStatus=approved`, both booleans true, a non-empty real owner identity and UTC timestamp. `acceptedEvidence` must match the later attestation's `strictEvidence` item by item and with exactly these ten keys—no extra or missing key: `sourceSetSha256`, `runtimeEvidenceIndexSha256`, `blindStageAResultSha256`, `blindStageBObservationSha256`, `blindAuditSha256`, `blindReviewPacketSha256`, `blindProducerMappingSha256`, `runtimeVideoSha256`, `mainCaptureReportSha256s`, and `runtimeScreenshotSha256s`.

Then create the hash-bound `release-attestation.json` covering that owner-decision file, the identical strict-evidence object and all 12 currently installed frames. Only that exact chain may set catalog `status=approved`, `ownerReviewStatus=approved`, `releaseApproved=true` and `runtimeEnabled=true`. Any source, evidence, decision, attestation or installed-file hash drift fails closed.

The production bundle layout above is an immutable source/review archive. Beastbound's tracked runtime installation uses the catalog-declared paths below; installed PNG bytes must match their corresponding production-bundle runtime PNG bytes:

```text
client/godot/assets/npcs/<appearanceId>/world/directions/<direction>/idle/idle-1.png
client/godot/assets/npcs/<appearanceId>/portrait/<state>.png
```

Record the production-to-install path mapping and both file hashes in the archetype ledger. Do not point the normal player runtime at evidence or source directories.

## Read-only audit

Run:

```sh
python3 .agents/skills/design-beastbound-npcs/scripts/audit_npc_bundle.py /absolute/path/to/bundle
```

The audit checks:

- manifest JSON and the fields required by this schema;
- source-mode declarations and frozen background-operation identifiers;
- raw, processed, runtime, eligibility-mask and exact changed-mask file/pixel/hash bindings;
- exact `changed mask == decoded raw/processed RGBA difference` and no out-of-mask source mutation;
- opaque v3.1 component replay, 1px residual review floor, exact repair/retain decisions, 3px fringe limit, large-component attention markers and soft-matte metadata;
- processed/runtime `static_detached_foreground_v1` replay with exact descriptors, 128px blocking threshold and no automatic deletion;
- genuine-transparent alpha-positive preservation and alpha-zero RGB canonicalization;
- exact eight direction directories;
- static/mobile frame counts and filenames;
- portrait states and dimensions;
- PNG decode, expected dimensions and real transparency;
- zero RGB in fully transparent runtime pixels;
- decoded-RGBA duplicates across directions;
- exact horizontal-mirror equality for opposite horizontal/diagonal pairs.

An audit pass proves structural completeness and rejects exact mirrored/duplicate pixels. It cannot infer whether a non-identical silhouette semantically faces north, northeast or northwest. Keep blind visual direction review mandatory.

Run the script's isolated temporary-fixture self-test after changing it:

```sh
python3 .agents/skills/design-beastbound-npcs/scripts/audit_npc_bundle.py --self-test
```
