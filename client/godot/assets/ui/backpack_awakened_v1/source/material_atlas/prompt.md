# Backpack Awakened V1 — Material Atlas Prompt

- Generator: OpenAI built-in `image_gen`
- Generated: 2026-07-31
- Use: original Beastbound Odyssey production UI material and quest-item icons
- Output source: `material_atlas_source.png`
- Runtime copy: `../../runtime/items/material_atlas.png`
- Canvas: 1000 × 800 px
- Grid: 5 columns × 4 rows
- Cell: 200 × 200 px
- Ordering: explicit row-major mapping in `manifest-part.json`

## Final generation prompt

```text
Use case: stylized-concept
Asset type: production 2D game inventory material-icon atlas for an original prehistoric-fantasy MMORPG
Primary request: Create one STRICT 5-column by 4-row sprite atlas, exactly 20 equal square cells in row-major order. Keep the grid invisible: no drawn borders, no separators, no labels. Place exactly one centered object in cells 1-11 and leave cells 12-20 completely empty except for the same background. Objects must not cross cell boundaries.
Canvas/composition: landscape 5:4 atlas; 5 equal columns and 4 equal rows; every occupied object centered with generous padding, consistent apparent scale, 3/4 front view, crisp silhouette suitable for a 96px UI icon.
Cell mapping, left to right then top to bottom:
Row 1: (1) glowing primordial resonance beast core, a faceted amber-and-turquoise stone heart with a subtle inner spiral; (2) thick crystal armor scale, slate stone rim with icy-cyan crystalline center; (3) elegant crescent moon tail feather, pale silver-blue with violet moon glow; (4) bundle of rough carved hardwood crafting fragments, clearly wood grain and splinters; (5) folded rugged hide/leather crafting fragments, warm brown with stitched edge.
Row 2: (6) Earth elemental trial ring, ancient stone-and-bronze ring with moss-green gem and small earth rune; (7) Water elemental trial ring, silver ring with blue wave gem and tiny droplets; (8) Fire elemental trial ring, dark bronze ring with orange-red flame gem and ember sparks; (9) Wind elemental trial ring, pale bronze ring with turquoise spiral gem and small air wisps; (10) welfare quest wooden token, compact carved wooden plaque with simple paw/sun motif, no letters.
Row 3: (11) field-notes quest item, rolled hide-paper notes tied with cord, tiny map marks but absolutely no readable writing; cells 12-15 empty.
Row 4: cells 16-20 empty.
Scene/backdrop: every cell uses the same seamless deep charcoal stone surface, nearly black with very subtle warm vignette and faint mineral texture; no frame and no cast shadow extending beyond the cell.
Style/medium: original premium hand-painted 2D game icons, warm storybook prehistoric fantasy, painterly but sharp, polished Chinese MMORPG inventory art, dimensional material rendering, readable at small size. Do not imitate or copy any existing game's exact icon.
Lighting/mood: soft warm upper-left rim light plus restrained elemental glow; rich but controlled contrast.
Color palette: dark charcoal base, amber, turquoise, slate, silver-blue, violet, natural wood/leather, and clearly distinct earth/water/fire/wind colors.
Constraints: exactly 5 columns x 4 rows; exactly 11 objects; exact mapping above; no text, no numerals, no logos, no watermark, no UI frames, no cell borders; no eggs, no certificates, no weapons, no armor, no potions; keep empty cells truly empty; consistent camera, scale, and padding.
```

## Targeted revision prompt

```text
Precise edit of the generated 5×4 material-icon atlas. Change ONLY the wooden quest token in row 2 column 5: remove the letter-like “C” glyph and replace it with a simple non-alphabetic carved four-toe paw combined with a small sunburst, containing no letters, words, numbers, or readable symbols. Preserve the token shape, wood, lighting, scale, position, every other object, all empty cells, the exact 5-column × 4-row layout, background, and overall image dimensions unchanged. No other changes.
```

## Production notes

- The selected revised image was normalized from the generated 1402 × 1122 output to 1000 × 800 so every atlas cell is exactly 200 × 200 px.
- Empty cells are intentionally reserved for future original material icons.
- Pet eggs and pet certificates are excluded because those surfaces reuse dedicated pet portraits.
- Equipment is excluded because it is supplied by the separate equipment atlas.
