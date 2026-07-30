# Backpack Awakened V1 — Currency Atlas Prompt

- Generator: OpenAI built-in `image_gen`
- Generated: 2026-07-31
- Use: original Beastbound Odyssey backpack-header currency icons
- Source output: `source.png`
- Runtime output: `../../runtime/common/currency_atlas.png`
- Runtime canvas: 1024 × 512 px with alpha
- Grid: 2 columns × 1 row
- Cell: 512 × 512 px
- Ordering: left `stoneCoins`, right `diamonds`

## Final generation prompt

```text
Use case: stylized-concept
Asset type: production 2D game UI currency-icon atlas for an original prehistoric-fantasy MMORPG
Primary request: Create one STRICT 2-column by 1-row sprite atlas containing exactly two isolated currency icons. The left half contains one warm ancient stone/shell coin; the right half contains one blue-white crystal diamond. These must be original designs and must not imitate or copy an existing game's exact icon.
Scene/backdrop: a perfectly flat, solid #00ff00 chroma-key background across the entire canvas for later background removal. The background must be one uniform color with no shadows, gradients, texture, floor plane, reflections, or lighting variation.
Subject, left cell: one compact circular currency token combining honey-gold weathered stone and shell material, subtle concentric hand-carved grooves and a tiny abstract sun/paw indentation that is not a letter, number, logo, or readable symbol; warm amber highlights; strong round silhouette.
Subject, right cell: one compact faceted blue-white crystalline diamond, broad readable silhouette with icy cyan center, pearl-white highlights, restrained turquoise inner glow; opaque gemstone illustration, no glass transparency.
Style/medium: premium original hand-painted 2D game inventory icons, warm storybook prehistoric fantasy, dimensional painterly materials with crisp edges, polished Chinese MMORPG UI readability, suitable at 28-48 px.
Composition/framing: exact 2:1 landscape canvas divided invisibly into two equal square cells; one object centered in each cell; matched apparent scale; generous and equal padding; each object contained fully inside its own half; no crossing the center line; no drawn divider, no frames, no labels.
Lighting/mood: soft warm upper-left rim light on the coin, cool upper-left crystalline highlights on the diamond; vivid but controlled contrast.
Constraints: exactly two icons and no other objects; perfectly clean silhouette; no cast shadow, no contact shadow, no reflection; no text, no numerals, no logos, no watermark, no UI frames, no cell borders, no sparkles outside silhouettes; do not use #00ff00 anywhere inside either subject; preserve generous padding for clean chroma-key removal.
```

## Production notes

- The built-in output was an exact 2:1 image at 1774 × 887 px.
- The flat chroma key was removed locally with the ImageGen skill helper using border sampling, soft matte, despill, and a one-pixel edge contraction.
- The transparent result was normalized to 1024 × 512 px, preserving two exact 512 × 512 cells.
- No reference image or commercial game pixel was supplied to the generator.
