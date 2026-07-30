# Backpack Awakened V1 — Equipment Atlas Prompt

- Generator: OpenAI built-in `image_gen`
- Generated: 2026-07-30
- Use: original Beastbound Odyssey production UI equipment icons
- Output source: `equipment_atlas_source.png`
- Runtime copy: `../../runtime/items/equipment_atlas.png`
- Canvas: 1254 × 1254 px
- Grid: 6 columns × 6 rows
- Cell: 209 × 209 px
- Ordering: `client/godot/data/equipment_items.json` row-major

## Final prompt

```text
Use case: stylized-concept
Asset type: production game UI equipment icon atlas for a 2D prehistoric-fantasy MMORPG
Primary request: Create one ORIGINAL square icon atlas with EXACTLY 6 equal columns x 6 equal rows (36 cells), row-major. The grid geometry must be perfectly regular and aligned. Do not draw text, numbers, labels, logos, watermarks, UI badges, rarity frames, or visible cell borders. Each cell has the same deep charcoal carved-stone square background, with the object centered, isolated, fully visible, and at least 14% padding from every cell edge. Hand-painted polished 2D game icons with crisp silhouettes, readable at 64-96 px, subtle warm rim light, controlled highlights, no photorealism, no commercial-game copying.

EXACT cell contents, left-to-right then top-to-bottom:
ROW 1: (1) small red-orange fire-sprout tribal charm on braided cord, (2) slim bronze wind-swirl ring with pale jade bead, (3) simple tan leather cap with stitched edge, (4) long wooden training spear with flint tip, (5) folded teal-blue water-ripple cloth tunic, (6) compact chipped gray stone dagger with hide-wrapped grip.
ROW 2: (7) pair of brown beast-hide fingerless gloves, (8) pair of woven straw ankle boots, (9) green dew-grass headband with one blue dew gem, (10) gnarled blessed wooden club with one warm golden leaf charm, (11) dark green poison-vine wrapped cloth tunic, (12) pair of pale mist-grass sandals with cool blue ribbons.
ROW 3: (13) plain sturdy wooden club, (14) primitive gray stone axe with wooden haft, (15) curved ivory bone blade, (16) heavier ritual bone axe carved with one glowing spiral motif, (17) dense dark hardwood war club, (18) rugged brown beast-hide vest.
ROW 4: (19) reinforced stitched hide vest with visible cross-stitching, (20) cream ceremonial grace cloth armor with three small turquoise feather ornaments, (21) aqua moisturizing water charm with three bead drops, (22) brighter cream-and-gold ceremonial grace cloth armor with five feather ornaments, (23) ornate aqua moisturizing water charm with five bead drops, (24) red-orange flame-pattern trial spear with black flint point.
ROW 5: (25) pair of sleek pale-green gale trial boots with feather fins, (26) circular four-spirit tribal charm divided into fire-red water-blue earth-gold wind-green quadrants, (27) black-violet recurved bow with spectral shadow feathers and several arrowheads, (28) sealed amber person-experience pill capsule in a tiny stone-and-hide reliquary with a crimson cord, (29) tiny empty pale-gray beginner experience pill capsule, (30) filled cyan-blue level-131 experience pill capsule with a brighter inner glow.
ROW 6: (31) fully charged gold-orange level-140 experience pill capsule with intense but contained glow; cells (32), (33), (34), (35), (36) MUST remain completely empty, showing only the same charcoal stone background.

Style/medium: original hand-painted 2D game UI inventory icons; prehistoric tribal fantasy; rounded chunky forms; natural stone, bone, wood, hide, woven grass, cloth, bronze, and small magical crystals. Strong material differentiation and unique silhouettes. Cohesive single artist and lighting direction across all 31 objects.
Composition/framing: exact orthographic 6x6 atlas, square canvas, consistent scale per category, centered objects, generous internal padding, no object crosses its cell. Paired gloves/boots count as one icon within one cell. Clothes displayed as compact folded/front-facing inventory silhouettes, not worn by characters.
Lighting/mood: warm upper-left key light with gentle cool magical accents; clear contrast against charcoal stone; no cast shadows extending beyond each cell.
Color palette: deep charcoal stone backgrounds; earthy leather/bone/wood; controlled teal, fire-orange, jade-green, violet, and gold magical accents.
Constraints: EXACTLY 36 equal cells and the listed order; exactly 31 object icons; last five cells empty; no humans, animals, hands holding objects, extra props, duplicate objects, scenery, text, numerals, letters, logos, watermark, border, frame, tag, badge, lock, level marker, or rarity color panel. Every icon remains legible when the atlas is downscaled.
Avoid: commercial-game imitation, glossy mobile casino rendering, 3D plastic look, photorealism, clutter, overlapping neighboring cells, perspective grid distortion, irregular row heights, extra decorative text or symbols.
```
