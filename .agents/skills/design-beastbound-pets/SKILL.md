---
name: design-beastbound-pets
description: Design, implement, rebalance, audit, and validate complete Beastbound Odyssey pets from natural-language briefs. Use for any Beastbound pet work involving taxonomy, elements, Lv1 4V, hidden growth, habitats, encounter and capture probability, active/passive skills, training, rebirth, evolution, fusion, inheritance, economy, server authority, simulations, tests, visual-production planning, a dedicated shared headshot portrait, rideable presentation, sprites, animation handoff, or cross-file completeness. For formal, complete, runtime-ready, rideable, art, sprite, or animation scope, also route through the dedicated art director and Beastbound production-art contract instead of treating data/code as a finished pet.
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
- For “正式、完整、可发行、可骑、做造型、做素材、做动画”: include the visual-production contract and its independently authored shared headshot portrait, use `$stoneage9-art-director`, and keep delivery incomplete until real Godot screenshots/video and owner visual review exist. Do not silently expand a concept-only request into asset generation.
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
8. **Progression and economy**: the explicit `0 rebirth -> 1 rebirth -> [normal 2 rebirth / evolution / fusion]` terminal-path choice, trading/binding/paid status, one paid-reset eligibility policy per form, price tier and wallet policy only when reset is allowed, reset protection, auto-capture/discard safeguards, and material/value risk.
9. **Presentation**: player-facing Chinese name/description, what is visible at capture and while training, GM-only facts, art status, and—when visual production is in scope—the complete declared-capability handoff covering a dedicated shared headshot portrait, world, battle, riding only when supported, source/ownership, evidence, and owner review.
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
- Treat `0 rebirth -> 1 rebirth -> [normal 2 rebirth / evolution / fusion]` as one mutually exclusive terminal-path choice. A pet cannot finish normal 2 rebirth and then evolve or fuse, and an evolution/fusion result cannot return to the normal rebirth branch.
- Evolution-target 0/1-rebirth pages may remain as read-only history for the same instance, but the current evolved form has no legal 0-rebirth state. Never interpret historical pages as permission to reset an evolved pet into that form at Lv1/0.
- Keep the three terminal power relationships distinct. Normal 2 rebirth remains related to the one-rebirth embryo by preserving that individual's immutable quality and cumulative cultivation/rebirth bonus. Evolution preserves the current one-rebirth cultivation/rebirth bonus, but rerolls the target form's own Lv1 4V and hidden innate growth from the target species profile; it is neither fully source-independent nor a direct transfer of source base quality.
- Fusion consumes exactly three ordinary authority-v1 pets that are at exactly one rebirth and have not selected any terminal path. A 0-rebirth pet, normal 2-rebirth pet, evolution result, or prior fusion result is never eligible material. Final numeric stats and growth must ignore the three eligible materials' individual 4V, hidden growth, cultivation strength, and build allocation. Generate the result only from the fusion product's own rules; permit only contract-allowlisted skill inheritance. This deliberately makes poorly rolled one-rebirth embryos useful consumable materials without letting three strong embryos buy a stronger numeric roll.
- Keep normal two-rebirth, evolution, and fusion in comparable end-power bands. Let harder paths win through build choice, inheritance, appearance, or utility rather than uncontrolled raw-stat inflation.
- Give every form exactly one explicit, server-validated paid-reset policy, but keep form pricing separate from instance eligibility. For an ordinary form, `allowed=true` means only an authority-v1 instance currently at exactly one rebirth and not yet on a terminal path may receive a quote; it never makes 0-rebirth or normal 2-rebirth instances eligible.
- Normal 2 rebirth, evolution, and fusion are all terminal outcomes and cannot be paid-reset. An evolution target must declare `allowed=false` and `ineligibleReason=terminal_evolution`; it must not carry price-tier, wallet, unlimited, unbinding, or refund fields. A fusion target must declare only `allowed=false` and `ineligibleReason=terminal_fusion`.
- For an ordinary form's `allowed=true` one-rebirth window, choose price by form/acquisition value, never by the individual pet's Lv1 4V, hidden growth, observed grade, prior reset count, or充值金额. Pricing stays fixed per operation and unlimited while the instance remains eligible; noncommercial tiers may use bound-first split payment and a commercial tier may require unbound currency. Only a technical failure before authoritative commit rolls the whole operation back; a successful reset never refunds currency, MM, stones, or training time.
- Adding a form requires adding its exact row to `pet_paid_reset_policy.json`; an unknown or missing form must fail closed. Select or explicitly introduce a price tier only for `allowed=true`; use the stable ineligibility reason for `allowed=false` instead of relying on a runtime fallback.
- Protect locked, task, riding, cultivated, bound, paid, and inheritance-relevant pets from automatic discard or consumption.
- Keep large simulations offline; never add population scans or JSON I/O to frame, draw, HUD, or movement hot paths.
- Audit every species profile with `node tools/pet_level_one_percentile_audit.mjs` after changing `outputBase`, `initialOutputSpread`, `distribution`, or `rareExtremeRate`; the runtime CDF must continue matching at least 10,000 authority rolls per profile.
- A concept/numeric-only request keeps `presentation.artStatus=deferred` and records a future brief. Any non-deferred visual status must include a validated `presentation.artProduction` contract; read `references/art-animation-production.md` and route generation/review through `$stoneage9-art-director`.
- Every non-deferred formal pet must declare and deliver one independently authored headshot portrait through `presentation.artProduction.portrait`. It is a canonical shared asset for the pet roster bar, codex, ride permit, pet egg, and later compatible UI surfaces. Never crop a full-body identity, world, battle, or mounted frame and call it the portrait. Record its source plan or source asset, ownership record, actual-size/small-size evidence, and separate owner-review state. A concept-only `artStatus=deferred` contract may defer the portrait with the rest of the art brief.
- Do not call a runtime pet visually complete because it has an identity image, a side-view loop, two mirrored source views, or only `idle/walk`. Use the scope-specific world, battle, mounted only when the contract is rideable, review-scene, and owner-approval gates.
- Validate battle facing from the final rendered board, never from source-view filenames alone. Beastbound's standalone-pet path, and the integrated-mounted path when rideable, share one canonical mapping: enemy uses `front_3quarter_sw + flipH=true`, ally uses `back_3quarter_ne + flipH=true`, and both final silhouettes face the arena centre. Reject any per-bundle override, contact sheet, or one-sided preview; rideable contracts must also reject a mounted actor that faces away from its opponent or disagrees with its same-side battle pet.
- Never run a whole-frame or global despill/color heuristic on transparent art without the exact per-pixel eligibility mask produced by the same chroma-key operation. A missing mask means byte-preserving no-op or fail closed; an all-true mask, hue threshold, or visual suspicion is not provenance. Preserve authored purple outlines, green effects, alpha and silhouette.
- Treat battle frame numbers as playback time. For both formal views, `down-1..8` must progress from balance loss to one stable, revivable unconscious hold; `down-8` and `revive-1` must be exact RGBA matches in source and runtime; `revive-1..8` must recover without re-collapsing. Reject sleep, smiles, death/X-eye/gore semantics, and keep dizzy halos/stars in independent runtime effect layers.
- Derive every 256px runtime battle frame from its 512px source through one canonical function shared by builder, installer and verification. Do not append private resize, alpha, despill or color passes before or after that function; change the shared implementation and its parity tests instead.

## Route formal visual production

Read `references/art-animation-production.md` whenever the user includes formal art, animation, riding, or release-ready scope. The project contract intentionally separates:

- true-eight world movement for every subject declared by the contract: standalone pet always, plus standalone character and each integrated character-riding-pet combination only when rideable;
- one canonical independently authored headshot portrait shared by the roster bar, codex, ride permit, pet egg, and other compatible UI surfaces; UI frames, labels, rarity borders, egg shells, and badges remain separate overlays;
- fixed-formation battle art for the two actually rendered diagonal views, without multiplying every combat action into unused world facings;
- semantic battle coverage for attack, skill, defend-hit, hurt, dodge, dodge-to-counter, counter, wounded return, knock-away, reversible down/revive, and combo readability;
- generated-source provenance, contact sheets, real `Main.tscn` screenshots, continuous MP4 review, automated asset/runtime checks, and explicit owner approval.

For Beastbound mounted art, when a pet is rideable, the current product decision is AI-generated whole-frame artwork. Never restore runtime/offline character-plus-pet layer composition, mirroring, saddle patching, or guessed substitute mounts. A missing supported combination safely shows the on-foot character until its integrated pack exists. First-release fusion targets are explicitly non-rideable and omit mounted production rather than carrying a placeholder debt.

## Implement as one complete slice

1. Add or reuse taxonomy before adding the form.
2. Add the form and species growth profile together when the pet is intended for long-term cultivation.
3. Resolve the terminal power policy explicitly: normal 2 rebirth preserves source individual strength, evolution preserves the one-rebirth bonus while rerolling target-form 4V/growth, and fusion accepts only three ordinary authority-v1, exactly-one-rebirth, pre-terminal materials while ignoring their numeric quality and inheriting only allowlisted skills.
4. Add the form's exact paid-reset policy and verify the strict catalog still covers every form. For an ordinary form, `allowed=true` opens quoting only to an eligible one-rebirth, non-terminal instance. Evolution targets use only `allowed=false` plus `terminal_evolution`; future fusion targets also use `allowed=false` and must declare their own approved stable reason in the fusion contract.
5. Add encounter placement and capture behavior; calculate actual Lv1 appearance probability rather than quoting only pool weight.
6. Reuse supported skills when they express the design. Add new action/passive IDs only with client/server execution, presentation, and fixed-seed tests.
7. Keep form defaults separate from per-instance learned/inherited skill state.
8. Trace every shared JSON consumer in Godot and Node before changing fields or IDs.
9. Add migration or compatibility handling before changing persistent instance semantics.
10. Keep wiring thin in `main.gd`, broad coordinators, `auth-service.js`, and `http-server.js`; place rules in focused models/domains.
11. When visual production is in scope, approve the identity lock and a small key-pose gate before generating full matrices. Author the dedicated headshot from that locked identity as its own composition, never as a crop, and review it at native size plus representative small-card sizes before UI integration.
12. Integrate the shared portrait and motion assets only after their contact sheets and focused evidence pass. Record art provenance and replacement paths, then run the isolated battle review lab before any second-pet batch expansion.

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
- Formal art/animation: validate the production contract, dedicated portrait source/ownership/evidence, asset manifest and action catalog; review the portrait at native and representative runtime sizes, true-eight world loops, and the focused battle scenarios in `references/art-animation-production.md`, then record a real 1280×720 Godot MP4. The evidence must show the portrait in current supported UI consumers, both formations simultaneously, and the applied view/flip mapping facing inward for standalone pet actors and, when the contract is rideable, mounted actors. Automated checks do not replace owner visual approval.

Report exact commands, results, generated CSV/JSON paths, and residual risks. For hand-feel, provide concrete play steps, observation metrics, and pass criteria.

## Finish the issue

Update only `stoneage_gap_plan.md` for roadmap status/evidence. Stage only this issue's files, use a motivation-explaining commit, push through the configured SSH remote, and verify local, upstream, and remote SHAs when the standing user instruction authorizes automatic delivery.
