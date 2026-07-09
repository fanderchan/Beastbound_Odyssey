# Beastbound Godot Client Instructions

These rules apply under `client/godot/` together with the repository root `AGENTS.md`.

## Current Client Shape

- Target Godot 4.7 standard edition and GDScript. The normal PC entry is `godot --path client/godot --scene res://scenes/Main.tscn`.
- `scenes/Main.tscn` contains only the scripted `Main` node. Runtime map, battle drawing, HUD, panels, QA entrypoints, and networking are built or coordinated from scripts.
- `scripts/main.gd` is the bootstrap/host facade. `scripts/ui/panel_flow_coordinator.gd` is a legacy broad UI/network facade, and `scripts/qa/auto_check_coordinator.gd` is a broad test harness. All three are already very large; they are not default homes for new feature logic.

## Where New Code Belongs

- `scripts/world/`: map loading, isometric coordinates, pathfinding/interaction, encounters, and world-only rules.
- `scripts/battle/`: deterministic battle facts, action/passive catalogs, status rules, layout contracts, server-room state, and battle coordination.
- `scripts/progression/`: player/profile, inventory, equipment, quests, pets/growth/rebirth, balance, auth contracts, and server request/response models.
- `scripts/ui/`: presenters, controls, panel registry, focused panel/flow controllers, and player-facing composition. Business rules and authoritative mutations do not belong in view code.
- `scripts/net/`: reusable synchronization and network lifecycle coordination.
- `scripts/qa/`: check orchestration only. Put deterministic rule assertions near the responsible model when possible and keep the coordinator wrapper thin.
- New domains should expose small data-oriented APIs and be wired through `main.gd`. Do not solve `main.gd` growth by moving another whole domain into `panel_flow_coordinator.gd` or `auto_check_coordinator.gd`.

## Data Contracts

- Gameplay source documents live in `data/*.json`; balance versions live in `data/balance/*.json`. Preserve stable IDs and `schemaVersion` semantics.
- Several JSON documents are read directly by the Node backend. Before changing an item, pet, quest, battle-action, reward, equipment, shop, manor, or map contract, search `server/node/src` and its tests for consumers.
- Register new maps once in `scripts/world/map_data_catalog.gd`, connect them through `data/map_regions.json`, and validate map IDs, warps, spawns, interactions, encounters, facility markers, and return routes.
- Battle and growth randomness must stay reproducible with fixed seeds. Do not silently rewrite an existing balance version; add/version data when semantics change.
- Keep compatibility fields only with a documented producer, consumer, removal condition, and regression check.

## Server Authority And Networking

- `AUTH_SERVER_ONLY` is the normal player path. A server-session client must not commit gameplay mutations only to `PlayerProgressModel.save_profile()` or `user://`; call an authoritative server endpoint and apply the returned profile/revision.
- Full-profile upload is intentionally denied. Use `ServerSyncCoordinator` plus a dedicated request in `ServerAuthClientModel`, or the whitelisted profile-action path, depending on the domain.
- Centralize request specs, protocol headers, retry policy, response parsing, and error-code mapping in `scripts/progression/server_auth_client_model.gd`. Never retry a non-idempotent mutation automatically.
- Display server failures through `ServerAuthClientModel.player_message_from_parsed()` or the established mapped helper. Do not show raw `parsed.message`, code strings, JSON, or implementation details to players.
- Event-stream polling must stay bounded per frame. Position presence is low-frequency/map-oriented; do not add coordinate heartbeats unless a gameplay contract requires them and steady-state request/write pressure has been measured.
- Profile pulls are deferred while mutating panels/actions are active. Preserve revision checks and do not let an async pull overwrite an in-flight authoritative result.

## UI And Input

- Build and accept the 1280x720 PC window first. Keep future mobile compatibility at the contract level; portrait and touch-only behavior are non-blocking unless explicitly requested.
- Chinese player-facing labels must be concise and game-like. Keep QA instructions, raw flags, traces, and smoke results out of normal HUD/panels.
- Register new blocking/world-menu panels with `PanelRegistry`; do not add parallel hard-coded panel arrays to `_is_ui_point` or `_world_menu_is_open`.
- Main interactions must work with left click and explicit buttons. Preserve Phase201 right-click boundaries: world/player facing, item auxiliary menu, and battle target details only; right click must not move or submit commands.
- UI input must not fall through to world movement/facing. Keep drag previews, context menus, and confirmation panels above their source panels.
- PC and future mobile battle displays share the same formation/coordinate template. Treat battle testing as general N-vs-N: 1v1 smoke and 10v10 capacity stress, not separate battle systems.

## Hot Paths

- Keep `_process`, `_input`, `_draw`, HUD/draw signatures, task text, route availability, marker signatures, movement, event polling, and battle playback free of normalization, full scans, JSON/file I/O, network requests, and large text construction.
- Cache normalized profile slices and display text outside hot paths. Mark caches dirty after authoritative profile/map/quest changes and refresh once.
- Draw methods consume prepared state; they do not mutate gameplay state or discover contracts.
- Test HUD/task/route changes both idle and moving. Test input changes with actual events distributed across frames.

## Auto Checks And Validation

- Every behavior-changing client feature needs a focused `--auto-*-check` or an extension to the closest existing check. A new check must be registered as a literal `arg == "--auto-...-check"` branch in `main.gd` so `tools/run_godot_auto_checks.mjs` can discover it.
- Keep registration and forwarding wrappers in `main.gd`/`AutoCheckCoordinator` minimal. Put pure setup/assertion helpers with the relevant domain where practical.
- Minimum validation for any GDScript/resource change:
  - `godot --headless --path client/godot --quit`
  - `node tools/run_godot_auto_checks.mjs --only <relevant flags> --fail-fast --timeout-ms 180000`
- For normal-runtime/UI changes, also launch `godot --path client/godot --scene res://scenes/Main.tscn` with the local backend and inspect the affected PC flow.
- For hot-path changes, add idle/moving `--perf-probe` and the closest stress check such as movement spam, shop select, or player-stat spam. Record baseline and current values.
- Live checks require the local QA server. Do not aim live checks at a shared/LAN server and do not leave Godot/backend processes running afterward.
