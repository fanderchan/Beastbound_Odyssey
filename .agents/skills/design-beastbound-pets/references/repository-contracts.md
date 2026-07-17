# Beastbound pet repository contracts

## Contents

- Source-of-truth map
- Runtime ownership
- Design-to-file routing
- Current gaps
- Validation routing

## Source-of-truth map

| Concern | Current source |
| --- | --- |
| Taxonomy, elements, form defaults, capture difficulty | `client/godot/data/pet_templates.json` |
| Species Lv1/growth distributions and observation thresholds | `client/godot/data/balance/pet_growth_species_profiles.json` |
| Global capture-level hidden-growth tail policy | `client/godot/data/balance/pet_growth_species_profiles.json#wildCaptureGrowthPolicy`, `server/node/src/auth/wild-capture-growth-selection.js` |
| Legacy broad growth profiles | `client/godot/data/balance/pet_growth_profiles.json` |
| Active actions and effect payloads | `client/godot/data/battle_actions.json` |
| Family passive definitions | `client/godot/data/battle_passive_skills.json` |
| Trainable skill prices/availability | `client/godot/data/pet_skill_training.json` |
| Capture formula | `client/godot/data/balance/capture_formula.json` |
| Capture tools | `client/godot/data/capture_tools.json` |
| Encounter zones and wild pools | `client/godot/data/*_map.json` |
| Region grouping and advertised encounter groups | `client/godot/data/map_regions.json` |
| Level-route intent | `client/godot/data/balance/progression_zones.json` |
| Map ID registration | `client/godot/scripts/world/map_data_catalog.gd` |
| Client template resolution/validation | `client/godot/scripts/battle/pet_template_catalog.gd` |
| Encounter selection | `client/godot/scripts/world/encounter_model.gd` |
| Growth instance/observation | `client/godot/scripts/progression/pet_individual_growth_model.gd`, `pet_growth_observation_model.gd` |
| Lv20 observed-growth dry-run (manual owned-pet evaluation only; not capture automation) | `server/node/src/auth/pet-observed-growth-rule-preview.js`, `client/godot/scripts/progression/pet_growth_rule_preview_model.gd`, `client/godot/scripts/ui/pet_growth_rule_preview_presenter.gd`; currently persisted under the legacy `autoCaptureSettings.growthRulePolicy` location pending UI relocation |
| Versioned cross-runtime growth algorithm (P0.2 shadow only) | `client/godot/scripts/progression/pet_growth_authority_model.gd`, `server/node/src/auth/pet-growth-authority.js`, `tools/fixtures/pet_growth_authority_v1_vectors.json` |
| Strict server species-growth catalog (P0.2 shadow only) | `server/node/src/auth/pet-growth-catalog.js`; fixed-path reader over shared JSON, new-pet active-profile selection, and existing-instance historical-profile resolution |
| Pure server v1 initialization, validation, and level settlement (P0.2 shadow only) | `server/node/src/auth/pet-growth-runtime.js` |
| Pet profile state, skills, safety, GM tools | `client/godot/scripts/progression/player_progress_model.gd` and focused models |
| Client battle interpretation | `client/godot/scripts/battle/` catalogs/models |
| Server authoritative battle/capture/profile settlement | focused `server/node/src/auth/` domains where present; legacy wiring/rules remain in `server/node/src/auth-service.js` |
| Player-visible pet/profile projection (P0.2 shadow only) | `server/node/src/auth/profile-visibility.js` |
| Server pet growth marker and client public projection (P0.2 shadow only) | `server/node/src/auth/profile-visibility.js`, `client/godot/scripts/progression/pet_growth_public_projection_model.gd` |
| Godot server-profile pet projection and cache cleaning (P0.2 shadow only) | `client/godot/scripts/progression/server_pet_profile_projection_model.gd`, `server_profile_cache_model.gd` |
| Cryptographic private pet seed primitive | `server/node/src/auth/pet-private-seed.js` |
| New production pet private identity and known-Lv1 fact initialization | `server/node/src/auth/pet-private-state.js`; wired by the focused creation paths in `server/node/src/auth-service.js` |
| Encounter-time private capture candidate, roll, claim, and exact materialization | `server/node/src/auth/pet-capture-candidate-authority.js`; prepared by `auth/battle-room.js` and settled through `auth-service.js` |
| Persistent profile storage | `server/node/src/mysql-store.js` plus normalization/persistent snapshot contracts |

Do not create a parallel pet catalog. Extend shared data and focused consumers.

## Runtime ownership

The Node server reads several client JSON files directly. Treat form, action, passive, item, map/group, and balance IDs as cross-runtime contracts.

For a server session:

- Client submits intent, such as target, action, capture tool, or setting change.
- Server validates ownership/state, derives randomness/rewards/stats, persists the result, increments revision, and returns authoritative state/events.
- Client applies the returned profile/battle event list and presents mapped Chinese text.
- A player response must never contain private growth seed, roll, continuous accumulator, exact hidden quality, or a reconstruction path. Only Lv1 4V, current visible stats, and evidence-based observation belong in the public view.

Do not implement a pet mutation only in `PlayerProgressModel.save_profile()` for online players. Do not enable `PUT /profiles/me` or trust client-reported pet fields.

## Design-to-file routing

### New form in an existing subtype

- Add one `forms[]` row in `pet_templates.json`.
- Add a species growth profile and `growthSpeciesProfileId` for a long-term pet.
- Add explicit world/reward acquisition.
- Update codex/player-facing data only through existing catalogs.
- Add template, growth, encounter/capture, and server settlement coverage.

### New subtype in an existing line

- Add one subtype with battle role and default active skills.
- Reuse the line's single family passive.
- Add one or more forms and the form workflow above.

### New line

- Add a line and one fully implemented family passive.
- Add at least one subtype and form.
- Add client/server passive execution before assigning it.
- Add hover/event text and parity tests.

### New active skill

- Add an action to `battle_actions.json` with owner `pet_skill`, unique slot semantics, target, and effect.
- Extend focused client/server interpreters for any new effect type.
- Decide training availability, AI policy, capture-mode behavior, and inheritance eligibility.
- Extend the catalog script and targeted battle tests.

### New passive

- Add the passive definition and a focused handler for every effect field.
- Assign it at line level under the current taxonomy.
- Add immunity/resistance/ordering/switch/death and N-vs-N tests.

### New wild placement

- Edit the registered map's `encounterZones` and `wildPetPool`.
- Keep `encounterGroupId` stable for server rewards/quests/hang.
- Treat the client request as identifier-only intent. The Node encounter authority reloads the registered map, validates the server-held map/cell or nearby interaction, and owns form, level, count, battle stats, capture fields, skills, and EXP.
- Verify map-region/progression references and return path.
- Calculate per-enemy and per-encounter Lv1 appearance probability.

### New reward/commercial/evolution/fusion acquisition

- Use a focused authoritative server transaction with stable receipt and replay protection.
- Update item/reward/route catalogs as applicable.
- Preserve instance history, consume materials atomically, and add persistence tests.
- Pause for unresolved paid value, refund, destructive material, or migration rules.

## Current gaps

- All 32 current production forms link to species-specific authority-v1 growth profiles; historical pets without an authority envelope may still remain legacy and must not be rerolled.
- Protocol v2 now makes public pet/profile projection the service response boundary. Battle pets, riding pets, and world pet-EXP items share the enabled authority-v1 dispatcher; legacy pets keep level/EXP-only behavior, while unknown or damaged authority state fails closed without falling back to a legacy writer.
- New pets use the strict server new-pet factory. Player rebirth rewards, world eggs, MM rewards, and encounter-time capture candidates are connected. Every catchable wild actor freezes a private Lv1 candidate, applies the global capture-level hidden-growth tail policy, settles that same pet to the encounter level, and synchronizes its intrinsic combat facts before the room is published. A successful capture claims and materializes that unchanged individual instead of rolling again.
- Authority-v1 MM rebirth uses the dedicated server growth-cycle reset: validate the target and exact client-confirmed helper before the roll, retain private identity/Lv1 facts/initial cultivation, atomically rebuild level/continuous/public/root state at Lv1 with the cumulative growth bonus, then consume the helper. Legacy pets keep their existing reset path and are not silently upgraded.
- The Godot v2 login path cleans both server caches but never loads either before the first fresh pull. Every full server profile passes strict projection, marker-aware no-RNG normalization, and dedicated public-cache publication. Growth UI shows only Lv1/current evidence and observed grades, never an exact hidden Lv140 result.
- Historical legacy Lv2+ pets may have no persisted Lv1 4V. Preserve those existing instances and mark observation unavailable; never invent their missing history from an instance ID. New authority captures begin as real Lv1 candidates, preserve authentic Lv1 4V, then deterministically settle the same individual to the wild level before combat.
- Local/offline legacy growth tools can still derive precise Lv140 values for QA. Server-marker pets must stay on the evidence-only observation path.
- Lv20 retention rules have a bounded no-mutation preview, but the product decision now keeps trained-pet judgment in the owned-pet panel. This preview is not permission for capture automation to train, move, discard, or consume a pet; its legacy settings placement should be relocated rather than expanded.
- Encounter pools live in map files; there is no standalone `encounter_tables.json` source.
- Current taxonomy allows one family passive and subtype default active skills. Fusion inheritance needs a new per-instance authoritative contract.
- Distinct pet actions currently require globally unique preferred slots; all seven slots are occupied, so expand the catalog/slot contract before adding new active skill IDs.
- Server passive semantics are incomplete relative to client presentation for some effects; verify handlers before reuse.
- Online party encounter requests now carry only zone/interaction intent plus a server-issued one-time permit under protocol v3; client pet/count/stat/capture/EXP facts are ignored. Encounter-time candidates use independent CSPRNG identities and capture secrets that never enter public rooms, events, records, or profiles.
- A full five-pet party plus twenty-pet stable is rejected before the capture roll and tool spend; an internal out-of-band race falls back to temporary overflow storage rather than deleting the claimed pet. Player-facing recovery/audit for historical overflow and a safe server-authoritative auto-discard policy remain P1.1 work.
- Formal evolution and fusion runtime data/contracts are roadmap work, not established sources of truth.

Do not hide these gaps with fallback data in a new pet. Either close the relevant gap in the same slice or mark the feature deferred and avoid claiming completion.

## Validation routing

Useful existing checks include:

- `node tools/battle_action_catalog_check.mjs`
- `--auto-balance-catalog-check`
- `--auto-pet-template-catalog-check`
- `--auto-pet-growth-observation-check`
- `--auto-pet-growth-threshold-check`
- `--auto-pet-growth-species-simulation-check`
- `--auto-pet-growth-authority-check`
- `--auto-pet-encounter-table-check`
- `--auto-capture-tools-check`
- `--auto-capture-settings-check`
- `--auto-pet-growth-rule-preview-check`
- `--auto-pet-skill-training-check`
- `--auto-pet-management-safety-check`
- closest server battle-room/profile-action/storage tests
- `node --test server/node/test/pet-growth-authority.test.js server/node/test/pet-growth-catalog.test.js server/node/test/pet-growth-runtime.test.js server/node/test/auth-profile-visibility.test.js server/node/test/pet-private-seed.test.js server/node/test/pet-private-state.test.js`
- `node --test server/node/test/pet-capture-candidate-authority.test.js server/node/test/auth-battle-room.test.js`
- `node --test server/node/test/pet-observed-growth-rule-preview.test.js server/node/test/auth-auto-capture-settings.test.js`

Use `tools/run_godot_auto_checks.mjs --only <flags> --fail-fast` for selected client checks. Run the full local CI only for a genuine release/export gate or explicit user request.
