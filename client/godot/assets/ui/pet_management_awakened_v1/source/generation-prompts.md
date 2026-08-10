# Generation Prompts

Generated on 2026-07-28 with OpenAI built-in image generation. The owner-selected
Beastbound concept was supplied as the edit/style reference.

## Empty backdrop

Create a clean 1280×720 full-screen pet-management background plate. Preserve
the selected concept's softly painted brown wooden header, leafy corner accents,
dark charcoal-brown interior, empty left showcase stage, warm rounded right
panel frame and empty bottom roster rail. Remove all pets, portraits, icons,
buttons, tabs, bars, labels, numbers, Chinese text, logos and watermarks. Do not
add scenery or third-party characters.

## Component atlas

Create exactly six blank components on a flat `#FF00FF` chroma background in a
2×3 grid: normal and selected tan vertical tabs, normal and selected rounded
action buttons, and normal and selected square portrait frames. Match the
selected concept's softly painted wood, rounded bevels, restrained highlights
and commercial cartoon finish. Keep wide empty gutters and include no text,
icons, creatures, logos or watermarks.

## Deterministic processing

```text
python3 /Users/fander/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py \
  --input source/pet_management_components_chroma_raw.png \
  --out source/pet_management_components_alpha.png \
  --key-color #ff00ff --soft-matte \
  --transparent-threshold 12 --opaque-threshold 64 \
  --edge-contract 1 --despill --force
```

The backdrop was resized to 1280×720 with `sips`. Component crops were taken
from the alpha atlas with fixed `sips --cropOffset` rectangles and then trimmed
to the dimensions recorded in `asset-manifest.json`. No creative paint or
pixel-generation step followed image generation.
