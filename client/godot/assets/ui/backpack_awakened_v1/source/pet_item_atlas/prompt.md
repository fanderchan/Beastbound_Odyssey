# Pet Item Atlas — Generation Record

## Scope

- Tool: OpenAI built-in `image_gen`
- Use case: `stylized-concept`
- Runtime output: `runtime/items/pet_item_atlas.png`
- Source output: `source/pet_item_atlas/pet_item_atlas_chromakey_source.png`
- Grid: 3 columns × 3 rows, 418 × 418 pixels per cell
- Coverage: every `world_pet_egg`, `world_pet_tame_permit`, and
  `world_pet_ride_permit` item currently declared in `data/bag_items.json`
- Ninth cell: deliberately empty and fully transparent after chroma-key removal

## Reference roles

- `runtime/items/material_atlas.png`: project-owned rendering and material-language
  reference only.
- The formal portraits for 1转小MM, 2转小MM, 四灵幼兽, 芽耳布伊, 新手老虎,
  and 雷龙: project-owned identity references only.
- The portraits were assembled into a temporary contact sheet for the generation call.
  The output uses newly drawn eggs and certificates; it does not crop, trace, or reproduce
  portrait pixels.
- No user-supplied or third-party screenshot was used as an image-generation input.

## Prompt

> Use case: stylized-concept
>
> Asset type: production game UI item-icon atlas for Beastbound Odyssey
>
> Input images: Image 1 is the project-owned item-atlas style reference only. Image 2
> is a contact sheet of six project-owned pet identity references, ordered left-to-right
> as stone MM stage 1, stone MM stage 2, four-spirit cub, then sprout Bui, novice tiger,
> thunder dragon. Preserve only the distinctive silhouettes, palettes and motifs; do
> not trace or reproduce the portraits.
>
> Primary request: create one strict 3-by-3 square atlas of eight original pet-related
> inventory icons, with the ninth bottom-right cell intentionally completely empty.
>
> Scene/backdrop: perfectly flat, uniform solid #FF00FF chroma-key background across
> the entire canvas and through every gutter, for later local background removal. No
> panels or cell backgrounds.
>
> Style/medium: premium hand-painted fantasy MMORPG inventory icons, compact
> carved-stone-and-warm-parchment material language matching Image 1, crisp readable
> silhouettes, slightly chibi, polished game-production finish.
>
> Composition/framing: exact equal 3x3 grid, row-major, each subject centered in its own
> equal square cell with generous identical padding, consistent scale, no overlap across
> cells, no frames, no borders, no dividers.
>
> Cell subjects, in exact row-major order:
>
> 1. A warm sandstone pet egg with a round wooden smiling face medallion, two tiny
>    turquoise light eyes, a single ancient stone arc and subtle turquoise spiral rune:
>    stage-one stone MM egg.
> 2. A heavier layered sandstone pet egg with a round wooden smiling face medallion,
>    stronger turquoise seams, multiple ancient stone arcs forming a double crown:
>    stage-two stone MM egg, visibly more advanced than cell 1.
> 3. An ivory-and-gold pet egg with a central faceted pale rainbow crystal and four small
>    feather-scale accents in turquoise, ember red, leaf green and sun gold:
>    four-spirit cub egg.
> 4. A honey-yellow pet egg with two round ear-like curves, two tiny sprouting leaves,
>    cream muzzle emblem and leafy collar motif: sprout Bui battle-pet egg.
> 5. A rolled warm parchment certificate with an original small honey-yellow round-ear
>    sprout-pet cameo seal, green leaf-and-paw wax emblem, braided taming cord:
>    taming certificate.
> 6. A warm parchment certificate with an original small honey-yellow round-ear
>    sprout-pet cameo seal, compact saddle-and-paw bronze emblem, sturdy leather riding
>    strap: riding certificate; clearly distinguish it from cell 5.
> 7. An orange-gold pet egg with bold dark tiger stripes, two small round ear motifs and
>    a cream muzzle shield emblem: novice tiger egg.
> 8. A deep indigo-blue scaled pet egg with two angular golden lightning-horn motifs, a
>    pale stone belly plate and small amber lightning seams: thunder dragon egg.
> 9. Completely empty solid #FF00FF background only.
>
> Lighting/mood: warm focused icon lighting entirely confined to each object; no cast
> shadows or glow spreading into the background.
>
> Color palette: sandstone tan, wood brown, parchment amber, honey gold, indigo blue,
> turquoise accents; never use magenta or near-magenta in any subject.
>
> Constraints: exactly eight objects in cells 1-8 and nothing in cell 9; no text,
> letters, numbers, labels, badges, UI frames, inventory slot borders, scene props,
> watermark, logo, or trademark. The background must be one uniform #FF00FF color with
> no shadows, gradients, texture, reflections, floor plane, lighting variation, or
> vignette. Crisp isolated opaque objects, generous padding, no touching cell edges,
> no cross-cell overlap.

## Transparency post-processing

The generated RGB source was converted with the imagegen skill's installed
`remove_chroma_key.py` helper using border auto-key sampling, soft matte, and despill.
Validation found:

- RGBA output at 1254 × 1254.
- All four atlas corners have alpha 0.
- Each of cells 1–8 has a non-empty visible bounding box inside its 418 × 418 cell.
- Cell 9 has zero visible pixels.
- No object crosses a cell boundary.
