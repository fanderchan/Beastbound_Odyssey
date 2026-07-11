"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  resolveCounterTrigger,
  resolveDamageReaction,
} = require("../src/auth/battle-reaction-resolver");

function actor(actorId, quick, overrides = {}) {
  return {actorId, hp: 100, level: 10, defense: 20, quick, ...overrides};
}

function fixedAuthority(values = {}) {
  const contexts = [];
  return {
    contexts,
    roll(roomId, context) {
      contexts.push({roomId, ...context});
      return Object.prototype.hasOwnProperty.call(values, context.purpose) ? values[context.purpose] : 0.9999;
    },
  };
}

function reactionInput(randomAuthority, overrides = {}) {
  return {
    randomAuthority,
    roomId: "room_reaction",
    turnSeq: 3,
    round: 2,
    sequence: 7,
    eventType: "basic_attack",
    actionId: "attack",
    actor: actor("attacker", 50),
    target: actor("target", 100),
    baseDamage: 12,
    ...overrides,
  };
}

test("fixed private rolls resolve dodge and critical into final facts without exposing raw rolls", () => {
  const dodgeAuthority = fixedAuthority({"dodge.v1": 0});
  const dodge = resolveDamageReaction(reactionInput(dodgeAuthority));
  assert.deepEqual(dodge, {dodged: true, critical: false, damage: 0});
  assert.deepEqual(dodgeAuthority.contexts.map((entry) => entry.purpose), ["dodge.v1"]);
  assert.deepEqual(Object.keys(dodge).sort(), ["critical", "damage", "dodged"]);

  const criticalAuthority = fixedAuthority({"dodge.v1": 0.9999, "critical.v1": 0});
  const critical = resolveDamageReaction(reactionInput(criticalAuthority, {
    actor: actor("attacker", 100, {level: 10}),
    target: actor("target", 50, {level: 10, defense: 34}),
  }));
  assert.deepEqual(critical, {dodged: false, critical: true, damage: 29});
  assert.deepEqual(criticalAuthority.contexts.map((entry) => entry.purpose), ["dodge.v1", "critical.v1"]);

  const counterDodgeAuthority = fixedAuthority({"dodge.v1": 0});
  const counterDodge = resolveDamageReaction(reactionInput(counterDodgeAuthority, {
    eventType: "counter_attack",
    rollSequence: 507,
  }));
  assert.deepEqual(counterDodge, {dodged: true, critical: false, damage: 0});
  assert.equal(counterDodgeAuthority.contexts[0].sequence, 507);
});

test("guard and stone or sleep block dodge while leaving the base damage path deterministic", () => {
  for (const target of [
    actor("guard", 100, {guarding: true}),
    actor("stone", 100, {statuses: {stone: {turns: 1}}}),
    actor("sleep", 100, {statuses: {sleep: {turns: 1}}}),
  ]) {
    const authority = fixedAuthority({"dodge.v1": 0, "critical.v1": 0.9999});
    const result = resolveDamageReaction(reactionInput(authority, {target}));
    assert.deepEqual(result, {dodged: false, critical: false, damage: 12});
    assert.deepEqual(authority.contexts.map((entry) => entry.purpose), ["critical.v1"]);
  }
});

test("counter triggering uses the defender as roll actor and enforces skill, kill, status and one-layer gates", () => {
  const attacker = actor("attacker", 50);
  const defender = actor("defender", 100, {hp: 80});
  const authority = fixedAuthority({"counter.v1": 0});
  const input = reactionInput(authority, {
    attacker,
    target: defender,
    hpBefore: 80,
    hpAfter: 80,
  });
  assert.equal(resolveCounterTrigger(input), true);
  assert.equal(authority.contexts[0].actorId, "defender");
  assert.equal(authority.contexts[0].targetId, "attacker");

  for (const override of [
    {eventType: "pet_skill"},
    {hpAfter: 0, target: {...defender, hp: 0}},
    {target: {...defender, statuses: {stone: {turns: 1}}}},
    {eventType: "counter_attack", isCounter: true},
  ]) {
    const blockedAuthority = fixedAuthority({"counter.v1": 0});
    assert.equal(resolveCounterTrigger({...input, ...override, randomAuthority: blockedAuthority}), false);
    assert.equal(blockedAuthority.contexts.length, 0);
  }
});
