---
name: design-beastbound-pets
description: Design, implement, rebalance, audit, and validate complete Beastbound Odyssey pets from natural-language briefs. Use for any Beastbound pet work involving taxonomy, elements, Lv1 4V, hidden growth, habitats, encounter and capture probability, active/passive skills, training, rebirth, evolution, fusion, inheritance, economy, server authority, simulations, tests, visual-production planning, rideable presentation, sprites, animation handoff, or cross-file completeness. For formal, complete, runtime-ready, rideable, art, sprite, or animation scope, also route through the dedicated art director and Beastbound production-art contract instead of treating data/code as a finished pet.
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
- For “正式、完整、可发行、可骑、做造型、做素材、做动画”: include the visual-production contract, use `$stoneage9-art-director`, and keep delivery incomplete until real Godot screenshots/video and owner visual review exist. Do not silently expand a concept-only request into asset generation.
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
8. **Progression and economy**: rebirth/evolution/fusion eligibility, trading/binding/paid status, the exact paid-reset price tier and wallet policy, reset protection, auto-capture/discard safeguards, and material/value risk.
9. **Presentation**: player-facing Chinese name/description, what is visible at capture and while training, GM-only facts, art status, and—when visual production is in scope—the complete art-production handoff covering world, battle, riding, evidence, and owner review.
10. **Evidence**: simulations, fixed seeds, catalog checks, server tests, UI/manual checks, and save compatibility.

Use `references/design-rules.md` for whole-pet decisions, `references/growth-capture-encounter.md` for growth/ecology, `references/active-passive-skills.md` for skill design, and `references/repository-contracts.md` for implementation routing.

## Design hard gates

- Keep Lv1 4V visible and hidden per-level quality meaningful. A freshly captured, server-identified Lv1 wild pet may be evaluated from its four public species-relative Lv1 percentiles alone, but that decision must never claim to know hidden growth. The current runtime always retains the pet; do not enable automatic release until a player-visible recoverable action record and GM audit path exist.
- The current formal Lv1 4V proxy is the authority-v1 pet's immutable `initialStats` / `growthSpeciesLevel1Stats` blood, attack, defense, and quick map. Do not invent a second quality field or expose the hidden roll.
- In the owned-pet growth view, present species-relative Lv1 4V percentiles and observed per-level growth percentiles as two explicitly independent views. Keep authentic Lv1 percentiles available after leveling, rebirth, and later cultivation; never combine the two systems into one quality score or imply that either predicts the other.
- Make early observation uncertain. Human players inspect actual training evidence in the owned-pet panel; capture automation must not train pets, evaluate trained pets, or use the existing Lv20 dry-run as permission to dispose of them.
- Keep the existing observed-growth preview evidence-only, bounded, and no-mutation. It belongs to manual pet evaluation unless a later explicit product decision creates a separate protected automation workflow.
- Give every species its own distribution. Do not reuse a global spread merely because the JSON accepts it.
- Preserve stable IDs and old pets. Never reroll or silently weaken existing instances.
- Keep server sessions authoritative for capture, random seeds, experience, stats, skills, progression, consumption, and settlement.
- Require one meaningful weakness and counter. A passive must not erase the pet's intended weakness without a substantial cost.
- Treat active/passive mechanics as contracts, not prose. If the server cannot execute an effect, implement focused server rules and parity tests before assigning it.
- Refuse production placement while the server trusts client-supplied wild form, level, stats, capture override, or EXP for that path. Close or explicitly gate the authoritative encounter gap first.
- For a catchable growth-profile pet, server-side encounter selection alone is insufficient: require an encounter-time private capture candidate whose seed, Lv1 facts, growth envelope, and current stats transfer unchanged on capture.
- A catchable battle actor and its frozen candidate are the same individual: current-level max HP, attack, defense, quick, elements, and skills must match before the room becomes public. Battle damage may change current HP without changing those intrinsic facts.
- Capture level conditions only the hidden-growth seed distribution, never Lv1 4V. Lv1 uses the species baseline distribution unchanged; higher levels suppress the upper tail within that species with a non-zero jackpot floor and a hard bounded-attempt limit. Do not apply this rule to existing pets, rewards, eggs, GM grants, rebirth, evolution, or fusion.
- For authority-v1 rebirth, preflight both the target and the exact confirmed MM, preserve privateSeed/privateRoll/Lv1 facts, and restart one canonical Lv1 growth cycle with the cumulative rebirth bonus; never lower only the visible level or consume an automatically substituted helper.
- Keep normal two-rebirth, evolution, and fusion in comparable end-power bands. Let harder paths win through build choice, inheritance, appearance, or utility rather than uncontrolled raw-stat inflation.
- Give every form exactly one server-validated paid-reset price policy. All legitimately owned pets may reset repeatedly; choose price by form/acquisition value, never by the individual pet's Lv1 4V, hidden growth, observed grade, prior reset count, or充值金额.
- Paid reset pricing is fixed per operation and unlimited. Noncommercial tiers may use bound-first split payment; a commercial tier may require unbound currency. Only a fully committed technical failure rolls the whole operation back; a successful reset never refunds currency, MM, stones, or training time.
- Adding a form requires adding its exact row to `pet_paid_reset_policy.json`; an unknown or missing form must fail closed. Select or explicitly introduce a price tier in the design contract instead of relying on a runtime fallback.
- Protect locked, task, riding, cultivated, bound, paid, and inheritance-relevant pets from automatic discard or consumption.
- Keep large simulations offline; never add population scans or JSON I/O to frame, draw, HUD, or movement hot paths.
- Audit every species profile with `node tools/pet_level_one_percentile_audit.mjs` after changing `outputBase`, `initialOutputSpread`, `distribution`, or `rareExtremeRate`; the runtime CDF must continue matching at least 10,000 authority rolls per profile.
- A concept/numeric-only request keeps `presentation.artStatus=deferred` and records a future brief. Any non-deferred visual status must include a validated `presentation.artProduction` contract; read `references/art-animation-production.md` and route generation/review through `$stoneage9-art-director`.
- Do not call a runtime pet visually complete because it has an identity image, a side-view loop, two mirrored source views, or only `idle/walk`. Use the scope-specific world, battle, mounted, review-scene, and owner-approval gates.
- Validate battle facing from the final rendered board, never from source-view filenames alone. Beastbound's pet and integrated-mounted paths share one canonical mapping: enemy uses `front_3quarter_sw + flipH=true`, ally uses `back_3quarter_ne + flipH=true`, and both final silhouettes face the arena centre. Reject any per-bundle override, contact sheet, or one-sided preview that lets a mounted actor face away from its opponent or disagree with its same-side battle pet.

## Route formal visual production

Read `references/art-animation-production.md` whenever the user includes formal art, animation, riding, or release-ready scope. The project contract intentionally separates:

- true-eight world movement for the standalone character, standalone pet, and every supported integrated character-riding-pet combination;
- fixed-formation battle art for the two actually rendered diagonal views, without multiplying every combat action into unused world facings;
- semantic battle coverage for attack, skill, defend-hit, hurt, dodge, dodge-to-counter, counter, wounded return, knock-away, reversible down/revive, and combo readability;
- generated-source provenance, contact sheets, real `Main.tscn` screenshots, continuous MP4 review, automated asset/runtime checks, and explicit owner approval.

For Beastbound mounted art, the current product decision is AI-generated whole-frame artwork. Never restore runtime/offline character-plus-pet layer composition, mirroring, saddle patching, or guessed substitute mounts. A missing supported combination safely shows the on-foot character until its integrated pack exists.

## Implement as one complete slice

1. Add or reuse taxonomy before adding the form.
2. Add the form and species growth profile together when the pet is intended for long-term cultivation.
3. Add the form's exact paid-reset policy and verify the strict catalog still covers every form.
4. Add encounter placement and capture behavior; calculate actual Lv1 appearance probability rather than quoting only pool weight.
5. Reuse supported skills when they express the design. Add new action/passive IDs only with client/server execution, presentation, and fixed-seed tests.
6. Keep form defaults separate from per-instance learned/inherited skill state.
7. Trace every shared JSON consumer in Godot and Node before changing fields or IDs.
8. Add migration or compatibility handling before changing persistent instance semantics.
9. Keep wiring thin in `main.gd`, broad coordinators, `auth-service.js`, and `http-server.js`; place rules in focused models/domains.
10. When visual production is in scope, approve the identity lock and a small key-pose gate before generating full matrices; integrate assets only after their contact sheets pass.
11. Record art provenance and replacement paths, then run the isolated battle review lab before any second-pet batch expansion.

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
- Formal art/animation: validate the production contract, asset manifest and action catalog; review true-eight world loops plus the focused battle scenarios in `references/art-animation-production.md`, then record a real 1280×720 Godot MP4. The evidence must show both formations simultaneously and prove the applied view/flip mapping faces inward for pet and mounted actors. Automated checks do not replace owner visual approval.

Report exact commands, results, generated CSV/JSON paths, and residual risks. For hand-feel, provide concrete play steps, observation metrics, and pass criteria.

## Finish the issue

Update only `stoneage_gap_plan.md` for roadmap status/evidence. Stage only this issue's files, use a motivation-explaining commit, push through the configured SSH remote, and verify local, upstream, and remote SHAs when the standing user instruction authorizes automatic delivery.
