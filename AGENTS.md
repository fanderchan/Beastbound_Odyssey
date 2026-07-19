# Beastbound Odyssey Agent Instructions

These rules apply to `/Users/fander/projects/Beastbound_Odyssey`. More specific rules live in `client/godot/AGENTS.md` and `server/node/AGENTS.md` and apply together with this file.

## Start Every Task From Repository Truth

- Run `git status --short --branch` and inspect recent `git log` before editing. Preserve unrelated user changes and never assume a dirty file belongs to the current task.
- Read the active plan's `进度追踪` section and the newest relevant `docs/phase_*.md` files before planning work. An explicit user request takes priority over the next unchecked plan item; a generic “继续” means continue from the first unchecked item.
- `tasks.md` has 32 completed bug items, `release_plan.md` stages A-E are accepted, and `quality_cleanup_plan.md` stages 1-6 are complete. Do not reopen them without a reproduced regression.
- The active roadmap is `stoneage_gap_plan.md`: current execution priorities are P0-P3. Its old F0-F8/G1-G9 structure is retained only as historical evidence. A generic “继续” means continue from the first unchecked P0-P3 item.
- Before editing a subsystem, read its scoped `AGENTS.md`, nearby tests, and the most recent phase note that established the behavior. Line numbers in old phase notes are historical evidence, not current locations.

## Repository Architecture

- `client/godot/` is the Godot 4.7 PC-first client. `scenes/Main.tscn` is intentionally only a bootstrap node; most runtime scene construction and coordination is currently scripted.
- `client/godot/data/` contains gameplay and balance JSON used by the client. The Node server also reads several of these documents directly, so IDs and schema changes can be cross-runtime contracts.
- `server/node/` is a Node.js 22+ CommonJS service. `src/http-server.js` is transport/routing, `src/auth-service.js` composes shared state and domain dependencies, and `src/auth/*.js` contains extracted gameplay domains.
- `server/node/src/mysql-store.js` is the runtime MySQL schema and persistence implementation. `database/mysql/001_auth_schema.sql` and its README are an early Phase158 artifact, not the current live-schema source of truth.
- `tools/run_godot_auto_checks.mjs` discovers client checks from literal `--auto-*-check` arguments in `main.gd`. `tools/run_local_ci.mjs` is the expensive combined server/client/performance gate.
- `.run/`, `client/godot/.godot/`, `server/node/.local/`, Godot `user://` data, logs, PIDs, screenshots, reports, and local credentials are generated state. Do not commit or treat them as product source.

## Product Direction

- Build an original StoneAge-inspired 2.5D turn-based pet MMORPG, not a one-to-one clone. Use StoneAge references for behavior intent only.
- Before approving a player-visible gameplay or UX addition, inspect the verified StoneAge 8.0 behavior in `/Users/fander/projects/_local_references/StoneAge` and treat that mature behavior as the default baseline. Depart only when a documented Beastbound product difference or evidenced player pain justifies the change; record the expected benefit, tradeoff, and why it is not over-design. Keep technical recovery and safety mechanisms invisible unless players genuinely need to operate them. StoneAge remains a reference rather than a source to copy, and Beastbound-specific rules still take priority when explicitly decided.
- The commercial target is an always-online Chinese recharge-supported private-server-style MMORPG, not a Steam/single-player/buy-to-play product. The long-term capacity target is at least 200 players on one map; do not claim that capacity before load evidence exists.
- The primary player promise is pet jackpot cultivation: visible Lv1 4V, hidden per-level growth learned through training, and high-variance rebirth/evolution/fusion with active/passive inheritance. Preserve that uncertainty instead of exposing one final quality number immediately.
- The release target is PC desktop first at the normal 1280x720 client path. Keep shared contracts reusable where cheap, but do not add mobile-only layouts, portrait flows, touch-only features, or mobile release blockers unless the user explicitly reprioritizes mobile.
- Player-facing UI is Chinese by default. Never expose raw error codes, server/debug fields, smoke summaries, test flags, audit IDs, or agent/QA instructions in normal player UI.
- Preserve the established input contract from `docs/phase_201_pc_mouse_interaction.md`: all main flows work with left click/buttons; right click is auxiliary and must never become required for gameplay.
- The server is authoritative for accounts, profiles, inventory, currency, pets, quests, movement acceptance, social state, and network battles. Client-side state may present or cache authoritative data but must not bypass server writes for server sessions.

## Pet Design Workflow

- For any request to design, add, rebalance, audit, place, capture, grow, skill, evolve, fuse, or otherwise change a pet, use the repository skill at `.agents/skills/design-beastbound-pets/SKILL.md`.
- Start natural-language pet work with its validated Pet Design Contract and catalog inspection. Do not scatter an idea directly across JSON files without resolving role/counterplay, taxonomy, growth/Lv1 proxy, acquisition probability, capture, active/passive skills, server authority, safety, and tests.
- Keep concept/numeric-only pet requests separate from visual production. When the user asks for a formal, complete, runtime-ready, rideable, sprite, animation, or art delivery, the pet-design skill must hand off to the dedicated art pipeline and its Beastbound production contract; do not call the pet complete from data and code alone.

## Change Routing And Boundaries

- Do not put a new feature domain into `client/godot/scripts/main.gd`, `ui/panel_flow_coordinator.gd`, `qa/auto_check_coordinator.gd`, `server/node/src/auth-service.js`, or `server/node/src/http-server.js` merely because those files already touch everything. Add a focused model/controller/domain first and keep entrypoint changes to wiring, dispatch, and compatibility shims.
- Treat `main.gd` and the large coordinators as host-coupled facades, not reusable domain layers. When touching an existing large block, prefer extracting a coherent slice if it can be done without changing behavior; do not mix a broad refactor with a feature fix.
- Reuse shared sources instead of duplicating constants: map registrations belong in `MapDataCatalog`, battle positions in `BattleLayoutConstants`, request/response construction in `ServerAuthClientModel`, and task availability in `PlayerProgressModel`.
- A new map, item, quest, pet, battle action, economy rule, or profile field usually crosses JSON data, a client catalog/model, server validation/settlement, UI wiring, and tests. Trace all consumers before changing an ID or field.
- HTTP/WS breaking changes require coordinated client and server updates. Bump `ServerAuthClientModel.CLIENT_PROTOCOL_VERSION` and `server/node/src/protocol.js` versions/window only for an actual incompatible contract change; build/UI/data-only changes normally keep the protocol number.
- `PUT /profiles/me` is intentionally disabled for players. Add a dedicated authoritative endpoint or a narrowly whitelisted `/profile/action`; return the updated profile and revision from successful mutations.
- Runtime positions, pending battle invites/rooms, and face-to-face trade offers are intentionally excluded from persisted service snapshots. Do not make ephemeral state durable accidentally.
- If an uncertain product rule materially changes formulas, taxes, limits, compatibility, account policy, or player-visible behavior, stop for user input. Do not hide product decisions inside implementation defaults.

## Roadmap And Documentation Workflow

- Implement in small reviewable slices. A planned gameplay feature normally gets `docs/phase_XXX_<slug>.md` covering reference intent, original Beastbound rule, contracts, non-goals, validation, and performance evidence.
- After completing a roadmap item, tick it in the active plan and append one concise evidence line. Do not mark it complete before code, targeted tests, and required manual/visual acceptance are actually complete.
- After a stage, run the stage-appropriate targeted suite and continue automatically unless the next work requires a major product direction, economy rule, destructive migration, external authorization, or an unsafe conflict.
- The repository-level targeted-validation rule overrides old plan text that says to run full local CI unconditionally. Run `node tools/run_local_ci.mjs` only when the user asks or the work is a true release/export gate that cannot be validated safely with narrower checks.
- Refactors must preserve behavior and player-facing wording unless the current task explicitly changes them. Do not opportunistically rename IDs, UI text, or compatibility fields.

## Validation Rules

- Start with `git diff --check`, syntax/parse checks, and the narrowest tests that cover changed behavior. Report exact commands and results, plus residual risk from checks not run.
- Server tests can be selected with `node --test server/node/test/<domain>.test.js`; the complete server suite is `npm --prefix server/node test`.
- The minimum Godot parse check is `godot --headless --path client/godot --quit`. Use `node tools/run_godot_auto_checks.mjs --only <comma-separated flags> --fail-fast` for relevant client checks.
- Live Godot checks may create accounts or mutate server state. Run them only against the local QA backend, never against a shared/LAN/production server. Set `BEASTBOUND_ALLOW_POSITION_TELEPORT=1` only for explicit local QA checks that need arbitrary coordinates.
- For gameplay/client changes, launch the real client path `godot --path client/godot --scene res://scenes/Main.tscn` when practical; headless checks alone do not prove normal PC UI behavior.
- Changes to movement, input, HUD, draw, pathfinding, map/quest markers, panels, inventory, battle loops, or profile synchronization require before/after idle and moving performance evidence. Use `--perf-probe` plus the relevant movement/panel stress probe.
- Movement/input performance checks must send real input events across frames. Same-frame helper calls do not validate mouse spam, drag, or movement smoothness.
- Confirm test processes and local servers do not remain orphaned. Do not delete or rewrite real user profile/MySQL state as test cleanup.

## Performance Red Lines

- Treat `_process`, `_input`, `_draw`, `_world_hud_signature`, `_world_draw_signature`, `_current_task_text`, route-button state, quest/map marker signatures, and online-event polling as hot paths.
- Never call full `PlayerProgressModel.normalize_profile`, `backpack_slots`, full quest/pet/map scans, navigation-target builders, blocking I/O, or network requests from per-frame signatures or drawing loops.
- Use raw-field signatures, dirty flags, caches, timers, bounded packet processing, and event-driven refresh. Recompute full text, routes, panels, or normalized profiles only on authoritative state change or explicit user action.
- A healthy post-startup PC baseline is low single-digit `%CPU` and sub-millisecond in-game `process_total`. If `ps` and the in-game probe disagree, investigate rather than choosing the better number.

## Backend And Database Operations

- From the repository root, normal local operations use `npm --prefix server/node run ops -- <start|status|backup|stop|restart>`; the root `start-backend.command` is the double-click restart launcher. `npm --prefix server/node start` is the foreground server.
- The target/default runtime store is MySQL 9.7. JSON and memory stores are for isolated tests and tooling, not the normal player server.
- Use the configured MCP database server for database inspection or mutation. Do not edit MySQL files directly, do not hand-delete binlogs, and do not place credentials in commands, logs, tracked files, or final responses.
- Local app credentials stay in ignored `server/node/.local/mysql.env`; local DBA credentials stay in `~/.mybugvault-db-credentials`. Read only what is needed and never print secret values.
- The MySQL instance may be shared with other applications. Runtime code, tests, and operations must never execute `SET GLOBAL`, `SET PERSIST`, `SET PERSIST_ONLY`, edit server-wide timeout/lock configuration, or restart MySQL to tune Beastbound. Beastbound row-lock and metadata-lock limits belong only on Beastbound-owned connections through `SET SESSION`; pool-acquire and transaction deadlines belong in the Beastbound process.
- Any MySQL session-policy change must prove with an independent connection that Beastbound sessions receive the intended values while `@@GLOBAL` values and unrelated sessions remain unchanged. A failed session initialization must fail closed instead of silently using server defaults.
- Preserve incremental MySQL writes. A new persistent entity must update normalization, snapshot persistence, MySQL load/save/diff behavior, schema creation, and storage tests without reintroducing whole-table delete/reinsert amplification.

## Assets And External References

- For uncertain StoneAge 8.0 behavior, inspect `/Users/fander/projects/_local_references/StoneAge` first. Do not re-clone it unless missing or explicitly asked to refresh.
- Use StoneAge 8.0, StoneAge9, or SA80 only for mechanics, data-contract ideas, validation patterns, and replaceable pipeline structure. Never copy their source, numbers, maps, NPC scripts, audio, or art without explicit approval.
- Every non-placeholder runtime asset must document source, ownership, replacement path, and validation evidence. Keep placeholders easy to replace.
- For movement collision reference, StoneAge `CHAR_ISOVERED=1` means passable/overlappable and `0` blocks; Beastbound expresses this as NPC `movementCollision`.

## Git And Delivery

- Do not create commits, push, or open a PR unless the current request includes publishing. When asked, stage only the requested scope and keep commits small with motivation-explaining messages.
- For the active long-running `stoneage_gap_plan.md` execution, the user has explicitly authorized one narrow commit and push after each completed issue or tightly related issue group.
- Before pushing, verify `git config user.name`, `git config user.email`, the remote owner, the branch, and staged diff. Confirm local HEAD, upstream, and remote SHA after push.
- GitHub remotes use SSH. For this repository, keep `origin` as `git@github-fanderchan:fanderchan/Beastbound_Odyssey.git` unless the user explicitly changes ownership or transport.
- Identity mapping: `energyjyasashi-hash` uses `github-energyjyasashi-hash`; `fanderchan` uses `github-fanderchan`. Never silently switch a GitHub remote to HTTPS.
