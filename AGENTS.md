# Beastbound Odyssey Agent Instructions

These rules apply to `/Users/fander/projects/Beastbound_Odyssey`.

## Project Status And Roadmap

- The project has moved past the prototype/bugfix phase: all 32 known bugs in `tasks.md` are fixed and verified. Do not re-investigate them unless a regression is proven by a failing test or check.
- Release iteration follows `release_plan.md`, executed stage by stage (A → E). At the start of every session, read the "进度追踪" section of `release_plan.md` and `git log` to locate the current position, then continue from the first unchecked item.
- After completing each item, tick its checkbox in `release_plan.md` and append one line of completion evidence. After completing each stage, run the full validation suite and stop for user confirmation before starting the next stage.

## Product Direction

- Build an original StoneAge-inspired 2.5D turn-based pet MMORPG, not a one-to-one clone. Current goal: iterate to a releasable networked game per `release_plan.md`.
- Current release target is PC desktop first. Consider future phone/tablet compatibility while designing shared contracts, but do not build dedicated mobile features, portrait flows, mobile-only UI, touch-only workflows, or mobile release blockers unless the user explicitly asks for that work.
- Use Godot 4.7 standard edition, GDScript, a 2D isometric or 45-degree map direction, Node.js backend, and MySQL 9.7 for persistence.
- Use Chinese for player-facing UI by default. Never show English error codes, agent-only validation strings, raw smoke summaries, implementation flags, or debug-only IDs in normal player-facing UI.

## Workflow Rules

- Develop in small reviewable stages. Stop after each stage and ask the user to confirm before moving to the next stage.
- Commit in small steps with motivation-explaining messages; never one giant diff.
- During refactors (especially the main.gd split), behavior must stay identical: no opportunistic logic changes, no renaming player-facing text.
- When a decision needs product input (password policy for old accounts, export platform priority, etc.), stop and ask the user instead of deciding alone.
- Use the MCP server for database operations.

## Client Rules

- Keep the Godot client self-contained under `client/godot`.
- Build and validate player-facing features for the PC desktop client first. The default launch and acceptance path is `godot --path client/godot --scene res://scenes/Main.tscn` in the PC window.
- Keep PC/mobile gameplay contracts compatible where it is cheap and natural, especially shared battle formation coordinates and reusable panel/data models. Do not add a separate mobile feature set, mobile-only layout, portrait-first flow, or touch-only gameplay unless the user explicitly re-prioritizes mobile.
- Mobile preview and touch checks are optional smoke/pressure checks for future compatibility. Failures or ugly layouts on phone portrait / ultra-narrow viewports should be recorded as future mobile work, not treated as blockers for the current PC release unless they also affect the PC client.
- Keep reusable gameplay rules in focused scripts or data files instead of growing one giant scene script. `main.gd` has been reduced to a coordination entrypoint; do not add new domains back into `main.gd` — put new logic in focused scripts under `scripts/net/`, `scripts/battle/`, `scripts/ui/`, `scripts/progression/`, or `scripts/world/`.

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

## Backend Rules

- The server is authoritative for accounts, saves, inventory, pets, quests, and battle. Do not add client-side writes that bypass server authority for server-session accounts.
- Persistence target is MySQL 9.7 (see release_plan.md stage B); the JSON file store is for tests only once the MySQL switch lands.
- Keep database credentials out of tracked files; use environment variables.

## Asset And Reuse Rules

- StoneAge9 may be evaluated for structure, data contracts, validation style, and replaceable asset pipeline ideas.
- Do not directly copy StoneAge9 or SA80 art assets into this project unless the user explicitly approves that specific reuse.
- Every non-placeholder runtime asset must eventually declare its source, ownership, replacement path, and validation evidence.
- Temporary placeholders are allowed while they keep the live client playable and remain easy to replace; stage E of release_plan.md audits all remaining placeholders.

## Original StoneAge Reference Rules

- If an original StoneAge behavior or system rule is uncertain, inspect the user's 8.0 source reference at [fanderchan/StoneAge](https://github.com/fanderchan/StoneAge) before guessing.
- Use the 8.0 source to confirm mechanics and naming intent only; do not copy source code, data, or assets into Beastbound Odyssey without explicit approval.
- For movement collision, the 8.0 server uses `CHAR_ISOVERED`: `1` means another character can stand on or pass through that character's cell, and `0` means the character blocks movement. Beastbound maps this concept to the NPC field `movementCollision`.

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
