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
10. Visual brief placeholder; do not create art in the initial skill version.

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

## Player information

At capture, show authentic Lv1 4V and stable visible identity. The capture tab may immediately handle only a newly captured Lv1 wild pet using its four public Lv1 percentiles; it never reads hidden growth, predicts Lv140, or auto-trains. Lv2+ captures default to retain/manual review. During training, the owned-pet panel shows evidence from actual growth and an estimate that becomes more useful around Lv20. The existing growth-rule preview remains no-mutation evidence for manual evaluation, not capture automation. Keep exact seed, hidden quality, and authoritative future roll GM-only.

The codex answers “is this species worth chasing?” with species ranges, ecology, skills, and acquisition. The owned-pet panel answers “is this individual worth keeping?” with observed growth, training, learned skills, lock/bind status, and current stats.

Player-facing Chinese must be concise. Never expose raw IDs, effect types, formula keys, audit output, or server/debug messages.

## Commercial fairness

For paid pets:

- Declare whether value comes from raw strength, unique role, appearance, time saved, or inheritance options.
- Provide an auditable reset/recovery rule for disastrous rebirth outcomes.
- Keep a non-paid acquisition or counter path where practical.
- Never silently nerf existing instances or reroll paid pets during migration.
- Model refund, reset, binding, trade, and resale consequences before implementation.

Pause for the user before finalizing prices, permanent paid advantage, refund rules, or destructive recovery behavior.

## Completion gate

A pet is not complete because it exists in `pet_templates.json`. It is complete only when:

- taxonomy and stable IDs resolve;
- elements total 10;
- growth and Lv1 4V have a species profile and simulation evidence;
- ecology or other acquisition is reachable;
- capture and automatic handling are safe;
- active/passive effects execute authoritatively on the server;
- AI and manual play use the intended skills;
- codex and owned-pet views explain the right facts;
- old saves remain compatible;
- targeted Godot/Node tests and manual acceptance pass;
- roadmap evidence is updated.
