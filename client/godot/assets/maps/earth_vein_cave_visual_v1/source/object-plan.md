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
