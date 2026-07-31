# Ember Spark prompt record

All creative raster generation for `ember_spark_v1` used OpenAI's built-in image generation. No CLI/API fallback and no third-party game art were used. The Beastbound novice-hunter identity board was supplied only once as a project-style reference; every Ember identity marker, pose, direction, view, portrait, costume and weapon was independently specified.

## Preserved prompt contracts

- `identity-board.txt`: exact identity-lock board prompt.
- `ui-production-contract.md`: independent portrait and full-body showcase requirements.
- `world-generation-contract.md`: true-eight world-direction requirements, with `idle 1 + walk 4` selected from each independent source sheet.
- `battle-generation-contract.md`: per-action source-sheet requirements for both independently authored battle views.
- Every processed action directory also contains the pipeline's `prompt-used.txt` and `pipeline-meta.json`; raw generation sheets are preserved beside them.
- `generation-provenance.json` records the immutable generated-image archive filename used for every raw source.

The original image-generation transcript contains the expanded action-specific wording. These tracked contracts capture every identity, layout, action-count, view, background, no-mirroring and no-FX constraint required to reproduce the bundle.
