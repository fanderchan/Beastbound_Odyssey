Use case: precise-object-edit
Asset type: production source sheet for a 2D isometric RPG ground-tile atlas
Primary request: edit only the presentation of the existing six-tile sheet so it is suitable for deterministic extraction.
Input image: the supplied six Earth Vein Cave tiles is the edit target.
Keep unchanged: exactly six tiles in the same 3-column by 2-row order; their material identities, color palette, southwest-to-northeast route tile, mineral-vein tile, cracked tile, and dark edge tile; same 1536x1024 canvas and equal cells.
Required changes:
- Replace the entire dark gradient/background with genuine transparent alpha.
- Remove every external glow and drop shadow outside the tile diamonds.
- Flatten the visible side-wall thickness so each asset reads as a thin painted isometric ground diamond, not a thick tabletop board piece.
- Keep the top-surface painting and restrained upper-left cave lighting.
- Center each complete diamond inside its original cell with generous transparent separation and no edge touching.
Constraints: transparent background; clean antialiased alpha; no new content; no text; no grid lines; no borders; no labels; no actors; no props standing above the floor; no watermark.
