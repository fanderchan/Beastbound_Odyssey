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
| Pet profile state, skills, safety, GM tools | `client/godot/scripts/progression/player_progress_model.gd` and focused models |
| Client battle interpretation | `client/godot/scripts/battle/` catalogs/models |
| Server authoritative battle/capture/profile settlement | focused `server/node/src/auth/` domains where present; legacy wiring/rules remain in `server/node/src/auth-service.js` |
| Persistent profile storage | `server/node/src/mysql-store.js` plus normalization/persistent snapshot contracts |

Do not create a parallel pet catalog. Extend shared data and focused consumers.

## Runtime ownership

The Node server reads several client JSON files directly. Treat form, action, passive, item, map/group, and balance IDs as cross-runtime contracts.

For a server session:

- Client submits intent, such as target, action, capture tool, or setting change.
- Server validates ownership/state, derives randomness/rewards/stats, persists the result, increments revision, and returns authoritative state/events.
- Client applies the returned profile/battle event list and presents mapped Chinese text.

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
- Verify map-region/progression references and return path.
- Calculate per-enemy and per-encounter Lv1 appearance probability.

### New reward/commercial/evolution/fusion acquisition

- Use a focused authoritative server transaction with stable receipt and replay protection.
- Update item/reward/route catalogs as applicable.
- Preserve instance history, consume materials atomically, and add persistence tests.
- Pause for unresolved paid value, refund, destructive material, or migration rules.

## Current gaps

- Only a minority of forms currently link to species-specific growth profiles; the rest use legacy generic growth.
- Client growth and server EXP/stat settlement are not yet one complete P0.2 truth.
- Current player growth UI can derive precise Lv140 values from stored hidden roll; intended observation should be evidence-driven.
- Encounter pools live in map files; there is no standalone `encounter_tables.json` source.
- Current taxonomy allows one family passive and subtype default active skills. Fusion inheritance needs a new per-instance authoritative contract.
- Distinct pet actions currently require globally unique preferred slots; all seven slots are occupied, so expand the catalog/slot contract before adding new active skill IDs.
- Server passive semantics are incomplete relative to client presentation for some effects; verify handlers before reuse.
- Online party encounters currently accept client-supplied wild form, level, stats, capture overrides, and EXP; do not treat a map JSON placement as secure server authority.
- Full pet party and stable can turn a successful capture into a non-recoverable `lostCapturedPets` record; rare/paid capture design needs overflow recovery.
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
- `--auto-pet-encounter-table-check`
- `--auto-capture-tools-check`
- `--auto-capture-settings-check`
- `--auto-pet-skill-training-check`
- `--auto-pet-management-safety-check`
- closest server battle-room/profile-action/storage tests

Use `tools/run_godot_auto_checks.mjs --only <flags> --fail-fast` for selected client checks. Run the full local CI only for a genuine release/export gate or explicit user request.
