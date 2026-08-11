# Ember Spark v1 Source and Ownership

- Character: `ember_spark_v1`
- Work: original Beastbound Odyssey playable-character production art
- Generation route: OpenAI built-in `image_gen` raster generation; no CLI/API fallback
- Reference policy: the existing Beastbound novice-hunter board is used only for project-native line, shading, and scale language. Ember Spark's identity, face, hair, costume, weapon, silhouette, poses, and asymmetric markers are independently specified and must not copy that character.
- Ownership intent: project-original production asset generated for Beastbound Odyssey; no third-party commercial-game pixels, trademarks, logos, or source assets are copied.
- Chroma workflow: flat `#FF00FF` raw sources; transparent derivatives may be produced only from the same raw source and its exact chroma-key mask/operation.
- Replacement path: regenerate from the preserved identity lock and exact per-action prompts, then repeat deterministic normalization and QC.
- Owner review: `owner_review_pending`

## 2026-08-12 world gait semantic repair v3

The original world `walk4` passed file-hash and mirror gates but repeated a broad double-contact silhouette, which read as one-legged sliding in the real client. Its first four-frame repair was also rejected by the project owner because the two halves still felt like the same leg and the loop snapped between poses. Neither rejected cycle is approved runtime art.

The v3 replacement is a project-original, AI-assisted true-eight `walk6` set with two visibly opposed three-frame leg phases: `contact_a -> passing_a -> recovery_a -> contact_b -> passing_b -> recovery_b`. It changes only the 48 world walk frames and their playback rate to `9 FPS`; identity, idle, battle actions, movement speed, pathfinding, and input behavior are unchanged.

Forty-eight exact selected 512px inputs, the deterministic build tool, normalized 512px source frames, premultiplied-alpha 256px runtime frames, and visual contact sheet are preserved in this bundle. `source/world-gait-v3-manifest.json` records the generated-image archive names, per-direction selections, rejected methods, and processing contract. Machine pose labels are treated only as transition diagnostics; physical-leg identity remains a human visual judgment.

Generated raw images remain preserved under this bundle's `source/` tree and in Codex's default generated-image archive. Runtime/UI frames live only under this bundle and are not registered in shared manifests by this isolated task.
