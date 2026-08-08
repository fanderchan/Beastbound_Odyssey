# Battle command icon atlas prompt

Built-in ImageGen was used on 2026-08-02 to create a project-original 4x4
atlas for the battle command HUD. The three supplied StoneAge: Awakening
screenshots were layout and hierarchy references only; no pixels or commercial
game assets were copied into this bundle.

Final prompt:

> Create one exact 4 by 4 atlas of sixteen separate, original prehistoric
> fantasy battle pictogram icons on a perfectly flat `#ff00ff` chroma-key
> background. Row 1: stone spear attack, spiral spirit flame, leather satchel,
> running footprint. Row 2: helping hands, rope-loop paw, summoned creature,
> wooden shield. Row 3: auto arrows and gear, radiant claw, recalled pet paw,
> return arrow. Row 4: hunter bust, horned pet head, crossed bone cancel,
> managed campfire. Use warm ivory bone, ochre highlights, dark umber outlines,
> chunky readable silhouettes, no text, no logos, no watermark, and no button
> frames. Keep every glyph inside the central 70 percent of its cell and clear
> at 48 pixels.

The chroma-key source was converted to alpha with the installed ImageGen
`remove_chroma_key.py` helper. `source/build_icons.py` performs the reviewed,
fixed 4x4 extraction and produces 96x96 runtime icons.
