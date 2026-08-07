# 世界 HUD 图标生成提示词

## 记录说明

本文件记录 `world_hud_awakened_v1` 的可复现生成意图。部分图标在并行美术生产期间只
保留了用途与构图摘要，没有保存逐字调用文本；因此下列内容是依据最终源图、用途合同和
同批风格规范整理的**规范化重建提示词**（`normalized reconstruction prompt`），不是
对历史 ImageGen 请求的逐字转录。不得把它们标记成原始调用日志。

所有提示词均用于 OpenAI ImageGen 原创生成。用户提供的外部主界面截图只用于理解入口
层级和整体材质方向，不作为生成输入资产，也不要求复制其中任何具体图标、像素、标志或
角色。

## 共用基础提示词

每个图标将对应的“主体补充”接在以下基础提示词后单独生成：

```text
Use case: stylized-concept.
Asset type: one production-ready square 2D game UI icon for Beastbound Odyssey.
Primary request: create exactly one large, centered, independently crop-safe icon. The icon must read clearly at 32x32 and 48x48 pixels while retaining premium hand-painted detail at 128x128.
Style/medium: original hand-painted fantasy Stone-Age-inspired MMORPG UI; tactile carved walnut wood, sandstone, aged bronze, leather, bone, rope and parchment as appropriate; bold readable silhouette; rounded, friendly but not childish; premium mobile-MMO rendering without copying any existing game icon.
Composition/framing: single isolated object or emblem, centered in a square canvas, three-quarter front view when useful, generous equal padding, no surrounding button frame, no crop, no overlap with canvas edges.
Lighting/mood: warm soft top-left key light, restrained amber rim light, compact ambient occlusion, subtle material highlights, no glossy plastic finish.
Color palette: dark walnut, sandstone tan, aged gold, warm amber, bone ivory and charcoal accents; keep colors controlled and high-contrast against the extraction backdrop.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background, no gradient, texture, floor, shadow, reflection or lighting variation in the background.
Constraints: no text, letters, numbers, logo, watermark, trademark, UI badge, red notification dot, currency symbol, extra object or decorative debris. No #00ff00 inside the icon. Keep all ornament attached to the main silhouette. Clean anti-aliased edges suitable for chroma removal.
```

## 各图标主体补充

### `account_raw_chroma.png` — 角色／账号

```text
Subject: a confident original young Beastbound hunter head-and-shoulders portrait inside a circular carved tribal medallion. Warm brown tousled hair, simple fur collar and small bone ornaments; approachable neutral expression; the medallion has subtle geometric carvings and two tiny attached bone charms. The face remains legible when reduced, with no resemblance to any external IP character.
```

### `auto_raw_chroma.png` — 自动设置

```text
Subject: a circular primitive-mechanical auto-action emblem built from a dark carved stone ring and three sweeping ivory-and-bronze blades around a compact spiral hub. Convey rotation and repeat behavior through the three balanced curved arms, but keep the object static, symmetrical, safe and non-weapon-like.
```

### `backpack_raw_chroma.png` — 背包

```text
Subject: a compact adventurer backpack made from dark amber leather, rolled bedroll, braided straps, bone toggle and a small side pouch. Three-quarter front view, pleasantly stuffed but tidy, with a strong single-bag silhouette and no loose inventory objects.
```

### `chat_raw_chroma.png` — 聊天

```text
Subject: two overlapping speech surfaces made from warm parchment and a small dark wooden backing plaque. The front parchment has folded, slightly curled corners and bone ties but contains absolutely no writing or symbols. Make the overlapping shapes instantly read as conversation.
```

### `collapse_raw_chroma.png` — 收起

```text
Subject: a compact square carved wood-and-stone control showing two thick nested downward chevrons. The chevrons are part of the same relief object, edged with aged gold and amber highlights. Keep the down direction unmistakable without text or a separate button background.
```

### `equipment_raw_chroma.png` — 装备

```text
Subject: one compact crossed-equipment bundle: a stone-headed primitive hammer and a short leather-wrapped tool or club, tied together with a pale bone-and-hide wrap. Strong diagonal X composition, readable tool heads, no floating sparks and no modern metal weapon styling.
```

### `family_raw_chroma.png` — 家族

```text
Subject: a round clan totem medallion made of carved dark wood and pale bone wedges, centered on an original spiral clan mark, with one small hide pennant attached at the upper right. The emblem should communicate tribe and belonging without letters, heraldic trademarks or external game symbols.
```

### `hang_raw_chroma.png` — 挂机

```text
Subject: a calm circular rest-and-camp emblem combining a small glowing campfire and a sweeping golden leaf or feather around a dark stone-and-ivory yin-like ring. The silhouette should imply safe idle training and rest, not a pause-media icon; all parts remain joined as one emblem.
```

### `mailbox_raw_chroma.png` — 邮箱

```text
Subject: one closed hand-stitched leather message pouch or envelope with a rolled corner, braided seam, small bone clasp and tied cord. Three-quarter front view; unmistakably a mail container, with no written address, stamp, unread number or red notification badge.
```

### `map_raw_chroma.png` — 地图

```text
Subject: a partly unrolled parchment world map with two wooden scroll rods and an attached carved stone compass marker bearing an original spiral. Include only faint abstract terrain strokes, never readable text, a real-world outline or an external game map.
```

### `market_raw_chroma.png` — 交易所

```text
Subject: a balanced primitive trading scale made from carved wood, rope and aged bronze, with a small sack of pale shells or stones in one pan and dark ore pieces in the other. Centered upright silhouette, visibly balanced, no currency sign, coins, price text or commercial logo.
```

### `more_raw_chroma.png` — 更多

```text
Subject: four compact rounded tribal tiles bound as one 2x2 cluster. Each tile uses a different Beastbound material and simple inset motif—spiral, four holes, amber hide and dotted stone—while remaining one cohesive icon. No app-grid logo, letters, notification dots or detached tile.
```

### `party_raw_chroma.png` — 队伍

```text
Subject: a close group of three original carved tribal masks, one tall central mask and two smaller companion masks slightly behind it. Use wood, bone and charcoal grooves with distinct but friendly faces. The overlap must clearly communicate a team without copying any known mask design.
```

### `quest_raw_chroma.png` — 任务

```text
Subject: one rolled ochre quest parchment tied to short dark wooden rods, featuring only a large original carved compass-star objective emblem in the center. No writing, exclamation mark, check mark, number, red dot or external game insignia.
```

## 顶部快捷与活动抽屉图标补录

以下十九条同样是依据现存生成源、运行图和入口职责整理的**规范化重建提示词**。历史
逐字调用文本与调用 ID 没有完整保留，因此这些记录只用于将来制作原创替换图，不得标成
原始 ImageGen 调用日志。`event_*` 允许使用更饱满的彩色金框徽章，`top_*` 保持更克制的
圆形石木快捷牌；两组仍遵守前述原创、无文字、无商标和纯绿色色键背景合同。

### `event_account_raw_chroma.png` — 活动列角色／账号

```text
Subject: a warm circular identity emblem showing an original red-haired Beastbound hunter portrait beside a compact carved wooden account tablet with an original spiral seal and attached bone beads. Keep the portrait and tablet joined inside one gold-edged badge; no letters, numbers, profile name or external character likeness.
```

### `event_auto_raw_chroma.png` — 活动列自动设置

```text
Subject: one round elemental auto-action medallion, split into a cool blue water swirl and a warm orange flame swirl around a small carved spiral stone hub. Use a compact gold-and-wood rim and balanced clockwise motion; no media-play symbol, arrows, letters or detached effects.
```

### `event_backpack_raw_chroma.png` — 活动列背包

```text
Subject: a front-facing, pleasantly full primitive hunter backpack framed as a round premium badge. Use stitched brown leather, rolled hide, small blue bottles, bone toggles, rope and compact travel tools; keep every item attached or secured to the bag and omit text, loose loot and notification marks.
```

### `event_character_raw_chroma.png` — 活动列角色

```text
Subject: an original young Beastbound hunter head-and-shoulders portrait inside a pointed carved-gold shield medallion. Dark warm hair, blue forehead wrap, fur collar and a confident friendly expression; readable at small size with no resemblance to an external IP character and no text.
```

### `event_codex_raw_chroma.png` — 活动列图鉴／攻略

```text
Subject: one closed indigo field-guide book with a bold original amber paw-and-spiral seal, pale bone corner guards and a compact gold tribal frame. The book must read clearly as a creature codex without title text, letters, numbers, copied insignia or loose pages.
```

### `event_equipment_raw_chroma.png` — 活动列装备／锻造

```text
Subject: a compact volcanic equipment emblem inside a faceted dark-gold frame: glowing orange forge stone, one blue cut gem and a few attached primitive metal or stone tool details. Keep it as one readable upgrade-and-equipment badge; no weapon brand, letters, numbers or floating sparks outside the silhouette.
```

### `event_family_raw_chroma.png` — 活动列家族

```text
Subject: three original ceremonial tribal masks grouped inside one round gold-edged clan medallion. Use distinct red, blue and violet carved faces around a small central wooden totem, with friendly collectible styling and no copied mask design, crest, text or detached ornament.
```

### `event_mailbox_raw_chroma.png` — 活动列邮箱

```text
Subject: one rolled ochre parchment message tied around a small blue gemstone clasp, with a large blue-and-white feather tucked under the cord and a compact gold tribal frame. No address, stamp, writing, unread counter, red dot or detached paper scraps.
```

### `event_market_raw_chroma.png` — 活动列交易所

```text
Subject: a round premium trade emblem showing a balanced purple-and-gold primitive scale with one pink shell pouch and one pale shell bundle. Keep the scale centered and visibly balanced inside a carved gold frame; no currency sign, price, numbers, letters or modern commerce logo.
```

### `event_party_raw_chroma.png` — 活动列队伍

```text
Subject: three original companion mask portraits—blue, orange and ivory—overlapping inside one compact gold-and-wood team crest. Give each mask a distinct friendly silhouette while keeping the trio connected; no known character likeness, copied clan mark, text or extra badge.
```

### `event_pet_raw_chroma.png` — 活动列宠物

```text
Subject: one ornate warm-gold creature egg decorated with original blue, orange and ivory tribal markings, paired with a small attached paw-print stone at its lower edge. Frame both as one collectible pet badge; no hatch text, rarity number, copied creature face or detached sparkle field.
```

### `event_quest_raw_chroma.png` — 活动列任务

```text
Subject: one tightly rolled parchment quest marker wrapped around a carved golden compass-target medallion, with small cyan-and-amber energy accents attached to the outer frame. No readable writing, exclamation mark, check mark, numbers or external quest insignia.
```

### `top_classic_raw_chroma.png` — 顶部经典任务

```text
Subject: a restrained circular stone-and-walnut shortcut token bearing one original eight-point sandstone star relief. Thick readable relief, compact dark rim and warm edge light; no text, letters, number, copied badge or detached decoration.
```

### `top_guide_raw_chroma.png` — 顶部攻略

```text
Subject: one open aged field-guide book resting inside a circular carved stone-and-wood frame. Show only faint abstract map strokes and one small bone clasp, never readable writing, a real map, copied page symbol, lock number or external logo.
```

### `top_hang_raw_chroma.png` — 顶部挂机

```text
Subject: a circular dark-wood rest-training token combining a pale crescent moon, a tiny attached camp ember and two crossed primitive tools. The object should imply unattended safe training without a pause-media icon, text, letters or detached effects.
```

### `top_more_raw_chroma.png` — 顶部更多

```text
Subject: two thick nested left-facing chevrons carved as one pale sandstone control with a warm brown inner edge. Keep the direction unmistakable and the silhouette compact, with no surrounding app button, text, number or separate arrow pieces.
```

### `top_pet_raw_chroma.png` — 顶部抓宠

```text
Subject: one circular walnut-and-stone shortcut medallion with a bold pale-bone paw-print relief. Use five clean pads, warm carved depth and a simple collectible silhouette; no creature portrait, text, number, cage, copied paw logo or detached ornament.
```

### `top_quest_raw_chroma.png` — 顶部活动／任务

```text
Subject: one small rolled ivory parchment carrying a single dark primitive exclamation relief, mounted on a circular carved walnut token. The exclamation is an original generic alert shape, not copied branding; no writing, numbers, check mark, red notification dot or loose paper.
```

### `top_strengthen_raw_chroma.png` — 顶部变强

```text
Subject: a circular primitive upgrade token showing one strong leather-wrapped hand gripping a compact stone hammer, all carved as a single sandstone-and-walnut relief. Convey strengthening and crafting without letters, level numbers, modern metal tools or detached impact sparks.
```

## 后处理合同

1. 保存 ImageGen 直接输出为 `source/generated/<id>_raw_chroma.png`，保留原始
   `1254×1254 RGB8` 画布；
2. 使用项目当次 ImageGen 工具包提供的色键去除流程移除绿色背景并处理边缘残绿；
3. 按 Alpha 内容边界整理、等比缩放并在透明正方形画布居中，不拉伸主体；
4. 输出 `runtime/icons/<id>.png`，固定为 `128×128 RGBA8`；
5. 检查完全透明和完全不透明像素均存在、边缘无明显绿色残留、32px 缩略图仍可辨认；
6. 更新 `asset-manifest.json` 中的尺寸、字节数和 SHA-256，再执行运行时界面验证。

色键源只用于可追溯生产，不由正常玩家运行时加载。任何重新生成都必须保留相同用途，
但允许美术造型改进；不得为了“更像参考截图”输入或复制外部图标。
