# 图鉴底板生成提示

- 生成方式：Codex 内置 ImageGen（参考图转换，不使用 CLI/API 降级）。
- 生成结果：`019fbf19-529f-7b93-879c-c023b0dfd23a/exec-162bcf66-5fac-41a9-9d79-4541c9e90086.png`。
- 参考图角色：只用于三栏层级、暗木暖金材质和弹层留白方向；不得复制外部游戏资产。

```text
Use case: ui-mockup
Asset type: original 1280x720 raster backdrop for a PC fantasy pet codex screen in Beastbound Odyssey
Input image: reference only for layout hierarchy and warm prehistoric-fantasy material direction
Primary request: transform the reference into an EMPTY, ORIGINAL 16:9 game UI backdrop. Keep the broad three-column composition: a dark carved-wood header band; an empty narrow framed family column on the left; one large empty framed content panel spanning center and right; an empty lower inset strip inside the center region. Make it suitable for live Godot controls placed on top.
Style/medium: polished hand-painted 2D game UI, dark walnut wood, warm amber-gold carved trim, subtle hide and parchment texture, soft leaf accents only in far top corners, original Beastbound visual language
Composition/framing: exact full-screen 16:9 landscape, safe margins for 1280x720. Left family frame approximately x145-380 and y76-672. Main frame approximately x390-1130 and y76-672. Keep all frame interiors empty and low-contrast.
Lighting/mood: warm, cozy, collectible, premium but readable
Color palette: near-black brown, charcoal, walnut, muted bronze, parchment tan, small moss-green leaf accents
Materials/textures: carved walnut, worn hide, aged parchment, muted bronze trim
Constraints: no text, no letters, no numbers, no logos, no trademark, no paw mark, no question mark, no close icon, no buttons, no pets, no characters, no portraits, no eggs, no skill icons, no locks, no gauges, no charts, no ornaments inside usable content areas. Do not copy any identifiable source-game asset. Use fresh carvings and original trim shapes. Keep the center and right content regions clean enough for runtime UI.
Avoid: baked labels, blurry pseudo-text, duplicated frames, excessive highlights, gradients that reduce text contrast, decorative clutter in content slots, watermarks
```
