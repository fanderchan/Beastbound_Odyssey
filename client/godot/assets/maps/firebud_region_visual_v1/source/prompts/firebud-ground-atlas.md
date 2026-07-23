# Firebud ground atlas prompts

## Initial generation

```text
Use case: stylized-concept
Asset type: production source sheet for Beastbound Odyssey isometric ground tiles
Primary request: Create exactly one 2x2 sheet of four independently painted seamless-looking isometric ground tiles for an original creature-taming RPG region called Firebud.
Composition: one tile per equal square quadrant, row-major order: (1) fresh warm meadow grass with a few low moss flecks, (2) compact ochre earth footpath, (3) pale honey sandstone village plaza paving, (4) dark root-bound rocky soil for visibly blocked ground. Every tile is a clean 2:1 diamond footprint viewed from the same 2.5D isometric camera, centered in its quadrant, with generous empty margin. All four diamonds have exactly the same apparent footprint, edge alignment, camera and top-left lighting.
Style: original clean HD hand-painted 2D game art, colorful Stone-Age-inspired creature RPG mood without copying any existing game asset or map, crisp readable materials, smooth surfaces, restrained texture noise, subtle warm sunlight, no chunky pixels.
Scene/backdrop: perfectly flat solid #FF00FF magenta everywhere outside the four tile diamonds.
Constraints: ground material only; no buildings, trees, plants taller than ankle height, rocks protruding above the tile, fences, signs, actors, NPCs, pets, shadows outside the diamond, UI, labels, grid lines, panel borders, numbers, readable text or watermark. No tile or painted mark may touch the image edge or another quadrant. Do not use #FF00FF inside the tiles.
```

The first result was rejected because it rendered raised slabs with vertical side walls. It is preserved as provenance-only history at `source/generated/history/firebud-ground-sheet-raised-v1.png` and is not used by runtime.

## Accepted targeted correction

```text
Edit the visible 2x2 Firebud ground-tile sheet with one targeted correction only: replace every thick raised slab with a perfectly FLAT top-surface-only isometric diamond. Remove all vertical side walls, cliff thickness, bevel height and cast shadows. Each accepted tile must be exactly a clean 2:1 diamond footprint (width exactly twice its height), suitable to butt edge-to-edge in an 80x40 Godot isometric grid without gaps or raised overlap. Preserve the same four material identities, row-major order, palette, clean HD hand-painted game style and top-left lighting: warm meadow grass, compact ochre earth path, pale honey sandstone plaza, dark root-bound rocky soil. Keep all four diamonds the same apparent footprint and centered within their quadrants with generous flat #FF00FF margin. Do not add borders, grid lines, labels, objects, plants taller than ankle height, actors, text or watermark. No #FF00FF inside a tile.
```

Built-in `image_gen` output: `source/generated/firebud-ground-sheet-v2.png`.
