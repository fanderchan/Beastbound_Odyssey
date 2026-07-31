"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const formulaDocument = require("../../../client/godot/data/balance/combat_formulas.json");
const {loadBattleCombatFormula} = require("../src/auth/battle-combat-formula");
const {
  BattleElementRulesError,
  buildBattleElementMatchup,
  inspectElementAllocation,
  inspectPlayerElementAllocation,
  loadBattleElementMatchup,
  materializePlayerActorElements,
  playerBattleElementAdmission,
  resolveBattleElementMatchup,
  resolveElementalPhysicalDamage,
} = require("../src/auth/battle-element-rules");

const formula = loadBattleCombatFormula();
const matchup = loadBattleElementMatchup();

function elements(earth, water, fire, wind) {
  return {earth, water, fire, wind};
}

test("element matchup reuses the active combat document cycle and multipliers", () => {
  assert.deepEqual(matchup.cycle, [
    {strong: "earth", weak: "water"},
    {strong: "water", weak: "fire"},
    {strong: "fire", weak: "wind"},
    {strong: "wind", weak: "earth"},
  ]);
  assert.equal(matchup.strongMultiplier, 1.35);
  assert.equal(matchup.weakMultiplier, 0.75);
  assert.equal(matchup.neutralMultiplier, 1);
});

test("pure and mixed element matchups use ten-point pairwise weighting", () => {
  const strong = resolveBattleElementMatchup({
    matchup,
    attackerElements: elements(10, 0, 0, 0),
    targetElements: elements(0, 10, 0, 0),
  });
  assert.equal(strong.multiplier, 1.35);
  assert.equal(strong.strongWeight, 1);

  const weak = resolveBattleElementMatchup({
    matchup,
    attackerElements: elements(0, 10, 0, 0),
    targetElements: elements(10, 0, 0, 0),
  });
  assert.equal(weak.multiplier, 0.75);
  assert.equal(weak.weakWeight, 1);

  const mixed = resolveBattleElementMatchup({
    matchup,
    attackerElements: elements(5, 5, 0, 0),
    targetElements: elements(0, 5, 5, 0),
  });
  assert.equal(mixed.multiplier, 1.175);
  assert.equal(mixed.strongWeight, 0.5);
  assert.equal(mixed.neutralWeight, 0.5);
  assert.equal(mixed.weakWeight, 0);
});

test("pet-compatible four-element allocations remain valid for weighted combat", () => {
  const inspected = inspectElementAllocation(elements(3, 2, 2, 3));
  assert.equal(inspected.ok, true);
  assert.deepEqual(inspected.activeElementIds, ["earth", "water", "fire", "wind"]);
  const resolved = resolveBattleElementMatchup({
    matchup,
    attackerElements: inspected.elements,
    targetElements: elements(0, 0, 10, 0),
  });
  assert.ok(resolved.multiplier > 0);
  assert.equal(resolved.strongWeight + resolved.weakWeight + resolved.neutralWeight, 1);
});

test("player allocations require ten integer points, at most two elements, and compatible pairs", () => {
  for (const valid of [
    elements(10, 0, 0, 0),
    elements(5, 5, 0, 0),
    elements(5, 0, 0, 5),
    elements(0, 5, 5, 0),
    elements(0, 0, 5, 5),
  ]) {
    assert.equal(inspectPlayerElementAllocation(valid).ok, true);
  }

  assert.equal(inspectPlayerElementAllocation(elements(9, 0, 0, 0)).reason, "total_invalid");
  assert.equal(inspectPlayerElementAllocation(elements(9.5, 0.5, 0, 0)).reason, "points_invalid");
  assert.equal(inspectPlayerElementAllocation({earth: "10", water: 0, fire: 0, wind: 0}).reason, "points_invalid");
  assert.equal(inspectPlayerElementAllocation(elements(4, 3, 3, 0)).reason, "too_many_active_elements");
  assert.equal(inspectPlayerElementAllocation(elements(5, 0, 5, 0)).reason, "forbidden_pair");
  assert.equal(inspectPlayerElementAllocation(elements(0, 5, 0, 5)).reason, "forbidden_pair");
  assert.equal(inspectPlayerElementAllocation({...elements(10, 0, 0, 0), lightning: 1}).reason, "unknown_keys");
});

test("legacy players without allocation fail closed at authoritative battle admission", () => {
  assert.deepEqual(playerBattleElementAdmission({player: {name: "旧角色"}}), {
    ok: false,
    code: "player_elements_required",
    message: "请先完成角色元素配点，再进入战斗。",
    schemaVersion: 1,
  });
  const invalid = playerBattleElementAdmission({player: {elements: elements(5, 0, 5, 0)}});
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "player_elements_invalid");
  assert.equal(invalid.reason, "forbidden_pair");
});

test("player actor elements always derive from the authoritative profile", () => {
  const actor = {actorId: "player", kind: "player", elements: elements(0, 0, 10, 0)};
  const profile = {player: {elements: elements(6, 4, 0, 0)}};
  const materialized = materializePlayerActorElements(actor, profile);
  assert.equal(materialized.ok, true);
  assert.deepEqual(materialized.actor.elements, elements(6, 4, 0, 0));
  assert.deepEqual(actor.elements, elements(0, 0, 10, 0));
  assert.deepEqual(profile.player.elements, elements(6, 4, 0, 0));

  const blocked = materializePlayerActorElements(actor, {player: {name: "未配点"}});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "player_elements_required");
  assert.equal(blocked.actor, null);
});

test("elemental physical damage applies the weighted modifier after base defense resolution", () => {
  const baseOptions = {
    formula,
    elementMatchup: matchup,
    actor: {attack: 25, level: 20, elements: elements(10, 0, 0, 0)},
    target: {defense: 20, level: 20, elements: elements(0, 10, 0, 0)},
    eventType: "attack",
  };
  const strong = resolveElementalPhysicalDamage(baseOptions);
  assert.equal(strong.damageBeforeElement, 18);
  assert.equal(strong.elementMultiplier, 1.35);
  assert.equal(strong.damage, 24);
  assert.equal(strong.elementDamageDelta, 6);

  const weak = resolveElementalPhysicalDamage({
    ...baseOptions,
    actor: {...baseOptions.actor, elements: elements(0, 10, 0, 0)},
    target: {...baseOptions.target, elements: elements(10, 0, 0, 0)},
  });
  assert.equal(weak.damageBeforeElement, 18);
  assert.equal(weak.elementMultiplier, 0.75);
  assert.equal(weak.damage, 14);
});

test("malformed matchup and missing actor elements fail closed", () => {
  const malformed = structuredClone(formulaDocument);
  malformed.elementMatchup.strongMultiplier = 0;
  assert.throws(
    () => buildBattleElementMatchup(malformed),
    (error) => error instanceof BattleElementRulesError && error.code === "battle_element_matchup_invalid",
  );
  assert.throws(
    () => resolveElementalPhysicalDamage({
      formula,
      elementMatchup: matchup,
      actor: {attack: 25, level: 20},
      target: {defense: 20, level: 20, elements: elements(0, 10, 0, 0)},
    }),
    (error) => error instanceof BattleElementRulesError && error.code === "battle_element_allocation_invalid",
  );
});
