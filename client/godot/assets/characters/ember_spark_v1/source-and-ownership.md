# Ember Spark v1 Source and Ownership

- Character: `ember_spark_v1`
- Work: original Beastbound Odyssey playable-character production art
- Generation route: OpenAI built-in `image_gen` raster generation; no CLI/API fallback
- Reference policy: the existing Beastbound novice-hunter board is used only for project-native line, shading, and scale language. Ember Spark's identity, face, hair, costume, weapon, silhouette, poses, and asymmetric markers are independently specified and must not copy that character.
- Ownership intent: project-original production asset generated for Beastbound Odyssey; no third-party commercial-game pixels, trademarks, logos, or source assets are copied.
- Chroma workflow: flat `#FF00FF` raw sources; transparent derivatives may be produced only from the same raw source and its exact chroma-key mask/operation.
- Replacement path: regenerate from the preserved identity lock and exact per-action prompts, then repeat deterministic normalization and QC.
- Owner review: `owner_review_pending`

Generated raw images remain preserved under this bundle's `source/` tree and in Codex's default generated-image archive. Runtime/UI frames live only under this bundle and are not registered in shared manifests by this isolated task.
