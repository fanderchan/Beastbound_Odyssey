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
