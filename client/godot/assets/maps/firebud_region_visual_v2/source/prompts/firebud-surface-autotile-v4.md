# Firebud surface autotile v4 generation ledger

Generated with the built-in OpenAI `image_gen` precise-edit workflow on 2026-08-23. All results are original project-owned generation outputs. The exact edited parents are retained in `source/raw`; the final accepted rows are chroma-keyed and assembled deterministically. W008 changes only the low-frequency path/plaza-to-meadow boundary artwork. It does not change the 15-signature topology, 80×40 runtime tile size, atlas builder, mask expansion, feather radius, map JSON, collision, navigation, warps, or protected cells.

## 1. Path row 1 — accepted

- Result: `source/raw/firebud-path-edge-autotile-v4-row-1.png`
- Generation call: `exec-4a441a8f-ee22-4218-b433-444a3fa262e7`
- Generated at: `2026-08-23T13:56:04.286Z`
- SHA-256: `9fae804f8f5abc4ab1ea030b204220920a73247d507db7164920415ae9af8e6c`
- Input: `source/raw/firebud-path-edge-autotile-v3-row-1.png`
- Disposition: accepted for runtime

```text
Use case: precise-object-edit
Asset type: Firebud Village v2 production isometric path-to-meadow autotile row 1, source art later reduced to 80x40 per tile
Input image 1: edit target and exact four-cell layout, material, palette, geometry, and direction reference
Primary request: re-author only the terracotta-to-meadow boundary. The current boundary is a narrow, nearly parallel grass fringe and still reads as a diamond grid at runtime. Replace it with unmistakably organic low-frequency terrain silhouettes that survive heavy downsampling: broad asymmetric meadow bays, rounded concave bites, and irregular terracotta tongues with strongly varying depth. This is new boundary art, not mask dilation or feathering.
Exact invariants: preserve the same 1774x887-style horizontal canvas and four equal cells; one centered complete flat 2:1 diamond in each cell at the same position and size; solid uniform chroma magenta outside every diamond; no thickness, side faces, shadows, labels, text, props, actors, or UI. Preserve edge identities left to right exactly: cell 1 northwest only; cell 2 northeast only; cell 3 northwest+northeast only; cell 4 southwest only. Every unlisted edge must remain continuous terracotta all the way to that edge so tiles connect.
Required boundary language: on every listed exposed edge, meadow must occupy a non-parallel 42-64% transition depth with two or three large smooth bays and one or two terracotta peninsulas; vary the effective road width visibly within each tile. Use broad calm shapes first, then only a few restrained grass tufts and worn-earth speckles. The silhouette must not trace the diamond edge as a ribbon. Keep a connected, quiet walkable terracotta core and exactly preserve every unlisted connection.
Style/medium: original clean-HD hand-painted 2D game terrain, muted Firebud sage meadow and warm restrained terracotta, broad readable shapes, low noise, not pixel art, not photorealistic.
Constraints: edit only the transition regions; preserve all four complete separated diamonds, material family, flat ground and edge-direction semantics.
Avoid: parallel grass strips, uniform border width, ruler-straight boundaries, sharp rectangular corners, staircase/sawtooth silhouettes, fine noisy grass fringe as the main shape, grass on unlisted edges, swapped directions, disconnected terracotta, emblems, flowers, rocks, footprints, objects, characters, text, symbols, grid lines, extra/missing/cropped diamonds, background gradients or marks, bevels, raised slabs, watermark.
```

## 2. Path row 2 — accepted

- Result: `source/raw/firebud-path-edge-autotile-v4-row-2.png`
- Generation call: `exec-b9d3ff69-4275-48ad-81a7-b437afabf3f8`
- Generated at: `2026-08-23T13:56:59.891Z`
- SHA-256: `01854c30908746f7c2b3bce7e8e1dc0ec631ca54dcce15e35965a8b969ba66a1`
- Inputs: `source/raw/firebud-path-edge-autotile-v3-row-2.png`, accepted v4 path row 1
- Disposition: accepted for runtime

```text
Use case: precise-object-edit
Asset type: Firebud Village v2 production isometric path-to-meadow autotile row 2, later reduced to 80x40 per tile
Input image 1: exact row-2 edit target; preserve its four-cell layout, materials, diamond geometry, and direction assignments
Input image 2: accepted v4 row-1 boundary language and palette reference only
Primary request: re-author only the terracotta-to-meadow boundaries in Image 1 to match Image 2's broad, low-frequency organic terrain silhouette. Replace the current narrow parallel fringe with large asymmetric meadow bays, rounded concave bites, and irregular terracotta tongues. This is new boundary art, not mask dilation or feathering.
Exact invariants: preserve horizontal four-cell canvas, one centered complete flat 2:1 diamond per cell at the same position/size, uniform chroma magenta outside diamonds, no thickness or shadow. Preserve identities left to right exactly: cell 1 northwest+southwest only; cell 2 northeast+southwest only; cell 3 northwest+northeast+southwest only; cell 4 southeast only. Every unlisted edge must stay continuous terracotta all the way to that edge.
Required boundary language: each listed exposed edge has strongly variable 42-64% transition depth, with two or three large smooth bays and one or two terracotta peninsulas. Adjacent exposed edges should merge into rounded natural corners, never a diamond-following ribbon. Keep a connected calm terracotta core and all unlisted connections. Use broad shapes first and only restrained grass tufts/worn-earth speckles.
Style/medium: match Image 2; original clean-HD hand-painted Firebud terrain, muted sage meadow, warm restrained terracotta, broad readable shapes, low noise, not pixel art or photorealistic.
Avoid: parallel strips, uniform border width, straight/ruler edges, rectangular or staircase corners, fine noisy grass as main contour, grass on unlisted edges, swapped directions, disconnected terracotta, flowers, rocks, footprints, props, actors, text, labels, symbols, grid lines, extra/missing/cropped diamonds, backdrop marks, bevels, raised slabs, watermark.
```

## 3. Path row 3 — accepted

- Result: `source/raw/firebud-path-edge-autotile-v4-row-3.png`
- Generation call: `exec-9e7f090e-6523-4960-ab2b-44cc9fcfee3f`
- Generated at: `2026-08-23T13:57:47.807Z`
- SHA-256: `d6baf8158fe242418e11f55e2b022c68606397d1b1e7a8445078cf48696fabf1`
- Inputs: `source/raw/firebud-path-edge-autotile-v3-row-3.png`, accepted v4 path row 1
- Disposition: accepted for runtime

```text
Use case: precise-object-edit
Asset type: Firebud Village v2 production isometric path-to-meadow autotile row 3, later reduced to 80x40 per tile
Input image 1: exact row-3 edit target; preserve its layout, diamond geometry, materials, and direction assignments
Input image 2: accepted v4 row-1 boundary-language and palette reference only
Primary request: re-author only Image 1's terracotta-to-meadow boundaries into the same broad, low-frequency organic terrain language as Image 2. Replace narrow diamond-parallel grass fringe with large asymmetric meadow bays, rounded concave bites, and irregular terracotta tongues; this is new boundary artwork, not mask dilation or feathering.
Exact invariants: same horizontal four-cell composition, one centered complete flat 2:1 diamond per cell at same size/position, uniform chroma magenta outside, no thickness/shadow. Preserve edge identities left to right exactly: cell 1 northwest+southeast only; cell 2 northeast+southeast only; cell 3 northwest+northeast+southeast only; cell 4 southwest+southeast only. Every unlisted edge must remain continuous terracotta to that edge.
Required boundary language: on each listed edge, variable 42-64% transition depth, two or three large smooth bays plus one or two terracotta peninsulas; merge adjacent exposed edges into rounded, non-rectangular corners. Keep a connected calm terracotta core and every unlisted connection. Broad shapes first; only restrained grass tufts and worn-earth speckles.
Style/medium: match Image 2; original clean-HD hand-painted Firebud terrain, muted sage meadow, warm restrained terracotta, low noise, not pixel art or photorealistic.
Avoid: parallel strips, uniform border width, straight/ruler contours, rectangular/staircase corners, fine grass fringe as main contour, grass on unlisted edges, swapped directions, disconnected terracotta, flowers, rocks, footprints, props, actors, text, labels, symbols, grid lines, missing/cropped diamonds, backdrop marks, bevels, raised slabs, watermark.
```

## 4. Path row 4 — accepted

- Result: `source/raw/firebud-path-edge-autotile-v4-row-4.png`
- Generation call: `exec-80ead7d8-e5b5-4565-b310-5236c9d49b7e`
- Generated at: `2026-08-23T13:58:31.557Z`
- SHA-256: `8cce511403ff9b3111a480400373e13acec0316d35c38da2627f628c9f7ccfd6`
- Inputs: `source/raw/firebud-path-edge-autotile-v3-row-4.png`, accepted v4 path row 1
- Disposition: accepted for runtime

```text
Use case: precise-object-edit
Asset type: Firebud Village v2 production isometric path-to-meadow autotile row 4, later reduced to 80x40 per tile
Input image 1: exact row-4 edit target; preserve layout, geometry, materials and direction assignments
Input image 2: accepted v4 row-1 boundary-language and palette reference only
Primary request: re-author only the terracotta-to-meadow boundaries in cells 1-3 into Image 2's broad low-frequency organic terrain language. Replace narrow diamond-parallel fringe with large asymmetric meadow bays, rounded concave bites and irregular terracotta tongues. This is new boundary art, not mask dilation or feathering.
Exact invariants: same horizontal four-cell canvas; centered complete flat 2:1 diamonds in cells 1-3 at same size/position; cell 4 must remain entirely empty uniform chroma magenta with no tile, mark, shadow or texture. Preserve identities exactly: cell 1 northwest+southwest+southeast only; cell 2 northeast+southwest+southeast only; cell 3 all four edges; cell 4 blank. Every unlisted edge must remain continuous terracotta to that edge.
Required boundary language: each listed exposed edge has strongly variable 42-64% depth, two or three large smooth bays and one or two terracotta peninsulas; adjacent exposed edges merge into rounded irregular corners rather than a border ribbon. Cell 3 must retain a clearly connected, asymmetric terracotta island/core large enough to read at 80x40, but not a centered geometric diamond. Broad shapes first; only restrained tufts and worn-earth speckles.
Style/medium: match Image 2; original clean-HD hand-painted Firebud terrain, muted sage meadow, warm restrained terracotta, low noise, not pixel art or photorealistic.
Avoid: any content in cell 4, parallel strips, uniform border width, straight/ruler contours, rectangular/staircase corners, fine grass fringe as main contour, grass on unlisted edges, swapped directions, disconnected terracotta where a connection is required, flowers, rocks, footprints, props, actors, text, labels, symbols, grid lines, extra/cropped diamonds, backdrop marks, bevels, raised slabs, watermark.
```

## 5. Plaza row 1 pass 1 — rejected lineage

- Result: `source/raw/firebud-plaza-edge-autotile-v4-row-1-pass-1.png`
- Generation call: `exec-caa9b212-4fe6-4d47-9147-813da6573855`
- Generated at: `2026-08-23T13:59:18.710Z`
- SHA-256: `0db8b03b2030a1a8db16334309f8bc634d2d70da4a016af1bd321f2a59a7d78c`
- Input: `source/raw/firebud-plaza-edge-autotile-v3-row-1.png`
- Disposition: rejected; too conservative, still read as a cobble-filled diamond with narrow grass trim

```text
Use case: precise-object-edit
Asset type: Firebud Village v2 production isometric plaza-to-meadow autotile row 1, later reduced to 80x40 per tile
Input image 1: exact four-cell edit target and material/layout/direction reference
Primary request: re-author only the honey-stone-to-meadow boundary. The current edge still follows the diamond as a tidy paving border and reads as a rectangle at runtime. Replace it with a broken, low-frequency paving silhouette: large asymmetric meadow bays interrupt the paving, broad rounded concave bites cut deeply inward, and a few flat half-buried stones trail beyond the main paving edge. This is new boundary art, not dilation or feathering.
Exact invariants: preserve the horizontal four-cell canvas and one centered complete flat 2:1 diamond in each cell at the same position and size; solid uniform chroma magenta outside diamonds; perfectly flat ground with no thickness, side faces or cast shadows. Preserve edge identities left to right exactly: cell 1 northwest only; cell 2 northeast only; cell 3 northwest+northeast only; cell 4 southwest only. Every unlisted edge must remain continuous honey-stone paving all the way to that edge.
Required boundary language: each listed exposed edge must have strongly variable 48-68% transition depth with two or three large smooth meadow bays, staggered termination of the paving, one or two stone peninsulas and only a few readable half-buried fragments. Adjacent listed edges must merge into an irregular rounded corner, never a parallel diamond ribbon. Keep a connected quiet paving core and all unlisted connections. Use broad shapes that remain clear at 80x40; reduce fine repetitive cobble noise near the boundary.
Style/medium: original clean-HD hand-painted 2D Firebud terrain, muted sage meadow, warm honey-beige worn flagstone, restrained moss, broad readable shapes, low noise, not pixel art or photorealistic.
Avoid: straight/parallel grass strips, uniform border width, ruler-straight stone termination, rectangular or staircase corners, dense repetitive cobbles tracing the diamond, grass on unlisted edges, swapped directions, raised rocks or slabs, bevels, thickness, shadows, flowers, footprints, props, actors, text, labels, symbols, grid lines, extra/missing/cropped diamonds, backdrop marks, watermark.
```

## 6. Plaza row 1 corrective pass — accepted

- Result: `source/raw/firebud-plaza-edge-autotile-v4-row-1.png`
- Generation call: `exec-3b970557-1129-4651-b920-41835657b31e`
- Generated at: `2026-08-23T14:00:10.475Z`
- SHA-256: `90ef40fbfcb982ede58529f730f6144f89c3f80f6f117c313ed9142dec687e24`
- Inputs: rejected plaza row 1 pass 1, accepted v4 path row 1 shape reference
- Disposition: accepted for runtime

```text
Use case: precise-object-edit
Asset type: corrective v4 Firebud plaza-to-meadow autotile row 1
Input image 1: current plaza edit target; keep its honey-stone material, exact four cells, diamonds and direction semantics
Input image 2: shape-language reference only; copy its unmistakable large organic meadow bays and non-parallel contour logic, not its terracotta material
Primary request: the first plaza edit remains too conservative and still looks like cobbles filling a diamond with a narrow grass trim. Remove substantially more paving from only the listed exposed sides. Create the same large-scale, rounded, asymmetric meadow incursions seen in Image 2, so the surviving honey-stone area has a wandering variable-width outline rather than tracing the diamond. Keep the center and all unlisted edge connections as paving.
Exact identities left to right: northwest only; northeast only; northwest+northeast only; southwest only. Never place meadow on an unlisted edge.
Required correction: listed-edge meadow must occupy roughly half to two-thirds of that side's half-depth, with 2-3 major smooth bays at least several cobbles wide. Break the main paving edge into a staggered curve; retain only 1-3 isolated flat stones or tiny clusters inside each grass bay. Do not allow a continuous cobble ribbon to trace the exposed diamond edge. Reduce small repetitive cobble detail near the transition so the low-frequency silhouette dominates after 80x40 downsampling.
Invariants: same complete flat 2:1 diamonds and same positions, uniform chroma magenta backdrop, no raised geometry, thickness, shadows, props, text or actors.
Style: clean-HD hand-painted Firebud terrain, muted sage meadow, warm worn honey stone, restrained moss, low noise.
Avoid: subtle change, border trim, parallel strip, ruler-straight/rectangular/staircase contour, meadow on unlisted sides, swapped directions, disconnected required paving links, flowers, rocks, props, symbols, grid lines, backdrop marks, watermark.
```

## 7. Plaza row 2 pass 1 — rejected lineage

- Result: `source/raw/firebud-plaza-edge-autotile-v4-row-2-pass-1.png`
- Generation call: `exec-831fd55a-d64f-4e0e-a853-456cc595c2d6`
- Generated at: `2026-08-23T14:00:57.947Z`
- SHA-256: `9b1d508a3f846f9bacfc7670daa3b4ff7bf6e02ed4fc6439df48515a60763af6`
- Inputs: `source/raw/firebud-plaza-edge-autotile-v3-row-2.png`, accepted v4 plaza row 1
- Disposition: rejected; cell 2 did not preserve the required northeast+southwest exposed-edge signature

```text
Use case: precise-object-edit
Asset type: Firebud Village v2 production isometric plaza-to-meadow autotile row 2, later reduced to 80x40 per tile
Input image 1: exact row-2 edit target and direction/layout source
Input image 2: accepted v4 plaza row-1 palette and large-scale boundary-shape reference
Primary request: re-author only Image 1's listed honey-stone-to-meadow boundaries to match Image 2's unmistakable broad meadow bays and wandering broken paving silhouette. Remove the tidy diamond-following border; this is new boundary artwork, not dilation or feathering.
Exact identities left to right: cell 1 northwest+southwest only; cell 2 northeast+southwest only; cell 3 northwest+northeast+southwest only; cell 4 southeast only. Every unlisted edge must remain continuous honey-stone paving all the way to that edge.
Required boundary: listed-edge meadow takes roughly half to two-thirds of each side's half-depth, with 2-3 major smooth bays, staggered paving termination, one or two stone peninsulas and only 1-3 isolated flat stones/tiny clusters inside grass. Adjacent exposed sides merge into large rounded irregular corners. Keep a connected quiet paving core and all unlisted edge links. Low-frequency silhouette must dominate after 80x40 reduction.
Invariants: same four-cell horizontal canvas, same complete centered flat 2:1 diamonds and positions, uniform chroma magenta backdrop, flat surface, no thickness or shadows.
Style: match Image 2; clean-HD hand-painted Firebud terrain, muted sage meadow, warm worn honey stone, restrained moss, low noise.
Avoid: narrow trim, parallel strip, uniform width, ruler/rectangular/staircase contour, continuous cobble ribbon along exposed sides, meadow on unlisted sides, swapped patterns, raised stones/slabs, bevels, shadows, flowers, footprints, props, actors, text, symbols, grid lines, missing/cropped diamonds, backdrop marks, watermark.
```

## 8. Plaza row 2 corrective pass — accepted

- Result: `source/raw/firebud-plaza-edge-autotile-v4-row-2.png`
- Generation call: `exec-f1b3f571-23e6-4dc8-bc96-6b8cfe9966af`
- Generated at: `2026-08-23T14:01:46.392Z`
- SHA-256: `7d6f9187289171621a0f53dba2c493f53ff677fe2e7d7af12ce01de87ed60739`
- Inputs: rejected plaza row 2 pass 1, accepted v4 plaza row 1
- Disposition: accepted for runtime

```text
Use case: precise-object-edit
Asset type: corrective Firebud plaza autotile v4 row 2
Input image 1: current row-2 target; preserve its exact canvas, four diamonds, honey-stone and meadow style
Input image 2: accepted v4 plaza style reference
Primary request: correct only the edge-direction material pattern while retaining the broad organic boundary language. The four cells must have these visibly exact grass edges, described by their screen positions:
- Cell 1: grass on both left-facing sides, upper-left edge AND lower-left edge; honey paving on upper-right and lower-right edges.
- Cell 2: grass on upper-right edge AND lower-left edge; honey paving on upper-left edge AND lower-right edge. This should read as a natural diagonal paving connection from the left-upper side to the right-lower side, not one large grass half.
- Cell 3: grass on upper-left, upper-right, AND lower-left edges; honey paving reaches only the lower-right edge through a connected irregular tongue/core.
- Cell 4: grass on lower-right edge only; honey paving reaches upper-left, upper-right, and lower-left edges.
Use large rounded grass bays taking roughly half of each listed side's half-depth and a wandering broken paving silhouette. Unlisted edges must visibly remain continuous paving all the way to the side.
Invariants: same four centered flat 2:1 diamonds and sizes, uniform chroma magenta background, no raised geometry, shadows, props, text or actors.
Avoid: losing a listed grass edge, grass on an unlisted edge, swapped cells, continuous border ribbons, straight/rectangular/staircase contour, missing/cropped diamonds, backdrop marks, watermark.
```

## 9. Plaza row 3 — accepted

- Result: `source/raw/firebud-plaza-edge-autotile-v4-row-3.png`
- Generation call: `exec-1986a32e-8270-42b7-9760-5564dcdb018e`
- Generated at: `2026-08-23T14:02:52.745Z`
- SHA-256: `6cb5e312e402c2093ef1a177e144efe036f6839e4b8c386d52f6bb9563a4b874`
- Inputs: `source/raw/firebud-plaza-edge-autotile-v3-row-3.png`, accepted v4 plaza row 1
- Disposition: accepted for runtime

```text
Use case: precise-object-edit
Asset type: Firebud Village v2 production isometric plaza-to-meadow autotile row 3, later reduced to 80x40 per tile
Input image 1: exact row-3 edit target, geometry and direction reference
Input image 2: accepted v4 plaza palette and broad organic boundary reference
Primary request: re-author only the listed honey-stone-to-meadow boundaries into Image 2's large rounded meadow bays and wandering broken paving silhouette. Do not make a tidy border.
Exact visible edge patterns left to right:
- Cell 1: grass on upper-left edge AND lower-right edge; paving reaches upper-right and lower-left edges.
- Cell 2: grass on upper-right edge AND lower-right edge; paving reaches both left-facing edges.
- Cell 3: grass on upper-left, upper-right, AND lower-right edges; paving reaches only the lower-left edge through a connected irregular core/tongue.
- Cell 4: grass on lower-left AND lower-right edges; paving reaches both upper edges.
Each listed side uses 2-3 large smooth bays taking about half to two-thirds of its half-depth, staggered stone termination and only a few isolated flat stones in grass. Adjacent listed sides merge into rounded irregular corners. Every unlisted side must visibly retain continuous paving to the edge.
Invariants: same four-cell horizontal canvas, same complete centered flat 2:1 diamonds and positions, uniform chroma magenta background, flat terrain, no thickness or shadow.
Style: match Image 2; clean-HD hand-painted Firebud terrain, muted sage meadow, warm worn honey stone, restrained moss, low noise.
Avoid: parallel trim, uniform border, straight/rectangular/staircase contour, grass on unlisted sides, missing listed grass sides, swapped cells, raised slabs, props, actors, text, symbols, grid lines, cropped diamonds, backdrop marks, watermark.
```

## 10. Plaza row 4 pass 1 — rejected lineage

- Result: `source/raw/firebud-plaza-edge-autotile-v4-row-4-pass-1.png`
- Generation call: `exec-12e7d33c-b62c-41d3-88ee-b855831279ec`
- Generated at: `2026-08-23T14:03:37.065Z`
- SHA-256: `e6e2a2168ef31e562c9d837ee2bd21f7e6947290592187eb2e577116433402d0`
- Inputs: `source/raw/firebud-plaza-edge-autotile-v3-row-4.png`, accepted v4 plaza row 1
- Disposition: rejected; cell 2 paving incorrectly touched the bottom point and listed lower edges

```text
Use case: precise-object-edit
Asset type: Firebud Village v2 production isometric plaza-to-meadow autotile row 4, later reduced to 80x40 per tile
Input image 1: exact row-4 edit target and direction/layout source
Input image 2: accepted v4 plaza palette and broad organic boundary reference
Primary request: re-author only the honey-stone-to-meadow boundaries in cells 1-3 into Image 2's large rounded meadow bays and wandering broken paving silhouette. Do not make a tidy border.
Exact visible patterns:
- Cell 1: grass on upper-left, lower-left, AND lower-right edges; honey paving reaches only the upper-right edge through a connected irregular core/tongue.
- Cell 2: grass on upper-right, lower-left, AND lower-right edges; honey paving reaches only the upper-left edge through a connected irregular core/tongue.
- Cell 3: grass on all four edges; retain one clearly visible asymmetric honey-stone island/core, not a centered geometric diamond, plus at most a few isolated flat fragments.
- Cell 4: completely empty uniform chroma magenta, with no tile, mark, texture or shadow.
Each listed edge gets 2-3 large smooth bays taking about half to two-thirds of its half-depth; adjacent exposed edges merge into rounded irregular corners. The low-frequency silhouette must dominate at 80x40.
Invariants: same canvas; complete centered flat 2:1 diamonds only in cells 1-3 at same size/position; cell 4 blank; no thickness or shadow.
Style: match Image 2; clean-HD hand-painted Firebud terrain, muted sage meadow, warm worn honey stone, restrained moss, low noise.
Avoid: any content in cell 4, parallel trim, uniform border, straight/rectangular/staircase contour, grass on the sole unlisted connection edge, swapped cells, raised slabs, props, actors, text, symbols, grid lines, cropped diamonds, backdrop marks, watermark.
```

## 11. Plaza row 4 corrective pass — accepted

- Result: `source/raw/firebud-plaza-edge-autotile-v4-row-4.png`
- Generation call: `exec-76204c5b-1b8d-4b11-b582-b62f2bc68a90`
- Generated at: `2026-08-23T14:04:10.718Z`
- SHA-256: `d5c6142dea2a2f40bc56b670079c4acf618f58ddcb2f181269e3601af38927c4`
- Input: rejected plaza row 4 pass 1
- Disposition: accepted for runtime

```text
Use case: precise-object-edit
Asset type: corrective Firebud plaza autotile v4 row 4
Input image 1: edit target
Primary request: change only cell 2, the second diamond from the left. Its honey-stone tongue currently reaches the bottom point, which violates the required edge pattern. Remove the paving from the lower-left edge, bottom point, and lower-right edge and replace those areas with the same muted sage meadow. Keep a single connected irregular paving tongue that enters only from the upper-left edge and terminates well before both lower edges and before the upper-right edge. The final cell-2 pattern must be: paving touches upper-left edge only; meadow touches upper-right, lower-left, and lower-right edges.
Exact invariants: preserve cells 1, 3, and blank cell 4 unchanged; preserve canvas, diamond positions/sizes, chroma magenta backdrop, flat honey-stone and meadow style. Cell 4 stays completely blank.
Boundary: use a broad rounded irregular meadow bay around the shortened paving tip, not a straight cutoff.
Avoid: changing other cells, stone touching bottom point or either lower edge in cell 2, grass on cell-2 upper-left edge, content in cell 4, raised geometry, shadows, text, props, watermark.
```

## Deterministic post-processing contract

Each of the eight accepted rows is converted to real alpha with:

```text
python3 client/godot/assets/maps/firebud_region_visual_v2/source/tools/remove_chroma_key.py --input <accepted-row> --out <accepted-row-alpha> --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 64 --edge-contract 1 --despill
```

The four path and four plaza alpha rows are independently assembled by `source/tools/assemble_surface_autotile_sheet.py`. The assembler requires the exact 15 signature order, a blank sixteenth cell, no visible alpha touching any source cell boundary, and refuses existing outputs. The atlas then uses the unchanged `source/tools/build_ground_atlas_v4.py` v2.1.0 path: one-pixel mask expansion and 1.4-pixel feather at 80×40. No numeric transition widening was introduced in W008.
