"use strict";

const {assert, test} = require("../test-support/auth-service-test-context");
const {
  buildBattleCombatFormula,
  comboDamageFor,
  loadBattleCombatFormula,
  resolvePhysicalDamage,
} = require("../src/auth/battle-combat-formula");
const formulaDocument = require("../../../client/godot/data/balance/combat_formulas.json");

const formula = loadBattleCombatFormula();

function damage(attack, defense, options = {}) {
  return resolvePhysicalDamage({
    formula,
    actor: {attack, level: 20},
    target: {defense, level: 20, ...(options.target || {})},
    eventType: options.eventType || "attack",
    amountBonus: Object.prototype.hasOwnProperty.call(options, "amountBonus") ? options.amountBonus : 0,
    actionPowerMultiplier: Object.prototype.hasOwnProperty.call(options, "actionPowerMultiplier") ? options.actionPowerMultiplier : 1,
  });
}

test("combat_v1 consumes attack and defense with explicit floor and guard order", () => {
  assert.equal(formula.id, "combat_v1");
  assert.equal(damage(18, 20).damage, 11);
  assert.equal(damage(24, 20).damage, 17);
  assert.equal(damage(25, 20).damage, 18);
  assert.equal(damage(25, 20, {target: {guarding: true}}).damage, 8);
  assert.equal(damage(1, 9999).damage, 1);
  assert.ok(damage(999, 20).damage > damage(25, 20).damage);
  assert.ok(damage(25, 999).damage < damage(25, 20).damage);
});

test("stone, pet skill, and multi attack reuse the same defense-aware inputs", () => {
  const stone = damage(25, 20, {target: {statuses: {stone: {turns: 2}}}});
  assert.equal(stone.damage, 11);
  assert.equal(stone.stoneDefenseApplied, true);
  assert.equal(stone.stoneDefenseExtraReduction, 7);
  assert.equal(damage(30, 20, {eventType: "pet_skill", amountBonus: 12}).damage, 37);
  assert.equal(damage(50, 20, {eventType: "multi_attack", actionPowerMultiplier: 0.65}).damage, 28);
  assert.equal(damage(50, 20, {eventType: "multi_attack", actionPowerMultiplier: 0}).damage, 1);
});

test("combo damage uses per-participant physical results and the active flat bonus", () => {
  const result = comboDamageFor(formula, [11, 17]);
  assert.deepEqual(result, {
    damage: 36,
    baseDamage: 28,
    comboBonus: 8,
    participantCount: 2,
    formulaId: "combat_v1",
  });
});

test("authoritative formula loading fails closed on malformed used fields", () => {
  const malformed = structuredClone(formulaDocument);
  const active = malformed.formulas.find((entry) => entry.id === malformed.activeFormulaId);
  delete active.combo.bonusPerExtraParticipant;
  assert.throws(() => buildBattleCombatFormula(malformed), /combo\.bonusPerExtraParticipant/);
});
