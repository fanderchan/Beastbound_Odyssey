# Release Playability Walkthrough

Date: 2026-07-03
Commit: `c0f9f6d6ab70ddf8f2297541821f7a26daf37e17`
Server: local MySQL backend at `http://127.0.0.1:8787`

## Scope

This walkthrough checks the first playable release path:

1. New account registration and login.
2. Startup login into the normal world.
3. New-player quest chain.
4. Grass encounter entry.
5. Battle capture and post-capture destination feedback.
6. Party invite / accept / leave.
7. Duel invite, battle room readiness, and one server-authoritative turn.
8. Player rebirth trial execution.
9. Pet MM rebirth guide and execution.

The run used existing headless checks for repeatability. It does not replace final human acceptance for PC visual feel, first-session readability, or release-art polish. Phone/tablet ergonomics are deferred compatibility work for now.

## Environment Evidence

- `npm run ops --prefix server/node -- status`: `ok=true`, local URL `http://127.0.0.1:8787`, MySQL database `beastbound_odyssey`, app user `beastbound_app`.
- `node tools/run_godot_auto_checks.mjs --only ...`: 13/13 checks passed.
- Summary: `.run/godot_auto_checks/2026-07-03T07-32-26-346Z_summary.json`
- Log: `.run/godot_auto_checks/2026-07-03T07-32-26-346Z.log`

## Result Matrix

| Step | Check | Result | Evidence |
| --- | --- | --- | --- |
| Registration / login | `--auto-auth-server-live-check` | Pass | `auth=true sync=true account_panel=true state=ready message=已读取服务器档案。` |
| Startup login | `--auto-startup-login-check` | Pass | `auth=true sync=true panel_hidden=true world=true state=ready` |
| New-player quest chain | `--auto-quest-chain-check` | Pass | `talk_claim=true buy=true use_meat=true equip=true victory=true capture=true rebirth_quest=true final_task=当前没有任务` |
| Grass encounter | `--auto-encounter-check` | Pass | `zone_found=true arrived_zone=true battle_started=true closed=true zone_id=village_grass` |
| Capture action | `--auto-battle-capture-check` | Pass | `event=capture success=true popup=true returned_to_map=true` |
| Capture destination feedback | `--auto-pet-capture-feedback-check` | Pass | Captured pet joins party when there is space; full party sends captured pet to stable with Chinese feedback |
| Party flow | `--auto-party-live-check` | Pass | `online=true invite=true seen=true accept=true ui=true leave=true` |
| Duel room | `--auto-battle-room-live-check` | Pass | `positions=true stream=true invite=true state=true ready=true room=true` |
| Duel turn | `--auto-server-battle-turn-live-check` | Pass | `actors=true submitted=true turn=true turn_event=true playback=true round=true` |
| Player rebirth | `--auto-player-rebirth-execute-check` | Pass | `execute=true confirm=true ui=true count=1 level=1 log=完成一转。等级回到 Lv1，基础能力已重算。` |
| Rebirth trial rewards | `--auto-rebirth-trial-execute-check` | Pass | `stage1=true stage5=true reward=true` |
| Pet MM rebirth | `--auto-pet-rebirth-mm-check` | Pass | `catalog=true buy_stone=true feed=true rebirth=true stage2_claim=true guide_available=true` |

## Blocking Issues

None found in the automated first-play path.

## Wording Issues

No English error codes, raw debug ids, or agent-only validation strings appeared in the checked player-facing success messages. The sampled Chinese messages were readable:

- `已读取服务器档案。`
- `完成任务「认识训练师」，获得20石币、肉 x2。`
- `捕获野生乌力 Lv1，战力127，已加入队伍。`
- `队伍已满，已送入兽栏。`
- `完成一转。等级回到 Lv1，基础能力已重算。`

## Follow-Up Watch Items

- The local MySQL database contains many historical test accounts, so online roster counts are noisy in local evidence. Before an external demo, run against a clean seed database or a clearly labeled demo database.
- The run is headless. Human acceptance should still verify PC feel, first-session readability, and whether the procedural placeholder visuals are acceptable for the intended release bar. Phone/tablet feel and tap targets are non-blocking future compatibility notes unless PC behavior is also affected.
- E4 identified remaining placeholder art across player, pet, map, battle, and UI presentation. This is not a flow blocker, but it is still a release-positioning decision.
