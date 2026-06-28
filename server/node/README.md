# Beastbound Odyssey Node.js Backend

Phase158 starts the backend from the smallest useful authority boundary: account login, server-side session shape, GM grant checks, and GM command audit. Phase160 adds a lightweight profile binding summary for the Godot client, while full save synchronization still stays local-shadow only.

## Run Tests

```sh
cd server/node
npm test
```

## Start Local Prototype

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
  "storageMode": "local_shadow",
  "serverAuthority": "account_binding"
}
```

This is only a binding receipt. The server is not yet authoritative for the full character save.
