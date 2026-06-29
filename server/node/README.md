# Beastbound Odyssey Node.js Backend

Phase158 starts the backend from the smallest useful authority boundary: account login, server-side session shape, GM grant checks, and GM command audit. Phase161 adds a JSON-store profile sync loop for local server testing. Phase163 adds account search plus text mail. Phase164 adds the first server-authoritative party slice: online roster, invites, accept/decline, and leave. The Godot player entry now depends on this service for normal play; full MySQL authority and multiplayer conflict policy are still later work.

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
- `BEASTBOUND_AUTH_STORE_PATH`: JSON prototype store path, default `.local/auth-store.json`.
- `BEASTBOUND_AUTH_STORE` or `BEASTBOUND_STORE`: set to `mysql` to use the optional MySQL-backed store.
- `BEASTBOUND_MYSQL_HOST`, `BEASTBOUND_MYSQL_PORT`, `BEASTBOUND_MYSQL_USER`, `BEASTBOUND_MYSQL_PASSWORD`, `BEASTBOUND_MYSQL_DATABASE`: MySQL connection settings.
- `BEASTBOUND_MYSQL_BIN`: optional `mysql` CLI path.

## Current Endpoints

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/session`
- `GET /players/search?username={username}`
- `GET /players/online`
- `GET /profiles/me`
- `PUT /profiles/me`
- `GET /mail/inbox`
- `POST /mail/send`
- `POST /mail/{mailId}/read`
- `GET /party/state`
- `POST /party/invite`
- `POST /party/invites/{inviteId}/accept`
- `POST /party/invites/{inviteId}/decline`
- `POST /party/leave`
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

`PUT /profiles/me` accepts:

```json
{
  "expectedRevision": 0,
  "profile": {"schemaVersion": 1}
}
```

The server increments `profileRevision` on success and returns `409 revision_conflict` if the expected revision is stale.

## Mail Boundary

Text mail is the first player-to-player interaction slice:

- `GET /players/search` requires a server session and returns public player identity fields.
- `POST /mail/send` sends title/body text to another account.
- `GET /mail/inbox` returns the current account's inbox.
- `POST /mail/{mailId}/read` marks one inbox message as read.

This stage deliberately does not support item attachments for player mail. Existing reward fallback attachments remain in the Godot profile mailbox until economy authority is moved server-side.

## Party Boundary

Parties are server state, not local Godot state:

- `GET /players/online` lists accounts with active, non-revoked sessions and includes each player's party role when applicable.
- `POST /party/invite` creates a party for the inviter when needed, then sends a pending invite to another online-capable account.
- `GET /party/state` returns the current party and pending incoming invites for the session account.
- `POST /party/invites/{inviteId}/accept` joins the invited account to the party.
- `POST /party/invites/{inviteId}/decline` declines one pending invite.
- `POST /party/leave` removes the current account from its party; if the leader leaves, the next member becomes leader, and an empty party dissolves.

This phase does not yet synchronize map positions, team chat transport, following, or battle entry as a party.

## MySQL Store Boundary

The default store is still JSON for fast local testing. With `BEASTBOUND_AUTH_STORE=mysql`, the server uses `server/node/src/mysql-store.js` to create a MySQL database and mirror the current server document into:

- `accounts`
- `sessions`
- `profiles`
- `mail_messages`
- `parties`
- `party_invites`
- `server_state`

This is a bridge for local persistence and inspection, not the final normalized MMO transaction model yet.
