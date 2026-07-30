# 背包消耗品图集生成记录

- 生成方式：Codex 内置 `image_gen`
- 用途：万兽纪元背包消耗品、捕捉道具、遇敌石、任务物品与 MM 属性石图标
- 视觉权属：原创生成，不复制任何商业游戏资产
- 原始母图：`consumable_atlas_raw.png`（1163×1353）
- 运行时图集：`../../runtime/items/consumable_atlas.png`（1158×1351）
- 图集结构：6 列 × 7 行，运行时每格 193×193
- 顺序：严格按 `client/godot/data/bag_items.json` 中 `item_meat_small` 至
  `mm_stone_quick_high` 的顺序排列；经验丹 5 格保留为空，由装备图集提供。
- 后处理：仅将原始母图等比例极小幅归一到可整除尺寸；未重绘、未改变格位顺序。

## 最终提示词

```text
Use case: stylized-concept
Asset type: production 2D game inventory item icon atlas for a Chinese prehistoric fantasy MMORPG
Primary request: Create one STRICT 6 columns by 7 rows icon atlas, exactly 42 equal rectangular cells, read left-to-right then top-to-bottom. Every occupied cell contains exactly one isolated object, centered, generously padded, fully inside its cell. Use a perfectly uniform deep charcoal stone background (#171513) across the whole atlas. NO grid lines, NO borders, NO text, NO letters, NO numbers, NO symbols that resemble letters, NO watermark. Original hand-painted polished game icon style: warm carved-stone-age fantasy, chunky readable silhouettes, crisp rim light, painterly material detail, high contrast at 64–96px UI size, consistent camera angle and scale. Do not imitate or reproduce any commercial game asset.

Exact row-major layout (R1–R7, C1–C6):
R1: C1 a small juicy roasted meat cut with bone; C2 a rolled worn tan beast hide with torn edge; C3 a tied bundle of several vivid green healing herbs with tiny golden flowers (group-heal); C4 a single small ochre ceramic healing salve jar with one green leaf (single-heal); C5 a small dark hide pouch spilling bright poisonous green powder (single poison); C6 a round purple-black powder bowl emitting a subtle violet toxic mist (group poison).
R2: C1 a pristine white-and-mint cleansing herb sprig with dew; C2 a simple coiled fiber capture rope with loop; C3 a basic folded rope capture net with stone weights; C4 a reinforced capture net with thick braided rope and bronze corner weights; C5 a special dark capture net bundled around a tiny green toxin vial, visibly poison-themed; C6 a small rough slate encounter stone with one shallow amber spiral rune, dull low tier.
R3: C1 a medium polished blue-gray encounter stone with brighter cyan spiral glow, mid tier; C2 a large faceted black-gold encounter stone with intense orange spiral glow and stronger shine, high tier; C3 a compact trail ration satchel containing dried meat, round bread and waterskin; C4 a medium pet-healing salve pot, teal ceramic with paw-shaped wax seal; C5 a large pet-healing salve amphora, ivory-gold ceramic with large paw seal and stronger glow; C6 an elongated patrol encounter stone mounted in a small compass-like wooden cradle with gentle turquoise spiral.
R4: C1 a carved wooden village welfare token with leaf and campfire pictogram only, no writing; C2 a rolled field journal made of hide parchment, tied with cord, tiny feather and charcoal sketch marks but no readable text; C3 EMPTY charcoal; C4 EMPTY charcoal; C5 EMPTY charcoal; C6 EMPTY charcoal.
R5: C1 EMPTY charcoal; C2 a small rounded ruby-red life crystal stone with heart-like natural cleft, matte basic tier; C3 a medium ruby-red life crystal cluster with brighter glow, mid tier; C4 a large brilliant ruby-red life crystal cluster with gold veins and strong glow, high tier; C5 a small jagged ember-orange attack stone shaped like a claw shard, matte basic tier; C6 a medium ember-orange attack crystal with stronger sharp facets and glow, mid tier.
R6: C1 a large brilliant ember-orange attack crystal cluster with gold lightning veins, high tier; C2 a small squat steel-blue defense stone shaped like a shield pebble, matte basic tier; C3 a medium steel-blue defense crystal shaped like a thicker shield, mid glow; C4 a large brilliant steel-blue defense crystal cluster shaped like fortress plates, high glow; C5 a small slender jade-cyan agility stone shaped like a feather or swift arrowhead, matte basic tier; C6 a medium jade-cyan agility crystal with wind-swept facets and brighter glow, mid tier.
R7: C1 a large brilliant jade-cyan agility crystal cluster with sweeping wind ribbons and gold veins, high tier; C2 EMPTY charcoal; C3 EMPTY charcoal; C4 EMPTY charcoal; C5 EMPTY charcoal; C6 EMPTY charcoal.

Differentiation rules: Healing is fresh green/ochre; poison is acidic green or violet-black; cleanse is white/mint; capture tools are rope/net silhouettes; encounter stones share a spiral motif but visibly progress from rough/dull to faceted/brilliant; ration and quest items read as practical village artifacts; MM stones use stat color and silhouette families (life ruby rounded, attack orange jagged, defense blue shield-like, agility cyan slender/wind-swept) and tiers are communicated ONLY through size, facets, gold veins, and glow intensity, never text.
Composition/framing: Orthographic inventory icon view, each occupied object covers about 62% of its cell, consistent lighting from upper left, no cast shadow outside its own cell, no object crossing cell boundaries.
Lighting/mood: warm premium fantasy UI lighting with crisp highlights, readable and celebratory but not noisy.
Constraints: EXACTLY 6 columns and EXACTLY 7 rows; keep all specified EMPTY cells completely object-free and uniform charcoal; exactly 32 objects total; no character, no hands, no scene, no labels, no text, no numbers, no border, no grid lines, no watermark.
```
