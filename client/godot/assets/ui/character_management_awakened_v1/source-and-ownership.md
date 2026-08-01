# 角色页加点与骑证状态图标

- 资产包：`character_management_awakened_v1`
- 生成日期：2026-08-01
- 权属：Beastbound Odyssey 项目内原创生成资产；未复制参考游戏像素或源文件。
- 生成工具：Codex 内置 `imagegen`。
- 源图：`source/stat_and_ride_icons_chromakey.png`
- 透明母版：`source/stat_and_ride_icons_transparent.png`
- 运行时图标：`runtime/icons/stat_plus.png`、`stat_minus.png`、`ride_locked.png`、`ride_owned.png`
- 替换路径：四张运行时 PNG 由 `character_management_visual_skin.gd` 独立引用，可以在不改玩法契约的前提下逐张换画。

## 生成提示词

```text
Use case: stylized-concept
Asset type: production 2D game UI icon atlas for Beastbound Odyssey
Primary request: Create one square 2x2 atlas containing exactly four large, centered, independently crop-safe UI icons. Top-left: a bold plus/add icon. Top-right: a bold minus/subtract icon. Bottom-left: a closed padlock icon for unavailable riding qualification. Bottom-right: a small ownership/check badge icon, combining a carved check mark with a short ribbon tab.
Style/medium: polished hand-painted fantasy stone-age MMORPG UI, warm carved wood, aged golden bronze rims, subtle dark brown inset, crisp readable silhouette, same premium family across all four icons.
Composition/framing: strict 2x2 grid, one icon centered in each quadrant, generous equal padding, no overlap, no labels, no words, no numbers. Each icon must remain legible at 32x32 pixels.
Lighting/mood: soft warm top-left highlight, restrained bevel, not glossy.
Color palette: dark walnut brown, sandstone tan, amber gold, muted orange; padlock may use charcoal iron.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for later removal, with no gradient, texture, shadow, reflection, floor, or lighting variation in the background.
Constraints: every icon fully separated from the magenta background; no #ff00ff inside icons; no cast shadow beyond each icon; clean anti-aliased edges; no watermark; no surrounding frame; no extra decorative objects; no text.
```

## 后处理

使用内置 chroma-key 工具移除 `#ff00ff`，再按 2×2 象限裁切、基于 alpha 紧边界居中并缩放为 128×128 PNG。运行时只加载透明成品，不加载 chroma-key 母版。
