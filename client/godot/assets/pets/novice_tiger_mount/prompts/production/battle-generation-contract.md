
# novice tiger battle generation contract

- Two authored views: `front_3quarter_sw`, `back_3quarter_ne`; actions: idle, walk, attack, skill, hurt, defend, dodge, counter, stagger, knockaway, down, revive.
- Frame counts and timing come from `action-bundle-meta.json`; every action is generated as chronological 3×2 or 4×2 source sheet.
- Down means temporary faint, never sleep/death/gore; revive begins from the exact down final frame. Halo/dizzy VFX stay separate at runtime.
- No baked VFX, shadow, floor, text, detached marks, wounds, blood, missing limbs or identity drift.
- Pet remains the same individual and camera direction throughout each action.
- Formal presentation contract: enemy=`front_3quarter_sw + flipH=true`; ally=`back_3quarter_ne + flipH=true`.
