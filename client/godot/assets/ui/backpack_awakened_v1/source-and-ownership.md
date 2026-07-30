# Backpack Awakened V1 — Source And Ownership

## Purpose

This package supplies the 1280×720 Beastbound Odyssey backpack and equipment screen.
It implements the approved hierarchy — equipment and character on the left, inventory on the
right, and exact-instance equipment comparison above both — without copying third-party game
pixels, logos, characters, icons, text, or ornamental silhouettes.

`asset-manifest.json` is the machine-readable source of truth for every runtime PNG in this
package. It records dimensions, modes, SHA256 checksums, atlas cells, runtime purpose, provenance,
and replacement instructions. Godot-generated `.import` files are deliberately excluded.

## Provenance audit

| Runtime group | Ownership/source | Production treatment |
| --- | --- | --- |
| `runtime/backpack_backdrop_1280x720.png` | Original Beastbound image generated with OpenAI built-in `image_gen` | The durable prompt is in `source/generation-prompts.md`; the generated output was proportionally normalized to 1280×720. User screenshots informed layout hierarchy and material language only. |
| `runtime/character/novice_hunter_inventory.png` | Project-owned copy of `../../characters/novice_hunter/identity/processed/identity-1.png` | Byte-identical 512×512 RGBA copy of the approved novice-hunter identity art. Keeping it inside this UI package guarantees the backpack character surface is included in exported PCK builds. |
| `runtime/common/button_*.png`, `close_icon.png`, `tab_*.png` | Original project-owned Beastbound UI components retained in this package | The packaged bytes are the shipping and provenance authority for this screen; no external asset package is required. |
| `runtime/slots/item_*.png` | Original project-owned Beastbound slot components retained in this package | The files use backpack-specific names and remain wholly project-owned; no third-party source is involved. |
| `runtime/common/currency_atlas.png` | Original Beastbound `image_gen` output | Two-cell chroma-key source was converted to alpha and normalized to 1024×512. |
| `runtime/items/equipment_atlas.png` | Original Beastbound `image_gen` output | 6×6 grid, 209×209 cells, 31 occupied cells and 5 deliberate empty cells. |
| `runtime/items/consumable_atlas.png` | Original Beastbound `image_gen` output | 6×7 grid, 193×193 cells; raw 1163×1353 output was minimally normalized to 1158×1351 without changing item order. Five experience-pill cells intentionally delegate to the equipment atlas. |
| `runtime/items/material_atlas.png` | Original Beastbound `image_gen` output | 5×4 grid, 200×200 cells, 11 occupied and 9 deliberately empty cells. |
| `runtime/items/pet_item_atlas.png` | Original Beastbound `image_gen` output using only project-owned pet identity references | 3×3 grid, 418×418 cells, eight newly drawn eggs/certificates and one transparent reserved cell. Portraits informed identity traits only; no portrait pixel was cropped, traced, or embedded. |

The character showcase is deliberately duplicated inside this package rather than loaded only
from its character-authoring path. The copy is byte-identical and exists solely to make exported
PCK inclusion explicit; the novice-hunter identity package remains the authoring source of truth.
Where the icon catalog selects a formal shared pet portrait for an egg or permit consumer, the
portrait remains owned and audited by its original pet-art package;
`pet_item_atlas.png` remains the original fallback item surface.

## Atlas contracts

All atlas coordinates are zero-based. Stable item IDs map to cells in the corresponding
`source/*/manifest-part.json` file:

- Currency: 2 columns × 1 row, 512×512 pixels per cell.
- Equipment: 6 columns × 6 rows, 209×209 pixels per cell.
- Consumables: 6 columns × 7 rows, 193×193 pixels per cell.
- Materials: 5 columns × 4 rows, 200×200 pixels per cell.
- Pet items: 3 columns × 3 rows, 418×418 pixels per cell.

An atlas may be replaced independently only if its stable item-ID mapping remains unchanged or is
migrated explicitly in the same change. Empty/reserved cells are part of the contract, not free
implicit fallbacks.

## Restrictions

- No StoneAge Awakening raster asset may be copied into this package.
- Reference screenshots may guide layout, hierarchy, material language, and interaction only.
- Rarity colors must not be inferred from the screenshots. Beastbound equipment does not
  currently have an authoritative rarity field.
- Internal instance IDs, schema fields, provenance, fingerprints, and QA data are never rendered
  to players.
- Missing item art must resolve to an approved original category icon or fail visibly in QA; it
  must never fall back to a third-party screenshot crop, emoji, text glyph, or fabricated rarity.
- Generated `.import` files are engine cache state and are not listed in the asset manifest.

## Replacement workflow

1. Work in the relevant `source/<asset-group>/` authoring folder. Common and slot surfaces are
   self-contained packaged Beastbound components: create and approve an original replacement,
   then install it at the same runtime path. Character identity changes must first be approved
   under `assets/characters/novice_hunter/identity/`, then copied byte-identically to
   `runtime/character/novice_hunter_inventory.png`.
2. Preserve the documented canvas, cell geometry, item ordering, alpha contract, and reserved
   cells unless a coordinated schema migration is part of the same change.
3. Replace the runtime PNG and update its source record, mapping record, dimensions, and SHA256 in
   `asset-manifest.json`.
4. Parse the manifest and verify every declared SHA256 against the filesystem.
5. Run the backpack icon-catalog and visual checks, then record a new 1280×720, 1×-speed
   owner-review video before accepting player-visible replacement art.
