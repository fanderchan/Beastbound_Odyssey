# Beastbound Node Backend Instructions

These rules apply under `server/node/` together with the repository root `AGENTS.md`.

## Runtime Shape

- Use Node.js 22+ and CommonJS. The service intentionally has no framework dependency; preserve the existing `node:http` and `node:test` style unless the user approves a platform change.
- `src/http-server.js` owns HTTP/WS transport concerns: URL matching, body reading, auth headers, status mapping, protocol metadata, and structured request logging.
- `src/auth-service.js` owns service composition, shared normalization/helpers, the in-memory authoritative document, and dependency injection into domains. It is already large; do not add another substantial feature implementation there.
- `src/auth/*.js` contains focused domains: profile actions/hang, quests, economy, mail/chat, party, battle rooms, and family/manor. Add a new domain or extend the closest one, then expose a narrow method through `createAuthService()` and a thin route.
- `src/event-hub.js` fans out already-authorized service events. WebSocket transport is not an alternate mutation authority.

## Authority And Transaction Rules

- Preserve protocol checks for every non-health request. Registration/login/refresh are the public auth boundary with throttling; every gameplay, profile, social, battle, and GM endpoint must authenticate and then validate ownership, role, party/family membership, distance/position, capacity, currency/items, and current state on the server.
- Never trust client-reported rewards, battle victory, capture, quest completion, prices, taxes, profile revisions, positions, or GM role. The client may submit intent; the server derives and persists the result.
- Player full-profile upload stays disabled. New gameplay writes use a dedicated transaction endpoint or a narrowly added `PROFILE_ACTION_IDS` entry with explicit server validation.
- A successful mutation should return the authoritative profile/profile summary and incremented revision when profile data changed. Multi-account economy/battle changes must be validated completely before either side is committed.
- Keep deterministic battle/loot/growth behavior seedable and testable. Do not fork client and server meanings for shared action/status/item IDs.
- Runtime-only `playerPositions`, `battleInvites`, `battleRooms`, and `tradeOffers` are cleared by `persistentDataForStore()`. Persist a new state category only after deciding reconnect/restart semantics and adding storage coverage.

## Domain And Data Contracts

- The server reads shared product data from `client/godot/data/`. Treat missing/invalid IDs as server validation failures; do not invent fallback meanings that diverge from the client.
- When a shared JSON field or ID changes, update server loaders/normalizers, client catalogs, request/response parsing, and both test suites in the same slice.
- Keep `src/http-server.js` routes thin: parse transport input, call one service method, send the result. Validation and mutation belong in the service/domain layer so memory, JSON, MySQL, and HTTP tests exercise the same behavior.
- Keep domain dependencies explicit in the `domainContext` object. Avoid hidden module-global mutable state.
- All public results use stable `code`, Chinese-safe `message`, and `schemaVersion`/protocol metadata where established. Internal error details and secrets must not reach responses.

## Protocol, Security, And Retries

- All non-health HTTP and WS clients send build and protocol versions. Coordinate breaking changes with `client/godot/scripts/progression/server_auth_client_model.gd` and update the supported window in `src/protocol.js`.
- UI/build/data changes that do not break requests, responses, events, or save interaction do not require a protocol bump.
- Preserve auth throttling, session replacement/revocation, GM user grants plus command grants, and GM audit writes. Hiding a client button is never authorization.
- Keep `BEASTBOUND_ALLOW_POSITION_TELEPORT=1` and `BEASTBOUND_ALLOW_PROFILE_SAVE=1` as explicit local QA/tooling escape hatches only. Tests may opt in through test support; runtime defaults remain strict.
- Only idempotent reads may be automatically retried by clients. Mutation endpoints must be safe from accidental duplicate application through validation/state checks.

## Persistence And MySQL

- Target/default runtime storage is MySQL 9.7 through `createAsyncWriteAuthStore(createMysqlAuthStore())`; memory and JSON are test/tool modes.
- `src/mysql-store.js` defines the live schema, entity loading, incremental upsert/delete diffing, transaction assembly, and async flush behavior. The early `database/mysql/001_auth_schema.sql` is not authoritative for the current service.
- Preserve incremental writes and the store interface. Do not reintroduce whole-table delete/reinsert saves or store credentials in tracked files.
- For a new persistent entity, update `normalizeData`, `persistentDataForStore`, MySQL schema creation, load reconstruction, incremental diff/save, and `test/auth-storage.test.js`.
- A storage failure must surface as a failed request and remain retryable after recovery; never acknowledge a gameplay mutation whose durable write silently failed.
- This service uses Node/mysql2 rather than JDBC, but the isolation boundary is the same: lock waits may be tuned only with validated `SET SESSION innodb_lock_wait_timeout = ...` and `SET SESSION lock_wait_timeout = ...` on Beastbound pool connections. Never issue `SET GLOBAL`, `SET PERSIST`, or `SET PERSIST_ONLY`, and never rely on a process-start statement to cover physical connections created later.
- Re-establish the session policy on every pool checkout before `BEGIN`; if it cannot be applied, release or destroy that connection and fail before business SQL. Pool-acquire and transaction hard deadlines are application timers, not server-global variables. A pre-COMMIT timeout must end in a known rollback; a timeout after COMMIT dispatch is outcome-ambiguous and must use the exact durable receipt/scoped reload path rather than blind retry.
- Use the database MCP server for live DB changes/inspection. Runtime credentials remain in ignored `.local/mysql.env`; never print them.

## Tests And Operations

- Put tests in the closest current file: auth/session, profile actions, quests/hang, economy, social/world, family/manor, battle room, HTTP, or storage. Shared fixtures belong in `test-support/auth-service-test-context.js`.
- Test service/domain behavior directly and add HTTP coverage for every new or changed route. Include happy path, unauthenticated/unauthorized access, invalid state, insufficient resources/capacity, duplicate/replay behavior, and persistence where relevant.
- Narrow commands:
  - `node --check server/node/src/<changed-file>.js`
  - `node --test server/node/test/<domain>.test.js`
  - `npm --prefix server/node test` for the complete server suite when justified
- Tests default to memory/isolated stores and may explicitly enable full-profile fixture setup. Do not weaken production defaults to make tests easier.
- From the repository root, normal backend operations use `npm --prefix server/node run ops -- <start|status|backup|stop|restart>`. Confirm `/health`, storage state, and logs after an operational change.
- Never run destructive cleanup against the local MySQL database for a code test. Use isolated memory/JSON fixtures or purpose-built demo seed tooling.
