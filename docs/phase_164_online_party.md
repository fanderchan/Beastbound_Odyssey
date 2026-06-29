# Phase164 Online Party

## Goal

Move the first team interaction out of local-only state and into the Node server. The client can now open a clean player-facing `队伍` panel, view server online players, invite another account, accept or decline incoming invites, and leave a party.

## Server Contract

- `GET /players/online`
- `GET /party/state`
- `POST /party/invite`
- `POST /party/invites/{inviteId}/accept`
- `POST /party/invites/{inviteId}/decline`
- `POST /party/leave`

The server owns:

- party creation when a leader sends the first invite
- one active party per account
- leader-only invites after a party exists
- accepted, declined, and expired invite states
- leader handoff when the leader leaves
- party deletion when the last member leaves

## Client Behavior

The Godot client adds a `队伍` action-bar button and a mobile-safe panel:

- `成员`: current party members and leader/member roles
- `邀请`: pending incoming invites with `加入` and `拒绝`
- `在线玩家`: active server sessions with per-player `邀请` buttons

The panel refreshes only when opened or when the player presses an action button. It does not poll from `_process` and does not add online roster work to HUD signatures.

## MySQL Mirror

When `BEASTBOUND_AUTH_STORE=mysql` is enabled, the server mirrors party data into:

- `parties`
- `party_invites`

The full auth document still remains in `server_state` during this bridge phase.

## Validation

Run:

```sh
cd server/node
npm test
godot --headless --path ../../client/godot --quit
godot --headless --path ../../client/godot --scene res://scenes/Main.tscn --quit-after 6000 -- --auto-auth-server-client-check
godot --headless --path ../../client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-party-live-check
```

Phase164 also used a temporary MySQL database smoke to verify `parties` and `party_invites` table writes, then dropped that database.

## Next Slice

A good follow-up is server chat transport:

- persist/send `附近` and `队伍` chat messages through Node
- make `队伍` chat require server party membership
- expose a short message history endpoint
- keep normal UI clean while logging diagnostics outside the player view
