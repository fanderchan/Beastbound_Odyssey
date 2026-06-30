# Phase 183: LAN Playtest Ops And Accounts

## Current Local Server

The local MySQL-backed Node server should be managed from:

```sh
cd /Users/fander/projects/Beastbound_Odyssey/server/node
npm run ops -- status
npm run ops -- start
npm run ops -- stop
npm run ops -- restart
npm run ops -- backup
```

`status` prints the LAN URL, health check result, and MySQL row counts. `backup` writes a SQL dump under `server/node/.local/backups/`, which is intentionally ignored by git.

## Seeded Test Accounts

GM account:

```text
auth1373 / test1234
```

- Role: `gm`
- Profile: Lv131, 5 rebirths, 7 pets
- Purpose: GM tools, migration verification, high-level battle/profile testing

Normal account:

```text
auth3422 / test1234
```

- Role: `player`
- Profile: Lv1, 0 rebirths, 4 pets
- Purpose: ordinary player permissions, two-client party/PK testing

## Two-Client Local Launch

Terminal 1:

```sh
cd /Users/fander/projects/Beastbound_Odyssey
godot --path client/godot --scene res://scenes/Main.tscn -- --server-url http://127.0.0.1:8787 --login auth1373 test1234
```

Terminal 2:

```sh
cd /Users/fander/projects/Beastbound_Odyssey
godot --path client/godot --scene res://scenes/Main.tscn -- --server-url http://127.0.0.1:8787 --login auth3422 test1234
```

For another computer on the same LAN, replace `127.0.0.1` with the host Mac LAN IP shown by:

```sh
ipconfig getifaddr en0 || ipconfig getifaddr en1
```

## Manual Test Checklist

1. Both clients log in and enter the world without a local-only account screen.
2. GM client shows GM-only tools; normal player does not.
3. Both clients stand on the same map near each other.
4. Move one client step by step and confirm the other client sees position changes.
5. Test party invite and party application from the player interaction UI.
6. Stand on adjacent cells, start a duel, and accept it on the other client.
7. In battle, submit player command and then pet command; the 99-second timer is shared for player and pet.
8. Target the enemy pet with a pet skill; visual hit, damage text, and battle log should all refer to the pet.
9. Use “离开” and confirm both clients return to the map cleanly.
10. Run `npm run ops -- backup` after a good test state.

## Known Limits

- The current server is suitable for LAN playtests, not public internet operation.
- Profile data is still stored as a JSON document mirrored into MySQL inspection tables.
- Battle result HP/reward/punishment profile writeback is not complete yet.
- Full 5-pet team battle, item use, capture, switch pet, and equipment/inventory authority still need future phases.
- Movement still needs server-side map collision, player collision, speed validation, transfer authority, and party follow.
