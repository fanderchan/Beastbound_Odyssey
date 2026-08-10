---
name: design-beastbound-skills
description: Design, implement, rebalance, audit, visualize, and validate complete Beastbound Odyssey pet skills. Use whenever work adds or changes an active or passive skill, skill description, icon, target rule, combat effect, status, AI choice, training availability, inheritance, skill-card UI, VFX/audio feedback, balance, or client/server skill contract.
---

# Design Beastbound Skills

Build a skill as one player-facing combat contract. Treat its name, icon, description,
mechanics, server settlement, AI use, counterplay, animation, sound, UI, and tests as
one delivery.

## Start From Repository Truth

1. Run `git status --short --branch` and inspect recent history.
2. Read the repository `AGENTS.md` files and newest relevant phase note.
3. Read:
   - `references/skill-design-contract.md`
   - `references/runtime-routing.md`
   - `references/balance-and-feedback-gates.md`
4. Inspect the current catalogs:

```bash
node .agents/skills/design-beastbound-skills/scripts/inspect_skill_catalog.mjs
```

5. Inspect existing tests and every consumer of any ID or schema field before editing.
6. Preserve unrelated worktree changes. Never silently reinterpret an established
   product rule while implementing a skill.

## Choose The Work Mode

- **Concept only**: produce a complete design contract and balance hypothesis. Do
  not claim runtime completion.
- **Implementation**: update all applicable data, client, server, AI, visuals,
  audio, tests, phase evidence, and visual proof.
- **Rebalance**: keep stable IDs and presentation unless the user asks to change
  them; prove old versus new outcomes with simulations.
- **Audit**: report contradictions, missing runtime support, placeholder art,
  presentation drift, and unverified claims without mutating product state.
- **UI/icon work**: preserve authoritative mechanics and use actual player-facing
  assets. Do not expose raw IDs, debug formulas, QA text, or server fields.

## Resolve The Skill Contract Before Coding

For each active skill, resolve:

- delivery status and explicit blockers; never use `TBD`, `无`, or `-` as a
  completed field;
- stable ID, Chinese name, source, role, active/passive category;
- availability, baseline comparator, power budget, equipped-slot behavior, and
  whether it is fixed, inherent, trainable, evolved, fused, or inherited;
- legal target sides, target count, selection rule, and no-target fallback;
- effect type, exact formula source, invalid-target behavior at selection and
  settlement, reliability, duration, status ordering, and reaction permissions;
- AI trigger, target scoring, avoidance conditions, and fallback action;
- counterplay, immunity/resistance/cleanse behavior, and anti-lock protection;
- battle animation, projectile/VFX timing, hit/miss/resist/immune feedback, sound,
  and log wording;
- original icon brief, source/ownership, runtime path, small-size proof;
- server authority, client replay behavior, tests, simulation, and owner evidence.

For each passive, additionally resolve:

- trigger timing and affected event;
- exact formula, cap, stacking/precedence, and reconnect/switch behavior;
- visible proc/status feedback;
- inheritance eligibility and probability source.

Write the v2 contract as JSON. Keep `deliveryStatus=blocked` with concrete
`blockers` until unresolved product rules or unsupported effects are part of the
same implementation slice. Set `effectSupportVerified=true` only with real Node and
Godot evidence. Validate the contract:

```bash
node .agents/skills/design-beastbound-skills/scripts/validate_skill_design_spec.mjs \
  /absolute/path/to/skill-design-spec.json
```

Do not implement an unresolved contract by scattering guesses through catalogs.

## Enforce Server Authority

- The Node server owns legal targets, randomness, damage, healing, statuses,
  reactions, and battle results.
- The Godot client sends intent and replays authoritative events. It must not reroll
  hit, dodge, resistance, critical, counter, duration, or target selection.
- A JSON effect name is not runtime support. If the server does not implement the
  target/effect/event type, extend the server and client replay in the same slice.
- Current pet skills are not a generic effect engine. Healing allies, cleanse,
  multi-target skills, multi-hit, field effects, cooldowns, and combat resources
  require explicit end-to-end support before their descriptions may promise them.
- The catalog inspector's current pet-owner matrix allows only damage, defend, and
  status target shapes. Treat any heal, cleanse, or other rejected combination as a
  runtime-support task, not a request to weaken the inspector.
- Production randomness remains private and server-authoritative. Fixed seeds are
  test injection only.

## Separate AI Runtime Contexts

- `node_production_ai` is authoritative NPC/enemy decision logic and needs Node
  behavior tests.
- `player_auto_battle` is a separate player feature. It still sends intent for Node
  validation and needs its own enablement, targeting, and opt-out contract.
- `human_command` covers direct player selection and is not proof that either AI
  path works.
- `isolated_spectator_lab` is only presentation/readability evidence. Never use it
  as production AI, auto-battle, or balance proof.
- Declare every applicable context in `ai.runtimeContexts`; use a stable tie-break
  so fixed-seed replay chooses the same target.

## Produce Player-Facing Presentation

- Keep canonical mechanics in `battle_actions.json` or
  `battle_passive_skills.json`.
- Put active presentation beside the active action and passive presentation beside
  the passive. Do not create a second mechanics catalog.
- Training data owns trainers, supply, and prices; it does not redefine skill
  effects or descriptions.
- Every formal skill needs an original, exact-ID icon. Do not crop battle frames,
  reuse pet portraits, use emoji, draw placeholder SVGs, or copy reference art.
- Icons contain no baked-in name, level, type badge, rarity, or outer slot frame.
- If skill level does not exist in the authoritative model, do not invent “等级1”.
- Derive numeric summaries from authoritative effect fields. Do not hand-maintain
  duplicate damage/chance values in UI code.
- `quick_instinct` is currently presentation-only/no-op. Do not claim it changes
  turn order until the server implements and tests that effect.

## Implement The Pet Skill Page

- Keep the full pet-management screen, pet showcase, and bottom portrait roster.
- Render skills as an embedded pet detail mode, not a separate developer modal.
- Show every authoritative passive first, then exactly seven equipped active
  slots. Fusion inheritance may contribute at most one inherited passive under
  the established fusion rule; do not confuse that limit with the pet's total
  passive display.
- Distinguish fixed, inherent, trained, evolved, fused, and inherited sources with
  Chinese text, not color alone.
- Use icon cards with name, source/category, active/passive label, and selectable
  inline detail. Empty active slots may show a real plus icon and training guidance.
- Normal viewing is read-only and does not show currency. Training mode reuses the
  same cards and preserves authoritative trainer proximity, price, overwrite, and
  confirmation rules.
- Use left click for the complete flow. Scrolling, focus, long Chinese text,
  disabled reasons, and map click-through must be tested.

## Balance Before Release

- Compare against the closest existing baseline and state the power budget.
- Do not combine more than two premium axes without a substantial weakness.
- Strong control may not simultaneously have high target count, high reliability,
  and long duration.
- Verify a target cannot be denied actions indefinitely; resistance, immunity,
  cleanse, diminishing protection, or another real counter must exist.
- Training price is an economy decision, not a combat balancing lever.
- Run deterministic simulations of at least 1,000 battles per matchup for every
  new formal skill and every formal rebalance. Swap sides and report win rate,
  turns, usage, damage, healing, denied actions, control-chain length, no-target
  fallbacks, and failure cases.
- Use 1V1 for the smallest rules proof, 5V5 for composition interaction, and 10V10
  for readability/performance stress. A spectator-lab run may supplement the 10V10
  visual review but never replaces production balance or performance evidence.

## Validate And Record Evidence

Start narrow:

```bash
git diff --check
node .agents/skills/design-beastbound-skills/scripts/inspect_skill_catalog.mjs
node tools/battle_action_catalog_check.mjs
godot --headless --path client/godot --quit
```

Then run the relevant Godot catalog/UI/battle replay checks and selected Node domain
tests. For a player-visible delivery:

1. Launch the real `Main.tscn` path at 1280×720.
2. Capture the exact skill page, card selection, pet switching, and training state.
3. Record a 1× speed video showing UI plus the real battle effect, including miss,
   resist, immunity, or alternate result where relevant.
4. Compare the reference and current screenshot side by side at the same viewport.
5. Record performance before/after for idle, scrolling, switching pets, and battle.
6. Keep `owner_review_pending` until the user explicitly accepts the video.

Do not call a skill complete when only its data, icon, UI, or server half exists.
