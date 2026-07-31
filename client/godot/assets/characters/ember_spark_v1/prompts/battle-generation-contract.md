# Battle generation contract

Two battle views are authored independently: `front_3quarter_sw` and `back_3quarter_ne`. The back view exposes the real rear costume, sash knot, braids and pauldron placement; it is never a flipped front view.

Each action is generated in its own source sheet. Six-frame actions use an exact `2 x 3` grid; eight-frame actions use an exact `3 x 3` grid with frame 9 retained as a source-only settle/hold. Every cell is one chronological full-body pose on flat `#FF00FF`, with stable identity, scale, camera, feet, lighting and weapon design.

Required action counts per view: `idle 6`, `walk 8`, `attack 8`, `skill 8`, `hurt 6`, `defend 6`, `dodge 8`, `counter 8`, `stagger_return 8`, `knockaway 8`, `down 8`, `revive 8`. Actions are body-only: no attacker, projectile, magic, hit particles, labels, borders, floor or shadow. `down-8` is mechanically copied to `revive-1` after normalization for decoded-RGBA continuity.
