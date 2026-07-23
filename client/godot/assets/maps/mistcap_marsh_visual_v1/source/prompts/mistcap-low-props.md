# Mistcap Marsh low props source prompt

- Review state: `owner_review_pending`
- Generated: `2026-07-23`
- Tool: OpenAI built-in `image_gen`
- Intent: new raster generation with local ground art as palette/style reference
- Reference: `client/godot/assets/maps/mistcap_marsh_visual_v1/source/generated/mistcap-ground-sheet-v1.png`
- Original built-in output: frozen as `../generated/mistcap-low-props-sheet-v1.png`; the tool cache path is intentionally not part of the portable bundle.
- Project source copy: `client/godot/assets/maps/mistcap_marsh_visual_v1/source/generated/mistcap-low-props-sheet-v1.png`
- Project source SHA-256: `d6d8438b7826dd6c86e67baf60301942f9ffbcbe79421a387d1fbbccfd8d7e6d`
- Processing: none; the project copy is byte-identical to the generated PNG.

## Prompt

```text
Use case: stylized-concept
Asset type: Beastbound Odyssey isometric low environmental prop source sheet for mistcap_marsh_visual_v1
Input image: use the provided Mistcap ground sheet only as the exact palette, wet-material, brushwork, lighting, and isometric-camera reference; do not copy its tile shapes or composition.
Primary request: create exactly four separate low-profile marsh props arranged as a clean 2x2 sheet, one prop centered in each quadrant: TOP LEFT a compact cluster of reeds; TOP RIGHT one low moss-covered rock; BOTTOM LEFT a small cluster of pale cream mushrooms; BOTTOM RIGHT one short low fallen log with damp bark and a little moss.
Scene/backdrop: perfectly flat, uniform pure bright magenta #FF00FF over the entire background, including all outer borders and all empty space between props. No gradient, texture, floor plane, horizon, vignette, frame, dividers, labels, or lighting variation in the background.
Style/medium: original hand-painted polished 2.5D game art, matching the reference's moist blue-green, moss-green, and earthy-brown palette; readable at gameplay scale; softly textured but not photorealistic.
Composition/framing: consistent isometric front three-quarter view for all four props; each prop fully visible, isolated, compact, centered in its own quadrant, with generous magenta separation and no overlap. Preserve a clear center-bottom ground-contact anchor for every prop. Keep all props low enough not to hide player or NPC sprites.
Lighting/mood: soft diffuse humid daylight, consistent light direction across all four props.
Shadows: a small compact contact shadow directly under each prop only; no long cast shadows.
Constraints: exactly four props and no extras; one prop per quadrant; no characters, people, NPCs, players, pets, creatures, buildings, houses, gates, signs, large trees, UI, text, symbols, watermark, border, grid line, tile base, terrain patch, or scenery backdrop. Do not place #FF00FF inside the props. No cropped elements. Original design, not copied from StoneAge or any existing game.
```
