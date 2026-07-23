# Beastbound Map Visual Bundle Schema

Use this contract for every generated or hand-authored town, wilderness, dungeon,
or interior visual style. The bundle is a visual layer only: authoritative map
IDs, walkability, exits, encounters, NPCs, quests, and server state stay in their
existing gameplay data. All paths below are relative to the bundle root.

## Recommended layout

```text
<bundle>/
├── map-visual-bundle.json
├── source/
│   ├── .gdignore
│   ├── prompts/
│   │   ├── ground-atlas.md
│   │   └── objects.md
│   ├── tools/<vendored-build-helper>.py
│   ├── raw/<lossless-generation-source>.png
│   ├── processed/<hash-frozen-build-intermediate>.png
│   └── provenance.json
├── runtime/
│   ├── ground/atlas.png
│   └── objects/<one-transparent-png-per-object>.png
├── bindings/<map-id>.json
└── evidence/
    ├── .gdignore
    ├── dressed-reference.png
    ├── layered-preview.png
    ├── runtime-screenshots/
    ├── catalog-contract-check.json
    ├── computer-use.json
    ├── computer-use-actions/<one-unique-receipt-per-action>.jsonl
    ├── collision-audit.json
    ├── collision-runner-receipt.jsonl
    ├── performance.json
    ├── performance-runner-receipt.jsonl
    └── owner-acceptance.json
```

The manifest, runtime asset, binding and evidence contracts are required; the
exact subdirectory names shown above are recommended rather than semantic.
`source/generated/` is an allowed stable alternative to `source/raw/`, and
runtime screenshots may live directly under `evidence/` when their manifest
paths remain unique and hash-frozen. Put `.gdignore` in production-only
`source/` and `evidence/` directories so raw generations and review captures do
not enter Godot import/export; Python audit still reads them from the filesystem.

The bundle must not contain baked players, pets, NPCs, quest markers, labels, or
other live actors. Runtime and offline mirroring are both forbidden. A map may
reuse an approved style bundle, but each `mapId` must have an explicit binding.

## File reference types

Every referenced file must stay inside the bundle root and use a lowercase
SHA-256 digest of the exact file bytes.

```json
{
  "path": "source/prompts/ground-atlas.md",
  "sha256": "64 lowercase hex characters"
}
```

PNG references additionally freeze dimensions and alpha behavior:

```json
{
  "path": "runtime/ground/atlas.png",
  "sha256": "64 lowercase hex characters",
  "dimensions": [640, 320],
  "alphaMode": "mixed"
}
```

`alphaMode` is `opaque` when all decoded pixels have alpha 255. It is `mixed`
when the image has both visible pixels and at least one non-opaque pixel. Ground
diamonds and every independent object normally use `mixed`; normal screenshots
normally use `opaque`.

## Manifest

`map-visual-bundle.json` uses this shape:

```json
{
  "schemaVersion": 1,
  "bundleId": "firebud_region_visual_v1",
  "mapStyleId": "firebud_warm_stone_v1",
  "mapIds": ["firebud_training_yard", "firebud_village_gate"],
  "status": "owner_review_pending",
  "ownerReviewStatus": "pending",
  "releaseApproved": false,
  "runtimeEnabled": false,
  "tileSize": [80, 40],
  "catalogContractCheck": {
    "path": "evidence/catalog-contract-check.json",
    "sha256": "..."
  },
  "source": {
    "origin": "AI-generated original",
    "owner": "Beastbound Odyssey project",
    "licenseBasis": "project-owned generated output",
    "mirrored": false,
    "bakedActors": false,
    "rawFiles": [
      {
        "path": "source/raw/ground-atlas-original.png",
        "sha256": "...",
        "dimensions": [1254, 1254]
      }
    ],
    "buildArtifacts": [
      {
        "path": "source/processed/ground-atlas-alpha.png",
        "sha256": "...",
        "dimensions": [1254, 1254]
      }
    ],
    "promptFiles": [
      {
        "path": "source/prompts/ground-atlas.md",
        "sha256": "..."
      },
      {
        "path": "source/prompts/objects.md",
        "sha256": "..."
      }
    ],
    "provenance": {
      "path": "source/provenance.json",
      "sha256": "..."
    }
  },
  "groundAtlas": {
    "path": "runtime/ground/atlas.png",
    "sha256": "...",
    "dimensions": [640, 320],
    "alphaMode": "mixed"
  },
  "tiles": [
    {
      "tileId": "warm_grass_a",
      "rect": [0, 0, 80, 40],
      "role": "ground"
    }
  ],
  "objects": [
    {
      "objectId": "firebud_fence_short_a",
      "asset": {
        "path": "runtime/objects/firebud_fence_short_a.png",
        "sha256": "...",
        "dimensions": [160, 160],
        "alphaMode": "mixed"
      },
      "displaySize": [160, 160],
      "renderLayer": "world",
      "collisionRole": "blocking",
      "scale": [1.0, 1.0],
      "anchor": [0.5, 0.875],
      "sortPoint": [0.5, 0.875],
      "sort": {
        "mode": "y",
        "offset": 0
      },
      "collision": {
        "mode": "polygon",
        "points": [[38, 126], [122, 126], [105, 148], [55, 148]]
      }
    }
  ],
  "mapBindings": [
    {
      "mapId": "firebud_village_gate",
      "binding": {
        "path": "bindings/firebud_village_gate.json",
        "sha256": "..."
      }
    },
    {
      "mapId": "firebud_training_yard",
      "binding": {
        "path": "bindings/firebud_training_yard.json",
        "sha256": "..."
      }
    }
  ],
  "evidence": {
    "dressedReference": {
      "path": "evidence/dressed-reference.png",
      "sha256": "...",
      "dimensions": [1536, 1024],
      "alphaMode": "opaque"
    },
    "layeredPreview": {
      "path": "evidence/layered-preview.png",
      "sha256": "...",
      "dimensions": [1280, 720],
      "alphaMode": "opaque"
    },
    "runtimeScreenshots": [],
    "computerUseReport": null,
    "collisionAudit": null,
    "performanceReport": null,
    "ownerAcceptance": null
  }
}
```

IDs use lowercase ASCII letters, digits, `_`, and `-`. `mapIds`, tiles, objects,
and bindings must be non-empty and unique. `tileSize` is fixed at `[80, 40]` for
the current Beastbound isometric projection. Each tile rectangle must be exactly
80x40 and remain inside the declared atlas dimensions.

Allowed lifecycle values are:

- `status`: `in_production`, `owner_review_pending`, `approved`, `released`, or
  `rejected`.
- `ownerReviewStatus`: `pending`, `approved`, or `rejected`.

The approval and release gates fail closed:

- when `ownerReviewStatus` is not `approved`, both release flags must be false;
- `approved` requires complete frozen evidence and `ownerAcceptance`, while both
  release flags remain false;
- only `released` may set either release flag, and it requires both flags true;
- `approved` and `released` require an approved owner acceptance record tied to
  the exact complete review-subject hashes;
- builders and generation jobs must initially emit pending review with both
  release flags false. They must never manufacture owner approval.

`owner_review_pending` is allowed to have partial evidence and may receive a
structural auditor `status: "PASS"`, but it is still expected to report
`releaseReady: false`. `approved` freezes completed owner acceptance while
`releaseApproved` and `runtimeEnabled` remain false. `released` is the only
normal-player state and requires both flags true. Because `source/` and
`evidence/` are excluded from Godot import/export, runtime lifecycle fields are
not an evidence verifier: every lifecycle candidate and every export must be
checked by the offline auditor, and the pre-export job must require all three of
`status == "PASS"`, `releaseReady == true`, and `missingReleaseGates == []`.
Checking only process exit status is insufficient.

## Tiles and independent objects

`tiles` address exact 80x40 cells in the atlas. Tile art may include transparent
diamond corners, but it may not include live actors or tall props that require
Y sorting.

Each `objects` entry owns a different transparent PNG path. Do not bake multiple
runtime objects into one object image or reuse an atlas crop as a purported
independent prop. Every object declares all of these runtime fields:

- `displaySize`: positive intended display width and height in pixels;
- `renderLayer`: `ground_decal`, `world`, or `foreground`;
- `collisionRole`: `none`, `decorative`, `blocking`, or `interaction`;
- `scale`: two positive finite values; negative scale is forbidden because it
  would mirror the asset;
- `anchor` and `sortPoint`: normalized `[x, y]` in the inclusive 0..1 range;
- `sort.mode: "y"` and an integer pixel `sort.offset`.

Collision must be declared even for decorative objects:

- `{"mode": "none", "points": []}` for non-blocking decoration;
- `{"mode": "polygon", "points": [...]}` for a blocking footprint, using at
  least three local image-space points inside the PNG dimensions.

`collisionRole=blocking` requires polygon collision. `none` and `decorative`
require `collision.mode=none`. The binding still records the actual occupied
map cells; neither declaration changes authoritative gameplay blockers alone.

At placement time, `objectId` resolves this collision role. A `blocking` object
must have a non-empty, valid `collisionFootprint`; `none` and `decorative` must
have an empty footprint. An `interaction` footprint may be empty or populated,
but the Godot authority check decides whether it matches gameplay interaction
and blocked-cell data.

Collision is a visual footprint hint, not authority to change gameplay
walkability by itself.

## Binding JSON

Each binding reference must parse as JSON and contain the same `schemaVersion`,
`bundleId`, and `mapId` as the manifest entry:

```json
{
  "schemaVersion": 1,
  "bundleId": "firebud_region_visual_v1",
  "mapId": "firebud_village_gate",
  "mapGridSize": [48, 36],
  "ground": {
    "defaultTileId": "warm_grass_a",
    "overrides": [
      {"grid": [12, 8], "tileId": "warm_path_a"}
    ]
  },
  "objectPlacements": [
    {
      "instanceId": "south_gate_fence_01",
      "objectId": "firebud_fence_short_a",
      "grid": [12, 9],
      "offset": [0, 0],
      "mirrored": false,
      "interactionLink": null,
      "collisionFootprint": [[12, 9], [13, 9]]
    }
  ]
}
```

`ground.defaultTileId`, `ground.overrides`, and `objectPlacements` are required;
the two arrays may be empty. Every override and placement `grid` is a
non-negative integer pair. Every placement has a unique stable `instanceId`, a
finite numeric two-value `offset`, explicit `mirrored: false`, an
`interactionLink` that is either `null` or a stable ID, and a
`collisionFootprint` array of non-negative integer map cells. When optional
`mapGridSize` is present it is a positive integer `[width, height]`, and every
override, placement, and footprint cell must satisfy `0 <= x < width` and
`0 <= y < height`.

All nested `tileId` and `objectId` values must resolve to this manifest. Any
`mirrored: true` or `bakedActors: true` anywhere in the manifest, provenance, or
bindings is invalid.

## Runtime authority boundary

The Python bundle auditor proves structure, path/hash integrity, coordinates,
cross-references, provenance, alpha, and approval state. It deliberately does
not pretend to compare a visual bundle against authoritative gameplay map data.
The required `catalogContractCheck` is a frozen JSON report produced by the
Godot runtime/catalog check. It uses report type
`beastbound.map_visual_catalog_contract`, a valid UTC `generatedAtUtc`, matching
`bundleId`, `result: "PASS"`, and `testedMapIds` exactly covering the bundle. It
freezes the current `map_visual_catalog.json` SHA in `catalogSha256`, and
`bindingHashes`/`mapDataHashes` contain exactly one SHA-256 per `mapId`; every
binding hash must equal its manifest binding reference. `maps` exactly covers
the bundle and each entry has positive `groundDraws`, `objects`, and
`protectedCells`. Every named `checks` boolean shown below must be true and
`errors` must be empty. That runtime check independently compares each binding
against the real `mapId`, `blockedCells`, spawn cells, warp source/destination
cells, and NPC approach/protected cells. Python verifies the report's own
path/SHA and declared bundle/binding/map-data snapshots. The default strict
Godot run validates the complete report type, timestamp, catalog SHA, map
summaries, check matrix, empty errors, and current authoritative hashes; Godot
also owns the gameplay comparison and production of those hashes.

```json
{
  "schemaVersion": 1,
  "reportType": "beastbound.map_visual_catalog_contract",
  "generatedAtUtc": "2026-07-23T10:00:00Z",
  "bundleId": "firebud_region_visual_v1",
  "result": "PASS",
  "testedMapIds": ["firebud_training_yard", "firebud_village_gate"],
  "catalogSha256": "...",
  "bindingHashes": {
    "firebud_training_yard": "...",
    "firebud_village_gate": "..."
  },
  "mapDataHashes": {
    "firebud_training_yard": "...",
    "firebud_village_gate": "..."
  },
  "maps": [
    {
      "mapId": "firebud_training_yard",
      "groundDraws": 1224,
      "objects": 4,
      "protectedCells": 140
    },
    {
      "mapId": "firebud_village_gate",
      "groundDraws": 672,
      "objects": 4,
      "protectedCells": 184
    }
  ],
  "checks": {
    "catalogInitialized": true,
    "catalogCoverageExact": true,
    "catalogPathsExact": true,
    "currentHashesComplete": true,
    "normalLifecycleAccessValid": true,
    "qaPreviewEnabled": true,
    "repeatPrepareIoStable": true,
    "unknownMapFailedClosed": true,
    "allIndependentChecksPassed": true,
    "frozenReportValidationSkippedForGeneration": true
  },
  "errors": []
}
```

Generate missing catalog reports only through the project-owned check:

```sh
godot --headless --path client/godot \
  --script res://scripts/qa/map_visual_runtime_check.gd -- \
  --generate-map-visual-catalog-contract
```

Generation refuses to replace any existing report. A deliberate regeneration
adds `--overwrite-map-visual-catalog-contract`, after the bindings and map data
being re-frozen have been reviewed. The generator writes a temporary file and
atomically installs each bundle report; it does not promise transaction
atomicity across multiple bundles, so interrupted multi-bundle runs must be
audited bundle by bundle before any manifest hash update.

Use the report generation as an explicit three-step freeze:

1. run generation (adding the overwrite flag only for an intentional stale
   report replacement) and read each bundle's path/SHA from
   `catalogContractGeneration.written` in stdout;
2. update that bundle manifest's `catalogContractCheck.sha256` to the newly
   printed exact file SHA; and
3. rerun the default strict validator, which now requires the manifest hash and
   every frozen report snapshot to match:

```sh
godot --headless --path client/godot \
  --script res://scripts/qa/map_visual_runtime_check.gd
```

Generation mode deliberately skips old frozen-report validation while running
all independent authority/path/hash/lifecycle checks; that fact is frozen as
`checks.frozenReportValidationSkippedForGeneration=true`. It does not make a
new report self-authorizing: failure to update the manifest SHA or failure of
the subsequent strict run leaves the catalog contract incomplete.

## Provenance JSON

`source/provenance.json` must freeze every runtime atlas/object file:

```json
{
  "schemaVersion": 1,
  "bundleId": "firebud_region_visual_v1",
  "origin": "AI-generated original",
  "owner": "Beastbound Odyssey project",
  "licenseBasis": "project-owned generated output",
  "rawFiles": [
    {
      "path": "source/raw/ground-atlas-original.png",
      "sha256": "...",
      "dimensions": [1536, 1024]
    }
  ],
  "buildArtifacts": [
    {
      "path": "source/processed/ground-atlas-alpha.png",
      "sha256": "...",
      "dimensions": [1536, 1024]
    }
  ],
  "assets": [
    {
      "assetId": "ground_atlas",
      "path": "runtime/ground/atlas.png",
      "sha256": "...",
      "tool": "image_gen",
      "promptPath": "source/prompts/ground-atlas.md",
      "rawPath": "source/raw/ground-atlas-original.png",
      "generatedAt": "2026-07-23T12:00:00+08:00",
      "operations": ["lossless crop", "alpha cleanup"]
    }
  ],
  "toolchain": {
    "python": "3.x",
    "pillow": "pinned version",
    "atlasHelper": ".agents/skills/design-beastbound-maps/scripts/build_isometric_tile_atlas.py",
    "externalChromaKeyTool": {
      "path": "/Users/example/.codex/tools/remove_chroma_key.py",
      "sha256": "...",
      "repositoryOwned": false
    }
  },
  "processing": [
    "python3 /Users/example/.codex/tools/remove_chroma_key.py --input source/raw/ground-atlas-original.png --out source/processed/ground-atlas-alpha.png --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 64 --edge-contract 1 --despill",
    "python3 .agents/skills/design-beastbound-maps/scripts/build_isometric_tile_atlas.py source/processed/ground-atlas-alpha.png --rows 2 --columns 2 --labels warm_grass_a warm_path_a warm_stone_a warm_soil_a --output-dir .run/map-build/firebud-ground-fresh --atlas-columns 2 --alpha-threshold 0 --atlas-name atlas.png --manifest-name build-manifest.json"
  ],
  "reproducibility": {
    "rawToProcessedByteExact": true,
    "processedToRuntimeByteExact": true,
    "outputPrecondition": ".run/map-build/firebud-ground-fresh must not exist before the command runs",
    "externalToolVendored": false,
    "releaseBlocker": "The chroma-key helper is hash-frozen but external to this repository."
  },
  "mirrored": false,
  "bakedActors": false
}
```

This example deliberately documents an external helper and an absolute external
processing path, so it describes a pending, non-release-ready provenance record
with separate repository-ownership, vendoring, processing-path, and explicit
release-blocker gates. A release candidate must vendor or replace that helper,
use a bundle-relative hash-readable tool reference, remove machine-home paths
from the reproducible commands, set `externalToolVendored` truthfully, clear
`releaseBlocker`, then regenerate and re-freeze every affected hash.

Both manifest `source.rawFiles` and provenance `rawFiles` are non-empty and
must contain the exact same path/SHA pairs, freezing every lossless generation
source. Manifest `source.buildArtifacts` and provenance `buildArtifacts` are
also non-empty and must contain the exact same path/SHA pairs. These are
processed inputs or other deterministic intermediates used to produce runtime
files; they must not duplicate a raw-source path. Both raw and build-artifact
files are part of the owner review subject. PNG dimensions are optional but are
decoded and checked when declared.
Rejected parents kept only to prove image-edit lineage use
`acceptedForRuntime: false` and `lineageOnly: true` in both lists. Every runtime
asset path and digest must appear exactly once.
`promptPath` must resolve to one of `source.promptFiles`, and `rawPath` must
resolve to one of `rawFiles`. Record deterministic crops, alpha work, resizing,
or color cleanup in `operations`; mirroring is never an allowed operation.

The provenance `origin`, `owner`, and `licenseBasis` values must exactly equal
the manifest source values. `toolchain` must be a non-empty object;
`processing` must be a non-empty list of complete command strings rather than
summaries such as “run helper”. `reproducibility` must use the exact field names
shown above. `rawToProcessedByteExact` and `processedToRuntimeByteExact` must be
true, and `outputPrecondition` must state the fresh-output requirement needed to
reproduce byte-identical output. `externalToolVendored=false` or any non-empty
`releaseBlocker` is allowed only while pending: each creates a formal missing
release gate and makes `approved`/`released` validation fail. Merely freezing
the absolute path and SHA of a tool outside this repository does not close that
gate.

When `toolchain.externalChromaKeyTool` is present it contains `path`, `sha256`,
and boolean `repositoryOwned`. `repositoryOwned=false` is a release gate. If it
is true, `path` is interpreted as a normal bundle-relative file reference: the
file must remain inside the bundle, be readable, and match the declared hash;
the tool is then part of the accepted-file set. `externalToolVendored=true` is
invalid unless that repository-owned reference is valid. Independently, any
`processing` command containing a machine-home absolute path (`/Users/`,
`/home/`) or a drive-letter absolute path opens
`provenance.processing_external_path`; replacing the tool metadata alone does
not close it.

## Frozen approval and formal release evidence

Evidence may be partial while production is pending. `approved` already means
the owner accepted a complete, hash-frozen review set; it is not permission to
enable the art for normal players. Both `approved` and `released` require:

- `dressedReference` and a `layeredPreview` that is exactly 1280x720;
- at least three unique runtime screenshot/capture-report pairs, each image
  exactly 1280x720 and declaring `mapId`, `mode`, a PNG file reference, and a
  hash-frozen `captureReport` from
  the real `Main.tscn`. Allowed modes are `idle`, `moving`, `transition`, and
  `occlusion`; the set must cover every manifest map and contain at least one
  `idle` and one `moving` capture. Moving reports must prove cross-frame
  `Input.parse_input_event`, cell change, normal player HUD, isolated profile,
  no account/server session, no save, and no visible auth/QA/debug UI. Multiple
  entries may share one `mapId`/mode when they are independent action captures,
  but image references, capture-report references, and concrete image/report
  pairs must each remain unique;
- JSON reports for Computer Use, collision, and performance, each with
  `schemaVersion: 1`, its exact `reportType`, UTC `generatedAtUtc`, matching
  `bundleId`, `result: "PASS"`, and `testedMapIds` exactly covering every map.
  Formal evidence also requires `excludedReleaseGate: null` and `blockers: []`;
- collision and performance reports with a complete `runnerIdentity` and a
  hashed `rawRunnerReceipt`. These may be absent while pending, but are formal
  release blockers and cannot be replaced by a summarized or hand-authored
  report;
- a Computer Use report whose actions cover the complete per-map action matrix
  and use only same-map, hash-frozen bundle evidence, as defined below;
- the required top-level `catalogContractCheck` report;
- `ownerAcceptance` with the matching `bundleId`, `approved: true`, non-empty
  `reviewer` and `reviewedAt`, a `manifestReviewSubjectSha256` matching the
  auditor's canonical digest, plus `acceptedFiles` exactly matching the complete
  review subject: every prompt, provenance ledger, raw source, build artifact,
  runtime atlas and object PNG, binding, catalog report, displayed
  reference/screenshot and paired capture report, QA report, raw runner receipt,
  and Computer Use nested evidence path/SHA pair, including every unique
  `actionReceipt`. The acceptance file does not list itself, avoiding a circular
  hash.

Only `status=released` may set `releaseApproved=true` and
`runtimeEnabled=true`; both flags are required together for that state.

### Canonical manifest review-subject digest

`manifestReviewSubjectSha256` is not the hash of the manifest file on disk. The
auditor computes it from the parsed manifest with this exact algorithm:

1. make a top-level copy and remove `status`, `ownerReviewStatus`,
   `releaseApproved`, and `runtimeEnabled`;
2. if `evidence` is an object, copy it and remove only `ownerAcceptance`;
3. serialize as UTF-8 JSON using `ensure_ascii=False`, `sort_keys=True`, and
   `separators=(",", ":")` (no whitespace); and
4. SHA-256 the resulting bytes and encode as lowercase hex.

This exclusion lets one accepted review subject move from `approved` to
`released` without a circular digest or a lifecycle-only re-review. It does not
exclude any source, build artifact, runtime asset, binding, catalog snapshot,
capture, report, or other evidence reference. Any change to one of those
references changes the digest and invalidates the old acceptance. Do not hash a
pretty-printed manifest or remove additional keys.

### Collision/performance runner identity and raw receipt

In addition to each report's domain-specific fields, formal collision and
performance reports use this common shape:

```json
{
  "schemaVersion": 1,
  "reportType": "beastbound_map_performance_report",
  "generatedAtUtc": "2026-07-23T10:30:00Z",
  "bundleId": "firebud_region_visual_v1",
  "result": "PASS",
  "testedMapIds": ["firebud_training_yard", "firebud_village_gate"],
  "excludedReleaseGate": null,
  "blockers": [],
  "runnerIdentity": {
    "runner": "godot",
    "runnerVersion": "exact version or commit",
    "buildIdentity": "exact client/build identity"
  },
  "rawRunnerReceipt": {
    "path": "evidence/performance-runner-receipt.jsonl",
    "sha256": "..."
  }
}
```

`runnerIdentity` must contain exactly the three shown keys: `runner` is the
literal `"godot"`, while `runnerVersion` and `buildIdentity` are non-empty.
`rawRunnerReceipt` is a non-empty `.log`, `.txt`, or `.jsonl` in-bundle file
reference whose bytes and SHA are frozen and added to the owner's accepted-file
set. It must be the raw output from the named runner, not a second summary
produced from the final report. Pending reports may omit these two fields only
while truthfully retaining the corresponding missing release gate;
approved/released evidence may not.

### Computer Use report and per-map action matrix

The Computer Use report is separate from Main-scene capture reports and from
Godot's own `Input.parse_input_event` evidence. Its `method` must be
`"computer_use"`, `scene` must be `res://scenes/Main.tscn`, `viewport` must be
`[1280, 720]`, and `displayServer` must identify a non-headless display. For
each manifest map, actions must contain exactly the five required kinds:
`pointer`, `movement_path`, `warp`, `collision`, and `occlusion`.
Unknown kinds and a duplicate action kind for the same map are invalid.

```json
{
  "schemaVersion": 1,
  "reportType": "beastbound_map_computer_use_review",
  "generatedAtUtc": "2026-07-23T10:45:00Z",
  "bundleId": "firebud_region_visual_v1",
  "result": "PASS",
  "testedMapIds": ["firebud_training_yard", "firebud_village_gate"],
  "excludedReleaseGate": null,
  "blockers": [],
  "method": "computer_use",
  "scene": "res://scenes/Main.tscn",
  "viewport": [1280, 720],
  "displayServer": "macOS Metal",
  "actions": [
    {
      "actionId": "firebud_village_gate_pointer",
      "actionKind": "pointer",
      "mapId": "firebud_village_gate",
      "description": "Point at a live map interaction target in the normal client",
      "result": "PASS",
      "evidence": [
        {
          "path": "evidence/runtime-screenshots/firebud_village_gate-idle.png",
          "sha256": "..."
        },
        {
          "path": "evidence/firebud_village_gate_idle_capture.json",
          "sha256": "..."
        }
      ],
      "actionReceipt": {
        "path": "evidence/computer-use-actions/firebud_village_gate_pointer.jsonl",
        "sha256": "..."
      }
    }
  ]
}
```

The example abbreviates the matrix; a valid two-map bundle has all five action
kinds for both maps, with no duplicate same-map kind. Each action's evidence
must match exactly one manifest `runtimeScreenshots` entry for that map: both
the image path/SHA and that entry's paired `captureReport` path/SHA must be
present, and the screenshot must decode as 1280x720. A concrete pair cannot be
reused by another action. Mode is part of the action contract:
`pointer=idle`, `movement_path=moving`, `warp=moving|transition`,
`collision=moving`, and `occlusion=moving`. Multiple independent entries may
therefore share one mapId/mode (notably the three moving actions), but every image
reference, capture-report reference, and concrete pair must be unique. Extra
in-bundle hashed evidence is allowed only when the action still matches exactly
one complete pair; all references are validated and duplicate references are
invalid. For `occlusion`, the moving pair establishes the traversal frame while
the Computer Use action and its raw receipt must describe/prove passing in front
of and behind the tall object; a handwritten `occlusion` capture is not a valid
substitute for the capture harness's supported moving evidence.

Each action also requires `actionReceipt`, a unique in-bundle path/SHA reference
to a non-empty `.log`, `.txt`, or `.jsonl` raw Computer Use receipt. Receipts
cannot be shared across actions and are added to the owner accepted-file set.
Consequently, formal evidence needs at least five independent capture pairs and
five receipts per map. Evidence from another map/bundle cannot satisfy a pair.
If Computer Use cannot see/control the window, keep `computerUseReport: null`
and the release gate open instead of recording a synthetic action.

Minimal acceptance record:

```json
{
  "schemaVersion": 1,
  "bundleId": "firebud_region_visual_v1",
  "approved": true,
  "reviewer": "project owner",
  "reviewedAt": "2026-07-23T18:30:00+08:00",
  "manifestReviewSubjectSha256": "...",
  "acceptedFiles": [
    {
      "path": "evidence/layered-preview.png",
      "sha256": "..."
    },
    {
      "path": "evidence/catalog-contract-check.json",
      "sha256": "..."
    }
  ]
}
```

The real record lists the complete review subject described above; the
abbreviated example only illustrates shape.

Example screenshot entry:

```json
{
  "mapId": "firebud_village_gate",
  "mode": "moving",
  "image": {
    "path": "evidence/runtime-screenshots/firebud_village_gate-moving.png",
    "sha256": "...",
    "dimensions": [1280, 720],
    "alphaMode": "opaque"
  },
  "captureReport": {
    "path": "evidence/firebud_village_gate_moving_capture.json",
    "sha256": "..."
  }
}
```

Run the read-only gate from the repository root:

```sh
python3 .agents/skills/design-beastbound-maps/scripts/audit_map_bundle.py \
  client/godot/assets/maps/firebud_region_visual_v1
```

It emits one JSON object containing `status`, `releaseReady`,
`missingReleaseGates`, counts, errors, and warnings, and never edits the bundle.
Structural errors produce `status: "FAIL"` and a non-zero exit. A pending bundle
may legitimately produce `status: "PASS"` with `releaseReady: false`, so a
formal pre-export gate must parse the JSON and require `status: "PASS"`,
`releaseReady: true`, and an empty `missingReleaseGates`; process exit 0 alone is
not release authorization. In particular, an unvendored external tool, any
provenance `releaseBlocker`, missing runner identity/raw receipt, incomplete
Computer Use matrix, reused/wrong-mode action pairs, missing unique action
receipts, or missing owner acceptance remains a formal blocker even when other
structural checks pass.
