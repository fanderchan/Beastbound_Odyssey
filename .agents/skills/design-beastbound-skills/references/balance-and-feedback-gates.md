# Balance And Feedback Gates

## Combat Budget

Evaluate at least these axes:

- damage/healing output;
- target count;
- reliability;
- duration;
- action denial;
- speed/priority;
- reaction permissions;
- setup and repeatability;
- counter availability;
- acquisition and inheritance constraints.

A skill may be exceptional on one axis and strong on a second. A third premium axis
requires a substantial, visible weakness.

## Control

- Track denied actions, not just status applications.
- Report longest control chain per target.
- Test resistance, immunity, refresh, overlap, cleanse, death, switch, and reconnect.
- A strong control skill must give up target count, reliability, duration, or
  repeatability.

## Deterministic Simulation

For every new formal skill and every formal rebalance:

- at least 1,000 battles per matchup;
- fixed test seeds only through dependency injection;
- mirrored side swap;
- 1V1 rule proof, 5V5 composition proof, 10V10 stress/readability;
- report win rate, turn count, action usage, damage, healing, denied actions,
  control-chain length, overkill, and no-target fallbacks.

For symmetric mirrors, investigate results outside 45%–55% after side swapping.
Production AI and player auto-battle must be measured in their own implemented
contexts. Isolated spectator-lab decisions may support readability review but are
not balance or authority evidence.

## Visual Feedback

At 1× speed, the player must be able to read:

1. intent/cast tell;
2. motion, projectile, or effect travel;
3. target reaction;
4. hit, dodge, miss, resist, immunity, critical, heal, cleanse, or death result;
5. persistent status or battlefield state.

Text logs supplement visuals; they do not replace them. Ranged misses land visibly
in the world when appropriate. A projectile kill must not invent a knock-away event.

## Icon Gate

- One original exact-ID icon per formal active/passive.
- No battle-frame crop, portrait crop, emoji, placeholder, copied reference art, or
  duplicated “temporary” icon.
- Full-square warm-dark artwork or properly authored transparency; never a baked
  checkerboard.
- Source and runtime dimensions, hash, ownership, prompt/provenance, and replacement
  path recorded.
- Recognizable at 32×32 and readable at the actual 1280×720 UI size.
- Text, level, type, rarity, badges, and outer frames remain separate UI layers.
