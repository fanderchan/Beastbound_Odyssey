# Firebud Plaza Edge Autotile v2 Generation Ledger

- Mode: built-in `image_gen`
- Generation date: 2026-08-19 Asia/Shanghai
- Intended delivery: four horizontal row sources for the complete 15-signature plaza surface autotile
- Reference material: `source/processed/firebud-plaza-edge-transitions-v1-alpha.png`
- Mirroring: none
- Baked actors, text, props, or UI: none

## Rejected row-1 parent

- Lineage-only output: `source/raw/firebud-plaza-edge-autotile-v2-row-1-rejected-raised-slab.png`
- Generator result: `exec-174eb6c8-41b3-4fc9-aa33-b7f5f07c89d4.png`
- SHA-256: `2429f25ec866530ec89b73206e68a781bfafcf9327c39cea90455f44afc71cf3`
- Rejection: visible raised slab, lower vertical faces, bevel rims, and cast thickness; never accepted for runtime.

```text
Use case: stylized-concept
Asset type: first production row strip for clean-HD 2.5D isometric Firebud plaza ground autotiles
Input image 1: honey-beige irregular stone material, grass palette, flat 2:1 camera, and brushwork reference only
Primary request: create exactly four complete stone-plaza transition tiles in one strict horizontal 4-column by 1-row strip
Scene/backdrop: four equal square cells; perfectly flat uniform solid #FF00FF outside diamonds; no grid lines
Composition/framing: exactly one centered complete flat 2:1 rhombus per cell, identical size/camera/placement and generous spacing
Exact left-to-right patterns:
cell 1 grass invades only the northwest diamond edge;
cell 2 grass invades only the northeast edge;
cell 3 grass invades both northwest and northeast edges, and no other edges;
cell 4 grass invades only the southwest edge.
Every listed edge has a narrow irregular 10-18% dark sage/olive meadow grass invasion with subtle moss entering stone joints; every unlisted edge remains clean honey-beige irregular paving
Style/medium: premium original hand-painted HD 2D game texture, broad readable stone shapes, restrained detail, readable at 80x40, not pixel art, not photorealistic
Materials/textures: warm honey limestone paving with varied rounded irregular stones and subtle joints; muted sage grass only on designated edges
Constraints: exactly four complete flat ground diamonds; no raised slab, no visible vertical side, no bevel thickness, no cast shadow, no dark outline; preserve a walkable quiet center; no props or copied commercial art
Avoid: text, labels, numbers, symbols, borders, grid dividers, extra/missing tiles, duplicate patterns, rocks sitting above the surface, flowers, footprints, characters, UI, watermark, checkerboard, gradient background, cropped diamonds
```

## Accepted row 1 edit

- Output: `source/raw/firebud-plaza-edge-autotile-v2-row-1.png`
- Generator result: `exec-559cb91c-0587-449c-9c13-9ebfa7fbc54a.png`
- SHA-256: `8b5e68b30c2ce74ffaaa57814b82ce1c67275a725931eb5f4168895a70aac62f`

```text
Use case: precise-object-edit
Asset type: corrected first row of Firebud plaza isometric ground autotiles
Input image 1: edit target
Input image 2: flat ground silhouette and edge-geometry reference only
Primary request: remove only the raised-slab appearance from all four stone diamonds in Image 1
Invariants: keep the exact four-cell horizontal layout, canvas, pure #FF00FF backdrop, tile count, tile positions, 2:1 diamond size, honey-beige stone texture, and the exact grass patterns unchanged: northwest only; northeast only; northwest+northeast; southwest only
Required edit: every diamond must become a perfectly flat top-down isometric ground cutout like Image 2, with one clean single-pixel-style silhouette boundary. Remove all visible vertical side faces, bottom thickness, bevel rims, dark underside bands, and cast shadows, especially along southwest and southeast lower edges
Style/medium: preserve the existing hand-painted stone and grass pixels as closely as possible
Constraints: change only slab thickness/edge geometry; do not move, resize, recolor, restyle, add, remove, or swap grass edges; exactly four complete flat diamonds
Avoid: raised platform, floating slab, dark lower rim, text, labels, grid lines, extra tiles, props, watermark, cropped diamonds
```

## Row 2

- Output: `source/raw/firebud-plaza-edge-autotile-v2-row-2.png`
- Generator result: `exec-b784ca05-1fab-4d3c-823e-e079e437a772.png`
- SHA-256: `97788fa84f6f7b21f07181dd80cfe8f806a6c1caba0ffd8d783de117c0b7e583`

```text
Use case: stylized-concept
Asset type: second production row strip for the same clean-HD 2.5D isometric Firebud plaza autotile sheet
Input image 1: original honey-stone material reference
Input image 2: approved corrected flat row reference; match its four-cell layout, diamond size, spacing, flat edge geometry, stone/grass palette, and brushwork exactly
Primary request: create exactly four complete stone-plaza transition tiles in one strict horizontal 4-column by 1-row strip
Scene/backdrop: four equal square cells; perfectly flat uniform solid #FF00FF outside diamonds; no grid lines
Exact left-to-right patterns:
cell 1 grass invades northwest and southwest edges only;
cell 2 grass invades northeast and southwest edges only;
cell 3 grass invades northwest, northeast, and southwest edges only;
cell 4 grass invades southeast edge only.
Every listed edge has the same narrow irregular 10-18% sage/olive grass invasion with subtle moss entering joints; every unlisted edge remains clean honey-beige irregular paving. Show all and only listed edges
Style/medium: premium original hand-painted HD 2D game texture, broad readable stones, restrained detail, readable at 80x40
Constraints: exactly four centered complete perfectly flat 2:1 ground diamonds; match Image 2 scale and placement; no raised slab, vertical side, bevel thickness, cast shadow, dark underside, props, or copied commercial art
Avoid: text, labels, numbers, symbols, borders, grid dividers, extra/missing tiles, duplicate patterns, above-surface rocks, flowers, footprints, characters, UI, watermark, checkerboard, gradient background, cropped diamonds
```

## Row 3

- Output: `source/raw/firebud-plaza-edge-autotile-v2-row-3.png`
- Generator result: `exec-bd0f3abb-bbba-4259-91d4-5919b9cc03cc.png`
- SHA-256: `d5d202785f5ee30b5331847be0eed4a3ea087272a4f9ea4c17122fa970513906`

```text
Use case: stylized-concept
Asset type: third production row strip for the same clean-HD 2.5D isometric Firebud plaza autotile sheet
Input image 1: original honey-stone material reference
Input images 2-3: approved flat row references; match their four-cell layout, diamond size, spacing, flat edge geometry, stone/grass palette, and brushwork exactly
Primary request: create exactly four complete stone-plaza transition tiles in one strict horizontal 4-column by 1-row strip
Scene/backdrop: four equal square cells; perfectly flat uniform solid #FF00FF outside diamonds; no grid lines
Exact left-to-right patterns:
cell 1 grass invades northwest and southeast edges only;
cell 2 grass invades northeast and southeast edges only;
cell 3 grass invades northwest, northeast, and southeast edges only;
cell 4 grass invades southwest and southeast edges only.
Every listed edge has the same narrow irregular 10-18% sage/olive grass invasion with subtle moss entering joints; every unlisted edge remains clean honey-beige irregular paving. Show all and only listed edges
Style/medium: premium original hand-painted HD 2D game texture, broad readable stones, restrained detail, readable at 80x40
Constraints: exactly four centered complete perfectly flat 2:1 ground diamonds; match approved row scale and placement; no raised slab, vertical side, bevel thickness, cast shadow, dark underside, props, or copied commercial art
Avoid: text, labels, numbers, symbols, borders, grid dividers, extra/missing tiles, duplicate patterns, above-surface rocks, flowers, footprints, characters, UI, watermark, checkerboard, gradient background, cropped diamonds
```

## Row 4

- Output: `source/raw/firebud-plaza-edge-autotile-v2-row-4.png`
- Generator result: `exec-7dabee13-65f8-4b21-ad96-b14a68ef8bfc.png`
- SHA-256: `3f4eeac231a6bafe3c68bfe2e9c675ae2c8344d13038bb7b6acbd745cae62202`

```text
Use case: stylized-concept
Asset type: fourth production row strip for the same clean-HD 2.5D isometric Firebud plaza autotile sheet
Input image 1: original honey-stone material reference
Input images 2-3: approved flat row references; match their four-cell layout, diamond size, spacing, flat edge geometry, stone/grass palette, and brushwork exactly
Primary request: create three complete stone-plaza transition tiles followed by one intentionally empty cell, in one strict horizontal 4-column by 1-row strip
Scene/backdrop: four equal square cells; perfectly flat uniform solid #FF00FF outside diamonds; no grid lines
Exact left-to-right patterns:
cell 1 grass invades northwest, southwest, and southeast edges only;
cell 2 grass invades northeast, southwest, and southeast edges only;
cell 3 grass invades all four edges: northwest, northeast, southwest, and southeast;
cell 4 contains no tile and no mark at all, only uninterrupted pure #FF00FF.
Every listed edge has the same narrow irregular 10-18% sage/olive grass invasion with subtle moss entering joints; every unlisted edge remains clean honey-beige irregular paving. Show all and only listed edges
Style/medium: premium original hand-painted HD 2D game texture, broad readable stones, restrained detail, readable at 80x40
Constraints: exactly three centered complete perfectly flat 2:1 ground diamonds in cells 1-3; cell 4 entirely empty; match approved row scale/placement; no raised slab, vertical side, bevel thickness, cast shadow, dark underside, props, or copied commercial art
Avoid: any content in cell 4; text, labels, numbers, symbols, borders, grid dividers, extra/missing tiles, duplicate patterns, above-surface rocks, flowers, footprints, characters, UI, watermark, checkerboard, gradient background, cropped diamonds
```
