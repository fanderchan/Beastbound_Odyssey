Use case: stylized-concept
Asset type: strict 2x2 production prop sheet for an isometric 2.5D Godot MMORPG map
Input images: `firebud-low-props-sheet-v2.png`, `firebud-service-pavilion-v1.png`, and `firebud-compact-props-v1.png` were style and perspective references only. The generated props are new original assets and do not copy the reference silhouettes.
Primary request: Create exactly four separate Firebud village environmental props, one centered prop per equal cell.
Top-left: a compact prehistoric training rack holding two short wooden spears, one bone club, one round hide shield, and two rolled practice mats.
Top-right: a compact practice cluster with two differently sized hide-and-wood target dummies arranged as one coherent training station.
Bottom-left: a low village trade counter with woven baskets, folded ochre cloth, bundled herbs, and one small clay scale; no roof and no text.
Bottom-right: a flat irregular sparse meadow ground decal with several olive grass tufts, a few fallen orange leaves, tiny stones, and only two small cream flowers; lots of transparent gaps, never a dense flower carpet.
Style/medium: premium clean hand-painted HD 2D game assets matching the supplied references; rounded prehistoric fantasy construction, warm honey stone, dark wood, rope and hide, crisp espresso-brown edge language, controlled painterly texture; original commercial MMORPG quality; not pixel art and not photorealistic.
Composition/framing: consistent 3/4 top-down isometric view; strict equal 2x2 grid; exactly one isolated coherent prop per cell; each prop fully visible with at least 14% transparent padding; no overlap between cells; no cell divider, frame, label, or base platform.
Lighting/mood: warm upper-left sunlight, restrained cool occlusion and soft integrated contact shadows. Bottom-right remains a flat ground decal.
Constraints: no characters, NPCs, pets, buildings, UI, letters, numbers, symbols, logos, watermark, full landscape, detached particles, cropped silhouettes, or solid square ground bases. Keep all visible pixels comfortably inside each cell.

Built-in `image_gen` first returned an RGB file with a baked checkerboard rather than genuine alpha. That output is retained as `source/raw/firebud-life-training-props-v2.png` only as rejected lineage evidence. A second precise edit preserved the four props and replaced only the background with a flat magenta chroma field. The accepted raw source is `source/raw/firebud-life-training-props-v2-chroma.png`; the repository chroma-key and object extraction scripts produce the RGBA build and runtime files deterministically.
