# Ember Spark automated QC

- Status: `passed`
- World runtime: `56/56`
- Battle source/runtime: `180/180` / `180/180`
- Battle per view: `90 + 90`
- Runtime/source sizes: `256 x 256` / `512 x 512`
- down-8 == revive-1: `True`
- Exact duplicate/mirror gates: `True`
- World walk gait v3: `contact A -> passing A -> recovery A -> contact B -> passing B -> recovery B` at `9 FPS`
- Gait v3 pixel/runtime gates: `48 source + 48 runtime`, `56/56 Godot parity`, source/runtime baseline drift `0/1 px`, exact duplicates/mirrors `0`
- Gait v3 real-Godot review: `1280 x 720`, `30 FPS`, `433` frames, `1.00x`, decode passed, SHA-256 `ab58fc67...`
- Gait v3 real-Main review: `1280 x 720`, `30 FPS`, `644` frames, real cross-frame mouse movement, `1.00x`, decode passed, SHA-256 `6ab986d2...`
- Conservative chroma-edge maximum: `4` pixels (`0.001874`)
- Owner review: `owner_review_pending`

See `validation-summary.json` and `hash-ledger.json` for machine-readable evidence.
