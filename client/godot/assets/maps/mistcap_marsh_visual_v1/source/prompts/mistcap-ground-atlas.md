# Mistcap Marsh Ground Atlas — Source Prompt

- 生成日期：2026-07-23
- 工具：OpenAI Codex built-in `image_gen.imagegen`
- 模型：built-in image generation（工具未公开具体模型标识）
- 用例：`stylized-concept`
- 状态：`owner_review_pending`
- 发布批准：`false`
- 运行时启用：`false`
- 原始文件：`../generated/mistcap-ground-sheet-v1.png`
- SHA-256：`68bd759a7abb6976ce06dfc139d23231e86d0e87847d73df2ca3cffbf1c43744`

## 完整原始提示词

```text
Use case: stylized-concept
Asset type: production source sheet for an isometric 2.5D Godot game terrain atlas, later normalized to 80x40 tiles
Primary request: Create one clean 2-by-2 sprite sheet containing exactly four independently usable FLAT ground-surface tiles for the original Beastbound Odyssey region "Mistcap Marsh".
Scene/backdrop: one perfectly uniform solid bright chroma-key magenta #FF00FF background across the entire canvas, with no gradient, texture, vignette, lighting variation, frame, panel, or separator.
Subject and exact reading order, left-to-right then top-to-bottom:
1) top-left: damp moss grass — layered blue-green moss and short wet grass, a few tiny warm earthy flecks;
2) top-right: muddy footpath — compact wet brown mud with subtle shallow footprints/ruts and mossy edging painted only within the diamond;
3) bottom-left: shallow blue-green bog water / mud pool — calm opaque teal-blue-green marsh water, restrained soft ripples and darker submerged mud patches, suitable for a blocked terrain cell;
4) bottom-right: dense reed encounter ground — mossy wet ground densely textured with short cut reeds, cattail bases and trampled vegetation, all vegetation kept very low and contained inside the diamond, readable as an encounter-rich tile.
Style/medium: original warm hand-painted fantasy 2.5D game art; approachable creature-adventure RPG; painterly texture with clean silhouette; cohesive material language across all four tiles; no imitation of any existing franchise or copyrighted map.
Composition/framing: square canvas divided conceptually into four equal quadrants; exactly one centered tile per quadrant; every tile is a strict flat top-face-only 2:1 isometric diamond (width exactly twice apparent height), same apparent dimensions and angle; generous uninterrupted magenta gutters between tiles and around the outer border; each diamond fully visible and isolated; optimized to remain readable after downscaling to exactly 80x40 pixels.
Lighting/mood: soft diffuse ambient daylight painted into the surface texture only; no directional cast shadows and no shadows outside any diamond.
Color palette: misty teal, blue-green moss, muted olive reeds, wet umber mud, small warm earth accents; do not use magenta in any tile.
Materials/textures: tactile moss, damp soil and still marsh water, but all relief must be shallow and purely surface-painted.
Text: none.
Constraints: exactly four tiles and no extra objects; strict flat top plane only; every pixel of artwork must remain inside its own diamond; clean continuous diamond perimeter; equal scale; no actors, people, creatures, buildings, signs, UI, labels, numbers, logos, watermark, border, grid lines, shadows, reflections, glow, fog, particles, or scenery outside the diamonds.
Avoid: raised slabs, thickness, vertical sidewalls, cliff faces, beveled blocks, platforms, pedestals, 3D extrusions, high reeds, tall cattails, bushes, trees, rocks protruding upward, props, overlapping quadrants, cropped corners, perspective distortion, hexagons, squares, circles, photorealism, pixel art.
```

## 原稿自审

- 2x2 阅读顺序正确：湿润苔草、泥泞小径、浅蓝绿色沼水、浓密低矮芦苇遇敌地表。
- 四格均为孤立、无侧壁的平面菱形；未生成角色、建筑、文字或跨格投影。
- 亮洋红背景连续，四格之间留有足够后处理间距。
- 原稿纹理层次在缩至 80x40 前仍需由地图管线完成色键移除、几何归一化与最终像素级验收。
- 该原稿尚未获得项目所有者视觉批准，不得直接作为正式运行时发布资产。
