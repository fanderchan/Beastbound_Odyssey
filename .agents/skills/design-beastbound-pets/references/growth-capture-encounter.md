# Growth, Lv1 4V, encounter, and capture design

## Contents

- Growth truth
- Species profile contract
- Observation contract
- Encounter probability
- Capture probability
- Automatic capture and discard
- Validation

## Growth truth

Preserve the intended loop:

1. Find a rare chance to meet the desired species at Lv1.
2. Capture it and immediately inspect visible Lv1 4V.
3. Train it while hidden per-level quality produces evidence.
4. Around Lv20, decide whether to keep, sell, continue, or discard.
5. Pursue Lv140, rebirth luck, evolution, fusion, and inherited builds.

The current repository has both a legacy generic individual-growth path and a species-profile path. P0.2 intends to unify server/client facts. Until that lands, never claim a newly added pet is fully authoritative merely because the client simulator works.

There is not yet an independent, formally defined `4V` field or formula. Current code uses Lv1 `initialStats` / `growthSpeciesLevel1Stats` (blood, attack, defense, quick) as the practical proxy. A new pet may design those ranges, but must not silently establish a permanent global 4V meaning before P0.2 approves it.

Store immutable identity once on the server. Never reroll it on login, UI open, reconnect, offline挂机, or GM level-up. Use versioned fields and fixed-seed golden vectors.

## Species profile contract

Runtime forms link through `growthSpeciesProfileId` to `client/godot/data/balance/pet_growth_species_profiles.json`.

Define:

- `profileId`, `displayName`, `formId`, `formName`, `familyRole`.
- `outputBase`: visible Lv1 `maxHp/attack/defense/quick` before individual spread.
- `outputGrowth`: expected visible per-level growth.
- `individualRules.initialOutputSpread`: species-specific Lv1 4V spread.
- `individualRules.growthOutputSpread`: species-specific hidden growth spread.
- `individualRules.distribution`: usually `weighted_center`; use `uniform` only intentionally; use `rare_spike` for a declared long-tail design.
- `targetAudit`: Lv1 ranges, HP growth, three-stat growth, Lv140 power, role-specific limits, and expected quality rates.
- `growthObservation`: offline percentile tables. Never sample a population in live UI.

Treat HP separately from attack/defense/quick. A speed pet can be an S-quality speed pet without outranking a tank in global combat power.

The current reference band for StoneAge-like ordinary pets is roughly `attack + defense + quick = 4.1..5.2` growth per level, but this is an anchor, not a universal requirement. Explain every deviation by role and acquisition tier.

## Observation contract

Randomness belongs to the authoritative growth process; evaluation interprets observed evidence. Do not add fresh cosmetic randomness to the grade itself.

Player-facing behavior should follow:

- Lv1: visible 4V; growth evidence unavailable or very broad.
- Early levels: unstable tendency and wide Lv140 estimate range.
- Around Lv20: obvious good/bad individuals usually separable, but exact hidden value still not reversible.
- Later levels: narrower estimate and more stable grade.
- GM/QA: exact seed, hidden roll, theoretical outcome, and percentile allowed.

If per-level gains become stochastic around a hidden mean, derive each level roll deterministically from immutable pet seed + growth version + stat + level. This prevents reconnect/save-scumming while preserving visible variation.

Do not use stored hidden roll to render a supposedly observed player forecast. Generate player estimates only from allowed observed history and species priors.

## Encounter probability

Encounter zones live in individual `*_map.json` documents. A typical zone controls:

- `encounterRate`: chance checked by the movement encounter loop.
- `enemyCount` or `enemyCountMin/enemyCountMax`.
- `individualWildPets`: whether each enemy independently samples the pool.
- `encounterGroupId`: stable quest/reward/server source ID.
- `wildPetPool`: forms, weights, level ranges, battle stats, and optional capture overrides.

The current picker first chooses a form by relative weight, then chooses an integer level uniformly from `levelMin..levelMax`.

Current online encounter creation still accepts a client-composed encounter payload containing form, level, battle stats, capture flags/overrides, and EXP. Treat this as a release-blocking authority gap: production pet placement is incomplete until the server selects or validates the encounter from authoritative map/group data or a signed one-use encounter token.

For one independently sampled enemy:

```text
P(form) = formWeight / sum(all positive pool weights)
P(Lv1 | form) = 1 / (levelMax - levelMin + 1), when levelMin <= 1 <= levelMax
P(form and Lv1) = P(form) * P(Lv1 | form)
```

Do not call a pet “1% Lv1” merely because its pool weight is 1. Include level range, enemy count, encounter rate, and whether the whole group shares one selected form.

For a group with `n` independent enemies and per-enemy target probability `p`:

```text
P(at least one target) = 1 - (1 - p)^n
```

When enemy count varies, simulate the actual configured distribution. Also estimate expected movement checks/time per Lv1 appearance so rarity is understandable in player minutes, not just percentages.

Keep world battle stats separate from captured individual Lv1 stats. Wild battle actors may be Lv10+, while a successful capture must follow the approved capture-level rule and server growth contract.

## Capture probability

The shared formula is in `client/godot/data/balance/capture_formula.json`; tools are in `capture_tools.json`. Client and server currently use the same shape:

```text
chance = baseChance
       - hpRatio * hpRatioPenalty
       - (captureDifficulty / 100) * difficultyRatioPenalty
       + toolChanceBonus
       + statusBonuses
chance = clamp(chance, minChance, maxChance)
```

`captureDifficulty` controls form difficulty; pool weight and level range control encounter rarity. Do not make a pet frustrating by independently maximizing all three.

`capturePower` currently orders automatic fallback tools; it does not change capture probability. `toolPowerWeight` exists in data but is not consumed by the current chance formula. Do not balance around either field as if it were active probability math.

For every design, report a small table for full HP, half HP, and near-zero HP using empty hand and the common intended tool. Include the expected status setup if the pet is designed around sleep, stone, confusion, poison, or a special capture tool.

Use `captureChanceOverride` only for a deliberate special rule. An override bypasses the normal HP/difficulty/tool calculation and therefore needs explicit player messaging and server tests.

## Automatic capture and discard

Design the pet together with existing挂机 behavior:

- Define whether auto-capture should target species, level, element, 4V, quantity, or codex state.
- When a capture target exists, ensure pet/party AI does not accidentally kill it.
- Hidden growth must not be used by auto-discard before enough observable evidence exists.
- Never auto-discard locked, task, riding, cultivated, bound, paid, rare reward, or inheritance-relevant pets.
- Keep a player-visible recent-action log and GM audit path before enabling high-value automatic discard.
- Treat full party + full stable as a value-loss case. The current server can place an overflow capture in `lostCapturedPets` rather than a recoverable pet slot; do not ship a rare/paid capture path without a temporary holding or recovery rule.

Calculate false-discard rates from the same species simulation used for quality thresholds.

## Validation

For a finalized species profile:

- Simulate at least 10,000 pets Lv1 to Lv140 offline.
- Inspect Lv1 four stats, Lv20 observation behavior, Lv140 four stats/power, per-level gains, grade distribution, and tail rates.
- Test fixed seeds at Lv1, Lv2, Lv20, Lv80, and Lv140 in client and server.
- Test normal battle EXP, online挂机, offline挂机, GM level, reconnect, restart, rebirth, evolution, and fusion paths as applicable.
- Audit old-pet migration with before/after counts, IDs, seeds, visible stats, skills, and value bands.
- Simulate encounter time and capture attempts using actual zone and tool configuration.
