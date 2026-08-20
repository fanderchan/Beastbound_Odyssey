# Firebud Surface Autotile v3 Rework Ledger

- Mode: built-in `image_gen` precise-object-edit
- Generation date: 2026-08-21 Asia/Shanghai
- Intended delivery: wider, irregular path/meadow and plaza/meadow transitions for all 15 exposed-edge signatures
- Frozen parent rows: `source/raw/firebud-{path,plaza}-edge-autotile-v2-row-*.png`
- Runtime topology: unchanged 80x40 tiles and unchanged canonical signature order
- Mirroring: none
- Baked actors, text, props, labels, or UI: none

## Path row 1 pass 1 (lineage only)

- Edit target: `source/raw/firebud-path-edge-autotile-v2-row-1.png`
- Output: `source/raw/firebud-path-edge-autotile-v3-row-1-pass-1.png`
- Generator result: `exec-4f04f011-7aec-43c6-bb95-64d2505c0ef8.png`
- SHA-256: `bdc5123f2858d75d2f85241816950ce55e2f29e38a63418e1be95411bb1b665e`
- Disposition: transition geometry accepted, but the yellow-olive grass was not detected reliably by the production hue mask; retained only as the edit parent for the accepted color correction.

```text
Use case: precise-object-edit
Asset type: Firebud Village v2 production isometric path-transition row source, later downsampled to 80x40 per tile
Input image 1: edit target and exact layout/material reference
Primary request: keep the exact four-tile horizontal strip and edit only the grass-to-terracotta transition inside each diamond so the path edge no longer reads as a hard straight diamond grid after heavy downsampling.
Exact invariants: preserve the canvas aspect, four equal cells, one centered complete flat 2:1 diamond per cell, diamond positions and sizes, solid uniform #FF00FF outside every diamond, flat ground geometry, warm muted terracotta path core, no thickness or shadow, and the exact exposed-edge identities left to right: cell 1 northwest only; cell 2 northeast only; cell 3 northwest+northeast only; cell 4 southwest only. Every unlisted edge must remain clean connected terracotta all the way to that edge.
Required edit: on each listed exposed edge, widen the meadow/grass incursion to a readable irregular 28–38% transition band. Replace the current ruler-straight fringe with a softly meandering broken boundary: broad muted sage meadow fingers, small concave bites, sparse short grass tufts and a little worn earth feathering into the terracotta. Vary the boundary silhouette within each edge while keeping a quiet walkable terracotta center. The transition must remain legible after reduction to 80x40 without looking like a decorative border.
Style/medium: polished original clean-HD hand-painted 2D game texture, broad calm shapes, low noise, compatible with the existing image, not pixel art, not photorealistic.
Constraints: change only transition width and boundary naturalism; preserve exact tile count, layout, direction assignments, palette family and flat silhouette; all four diamonds complete and separated.
Avoid: straight uniform grass strips, sharp rectangular corners, sawtooth tile outlines, grass on unlisted edges, swapped edge directions, center emblems, flowers, rocks, footprints, props, characters, UI, text, labels, symbols, borders, grid lines, extra/missing/cropped tiles, gradients or marks in the #FF00FF backdrop, raised slabs, bevels, vertical sides, cast shadows, watermark.
```

## Path row 1 accepted pass 2

- Edit target: `source/raw/firebud-path-edge-autotile-v3-row-1-pass-1.png`
- Hue/value reference: `source/raw/firebud-path-edge-autotile-v3-row-2.png`
- Output: `source/raw/firebud-path-edge-autotile-v3-row-1.png`
- Generator result: `exec-0a765107-6d88-40c2-881b-c4f0aa02bb14.png`
- SHA-256: `2afcc2482c2b1d5afa62dfb4ade04e77aba8e4a9153608b76ae7bd4997982ae1`

```text
Use case: precise-object-edit
Asset type: Firebud path-transition v3 row-1 color correction
Input image 1: edit target; preserve its exact geometry, pixels outside the grass zones, four-cell layout, diamond sizes, and edge assignments
Input image 2: accepted grass hue/value reference only
Primary request: recolor only the grass/meadow invasion in Image 1 so it uses the visibly deeper muted sage-green hue and value contrast of Image 2 and remains detectable after the production palette normalization.
Exact invariants: do not change the width, contour, position or texture layout of the existing grass invasion; do not change the terracotta path; preserve exact patterns left to right: northwest only, northeast only, northwest+northeast only, southwest only; preserve complete flat diamonds and pure #FF00FF backdrop.
Required correction: shift the yellow-olive grass in Image 1 toward the darker cooler sage/olive green seen on Image 2, with clear green-vs-terracotta separation while remaining natural and restrained. Keep grass blades and worn-earth feathering in place.
Constraints: color correction only inside existing designated grass zones; no new or removed grass, no pattern/shape/layout change.
Avoid: yellow/mustard grass, neon green, recoloring terracotta, changing boundary geometry, grass on unlisted edges, swapped patterns, raised geometry, props, text, UI, grid lines, backdrop marks, extra or cropped tiles, watermark.
```

## Path row 2

- Edit target: `source/raw/firebud-path-edge-autotile-v2-row-2.png`
- Output: `source/raw/firebud-path-edge-autotile-v3-row-2.png`
- Generator result: `exec-45d264e3-37e5-441d-9c1e-63c5f460e5b4.png`
- SHA-256: `34381cfd261b4c784614eb8e15304de59d3a5cc81607bb0309850d27b01c9ccd`

```text
Use case: precise-object-edit
Asset type: Firebud Village v2 production isometric path-transition row 2 source, later downsampled to 80x40 per tile
Input image 1: edit target and exact layout/material reference
Primary request: preserve the exact strip and edge-direction assignments, and edit only the grass-to-terracotta boundary so exposed edges become broad, natural and readable rather than a narrow uniform diamond border.
Exact invariants: preserve canvas/aspect, four equal cells, one centered complete flat 2:1 diamond per cell, positions/sizes, solid uniform #FF00FF outside diamonds, flat ground, warm muted terracotta core, and exact patterns left to right: cell 1 northwest+southwest only; cell 2 northeast+southwest only; cell 3 northwest+northeast+southwest only; cell 4 southeast only. Every unlisted edge must stay clean connected terracotta to that edge.
Required edit: widen only each listed edge to an irregular 28–38% meadow transition band. Use broad muted sage meadow fingers, asymmetric concave bites, sparse short grass tufts and subtle worn-earth feathering; make each boundary meander differently. Keep a connected, quiet walkable terracotta core to all unlisted edges and make the result legible at 80x40.
Style/medium: polished original clean-HD hand-painted 2D game texture, broad calm shapes, low noise, compatible with the input, not pixel art or photorealistic.
Constraints: change only transition width/naturalism; preserve tile count/layout/directions/palette/flat silhouette; all diamonds complete and separated.
Avoid: straight uniform grass strips, decorative border look, sharp rectangular corners, grass on unlisted edges, swapped patterns, center emblems, flowers, rocks, footprints, props, characters, UI, text, labels, symbols, borders, grid lines, extra/missing/cropped tiles, any mark outside diamonds, raised slabs, bevels, vertical sides, cast shadows, watermark.
```

## Path row 3

- Edit target: `source/raw/firebud-path-edge-autotile-v2-row-3.png`
- Output: `source/raw/firebud-path-edge-autotile-v3-row-3.png`
- Generator result: `exec-ce0c8166-9c92-45db-9c68-3509acbd166d.png`
- SHA-256: `9faef1415cf5c0f34255318035d7d374ade9a75cfedbe973f5330beb5f4793c4`

```text
Use case: precise-object-edit
Asset type: Firebud Village v2 production isometric path-transition row 3 source, later downsampled to 80x40 per tile
Input image 1: edit target and exact layout/material reference
Primary request: preserve the exact strip and direction assignments, editing only the grass-to-terracotta boundary so exposed edges read as wide natural meadow transitions rather than thin straight diamond borders.
Exact invariants: preserve canvas/aspect, four equal cells, one centered complete flat 2:1 diamond per cell, positions/sizes, solid uniform #FF00FF outside, flat ground, warm muted terracotta core, and exact patterns left to right: cell 1 northwest+southeast only; cell 2 northeast+southeast only; cell 3 northwest+northeast+southeast only; cell 4 southwest+southeast only. Every unlisted edge remains clean connected terracotta to that edge.
Required edit: widen only listed exposed edges to an irregular 28–38% meadow transition band. Use broad muted sage meadow fingers, asymmetric concave bites, sparse short grass tufts and subtle worn-earth feathering; each boundary must meander differently. Retain a connected quiet terracotta path core to every unlisted edge and legibility at 80x40.
Style/medium: polished original clean-HD hand-painted 2D game texture, broad calm shapes, low noise, compatible with input, not pixel art or photorealistic.
Constraints: change only transition width/naturalism; preserve tile count, layout, directions, palette and flat silhouette; complete separated diamonds.
Avoid: straight uniform grass strips, decorative border look, sharp rectangular corners, grass on unlisted edges, swapped patterns, center emblems, flowers, rocks, footprints, props, characters, UI, text, labels, symbols, borders, grid lines, extra/missing/cropped tiles, any mark outside diamonds, raised slabs, bevels, vertical sides, cast shadows, watermark.
```

## Path row 4

- Edit target: `source/raw/firebud-path-edge-autotile-v2-row-4.png`
- Output: `source/raw/firebud-path-edge-autotile-v3-row-4.png`
- Generator result: `exec-0f557b93-3553-4db7-bcfb-3bfca757cdf7.png`
- SHA-256: `0b7ac3e0fff176512c0cfad23dfeb939ccc99543da9be783dfc149e396743ee0`

```text
Use case: precise-object-edit
Asset type: Firebud Village v2 production isometric path-transition row 4 source, later downsampled to 80x40 per tile
Input image 1: edit target and exact layout/material reference
Primary request: preserve the exact strip and directions, editing only the grass-to-terracotta boundary so exposed edges are broad natural meadow transitions rather than thin uniform diamond borders.
Exact invariants: preserve canvas/aspect, four equal cells, centered complete flat 2:1 diamonds in cells 1–3, their positions/sizes, solid uniform #FF00FF outside, cell 4 entirely empty pure #FF00FF, flat ground, warm muted terracotta core, and exact patterns: cell 1 northwest+southwest+southeast only; cell 2 northeast+southwest+southeast only; cell 3 all four edges; cell 4 no tile or mark. Every unlisted edge stays clean connected terracotta to that edge.
Required edit: widen only listed exposed edges to irregular 28–38% meadow transition bands with broad muted sage fingers, asymmetric concave bites, sparse short grass tufts and subtle worn-earth feathering. Make boundaries meander differently. Keep a clearly readable connected terracotta island/core, especially in the all-four-edge tile, and preserve 80x40 legibility.
Style/medium: polished original clean-HD hand-painted 2D game texture, broad calm shapes, low noise, compatible with input, not pixel art or photorealistic.
Constraints: change only transition width/naturalism; preserve tile count, layout, directions, palette and flat silhouette; three complete separated diamonds; fourth cell completely empty.
Avoid: any content in cell 4, straight uniform grass strips, decorative border look, sharp rectangular corners, grass on unlisted edges, swapped patterns, center emblems, flowers, rocks, footprints, props, characters, UI, text, labels, symbols, borders, grid lines, extra/missing/cropped tiles, marks outside diamonds, raised slabs, bevels, vertical sides, cast shadows, watermark.
```

## Plaza row 1 pass 1 (lineage only)

- Edit target: `source/raw/firebud-plaza-edge-autotile-v2-row-1.png`
- Output: `source/raw/firebud-plaza-edge-autotile-v3-row-1-pass-1.png`
- Generator result: `exec-3c2ab7c5-7f7e-451f-83f7-dc4a3d74538c.png`
- SHA-256: `91ab563e81154ec9b101ee1514ec6e824d8cd340835fd148b236855003e11487`
- Disposition: rejected as too conservative; retained only as the edit parent for the accepted second pass.

```text
Use case: precise-object-edit
Asset type: Firebud Village v2 production isometric plaza-to-meadow transition row 1 source, later downsampled to 80x40 per tile
Input image 1: edit target and exact layout/material reference
Primary request: preserve the exact four-tile strip and edge assignments, editing only exposed stone-to-meadow boundaries so the plaza dissolves naturally into grass instead of ending as a thin straight diamond border.
Exact invariants: preserve canvas/aspect, four equal cells, one centered complete flat 2:1 diamond per cell, positions/sizes, uniform solid #FF00FF outside, perfectly flat ground, warm honey-beige irregular paving, and exact patterns left to right: cell 1 northwest only; cell 2 northeast only; cell 3 northwest+northeast only; cell 4 southwest only. Every unlisted edge must remain clean connected paving to that edge.
Required edit: widen only each listed exposed edge into an irregular 30–42% meadow transition. Break the paving edge into an organic silhouette: muted sage meadow pushes inward in broad asymmetric fingers; a few flat half-buried border stones and small stone fragments taper into grass; moss softly enters joints; use concave bites and staggered stone termination, not a parallel strip. Keep a broad quiet walkable paving core and legibility at 80x40. Grass color/value should remain compatible with the existing Firebud meadow.
Style/medium: polished original clean-HD hand-painted 2D game texture, broad readable stones, restrained joints and low noise, not pixel art or photorealistic.
Constraints: change only transition width/naturalism; preserve exact tile count/layout/directions/palette/flat silhouette; all four diamonds complete and separated; all border stones remain painted flat into the surface.
Avoid: straight grass bands, ruler-straight stone termination, rectangular/hard corners, grass on unlisted edges, swapped patterns, raised rocks, raised slab, bevel thickness, vertical side faces, cast shadows, outlines, flowers, footprints, props, characters, UI, text, labels, symbols, borders, grid lines, extra/missing/cropped tiles, marks in backdrop, watermark.
```

## Plaza row 1 accepted pass 2

- Edit target: `source/raw/firebud-plaza-edge-autotile-v3-row-1-pass-1.png`
- Output: `source/raw/firebud-plaza-edge-autotile-v3-row-1.png`
- Generator result: `exec-153405ae-f7ef-4b6f-be53-dcea832bc24d.png`
- SHA-256: `f9aa9faa5d7ade260c01541e7fe9bc7f08fbe315b926105ac43f7a0ca3b08d3f`

```text
Use case: precise-object-edit
Asset type: second corrective edit of Firebud plaza-to-meadow transition row 1, later reduced to 80x40 per tile
Input image 1: edit target; preserve its exact layout and edge assignments
Primary request: the previous edit is still too conservative. Make only the designated stone-to-meadow boundaries substantially wider, more broken and more organic so the transition is unmistakable after heavy downsampling.
Exact invariants: keep the four equal cells, exact diamond positions/sizes, flat 2:1 ground silhouettes, pure uninterrupted #FF00FF backdrop, honey-beige paving style, and patterns left to right: northwest only; northeast only; northwest+northeast only; southwest only. No meadow may invade an unlisted edge, and connected paving must reach each unlisted edge.
Required correction: designated exposed edges must now consume a visibly broad 40–52% edge zone. Push muted sage meadow inward with large uneven bays; end paving stones in a staggered broken line; let several flat half-buried stones and small fragments scatter into the meadow; add restrained moss in joints. Keep at least a calm connected central paving core, but remove the parallel border-band look. The stone termination should wander, with 2–3 deep concave bites per exposed edge and different silhouettes per cell.
Constraints: edit only designated transition zones; maintain flat walkable ground, original palette family and complete separated diamonds.
Avoid: subtle/narrow change, straight parallel grass ribbon, ruler-straight stone edge, hard diamond-border look, meadow on unlisted edges, swapped patterns, raised stones/slabs, bevels, vertical sides, cast shadows, flowers, props, actors, UI, text, labels, symbols, borders, grid lines, extra or cropped tiles, any mark outside diamonds, watermark.
```

## Plaza row 2

- Edit target: `source/raw/firebud-plaza-edge-autotile-v2-row-2.png`
- Style reference: `source/raw/firebud-plaza-edge-autotile-v3-row-1.png`
- Output: `source/raw/firebud-plaza-edge-autotile-v3-row-2.png`
- Generator result: `exec-d1dfe25d-3aa0-4b90-96c5-b79da29ca350.png`
- SHA-256: `3f908c02c17ed9e616310a1619ea620922aab9cd1de80d083452de0fdc916420`

```text
Use case: precise-object-edit
Asset type: Firebud Village v2 production isometric plaza-to-meadow transition row 2 source, later reduced to 80x40 per tile
Input image 1: edit target and exact row-2 direction/layout source
Input image 2: accepted revised row-1 transition-width and natural-boundary style reference only
Primary request: preserve Image 1 layout and exact direction assignments, but widen and naturalize only its exposed stone-to-meadow boundaries to match the strong broken transition language of Image 2.
Exact invariants: four equal cells; complete centered flat 2:1 diamonds; exact positions/sizes; pure uniform #FF00FF backdrop; honey-beige irregular flat paving; exact patterns left to right: cell 1 northwest+southwest only; cell 2 northeast+southwest only; cell 3 northwest+northeast+southwest only; cell 4 southeast only. Unlisted edges must remain clean connected paving to the edge.
Required edit: each designated exposed edge gets a broad 40–52% organic transition zone. Muted sage meadow makes large uneven inward bays; paving ends in staggered broken contours with several flat half-buried stones/fragments tapering into grass; restrained moss enters joints. Use 2–3 deep concave bites per exposed edge and varied silhouettes. Keep a connected, quiet paving core to every unlisted edge and legibility at 80x40.
Style/medium: match Image 2 and existing Firebud clean-HD hand-painted ground art, broad readable stones, low noise, flat surface.
Avoid: narrow/subtle change, straight parallel grass ribbon, ruler-straight stone termination, hard diamond-border look, grass on unlisted edges, swapped patterns, raised rocks/slabs, thickness, bevels, vertical faces, shadows, flowers, props, actors, UI, text, labels, symbols, grid lines, extra/missing/cropped tiles, backdrop marks, watermark.
```

## Plaza row 3

- Edit target: `source/raw/firebud-plaza-edge-autotile-v2-row-3.png`
- Style reference: `source/raw/firebud-plaza-edge-autotile-v3-row-1.png`
- Output: `source/raw/firebud-plaza-edge-autotile-v3-row-3.png`
- Generator result: `exec-36777d1f-c74e-4b01-832e-5af9f2243a02.png`
- SHA-256: `339f0af3366c4da375c3baef2f8c552ddfb7a7a20001a74e772d0dbb1fdb93cd`

```text
Use case: precise-object-edit
Asset type: Firebud Village v2 production isometric plaza-to-meadow transition row 3 source, later reduced to 80x40 per tile
Input image 1: edit target and exact row-3 direction/layout source
Input image 2: accepted revised transition-width and natural-boundary style reference only
Primary request: preserve Image 1 layout and exact direction assignments, but widen and naturalize only exposed stone-to-meadow boundaries to match Image 2.
Exact invariants: four equal cells; complete centered flat 2:1 diamonds; exact positions/sizes; pure uniform #FF00FF backdrop; honey-beige irregular flat paving; exact patterns left to right: cell 1 northwest+southeast only; cell 2 northeast+southeast only; cell 3 northwest+northeast+southeast only; cell 4 southwest+southeast only. Unlisted edges remain clean connected paving to the edge.
Required edit: each listed exposed edge gets a broad 40–52% organic transition zone. Muted sage meadow creates large uneven inward bays; paving ends in staggered broken contours with flat half-buried stones/fragments tapering into grass; restrained moss enters joints. Use 2–3 deep concave bites per exposed edge and varied silhouettes. Keep a connected quiet paving core to every unlisted edge and strong 80x40 legibility.
Style/medium: match Image 2 and existing Firebud clean-HD hand-painted flat ground art, broad readable stones, low noise.
Avoid: narrow/subtle change, straight grass ribbon, ruler-straight stone edge, hard diamond-border look, grass on unlisted edges, swapped patterns, raised rocks/slabs, thickness, bevels, vertical faces, shadows, flowers, props, actors, UI, text, labels, symbols, grid lines, extra/missing/cropped tiles, backdrop marks, watermark.
```

## Plaza row 4

- Edit target: `source/raw/firebud-plaza-edge-autotile-v2-row-4.png`
- Style reference: `source/raw/firebud-plaza-edge-autotile-v3-row-1.png`
- Output: `source/raw/firebud-plaza-edge-autotile-v3-row-4.png`
- Generator result: `exec-1f440499-2cec-4add-8f82-6cbc934d7cf9.png`
- SHA-256: `10a1d944a8780a58d670693596af96dcb4d3dbe0eed5844a251420b10d43dbb2`

```text
Use case: precise-object-edit
Asset type: Firebud Village v2 production isometric plaza-to-meadow transition row 4 source, later reduced to 80x40 per tile
Input image 1: edit target and exact row-4 direction/layout source
Input image 2: accepted revised transition-width and natural-boundary style reference only
Primary request: preserve Image 1 layout and exact direction assignments, but widen and naturalize only exposed stone-to-meadow boundaries to match Image 2.
Exact invariants: four equal cells; complete centered flat 2:1 diamonds in cells 1–3 at exact positions/sizes; cell 4 entirely empty pure uniform #FF00FF; honey-beige irregular flat paving; exact patterns: cell 1 northwest+southwest+southeast only; cell 2 northeast+southwest+southeast only; cell 3 all four edges; cell 4 no tile and no mark. Every unlisted edge remains clean connected paving to the edge.
Required edit: each listed exposed edge gets a broad 40–52% organic transition zone. Muted sage meadow creates large uneven inward bays; paving ends in staggered broken contours with flat half-buried stones/fragments tapering into grass; restrained moss enters joints. Use 2–3 deep concave bites per exposed edge and varied silhouettes. Keep a calm clearly connected paving island/core in the all-four-edge cell and strong 80x40 legibility.
Style/medium: match Image 2 and existing Firebud clean-HD hand-painted flat ground art, broad readable stones, low noise.
Avoid: any content in cell 4, narrow/subtle change, straight grass ribbon, ruler-straight stone edge, hard diamond-border look, grass on unlisted edges, swapped patterns, raised rocks/slabs, thickness, bevels, vertical faces, shadows, flowers, props, actors, UI, text, labels, symbols, grid lines, extra/missing/cropped tiles, backdrop marks, watermark.
```
