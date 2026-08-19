# Firebud path edge transitions v1

Create a brand-new original production source sheet for a Godot 4 clean-HD 2.5D isometric prehistoric-fantasy MMORPG. This is a terrain tileset source, not a scene and not a copy of any existing game.

Canvas: a strict exact 2x2 grid of four equal square cells. Do not draw grid lines or dividers. Each cell contains exactly one complete, centered, perfectly flat 2:1 isometric rhombus tile with generous clean spacing from every cell edge. All four rhombuses must have the same silhouette, size, camera, and position within their cells.

Shared tile material: a muted warm terracotta-ochre compacted footpath covering the full diamond, with broad quiet hand-painted color shapes and very restrained granular variation. Premium clean hand-painted HD 2D game asset, rounded prehistoric-fantasy material language, low texture noise, readable after heavy downsampling to 80x40, not pixel art and not photorealistic. The tile surface is flat: no thickness, no bevel, no vertical soil sides, no cast shadow, no dark outline around the diamond.

Each tile is a directional grass-invaded path boundary tile. Add an irregular narrow band of warm muted olive and sage meadow grass entering only 10-18% inward from the designated diamond edge, with a few broad grass blades and softly feathered soil/grass mottling. Keep the center mostly clean ochre and keep the other three edges mostly ochre so these tiles can join an interior path.

Exact row-major directions:

- top-left cell: grass invades from the northwest / upper-left sloping diamond edge only;
- top-right cell: grass invades from the northeast / upper-right sloping diamond edge only;
- bottom-left cell: grass invades from the southwest / lower-left sloping diamond edge only;
- bottom-right cell: grass invades from the southeast / lower-right sloping diamond edge only.

Backdrop: perfectly flat, uniform solid `#FF00FF` chroma-key across every area outside the four diamonds. No gradient, checkerboard, texture, floor plane, reflection, or shadows on the backdrop. Do not use `#FF00FF` anywhere inside the tiles.

Constraints: exactly four isolated full rhombus tiles; no extra swatches, no props, flowers, rocks, footprints, tracks, buildings, trees, characters, NPCs, pets, UI, text, symbols, labels, numbers, watermarks, borders, annotations, grid dividers, perspective square platforms, raised edges, cropped tiles, or salient center emblems. Preserve broad commercial-game readability and natural irregularity without noisy microdetail.

Accepted generated output:

- generation call: `exec-4b6f5fe9-bfb2-4f99-b14f-5bd791fcd932`
- raw source: `source/raw/firebud-path-edge-transitions-v1.png`
- generated at: `2026-08-19`
- input references: none; prompt-only original generation
