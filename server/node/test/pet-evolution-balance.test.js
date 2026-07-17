"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PetEvolutionBalanceError,
  createPetEvolutionBalance,
  loadPetEvolutionBalance,
  petEvolutionEffortSummary,
} = require("../src/auth/pet-evolution-balance");

test("evolution balance locks a harder quest-unlocked floor-material terminal path", () => {
  const balance = loadPetEvolutionBalance();
  const effort = petEvolutionEffortSummary(balance);
  assert.equal(balance.balanceVersion, "pet_evolution_balance_v1");
  assert.equal(balance.eligibility.requiredRebirthCount, 1);
  assert.equal(balance.eligibility.requiredLevel, 140);
  assert.equal(balance.eligibility.licenseDirectResult, false);
  assert.equal(balance.acquisition.requiresTeamPve, true);
  assert.equal(balance.terminalPath.normalSecondRebirthAllowed, false);
  assert.equal(balance.terminalPath.fusionMaterialAllowed, false);
  assert.equal(balance.terminalPath.successRate, 1);
  assert.equal(balance.qualityProjection.rerollAllowed, false);
  assert.equal(effort.repeatableRatio, 1.5);
  assert.equal(effort.firstEvolutionRatio, 1.7);
  assert.equal(Object.isFrozen(balance), true);
  assert.equal(Object.isFrozen(balance.powerBudget.intrinsicUpliftInternalPower), true);
});

test("evolution intrinsic uplift is the normal second-rebirth stage power band", () => {
  const balance = loadPetEvolutionBalance();
  assert.deepEqual(balance.powerBudget.intrinsicUpliftInternalPower, {
    min: 1.485028,
    p25: 1.622514,
    p55: 1.787497,
    p85: 1.952481,
    p95: 2.007475,
    max: 2.034973,
  });
  assert.equal(balance.powerBudget.preserveStageOneRebirthBonus, true);
  assert.equal(balance.powerBudget.rawStatInflationBeyondBandAllowed, false);
});

test("quest may unlock evolution but cannot directly grant its result", () => {
  const source = structuredClone(loadPetEvolutionBalance());
  source.eligibility.licenseDirectResult = true;
  assert.throws(
    () => createPetEvolutionBalance(source),
    (error) => error instanceof PetEvolutionBalanceError
      && error.code === "pet_evolution_balance_invalid"
      && error.errors.some((entry) => entry.includes("licenseDirectResult")),
  );
});

test("repeatable evolution may not become easier than the approved 1.5x floor", () => {
  const source = structuredClone(loadPetEvolutionBalance());
  source.effortModel.evolutionRepeatable.floorBossCore = 59;
  source.effortModel.evolutionRepeatable.total = 149;
  assert.throws(
    () => createPetEvolutionBalance(source),
    (error) => error instanceof PetEvolutionBalanceError
      && error.errors.some((entry) => entry.includes("target ratio")),
  );
});

test("evolution cannot stack ordinary second rebirth or raw-stat inflation", () => {
  const source = structuredClone(loadPetEvolutionBalance());
  source.terminalPath.normalSecondRebirthAllowed = true;
  source.powerBudget.rawStatInflationBeyondBandAllowed = true;
  assert.throws(
    () => createPetEvolutionBalance(source),
    (error) => error instanceof PetEvolutionBalanceError
      && error.errors.some((entry) => entry.includes("second rebirth"))
      && error.errors.some((entry) => entry.includes("raw-stat inflation")),
  );
});

test("evolution contract cannot reroll or migrate existing pets", () => {
  const source = structuredClone(loadPetEvolutionBalance());
  source.qualityProjection.rerollAllowed = true;
  source.compatibility.existingPets = "rewrite";
  assert.throws(
    () => createPetEvolutionBalance(source),
    (error) => error instanceof PetEvolutionBalanceError
      && error.errors.some((entry) => entry.includes("rerolls"))
      && error.errors.some((entry) => entry.includes("existing pets")),
  );
});
