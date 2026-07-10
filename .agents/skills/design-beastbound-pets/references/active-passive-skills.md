# Active and passive skill design

## Contents

- Current source model
- Active skill contract
- Passive skill contract
- Skill budget
- AI, PvP, and 10v10
- Training and inheritance
- Implementation gate

## Current source model

Current runtime defaults are hierarchical:

```text
line.passiveSkillId        -> one family passive
subtype.activeSkillIds     -> default learned active skills
form                       -> elements, growth, stats, capture, visual identity
pet instance               -> activeSkillIds, seven petSkillSlots, forgottenSkillIds
```

Every subtype currently must include `pet_attack` and `pet_defend`. `battle_actions.json` supports seven pet skill slots. A form cannot add or replace family passives under the current catalog validator.

The current catalog also requires each distinct pet action's preferred `slot` to be globally unique. Because slots 1..7 are already occupied, the repository effectively cannot add an eighth active pet skill without first redesigning this rule. The intended boundary is “skill catalog can grow; each pet instance equips seven slots,” not “the whole game owns only seven skill IDs.”

Fusion inheritance is not yet a complete runtime contract. Plan inherited skills at instance level; do not smuggle them into form defaults or weaken the one-family-passive rule without an approved schema and migration.

## Active skill contract

For each active skill, write:

- Player-facing name and one-sentence purpose.
- Stable ID and preferred slot.
- Role tag: damage, control, sustain, support, disruption, setup, payoff, escape, or capture.
- Target contract: self/ally/enemy, single/all, selection required, legal dead/living targets.
- Effect contract: exact supported effect type and parameters.
- Reliability: hit/status chance, deterministic conditions, and fixed-seed behavior.
- Action-economy cost: turn, setup, cooldown/resource if implemented, self-debuff, or positional/target restriction.
- Counterplay and cleansing/resistance interaction.
- Auto-battle priority and conditions; capture-mode behavior.
- 1v1 and 10v10 expected impact.
- Client presentation, server execution, event-list playback, and tests.

Prefer one signature mechanic plus familiar support skills over six unrelated tricks. A pet should be recognizable by how it changes a decision, not by having the longest menu.

Do not assign an unsupported effect type and assume the label makes it real. Either reuse a fully interpreted action or implement a focused client/server rule with parity tests.

## Passive skill contract

For each passive, write:

- Family fantasy and why every form in the line shares it.
- Trigger timing: battle start, before action, on hit, on damaged, on status, on ally event, on defeat, or settlement.
- Eligibility and exclusions.
- Formula, cap, stacking, refresh, and ordering.
- Visible battle event and concise hover text.
- Interaction with elements, active skills, status resistance, dispel, death, switching, and reconnect/replay.
- Counterplay and at least one matchup where the passive is weak.
- Server authority and fixed-seed test cases.
- Inheritance conflict group and whether inheritance is allowed, blocked, or transformed.

Existing passive data demonstrates element-scaled status resistance, status immunity, and flat status resistance. Some IDs are currently presentation-only or incompletely enforced on the server. Verify the exact handler before reusing any passive.

Current Node pet-skill execution reliably covers attack, defend, single-enemy bonus damage, and single-enemy status application. Do not assume heal, cleanse, field, self/ally/all-target, multi-hit, cooldown, resource cost, generic accuracy, element counter, dodge, critical, counterattack, or passive triggers work merely because JSON can describe them. Implement and test the missing focused rule first.

Node currently does not load the passive catalog, and server battle snapshots do not carry enough element facts to reproduce element-scaled passives. Therefore assigning a passive in `pet_templates.json` is presentation/client behavior, not proof of authoritative PvP behavior.

## Skill budget

Evaluate power across these axes:

| Axis | Questions |
| --- | --- |
| Output | How much damage/healing/mitigation per turn? |
| Reliability | How often does it work and what invalidates it? |
| Tempo | Does speed let it act before counterplay? |
| Reach | Single target, all targets, chain, or repeated hits? |
| Control | How many enemy turns or choices can it remove? |
| Sustain | Does it prolong itself, allies, or both? |
| Information | Does it reveal, predict, or deny hidden choices? |
| Automation | Can挂机 AI exploit it without human cost? |
| Scaling | Does it multiply with 10v10, Boss HP, stats, or inherited combos? |
| Counter cost | How hard is the answer to obtain and use? |

Give a pet no more than two premium axes without a substantial weakness. Area control, high speed, and high reliability together are especially dangerous.

Compare a new skill against the best existing action with the same role. State what decision it adds; reject pure numerical upgrades unless they are an explicit progression reward.

## AI, PvP, and 10v10

Define AI before shipping:

- When to use the signature skill.
- Which target score it uses.
- When to conserve or fall back to attack/defend.
- How it behaves during auto-capture protection.
- How it avoids repeatedly targeting immune or invalid units.

For PvP, hide private choices but expose enough battle events to understand cause and counter. For 10v10, bound trigger counts, chain depth, repeated text, particles, and server event volume.

Add fixed-seed scenarios for simultaneous triggers, switching, death, immunity, resistance, counterattacks, and duplicate/replayed commands.

## Training and inheritance

Current training keeps learned skills, seven ordered slots, and forgotten template skills separate. Preserve that distinction.

For future evolution/fusion inheritance, design these fields before implementation:

- source parent/material and eligible pool;
- active/passive category;
- conflict group and mutually exclusive effects;
- maximum inherited slots;
- weight, guarantee, pity, and duplicate handling;
- preview information and what remains hidden;
- replacement/forget rules;
- binding/trade implications;
- fixed seed and atomic consumption receipt;
- legacy instance migration.

Fusion should create build diversity, not an unrestricted best-of-all-parents pet. Inherited passives need stricter caps than active skills because they consume no battle turn.

## Implementation gate

Before assigning a new skill to a pet:

1. Confirm the action/passive ID exists and resolves through the catalog.
2. Confirm Godot and Node interpret every effect field identically.
3. Confirm the server derives the result and the client only submits intent/replays events.
4. Add happy-path, immune/resisted, invalid target, ordering, fixed-seed, and N-vs-N tests.
5. Verify player hover/log text contains no raw IDs or debug fields.
6. Verify AI and capture protection behavior.
7. Run the catalog inspector and targeted battle checks.
