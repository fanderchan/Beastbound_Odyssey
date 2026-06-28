# Beastbound Odyssey Node.js Backend

Phase158 starts the backend from the smallest useful authority boundary: account login, server-side session shape, GM grant checks, and GM command audit. Phase161 adds a JSON-store profile sync loop for local server testing. The Godot player entry now depends on this service for normal play; MySQL authority and multiplayer conflict policy are still later work.

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

## Current Endpoints

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/session`
- `GET /profiles/me`
- `PUT /profiles/me`
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

The server increments `profileRevision` on success and returns `409 revision_conflict` if the expected revision is stale. This is enough for server-login and two-account local validation, but it is still a JSON-store implementation rather than the final MySQL-backed MMO profile authority.
