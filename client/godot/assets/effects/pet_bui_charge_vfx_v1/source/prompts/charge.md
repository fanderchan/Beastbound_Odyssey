# 布伊冲撞叶土蓄力尾迹母表

## 生成提示

```text
Use case: stylized-concept
Asset type: production 2D game directional charge-wake VFX sprite sheet for Beastbound Odyssey
Primary request: create exactly one coherent four-frame leaf-and-earth charging wake animation in a 2x2 grid, read top-left, top-right, bottom-left, bottom-right; canonical travel direction is left to right
Frame sequence: 1 a low compact smear of dark earth dust and two small leaves gathering behind an unseen creature; 2 a longer grounded moss-green and ochre brush wake; 3 peak forward-driving wake with tapered hand-painted streaks, several leaves and small clay chips, still low to the ground; 4 a thin fading trail with drifting leaves and dust
Style/medium: polished hand-painted HD 2D RPG effect, organic brush texture, crisp gameplay-readable silhouette, matching painted pet sprites and grassy battlefield; not pixel art, not flat vector geometry, not photorealistic
Composition: one low horizontal directional effect centered in each invisible cell, same ground anchor and scale, effect occupies 55-65% of the cell width and no more than 40% of its height, generous safe padding, no creature or character
Color palette: deep forest green, moss green, dark umber, warm ochre, muted golden yellow; no neon
Background: 100% solid flat #FF00FF magenta across the entire sheet, no gradient or shadow on the background
Constraints: exactly 2 rows and 2 columns; no visible boxes, dividers, borders or frame lines; no text, labels, numbers, UI, circles, magic runes, rings, star icons, lens flare, checkerboard, watermark; nothing crosses a cell edge; every particle remains tightly grouped with its own wake
```

## 最终洋红底与安全区修订提示

```text
Use case: precise-object-edit
Asset type: production 2D directional charge-wake VFX sprite sheet
Primary request: preserve the same four left-to-right leaf-and-earth wake paintings and 2x2 order, replace only the entire background with perfectly uniform solid flat #FF00FF magenta, and scale/recenter each full effect to about 82% so it has safe padding
Layout: exact 2 rows by 2 columns on the existing 1536 by 1024 canvas; each invisible cell is 768 by 512 pixels; keep the common low ground anchor; guarantee at least 55 pixels of untouched magenta on every side of every cell
Preserve: painterly shapes, animation progression, direction, green leaves, earth chips, ochre dust, organic brushwork and relative particle positions
Background constraints: remove all black, brown, green glow, haze, vignette, gradient and shadow belonging to the old background; every pixel outside the effect silhouettes must be the exact same flat #FF00FF
Constraints: nothing crosses or touches a cell edge; no leak between cells; no visible boxes, dividers, guides, lines, text, labels, UI, watermark, checkerboard or extra objects; do not reorder or add frames
```
