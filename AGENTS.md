# Beastbound Odyssey Agent Instructions

These rules apply to `/Users/fander/projects/Beastbound_Odyssey`.

## Product Direction

- Build an original StoneAge-inspired 2.5D turn-based pet MMORPG prototype, not a one-to-one clone.
- Use Godot 4.7 standard edition, GDScript, a 2D isometric or 45-degree map direction, Node.js backend support, and MySQL 9.7 when persistence becomes necessary.
- Use Chinese for player-facing UI by default.
- Develop in small reviewable stages. Stop after each stage and ask the user to confirm before moving to the next stage.

## Client Rules

- Keep the Godot client self-contained under `client/godot`.
- Design every player-facing UI for both PC and mobile from the beginning.
- Treat the PC client as the same mobile-first client running in a PC window; PC mainly changes input to mouse/keyboard and should not get a denser or more complex separate UI/layout unless the user explicitly approves it.
- PC and mobile must share the same battle display template and formation coordinate contract; viewport differences should be handled by scaling, translation, and surrounding touch-friendly UI adaptation rather than separate slot layouts.
- Player-facing screens must stay clean: do not show agent-only validation strings, raw smoke summaries, implementation flags, or debug-only IDs in normal UI.
- Keep reusable gameplay rules in focused scripts or data files instead of growing one giant scene script.

## Validation And Performance Rules

- Before and after each gameplay/client feature stage, compare against the previous performance baseline instead of only checking that the new feature works.
- Use the full client launch path `godot --path client/godot --scene res://scenes/Main.tscn` when a feature may affect normal runtime behavior, UI refresh, movement, shops, battle, or world interaction.
- Run relevant narrow probes when available, such as movement spam/perf, shop select perf, player stat spam perf, and feature-specific headless checks.
- Report CPU/runtime evidence in the final summary, especially when the user has recently reported high CPU, movement stutter, UI stalls, or macOS beachball behavior.
- If a feature changes HUD refresh, map scanning, pathfinding, panels, inventory, battle loops, or save/profile writes, explicitly check that it did not reintroduce a CPU spike or frame-time regression.
- Treat `_process`, `_world_hud_signature`, `_world_draw_signature`, `_current_task_text`, task-route button refresh, and map/quest marker signatures as hot paths. Do not call `PlayerProgressModel.normalize_profile`, `PlayerProgressModel.backpack_slots`, full quest scans, pet-list normalization, map scans, or navigation-target builders from these paths.
- For hot-path UI state, use raw-field lightweight signatures and cached display text. Recompute full task details, map routes, quest panels, or navigation targets only when opening a panel, clicking a button, changing profile data, or forcing a refresh.
- When fixing or adding HUD/task/route behavior, test both idle and moving cases with `--perf-probe`; movement can expose regressions that idle checks miss because coordinates refresh the HUD.
- For movement/input performance, simulate real `_input` events across frames. A same-frame batch of direct helper calls is not enough to prove mouse-spam, touch-spam, or manual click-drag behavior is smooth.
- A good post-fix idle baseline is low single-digit `%CPU` in `ps` for `godot --path client/godot --scene res://scenes/Main.tscn`, and sub-millisecond `process_total` after startup in the in-game perf probe. If `ps` and the script probe disagree, keep investigating instead of trusting only one source.

## Asset And Reuse Rules

- StoneAge9 may be evaluated for structure, data contracts, validation style, and replaceable asset pipeline ideas.
- Do not directly copy StoneAge9 or SA80 art assets into this project unless the user explicitly approves that specific reuse.
- Every non-placeholder runtime asset must eventually declare its source, ownership, replacement path, and validation evidence.
- Temporary placeholders are allowed in early stages when they make the live client playable and remain easy to replace.

## Original StoneAge Reference Rules

- If an original StoneAge behavior or system rule is uncertain, inspect the user's 8.0 source reference at [fanderchan/StoneAge](https://github.com/fanderchan/StoneAge) before guessing.
- Use the 8.0 source to confirm mechanics and naming intent only; do not copy source code, data, or assets into Beastbound Odyssey without explicit approval.
- For movement collision, the 8.0 server uses `CHAR_ISOVERED`: `1` means another character can stand on or pass through that character's cell, and `0` means the character blocks movement. Beastbound maps this concept to the NPC field `movementCollision`.

## Backend Rules

- First playable stages may use local Godot state only.
- Add Node.js and MySQL 9.7 support only when a client loop needs account, save, inventory, pet, or battle authority.
- Keep database credentials out of tracked files.

## Global Git / SSH Rules

- Default GitHub remotes should use SSH, not HTTPS.
- Two GitHub identities are configured on this machine:
  - `energyjyasashi-hash` -> SSH host alias `github-energyjyasashi-hash` -> key `~/.ssh/id_ed25519_github_energyjyasashi_hash`
  - `fanderchan` -> SSH host alias `github-fanderchan` -> key `~/.ssh/id_ed25519_github_fanderchan`
- When a GitHub remote belongs to `energyjyasashi-hash/<repo>`, prefer `git@github-energyjyasashi-hash:energyjyasashi-hash/<repo>.git`.
- When a GitHub remote belongs to `fanderchan/<repo>`, prefer `git@github-fanderchan:fanderchan/<repo>.git`.
- Do not switch GitHub remotes to HTTPS unless the user explicitly asks for HTTPS.
- Before pushing, verify `git config user.name` and `git config user.email` match the intended GitHub identity.
- If a repo belongs to another owner or organization and the correct GitHub identity is unclear, ask the user which GitHub account should be used before editing the remote or pushing.
