# Pet Management Awakened V2

## Purpose

This bundle supplies the original Beastbound pet-management presentation used by
the 1280x720 PC client.

## Sources

- `runtime/pet_management_backdrop_1280x720.png`, buttons, tabs and portrait
  frames are carried forward from the original Beastbound
  `pet_management_awakened_v1` bundle. The widened backdrop is rebuilt by
  `source/build_backdrop.py`.
- Stage rings, header paw, help medallion, strategy banner and codex shield were
  generated for this repository with OpenAI built-in image generation on
  2026-07-28. Their raw chroma and processed-alpha atlases are preserved under
  `source/`; deterministic runtime crops are verified by
  `source/slice_primary_ornaments.py`.
- The quality ribbon, close mark, editing stylus and paired roster controls were
  generated in the same session and art direction. Their raw and alpha atlases
  are preserved under `source/`; `source/slice_micro_ornaments.py` rebuilds the
  runtime crops.
- `runtime/showcase/<formId>.png` is an exact runtime copy of the corresponding
  independently produced formal Beastbound pose at
  `assets/pets/<formId>/identity/front_3quarter_sw.png`.
  `source/sync_showcase_art.py` verifies the complete 512×512 RGBA set and can
  refresh it without resizing or creative alteration.
- `source/selected-option-2-reference.png` is the owner-selected original
  Beastbound concept image and is retained only as internal visual-review
  evidence.
- `source/base-components-alpha.png` is the original Beastbound component sheet
  used by the V1 bundle.
- `source/generation-prompts.md` records the two generated result IDs, requested
  contents, art direction and chroma contract.

No StoneAge or other third-party artwork is included in this bundle.

## Reproduction and integrity

- All four derivation scripts are read-only verification gates by default:
  `source/build_backdrop.py`, `source/slice_primary_ornaments.py`,
  `source/slice_micro_ornaments.py` and `source/sync_showcase_art.py`.
  Pass `--write` only when deliberately refreshing derived runtime files.
- `python3 source/build_asset_manifest.py` rewrites `asset-manifest.json` with
  dimensions, color mode and SHA-256 for every runtime PNG.
- Same-viewport visual evidence is stored under
  `.run/visual-review/pet-ui-awakening-v3/`.

## Replacement path

Each showcase image can be replaced independently while retaining its form ID
and 512x512 transparent PNG contract. UI textures can be revised as one coherent
bundle after a same-viewport visual comparison and owner review.

## Runtime contract

- PC reference viewport: 1280x720.
- Showcase images: transparent 512x512 PNG.
- Missing showcase art must fall back to the existing action-art catalog.
- This bundle changes presentation only; it must not alter pet stats, growth,
  evolution, fusion, ownership or server authority.

## Review state

Engineering and internal design QA can use this bundle, but its visual state
was explicitly accepted by the project owner on 2026-07-28 (`这版可以`), so the
pet-management UI bundle review state is `approved`. This approval covers the
layout and UI bundle shown in the accepted runtime comparison; it does not
implicitly approve later pet portraits or other pet-art additions.
