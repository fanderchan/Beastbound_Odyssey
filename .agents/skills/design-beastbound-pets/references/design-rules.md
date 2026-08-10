# Beastbound whole-pet design rules

## Contents

- Product fit
- Acquisition tiers
- Pet identity card
- Role and counterplay
- Power and rarity
- Progression paths
- Player information
- Commercial fairness
- Completion gate

## Product fit

Design for a modernized StoneAge-like always-online pet MMORPG. The core emotions are random surprise, visible growth feedback, nostalgia, and showing a hard-earned rare pet to other players.

A worthwhile pet must answer all of these:

- Why would a player notice it?
- Why would a player spend time capturing or earning it?
- Why would a player train several candidates instead of keeping the first one?
- Why would a team select it over another pet?
- What can an opponent do against it?
- What long-term path keeps it valuable without making every previous pet obsolete?

Reject “same pet with higher numbers” unless it is an intentional progression form with a declared cost and comparison target.

## Acquisition tiers

Choose one primary tier before assigning numbers:

| Tier | Expected value | Design constraint |
| --- | --- | --- |
| Common wild | Easy to understand and replace | One clear role, accessible capture, useful B/A individuals |
| Rare wild Lv1 | Time-gated capture excitement | Low encounter probability, not low capture chance alone; strong identity and resale appeal |
| Boss/floor reward | Coordinated PvE trophy | Reward mechanics mastery; avoid mandatory monopoly drops |
| Event | Time-limited collection goal | Publish return/rerun policy before attaching unique power |
| Commercial | Paid convenience or prestige | Preserve purchase trust; provide reset protection and non-paid counterplay |
| Rebirth | Long training and luck | Preserve instance history and meaningful variance; avoid infinite uncapped growth |
| Evolution | One-rebirth prerequisite and form change | Comparable raw tier to normal two-rebirth, with form/utility upside |
| Fusion | Three one-rebirth materials and inheritance | Atomic consumption, visible risk boundaries, build-choice upside rather than runaway stats |

## Pet identity card

Define identity in this order:

1. Fantasy: one short sentence a player could repeat.
2. Roster role: damage, speed control, tank, sustain, disruption, support, capture helper, or hybrid.
3. Battle modes: auto leveling, Boss/floor PvE, PvP, family war.
4. Two strengths.
5. At least one meaningful weakness.
6. Two counters or counterplay windows.
7. One or two team synergies.
8. Acquisition tier and expected scarcity.
9. Growth shape and long-term path.
10. Visual brief placeholder, including the future independently authored shared headshot portrait; do not create art in a concept-only initial design.

If the card needs several paragraphs to explain its role, simplify the pet before implementing it.

## Role and counterplay

Use a budget, not a checklist of bonuses:

- A specialist may be excellent at one axis and weak at two.
- A hybrid may cover two axes but must lose peak output or reliability.
- High speed amplifies control, support, escape, and burst; charge it as a premium strength.
- Area effects and multi-target control scale sharply in 10v10; price them above single-target versions.
- Guaranteed effects need setup, limited frequency, a drawback, or a direct counter.
- A passive must not fully erase the pet's growth weakness.
- Auto-battle reliability is power. A skill that the AI uses perfectly can outperform a stronger manual-only skill during daily挂机.

Write one counter sentence for every signature mechanic, for example: “被净化后失去叠层”“怕高速打断”“只对中毒目标生效”“地系减伤明显”.

## Power and rarity

Separate four concepts:

- Species power: what this species is meant to do at an ordinary individual quality.
- Individual quality: how good one captured pet is relative to the same species.
- Acquisition rarity: how often the player gets a chance to capture or earn it.
- Build rarity: how difficult it is to obtain the desired active/passive inheritance combination.

Do not compensate every rare acquisition with raw stats. Scarcity can buy appearance, utility, skill access, inheritance flexibility, prestige, or a narrower bad-roll tail.

Compare at least these anchors:

- Same acquisition tier and role.
- Normal pet after two rebirths.
- Evolution result after its one-rebirth prerequisite.
- Fusion result after three one-rebirth materials.
- Current strongest commercial pet or planned commercial band.

## Progression paths

Keep layers explicit:

```text
species template
+ immutable captured individual
+ observed level history
+ rebirth modifiers
+ evolution/form transition
+ fusion/inherited skill state
= current authoritative pet instance
```

Do not collapse form defaults and instance inheritance into one JSON field. Preserve the pet instance ID and history across form changes unless the approved product rule says the material is consumed.

Normal two-rebirth, evolution, and fusion should land in comparable raw-stat bands. Evolution and fusion may have more valuable build options because they cost more, but must retain counters.

The terminal path is:

```text
0 rebirth -> 1 rebirth -> exactly one of:
  - normal 2 rebirth
  - evolution
  - fusion
```

These outcomes are mutually exclusive current forms, not three stackable upgrades. Paid reset exists only before that choice: an authority-v1 ordinary pet at exactly one rebirth may reset its same form to Lv1/0, but a 0-rebirth pet is not yet eligible and normal 2 rebirth, evolution, and fusion are terminal and cannot reset. An evolved target has no legal current-form 0-rebirth state: its 0/1 pages are historical views of the preserved instance only, so it must declare `paidResetPolicy.allowed=false` with `ineligibleReason=terminal_evolution`. A future fusion target must also declare `allowed=false`; its fusion contract chooses a fusion-specific stable reason and consequences without borrowing the evolution reason. Apply the confirmed terminal power-transfer rules below without collapsing the branches into one formula.

Terminal outcomes do not share one quality-transfer formula:

- **Normal 2 rebirth is source-related.** It continues the same individual's immutable Lv1 quality and hidden innate growth with the cumulative cultivation/rebirth bonus, so the one-rebirth embryo's strength still matters.
- **Evolution is partially source-related.** Preserve the current one-rebirth cultivation/rebirth bonus and public stage history, but generate the target form's Lv1 4V and hidden innate growth as fresh target-species rolls. Do not describe evolution as either a completely independent result or a direct copy of the source form's base quality.
- **Fusion materials are ordinary authority-v1, exactly-one-rebirth, pre-terminal pets only.** Consume exactly three. A 0-rebirth pet, normal 2-rebirth terminal, evolution result, or prior fusion result cannot be used as material.
- **Fusion numeric quality is material-independent.** The fusion recipe may select the output identity, but the three eligible materials' individual 4V, hidden growth, cultivation strength, and build allocation contribute nothing to the result's final numeric stats or growth roll. Generate those only from the fusion product's own rules. The sole inheritable value is the contract-allowlisted skill set; this makes poorly rolled one-rebirth embryos a deliberate material sink.

## Player information

At capture, show authentic Lv1 4V and stable visible identity. The capture tab may immediately handle only a newly captured Lv1 wild pet using its four public Lv1 percentiles; it never reads hidden growth, predicts Lv140, or auto-trains. Lv2+ captures default to retain/manual review. During training, the owned-pet panel keeps a permanent species-relative Lv1 4V percentile view beside a separate observed-growth percentile view and an estimate that becomes more useful around Lv20. Never combine those independent systems into one quality score. The existing growth-rule preview remains no-mutation evidence for manual evaluation, not capture automation. Keep exact seed, hidden quality, and authoritative future roll GM-only.

The codex answers “is this species worth chasing?” with species ranges, ecology, skills, and acquisition. The owned-pet panel answers “is this individual worth keeping?” with independent Lv1 4V percentiles, observed growth, training, learned skills, lock/bind status, and current stats.

Player-facing Chinese must be concise. Never expose raw IDs, effect types, formula keys, audit output, or server/debug messages.

## Commercial fairness

Paid rebirth reset is a per-form eligibility contract, not a universal entitlement and not a flag inferred from whether a pet is commercial:

- Every form declares exactly one explicit `paidResetPolicy`. An ordinary form uses `allowed=true` to declare its price for the one-rebirth, non-terminal eligibility window; this is not permission for every instance of that form. Terminal evolution targets use `allowed=false` with `ineligibleReason=terminal_evolution`, and future fusion targets also use `allowed=false` with a fusion-contract reason. Missing, unknown, duplicate, or contradictory policies fail closed.
- An `allowed=false` policy carries only eligibility and its stable reason. It must not carry a price tier, wallet policy, unlimited-reset promise, unbinding rule, or refund rule.
- For an ordinary form's `allowed=true` policy, first require an authority-v1 instance at exactly one rebirth with no normal-2/evolution/fusion terminal evidence, then price by the form's acquisition/replacement value. Never inspect an individual pet's Lv1 4V, hidden growth, observed grade, prior reset count, or recharge history when quoting the price.
- Eligible pricing is fixed per operation and may be repeated without a count limit only while the instance is again at the one-rebirth, pre-terminal stage. Stone-coin and noncommercial diamond tiers may combine bound and unbound balances, debiting bound first; commercial tiers may require unbound currency. This system-consumption policy is separate from trading: only unbound currency is transferable.
- A successful eligible reset returns that ordinary current form to Lv1/0 rebirth and clears pet binding, while preserving the instance's immutable Lv1 facts, base hidden growth, identity, form, and skills. It never refunds the price, MM, stones, or training time. The player must train and rebirth again before another reset can be quoted.
- Only a technical failure before the entire authoritative transaction commits may roll the debit and pet mutation back together. Do not design a player-facing “refund after a bad roll” path into this reset.
- GM may replace a whole ordinary-form tier or one ordinary form with a revision-safe price override, but cannot bypass the one-rebirth instance gate or turn any terminal outcome into an eligible instance.
- Fusion is already a non-resettable terminal branch. The future fusion contract still must choose and validate its own stable `allowed=false` reason and material/history consequences; it must not reuse `terminal_evolution`.

For commercial pets, also declare whether value comes from raw strength, unique role, appearance, time saved, or inheritance options; retain non-paid counterplay where practical; never silently nerf or reroll an existing instance during migration.

Pause for the user before introducing direct real-money charging, changing the one-rebirth/terminal reset boundary or loss rules, creating a new permanent paid advantage, or adding destructive recovery behavior. Ordinary per-form placement into the established price tiers is part of routine pet implementation.

## Completion gate

A pet is not complete because it exists in `pet_templates.json`. It is complete only when:

- taxonomy and stable IDs resolve;
- elements total 10;
- growth and Lv1 4V have a species profile and simulation evidence;
- ecology or other acquisition is reachable;
- capture and automatic handling are safe;
- its explicit paid-reset policy resolves in the strict all-form catalog; an ordinary form's `allowed=true` resolves an exact price tier and wallet policy for one-rebirth, pre-terminal instances only, while terminal target forms resolve `allowed=false` plus their branch-specific stable reason;
- its terminal power policy preserves source individual strength for normal 2 rebirth, preserves only the one-rebirth cultivation bonus while rerolling target-form 4V/growth for evolution, and requires three ordinary authority-v1, exactly-one-rebirth, pre-terminal fusion materials while excluding their numeric quality and allowing only explicit skill inheritance;
- active/passive effects execute authoritatively on the server;
- AI and manual play use the intended skills;
- codex and owned-pet views explain the right facts;
- any non-deferred formal art contract includes a canonical independently authored headshot shared by the roster bar, codex, ride permit and pet egg, with no full-body crop fallback and with source/ownership/evidence/owner-review records;
- old saves remain compatible;
- targeted Godot/Node tests and manual acceptance pass;
- roadmap evidence is updated.
