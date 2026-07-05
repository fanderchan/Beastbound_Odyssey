# Phase 200: Stage 6 Content And Economy Loop

Date: 2026-07-04

## Scope

This slice completes the quality cleanup plan's Stage 6 by returning to `stoneage_gap_plan.md` content iteration:

- G1.3: expanded consumables and quest items.
- G1.4: added two side NPC types in 火芽村入口.
- G2.1: replaced the player-facing trade flow with a server-authoritative trading post/market v1 after manual acceptance feedback.
- G2.3: added bank/warehouse NPC and server-authoritative item/coin storage v1.

No art assets were changed or replaced.

## Content Additions

- Added trail and pet-healing consumables:
  - `trail_ration_pack`
  - `item_pet_salve_mid`
  - `item_pet_salve_large`
  - `encounter_stone_patrol`
- Added quest-only items:
  - `quest_welfare_token`
  - `quest_field_note`
- Expanded the 火芽村道具铺 inventory with the new consumables.
- Added two optional side NPCs:
  - 福利员阿檀, `firebud_welfare_clerk`
  - 说书人阿舟, `firebud_storyteller`
- Added two optional talk quests:
  - `side_firebud_welfare_chat`
  - `side_firebud_story_note`

## Economy Contracts

- Bank data is stored on the server-owned profile as `profile.bank`.
- Bank deposits and withdrawals move only server-owned stone coins and backpack items.
- Bank UI is available from 仓库员阿衡, `firebud_bank_keeper`.
- The player-facing trade flow is now a trading post opened from the bottom `买卖` button.
- Market listings are server-authoritative:
  - listing creation immediately moves listed items out of the seller backpack
  - purchase atomically moves currency, tax, and items
  - cancellation returns listed items to the seller backpack if space is available
  - buyer cannot purchase their own listing
- Default transaction tax is 1% (`100` basis points), rounded up and capped at the total price.
- GM market tax configuration is available through `/gm/market/config` and requires `gm_market_tax` command authorization.
- `marketConfig.itemTaxBps` supports per-item tax overrides for custom economic tuning.
- Legacy `/trade/*` routes remain for compatibility tests, but ordinary UI no longer exposes face-to-face trade controls.

## Deferred

- No stalls, black market, gambling NPC, or item exchange NPC was added.
- No art replacement was done; existing placeholder/`artPlan` behavior remains unchanged.
- G2.7 item exchange NPC remains a future optional F2 item.

## Validation

```bash
node -e "const fs=require('fs'); for (const f of ['client/godot/data/bag_items.json','client/godot/data/item_shops.json','client/godot/data/firebud_village_gate_map.json','client/godot/data/quests.json']) JSON.parse(fs.readFileSync(f,'utf8')); console.log('json ok')"
node --check server/node/src/auth/economy.js && node --check server/node/src/auth-service.js && node --check server/node/src/auth/mail-chat.js && node --check server/node/src/http-server.js && node --check server/node/test/auth-economy.test.js
node --test server/node/test/auth-economy.test.js server/node/test/auth-storage.test.js server/node/test/auth-http-server.test.js
node tools/run_godot_auto_checks.mjs --only --auto-market-panel-check,--auto-stage6-content-check --fail-fast --timeout-ms 180000
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 180 -- --perf-probe
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --movement-perf-check --perf-probe
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --movement-spam-click-check --perf-probe
```

Targeted validation passed:

- JSON parse for modified content files.
- Server economy/storage/http tests passed, including market listing sale, default 1% tax, item tax override, cancellation, GM tax command gating, MySQL persistence, and HTTP route coverage.
- Stage 6 Godot content check includes items, shop, quests, optional side NPCs, facility markers, bank panel, the `买卖` market entry, market panel structure, and removal of old player interaction trade controls.
- Market panel visual QA screenshot: `.run/godot/market_panel00000003.png`.
- Broader Godot targeted checks passed 10/10 in `.run/godot_auto_checks/2026-07-04T20-15-45-716Z_summary.json`.
- Perf spot checks stayed in the expected low range: idle stable `process_total` around 0.24-0.30ms, moving stable around 0.11-0.22ms, movement spam `status=ok max_input_us=188 coalesced=true settled=true`.
