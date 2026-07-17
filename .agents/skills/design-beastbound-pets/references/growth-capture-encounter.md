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

New pets now use the authority-v1 species-profile path across capture, experience, GM leveling, and rebirth-cycle settlement. Historical pets may deliberately remain legacy; never reroll them merely to make them eligible for a new automation feature.

The formal Lv1 4V proxy is the immutable authority-v1 `initialStats` / `growthSpeciesLevel1Stats` map (blood, attack, defense, quick). It is not a hidden final-quality score and must remain identical across both public fields.

Store immutable identity once on the server. Never reroll it on login, UI open, reconnect, offline挂机, or GM level-up. Use versioned fields and fixed-seed golden vectors.

For current production creation paths, route new pets through `server/node/src/auth/new-pet-factory.js`. Wild capture candidates always begin as a real Lv1 authority pet, preserve both `initialStats` and `growthSpeciesLevel1Stats`, then settle that same individual to the encounter level. Therefore a newly captured Lv2+ pet still has authentic historical Lv1 facts; never reconstruct them from its current stats or manually compose a seed.

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
- Lv20: after 19 observed upgrades, obvious good/bad individuals are usually separable for a player's manual decision, but exact hidden value is still not reversible.
- Later levels: narrower estimate and more stable grade.
- GM/QA: exact seed, hidden roll, theoretical outcome, and percentile allowed.

The current retention-preview policy has five 0..100 integer minimums: overall power growth percentile plus blood, attack, defense, and quick growth percentiles. It is a no-mutation observation aid for the owned-pet panel, not part of capture automation. The capture tab handles only finding, net use, and newly captured pets; it must not auto-level a pet to Lv20 or dispose of trained pets.

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

Online encounter creation is server-authoritative: the client sends map/zone/interaction intent, while the server chooses form, level, count, capture facts, combat stats, and EXP from the registered encounter catalog and one-use permit.

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

For a catchable actor, do not keep a separate static combat-stat roll. Generate the private pet candidate first, settle it to the encounter level, and copy that same individual's max HP, attack, defense, quick, elements, and skills into the battle actor before the room is published. On capture, transfer the frozen individual rather than rolling again. Its current-level intrinsic stats and authentic Lv1 4V must therefore agree before and after capture; only transient battle HP may differ after taking damage.

## Capture-level hidden-growth conditioning

Lv1 hunting remains the best route to exceptional growth without coupling Lv1 4V to hidden growth. Apply one global policy relative to each species' own hidden-growth range:

- Lv1 accepts the first ordinary species roll unchanged.
- Selection quality uses only hidden per-level bonuses with the standard `maxHp/4 + attack + defense + quick` weights. It never reads `initialBonus` or Lv1 4V.
- Values at or below the species median retain full weight. Values above the median receive progressively lower acceptance weight as capture level rises.
- The uppermost value retains a strictly positive lottery weight; no level makes a jackpot impossible.
- Runtime uses bounded rejection sampling and, after the hard limit, chooses the least powerful attempted hidden-growth roll. Never run population sampling in an encounter request.

The v1 pressure and upper-tail weight are:

```text
pressure(L) = 0                                      when L = 1
pressure(L) = (L - 1) / ((L - 1) + 9)               when L > 1
upper(q) = (q - 0.5) / 0.5                          for q > 0.5
accept(q, L) = 1                                     for q <= 0.5
accept(q, L) = 0.0001 ^ (pressure(L) * upper(q)^1.2) for q > 0.5
```

Here `q` is the individual's normalized hidden-growth power within its species, not a player-visible final quality score. The configured hard limit is eight draws.

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

- Define whether auto-capture should target species, encounter level, element, quantity, or codex state.
- Only a genuinely captured Lv1 wild pet may use per-stat public Lv1 4V percentiles for immediate handling. A Lv2+ capture defaults to retain/manual review.
- Each percentile is the inclusive CDF within that pet's own species profile: `P(same-species Lv1 visible stat <= this value)`. Higher is better. Evaluate blood, attack, defense, and quick independently; a minimum of `0` disables that stat. Never compare raw Lv1 numbers across species.
- The Lv1 percentile calculator may read only public `outputBase`, `initialOutputSpread`, `distribution`, `rareExtremeRate`, and the captured public four-stat snapshot. It must not read `growthOutputSpread`, `innateGrowthBonus`, hidden seeds/rolls, or Lv140 projections.
- The owned-pet panel keeps these four Lv1 percentiles visible from the immutable historical Lv1 snapshot at every later level. Display them separately from observed-growth percentiles; one chart must not replace, average, rank, or color the other.
- Old schema-v1 raw min/max settings are not mathematically convertible across species. Preserve the non-stat public filters but migrate all four raw bounds to disabled `0` percentiles.
- When a capture target exists, ensure pet/party AI does not accidentally kill it.
- Never read hidden growth, predict Lv140, or auto-train to Lv20 in the capture tab. Growth-based keep/discard remains a manual owned-pet-panel decision.
- Never auto-discard locked, task, riding, cultivated, bound, paid, rare reward, or inheritance-relevant pets.
- Keep a player-visible recent-action log and GM audit path before enabling high-value automatic discard.
- Until that recoverable record exists, both matched and unmatched percentile results remain recommendations and `retainPet=true`; do not silently turn a threshold edit into destructive release.
- Treat full party + full stable as a pre-capture block. Do not spend the capture turn or tool when the player has no capacity; technical recovery remains invisible and only reconciles exceptional already-claimed snapshots.

Calculate false-discard rates from the same species simulation used for quality thresholds.

## Validation

For a finalized species profile:

- Simulate at least 10,000 pets Lv1 to Lv140 offline.
- Inspect Lv1 four stats, Lv20 observation behavior, Lv140 four stats/power, per-level gains, grade distribution, and tail rates.
- Test fixed seeds at Lv1, Lv2, Lv20, Lv80, and Lv140 in client and server.
- Test normal battle EXP, online挂机, offline挂机, GM level, reconnect, restart, rebirth, evolution, and fusion paths as applicable.
- Audit old-pet migration with before/after counts, IDs, seeds, visible stats, skills, and value bands.
- Simulate encounter time and capture attempts using actual zone and tool configuration.
- Across every species profile, audit capture levels against the Lv1 baseline: hidden-growth mean, top-5%/top-1% tail, non-zero jackpot count, Lv1 4V drift, average attempts, and the hard attempt bound.
- Run `node tools/pet_level_one_percentile_audit.mjs`; it compares the analytic rounded-visible Lv1 CDF against 10,000 deterministic authority rolls for every current profile.
- Test that the battle actor and captured pet share form, level, max HP, attack, defense, quick, elements, and skills, while ordinary battle damage to current HP remains valid.
