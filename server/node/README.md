# Beastbound Odyssey Node.js Backend

Phase158 starts the backend from the smallest useful authority boundary: account login, server-side session shape, GM grant checks, and GM command audit. Phase161 adds a JSON-store profile sync loop for local server testing. Phase163 adds account search plus text mail. Phase164 adds the first server-authoritative party slice: online roster, invites, accept/decline, and leave. Phase165 adds server-backed nearby and party chat transport. Phase166 adds server-backed online position snapshots for same-server player visibility. Phase167 adds a session-authenticated WebSocket event stream for online, chat, and party changes. Phase168 adds the first map/cell area-of-interest filter for online player visibility. Phase169 adds duel battle-room invitations, server room seeds, and room-ready events. Phase170 adds WebSocket event cursors and short disconnect replay for critical chat, party, and battle events. Phase171 adds the first server-authoritative movement step and battle-room entry position gates. Phase172 adds room turn command submission and a server-produced battle event list. Phase189 adds server-authoritative hang/encounter-stone sessions. The Godot player entry now depends on this service for normal play; the default runtime store is MySQL, with the JSON store kept for explicit tests only.

## Run Tests

```sh
cd server/node
npm test
```

## Start Local Server

```sh
cd server/node
npm start
```

Default URL:

```text
http://127.0.0.1:8787
```

Optional environment variables:

- `BEASTBOUND_AUTH_PORT`: local port, default `8787`.
- `BEASTBOUND_AUTH_HOST`: bind host, default `127.0.0.1`. Use `0.0.0.0` for LAN playtests.
- `BEASTBOUND_AUTH_STORE` or `BEASTBOUND_STORE`: defaults to `mysql`. Set to `json` only for local tests that intentionally use the JSON store.
- `BEASTBOUND_AUTH_STORE_PATH`: JSON test store path when `BEASTBOUND_AUTH_STORE=json`, default `.local/auth-store.json`.
- `BEASTBOUND_MYSQL_HOST`, `BEASTBOUND_MYSQL_PORT`, `BEASTBOUND_MYSQL_USER`, `BEASTBOUND_MYSQL_PASSWORD`, `BEASTBOUND_MYSQL_DATABASE`: MySQL connection settings.
- `BEASTBOUND_MYSQL_CREATE_DATABASE`: set to `1` only when the configured MySQL user is allowed to create the database. Local live-server setup creates the database once with root, then runs the app account with this set to `0`.
- `BEASTBOUND_MYSQL_BIN`: optional `mysql` CLI path.
- `BEASTBOUND_STRUCTURED_LOGS`: set to `1` to write JSON lines for HTTP request duration, profile writebacks, and battle settlements.
- `BEASTBOUND_ALLOW_POSITION_TELEPORT`: set to `1` only on local QA servers to skip server-side position snapshot validation (teleport and cross-map jump checks) and the quest `talk` NPC proximity check. Never enable it for playtest or production servers.

## Local MySQL Live Server

The repeatable local setup flow is:

```sh
BEASTBOUND_MYSQL_ROOT_PASSWORD='...' node scripts/setup-local-mysql.js
BEASTBOUND_MIGRATE_PASSWORD='...' node scripts/migrate-local-userdata-to-mysql.js --username auth1373
BEASTBOUND_SMOKE_PASSWORD='...' node scripts/mysql-live-smoke.js --username auth1373
```

Then start the server with the ignored local env file:

```sh
npm run ops -- start
```

Useful local operations:

```sh
npm run ops -- status
npm run ops -- backup
npm run ops -- stop
npm run ops -- restart
```

See `../../docs/phase_182_mysql_live_server.md` for the architecture and LAN playtest boundary.

## Protocol Compatibility

Every non-health HTTP request must include:

- `X-Beastbound-Client-Version`: current Godot client build version, currently `0.1.0`.
- `X-Beastbound-Protocol-Version`: client protocol version, currently `1`.

Every JSON response includes `protocolVersion`, `serverVersion`, `minClientProtocolVersion`, `maxClientProtocolVersion`, and a reserved `hotUpdate` object. Incompatible or missing client protocol metadata returns HTTP `426` with `protocol_version_mismatch` or `client_version_missing` plus a Chinese upgrade prompt. WebSocket event streams carry the same fields as query parameters: `clientVersion` and `clientProtocolVersion`.

Compatibility window strategy: client build version and protocol version are separate. UI text, art, balance data, or bug-fix builds may change `CLIENT_VERSION` while keeping protocol `1` if HTTP/WS request and response contracts stay compatible. Any breaking request/response, event-stream, or save-interaction change must bump both Godot `CLIENT_PROTOCOL_VERSION` and server `PROTOCOL_VERSION`, then update `MIN_CLIENT_PROTOCOL_VERSION` / `MAX_CLIENT_PROTOCOL_VERSION` to the supported release window. The current release window is `1..1`; clients outside it receive HTTP `426` and the reserved `hotUpdate` payload remains non-required until a real update manifest exists.

## Health And Logs

`GET /health` returns protocol metadata plus `storage` and `eventStream` summaries. When the HTTP server is created with a store, `storage.checked=true` means the endpoint ran one lightweight `store.load()` check; failed storage checks return HTTP `503`.

Structured logs use one JSON object per event with `schemaVersion` and `createdAt`. Current event types:

- `http.request`: method, path, statusCode, ok, durationMs.
- `profile.writeback`: method, path, profileRevision, storageMode, serverAuthority.
- `battle.settlement`: roomId, mode, reason, winnerAccountId, battleRecordId, profileWritebackCount, skippedProfileCount, skippedProfiles.

## Current Endpoints

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/session`
- `GET /players/search?username={username}`
- `GET /players/online`
- `GET /players/online?scope=aoi&mapId={mapId}&cellX={x}&cellY={y}&radius={cells}`
- `POST /players/position`
- `POST /movement/step`
- `WS /events?clientVersion={clientVersion}&clientProtocolVersion={protocolVersion}&token={sessionToken}`
- `WS /events?clientVersion={clientVersion}&clientProtocolVersion={protocolVersion}&token={sessionToken}&lastEventSeq={eventSeq}`
- `GET /events/latest`
- `GET /profiles/me`
- `PUT /profiles/me` (disabled; returns `403 profile_upload_denied`)
- `POST /profile/action`
- `POST /hang/session/start`
- `POST /hang/session/stop`
- `GET /mail/inbox`
- `POST /mail/send`
- `POST /mail/{mailId}/read`
- `GET /party/state`
- `POST /party/invite`
- `POST /party/invites/{inviteId}/accept`
- `POST /party/invites/{inviteId}/decline`
- `POST /party/leave`
- `GET /chat/messages?channel={channel}&limit={limit}`
- `POST /chat/send`
- `GET /battle/state`
- `POST /battle/invite`
- `POST /battle/invites/{inviteId}/accept`
- `POST /battle/invites/{inviteId}/decline`
- `POST /battle/rooms/{roomId}/commands`
- `GET /gm/tools`
- `POST /gm/commands/{commandId}`

## Security Boundary

This prototype keeps the same rule as the Godot contract: the client may hide GM tools, but only the server can authorize GM commands in production. Every GM command authorization writes an audit row.

## Profile Summary Boundary

`/auth/register`, `/auth/login`, `/auth/session`, and `/profiles/me` return `profileSummary`:

```json
{
  "playerId": "player_acc_xxx",
  "profileRevision": 0,
  "storageMode": "server_document",
  "serverAuthority": "profile_document",
  "hasProfile": true
}
```

`PUT /profiles/me` is intentionally disabled for player clients:

```json
{
  "ok": false,
  "code": "profile_upload_denied"
}
```

Gameplay writes must go through server-authoritative transaction endpoints such as `POST /profile/action`, shops, equipment, quests, rebirth, movement, hang/encounter-stone sessions, and battle settlement. Internal migration and test tooling may still call the service layer directly, but the public HTTP API must not accept full-profile overwrites from a client.

`POST /profile/action` is a whitelisted profile transaction endpoint for ordinary world and pet-management actions that do not need a dedicated route yet. Current action ids cover player stat allocation, backpack slot unlocks, village healing, record-point saving, world item use, pet skill slot updates, pet state/stable/party/lock changes, pet rename/drop/pickup/cleanup, MM guide rewards, and pet cultivation/rebirth. The server reloads the authoritative profile, validates the action, persists the new revision, and returns the updated profile document.

## Mail Boundary

Text mail is the first player-to-player interaction slice:

- `GET /players/search` requires a server session and returns public player identity fields.
- `POST /mail/send` sends title/body text to another account.
- `GET /mail/inbox` returns the current account's inbox.
- `POST /mail/{mailId}/read` marks one inbox message as read.

This stage deliberately does not support item attachments for player mail. Existing reward fallback attachments remain in the Godot profile mailbox until economy authority is moved server-side.

## Party Boundary

Parties are server state, not local Godot state:

- `GET /players/online` lists accounts with active, non-revoked sessions and includes each player's party role and latest position when applicable.
- `POST /party/invite` creates a party for the inviter when needed, then sends a pending invite to another online-capable account.
- `GET /party/state` returns the current party and pending incoming invites for the session account.
- `POST /party/invites/{inviteId}/accept` joins the invited account to the party.
- `POST /party/invites/{inviteId}/decline` declines one pending invite.
- `POST /party/leave` removes the current account from its party; if the leader leaves, the next member becomes leader, and an empty party dissolves.

This party phase does not yet synchronize following or battle entry as a party.

## Online Position Boundary

Online visibility is now server state, not a local-only player list:

- `POST /players/position` stores the current account's `mapId`, grid cell, facing, moving flag, and update time.
- The response also returns an AOI-filtered online roster, so a client can upload its own position and refresh visible nearby players with one low-frequency request.
- `GET /players/online` without query parameters remains the full active roster for party/invite workflows.
- `GET /players/online?scope=aoi&mapId={mapId}&cellX={x}&cellY={y}&radius={cells}` returns only the current account plus players on the same map within a square cell radius. The default radius for position sync is 18 cells.

`POST /players/position` remains a seed/snapshot sync path. It is not a trusted movement command.

## Movement Boundary

The first server-authoritative movement slice is `POST /movement/step`:

```json
{
  "mapId": "firebud_training_yard",
  "fromCellX": 10,
  "fromCellY": 10,
  "toCellX": 11,
  "toCellY": 10
}
```

- The account must already have a server position from `/players/position`.
- `fromCellX/fromCellY` must match the current server position.
- The target cell must be on the same map and within one grid cell.
- The response includes `authority: "server_step"` and a monotonic `movementSeq`.
- The accepted step publishes `online.position` like other position changes.

This does not yet provide full path authority, collision between players/NPCs, party follow movement, map transfer authority, or anti-cheat timing checks.

## Event Stream Boundary

`WS /events?token={sessionToken}` upgrades a valid server session to a lightweight WebSocket stream:

- On connect, the server sends `events.ready` with the session account and `online.snapshot` with the current AOI-filtered online roster when the account already has a position.
- `GET /events/latest` returns the latest service cursor for an authenticated session, so local checks can subscribe from the current edge instead of replaying old development events.
- Clients may reconnect with `lastEventSeq`; the server replays later critical `chat.message`, `party.*`, and `battle.*` events visible to that account.
- `online.position` is intentionally not replayed because `online.snapshot` is the reconnect state source for visible players.
- `POST /players/position` publishes `online.position` only to clients whose current AOI includes the actor's current or previous position; each recipient receives its own filtered roster snapshot.
- `POST /chat/send` publishes `chat.message`; nearby messages are same-server public, while team messages are targeted to party members.
- Party invite, accept, decline, and leave publish `party.invite`, `party.update`, or `party.invite_declined` to the affected accounts.
- Battle invite, accept, room command submit, and turn resolve publish `battle.invite`, `battle.room_ready`, `battle.command_submitted`, and `battle.turn_resolved` to the affected accounts.

The stream is an event fanout for already-authorized HTTP actions. Replay history is bounded and meant for short reconnects, not permanent offline mail. It is not yet explicit room subscription, durable offline combat recovery, or anti-cheat timing validation.

## Battle Room Boundary

Duel rooms are the first server-owned battle entry point:

- `POST /battle/invite` sends a pending duel invite to an online account.
- `GET /battle/state` returns the current ready room and pending incoming/outgoing duel invites.
- `POST /battle/invites/{inviteId}/accept` marks the invite accepted, creates a `ready` battle room, and generates a server seed.
- `POST /battle/invites/{inviteId}/decline` declines one pending invite.
- `POST /battle/rooms/{roomId}/commands` submits the current account's room command for the current round.
- `battle.room_ready` includes `roomId`, `mode`, `status`, `seed`, participant account ids, entry map/distance, and lightweight participant snapshots.
- Accepting a duel invite now requires both accounts to have synchronized positions, be on the same map, be within 4 cells, and not be moving.
- The first room turn model supports `attack` and `defend`. Command submissions publish `battle.command_submitted` without revealing the command details early.
- When all room participants have submitted the current round, the server creates a `battle_event_list` and publishes `battle.turn_resolved`.
- The battle room public state includes the round, phase, actors, submitted account ids, and the last resolved event list.

This is the first turn-command authority slice only. It does not yet consume items, resolve full pet/team 10v10 actions, persist battle results, handle leave/timeout, or recover a disconnected player into the visible battle scene.

## Chat Boundary

Chat is now server state, not a local-only Godot message list:

- `GET /chat/messages?channel=nearby` returns the latest same-server nearby messages for the current account.
- `POST /chat/send` with `channel=nearby` writes a nearby message for the current account.
- `GET /chat/messages?channel=team` returns party chat only when the current account is in a server party.
- `POST /chat/send` with `channel=team` requires current server party membership and stores the party id on the message.

Nearby chat is currently same-server public chat. It is not yet map-coordinate range chat, moderation tooling, or persisted economy/battle authority.

## MySQL Store Boundary

The default store is MySQL. The server uses `server/node/src/mysql-store.js` to create the schema and persist the production server document through an asynchronous write queue. `BEASTBOUND_AUTH_STORE=json` is retained only for tests that intentionally exercise the JSON file store.

Persisted tables include:

- `accounts`
- `sessions`
- `profiles`
- `mail_messages`
- `parties`
- `party_invites`
- `chat_messages`
- `battle_records`
- `gm_user_grants`
- `gm_command_grants`
- `gm_command_audit`
- `auth_events`
- `service_events`
- `server_state`

Player positions, battle invites, and active battle rooms remain runtime memory state and are cleared from the persisted document before writes. This is a bridge for local persistence and inspection, not the final normalized MMO transaction model yet.
