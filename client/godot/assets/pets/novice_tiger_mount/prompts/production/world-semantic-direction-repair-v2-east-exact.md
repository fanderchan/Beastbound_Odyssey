# Adopted exact generation prompt

## Novice tiger pet east walk (refined v2, adopted)

Use case: identity-preserve
Asset type: Beastbound Odyssey production 2x2 sprite animation sheet refinement
Primary request: Refine image 1 only into the final east-facing baby tiger walk sheet. Keep its four-frame sequence and strict screen-right EAST direction, but correct the proportions and grid-scale continuity to match image 2 exactly.
Input images: Image 1 is the edit target/draft 2x2 east walk sheet. Image 2 is the authoritative runtime EAST idle frame for silhouette scale, compactness, head-to-body ratio and pose height. Image 3 is the authoritative identity board for face, markings, palette, fur and anatomy.
Required proportion correction: The draft cubs are too horizontally long and read too adult. Make the SAME cub noticeably more compact and youthful in every cell: shorter torso, slightly oversized round head, small rounded ears, fuller cheek/chest fluff, sturdy legs and thick paws. Match image 2's alpha-silhouette width-to-height ratio approximately 1.47:1 rather than an elongated adult ratio. Keep the cub body tall enough at the same intended runtime scale as image 2. Do not merely shrink the whole cub; change the anatomy to the compact cub proportions of image 2.
Direction: Every frame is a strict EAST full side profile traveling screen-right. Muzzle/nose/eyes/torso/paws point right; tail trails left. Never face west/left, front, or rear. Independently authored east-facing poses, never mirrored west art.
Animation: Preserve four distinct, subtle alternating natural walking phases in reading order left-to-right then top-to-bottom: diagonal contact, passing/weight-transfer, opposite diagonal contact, recovery. No running, pouncing, leaping, or four near-identical standing poses.
Identity invariants: same exact orange baby tiger, same dark stripe language, cream muzzle/cheeks/chest/paws, same eye style, tail, limbs, face and clean high-definition hand-painted StoneAge-inspired 2.5D style across all cells.
Composition: exact equal 2x2 grid; one full cub centered per cell; all four subjects use the same bounding-box scale; central 60-70% safe area; generous empty gutters; stable feet baseline; no cropped ears/tail/paws and no overlap across cells.
Background: perfectly flat uniform solid #FF00FF across the whole canvas, no variation.
Constraints: change only proportion/compactness and retain the correct east gait; four cubs only; no shadow, floor, scenery, text, label, arrow, border, watermark, reflection or detached effect; do not use #FF00FF in the cub.

## Reference roles

- Image 1: rejected first-pass east 2x2 walk sheet; gait and facing reference only.
- Image 2: `world/directions/east/idle/idle-1.png`; authoritative east-facing scale and silhouette reference.
- Image 3: `identity/identity-board-transparent.png`; authoritative identity reference.

## Production decision

- Generator: OpenAI built-in image generation.
- Adopted generated source: `source/formal-production/world-semantic-direction-repair-v2/east-walk/raw.png`.
- Runtime mirroring: forbidden and not used.
- Owner review status: pending.
