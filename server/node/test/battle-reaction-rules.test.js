"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  counterCanTrigger,
  counterDamageFor,
  counterRateFor,
  criticalRateFor,
  dodgeRateFor,
  luckyStrikeDamageFor,
  reactionPolicyFor,
  rollSucceeds,
  targetCanDodge,
} = require("../src/auth/battle-reaction-rules");

function actor(quick, overrides = {}) {
  return {hp: 100, level: 10, defense: 20, quick, ...overrides};
}

test("legacy quick contest rates preserve the current live client curve", () => {
  assert.equal(dodgeRateFor(actor(50), actor(50)), 0.0001);
  assert.equal(criticalRateFor(actor(50), actor(50)), 0);
  assert.equal(counterRateFor(actor(50), actor(50)), 0);
  assert.ok(Math.abs(dodgeRateFor(actor(50), actor(51)) - 0.07071067811865475) < 1e-12);
  assert.ok(Math.abs(criticalRateFor(actor(51), actor(50)) - 0.03333333333333333) < 1e-12);
  assert.ok(Math.abs(counterRateFor(actor(100), actor(50)) - 0.25) < 1e-12);
  assert.equal(dodgeRateFor(actor(50), actor(200)), 0.75);
});

test("luck, bonuses and overrides keep their percentage-point semantics", () => {
  const equal = actor(50, {luck: 5});
  assert.equal(dodgeRateFor(actor(50), equal), 0.05);
  assert.equal(criticalRateFor(equal, actor(50)), 0.05);
  assert.equal(counterRateFor(equal, actor(50)), 0.05);
  assert.equal(dodgeRateFor(actor(50), actor(50, {dodgeRateOverride: 2})), 1);
  assert.equal(dodgeRateFor(actor(50), actor(50, {dodgeRateOverride: 0, evasionRateOverride: 1})), 0);
  assert.equal(criticalRateFor(actor(50, {criticalRateOverride: -1}), actor(50)), 0);
  assert.equal(counterRateFor(actor(50, {counterRateOverride: 1}), actor(50)), 1);
});

test("lucky strike and counter damage match the current legacy rounding order", () => {
  assert.equal(luckyStrikeDamageFor(6, actor(50, {level: 10}), actor(50, {level: 10, defense: 34})), 23);
  assert.equal(luckyStrikeDamageFor(6, actor(50), actor(50, {defense: 0})), 7);
  assert.equal(luckyStrikeDamageFor(10, actor(50, {level: 20}), actor(50, {level: 10, defense: 9})), 19);
  assert.equal(counterDamageFor(7), 5);
  assert.equal(counterDamageFor(1), 1);
});

test("reaction policy keeps basic, skill, combo and one-level counter behavior distinct", () => {
  assert.deepEqual(reactionPolicyFor("basic_attack"), {canDodge: true, canCritical: true, canCounter: true});
  assert.deepEqual(reactionPolicyFor("pet_skill"), {canDodge: true, canCritical: true, canCounter: false});
  assert.deepEqual(reactionPolicyFor("counter_attack"), {canDodge: true, canCritical: true, canCounter: false});
  assert.deepEqual(reactionPolicyFor("combo_attack"), {canDodge: false, canCritical: false, canCounter: false});
  assert.deepEqual(
    reactionPolicyFor("basic_attack", {canDodge: false, canCritical: false, canCounter: false}),
    {canDodge: false, canCritical: false, canCounter: false},
  );
});

test("guard and blocking statuses suppress dodge while counter keeps its exact legacy gates", () => {
  const attacker = actor(50);
  assert.equal(targetCanDodge(actor(50)), true);
  assert.equal(targetCanDodge(actor(50, {guarding: true})), false);
  assert.equal(targetCanDodge(actor(50, {statuses: {sleep: {turns: 1}}})), false);

  const target = actor(50, {hp: 50});
  assert.equal(counterCanTrigger({eventType: "basic_attack", attacker, target, hpBefore: 50, hpAfter: 50}), true);
  // 当前客户端明确允许闪避后的普通攻击继续触发反击，所以 0 伤害本身不是阻断条件。
  assert.equal(counterCanTrigger({eventType: "basic_attack", attacker, target, hpBefore: 50, hpAfter: 50}), true);
  assert.equal(counterCanTrigger({eventType: "basic_attack", attacker, target, hpBefore: 50, hpAfter: 0}), false);
  assert.equal(counterCanTrigger({eventType: "pet_skill", attacker, target, hpBefore: 50, hpAfter: 40}), false);
  assert.equal(counterCanTrigger({eventType: "basic_attack", isCounter: true, attacker, target, hpBefore: 50, hpAfter: 40}), false);
  assert.equal(counterCanTrigger({
    eventType: "basic_attack",
    attacker,
    target: actor(50, {statuses: {stone: {turns: 1}}}),
    hpBefore: 50,
    hpAfter: 40,
  }), false);
});

test("roll equality does not count as success", () => {
  assert.equal(rollSucceeds(0.4999, 0.5), true);
  assert.equal(rollSucceeds(0.5, 0.5), false);
  assert.equal(rollSucceeds(0.9999, 1), true);
});
