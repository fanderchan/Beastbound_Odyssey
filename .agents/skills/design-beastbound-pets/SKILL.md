---
name: design-beastbound-pets
description: Design, implement, rebalance, audit, and validate complete Beastbound Odyssey pets from natural-language briefs. Use for any Beastbound pet work involving species taxonomy, forms, elements, Lv1 4V, hidden growth and Lv140 ranges, habitats and encounter weights, Lv1 encounter probability, capture difficulty and tools, active or passive skills, skill slots and training, automatic capture/discard safety, rebirth, evolution, fusion or inheritance planning, codex/player presentation, server authority, simulations, tests, or cross-file pet completeness. Initial version deliberately excludes creating or editing pet art, sprites, animation, and audio.
---

# Design Beastbound Pets

Turn a natural-language pet idea into a coherent player promise, a structured design contract, repository changes, and evidence. Optimize for fun, collectible identity, counterplay, and release quality rather than raw feature count.

## Start from repository truth

1. Read repository and scoped `AGENTS.md`, `stoneage_gap_plan.md` progress, and the newest relevant phase notes.
2. Run `git status --short --branch` and recent `git log`; preserve unrelated changes.
3. Run the catalog inspector before proposing IDs or numbers:

```sh
node .agents/skills/design-beastbound-pets/scripts/inspect_pet_design.mjs --all
node .agents/skills/design-beastbound-pets/scripts/inspect_pet_design.mjs --form <formId>
```

4. Inspect one or two existing pets serving the same acquisition tier or combat role. Do not copy StoneAge source, data, maps, or assets.
5. Treat current runtime contracts as facts and roadmap rules as intended direction. Clearly label unsupported or deferred mechanics.

## Choose the delivery mode

- For “设计、想一个、给方案、怎么平衡”: produce a design contract and balance rationale; do not edit runtime files.
- For “加入、开发、实现、落地”: reproduce the current gap, create and validate a design contract, implement the smallest complete cross-runtime slice, test it, update the single roadmap, then narrowly commit and push when authorized by the standing project instruction.
- For “审计、检查、在哪里抓、成长怎样”: use the inspector and report current facts without changing files.
- Ask only when a choice changes commercial value, destructive migration, permanent economy, inheritance loss, or another major product rule. Otherwise make a conservative, explicit assumption.

Typical natural-language requests:

- `用 $design-beastbound-pets 设计一只雾帽湿地稀有 Lv1 水风控制宠，复用现有技能。`
- `用 $design-beastbound-pets 把这只商业宠做成强但不碾压普通二转宠，并落地测试。`
- `用 $design-beastbound-pets 审计蓝人龙在哪里抓、4V/成长、技能和服务端是否完整。`
- `用 $design-beastbound-pets 设计三只一转材料融合后的主动/被动遗传池，先只做规则和模拟。`

## Convert the brief into a Pet Design Contract

Create a temporary JSON contract under `.run/pet-design/<designId>.json`; do not commit it unless the user requests a durable design artifact. Follow `references/pet-design-spec.schema.json` and validate it:

```sh
node .agents/skills/design-beastbound-pets/scripts/validate_pet_design_spec.mjs .run/pet-design/<designId>.json
```

Use `references/pet-design-spec.example.json` only as a structural example; none of its IDs or numbers are approved runtime content.

Resolve every section below before implementation:

1. **Player promise**: one-sentence fantasy, target player, acquisition tier, core delight, and why this pet deserves a roster slot.
2. **Role and counterplay**: PvE/PvP/auto-battle role, two strengths, at least one real weakness, counters, and team synergies.
3. **Taxonomy and identity**: stable `lineId -> subtypeId -> formId`, name, elements totaling 10, family passive, subtype active set, and whether this is a new line, subtype, or form.
4. **Acquisition and ecology**: map, zone, group, encounter rate, pool weight, level range, enemy count, rare Lv1 probability, capture difficulty, special conditions, and codex wording.
5. **Growth and 4V**: visible Lv1 base/spread, hidden per-level distribution, role-shaped strengths/weaknesses, expected Lv20 observation quality, Lv140 band, and relation to normal two-rebirth/evolution/fusion power.
6. **Active skills**: purpose, slot, target, effect, reliability, AI use, counterplay, 10v10 readability, client/server support, and training/inheritance policy.
7. **Passive skill**: family identity, trigger, effect, cap, counters, element interaction, server authority, and inheritance conflict group.
8. **Progression and economy**: rebirth/evolution/fusion eligibility, trading/binding/paid status, reset protection, auto-capture/discard safeguards, and material/value risk.
9. **Presentation**: player-facing Chinese name/description, what is visible at capture and while training, GM-only facts, and art status set to `deferred` in this version.
10. **Evidence**: simulations, fixed seeds, catalog checks, server tests, UI/manual checks, and save compatibility.

Use `references/design-rules.md` for whole-pet decisions, `references/growth-capture-encounter.md` for growth/ecology, `references/active-passive-skills.md` for skill design, and `references/repository-contracts.md` for implementation routing.

## Design hard gates

- Keep Lv1 4V visible and hidden per-level quality meaningful; Lv1 alone must not settle keep/discard decisions.
- The repository currently has no formal independent `4V` field/formula. Until P0.2 defines it, label Lv1 blood/attack/defense/quick ranges as the current proxy and do not invent a permanent 4V contract inside one pet.
- Make early observation uncertain and approximately Lv20 useful. Do not use hidden rolls directly as a player-facing “estimate”.
- Give every species its own distribution. Do not reuse a global spread merely because the JSON accepts it.
- Preserve stable IDs and old pets. Never reroll or silently weaken existing instances.
- Keep server sessions authoritative for capture, random seeds, experience, stats, skills, progression, consumption, and settlement.
- Require one meaningful weakness and counter. A passive must not erase the pet's intended weakness without a substantial cost.
- Treat active/passive mechanics as contracts, not prose. If the server cannot execute an effect, implement focused server rules and parity tests before assigning it.
- Refuse production placement while the server trusts client-supplied wild form, level, stats, capture override, or EXP for that path. Close or explicitly gate the authoritative encounter gap first.
- For a catchable growth-profile pet, server-side encounter selection alone is insufficient: require an encounter-time private capture candidate whose seed, Lv1 facts, growth envelope, and current stats transfer unchanged on capture.
- Keep normal two-rebirth, evolution, and fusion in comparable end-power bands. Let harder paths win through build choice, inheritance, appearance, or utility rather than uncontrolled raw-stat inflation.
- Protect locked, task, riding, cultivated, bound, paid, and inheritance-relevant pets from automatic discard or consumption.
- Keep large simulations offline; never add population scans or JSON I/O to frame, draw, HUD, or movement hot paths.
- Do not create or edit art, sprites, animation, or audio in this skill version. Record replacement requirements only.

## Implement as one complete slice

1. Add or reuse taxonomy before adding the form.
2. Add the form and species growth profile together when the pet is intended for long-term cultivation.
3. Add encounter placement and capture behavior; calculate actual Lv1 appearance probability rather than quoting only pool weight.
4. Reuse supported skills when they express the design. Add new action/passive IDs only with client/server execution, presentation, and fixed-seed tests.
5. Keep form defaults separate from per-instance learned/inherited skill state.
6. Trace every shared JSON consumer in Godot and Node before changing fields or IDs.
7. Add migration or compatibility handling before changing persistent instance semantics.
8. Keep wiring thin in `main.gd`, broad coordinators, `auth-service.js`, and `http-server.js`; place rules in focused models/domains.

## Validate proportionally

Always run:

```sh
node .agents/skills/design-beastbound-pets/scripts/inspect_pet_design.mjs --check
node tools/battle_action_catalog_check.mjs
godot --headless --path client/godot --quit
git diff --check
```

Then select affected checks:

- Template/skills: `--auto-pet-template-catalog-check`, battle pet command/target, passive and server battle checks.
- Growth/4V: balance catalog, growth observation, fixed-seed parity, `pet-exp-settlement` plus service-entry integration tests, and at least 10,000 offline samples per finalized profile.
- Encounter/capture: encounter table, capture tools/settings/result, map/region, server battle-room capture, and hang settlement checks.
- Management/inheritance: pet safety, stable capacity, skill training, rebirth/evolution/fusion transaction and replay tests.
- UI/runtime: launch the real 1280x720 client; add idle/moving/input performance evidence when touching visible or hot paths.

Report exact commands, results, generated CSV/JSON paths, and residual risks. For hand-feel, provide concrete play steps, observation metrics, and pass criteria.

## Finish the issue

Update only `stoneage_gap_plan.md` for roadmap status/evidence. Stage only this issue's files, use a motivation-explaining commit, push through the configured SSH remote, and verify local, upstream, and remote SHAs when the standing user instruction authorizes automatic delivery.
