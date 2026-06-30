# Phase 182: MySQL Live Server Foundation

## Goal

Move Beastbound Odyssey from local JSON prototype storage to a real local MySQL-backed server that can be used for LAN playtests.

The authority boundary is:

- Godot client talks only to the Node server over HTTP/WebSocket.
- Node server is the only writer to MySQL.
- MySQL stores accounts, sessions, profiles, GM grants, online state, chat, parties, and duel rooms.
- Root is used only for one-time local database/user setup.
- The runtime server uses a dedicated low-privilege MySQL account.

## Local MySQL Layout

Dedicated database:

```text
beastbound_odyssey
```

Dedicated runtime users:

```text
'beastbound_app'@'127.0.0.1'
'beastbound_app'@'localhost'
```

Runtime grants are limited to this database:

```text
SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
```

No grants are made on existing local databases such as `messages_grafana`, `my_bug_vault`, `sa`, or any other schema.

The runtime password is written to:

```text
server/node/.local/mysql.env
```

That directory is ignored by git and the file should stay local-only.

## Current Data Model

The first live-server schema uses two layers:

- `server_state`: full authoritative document used by the existing Node service.
- Mirror tables for inspection, indexing, and operations:
  - `accounts`
  - `sessions`
  - `profile_bindings`
  - `profiles`
  - `gm_user_grants`
  - `gm_command_grants`
  - `gm_command_audit`
  - `auth_events`
  - `mail_messages`
  - `parties`
  - `party_invites`
  - `chat_messages`
  - `player_positions`
  - `battle_invites`
  - `battle_rooms`
  - `service_events`

Profiles remain JSON documents for this phase because player, pet, backpack, equipment, quest, and balance fields are still changing quickly. Later phases can split stable hot-path data into normalized `player_characters`, `pet_instances`, `inventory_items`, and `equipment_instances` tables without blocking LAN tests now.

## Setup

One-time database setup:

```sh
cd /Users/fander/projects/Beastbound_Odyssey
BEASTBOUND_MYSQL_ROOT_PASSWORD='...' node server/node/scripts/setup-local-mysql.js
```

Migrate the local GM account and its profile:

```sh
BEASTBOUND_MIGRATE_PASSWORD='...' node server/node/scripts/migrate-local-userdata-to-mysql.js --username auth1373
```

Smoke check the migrated account:

```sh
BEASTBOUND_SMOKE_PASSWORD='...' node server/node/scripts/mysql-live-smoke.js --username auth1373
```

Start the LAN server:

```sh
cd /Users/fander/projects/Beastbound_Odyssey/server/node
npm run ops -- start
```

With `BEASTBOUND_AUTH_HOST=0.0.0.0`, friends on the same LAN can connect to:

```text
http://<your-lan-ip>:8787
```

The Godot client can still be launched with an explicit server URL and login:

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --server-url http://<your-lan-ip>:8787 --login auth1373 '...'
```

## Operational Notes

- Use root only for setup or emergency DBA work.
- Do not point the game server at root.
- Do not store root credentials in tracked files.
- For local development, `.local/mysql.env` is the source of truth for the app database account.
- Use `npm run ops -- status`, `backup`, `stop`, and `restart` for normal local operations.
- The current Node server is a single-process LAN prototype. For public internet hosting, the next work should add migrations, process supervision, backup/restore, structured logs, request rate limits, and a normalized transaction model for inventory/equipment/battle rewards.
