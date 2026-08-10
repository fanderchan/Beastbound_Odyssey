# Skill Design Contract

Use one contract per skill or tightly related skill family. A valid contract answers
every field below before runtime work begins.

## Contents

- [Delivery State](#delivery-state)
- [Identity And Acquisition](#identity-and-acquisition)
- [Mechanics](#mechanics)
- [AI](#ai)
- [Counterplay](#counterplay)
- [Presentation](#presentation)
- [Authority And Tests](#authority-and-tests)

## Delivery State

- `deliveryStatus`: `blocked`, `ready_for_implementation`, `implemented`,
  `owner_review_pending`, or `approved`.
- `blockers`: concrete unresolved product/runtime facts; required when blocked and
  empty at every non-blocked state.
- Never use `TBD`, `无`, `-`, or similar placeholders to make validation pass.
- `implemented` and later states require verified effect support. Player-visible
  approval additionally requires recorded evidence and the matching owner status.

## Identity And Acquisition

- `id`: stable lowercase identifier; never recycle an existing ID.
- `label`: concise Chinese player-facing name.
- `kind`: `active` or `passive`.
- `source`: fixed base, inherent species, trainer, rebirth, evolution, fusion, or
  inheritance.
- `availability`: structured forms/lines, stage, minimum level, acquisition route,
  and prerequisites.
- `slotPolicy`: structured active-slot occupancy, fixed/overwritable/forgettable
  behavior, and duplicate policy.
- `baseline`: comparator skill IDs, explicit power budget, and visible tradeoffs.

The instance limit is seven active slots. The global action catalog may contain more
than seven skills, and `preferredSlot` may repeat across mutually exclusive skills.

## Mechanics

Active skills must define structured fields for:

- role and baseline comparator;
- ally/enemy/self legality;
- single, random range, all, battlefield, or other explicit target mode;
- selection requirements, invalid-target behavior at selection and settlement,
  and no-target fallback;
- effect type, exact formula source/expression, rounding, minimum, and maximum;
- hit/reliability, duration, potency, and order of operations;
- explicit dodge, critical, counter, reflect, launch, down, and revive permissions;
- statuses removed, applied, refreshed, resisted, or made immune;
- battle resource/cooldown only if implemented authoritatively.

Passives must define:

- trigger and timing;
- formula, cap, and source stats/elements;
- stacking and precedence;
- owner-only/team-wide/target-scoped behavior;
- switch, death, reconnect, and replay behavior;
- inheritance eligibility and selection rules.

## AI

Declare `runtimeContexts` first:

- `node_production_ai`: authoritative NPC/enemy AI;
- `player_auto_battle`: separately implemented player automation;
- `human_command`: direct player selection;
- `isolated_spectator_lab`: presentation-only lab, never production proof;
- `not_applicable_passive`: only for a passive with no choice behavior.

Then state:

- when the skill becomes a candidate;
- which targets are legal;
- how targets are scored;
- when not to waste the skill;
- how immunity, resistance, existing status, overkill, and ally danger affect score;
- the deterministic fallback when no target is worth using.
- the deterministic tie-break used when scores match.

“Use randomly” is not a complete AI contract.

## Counterplay

Name at least one real counter as `mechanism`, `implementationPath`, and `proof`:

- dodge or accuracy;
- resistance or immunity;
- cleanse or protection;
- lower duration/reliability;
- target restriction;
- setup cost or delayed payoff;
- reaction vulnerability;
- resource or cooldown.

Do not claim a counter that exists only in prose.

## Presentation

Provide:

- short description focused on player intent;
- complete description with outcome and meaningful limits;
- compact effect/target tags derived from mechanics;
- icon brief, exact-ID runtime/source paths, small-size proof, owner, license,
  provenance, and replacement path;
- structured cast/action/VFX/projectile and alternate-result timing;
- hit, miss, dodge, resist, immune, critical, and downed feedback as applicable;
- structured SFX/voice intent and success/alternate log wording.

Never show raw IDs, JSON field names, QA flags, or “damage +0”.

## Authority And Tests

Identify:

- server validation and settlement path;
- whether the exact owner/effect/target combination is verified by runtime evidence;
- client intent and authoritative replay path;
- persistence/training/inheritance mutation path;
- catalog and schema checks;
- positive, boundary, negative, reconnect, stale-revision, and security tests;
- deterministic simulation parameters: at least 1,000 battles per matchup, side
  swap, and 1V1/5V5/10V10 coverage;
- structured test, screenshot, 1× video, performance, and owner-review evidence.

If any effect or target type is unsupported, the contract status is `blocked` until
end-to-end support is part of the same delivery.
