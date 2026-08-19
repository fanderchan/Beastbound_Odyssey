# 布伊冲撞叶土命中特效母表

## 生成提示

```text
Use case: stylized-concept
Asset type: production 2D game VFX sprite sheet for Beastbound Odyssey, a hand-painted 2.5D Chinese pet MMORPG
Primary request: create exactly one coherent four-frame leaf-and-earth charge impact animation in a 2x2 grid, read top-left, top-right, bottom-left, bottom-right
Frame sequence: 1 compact contact flash with a small warm ivory core; 2 burst beginning with dark brown clay chips and a few deep-green leaves; 3 peak impact with a bright but controlled golden core, ochre dust, organic leaf fragments and chunky earth debris; 4 fading dust and drifting leaves with no central flash
Style/medium: polished hand-painted HD 2D game effect, warm organic brush texture, crisp readable silhouette, gently outlined painterly shapes, matching painted RPG sprites and grassy battlefield; not pixel art, not flat vector geometry, not photorealistic
Composition: each invisible cell contains one centered radial impact, same scale and anchor, effect occupies about 55-65% of each cell, generous safe padding, nothing crosses a cell edge
Color palette: deep forest green, moss green, dark umber, warm ochre, muted golden yellow, small ivory-white core only at contact/peak
Background: 100% solid flat #FF00FF magenta across the entire sheet, no gradient, no shadows on the background
Constraints: exactly 2 rows and 2 columns; no visible boxes, dividers, borders or frame lines; no text, labels, numbers, UI, circles, magic runes, rings, star icons, lens flare, checkerboard, watermark or extra objects; all particles remain tightly grouped in their own cell
```

## 最终洋红底与安全区修订提示

```text
Use case: precise-object-edit
Asset type: production 2D game VFX sprite sheet
Primary request: keep the same four leaf-and-earth impact paintings and the same 2x2 order, but reduce and recenter each complete effect inside its own invisible cell so every particle has generous magenta padding
Layout: exact 2 rows by 2 columns; each cell is 768 by 512 pixels on the existing 1536 by 1024 canvas; scale each effect uniformly to about 78-82% of its current size and center it in that cell; guarantee at least 55 pixels of untouched flat magenta on all four sides of every cell, especially above the bottom-left peak frame
Preserve exactly: effect designs, animation progression, painterly texture, leaf and earth identity, warm color palette, particle relationships, flat #FF00FF background
Constraints: nothing may cross or touch a cell edge; no particle may leak into another cell; background remains perfectly uniform solid #FF00FF; no visible boxes, guides, lines, borders, text, labels, UI, watermark, shadows or gradients; do not add or remove animation frames
```
