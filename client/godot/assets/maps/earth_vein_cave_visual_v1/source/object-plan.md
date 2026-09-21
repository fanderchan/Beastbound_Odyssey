# Earth Vein Cave v1 object plan

The ground atlas and dressed reference establish style only. Runtime uses the following independently generated assets; no object is cut from the reference image.

| objectId | classification | approximate use | display intent | render layer | collision role | asset strategy |
| --- | --- | --- | --- | --- | --- | --- |
| `earth_cave_rock_pile` | compact prop | existing blocked cells beside routes | 112x96 | world | blocking | 2x2 compact pack |
| `earth_cave_crystal_cluster` | compact prop | encounter edges and mineral clearings | 88x80 | world | decorative | 2x2 compact pack |
| `earth_cave_fungus_cluster` | compact prop | damp side ground away from routes | 88x72 | world | decorative | 2x2 compact pack |
| `earth_cave_cairn` | compact prop | sparse route rhythm | 64x80 | world | decorative | 2x2 compact pack |
| `earth_cave_vein_pillar` | tall large object | existing blocked cells with front/behind traversal | 152x232 | world | blocking | one by one |
| `earth_cave_stair_arch` | wide large interaction object | floor warp endpoints with an open walk-through center | 256x224 | world | interaction | one by one |
| `earth_cave_resonance_plinth` | collision-bearing interaction object | top-floor guardian/evolution clearings | 192x112 | world | interaction | one by one |

All placements keep spawns, warps, NPC approaches, encounter access and the lower-left to upper-right critical route clear. Gameplay collision remains authoritative in the existing four map JSON files.

## Owner-directed natural cave revision (Phase611)

The owner selected option 2: revise the cave visuals before acceptance. The twelve
new ground swatches add four independent dry-floor patterns, worn-path pairs,
damp-floor pairs and a worn sanctum pair. The original six atlas cells remain
available for historical compatibility; the four current bindings use the new
material IDs. No map topology, collision, encounter or reward data changes.

Two independently generated diagonal basalt runs follow the two isometric axes.
Each floor has sixteen new off-grid wall segments plus its four existing boundary
pieces. Their empty collision footprints preserve all playable cells. The walls
use normal world depth and actor-occlusion fading, with a ground-contact anchor
at `(0.5, 0.68)`. They are independently authored images, never mirrored copies.
The same kit encloses all floors while the established cairn, fungus, crystal and
dual-plinth motifs keep their route-density hierarchy. Source prompts and raw
PNGs are retained, and both extraction and atlas normalization are reproducible.

This revision remains `owner_review_pending`. Earlier visual/performance receipts
describe the old pixels and are superseded until fresh evidence is installed.

## Four-floor presentation hierarchy

The four bindings deliberately share this original cave kit but no longer copy the same five-prop route rhythm:

| floor | role | compact route scenery | dominant read | hierarchy intent |
| --- | --- | ---: | --- | --- |
| 1 | threshold gallery | 4 | three cairns | a sparse entry with long visual rests |
| 2 | damp fungus seam | 7 | four fungus clusters | paired damp pockets break up the climb |
| 3 | compressed crystal vein | 9 | six crystal clusters | the busiest traversal floor before the objective |
| 4 | dual-resonance sanctum | 4 | two formal plinths | generic clutter falls away so both objectives dominate |

There are no resident NPC sprites in this isolated training dungeon. That role is explicitly non-applicable: the exit and stairs use formal arches, while both top-floor guardians use collision-bearing resonance plinth interactions. Adding a humanoid placeholder would duplicate those functions and weaken the cave's isolation. Any future resident character must use a formal existing appearance or the NPC production pipeline.

At the exact `1.52x` PC review profile, the player remains in the `120..150px` full-alpha band. Compact rock, crystal, fungus and cairn assets stay near player height; plinths are moderately larger; pillars, arches and boundary walls remain architecture-scale. The runtime hierarchy check measures opaque pixels rather than trusting declared boxes.
