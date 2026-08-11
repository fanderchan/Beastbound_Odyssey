# World generation contract

Generate eight independent direction-specific source sheets for `south`, `southwest`, `west`, `northwest`, `north`, `northeast`, `east`, and `southeast`. Each sheet uses the locked Ember identity and true direction-specific anatomy/costume logic; never mirror a neighboring direction.

For a complete world bundle, preserve `idle-1` and produce walk frames in this exact semantic order: `contact_a`, `passing_a`, `recovery_a`, `contact_b`, `passing_b`, `recovery_b`. The two three-frame halves must be driven by opposite physical legs. Side views should make the alternating knee/boot silhouettes especially clear. Front, back, and diagonal views must use near/far overlap and boot depth to keep the alternation readable. File-unique repeats of one half-cycle are invalid.

Keep the seed-stone mallet present, scale and feet stable, and the asymmetrical pauldron/ornaments anatomically correct. Use a flat single-color background, generous safe area, body only, no text, borders, floor, shadow, particles or effects. Audit physical-leg identity on a temporary marker copy when occlusion is ambiguous, then remove every marker before production export.

Hash uniqueness, baseline stability, and mirror checks are necessary but cannot approve gait semantics. Review each six-frame loop in order at its runtime `9 FPS`, compare transition variance against rejected candidates, and record it through the real Godot runtime before owner acceptance. Optical-flow interpolation is prohibited when it leaves double limbs, head ghosts, or weapon trails.
