"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PetRebirthBalanceError,
  createPetRebirthBalance,
  loadPetRebirthBalance,
  petRebirthEffectiveStoneCount,
  petRebirthEvaluateGrowthBonus,
  petRebirthPoolInfo,
  petRebirthPoolRange,
  petRebirthTargetPreparation,
} = require("../src/auth/pet-rebirth-balance");

const FULL_STONES = Object.freeze({maxHp: 50, attack: 50, defense: 50, quick: 50});

function closeTo(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test("pet rebirth balance loads one strict future-only shared contract", () => {
  const balance = loadPetRebirthBalance();
  assert.equal(balance.schemaVersion, 1);
  assert.equal(balance.balanceVersion, "pet_rebirth_balance_v3");
  assert.equal(balance.evaluation.evaluationVersion, "pet_rebirth_evaluation_v1");
  assert.equal(balance.evaluation.reference.profileSelector, "all_rebirth_eligible_non_mm_growth_profiles");
  assert.equal(balance.evaluation.reference.profileCount, 30);
  assert.equal(Object.isFrozen(balance), true);
  assert.equal(Object.isFrozen(balance.poolRangesByStage[1]), true);
  assert.deepEqual(balance.compatibility, {
    applyTo: "future_confirmed_rebirths_only",
    existingPets: "unchanged",
    existingHistory: "unchanged",
  });
});

test("rebirth evaluation separates a near-median stage result from terminal two-stage quality", () => {
  const balance = loadPetRebirthBalance();
  const stageOneBonus = {maxHp: 1.6, attack: 0.4, defense: 0.35, quick: 0.39};
  const stageTwoBonus = {maxHp: 1.8, attack: 0.46, defense: 0.4, quick: 0.45};
  const terminalBonus = Object.fromEntries(Object.keys(stageOneBonus).map((key) => [
    key,
    stageOneBonus[key] + stageTwoBonus[key],
  ]));

  const stageOne = petRebirthEvaluateGrowthBonus(balance, {
    visibleGrowthBonus: stageOneBonus,
    stage: 1,
  });
  const terminal = petRebirthEvaluateGrowthBonus(balance, {
    visibleGrowthBonus: terminalBonus,
    stage: 2,
    terminal: true,
  });

  closeTo(stageOne.powerGrowth, 1.54);
  closeTo(stageOne.powerPercentile, 50, 0.1);
  assert.equal(stageOne.overallGrade, "C");
  closeTo(terminal.powerGrowth, 3.3);
  closeTo(terminal.powerPercentile, 50, 1);
  assert.equal(terminal.overallGrade, "C");
  assert.equal(terminal.referenceLabel, "Lv140四满石全物种基准");
});

test("Lv80 keeps the previous MM pool while Lv140 adds only ten percent", () => {
  const balance = loadPetRebirthBalance();
  closeTo(petRebirthEffectiveStoneCount(balance, FULL_STONES), 4);
  assert.deepEqual(petRebirthPoolRange(balance, 4, 1), {min: 1.15, max: 1.65});
  assert.deepEqual(petRebirthPoolRange(balance, 4, 2), {min: 1.35, max: 1.85});

  const level80Stage1 = petRebirthPoolInfo(balance, {
    stonePoints: FULL_STONES,
    stage: 1,
    targetLevel: 80,
    percentile: 50,
  });
  closeTo(level80Stage1.basePool, 1.4);
  closeTo(level80Stage1.pool, 1.4);
  closeTo(level80Stage1.targetPreparationMultiplier, 1);

  const level110 = petRebirthTargetPreparation(balance, 110);
  closeTo(level110.ratio, 0.5);
  closeTo(level110.multiplier, 1.05);

  const level140Stage1 = petRebirthPoolInfo(balance, {
    stonePoints: FULL_STONES,
    stage: 1,
    targetLevel: 140,
    percentile: 50,
  });
  const level140Stage2 = petRebirthPoolInfo(balance, {
    stonePoints: FULL_STONES,
    stage: 2,
    targetLevel: 140,
    percentile: 50,
  });
  closeTo(level140Stage1.pool, 1.54);
  closeTo(level140Stage2.pool, 1.76);
  closeTo(level140Stage1.targetPreparationMultiplier, 1.1);
  closeTo(level140Stage1.pool + level140Stage2.pool, 3.3);
});

test("target preparation scales MM investment instead of granting a free fixed bonus", () => {
  const balance = loadPetRebirthBalance();
  const emptyLevel80 = petRebirthPoolInfo(balance, {
    stonePoints: {},
    stage: 1,
    targetLevel: 80,
    percentile: 50,
  });
  const emptyLevel140 = petRebirthPoolInfo(balance, {
    stonePoints: {},
    stage: 1,
    targetLevel: 140,
    percentile: 50,
  });
  closeTo(emptyLevel80.pool, 0.05);
  closeTo(emptyLevel140.pool, 0.055);
  assert.ok(emptyLevel140.pool < 0.1);
});

test("pet rebirth balance rejects a contract that can rewrite existing results", () => {
  const source = structuredClone(loadPetRebirthBalance());
  source.compatibility.existingHistory = "reroll";
  assert.throws(
    () => createPetRebirthBalance(source),
    (error) => error instanceof PetRebirthBalanceError && error.code === "pet_rebirth_balance_invalid",
  );
});

test("pet rebirth balance rejects unordered evaluation thresholds", () => {
  const source = structuredClone(loadPetRebirthBalance());
  source.evaluation.stageThresholds["1"].power.p55 = 0.5;
  assert.throws(
    () => createPetRebirthBalance(source),
    (error) => error instanceof PetRebirthBalanceError && error.code === "pet_rebirth_balance_invalid",
  );
});
