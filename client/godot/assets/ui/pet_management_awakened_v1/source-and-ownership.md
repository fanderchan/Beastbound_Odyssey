# Pet Management Awakened V1

## Purpose

Original Beastbound Odyssey pet-management UI skin for the 1280×720 PC client.
It provides an empty full-screen backdrop and reusable blank control frames.
All player data, labels, pet art, growth bars and interactions remain live Godot
controls layered over these assets.

## Source and ownership

- Authoring tool: OpenAI built-in image generation, 2026-07-28.
- Ownership basis: newly generated for this repository from an original
  Beastbound UI brief.
- Visual reference: the owner-selected Beastbound concept
  `.run/visual-review/pet-ui-awakening-v2/selected-option-2.png`.
- External StoneAge screenshots informed information hierarchy and softness only.
  No third-party source art, logo, character, icon or map asset was copied into
  the runtime files.
- Raw generations are preserved under `source/`.

## Processing

- `pet_management_backdrop_raw.png` was resized without creative alteration to
  `runtime/pet_management_backdrop_1280x720.png`.
- `pet_management_components_chroma_raw.png` used a generated `#FF00FF`
  background.
- The repository-approved image-generation chroma helper removed that backdrop
  with a soft matte, one-pixel edge contraction and despill.
- Deterministic crops produced the two tab states, two action-button states and
  two portrait-slot states in `runtime/`.

## Replacement path

Every runtime texture is loaded through
`scripts/ui/pet_management_visual_skin.gd`. A future hand-authored skin can
replace the files at the same paths without changing gameplay or server
contracts.

## Review state

Engineering integration may use these assets for runtime comparison, but visual
ownership remains `owner_review_pending` until the project owner accepts the
actual 1280×720 Godot screenshot.
