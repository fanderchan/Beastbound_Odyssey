"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  activeRideFacts,
  resolveRideDamageShare,
  resolveRidingBattleStats,
} = require("../src/auth/battle-riding-rules");

function ridingActor(hp = 100, overrides = {}) {
  return {
    ridePetInstanceId: "ride_pet_1",
    ridePetHp: hp,
    ridePetMaxHp: 100,
    ridePetBattleState: "riding",
    ...overrides,
  };
}

test("ride damage uses odd-to-mount rounding and always conserves final damage", () => {
  const vectors = [
    {damage: 0, actor: 0, ride: 0},
    {damage: 1, actor: 0, ride: 1},
    {damage: 2, actor: 1, ride: 1},
    {damage: 3, actor: 1, ride: 2},
    {damage: 21, actor: 10, ride: 11},
  ];
  for (const vector of vectors) {
    const result = resolveRideDamageShare(ridingActor(), vector.damage);
    assert.equal(result.actorDamage, vector.actor);
    assert.equal(result.rideDamage, vector.ride);
    assert.equal(result.actorDamage + result.rideDamage, vector.damage);
  }
  const zero = resolveRideDamageShare(ridingActor(), 0);
  assert.equal(zero.rideActiveBefore, true);
  assert.equal(zero.rideActiveAfter, true);
});

test("an exhausted mount absorbs only its remaining hp without double-counting overflow", () => {
  const fiveHp = resolveRideDamageShare(ridingActor(5), 21);
  assert.equal(fiveHp.actorDamage, 16);
  assert.equal(fiveHp.rideDamage, 5);
  assert.equal(fiveHp.rideHpAfter, 0);
  assert.equal(fiveHp.ridePetKnocked, true);
  assert.equal(fiveHp.ridePetBattleStateAfter, "rest");
  assert.equal(fiveHp.actorDamage + fiveHp.rideDamage, 21);

  const regression = resolveRideDamageShare(ridingActor(1), 40);
  assert.equal(regression.actorDamage, 39);
  assert.equal(regression.rideDamage, 1);
  assert.equal(regression.actorDamage + regression.rideDamage, 40);
});

test("a missing, resting or already knocked mount cannot absorb later damage", () => {
  for (const actor of [
    {},
    ridingActor(0),
    ridingActor(50, {ridePetBattleState: "rest"}),
    ridingActor(50, {ridePetKnocked: true}),
  ]) {
    const result = resolveRideDamageShare(actor, 9);
    assert.equal(result.actorDamage, 9);
    assert.equal(result.rideDamage, 0);
    assert.equal(result.rideActiveAfter, false);
  }
  assert.equal(activeRideFacts(ridingActor(50)).active, true);
  const alreadyDown = resolveRideDamageShare(ridingActor(0), 9);
  assert.equal(alreadyDown.ridePetKnocked, true);
  assert.equal(alreadyDown.ridePetBattleStateAfter, "rest");
});

test("riding battle stats preserve the established melee and ranged formulas", () => {
  const base = {attack: 100, defense: 80, quick: 60};
  const ride = {attack: 80, defense: 40, agility: 100};
  assert.deepEqual(resolveRidingBattleStats(base, ride, "melee"), {
    attack: 144,
    defense: 84,
    quick: 92,
    speed: 92,
    baseAttack: 100,
    baseDefense: 80,
    baseQuick: 60,
    attackStyle: "melee",
    formulaId: "stoneage_like_ride_v1",
  });
  assert.deepEqual(resolveRidingBattleStats(base, ride, "ranged"), {
    attack: 132,
    defense: 84,
    quick: 68,
    speed: 68,
    baseAttack: 100,
    baseDefense: 80,
    baseQuick: 60,
    attackStyle: "ranged",
    formulaId: "stoneage_like_ride_v1",
  });
});
